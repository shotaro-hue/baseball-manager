import {MIN_TOTAL_BY_POS,MIN_SALARY_SHIHAKA} from '../constants';
import {ownedPlayers,renewalEligible} from './renewalRules';
import {evaluateRosterCapacity,isIkuseiPlayer} from './rosterCapacity';
import {ownedDraftCurrent,draftReport} from './draftReports';
import {roleOf,sameRole,roleComparison} from './rosterPlanning';
import {evaluateDraftContinuation} from './draftContinuation';
import {newDraftRules} from './draftConference';

// Two operating teams, plus the established six-catcher organization minimum.
// These are protection floors, never target roster sizes or release quotas.
const activeMinimum=p=>p.isPitcher?({'先発':6,'中継ぎ':3,'抑え':1}[roleOf(p)]??1):p.pos==='捕手'?3:1;
const depthMinimum=p=>Math.max(MIN_TOTAL_BY_POS[roleOf(p)]??0,activeMinimum(p)*2);
const measured=value=>Number.isFinite(value)?value:null;
function usage(p,context){
 const first=measured(p.stats?.[p.isPitcher?'BF':'PA']);
 const record=context.farmCompetition?.year===context.year?context.farmCompetition.players?.find(r=>r.playerId===p.id):null;
 const key=p.isPitcher?'pitching':'batting',field=p.isPitcher?'BF':'PA';
 const farm=record?(record.teams||[]).reduce((n,s)=>n+(s[key]?.[field]||0),0):null;
 return {first,farm};
}

/** Derived before renewals. A release needs both redundant retained depth and
 * a distinct observed rookie upgrade. No candidate, no release. */
export function planCpuRenewals(team,context={}){
 const owned=ownedPlayers(team).filter(p=>!isIkuseiPlayer(p));
 const capacity=evaluateRosterCapacity(team,context),releaseIds=[],replacements=[];
 if(!capacity.ok)return {releaseIds,replacements,decisions:[],rookieReserve:0,reason:'invalid-capacity'};
 const layer=owned.map(p=>({p,current:ownedDraftCurrent(p),future:p.potential,usage:usage(p,context)}));
 const protectedIds=new Set(['lineup','lineupDh','lineupNoDh','rotation'].flatMap(key=>team[key]||[]));
 for(const row of layer){
  const peers=layer.filter(x=>sameRole(x.p,row.p)),minimum=activeMinimum(row.p);
  for(const x of [...peers].sort((a,b)=>b.current-a.current).slice(0,minimum))protectedIds.add(x.p.id);
  // Actual first-team work protects necessary veterans independently of age.
  for(const x of peers.filter(x=>x.usage.first>0).sort((a,b)=>b.usage.first-a.usage.first).slice(0,minimum))protectedIds.add(x.p.id);
 }
 const unavailable=new Set(context.unavailableProspectIds||[]);
 const pool=(context.draftPool||[]).filter(p=>!p._drafted&&!Object.hasOwn(context.drafted||{},p.id)&&!unavailable.has(p.id));
 const candidates=pool.map(p=>({p,...draftReport(context.evaluation,p.id,team.id)}))
  .filter(r=>Number.isFinite(r.current)&&Number.isFinite(r.future));
 const decisions=layer.map(x=>({id:x.p.id,action:'retain',reason:!renewalEligible(x.p,context.year)?'ongoing-contract':protectedIds.has(x.p.id)?'operating-core':'no-accessible-upgrade',
  current:x.current,future:measured(x.future),age:x.p.age,salary:x.p.salary,usage:x.usage}));
 const expiring=layer.filter(x=>renewalEligible(x.p,context.year)&&!protectedIds.has(x.p.id))
  .sort((a,b)=>a.current-b.current||(a.usage.first??0)-(b.usage.first??0)||(a.usage.farm??0)-(b.usage.farm??0)||b.p.salary-a.p.salary);
 let rookieReserve=0;
 for(const row of expiring){
  if(releaseIds.length>=6)break; // Existing maximum planned rookie reservation.
  const remaining=layer.filter(x=>!releaseIds.includes(x.p.id)&&x.p.id!==row.p.id);
  const peers=remaining.filter(x=>sameRole(x.p,row.p));
  const healthy=p=>!(p.injuryDaysLeft>0);
  const healthyBefore=layer.filter(x=>sameRole(x.p,row.p)&&healthy(x.p)).length;
  if(peers.length<depthMinimum(row.p)||peers.filter(x=>healthy(x.p)).length<Math.min(depthMinimum(row.p),healthyBefore))continue;
  const plannedProspects=replacements.map(r=>candidates.find(c=>c.p.id===r.prospectId));
  const comparison=roleComparison([...remaining,...plannedProspects],row.p,activeMinimum(row.p));
  const options=candidates.filter(r=>!unavailable.has(r.p.id)&&sameRole(r.p,row.p)
    &&!(row.p.age<=24&&Number.isFinite(row.future)&&row.future>r.future)
    &&((r.current>=50&&r.current>=row.current+10)
      ||(r.p.age<=24&&r.future>=60&&r.future>=Math.max(row.future??60,comparison.futureBaseline)+10)))
   .sort((a,b)=>(b.current*.65+b.future*.35)-(a.current*.65+a.future*.35));
  const projected={...team,players:(team.players||[]).filter(p=>!releaseIds.includes(p.id)&&p.id!==row.p.id),
    farm:(team.farm||[]).filter(p=>!releaseIds.includes(p.id)&&p.id!==row.p.id)};
  const projectedTeams=(context.teams||[team]).map(t=>t.id===team.id?projected:t);
  const projectedDrafted={...context.drafted,...Object.fromEntries(replacements.map(r=>[r.prospectId,team.id]))};
  const viable=new Set(evaluateDraftContinuation(projected,options.map(r=>r.p),1,plannedProspects.map(r=>r.p),{
    ...context,drafted:projectedDrafted,teams:projectedTeams,rules:newDraftRules()}).candidates.map(p=>p.id));
  const replacement=options.find(r=>viable.has(r.p.id)&&rookieReserve+Math.max(MIN_SALARY_SHIHAKA,r.p.salary||0)<=team.budget);
  if(!replacement)continue;
  const reason=replacement.current>=row.current+10?'rookie-current-upgrade':'rookie-future-upgrade';
  const salary=Math.max(MIN_SALARY_SHIHAKA,replacement.p.salary||0);rookieReserve+=salary;
  releaseIds.push(row.p.id);unavailable.add(replacement.p.id);
  const decision=decisions.find(d=>d.id===row.p.id);
  Object.assign(decision,{action:'release',reason,prospectId:replacement.p.id,prospectCurrent:replacement.current,prospectFuture:replacement.future,
   alternatives:options.length,retainedRoleCount:peers.length,replacementSalary:salary});
  replacements.push({releaseId:row.p.id,prospectId:replacement.p.id,reason,current:replacement.current,future:replacement.future,
   role:roleOf(row.p),salary});
 }
 return {releaseIds,replacements,decisions,rookieReserve,controlledBefore:capacity.controlledCount,
  controlledAfter:capacity.controlledCount-releaseIds.length,reason:releaseIds.length?'observed-rookie-upgrades':'retain-roster'};
}
