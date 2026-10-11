import {simulateFarmRound} from './farmGame';
import {applyFarmRound} from './farmRecords';
import {selectFarmUsage} from './farmSelectors';
import {clamp} from '../utils';

// Call only after pregame ownership is fixed and before any lifecycle updates.
export function prepareFarmProgress(state,teams,round) {
 if(!state.farmCompetition)return null;
 if(state.farmCompetition.year!==state.year||state.farmCompetition.nextRound!==round)throw Error('farm round conflict');
 const result=simulateFarmRound({teams,saveId:state.saveId,year:state.year,round,usage:selectFarmUsage(state.farmCompetition)});
 return {competition:applyFarmRound(state.farmCompetition,result,teams),
  workload:result.games.filter(g=>g.status==='played').flatMap(g=>g.game.workload),
  pregameIds:teams.flatMap(t=>t.farm.map(p=>p.id))};
}
// Main lifecycle owns injuries/cooldowns. Apply farm rest/load once by stable ID,
// even if postgame emergency maintenance has promoted the player meanwhile.
export function finishFarmProgress(teams,progress,round) {
 if(!progress)return teams;
 const ids=new Set(progress.pregameIds),loads=new Map(progress.workload.map(x=>[x.playerId,x]));
 const update=p=>{
  if(!ids.has(p.id))return p;
  const load=loads.get(p.id),condition=p.condition??100;
  if(p.isPitcher) {
   const recent=(p.recentPitchingDays||[]).filter(d=>Number.isInteger(d)&&d>round-7&&d<round);
   if(!load?.BF)return {...p,condition:Math.min(100,condition+Math.round(8+((p.pitching?.recovery??50)-50)/10)),recentPitchingDays:recent};
   const days=[...recent,round];let consecutive=1;while(days.includes(round-consecutive))consecutive++;
   const penalty=consecutive>=3?15:consecutive>=2?5:0;
   return {...p,condition:clamp(condition-clamp(Math.ceil(load.BF/2),5,40)-penalty,20,100),recentPitchingDays:days,lastPitched:true};
  }
  return {...p,condition:load?.PA?clamp(condition-clamp(load.PA,1,5),20,100):Math.min(100,condition+6)};
 };
 return teams.map(t=>({...t,players:t.players.map(update),farm:t.farm.map(update)}));
}
