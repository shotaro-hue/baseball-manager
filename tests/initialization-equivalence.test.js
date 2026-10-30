import { afterEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import * as bootstrap from '../src/engine/bootstrapTeams';
import * as policy from '../src/engine/managementPolicy';
import { buildAutoLineupEntries, buildRosterRecs } from '../src/engine/rosterAutomation';
import { buildTeam } from '../src/engine/playerCore';
import { TEAM_DEFS } from '../src/constants';

afterEach(() => vi.restoreAllMocks());
function seedRandom(seed) {
  let calls=0;
  vi.spyOn(Math,'random').mockImplementation(()=>{calls++;seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;});
  vi.spyOn(Date,'now').mockReturnValue(1791508062000);
  return ()=>calls;
}
for (const seed of [7,42,20261009]) it('preserves complete generated data and random/ID consumption (seed '+seed+')', async () => {
  const calls=seedRandom(seed);
  const teams=bootstrap.createInitialTeams();
  for(const team of teams){
    const owned=[...team.players,...team.farm].filter(p=>!p.育成&&!p.isIkusei);
    expect(owned).toHaveLength(65);expect(owned.filter(p=>p.isPitcher)).toHaveLength(32);
    expect(owned.filter(p=>!p.isPitcher)).toHaveLength(33);
    expect(owned.filter(p=>!p.isPitcher&&p.pos==='捕手').length).toBeGreaterThanOrEqual(6);
    expect(team.players.some(p=>p.育成||p.isIkusei)).toBe(false);
  }
  const all=teams.flatMap(t=>[...t.players,...t.farm]),real=all.filter(p=>p.realPlayerId);
  expect(all).toHaveLength(782);expect(new Set(all.map(p=>p.id)).size).toBe(782);
  expect(real).toHaveLength(445);expect(new Set(real.map(p=>p.realPlayerId)).size).toBe(445);
  expect(real.filter(p=>p.isIkusei).map(p=>p.name.replace(/\s+/g,' ')).sort()).toEqual(['平山 功太','福島 圭音']);
  for(const p of real){expect(p.ratingsThrough).toBe(2025);expect(p.daysOnActiveRoster).toBe(0);expect(p.dataQuality.serviceTime).toBe('game-baseline-unknown');}
  const baselineCalls=calls();
  // Pin every pre-existing generated field and RNG call. The additive annual
  // receipts ledger is separately covered by clubFinance lifecycle/roundtrip tests.
  const digest=createHash('sha256').update(JSON.stringify(teams.map(({clubFinance,...existing})=>existing))).digest('hex');
  // DATA-PLAYER-2026 intentionally changes abilities to pre-opening projections,
  // removes randomized service time, adds source identity/confidence, and keeps
  // two development players outside the 65 controlled slots. Pin this new-game
  // baseline; saved games keep their existing payload and sync/async must match.
  expect({digest,calls:baselineCalls}).toMatchSnapshot();
  vi.restoreAllMocks();const asyncCalls=seedRandom(seed);
  expect(typeof bootstrap.createInitialTeamsAsync).toBe('function');
  const asyncTeams=await bootstrap.createInitialTeamsAsync();
  expect(asyncTeams).toEqual(teams);
  expect(asyncCalls()).toBe(baselineCalls);
});
it('evaluates a batter only once within one unchanged lineup calculation', () => {
  seedRandom(7);const team=buildTeam(TEAM_DEFS[0]);
  const evaluate=vi.spyOn(policy,'evaluateBatterForPolicy');
  const first=buildAutoLineupEntries(team,{rosterDhMode:true});
  const counts=new Map();for(const [p] of evaluate.mock.calls)counts.set(p,(counts.get(p)||0)+1);
  expect(Math.max(...counts.values())).toBe(1);
  const player=team.players.find(p=>p.id===first[0].id);player.condition=1;
  const before=evaluate.mock.calls.length;
  buildAutoLineupEntries(team,{rosterDhMode:false,policyId:'future'});
  expect(evaluate.mock.calls.length).toBeGreaterThan(before);
  expect(evaluate.mock.calls.slice(before).some(([p])=>p===player)).toBe(true);
});
it('evaluates recommendation base scores once per player for a single fixed team', () => {
  seedRandom(42);const team=buildTeam(TEAM_DEFS[0]);
  const evaluate=vi.spyOn(policy,'evaluateBatterForPolicy');
  buildRosterRecs(team);
  // One lineup coverage pass and one recommendation scoring scope.
  const counts=new Map();for(const [p] of evaluate.mock.calls)counts.set(p,(counts.get(p)||0)+1);
  expect(Math.max(...counts.values())).toBeLessThanOrEqual(2);
});
