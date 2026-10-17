import {ownedPlayers} from '../src/engine/renewalRules';
import {controlledRosterCounts,isIkuseiPlayer} from '../src/engine/rosterCapacity';

const marketReasons=new Set(['fa','waiver_fa','foreign_fa','FA獲得','戦力外獲得','外国人獲得']);
const measured=value=>Number.isFinite(value)?value:null;

// Diagnostics only: preserve IDs and missing measurements, never mutate players.
export function rosterRows(state,rookieIds=new Set()) {
 const farm=new Map((state.farmCompetition?.players||[]).map(p=>[p.playerId,p]));
 return state.teams.map(team=>{
  const owned=ownedPlayers(team),counts=controlledRosterCounts(team);
  const active=new Set((team.players||[]).map(p=>p.id));
  const playerUsage=owned.map(p=>{
   const record=farm.get(p.id),stints=record?.teams.filter(t=>t.teamId===team.id)||[];
   const sum=(kind,key)=>stints.reduce((n,t)=>n+(t[kind]?.[key]||0),0);
   return {id:p.id,age:p.age,pos:p.pos,isPitcher:Boolean(p.isPitcher),development:isIkuseiPlayer(p),
    roster:active.has(p.id)?'active':'farm',rookie:rookieIds.has(p.id),serviceYears:p.serviceYears??null,
    salary:p.salary,potential:p.potential,current:p.batting?.catching??null,
    PA:measured(p.stats?.PA),BF:measured(p.stats?.BF),IP:measured(p.stats?.IP),
    farmRecorded:stints.length>0,farmPA:sum('batting','PA'),farmBF:sum('pitching','BF'),farmOuts:sum('pitching','outs')};
  });
  return {id:team.id,controlled:counts.controlledCount,development:counts.developmentCount,
   pitchers:owned.filter(p=>p.isPitcher&&!isIkuseiPlayer(p)).length,
   catchers:owned.filter(p=>!p.isPitcher&&p.pos==='捕手').length,budget:team.budget,
   payroll:owned.reduce((n,p)=>n+p.salary,0),ageMean:owned.length?owned.reduce((n,p)=>n+p.age,0)/owned.length:null,
   playerUsage,catcherUsage:playerUsage.filter(p=>!p.isPitcher&&p.pos==='捕手'),
   marketClaims:(team.history||[]).filter(p=>p.exitYear===state.year&&marketReasons.has(p.exitReason))
    .map(p=>({id:p.id,pos:p.pos,salary:p.salary,reason:p.rosterDecision??null}))};
 });
}

export function rosterTransitions(before,after,state,phase) {
 const earlier=new Map(before.flatMap(t=>t.playerUsage.map(p=>[p.id,{...p,teamId:t.id}])));
 const later=new Map(after.flatMap(t=>t.playerUsage.map(p=>[p.id,{...p,teamId:t.id}])));
 const events=[];
 for(const rows of after) {
  const team=state.teams.find(t=>t.id===rows.id);
  const reasonFor=id=>[...(team.history||[])].reverse().find(p=>p.id===id&&p.exitYear===state.year)?.exitReason
   ??state.faPool?.find(p=>p.id===id&&p.faOriginTeamId===team.id)?.departureReason??null;
  const event=(p,type,extra={})=>events.push({year:state.year,phase,teamId:team.id,id:p.id,pos:p.pos,age:p.age,type,...extra});
  for(const p of before.find(t=>t.id===team.id)?.playerUsage||[])if(later.get(p.id)?.teamId!==team.id)
   event(p,'departure',{reason:reasonFor(p.id),toTeamId:later.get(p.id)?.teamId??null});
  for(const p of rows.playerUsage) {
   const previous=earlier.get(p.id);
   if(previous?.teamId!==team.id)event(p,'arrival',{reason:reasonFor(p.id),fromTeamId:previous?.teamId??null});
   else if(previous.development&&!p.development)event(p,'conversion');
  }
 }
 return events;
}
