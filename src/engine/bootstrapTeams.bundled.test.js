import {expect,it,vi} from 'vitest';
import master from '../data/playerMaster2026.release.json';
import {createInitialTeams,createInitialTeamsAsync} from './bootstrapTeams';
import {validateTeamRoster} from './rosterAutomation';
import {selectFarmTeam} from './farmSelection';
import {compilePlayerMaster} from '../data/playerMasterSchema';

it('starts every bundled player once, on the correct team and tier, in both initialization paths',async()=>{
 const run=async fn=>{
  let seed=42;vi.spyOn(Math,'random').mockImplementation(()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;});
  try{return await fn();}finally{vi.restoreAllMocks();}
 };
 const sync=await run(createInitialTeams),asyncTeams=await run(createInitialTeamsAsync);
 expect(asyncTeams).toEqual(sync);
 for(const team of sync){
  const expected=master.players.filter(p=>p.teamId===team.id),all=[...team.players,...team.farm];
  expect(all.map(p=>p.realPlayerId).sort()).toEqual(expected.map(p=>p.playerId).sort());
  expect(all.filter(p=>p.isIkusei).map(p=>p.realPlayerId).sort()).toEqual(expected.filter(p=>p.registration==='development').map(p=>p.playerId).sort());
  expect(team.players.some(p=>p.isIkusei)).toBe(false);
  expect(all.filter(p=>!p.isIkusei).length).toBeLessThanOrEqual(70);
  expect(validateTeamRoster(team).errors).toEqual([]);
  expect(selectFarmTeam(team,{round:1}).status).toBe('ready');
 }
 expect(sync.flatMap(t=>[...t.players,...t.farm])).toHaveLength(1059);
});

it('records the bundling decision without inventing source permissions or disabling data checks',()=>{
 expect(master.sources.every(s=>s.redistribution==='unconfirmed')).toBe(true);
 expect(()=>compilePlayerMaster(master)).toThrow(/rights/);
 const options={publicationDecision:master.publicationDecision};
 expect(()=>compilePlayerMaster(master,options)).not.toThrow();
 const invalid=structuredClone(master);invalid.players[1].playerId=invalid.players[0].playerId;
 expect(()=>compilePlayerMaster(invalid,options)).toThrow(/duplicate/);
 expect(()=>compilePlayerMaster(master,{publicationDecision:{type:'maintainer-authorized-unconfirmed'}})).toThrow(/rights/);
});
