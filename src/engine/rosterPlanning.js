import {CPU_FA_BUDGET_RESERVE_RATIO,MIN_SALARY_SHIHAKA,MIN_TOTAL_BY_POS} from '../constants';
import {draftCapacityContext,evaluateRosterCapacity,isIkuseiPlayer,projectRosterCapacity} from './rosterCapacity';
import {draftNominationCount} from './draftConference';
import {ownedPlayers,renewalEligible} from './renewalRules';
import {ownedDraftCurrent,draftReport} from './draftReports';
import {evaluateOrganizationNeeds} from './organizationNeeds';

export const CPU_ROSTER_TARGET=67;
// Spending contingency slots needs two report bands; ordinary draft quality stays one band.
export const CONTINGENCY_UPDATE_MARGIN=20;
export const roleOf=p=>p.isPitcher?p.subtype||p.pos:p.pos;
export const sameRole=(a,b)=>Boolean(a.isPitcher)===Boolean(b.isPitcher)&&roleOf(a)===roleOf(b);
export function roleComparison(layer,player,minimum=1){
 const peers=layer.filter(x=>sameRole(x.p,player));
 const currents=peers.map(x=>x.current).filter(Number.isFinite).sort((a,b)=>b-a);
 const currentBaseline=currents[Math.min(minimum,currents.length)-1]??0;
 const young=peers.filter(x=>(x.p.age??25)<=24).map(x=>x.future).filter(Number.isFinite);
 // No contemporary is not evidence of zero replacement quality. Use the
 // established future floor and the actual role's current first-team level.
 const futureBaseline=young.length?Math.max(...young):Math.max(60,currentBaseline);
 return {currentBaseline,futureBaseline,futureSource:young.length?'young-peers':currents.length?'current-role':'absolute-standard'};
}
export function draftTalentDecision(layer,player,report,organization,manual=false){
 const role=Object.values(organization.roles||{}).find(r=>r.label===roleOf(player));
 const peers=layer.filter(x=>sameRole(x.p,player));
 const comparison=roleComparison(layer,player,role?.activeMinimum??1);
 if(manual){comparison.futureBaseline=Math.max(0,...peers.filter(x=>(x.p.age||25)<=24).map(x=>x.future).filter(Number.isFinite));comparison.futureSource='player-choice';}
 const shortage=Math.max(0,(role?.organizationMinimum??1)-peers.length);
 const reason=shortage>0&&(report.current>=50||report.future>=60)?'organization-shortage'
  :report.current>=50&&report.current>=comparison.currentBaseline+10?'current-upgrade'
   :(player.age||25)<=24&&report.future>=60&&report.future>=comparison.futureBaseline+10?'future-upgrade':'no-upgrade';
 return {...comparison,shortage,reason};
}
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
 const acceptedReserve=capacity.acceptedPicks.reduce((n,p)=>n+rookieSalary(p),0);
 let draftOpportunities=context.rosterPlan?.draftOpportunities;
 if(context.phase==='offseason'&&context.cpuOpportunityPlanning===1){
  const owned=ownedPlayers(team).filter(p=>!isIkuseiPlayer(p));
  const layer=[...owned.map(p=>({p,current:ownedDraftCurrent(p),future:p.potential})),
    ...capacity.acceptedPicks.map(p=>({p,...draftReport(context.evaluation,p.id,team.id)}))];
  const organization=evaluateOrganizationNeeds(team,context);
  const basePlan={...capacity,draftRemaining:0,rookieReserve:acceptedReserve};
  const seen=new Set([...ownedPlayers(team),...capacity.acceptedPicks].map(p=>p.id));
  const confirmed=new Set(Object.values(context.confirmedPicks||{}).map(p=>String(p?.id??p)));
  const planned=draftOpportunities&&new Set(draftOpportunities.map(p=>p.id));
  const ranked=(context.draftPool||[]).filter(p=>(!planned||planned.has(p.id))&&!p._drafted&&!Object.hasOwn(context.drafted||{},p.id)&&!confirmed.has(String(p.id))&&!seen.has(p.id)&&seen.add(p.id))
   .map(p=>({p,...draftReport(context.evaluation,p.id,team.id)}))
   .filter(r=>Number.isFinite(r.current)&&Number.isFinite(r.future))
   .sort((a,b)=>prospectValue(b.p,b)-prospectValue(a.p,a));
  draftOpportunities=[];
  for(const r of ranked){
   if(draftOpportunities.length>=Math.min(6,capacity.remainingSlots))break;
   if(draftTalentDecision(layer,r.p,r,organization).reason==='no-upgrade'
    ||!assessCpuAddition(team,r.p,{...context,phase:'draft',cpuPlan:basePlan,report:r,layer,organization}).eligible)continue;
   draftOpportunities.push({id:r.p.id,age:r.p.age,current:r.current,future:r.future,salary:rookieSalary(r.p),role:roleOf(r.p)});
   layer.push(r);basePlan.acceptedPicks=[...basePlan.acceptedPicks,r.p];basePlan.acceptedPickCount++;
   basePlan.remainingSlots--;basePlan.rookieReserve+=rookieSalary(r.p);
  }
 }
 const requested=context.phase==='draft'||context.phase==='season'?0
  :context.rosterPlan?.draftRemaining??draftOpportunities?.length??Math.min(6,Math.max(0,CPU_ROSTER_TARGET-capacity.controlledCount-capacity.acceptedPickCount));
 const draftRemaining=Math.min(requested,draftOpportunities?.length??requested,capacity.remainingSlots);
 const opportunities=draftOpportunities?.slice(0,draftRemaining);
 return {...capacity,draftRemaining,...(opportunities?{draftOpportunities:opportunities}:{}),
  rookieReserve:acceptedReserve+(opportunities?opportunities.reduce((n,p)=>n+p.salary,0):draftRemaining*MIN_SALARY_SHIHAKA)};
}
const prospectValue=(p,report)=>(p.age??25)<=24?Math.max(report.current,report.current*.65+report.future*.35):report.current;

