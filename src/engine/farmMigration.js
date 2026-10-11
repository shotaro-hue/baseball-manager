import { validateFarmTeams } from './farmSelection';
import { nextSeasonMatchHistory } from './matchHistory';
import { regularSeasonProgress } from './seasonProgress';
import { createFarmCompetition } from './farmRecords';
import { validateFarmCompetition,validateFarmPlayerRecords } from './farmRecordValidation';
import { farmChecksum,farmStandings,validateFarmStats,farmCount,farmRecordError as fail } from './farmRecordStats';
import { createFarmSchedule } from './farmSchedule';

export function resolveFarmStartRound(state) {
  const mine=state.teams?.find(t=>t.id===state.myId),progress=regularSeasonProgress(mine);
  if(!progress.valid||!Number.isInteger(state.gameDay)||state.gameDay<1||state.gameDay>144)fail('official progress');
  const completed=progress.playedGames;
  for(const team of state.teams) {
    const p=regularSeasonProgress(team);if(!p.valid||p.playedGames!==completed)fail('official team progress');
  }
  const plan=state.offseasonPlan;
  if(plan&&plan.year===state.year&&plan.myId===state.myId&&plan.stage!=='new_season'&&completed!==143)fail('unfinished official season');
  if(completed===143) {if(state.gameDay<143)fail('finished official position');}
  else if(state.gameDay!==completed+1)fail('official round mismatch');
  for(const map of [state.gameResultsMap,...Object.values(state.allTeamResultsMap||{})]) {
    for(const key of Object.keys(map||{})) {
      const round=Number(key);if(!Number.isInteger(round)||round<1||round>completed)fail('future official result');
    }
  }
  const next=completed+1;
  if(next<=143&&state.schedule) {
    const day=state.schedule[next],matches=day?.matchups?.filter(m=>m.homeId===state.myId||m.awayId===state.myId);
    if(matches?.length!==1||day.isAllStar)fail('official schedule position');
  }
  return next;
}
function captureLegacy(state) {
  const entries=[],seen=new WeakSet();
  const visit=(value,path,teamId=null)=>{
    if(!value||typeof value!=='object'||seen.has(value))return;
    seen.add(value);
    if(value.id!=null&&Object.hasOwn(value,'stats2'))entries.push({playerId:value.id,name:value.name??String(value.id),
      isPitcher:typeof value.isPitcher==='boolean'?value.isPitcher:null,container:path,observedTeamId:teamId,year:null,stats:structuredClone(value.stats2)});
    for(const [key,child] of Object.entries(value))if(key!=='stats2')visit(child,`${path}.${key}`,teamId);
  };
  for(const t of state.teams)for(const bucket of ['players','farm','history'])visit(t[bucket],`teams[${JSON.stringify(t.id)}].${bucket}`,t.id);
  visit(state.faPool,'faPool');visit(state.offseasonPlan,'offseasonPlan');
  return {source:'legacy-estimated',entries};
}
export function migrateFarmCompetition(state) {
  if(state.farmCompetition!=null||Object.hasOwn(state,'farmCompetitionVersion')) {validateFarmSaveState(state);return state;}
  const startRound=resolveFarmStartRound(state),archives=state.seasonHistory?.farmArchives||[];
  if(archives.length)fail('archives without current competition');
  return {...state,farmCompetitionVersion:1,farmCompetition:createFarmCompetition({saveId:state.saveId,year:state.year,teams:state.teams,
    startRound,source:'migrated',legacy:captureLegacy(state)})};
}
export function validateFarmArchive(a,saveId) {
  if(a?.version!==1||a.modelVersion!=='farm-pa-v1'||a.saveId!==saveId||a.nextRound!==144||!Number.isInteger(a.year)||a.year<1
    ||!Number.isInteger(a.startRound)||a.startRound<1||a.startRound>144||a.fullYearEligible!==(a.startRound===1)
    ||!['new','migrated'].includes(a.source)||!Array.isArray(a.teams)||!Array.isArray(a.standings)
    ||a.cards!==undefined||a.usage!==undefined)fail('archive header');
  createFarmSchedule(a.teams.map(t=>({id:t.teamId,league:t.league})),a.year);
  if(a.standings.length!==12)fail('archive standings');
  for(let i=0;i<12;i++) {
    const r=a.standings[i],t=a.teams[i];
    if(r.teamId!==t.teamId||r.league!==t.league||!['scheduled','played','unplayed','W','L','T','RF','RA'].every(k=>farmCount(r[k]))
      ||r.scheduled!==144-a.startRound||r.played+r.unplayed!==r.scheduled||r.W+r.L+r.T!==r.played)fail('archive team counts');
    validateFarmStats(r.batting,'batting');validateFarmStats(r.pitching,'pitching');
    if(r.batting.G!==r.played*9||r.batting.GS!==r.played*9||r.pitching.GS!==r.played||r.batting.R!==r.RF
      ||r.batting.RBI!==r.RF||r.pitching.Rallowed!==r.RA||r.pitching.W!==r.W||r.pitching.L!==r.L)fail('archive stats');
  }
  for(const league of ['セ','パ']) {
    const rows=a.standings.filter(t=>t.league===league),sum=(kind,k)=>rows.reduce((n,r)=>n+r[kind][k],0);
    for(const [b,p] of [['PA','BF'],['H','Hp'],['BB','BBp'],['HBP','HBPp'],['K','Kp'],['HR','HRp'],['R','Rallowed']])if(sum('batting',b)!==sum('pitching',p))fail('archive pairing');
    if(rows.reduce((n,r)=>n+r.W-r.L,0)!==0||rows.reduce((n,r)=>n+r.RF-r.RA,0)!==0)fail('archive wins/runs');
  }
  validateFarmPlayerRecords(a,a.standings);return true;
}
export function validateFarmSaveState(state) {
  const has=Object.hasOwn(state,'farmCompetition'),marked=Object.hasOwn(state,'farmCompetitionVersion');
  if(!has&&!marked) {
    if(state.seasonHistory?.farmArchives?.length)fail('orphan archives');return true;
  }
  if(state.farmCompetitionVersion!==1||!state.farmCompetition)fail('missing competition payload');
  const c=state.farmCompetition;validateFarmCompetition(c);
  validateFarmTeams(state.teams);
  if(state.teams.length!==c.teams.length||c.teams.some(t=>!state.teams.some(x=>x.id===t.teamId&&x.league===t.league)))fail('root team topology');
  if(c.saveId!==state.saveId||c.year!==state.year||c.nextRound!==resolveFarmStartRound(state))fail('root identity/progress');
  const archives=state.seasonHistory?.farmArchives??[];
  if(!Array.isArray(archives)||farmChecksum(archives)!==c.archiveSignature)fail('archive signature');
  const years=new Set();
  for(const a of archives) {validateFarmArchive(a,state.saveId);if(a.year>=state.year||years.has(a.year))fail('archive year');years.add(a.year);}
  return true;
}
// The finished schedule stays on state; the caller supplies the next season separately.
function validateNextSchedule(schedule,teams) {
  if(!Array.isArray(schedule)||schedule.length<144||schedule[0]!==null)fail('missing or incomplete next schedule');
  const teamIds=new Set(teams.map(t=>t.id));
  for(let round=1;round<=143;round++) {
    const day=schedule[round],seen=new Set();
    if(day?.gameNo!==round||day.isAllStar||!Array.isArray(day.matchups)||day.matchups.length!==6)fail('invalid next schedule round');
    for(const match of day.matchups)for(const id of [match?.homeId,match?.awayId]) {
      if(!teamIds.has(id)||seen.has(id))fail('invalid next schedule club');
      seen.add(id);
    }
    if(seen.size!==teamIds.size)fail('incomplete next schedule clubs');
  }
}
export function advanceFarmYear(state,{year,teams,nextSchedule}) {
  validateFarmSaveState(state);
  const c=state.farmCompetition;
  if(!c||c.nextRound!==144||year!==state.year+1)fail('unfinished farm year');
  validateFarmTeams(teams);validateNextSchedule(nextSchedule,teams);
  const archive={version:1,saveId:c.saveId,modelVersion:c.modelVersion,year:c.year,startRound:c.startRound,nextRound:144,
    source:c.source,fullYearEligible:c.startRound===1,teams:structuredClone(c.teams),players:structuredClone(c.players),standings:farmStandings(c)};
  validateFarmArchive(archive,c.saveId);
  const archives=[...(state.seasonHistory?.farmArchives||[]),archive];
  const next={...state,...nextSeasonMatchHistory(state,state.year,state.schedule,state.myId),year,gameDay:1,teams,schedule:nextSchedule,farmCompetitionVersion:1,offseasonPlan:null,gameResultsMap:{},allTeamResultsMap:{},
    seasonHistory:{...state.seasonHistory,farmArchives:archives},
    farmCompetition:createFarmCompetition({saveId:c.saveId,year,teams,legacy:c.legacy,archiveSignature:farmChecksum(archives)})};
  validateFarmSaveState(next);return next;
}
