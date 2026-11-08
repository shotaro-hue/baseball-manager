import { expect, it } from 'vitest';
import { generatedPostingWorld } from './fixtures/postingMarketResults';
import { fromAnnualState, reduceEconomyCommand, toAnnualState } from '../contractEconomy';
import { validateEconomySave } from '../economyPersistence';
import { postingApplicationViews } from '../annualPostingApplications';
import { requestGenerationWorld } from './fixtures/postingRequestGeneration';
import { envelope } from './fixtures/faDeclarations';
import { nextSeasonForDepartureTest } from './fixtures/inSeasonDepartures';
import { cpuPostingBudgetWorld } from './fixtures/cpuPostingBudget';
import { quoteAnnualSpendingPlan } from '../annualSpending';
import { createSeasonContract } from '../seasonContract';
import legacyReceipts from './fixtures/cpuPostingReceiptsV1.json';

const phase = (w, extra = {}) => envelope(w, { id: JSON.stringify(['annual-posting-phase', w.year]),
  type: 'advance-posting-phase', humanTeamId: w.myId, ...extra });
const apply = w => { const r = reduceEconomyCommand(w, phase(w)); expect(r.ok, r.error).toBe(true); return r.world; };
const receipt = w => w.contractEconomy.engine.transactions.find(t => t.annualPostingPhase)?.annualPostingPhase;