/** A planning guard, not a replacement for ranking or transaction validation. */
export function assessCpuAddition(team,player,context={}){
 const plan=context.cpuPlan??cpuRosterPlan(team,context);let draftRemaining=plan.draftRemaining;
 let comparison={};
 const displaced=()=>Math.max(0,plan.draftRemaining-draftRemaining);
 const result=(eligible,reason,projectedCount)=>({eligible,reason,projectedCount,draftRemaining,displacedDraftSlots:displaced(),...comparison});
 if(!plan.ok)return result(false,'invalid-capacity',null);
 const development=context.phase!=='draft'&&isIkuseiPlayer(player);
 draftRemaining=Math.min(plan.draftRemaining,Math.max(0,plan.remainingSlots-Number(!development)));
 const projectedCount=plan.controlledCount+plan.acceptedPickCount+Number(!development)+draftRemaining;
 if(!development&&plan.remainingSlots<=0)return result(false,'roster-full',projectedCount);
 if(context.manual)return result(true,'player-choice',projectedCount);
 const salary=context.salary??rookieSalary(player);
 const budgetReserve=context.phase==='draft'?0:team.budget*CPU_FA_BUDGET_RESERVE_RATIO;
 if(!Number.isFinite(team.budget)||!Number.isFinite(salary)||salary<0)return result(false,'budget-missing',projectedCount);
 const lostOpportunities=plan.draftOpportunities?.slice(draftRemaining)||[];
 const releasedReserve=plan.draftOpportunities?lostOpportunities.reduce((n,p)=>n+p.salary,0):displaced()*MIN_SALARY_SHIHAKA;
 if(plan.rookieReserve-releasedReserve+salary+budgetReserve>team.budget)return result(false,'rookie-budget',projectedCount);
 if(development)return result(true,'development-contract',projectedCount);
 const owned=ownedPlayers(team).filter(p=>!isIkuseiPlayer(p));
 const isCatcher=p=>!p.isPitcher&&p.pos==='捕手';
 const catcherGap=Math.max(0,MIN_TOTAL_BY_POS['捕手']-[...owned,...plan.acceptedPicks].filter(isCatcher).length);
 // Keep the last real slots available for an existing catcher-depth deficit.
 // Accepted picks cover the reservation; refused/development ownership does not.
 if(!isCatcher(player)&&catcherGap>0&&plan.remainingSlots<=catcherGap)return result(false,'catcher-reserve',projectedCount);
 if(projectedCount<=CPU_ROSTER_TARGET)return result(true,'normal-target',projectedCount);
 if(isCatcher(player)&&catcherGap>0)return result(true,'catcher-depth-shortage',projectedCount);
 const organization=context.organization??evaluateOrganizationNeeds(team,context);
 const role=organization.ok?Object.values(organization.roles).find(r=>r.label===roleOf(player)):null;
 const operating=owned.filter(p=>sameRole(p,player)&&!(p.injuryDaysLeft>0)&&!(p.registrationCooldownDays>0));
 const committed=plan.acceptedPicks.filter(p=>sameRole(p,player)).length;
 if(operating.length+committed<(role?.activeMinimum??1))return result(true,'operating-shortage',projectedCount);
 const observer=context.publicEvaluation?null:team.id;
 const layer=context.layer??[...owned.map(p=>({p,current:ownedDraftCurrent(p),future:p.potential})),
  ...plan.acceptedPicks.map(p=>({p,...draftReport(context.evaluation,p.id,observer)}))];
 comparison=roleComparison(layer,player,role?.activeMinimum??1);
 const baseline=comparison.currentBaseline;
 const report=context.report??{current:ownedDraftCurrent(player),future:player.potential};
 const opportunityValue=lostOpportunities.length?Math.max(...lostOpportunities.map(p=>prospectValue(p,p))):null;
 const mayDisplace=()=>{
  comparison={...comparison,opportunityValue,additionValue:prospectValue(player,report),lostProspectIds:lostOpportunities.map(p=>p.id)};
  return opportunityValue==null||prospectValue(player,report)>opportunityValue;
 };
 if(report.current>=50&&report.current>=baseline+CONTINGENCY_UPDATE_MARGIN)
  return mayDisplace()?result(true,'current-upgrade',projectedCount):result(false,'draft-opportunity',projectedCount);
 const future=comparison.futureBaseline;
 if((player.age||25)<=24&&report.future>=60&&report.future>=future+CONTINGENCY_UPDATE_MARGIN)
  return mayDisplace()?result(true,'future-upgrade',projectedCount):result(false,'draft-opportunity',projectedCount);
 return result(false,'normal-target',projectedCount);
}
