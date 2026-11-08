import { expect, it } from 'vitest';
import { reduceEconomyCommand, toAnnualState } from '../contractEconomy';
import { validateEconomySave } from '../economyPersistence';
import { postingWinter } from './fixtures/postingDepartures';
import { postingApplicationViews } from '../annualPostingApplications';
import { envelope } from './fixtures/faDeclarations';
import { postingRequest } from './fixtures/postingApplications';
import { reserve } from './fixtures/annualRetirements';
import { inSeasonWorld, nextSeasonForDepartureTest } from './fixtures/inSeasonDepartures';
import { isIkuseiPlayer } from '../rosterCapacity';

import { requestGenerationWorld } from './fixtures/postingRequestGeneration';
const command = (w, extra = {}) => envelope(w, { id: JSON.stringify(['posting-request-generation', w.year, w.myId]),
  type: 'generate-posting-requests', teamId: w.myId, ...extra });
const apply = w => { const r = reduceEconomyCommand(w, command(w)); expect(r.ok, r.error).toBe(true); return r.world; };
const generation = w => w.contractEconomy.engine.transactions.find(t => t.generatedPostingRequests)?.generatedPostingRequests;

it('generates saved requests from both controlled rosters with no employment or financial effects', () => {
  const w = requestGenerationWorld(), before = structuredClone(w), next = apply(w);
  expect(next.contractEconomy.revision).toBe(1);
  const requests = postingApplicationViews(toAnnualState(next));
  expect(requests.length).toBeGreaterThan(0);
  expect(requests.some(r => before.teams[0].farm.some(p => p.id === r.playerId))).toBe(true);
  expect(requests.every(r => r.teamId === 0 && r.status === 'pending')).toBe(true);
  expect(next.contractEconomy.incomeReceipts).toEqual([]);
  expect(next.contractEconomy.engine.spending).toEqual(before.contractEconomy.engine.spending);
  expect(next.teams[1]).toEqual(before.teams[1]);
  for (const p of [...next.teams[0].players, ...next.teams[0].farm]) {
    const old = [...before.teams[0].players, ...before.teams[0].farm].find(x => x.id === p.id);
    expect({ ...p, postingRequested: old.postingRequested }).toEqual(old);
    expect(p.postingRequested).toBe(requests.some(r => r.playerId === p.id));
  }
  expect(w).toEqual(before); expect(validateEconomySave(next)).toBe('annual');
  expect(reduceEconomyCommand(next, command(w))).toMatchObject({ ok: true, replayed: true, world: next });
  expect(reduceEconomyCommand(next, command(next, { id: 'reroll' })).ok).toBe(false);
});
it('persists a zero-request season and never rerolls after ratings or morale change', () => {
  const next = apply(requestGenerationWorld({ interested: false }));
  expect(next.contractEconomy.engine.postingApplications ?? []).toEqual([]);
  expect(generation(next).candidates.length).toBe(21);
  next.teams[0].players[0].personality.overseas = 100;
  next.teams[0].players[0].morale = 0;
  expect(validateEconomySave(next)).toBe('annual');
  const replay = reduceEconomyCommand(next, command(next));
  expect(replay).toMatchObject({ ok: true, replayed: true, world: next });
});
it('does not replace existing explicit requests or consider retired, reserved, development or old-flagged players', () => {
  let w = requestGenerationWorld();
  const explicit = reduceEconomyCommand(w, postingRequest(w)); expect(explicit.ok, explicit.error).toBe(true); w = explicit.world;
  w.teams[0].players[1].isRetired = true;
  w.teams[0].players[2].postingRequested = true;
  const next = apply(w), ids = generation(next).candidates.map(c => c.inputs.playerId);
  expect(ids).not.toContain(0); expect(ids).not.toContain(1); expect(ids).not.toContain(2);
  expect(next.contractEconomy.engine.postingApplications.filter(r => r.playerId === 0)).toHaveLength(1);
  const season = inSeasonWorld();
  const reserved = reduceEconomyCommand(season, reserve(season)); expect(reserved.ok, reserved.error).toBe(true);
  const winter = postingWinter();
  winter.contractEconomy = { ...reserved.world.contractEconomy, clock: winter.contractEconomy.clock,
    engine: { ...reserved.world.contractEconomy.engine, spending: { ...reserved.world.contractEconomy.engine.spending, budgetSeason: 2027 } } };
  winter.teams = reserved.world.teams;
  const after = apply(winter);
  expect(generation(after).candidates.map(c => c.inputs.playerId)).not.toContain(0);
});
it('is independent of team roster ordering and preserves missing workload and explicit zero', () => {
  const w = requestGenerationWorld(), reordered = structuredClone(w);
  w.teams[0].players[0].personality.overseas = 0; reordered.teams[0].players[0].personality.overseas = 0;
  w.teams[0].players[1].stats.PA = 0; reordered.teams[0].players[1].stats.PA = 0;
  delete w.teams[0].players[2].personality.overseas; delete reordered.teams[0].players[2].personality.overseas;
  reordered.teams[0].players.reverse(); reordered.teams[0].farm.reverse();
  const a = generation(apply(w)), b = generation(apply(reordered)); expect(a).toEqual(b);
  expect(a.candidates.find(c => c.inputs.playerId === 0).evaluation).toMatchObject({ preference: { source: 'recorded', value: 0 }, probability: 0, requested: false });
  expect(a.candidates.find(c => c.inputs.playerId === 1).inputs.workload).toBe(0);
  expect(a.candidates.find(c => c.inputs.playerId === 2).inputs.workload).toBe(null);
  expect(a.candidates.find(c => c.inputs.playerId === 2).evaluation.preference.source).toBe('game-estimate');
});
it.each(['draw', 'probability', 'requestId', 'sourceContractId', 'root'])('rejects altered %s evidence', field => {
  const next = apply(requestGenerationWorld()), bad = structuredClone(next), g = generation(bad), c = g.candidates[0];
  if (field === 'root') bad.contractEconomy.randomRoot.seed += '-changed';
  else if (field === 'sourceContractId') c.inputs.sourceContractId += '-changed';
  else if (field === 'requestId') c.requestId = 'other';
  else c.evaluation[field] += .001;
  expect(() => validateEconomySave(bad)).toThrow();
});
it('keeps historical evidence valid after a later season without regenerating from current players', () => {
  const w = requestGenerationWorld({ interested: false });
  const next = apply(w);
  next.teams[0].players[0].batting.contact = 99;
  const later = nextSeasonForDepartureTest(next);
  expect(validateEconomySave(later)).toBe('annual');
  expect(generation(later)).toEqual(generation(next));
});
it('uses the real twelve-club roster and excludes development contracts', () => {
  const w = requestGenerationWorld({ realRoster: true }), next = apply(w), g = generation(next);
  const owned = [...w.teams[0].players, ...w.teams[0].farm];
  expect(g.candidates.length).toBeGreaterThan(40);
  expect(g.candidates.every(c => !isIkuseiPlayer(owned.find(p => p.id === c.inputs.playerId)))).toBe(true);
  expect(next.teams.slice(1)).toEqual(w.teams.slice(1));
  expect(validateEconomySave(next)).toBe('annual');
});
it('uses the same missing overseas preference for the wish and subsequent market decision', () => {
  const w = requestGenerationWorld();
  for (const p of [...w.teams[0].players, ...w.teams[0].farm]) delete p.personality.overseas;
  let next = apply(w);
  const row = generation(next).candidates.find(c => c.requestId !== null); expect(row).toBeDefined();
  let r = reduceEconomyCommand(next, envelope(next, { id: 'approve-generated', type: 'decide-posting', requestId: row.requestId, decision: 'approve' }));
  expect(r.ok, r.error).toBe(true); next = r.world;
  r = reduceEconomyCommand(next, envelope(next, { id: 'market-generated', type: 'run-posting-market', requestId: row.requestId }));
  expect(r.ok, r.error).toBe(true);
  expect(r.world.contractEconomy.engine.transactions.at(-1).generatedPostingMarket.evaluation.preference).toEqual(row.evaluation.preference);
});