it('completes human wishes when a CPU has zero future headroom and must retain guarantees plus vacancy reserves', () => {
  const w = cpuPostingBudgetWorld(), before = structuredClone(w);
  expect(quoteAnnualSpendingPlan(toAnnualState(w).spending).find(r => r.teamId === 1 && r.season === 2028))
    .toMatchObject({ salaryManYen: 21000, remainingManYen: 0 });
  const next = apply(w), engine = next.contractEconomy.engine;
  expect(receipt(next).decisions.map(d => [d.decision, d.reason])).toEqual([
    ['reject', 'future-budget'], ['reject', 'future-budget'],
  ]);
  expect(receipt(next).marketIds).toEqual([]);
  expect(engine.postingMarketResults ?? []).toEqual([]);
  expect(engine.spending).toEqual(w.contractEconomy.engine.spending);
  expect(postingApplicationViews(toAnnualState(next)).filter(r => r.teamId === 0).every(r => r.status === 'pending')).toBe(true);
  expect(next.contractEconomy.revision).toBe(1); expect(w).toEqual(before);
  expect(validateEconomySave(next)).toBe('annual');
  expect(apply(w)).toEqual(next);
  expect(reduceEconomyCommand(next, phase(w))).toMatchObject({ ok: true, replayed: true, world: next });
});
it('approves affordable CPU departures and runs the existing overseas market', () => {
  const next = apply(cpuPostingBudgetWorld({ headroom: 840 }));
  expect(receipt(next).decisions.map(d => d.decision)).toEqual(['approve', 'approve']);
  expect(receipt(next).marketIds).toHaveLength(2);
  expect(next.contractEconomy.engine.postingMarketResults).toHaveLength(2);
  expect(validateEconomySave(next)).toBe('annual');
});
it('reserves earlier approvals cumulatively before any market result', () => {
  for (const playerId of ['club-1-0', 'club-1-4']) {
    const single = apply(cpuPostingBudgetWorld({ headroom: 420, interestedIds: [playerId] }));
    expect(receipt(single).decisions.map(d => d.decision)).toEqual(['approve']);
  }
  const w = cpuPostingBudgetWorld({ headroom: 420 }), next = apply(w), shuffled = structuredClone(w);
  expect(receipt(next).decisions.map(d => [d.decision, d.reason])).toEqual([
    ['approve', 'replacement-covered'], ['reject', 'future-budget'],
  ]);
  expect(receipt(next).marketIds).toHaveLength(1);
  // An earlier no-offer must not retroactively finance a later approval.
  expect(next.contractEconomy.engine.postingMarketResults.map(r => r.outcome)).toEqual(['no-offer']);
  shuffled.teams.reverse(); for (const t of shuffled.teams) { t.players.reverse(); t.farm.reverse(); }
  expect(receipt(apply(shuffled))).toEqual(receipt(next));
});
it('counts already fixed CPU approvals before new budget decisions without overriding them', () => {
  let w = cpuPostingBudgetWorld({ headroom: 420 });
  const p = w.teams[1].players.find(p => p.id === 'club-1-0');
  for (const c of [{ id: 'existing-wish', type: 'request-posting', teamId: 1, playerId: p.id, contractId: p.contractId },
    { id: 'existing-approval', type: 'decide-posting', requestId: 'existing-wish', decision: 'approve' }]) {
    const r = reduceEconomyCommand(w, envelope(w, c)); expect(r.ok, r.error).toBe(true); w = r.world;
  }
  const next = apply(w);
  expect(receipt(next).decisions.map(d => [d.inputs.playerId, d.decision, d.reason]))
    .toEqual([['club-1-4', 'reject', 'future-budget']]);
  expect(next.contractEconomy.engine.transactions.find(t => t.id === 'existing-approval'))
    .toEqual(w.contractEconomy.engine.transactions.find(t => t.id === 'existing-approval'));
  expect(receipt(next).marketIds).toHaveLength(1);
});
it.each(['reserved', 'accepted'])('counts an existing %s future renewal against CPU posting funds', status => {
  let w = cpuPostingBudgetWorld({ headroom: 10000, expiringPeer: true, interestedIds: ['club-1-4'] });
  const p = [...w.teams[1].players, ...w.teams[1].farm].find(p => p.id === 'club-1-5');
  const proposal = { id: 'budget-peer-renewal', type: 'sign', teamId: 1, effectiveDate: '2027-02-01',
    contract: createSeasonContract({ contractId: 'budget-peer-future', playerId: p.id, signedSeason: 2026,
      agreementPhase: 'offseason', purpose: 'renewal', termYears: 3, annualSalaryManYen: 2000,
      guaranteed: true, registrationType: 'controlled' }) };
  const commands = [{ id: 'offer-budget-peer', type: 'offer-renewal', contractId: p.contractId, proposal },
    ...(status === 'accepted' ? [{ id: 'accept-budget-peer', type: 'accept-renewal', contractId: p.contractId, proposalId: proposal.id }] : [])];
  for (const c of commands) { const r = reduceEconomyCommand(w, envelope(w, c)); expect(r.ok, r.error).toBe(true); w = r.world; }
  for (const list of [w.contractEconomy.engine.spending.authorizations, w.contractEconomy.budgetPolicies])
    list.find(r => r.teamId === 1 && r.season === 2028).approvedManYen = 22000;
  w = fromAnnualState(w, toAnnualState(w));
  expect(quoteAnnualSpendingPlan(toAnnualState(w).spending).find(r => r.teamId === 1 && r.season === 2028))
    .toMatchObject({ remainingManYen: 0, salaryManYen: status === 'accepted' ? 22000 : 20000, reservedManYen: status === 'reserved' ? 2000 : 0 });
  const next = apply(w);
  expect(receipt(next).decisions.map(d => [d.decision, d.reason])).toEqual([['reject', 'future-budget']]);
  expect(next.contractEconomy.engine.spending).toEqual(w.contractEconomy.engine.spending);
});
it('keeps retained guarantees and vacancy reserves in every remaining contract year', () => {
  const w = cpuPostingBudgetWorld({ headroom: 840 }), e = w.contractEconomy.engine;
  e.rosterRequirements.find(r => r.teamId === 1 && r.season === 2027).requiredControlledCount = 21;
  const next = apply(fromAnnualState(w, toAnnualState(w)));
  expect(receipt(next).decisions.map(d => d.decision)).toEqual(['approve', 'approve']);
  const departed = next.contractEconomy.engine.postingDepartures;
  expect(departed.length).toBeGreaterThan(0);
  for (const season of [2027, 2028]) {
    const row = quoteAnnualSpendingPlan(toAnnualState(next).spending).find(r => r.teamId === 1 && r.season === season);
    expect(row.guaranteeManYen).toBe(departed.length * 1000);
    expect(row.salaryManYen + row.guaranteeManYen).toBe(21000);
    expect(row.minimumRosterReserveManYen).toBe(departed.length * 420);
  }
});
it('keeps CPU approvals independent of market draws and prospective offer prices', () => {
  let w = cpuPostingBudgetWorld({ headroom: 420, interestedIds: [] });
  for (const t of w.teams) for (const p of [...t.players, ...t.farm]) p.personality.overseas = 0;
  for (const playerId of ['club-1-0', 'club-1-4']) {
    const p = w.teams[1].players.find(p => p.id === playerId);
    const r = reduceEconomyCommand(w, envelope(w, { id: 'fixed-wish-' + playerId, type: 'request-posting',
      teamId: 1, playerId, contractId: p.contractId }));
    expect(r.ok, r.error).toBe(true); w = r.world;
  }
  const other = structuredClone(w); other.contractEconomy.randomRoot.seed = 'another-posting-market';
  const a = apply(w), b = apply(other);
  expect(receipt(a).decisions).toEqual(receipt(b).decisions);
  expect(receipt(a).decisions.map(d => d.inputs.budgetAffordable)).toEqual([true, false]);
  const markets = world => world.contractEconomy.engine.transactions.filter(t => t.generatedPostingMarket).map(t => t.generatedPostingMarket.evaluation);
  expect(markets(a)).not.toEqual(markets(b));
});
it('loads frozen v1 CPU receipts without adding budget inputs or changing historical decisions', () => {
  const next = apply(requestGenerationWorld()), e = next.contractEconomy.engine;
  for (const old of legacyReceipts) {
    const at = e.transactions.findIndex(t => t.id === old.id);
    expect(at).toBeGreaterThanOrEqual(0); e.transactions[at] = structuredClone(old);
  }
  const loaded = JSON.parse(JSON.stringify(next)), before = structuredClone(loaded);
  expect(receipt(loaded).policyVersion).toBe('cpu-posting-v1');
  expect(validateEconomySave(loaded)).toBe('annual');
  expect(reduceEconomyCommand(loaded, phase(loaded))).toMatchObject({ ok: true, replayed: true, world: loaded });
  expect(loaded).toEqual(before);
});
it.each(['contract', 'budget', 'reservation'])('fails explicitly for inconsistent %s data rather than recording CPU budget refusals', field => {
  const w = cpuPostingBudgetWorld(), e = w.contractEconomy.engine;
  if (field === 'contract') e.spending.ledger.records[0].contract.endSeason++;
  if (field === 'budget') e.spending.authorizations.find(r => r.teamId === 1 && r.season === 2028).approvedManYen++;
  if (field === 'reservation') e.spending.reservations.push({ kind: 'renewal', proposal: {} });
  const before = structuredClone(w), result = reduceEconomyCommand(w, phase(w));
  expect(result).toMatchObject({ ok: false, world: w }); expect(result.error).toBeTruthy(); expect(w).toEqual(before);
});

