import { expect, it } from 'vitest';
import { generatedPostingWorld } from './fixtures/postingMarketResults';
import { fromAnnualState, reduceEconomyCommand, toAnnualState } from '../contractEconomy';
import { validateEconomySave } from '../economyPersistence';
import { postingApplicationViews } from '../annualPostingApplications';
import { requestGenerationWorld } from './fixtures/postingRequestGeneration';
import { envelope } from './fixtures/faDeclarations';
import { nextSeasonForDepartureTest } from './fixtures/inSeasonDepartures';

const phase = (w, extra = {}) => envelope(w, { id: JSON.stringify(['annual-posting-phase', w.year]),
  type: 'advance-posting-phase', humanTeamId: w.myId, ...extra });
const apply = w => { const r = reduceEconomyCommand(w, phase(w)); expect(r.ok, r.error).toBe(true); return r.world; };
const receipt = w => w.contractEconomy.engine.transactions.find(t => t.annualPostingPhase)?.annualPostingPhase;

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
  for (const [playerId, decision] of [['club-1-0', 'reject'], ['club-1-2', 'approve']]) {
    const p = w.teams[1].players.find(p => p.id === playerId);
    for (const c of [{ id: 'request-' + playerId, type: 'request-posting', teamId: 1, playerId, contractId: p.contractId },
      { id: 'decision-' + playerId, type: 'decide-posting', requestId: 'request-' + playerId, decision }]) {
      const r = reduceEconomyCommand(w, envelope(w, c)); expect(r.ok, r.error).toBe(true); w = r.world;
    }
  }
  const next = apply(w), list = postingApplicationViews(toAnnualState(next));
  expect(list.find(r => r.playerId === 'club-1-0').status).toBe('rejected');
  expect(['signed', 'no-offer', 'declined']).toContain(list.find(r => r.playerId === 'club-1-2').status);
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
