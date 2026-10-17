import {CPU_FA_BUDGET_RESERVE_RATIO,MIN_SALARY_SHIHAKA} from '../constants';
import {draftCapacityContext,evaluateRosterCapacity,isIkuseiPlayer,projectRosterCapacity} from './rosterCapacity';
import {draftNominationCount} from './draftConference';
import {ownedPlayers,renewalEligible} from './renewalRules';
import {ownedDraftCurrent,draftReport} from './draftReports';
import {evaluateOrganizationNeeds} from './organizationNeeds';

export const CPU_ROSTER_TARGET=67;
// Spending contingency slots needs two report bands; ordinary draft quality stays one band.
const CONTINGENCY_UPDATE_MARGIN=20;
const roleOf=p=>p.isPitcher?p.subtype||p.pos:p.pos;
const sameRole=(a,b)=>Boolean(a.isPitcher)===Boolean(b.isPitcher)&&roleOf(a)===roleOf(b);
const rookieSalary=p=>Math.max(MIN_SALARY_SHIHAKA,Number.isFinite(p.salary)?p.salary:MIN_SALARY_SHIHAKA);
const marketIds=(team,year)=>[...new Set((team.history||[]).filter(p=>p.exitYear===year
  &&['fa','waiver_fa','foreign_fa'].includes(p.exitReason)&&!isIkuseiPlayer(p)).map(p=>p.id))];

export function newReinforcementPlan(team,year){
 const capacity=evaluateRosterCapacity(team);
 return {version:1,draftGoal:capacity.ok?Math.min(6,Math.max(0,CPU_ROSTER_TARGET-capacity.controlledCount)):0,
  faGoal:0,conversionIds:[],baselineFaIds:marketIds(team,year)};
}
export function reinforcementProjection(team,plan,year,teams=[team]){
 const context=draftCapacityContext(plan,year,teams),goals=plan?.year===year?plan.reinforcements:null;
 const releaseIds=ownedPlayers(team).filter(p=>renewalEligible(p,year)&&(plan?.intents||[]).some(i=>i.id===p.id&&i.value==='release')).map(p=>p.id);
 if(!goals)return {...projectRosterCapacity(team,{releaseIds},context),recorded:false,draftRemaining:null,faRemaining:null,conversionRemaining:null};
 if(goals.version!==1||!Number.isInteger(goals.draftGoal)||goals.draftGoal<0||goals.draftGoal>10
  ||!Number.isInteger(goals.faGoal)||goals.faGoal<0||goals.faGoal>70||!Array.isArray(goals.conversionIds)||!Array.isArray(goals.baselineFaIds))
  return {ok:false,recorded:true,reason:'invalid-plan'};
 const baseline=new Set(goals.baselineFaIds.map(String));
 const faRemaining=Math.max(0,goals.faGoal-marketIds(team,year).filter(id=>!baseline.has(String(id))).length);
 const draftRemaining=Math.max(0,goals.draftGoal-draftNominationCount(team.id,context.draftPool,context.drafted,plan?.draftViews?.draft?.log,context.confirmedPicks));
 const conversionIds=[...new Set(goals.conversionIds)].filter(id=>ownedPlayers(team).some(p=>p.id===id&&isIkuseiPlayer(p))&&!releaseIds.includes(id));
 return {...projectRosterCapacity(team,{releaseIds,draftRemaining,faRemaining,conversionIds},context),recorded:true,draftRemaining,faRemaining,
  conversionRemaining:conversionIds.length,conversionIds};
}

export function cpuRosterPlan(team,context={}){
 const capacity=evaluateRosterCapacity(team,context);
 if(!capacity.ok)return {...capacity,draftRemaining:0,rookieReserve:null};
 const requested=context.phase==='draft'||context.phase==='season'?0
  :context.rosterPlan?.draftRemaining??Math.min(6,Math.max(0,CPU_ROSTER_TARGET-capacity.controlledCount-capacity.acceptedPickCount));
 const draftRemaining=Math.min(requested,capacity.remainingSlots);
 return {...capacity,draftRemaining,rookieReserve:capacity.acceptedPicks.reduce((n,p)=>n+rookieSalary(p),0)+draftRemaining*MIN_SALARY_SHIHAKA};
}

/** A planning guard, not a replacement for ranking or transaction validation. */
export function assessCpuAddition(team,player,context={}){
 const plan=context.cpuPlan??cpuRosterPlan(team,context);let draftRemaining=plan.draftRemaining;
 const result=(eligible,reason,projectedCount)=>({eligible,reason,projectedCount,draftRemaining});
 if(!plan.ok)return result(false,'invalid-capacity',null);
 const development=context.phase!=='draft'&&isIkuseiPlayer(player);
 draftRemaining=Math.min(plan.draftRemaining,Math.max(0,plan.remainingSlots-Number(!development)));
 const projectedCount=plan.controlledCount+plan.acceptedPickCount+Number(!development)+draftRemaining;
 if(!development&&plan.remainingSlots<=0)return result(false,'roster-full',projectedCount);
 if(context.manual)return result(true,'player-choice',projectedCount);
 const salary=context.salary??rookieSalary(player);
 const budgetReserve=context.phase==='draft'?0:team.budget*CPU_FA_BUDGET_RESERVE_RATIO;
 if(!Number.isFinite(team.budget)||!Number.isFinite(salary)||salary<0)return result(false,'budget-missing',projectedCount);
 if(plan.rookieReserve-(plan.draftRemaining-draftRemaining)*MIN_SALARY_SHIHAKA+salary+budgetReserve>team.budget)return result(false,'rookie-budget',projectedCount);
 if(development)return result(true,'development-contract',projectedCount);
 if(projectedCount<=CPU_ROSTER_TARGET)return result(true,'normal-target',projectedCount);
 const organization=context.organization??evaluateOrganizationNeeds(team,context);
 const role=organization.ok?Object.values(organization.roles).find(r=>r.label===roleOf(player)):null;
 const owned=ownedPlayers(team).filter(p=>!isIkuseiPlayer(p));
 const operating=owned.filter(p=>sameRole(p,player)&&!(p.injuryDaysLeft>0)&&!(p.registrationCooldownDays>0));
 const committed=plan.acceptedPicks.filter(p=>sameRole(p,player)).length;
 if(operating.length+committed<(role?.activeMinimum??1))return result(true,'operating-shortage',projectedCount);
 const observer=context.publicEvaluation?null:team.id;
 const layer=context.layer??[...owned.map(p=>({p,current:ownedDraftCurrent(p),future:p.potential})),
  ...plan.acceptedPicks.map(p=>({p,...draftReport(context.evaluation,p.id,observer)}))];
 const peers=layer.filter(x=>sameRole(x.p,player)),minimum=role?.activeMinimum??1;
 const currents=peers.map(x=>x.current).filter(Number.isFinite).sort((a,b)=>b-a);
 const baseline=currents[Math.min(minimum,currents.length)-1]??0;
 const report=context.report??{current:ownedDraftCurrent(player),future:player.potential};
 if(report.current>=50&&report.current>=baseline+CONTINGENCY_UPDATE_MARGIN)return result(true,'current-upgrade',projectedCount);
 const future=Math.max(0,...peers.filter(x=>(x.p.age||25)<=24).map(x=>x.future).filter(Number.isFinite));
 if((player.age||25)<=24&&report.future>=60&&report.future>=future+CONTINGENCY_UPDATE_MARGIN)return result(true,'future-upgrade',projectedCount);
 return result(false,'normal-target',projectedCount);
}