// Missing phase dispatch must fail these tests: a CPU helper alone is insufficient.
it('generates all clubs, fixes CPU decisions before common markets and leaves human authority intact in one revision', () => {
  const w = requestGenerationWorld(), before = structuredClone(w), next = apply(w), engine = next.contractEconomy.engine;
  expect(next.contractEconomy.revision).toBe(1);
  expect(engine.transactions.filter(t => t.generatedPostingRequests)).toHaveLength(2);
  const views = postingApplicationViews(toAnnualState(next));
  expect(views.filter(r => r.teamId === 0).length).toBeGreaterThan(0);
  expect(views.filter(r => r.teamId === 0).every(r => r.status === 'pending')).toBe(true);
  const cpu = views.filter(r => r.teamId === 1);
  expect(cpu.some(r => r.status === 'rejected')).toBe(true);
  expect(cpu.some(r => ['signed', 'no-offer', 'declined'].includes(r.status))).toBe(true);
  expect(cpu.some(r => ['pending', 'approved'].includes(r.status))).toBe(false);
  const decisions = receipt(next).decisions;
  expect(decisions.some(d => d.reason === 'role-depth')).toBe(true);
  expect(decisions.some(d => d.reason === 'replacement-covered')).toBe(true);
  const positions = engine.transactions.map(t => JSON.parse(t.signature).type);
  expect(positions.lastIndexOf('decide-posting')).toBeLessThan(positions.indexOf('run-posting-market'));
  expect(w).toEqual(before); expect(validateEconomySave(next)).toBe('annual');
  expect(reduceEconomyCommand(next, phase(w))).toMatchObject({ ok: true, replayed: true, world: next });
});
it('records zero wishes for every club and reuses a previously confirmed human generation', () => {
  let w = requestGenerationWorld({ interested: false });
  const prior = reduceEconomyCommand(w, envelope(w, { id: JSON.stringify(['posting-request-generation', 2026, 0]),
    type: 'generate-posting-requests', teamId: 0 }));
  expect(prior.ok, prior.error).toBe(true); w = prior.world;
  const next = apply(w);
  expect(next.contractEconomy.revision).toBe(2);
  expect(next.contractEconomy.engine.transactions.filter(t => t.generatedPostingRequests)).toHaveLength(2);
  expect(receipt(next).createdGenerationIds).toHaveLength(1);
  expect(receipt(next).decisions).toEqual([]); expect(receipt(next).marketIds).toEqual([]);
  expect(postingApplicationViews(toAnnualState(next))).toEqual([]);
});
it('does not redecide existing CPU refusals and completes previously approved CPU requests', () => {
  let w = requestGenerationWorld();
  for (const [playerId, decision] of [['club-1-0', 'reject'], ['club-1-4', 'approve']]) {
    const p = w.teams[1].players.find(p => p.id === playerId);
    for (const c of [{ id: 'request-' + playerId, type: 'request-posting', teamId: 1, playerId, contractId: p.contractId },
      { id: 'decision-' + playerId, type: 'decide-posting', requestId: 'request-' + playerId, decision }]) {
      const r = reduceEconomyCommand(w, envelope(w, c)); expect(r.ok, r.error).toBe(true); w = r.world;
    }
  }
  const next = apply(w), list = postingApplicationViews(toAnnualState(next));
  expect(list.find(r => r.playerId === 'club-1-0').status).toBe('rejected');
  expect(['signed', 'no-offer', 'declined']).toContain(list.find(r => r.playerId === 'club-1-4').status);
  expect(receipt(next).decisions.some(d => d.requestId === 'request-club-1-0' || d.requestId === 'request-club-1-2')).toBe(false);
});
it('counts earlier approvals as outgoing even if the later market gives no offer', () => {
  const next = apply(requestGenerationWorld()), decisions = receipt(next).decisions;
  const approved = decisions.filter(d => d.decision === 'approve');
  expect(approved.length).toBeGreaterThan(0);
  expect(approved.every(d => d.inputs.remainingDepth >= d.inputs.minimumDepth)).toBe(true);
  expect(decisions.filter(d => d.inputs.role === '一塁手').map(d => d.inputs.remainingDepth))
    .toEqual([...decisions.filter(d => d.inputs.role === '一塁手')].map((_, i) => 16 - i));
});
it('does not recompute saved CPU reasons after player development or later season', () => {
  let next = apply(requestGenerationWorld());
  for (const request of postingApplicationViews(toAnnualState(next)).filter(r => r.teamId === next.myId && r.status === 'pending')) {
    const result = reduceEconomyCommand(next, envelope(next, { id: 'reject-' + request.id,
      type: 'decide-posting', requestId: request.id, decision: 'reject' }));
    expect(result.ok, result.error).toBe(true); next = result.world;
  }
  const saved = structuredClone(receipt(next));
  expect(saved.decisions.length).toBeGreaterThan(0);
  next.teams[1].players[0].batting.contact = 99;
  next.teams[1].frontOfficePlan = { mode: 'rebuild' };
  const later = nextSeasonForDepartureTest(next);
  expect(validateEconomySave(later)).toBe('annual'); expect(receipt(later)).toEqual(saved);
});
it.each(['humanTeamId', 'id'])('rejects forged %s on the world entry without any mutation', field => {
  const w = requestGenerationWorld(), before = structuredClone(w);
  const r = reduceEconomyCommand(w, phase(w, { [field]: field === 'humanTeamId' ? 1 : 'reroll' }));
  expect(r).toMatchObject({ ok: false, world: w }); expect(w).toEqual(before);
});
it.each(['decision', 'reason', 'child', 'input'])('rejects altered CPU %s evidence on reload', field => {
  const next = apply(requestGenerationWorld()), bad = structuredClone(next), d = receipt(bad).decisions[0];
  if (field === 'input') d.inputs.remainingDepth += 1;
  else if (field === 'child') d.decisionId = 'other';
  else d[field] = 'other';
  expect(() => validateEconomySave(bad)).toThrow();
});

