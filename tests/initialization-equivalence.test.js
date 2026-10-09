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
  const baselineCalls=calls();
  const digest=createHash('sha256').update(JSON.stringify(teams)).digest('hex');
  // Committed before optimization; full team/player/history/order/roles payload.
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
