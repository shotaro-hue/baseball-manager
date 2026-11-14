import { expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { closedPostseasonWorld } from './fixtures/openOffseason';
import { openOffseasonRequest, reduceOpenOffseasonRequest } from '../annualOpenOffseason';
import { reduceEconomyCommand, reduceEconomyCommandAsync, quoteEconomyCommand, toAnnualState, fromAnnualState } from '../contractEconomy';
import { validateEconomySave, economyOverwriteIssue } from '../economyPersistence';
import { contractLiabilityRows } from '../contractLedger';
import { wrap, winter as oldWinter } from './fixtures/annualRetirements';
import { economyFixture, freezeEconomy } from './fixtures/economyWorld';
import { reducePostingGenerationRequest, reduceOffseasonPostingRequest, offseasonPostingRequest } from '../humanPosting';
import { createInitialTeams } from '../bootstrapTeams';
import { yearEndReviewWorld } from './fixtures/yearEndRetirements';
import { yearEndRetirementCandidates } from '../annualYearEndRetirements';
import { budgetForecastWorld } from './fixtures/budgetForecast';
import { closeNativePostseason } from './fixtures/openOffseason';
import { economyClockFor } from '../economyCalendar';
import { retirementCareerEntries } from '../annualRetirements';
import { createSeasonContract } from '../seasonContract';
import { postingGenerationId } from '../generatedPostingRequests';
import { yearEndRetirementsRequest, reduceYearEndRetirementsRequestAsync } from '../humanYearEndRetirements';

function winter() {
  const w = closedPostseasonWorld();
  w.teams.forEach(t => t.players.forEach(p => { p.age = t.id < 2 ? 42 : 20; p.retireStyle = 100; }));
  return reduceOpenOffseasonRequest(w, openOffseasonRequest(w)).world;
}
const command = (w, decisions = [{ playerId: w.teams[0].players[0].id, choice: 'accept' }]) => wrap(w, {
  id: JSON.stringify(['year-end-retirements', w.year]), type: 'prepare-year-end-retirements', humanTeamId: w.myId, decisions,
});

it('saves human and CPU year-end retirements from the PR-C boundary with retained guarantees and final career', () => {
  const w = freezeEconomy(winter()), before = structuredClone(w), c = command(w), r = reduceEconomyCommand(w, c);
  expect(r.ok, r.error).toBe(true);
  const n = r.world, e = n.contractEconomy.engine;
  expect(n.contractEconomy.revision).toBe(w.contractEconomy.revision + 1);
  expect(n.year).toBe(w.year); expect(n.gameDay).toBe(w.gameDay);
  expect(n.offseasonPlan.playoff).toEqual(w.offseasonPlan.playoff);
  expect(e.retirementReservations).toHaveLength(2);
  for (const t of w.teams.slice(0, 2)) {
    const p = t.players[0], reservation = e.retirementReservations.find(r => r.playerId === p.id);
    expect(reservation).toMatchObject({ origin: 'year-end', notifiedDate: '2026-12-01', effectiveDate: '2026-12-01', gameDay: 144 });
    expect(reservation.finalization.careerEntry).toMatchObject({ year: 2026, stats: p.stats });
    expect(n.teams.find(a => a.id === t.id).players).toEqual([]);
    expect(n.teams.find(a => a.id === t.id).history[0]).toMatchObject({ retirementReservationId: reservation.id });
    expect(contractLiabilityRows(e.spending.ledger).filter(row => row.playerId === p.id && row.season > 2026)
      .every(row => row.kind === 'guarantee')).toBe(true);
  }
  expect(n.teams.slice(2).map(t => t.players)).toEqual(w.teams.slice(2).map(t => t.players));
  expect(e.transactions.at(-1).yearEndRetirements.candidates.map(c => c.outcome)).toEqual(['accepted', 'accepted']);
  expect(validateEconomySave(JSON.parse(JSON.stringify(n)))).toBe('annual');
  expect(economyOverwriteIssue(w, n)).toBeNull();
  expect(reduceEconomyCommand(n, c)).toMatchObject({ ok: true, replayed: true, world: n });
  expect(reduceEconomyCommand(w, c)).toEqual(r); expect(w).toEqual(before);
});

it.each([[0, 'retained'], [100, 'retain_failed']])('resolves retain intent in the domain with style %s', (retireStyle, outcome) => {
  const w = winter(), p = w.teams[0].players[0]; p.retireStyle = retireStyle;
  const c = command(w, [{ playerId: p.id, choice: 'retain' }]);
  const random = vi.spyOn(Math, 'random').mockImplementation(() => { throw Error('global RNG'); });
  let r; try { r = reduceEconomyCommand(w, c); } finally { random.mockRestore(); }
  expect(r.ok, r.error).toBe(true);
  expect(r.world.contractEconomy.engine.transactions.at(-1).yearEndRetirements.candidates[0].outcome).toBe(outcome);
  expect(r.world.teams[0].players.some(a => a.id === p.id)).toBe(outcome === 'retained');
});

it('records a zero-candidate year and hands its unchanged players to separate posting', async () => {
  const w = winter(); w.teams.forEach(t => t.players.forEach(p => { p.age = 20; }));
  const c = command(w, []), r = reduceEconomyCommand(w, c); expect(r.ok, r.error).toBe(true);
  expect(r.world.contractEconomy.engine.transactions.at(-1).yearEndRetirements.candidates).toEqual([]);
  expect(r.world.teams).toEqual(w.teams);
  expect(await reduceEconomyCommandAsync(w, c)).toEqual(r);
  const posting = reduceOffseasonPostingRequest(r.world, offseasonPostingRequest(r.world));
  expect(posting.ok, posting.error).toBe(true);
});

it.each([
  ['missing decision', (w, c) => { c.transaction.decisions = []; }],
  ['client outcome', (w, c) => { c.transaction.decisions[0].choice = 'retained'; }],
  ['CPU authority', (w, c) => { c.transaction.humanTeamId = 1; }],
  ['other player', (w, c) => { c.transaction.decisions[0].playerId = w.teams[1].players[0].id; }],
  ['duplicate decision', (w, c) => { c.transaction.decisions.push(c.transaction.decisions[0]); }],
  ['wrong day', w => { w.contractEconomy.clock.date = '2026-12-02'; }],
  ['stale revision', (w, c) => { c.baseRevision--; }],
])('rejects %s and preserves the entire source', (_, edit) => {
  const w = winter(), c = command(w); edit(w, c); const before = structuredClone(w);
  expect(reduceEconomyCommand(freezeEconomy(w), c)).toMatchObject({ ok: false, world: w }); expect(w).toEqual(before);
});

it('refuses to insert fresh retirement decisions after posting while keeping that old save readable', () => {
  // Fixed by the actual pre-guard producer; do not manufacture new posting
  // through a now-forbidden order merely to stand in for an older save.
  const w = JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/yearEndOldPosting.json.gz', import.meta.url))));
  const p = reduceOffseasonPostingRequest(w, offseasonPostingRequest(w)); expect(p.ok).toBe(true); expect(p.replayed).toBe(true);
  expect(validateEconomySave(p.world)).toBe('annual');
  expect(reduceEconomyCommand(p.world, command(p.world))).toMatchObject({ ok: false, world: p.world });
});

it.each([reducePostingGenerationRequest, reduceOffseasonPostingRequest])('requires year-end review at the shared posting preparation boundary', prepare => {
  const w = freezeEconomy(winter()), before = structuredClone(w);
  const r = prepare(w, offseasonPostingRequest(w));
  expect(r).toMatchObject({ ok: false, world: w }); expect(r.error).toContain('期末'); expect(w).toEqual(before);
});
it('rejects direct per-club posting generation before year-end review', () => {
  const w = freezeEconomy(winter());
  const r = reduceEconomyCommand(w, wrap(w, { id: postingGenerationId(w.year, w.myId), type: 'generate-posting-requests', teamId: w.myId }));
  expect(r).toMatchObject({ ok: false, world: w }); expect(r.error).toContain('期末');
});

it.each(['outcome', 'inputs', 'child', 'order'])('rejects corrupt year-end evidence: %s', edit => {
  const w = winter(), r = reduceEconomyCommand(w, command(w)); expect(r.ok, r.error).toBe(true);
  const n = r.world, ts = n.contractEconomy.engine.transactions, g = ts.at(-1).yearEndRetirements;
  if (edit === 'outcome') g.candidates[0].outcome = 'retained';
  if (edit === 'inputs') g.candidates[0].inputs.age = 20;
  if (edit === 'child') ts.splice(ts.findIndex(t => t.id === g.finalizationIds[0]), 1);
  if (edit === 'order') ts.unshift(ts.pop());
  expect(() => validateEconomySave(n)).toThrow();
});

it('uses the actual twelve-club bootstrap roster including farm and preserves each surviving player', async () => {
  const w = yearEndReviewWorld(createInitialTeams()), before = structuredClone(w), start = performance.now();
  const candidates = yearEndRetirementCandidates(toAnnualState(w), w.myId);
  const d = candidates.filter(r => r.teamId === w.myId).map(r => ({ playerId: r.playerId, choice: 'accept' }));
  const r = await reduceEconomyCommandAsync(freezeEconomy(w), command(w, d)); expect(r.ok, r.error).toBe(true);
  const n = r.world, g = n.contractEconomy.engine.transactions.at(-1).yearEndRetirements;
  expect(g.candidates).toHaveLength(candidates.length); expect(candidates.length).toBeGreaterThan(12);
  for (const t of n.teams) for (const p of [...t.players, ...t.farm]) {
    const old = before.teams.find(a => a.id === t.id);
    expect(p).toEqual([...old.players, ...old.farm].find(a => a.id === p.id));
  }
  expect(retirementCareerEntries(n, w)).toHaveLength(g.finalizationIds.length);
  expect(validateEconomySave(JSON.parse(JSON.stringify(n)))).toBe('annual'); expect(w).toEqual(before);
  console.log('YEAR_END_REAL12', Math.round(performance.now() - start), 'ms', g.finalizationIds.length, 'retired');
}, 60_000);

it('combines a genuine in-season reservation with farm year-end choices without duplicate finalization', () => {
  let w = budgetForecastWorld(); w.gameDay = 120;
  w.contractEconomy.clock = economyClockFor({ season: w.year, phase: 'season', gameDay: w.gameDay, schedule: w.schedule });
  const p = w.teams[0].players[0];
  const reserved = reduceEconomyCommand(w, wrap(w, { id: 'reserved-first', type: 'reserve-retirement', teamId: 0, playerId: p.id, contractId: p.contractId }));
  expect(reserved.ok, reserved.error).toBe(true); w = reserved.world;
  const t = w.teams[1], farm = t.players.pop(); farm.age = 42; farm.retireStyle = 100; t.farm.push(farm);
  closeNativePostseason(w); w = reduceOpenOffseasonRequest(w, openOffseasonRequest(w)).world;
  const r = reduceEconomyCommand(w, command(w, [])); expect(r.ok, r.error).toBe(true);
  const g = r.world.contractEconomy.engine.transactions.at(-1).yearEndRetirements;
  expect(g.candidates.map(r => r.playerId)).toEqual([farm.id]);
  expect(g.finalizedReservationIds).toContain('reserved-first'); expect(g.finalizationIds).toHaveLength(2);
  expect(r.world.teams[1].farm).toEqual([]); expect(validateEconomySave(r.world)).toBe('annual');
});

it('makes player/club order and unrelated random draws irrelevant to stored decisions', () => {
  const w = winter(), c = command(w, [{ playerId: w.teams[0].players[0].id, choice: 'retain' }]);
  const a = reduceEconomyCommand(w, c); expect(a.ok, a.error).toBe(true);
  const other = structuredClone(w); other.teams.reverse();
  for (let i = 0; i < 20; i++) Math.random();
  const b = reduceEconomyCommand(other, c); expect(b.ok, b.error).toBe(true);
  expect(b.world.contractEconomy.engine.transactions).toEqual(a.world.contractEconomy.engine.transactions);
});

it.each(['remove parent', 'omit retired CPU', 'swap source/final'])('rejects orphan year-end retirements on a fresh save extension: %s', edit => {
  const w = winter(), r = reduceEconomyCommand(w, command(w)); expect(r.ok).toBe(true);
  const n = r.world, ts = n.contractEconomy.engine.transactions, g = ts.at(-1).yearEndRetirements;
  if (edit === 'remove parent') ts.pop();
  else if (edit === 'omit retired CPU') {
    const cpu = g.candidates.find(r => r.teamId !== w.myId);
    g.candidates = g.candidates.filter(r => r !== cpu);
    g.createdReservationIds = g.createdReservationIds.filter(id => id !== cpu.reservationId);
  } else {
    const reserve = ts.findIndex(t => t.id === g.createdReservationIds[0]);
    const final = ts.findIndex(t => t.retirement?.reservationId === g.createdReservationIds[0]);
    [ts[reserve], ts[final]] = [ts[final], ts[reserve]];
  }
  expect(() => validateEconomySave(n)).toThrow();
});

it('requires parent claims for aggregate finalization of an original in-season reservation', () => {
  let w = budgetForecastWorld(); w.gameDay = 120;
  w.contractEconomy.clock = economyClockFor({ season: w.year, phase: 'season', gameDay: w.gameDay, schedule: w.schedule });
  const p = w.teams[0].players[0], reserved = reduceEconomyCommand(w, wrap(w, { id: 'old-reserved', type: 'reserve-retirement', teamId: 0, playerId: p.id, contractId: p.contractId }));
  expect(reserved.ok).toBe(true); w = reserved.world; closeNativePostseason(w);
  w = reduceOpenOffseasonRequest(w, openOffseasonRequest(w)).world;
  const r = reduceEconomyCommand(w, command(w, [])); expect(r.ok).toBe(true);
  const g = r.world.contractEconomy.engine.transactions.at(-1).yearEndRetirements;
  expect(g.finalizationIds).toHaveLength(1); g.finalizationIds = []; g.finalizedReservationIds = [];
  expect(() => validateEconomySave(r.world)).toThrow();
});

it('prevents a direct late year-end retirement from overturning a saved retain success', () => {
  const w = winter(), p = w.teams[0].players[0]; p.retireStyle = 0;
  const r = reduceEconomyCommand(w, command(w, [{ playerId: p.id, choice: 'retain' }])); expect(r.ok).toBe(true);
  expect(r.world.contractEconomy.engine.transactions.at(-1).yearEndRetirements.candidates[0].outcome).toBe('retained');
  const n = r.world;
  expect(reduceEconomyCommand(n, wrap(n, { id: 'late-reserve', type: 'reserve-year-end-retirement',
    teamId: w.myId, playerId: p.id, contractId: p.contractId }))).toMatchObject({ ok: false, world: n });
});

it.each([0, 1])('does not cancel club %s formal renewal promises to force retirement', teamId => {
  const source = budgetForecastWorld().teams.map(t => ({ ...t, players: t.players.map(p => ({ ...p,
    contractYearsLeft: 1, age: t.id < 2 ? 42 : 20, retireStyle: 100 })) }));
  let w = yearEndReviewWorld(source), p = w.teams.find(t => t.id === teamId).players[0];
  const offered = reduceEconomyCommand(w, wrap(w, { id: 'promise', type: 'offer-renewal', contractId: p.contractId,
    proposal: { id: 'promised-renewal', type: 'sign', teamId, effectiveDate: '2027-02-01', contract: createSeasonContract({
      contractId: 'promised-contract', playerId: p.id, signedSeason: 2026, agreementPhase: 'offseason', purpose: 'renewal',
      termYears: 2, annualSalaryManYen: 1000, registrationType: 'controlled', guaranteed: true }) } }));
  expect(offered.ok, offered.error).toBe(true); w = offered.world;
  const pending = structuredClone(w);
  expect(reduceEconomyCommand(w, command(w))).toMatchObject({ ok: false, world: w }); expect(w).toEqual(pending);
  const accepted = reduceEconomyCommand(w, wrap(w, { id: 'promise-accepted', type: 'accept-renewal', proposalId: 'promised-renewal', contractId: p.contractId }));
  expect(accepted.ok, accepted.error).toBe(true); w = accepted.world;
  expect(validateEconomySave(w)).toBe('annual');
  const before = structuredClone(w);
  expect(reduceEconomyCommand(w, command(w))).toMatchObject({ ok: false, world: w }); expect(w).toEqual(before);
});

it('excludes a low-will human and keeps saved decisions valid after surviving players change', () => {
  const w = winter(), p = w.teams[0].players[0]; p.age = 35; p.retireStyle = 0; p.stats = { PA: 500 };
  const r = reduceEconomyCommand(w, command(w, [])); expect(r.ok, r.error).toBe(true);
  expect(r.world.contractEconomy.engine.transactions.at(-1).yearEndRetirements.candidates.every(r => r.teamId !== w.myId)).toBe(true);
  const n = r.world; n.teams[0].players[0].age++; n.teams[0].players[0].stats.PA++;
  expect(validateEconomySave(n)).toBe('annual');
});

it.each([reduceEconomyCommand, reduceEconomyCommandAsync])('requires an open-offseason receipt for fresh year-end decisions at the common world API (%#)', async reduce => {
  const w = oldWinter(economyFixture()); w.gameDay = 144;
  Object.assign(w.teams[0].players[0], { age: 42, retireStyle: 100 });
  const before = structuredClone(w), c = command(w);
  expect(validateEconomySave(w)).toBe('annual');
  expect(w.contractEconomy.cycle.transitionReceipts).toEqual([]);
  expect(await reduceYearEndRetirementsRequestAsync(w, yearEndRetirementsRequest(w, c.transaction.decisions)))
    .toMatchObject({ ok: false, world: w });
  const r = await reduce(freezeEconomy(w), c);
  expect(r).toMatchObject({ ok: false, replayed: false, world: w });
  expect(r.error).toContain('オフ開始');
  expect(quoteEconomyCommand(w, c)).toMatchObject({ ok: false });
  expect(w).toEqual(before);
  // Old winter can still use its original posting workflow.
  const posting = reduceOffseasonPostingRequest(w, offseasonPostingRequest(w));
  expect(posting.ok, posting.error).toBe(true);
  expect(validateEconomySave(posting.world)).toBe('annual');
});

it('keeps pre-guard saved decisions with CPU continued readable and replayable without an opening receipt', async () => {
  const w = JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/yearEndOldNativeDecision.json.gz', import.meta.url))));
  const before = structuredClone(w), g = w.contractEconomy.engine.transactions.at(-1).yearEndRetirements;
  expect(w.contractEconomy.cycle.transitionReceipts).toEqual([]);
  expect(g.candidates.map(r => r.outcome)).toEqual(['accepted', 'continued']);
  expect(validateEconomySave(w)).toBe('annual');
  const c = command(w, [{ playerId: 0, choice: 'accept' }]); c.baseRevision = 0;
  for (const reduce of [reduceEconomyCommand, reduceEconomyCommandAsync]) {
    expect(await reduce(freezeEconomy(w), c)).toMatchObject({ ok: true, replayed: true, world: w });
  }
  expect(await reduceYearEndRetirementsRequestAsync(w, { ...yearEndRetirementsRequest(w, c.transaction.decisions), baseRevision: 0 }))
    .toMatchObject({ ok: true, replayed: true, world: w });
  expect(w).toEqual(before);
});

it('keeps CPU continued evidence independent of later player inputs and placement', () => {
  const w = winter(), p = w.teams[2].players[0];
  Object.assign(p, { age: 35, retireStyle: 0, stats: { PA: 500 } });
  const r = reduceEconomyCommand(w, command(w)); expect(r.ok, r.error).toBe(true);
  const n = r.world, g = structuredClone(n.contractEconomy.engine.transactions.at(-1).yearEndRetirements);
  expect(g.candidates.find(c => c.playerId === p.id)).toMatchObject({ outcome: 'continued', reservationId: null });
  const team = n.teams[2], survivor = team.players.pop();
  Object.assign(survivor, { age: 42, retireStyle: 100, stats: { PA: 0 }, morale: 20 }); team.farm.push(survivor);
  expect(validateEconomySave(JSON.parse(JSON.stringify(n)))).toBe('annual');
  expect(n.contractEconomy.engine.transactions.at(-1).yearEndRetirements).toEqual(g);
  expect(reduceEconomyCommand(n, command(w))).toMatchObject({ ok: true, replayed: true, world: n });
  // Isolate historical validation with the existing ledger/policies. This is
  // an engine-level next-year projection, not the unfinished annual rollover.
  const later = structuredClone(n), e = later.contractEconomy;
  later.year = 2027; later.gameDay = 0; later.schedule = []; later.offseasonPlan = null;
  e.clock = economyClockFor({ season: 2027, phase: 'preseason' }); e.cycle.season = 2027; e.cycle.stage = 'new-season';
  const projected = fromAnnualState(later, toAnnualState(later));
  expect(validateEconomySave(projected)).toBe('annual');
  expect(projected.contractEconomy.engine.transactions.at(-1).yearEndRetirements).toEqual(g);
  expect(reduceEconomyCommand(projected, command(w))).toMatchObject({ ok: true, replayed: true, world: projected });
});

it.each(['delete continued', 'change inputs', 'change player ID'])('protects already published CPU continued evidence: %s', edit => {
  const w = winter(), p = w.teams[2].players[0];
  Object.assign(p, { age: 35, retireStyle: 0, stats: { PA: 500 } });
  const r = reduceEconomyCommand(w, command(w)); expect(r.ok, r.error).toBe(true);
  const n = structuredClone(r.world), g = n.contractEconomy.engine.transactions.at(-1).yearEndRetirements;
  const row = g.candidates.find(c => c.playerId === p.id); expect(row.outcome).toBe('continued');
  if (edit === 'delete continued') g.candidates.splice(g.candidates.indexOf(row), 1);
  if (edit === 'change inputs') row.inputs.stats.PA++;
  if (edit === 'change player ID') row.playerId = 'phantom-continued';
  expect(economyOverwriteIssue(r.world, n)).toBe('economy_revision_conflict');
  n.contractEconomy.revision++;
  expect(economyOverwriteIssue(r.world, n)).toBe('economy_history_conflict');
});

it.each([
  ['save', r => { r.saveId = 'other'; }], ['epoch', r => { r.epoch = 'other'; }],
  ['stale revision', r => { r.baseRevision--; }], ['future revision', r => { r.baseRevision++; }],
  ['season', r => { r.season--; }], ['date', r => { r.date = '2026-12-02'; }],
])('rejects an invalid %s on a fresh human request after opening', async (_, edit) => {
  const w = winter(), request = yearEndRetirementsRequest(w, command(w).transaction.decisions), before = structuredClone(w);
  edit(request);
  expect(await reduceYearEndRetirementsRequestAsync(freezeEconomy(w), request)).toMatchObject({ ok: false, world: w });
  expect(w).toEqual(before);
});

it('replays an original request after opening but refuses to change its saved intent', async () => {
  const w = winter(), d = command(w).transaction.decisions, request = yearEndRetirementsRequest(w, d);
  const r = await reduceYearEndRetirementsRequestAsync(w, request); expect(r.ok, r.error).toBe(true);
  expect(await reduceYearEndRetirementsRequestAsync(r.world, request)).toMatchObject({ ok: true, replayed: true, world: r.world });
  expect(await reduceYearEndRetirementsRequestAsync(r.world, { ...request, decisions: [{ playerId: d[0].playerId, choice: 'retain' }] }))
    .toMatchObject({ ok: false, world: r.world });
});