it.each(['signed', 'no-offer', 'declined'])('uses the existing market to preserve CPU %s as a distinct final result', outcome => {
  const w = generatedPostingWorld(outcome); w.myId = 1;
  for (const team of w.teams) for (const p of [...team.players, ...team.farm]) if (p.id !== 0) p.personality = { ...p.personality, overseas: 0 };
  const before = structuredClone(w), next = apply(w), e = next.contractEconomy.engine;
  expect(e.postingMarketResults.find(r => r.requestId === 'request').outcome).toBe(outcome);
  expect(next.contractEconomy.incomeReceipts).toHaveLength(outcome === 'signed' ? 1 : 0);
  if (outcome === 'signed') {
    expect(next.teams[0].players.some(p => p.id === 0)).toBe(false);
    expect(e.postingDepartures[0].settlement).toBe('retain');
    expect(next.contractEconomy.incomeReceipts[0].budgetAllocation.season).toBe(2027);
  } else {
    expect(next.teams).toEqual(before.teams); expect(e.spending).toEqual(before.contractEconomy.engine.spending);
  }
  expect(validateEconomySave(next)).toBe('annual');
});
it('rejects CPU posting that worsens a later-year deficit, without changing it to no-offer or declining', () => {
  let w = generatedPostingWorld('signed'); w.myId = 1;
  for (const team of w.teams) for (const p of [...team.players, ...team.farm]) if (p.id !== 0) p.personality = { overseas: 0 };
  for (const list of [w.contractEconomy.engine.spending.authorizations, w.contractEconomy.budgetPolicies])
    list.find(r => r.teamId === 0 && r.season === 2028).approvedManYen = 1000;
  w.contractEconomy.engine.rosterRequirements.find(r => r.teamId === 0 && r.season === 2028).requiredControlledCount = 21;
  w = fromAnnualState(w, toAnnualState(w));
  const before = structuredClone(w), result = reduceEconomyCommand(w, phase(w));
  expect(result).toMatchObject({ ok: false, world: w }); expect(result.error).toMatch(/不足|悪化/); expect(w).toEqual(before);
});

it('keeps generated evidence and results identical when club and roster order changes', () => {
  const w = requestGenerationWorld(), shuffled = structuredClone(w);
  shuffled.teams.reverse(); for (const t of shuffled.teams) { t.players.reverse(); t.farm.reverse(); }
  const a = apply(w).contractEconomy, b = apply(shuffled).contractEconomy;
  expect(b.engine.transactions).toEqual(a.engine.transactions);
  expect(b.engine.postingMarketResults).toEqual(a.engine.postingMarketResults);
  expect(b.incomeReceipts).toEqual(a.incomeReceipts);
});
it('yields between phase steps and produces exactly the same common transaction as synchronous execution', async () => {
  const economy = await import('../contractEconomy');
  expect(economy.reduceEconomyCommandAsync).toBeTypeOf('function');
  const w = requestGenerationWorld(), expected = apply(w); let turns = 0;
  const ticker = setInterval(() => turns++, 0);
  try {
    const actual = await economy.reduceEconomyCommandAsync(w, phase(w));
    expect(actual.ok, actual.error).toBe(true); expect(actual.world).toEqual(expected);
    expect(turns).toBeGreaterThan(2); expect(w.contractEconomy.revision).toBe(0);
  } finally { clearInterval(ticker); }
});
