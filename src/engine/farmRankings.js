import {selectFarmPlayer,selectFarmTeams} from './farmSelectors';
import {compareFarmIds} from './farmSchedule';

export const FARM_RANKING_METRICS={batting:['AVG','PA','H','HR','RBI','BB','K','R'],pitching:['ERA','outs','G','W','L','Kp','BF','BBp','QS']};
export function selectFarmYears(state={}) {
 return [...new Set([state.farmCompetition?.year,...(state.seasonHistory?.farmArchives||[]).map(a=>a.year)].filter(Number.isInteger))].sort((a,b)=>b-a);
}
export function selectFarmRecord(state={},year=state.year) {
 return state.farmCompetition?.year===year?state.farmCompetition:state.seasonHistory?.farmArchives?.find(a=>a.year===year);
}
const compareValues=(a,b,metric)=>{
 if(a.value===null)return b.value===null?0:1;
 if(b.value===null)return -1;
 // Compare exact fractions, not rounded display strings.
 if(metric==='AVG')return b.stats.H*a.stats.AB-a.stats.H*b.stats.AB;
 if(metric==='ERA')return a.stats.ER*b.stats.outs-b.stats.ER*a.stats.outs;
 return b.value-a.value;
};
export function selectFarmRanking(state={}, {year=state.year,league,teamId,kind='batting',metric=kind==='batting'?'AVG':'ERA',qualifiedOnly=false}={}) {
 const record=selectFarmRecord(state,year),standings=selectFarmTeams(state,{year,league});
 const maxPlayed=Math.max(0,...standings.map(t=>t.played)),minPA=Math.ceil(maxPlayed*3.1);
 const meta={year,startRound:record?.startRound,partial:record?.startRound>1,completed:record?.nextRound===144,
  minPA,maxPlayed,standings,status:record?'measured':'unrecorded'};
 if(!record)return {...meta,rows:[]};
 if(!FARM_RANKING_METRICS[kind]?.includes(metric))throw new Error('unsupported farm ranking metric');
 const rows=record.players.filter(p=>p.isPitcher===(kind==='pitching')).flatMap(p=>{
  const stints=p.teams.filter(t=>(league===undefined||t.league===league)&&(teamId===undefined||t.teamId===teamId));
  if(!stints.length)return [];
  const selected=selectFarmPlayer(state,p.playerId,{year,league,teamId}),stats=selected[kind];
  if(stats.G===0)return [];
  const qualified=kind==='batting'&&maxPlayed>0&&stats.PA>=minPA;
  if(qualifiedOnly&&kind==='batting'&&!qualified)return [];
  return [{...selected,stats,qualified,teamIds:stints.map(t=>t.teamId),
   teamName:stints.map(t=>record.teams.find(x=>x.teamId===t.teamId)?.name??String(t.teamId)).join('／'),
   value:metric==='AVG'?selected.AVG:metric==='ERA'?selected.ERA:stats[metric]}];
 }).sort((a,b)=>compareValues(a,b,metric)||compareFarmIds(a.playerId,b.playerId));
 let rank=null;
 rows.forEach((row,i)=>{if(row.value===null)row.rank=null;else{if(i===0||compareValues(row,rows[i-1],metric)!==0)rank=i+1;row.rank=rank;}});
 return {...meta,rows};
}
export function calcMeasuredFarmAwards(competition,year) {
 const ready=competition?.year===year&&competition.startRound===1&&competition.nextRound===144;
 const partial=competition?.year===year&&competition.startRound>1;
 const status=ready?'complete':partial?'partial':'pending';
 const reason=ready?null:partial?'途中記録のため年間表彰なし':'二軍年間表彰は全round記録後に確定';
 const state={year,farmCompetition:competition};
 const leagueAwards=(league,name)=>{
  const empty={league:name,batting:null,hr:null,wins:null};
  if(!ready)return empty;
  const top=(kind,metric,qualifiedOnly=false)=>{
   const ranking=selectFarmRanking(state,{league,kind,metric,qualifiedOnly});
   const first=ranking.rows[0];
   if(!first||first.value===null||(metric!=='AVG'&&first.value===0))return null;
   const winners=ranking.rows.filter(p=>p.rank===1).map(p=>({playerId:p.playerId,name:p.name,
    teamId:p.teamIds[0],teamIds:p.teamIds,teamName:p.teamName,value:p.value}));
   return {...winners[0],winners};
  };
  return {...empty,minPA:selectFarmRanking(state,{league}).minPA,
   batting:top('batting','AVG',true),hr:top('batting','HR'),wins:top('pitching','W')};
 };
 return {status,reason,year,source:'measured',eastern:leagueAwards('セ','イースタン'),western:leagueAwards('パ','ウエスタン')};
}
