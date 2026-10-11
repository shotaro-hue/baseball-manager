import { BAT_KEYS,PITCH_KEYS,emptyFarmStats,addFarmStats,farmStandings } from './farmRecordStats';
const unknown=legacy=>({status:'unrecorded',batting:null,pitching:null,AVG:null,ERA:null,IP:null,legacy});
export function selectFarmPlayer(state,playerId,{year=state.year,teamId,league}={}) {
  const current=state.farmCompetition,legacy={source:'legacy-estimated',entries:(current?.legacy.entries||[]).filter(e=>e.playerId===playerId)};
  const record=year===current?.year?current:state.seasonHistory?.farmArchives?.find(a=>a.year===year);
  if(!record)return unknown(legacy);
  const player=record.players.find(p=>p.playerId===playerId);
  const live=year===state.year?(state.teams||[]).flatMap(t=>[...(t.players||[]),...(t.farm||[])]).find(p=>p.id===playerId):null;
  if(!player&&!live)return unknown(legacy);
  const isPitcher=player?.isPitcher??live.isPitcher,kind=isPitcher?'pitching':'batting',keys=isPitcher?PITCH_KEYS:BAT_KEYS;
  const stints=(player?.teams||[]).filter(t=>(teamId===undefined||t.teamId===teamId)&&(league===undefined||t.league===league));
  const stats=stints.reduce((sum,t)=>addFarmStats(sum,t[kind],keys),emptyFarmStats(keys));
  return {status:'measured',year,startRound:record.startRound,partial:record.startRound>1,fullYearEligible:record.startRound===1,
    playerId,name:player?.name??live.name,batting:isPitcher?null:stats,pitching:isPitcher?stats:null,
    AVG:!isPitcher&&stats.AB>0?stats.H/stats.AB:null,ERA:isPitcher&&stats.outs>0?stats.ER*27/stats.outs:null,
    IP:isPitcher?`${Math.floor(stats.outs/3)}.${stats.outs%3}`:null,modeledZero:['SF','SH'],unsupported:['SV','HLD'],legacy};
}
export function selectFarmTeams(state,{year=state.year,league}={}) {
  const c=state.farmCompetition,r=year===c?.year?c:state.seasonHistory?.farmArchives?.find(a=>a.year===year);
  if(!r)return [];
  return (r.cards?farmStandings(r):structuredClone(r.standings)).filter(t=>league===undefined||t.league===league);
}
export function selectFarmUsage(c) {
  return Object.fromEntries((c?.usage||[]).map(u=>[String(u.playerId),{...structuredClone(u),outs7:u.recentPitching.reduce((n,r)=>n+r.outs,0)}]));
}
