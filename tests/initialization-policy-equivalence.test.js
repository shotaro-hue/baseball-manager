import { afterEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { TEAM_DEFS } from '../src/constants';
import { buildTeam } from '../src/engine/playerCore';
import { MANAGEMENT_POLICY_ORDER, evaluateBatterForPolicy } from '../src/engine/managementPolicy';
import { buildAutoLineupEntries, buildRosterRecs, optimizeTeamForGameStart } from '../src/engine/rosterAutomation';
afterEach(()=>vi.restoreAllMocks());
it('matches uncached baseline values and plans across all policies, DH modes and changed player/team inputs',()=>{
  let seed=42;
  vi.spyOn(Math,'random').mockImplementation(()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;});
  vi.spyOn(Date,'now').mockReturnValue(1791508062000);
  const source=buildTeam(TEAM_DEFS[0]);
  const outputs=[];
  for(const policyId of MANAGEMENT_POLICY_ORDER)for(const rosterDhMode of [false,true]){
    const team=structuredClone(source);team.managementPolicyId=policyId;
    const options={policyId,rosterDhMode};
    // Prime the original input, then alter abilities, fatigue, form, membership.
    buildAutoLineupEntries(team,options);buildRosterRecs(team,options);
    Object.assign(team.players.find(p=>!p.isPitcher),{condition:10,form:1,potential:99});
    team.players.find(p=>!p.isPitcher).batting.power=99;
    const promoted=team.farm.find(p=>!p.isPitcher);
    team.players.push(promoted);team.farm=team.farm.filter(p=>p!==promoted);
    outputs.push({policyId,rosterDhMode,
      scores:team.players.filter(p=>!p.isPitcher).map(p=>evaluateBatterForPolicy(p,team,options)),
      lineup:buildAutoLineupEntries(team,options),recommendations:buildRosterRecs(team,options),
      optimized:optimizeTeamForGameStart(team,options)});
  }
  expect(createHash('sha256').update(JSON.stringify(outputs)).digest('hex')).toMatchSnapshot();
});
