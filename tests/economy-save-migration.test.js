import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { saveGame, loadGame, getLastLoadResult, enqueueSaveGame } from '../src/engine/saveload';
import { economyFixture, renewalEnvelope } from '../src/engine/__tests__/fixtures/economyWorld';
import { reduceEconomyCommand, toAnnualState, createAnnualNewGameWorld } from '../src/engine/contractEconomy';
import { prepareRootBody } from '../src/engine/saveRootBodies';
import { prepareEconomyMigration } from '../src/engine/economyMigration';
import { economyPolicy } from '../src/engine/__tests__/fixtures/economyWorld';
import { fromAnnualState } from '../src/engine/contractEconomy';
import { applyContractLedgerAction, closeContractLedgerThrough } from '../src/engine/contractLedger';
import { createSeasonContract } from '../src/engine/seasonContract';
import { validateEconomySave } from '../src/engine/economyPersistence';
import { quoteAnnualBudgetPolicy } from '../src/engine/annualBudgetPolicy';

const primary = 'baseball_manager_v1', bk1 = primary + '_bk1', bk2 = primary + '_bk2';
let rows;
const save = (state, options = {}) => saveGame(state, { skipCompression: true, ...options });
const legacy = () => { const world = economyFixture(); delete world.contractEconomy; return world; };
const roots = () => [primary, bk1, bk2].map(k => rows.get(k));
const freshStorageSurface = () => vi.stubGlobal('localStorage', {
  getItem: k => rows.get(k) ?? null, setItem: (k, v) => rows.set(k, String(v)), removeItem: k => rows.delete(k),
});
beforeEach(() => {
  rows = new Map(); freshStorageSurface(); vi.stubGlobal('indexedDB', new IDBFactory());
  for (const level of ['log', 'warn', 'error', 'table']) vi.spyOn(console, level).mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each([false, true])('reload/resave/accept preserves the complete economic world, large root=%s', async large => {
  const world = economyFixture(), command = renewalEnvelope(world);
  const offered = reduceEconomyCommand(world, command).world;
  offered.mailbox = [{ id: 'pending', type: 'contract_decision_pending', read: false }];
  offered.contractEconomy.legacyEvidence.clauses = [{ raw: { unknown: null, zero: 0 } }];
  if (large) offered.padding = 'large'.repeat(20000);
  const original = structuredClone(offered);
  expect((await save(offered)).ok).toBe(true);
  expect(offered).toEqual(original);
  expect(JSON.parse(rows.get(primary)).rootBodyVersion === 1).toBe(large);
  freshStorageSurface(); // Cold cache, same persisted data.
  const loaded = await loadGame();
  expect(loaded.contractEconomy).toEqual(offered.contractEconomy);
  expect(loaded.mailbox).toEqual(offered.mailbox);
  expect(loaded.teams[0].players[0].contractSignedYear).toBe(offered.teams[0].players[0].contractSignedYear);
  expect((await save(loaded)).ok).toBe(true);
  const accepted = reduceEconomyCommand(loaded, { ...command, baseRevision: 1,
    transaction: { id: 'accept', type: 'accept-renewal', proposalId: 'renewal', contractId: command.transaction.contractId } });
  expect(accepted.ok, accepted.error).toBe(true);
  expect((await saveGame(accepted.world)).ok).toBe(true); // Compressed round-trip too.
  const restored = await loadGame();
  expect(restored.contractEconomy).toEqual(accepted.world.contractEconomy);
  expect(restored.contractEconomy.revision).toBe(2);
  expect(() => toAnnualState(restored)).not.toThrow();
});

const invalid = [
  ['engine', w => { delete w.contractEconomy.engine; }],
  ['schema', w => { w.contractEconomy.schemaVersion = 999; }],
  ['mode', w => { w.contractEconomy.mode = 'unknown'; }],
  ['mixed legacy', w => { w.contractEconomy.mode = 'legacy'; }],
  ['zero-default trap', w => { delete w.contractEconomy.engine.spending.authorizations[0].approvedManYen; }],
  ['roster', w => { w.teams[0].players = []; }],
  ['mailbox', w => { delete w.mailbox; }],
  ['calendar', w => { w.year++; }],
  ['save identity', w => { w.saveId = ' test-save '; }],
];
it.each(invalid)('rejects incomplete/unsupported annual %s before touching committed roots', async (_, mutate) => {
  await save(legacy()); const before = roots();
  const broken = economyFixture(); mutate(broken); const original = structuredClone(broken);
  expect((await save(broken)).ok).toBe(false);
  expect(roots()).toEqual(before); expect(broken).toEqual(original);
});

it.each([false, true])('rejects annual downgrade and epoch/revision regression (cold=%s)', async cold => {
  const world = reduceEconomyCommand(economyFixture(), renewalEnvelope(economyFixture())).world;
  await save(world); const before = roots(); if (cold) freshStorageSurface();
  const changedEpoch = structuredClone(world); changedEpoch.contractEconomy.epoch = 'other';
  for (const [candidate, reason] of [[legacy(), 'economy_payload_missing'], [changedEpoch, 'economy_epoch_conflict'],
    [economyFixture(), 'economy_revision_conflict']]) {
    expect(await save(candidate)).toMatchObject({ ok: false, reason });
    expect(roots()).toEqual(before);
  }
});

it('rejects changed economic terms at the same revision but permits an identical resave', async () => {
  const world = economyFixture(); await save(world);
  const modified = structuredClone(world); modified.contractEconomy.randomRoot.seed = 'changed';
  expect(await save(modified)).toMatchObject({ ok: false, reason: 'economy_revision_conflict' });
  expect((await save(world)).ok).toBe(true);
});

it('persists annual mailbox/news even when dirty scopes omit them', async () => {
  const world = economyFixture(); await save(world);
  const offered = reduceEconomyCommand(world, renewalEnvelope(world)).world;
  offered.news = [{ id: 'news', type: 'season', headline: '提示' }];
  offered.mailbox = [{ id: 'mail', type: 'contract_decision_pending' }];
  expect((await enqueueSaveGame(offered, { dirtyScopes: [] })).ok).toBe(true);
  const loaded = await loadGame();
  expect(loaded.news).toEqual(offered.news); expect(loaded.mailbox).toEqual(offered.mailbox);
  expect(loaded.contractEconomy).toEqual(offered.contractEconomy);
});

it('failed publication preserves world, primary and both backups', async () => {
  const world = economyFixture(); await save(world); await save(world);
  rows.set(bk2, rows.get(bk1)); const before = roots();
  const offered = reduceEconomyCommand(world, renewalEnvelope(world)).world, original = structuredClone(offered);
  const set = localStorage.setItem;
  vi.spyOn(localStorage, 'setItem').mockImplementation((k, v) => {
    if (k === primary) throw new DOMException('full', 'QuotaExceededError'); set(k, v);
  });
  expect(await save(offered)).toMatchObject({ ok: false, quota: true });
  expect(roots()).toEqual(before); expect(offered).toEqual(original);
  expect((await loadGame()).contractEconomy.revision).toBe(0);
});

it.each(['legacy', 'other epoch', 'other save', 'unknown schema'])('does not recover a recognized annual primary through %s', async mismatch => {
  const world = economyFixture(), backup = structuredClone(world);
  if (mismatch === 'legacy') delete backup.contractEconomy;
  if (mismatch === 'other epoch') backup.contractEconomy.epoch = 'other';
  if (mismatch === 'other save') backup.saveId = 'other';
  if (mismatch === 'unknown schema') world.contractEconomy.schemaVersion = 999;
  else delete world.contractEconomy.engine;
  rows.set(primary, JSON.stringify(world)); rows.set(bk1, JSON.stringify(backup));
  const before = roots();
  expect(await loadGame()).toBeNull();
  expect(getLastLoadResult().status).toBe('unrecoverable'); expect(roots()).toEqual(before);
});

it('recovers a complete same-epoch annual backup without applying legacy contract defaults', async () => {
  const world = economyFixture(), broken = structuredClone(world); delete broken.contractEconomy.engine;
  rows.set(primary, JSON.stringify(broken)); rows.set(bk1, JSON.stringify(world));
  const loaded = await loadGame();
  expect(getLastLoadResult().status).toBe('recovered');
  expect(loaded.contractEconomy).toEqual(world.contractEconomy);
  expect(loaded.teams).toEqual(world.teams.map(t => ({ ...t, players: t.players.map(p => ({
    ...p, careerLog: [], recentCareerLog: [], careerLogSummary: expect.any(Object), trimmedCareerLogSummary: expect.any(Object),
  })) })));
});

it('validates a referenced annual root after hydration and preserves it on failure', async () => {
  const world = economyFixture(); world.padding = 'x'.repeat(50000); delete world.contractEconomy.staffContracts;
  rows.set(primary, await prepareRootBody(JSON.stringify(world))); rows.set(bk1, JSON.stringify(legacy()));
  const before = roots(); expect(await loadGame()).toBeNull(); expect(roots()).toEqual(before);
});

it('rejects a null declared envelope instead of recovering a legacy backup', async () => {
  rows.set(primary, JSON.stringify({ ...legacy(), contractEconomy: null }));
  rows.set(bk1, JSON.stringify(legacy()));
  expect(await loadGame()).toBeNull(); expect(getLastLoadResult().status).toBe('unrecoverable');
});

it('does not skip an unsupported first backup when primary is missing', async () => {
  const unsupported = economyFixture(); unsupported.contractEconomy.schemaVersion = 999;
  rows.set(bk1, JSON.stringify(unsupported)); rows.set(bk2, JSON.stringify(legacy()));
  expect(await loadGame()).toBeNull(); expect(getLastLoadResult().status).toBe('unrecoverable');
});

it.each(['downgrade', 'epoch', 'revision', 'terms'])('retains independent observations when an inline loaded world is mutated in place: %s', async kind => {
  const world = reduceEconomyCommand(economyFixture(), renewalEnvelope(economyFixture())).world;
  rows.set(primary, JSON.stringify(world)); const loaded = await loadGame(), before = roots();
  if (kind === 'downgrade') delete loaded.contractEconomy;
  if (kind === 'epoch') loaded.contractEconomy.epoch = 'changed';
  if (kind === 'revision') loaded.contractEconomy.revision = 0;
  if (kind === 'terms') loaded.contractEconomy.randomRoot.seed = 'changed';
  expect((await save(loaded)).ok).toBe(false); expect(roots()).toEqual(before);
});

it.each(['salary', 'budget', 'contractId', 'contractYearsLeft', 'contractYears', 'contractSignedYear', '育成', 'missing salary'])
('refuses a world whose %s display projection contradicts the authoritative ledger', async field => {
  const world = economyFixture(), player = world.teams[0].players[0];
  if (field === 'budget') world.teams[0].budget = 999999;
  else if (field === 'missing salary') delete player.salary;
  else player[field] = field === '育成' ? true : field === 'contractId' ? 'wrong' : 999999;
  const before = structuredClone(world);
  expect((await save(world)).ok).toBe(false); expect(world).toEqual(before);
  rows.set(primary, JSON.stringify(world));
  expect(await loadGame()).toBeNull();
});

it('requires the later activation transaction for same-save legacy to annual conversion', async () => {
  await save(legacy()); const before = roots();
  expect(await save(economyFixture())).toMatchObject({ ok: false, reason: 'economy_activation_required' });
  expect(roots()).toEqual(before);
});

it('retains an observed opening and unknown guarantee without inventing signature fields', async () => {
  const base = economyFixture();
  const old = { ...legacy(), phase: 'season', teams: Array.from({ length: 12 }, (_, id) => ({ id, budget: 0, farm: [],
    players: id === 0 ? [{ id: 0, name: '観測', salary: 1000, contractYearsLeft: 3, 育成: false }] : [] })) };
  const result = prepareEconomyMigration(old, { season: 2026, stage: 'unstarted-offseason', legacyOffseasonStarted: false });
  expect(result.ok, JSON.stringify(result.issues)).toBe(true);
  const policy = economyPolicy(old.teams, 2027);
  const world = { ...base, teams: old.teams, faPool: [], schedule: null, contractEconomy: {
    ...base.contractEconomy, clock: { season: 2026, phase: 'offseason', date: '2026-12-01', offseasonTurn: 0 },
    budgetPolicies: policy.budgetPolicies, legacyEvidence: { ...base.contractEconomy.legacyEvidence, contracts: result.candidate.ledger.records },
    engine: { ...base.contractEconomy.engine, rosterRequirements: policy.rosterRequirements,
      spending: { ...base.contractEconomy.engine.spending, budgetSeason: 2027, ledger: result.candidate.ledger, authorizations: policy.authorizations } },
  } };
  const projected = fromAnnualState(world, toAnnualState(world));
  expect((await save(projected)).ok).toBe(true); const loaded = await loadGame();
  expect(loaded.contractEconomy).toEqual(projected.contractEconomy);
  expect(loaded.contractEconomy.engine.spending.ledger.records[0].contract.guaranteeStatus).toBe('unknown');
  expect(loaded.teams[0].players[0]).not.toHaveProperty('contractSignedYear');
  expect(loaded.teams[0].players[0]).not.toHaveProperty('contractYears');
  const evidence = structuredClone(loaded.contractEconomy.engine.spending.ledger);
  expect((await save(loaded)).ok).toBe(true);
  loaded.contractEconomy.revision++;
  expect((await save(loaded)).ok).toBe(true);
  const resaved = await loadGame();
  expect(resaved.contractEconomy.engine.spending.ledger).toEqual(evidence);
  expect(resaved.teams[0].players[0]).not.toHaveProperty('contractSignedYear');
  expect(resaved.teams[0].players[0]).not.toHaveProperty('contractYears');
});

// Past employment is deliberately absent from today's roster. Deleting or
// rewriting it still produces a valid current world, but must not erase history.
function historyFixture() {
  const world = economyFixture();
  let ledger = applyContractLedgerAction(world.contractEconomy.engine.spending.ledger, {
    id: 'past-sign', type: 'sign', teamId: 0, effectiveDate: '2025-02-01',
    contract: createSeasonContract({ contractId: 'past', playerId: 'past-player', signedSeason: 2025,
      agreementPhase: 'preseason', purpose: 'acquisition', termYears: 1,
      annualSalaryManYen: 1000, guaranteed: true, registrationType: 'controlled' }),
  });
  for (const [id, effectiveDate, annualSalaryManYen] of [['raise-1', '2025-03-01', 1200], ['raise-2', '2025-04-01', 1400]]) {
    ledger = applyContractLedgerAction(ledger, { id, type: 'increase', teamId: 0, contractId: 'past', effectiveDate, annualSalaryManYen });
  }
  world.contractEconomy.engine.spending.ledger = closeContractLedgerThrough(ledger, 2025);
  const offered = reduceEconomyCommand(world, renewalEnvelope(world));
  expect(offered.ok, offered.error).toBe(true);
  return commandWorld(offered.world, { id: 'cancel', type: 'cancel-renewal', proposalId: 'renewal' });
}

function commandWorld(world, transaction) {
  const result = reduceEconomyCommand(world, { saveId: world.saveId, epoch: world.contractEconomy.epoch,
    baseRevision: world.contractEconomy.revision, transaction });
  expect(result.ok, result.error).toBe(true);
  return result.world;
}

const historyEdits = [
  ['random seed', e => { e.randomRoot.seed = 'rewritten-seed'; }],
  ['receipt deletion', e => { e.engine.transactions.pop(); }],
  ['receipt rewrite', e => { e.engine.transactions[0].signature = 'rewritten-receipt'; }],
  ['receipt reorder', e => { e.engine.transactions.reverse(); }],
  ['signed terms', e => { e.engine.spending.ledger.records.at(-1).contract.annualSalaryManYen = 900; }],
  ['ledger record deletion', e => { e.engine.spending.ledger.records.pop(); }],
  ['ledger record reorder', e => { e.engine.spending.ledger.records.reverse(); }],
  ['ledger action deletion', e => { e.engine.spending.ledger.records.at(-1).changes.shift(); }],
  ['ledger action rewrite', e => { e.engine.spending.ledger.records.at(-1).changes[0].annualSalaryManYen = 1250; }],
  ['closed year regression', e => { e.engine.spending.ledger.closedThroughSeason = 2024; }],
];

for (const large of [false, true]) for (const route of ['warm', 'cold', 'loaded', 'recovered', 'unversioned']) {
  it.each(historyEdits)(`rejects higher-revision %s without changing roots or input (${route}, large=${large})`, async (_, edit) => {
    let candidate = historyFixture();
    if (large) candidate.padding = 'large'.repeat(20000);
    if (route === 'unversioned') {
      rows.set(primary, await prepareRootBody(JSON.stringify(candidate)));
      rows.set(bk1, rows.get(primary)); rows.set(bk2, rows.get(primary));
    } else {
      for (let i = 0; i < 3; i++) expect((await save(candidate)).ok).toBe(true);
    }
    expect(JSON.parse(rows.get(primary)).rootBodyVersion === 1).toBe(large);
    if (route !== 'warm') freshStorageSurface();
    if (route === 'recovered') rows.set(primary, 'corrupt-primary');
    if (['loaded', 'recovered', 'unversioned'].includes(route)) {
      candidate = await loadGame();
      expect(getLastLoadResult().status).toBe(route === 'recovered' ? 'recovered' : 'primary');
    }
    const before = roots();
    candidate.contractEconomy.revision++;
    edit(candidate.contractEconomy); // Mutate the caller's original/loaded object in place.
    expect(() => validateEconomySave(candidate)).not.toThrow();
    const input = structuredClone(candidate);
    expect(await save(candidate)).toMatchObject({ ok: false, reason: 'economy_history_conflict' });
    expect(roots()).toEqual(before); expect(candidate).toEqual(input);
  });
}

it.each([false, true])('saves legitimate offers, replacement, acceptance and ledger changes (large=%s)', async large => {
  let world = economyFixture();
  if (large) world.padding = 'large'.repeat(20000);
  expect((await save(world)).ok).toBe(true);
  world = commandWorld(world, renewalEnvelope(world).transaction);
  expect((await save(world)).ok).toBe(true);
  const replacement = renewalEnvelope(world, { id: 'replace', salary: 1800 }).transaction;
  replacement.type = 'replace-renewal'; replacement.proposalId = 'renewal';
  replacement.proposal.id = 'replacement'; replacement.proposal.contract.contractId = 'replacement-contract';
  world = commandWorld(world, replacement);
  expect((await save(world)).ok).toBe(true);
  freshStorageSurface(); world = await loadGame();
  world = commandWorld(world, { id: 'accept', type: 'accept-renewal', proposalId: 'replacement',
    contractId: world.teams[0].players[0].contractId });
  expect((await save(world)).ok).toBe(true);
  expect(world.contractEconomy.engine.transactions.map(r => r.id)).toEqual([0, 'replace', 'accept']);
  expect(world.contractEconomy.engine.spending.reservations).toEqual([]);
  expect(world.contractEconomy.engine.spending.resolvedReservations.map(r => r.resolution)).toEqual(['replaced', 'accepted']);
  const state = toAnnualState(world);
  state.spending.ledger = applyContractLedgerAction(state.spending.ledger, { id: 'raise', type: 'increase',
    contractId: world.teams[0].players[0].contractId, teamId: 0, effectiveDate: '2026-07-16', annualSalaryManYen: 1100 });
  world = fromAnnualState(world, state); world.contractEconomy.revision++;
  expect((await save(world)).ok).toBe(true);
  expect((await save(world)).ok).toBe(true);
  expect((await loadGame()).contractEconomy).toEqual(world.contractEconomy);
});

it('permits a legitimate budget policy update at a new revision', async () => {
  const world = historyFixture(); expect((await save(world)).ok).toBe(true);
  const policy = quoteAnnualBudgetPolicy(world, { policyVersion: 'next-budget', allocationPercent: 60,
    smoothingYears: 1, maxChangePercent: 20, forecasts: world.contractEconomy.budgetPolicies.map(({ teamId, season }) => ({
      teamId, season, source: 'observed', operatingSurplusesManYen: [100000], supportManYen: 0, previousApprovedManYen: null,
    })) });
  const next = structuredClone(world), e = next.contractEconomy;
  e.budgetPolicies = policy.budgetPolicies; e.engine.rosterRequirements = policy.rosterRequirements;
  e.engine.spending.authorizations = policy.authorizations; e.revision++;
  const projected = fromAnnualState(next, toAnnualState(next));
  expect((await save(projected)).ok).toBe(true);
  expect((await loadGame()).contractEconomy.budgetPolicies[0].approvedManYen).toBe(60000);
});

it('permits closing a year and carrying intact history into a future season', async () => {
  const fixture = economyFixture(), teams = fixture.teams.map(t => ({ ...t,
    players: t.players.map(p => ({ ...p, contractYearsLeft: 3 })) }));
  const world = createAnnualNewGameWorld({ teams, faPool: [], myId: 0, saveId: 'rollover', season: 2026,
    policy: economyPolicy(teams), randomRoot: { algorithmVersion: 1, seed: 'rollover' } });
  expect((await save(world)).ok).toBe(true);
  const next = structuredClone(world), e = next.contractEconomy, policy = economyPolicy(teams, 2027);
  next.year = 2027; e.clock = { season: 2027, phase: 'preseason', date: '2027-02-01', offseasonTurn: 0 };
  e.cycle = { ...e.cycle, season: 2027 }; e.revision++;
  e.engine.spending.budgetSeason = 2027;
  e.engine.spending.ledger = closeContractLedgerThrough(e.engine.spending.ledger, 2026);
  e.budgetPolicies = policy.budgetPolicies; e.engine.rosterRequirements = policy.rosterRequirements;
  e.engine.spending.authorizations = policy.authorizations;
  const projected = fromAnnualState(next, toAnnualState(next));
  expect((await save(projected)).ok).toBe(true);
  const loaded = await loadGame();
  expect(loaded.year).toBe(2027); expect(loaded.teams[0].players[0].contractYearsLeft).toBe(2);
  expect(loaded.contractEconomy.engine.spending.ledger.records).toEqual(world.contractEconomy.engine.spending.ledger.records);
});

it('requires the progression producer to increment revision when the economy clock changes', async () => {
  const world = economyFixture(); expect((await save(world)).ok).toBe(true);
  const next = structuredClone(world), before = roots();
  next.gameDay = 2; next.schedule.push({ date: { month: 7, day: 17 } });
  next.contractEconomy.clock.date = '2026-07-17';
  expect(await save(next)).toMatchObject({ ok: false, reason: 'economy_revision_conflict' });
  expect(roots()).toEqual(before);
  next.contractEconomy.revision++;
  expect((await save(next)).ok).toBe(true);
  expect((await loadGame()).contractEconomy.clock.date).toBe('2026-07-17');
});
