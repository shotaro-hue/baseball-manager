import assert from 'node:assert/strict';
import {ownedPlayers} from '../src/engine/renewalRules';
import {hasRecordedFirstTeamSeason} from '../src/engine/seasonParticipants';
import {getCareerEntryKey} from '../src/engine/careerStats';

// The game archives active players (including measured zero) and demoted
// first-team participants. Farm-only competition belongs in farmArchives.
export function recordCareerExpectations(expected,team,year){
 const active=new Set((team.players||[]).map(p=>p.id));
 for(const p of ownedPlayers(team)){
  if(!active.has(p.id)&&!hasRecordedFirstTeamSeason(p)&&!hasRecordedFirstTeamSeason({stats:p.playoffStats}))continue;
  if(!expected.has(p.id))expected.set(p.id,new Set());
  expected.get(p.id).add(year);
 }
}
export async function verifyCareerExpectations(ids,expected,load,firstYear,years){
 const result=[];
 for(const id of ids){
  const career=await load(id);
  const expectedYears=[...(expected.get(id)||[])].filter(y=>y>=firstYear&&y<firstYear+years).sort((a,b)=>a-b);
  const recordedYears=[...new Set(career.filter(r=>r.year>=firstYear&&r.year<firstYear+years).map(r=>r.year))].sort((a,b)=>a-b);
  assert.deepEqual(recordedYears,expectedYears,`${id}: persisted first-team years`);
  assert.equal(new Set(career.map(getCareerEntryKey)).size,career.length,`${id}: duplicate career keys`);
  result.push({id,expectedYears,recordedYears});
 }
 return result;
}
