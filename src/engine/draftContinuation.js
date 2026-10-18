import {assessCpuAddition,cpuRosterPlan,draftTalentDecision} from './rosterPlanning';
import {draftParticipation} from './draftConference';
import {draftReport,ownedDraftCurrent} from './draftReports';
import {evaluateOrganizationNeeds} from './organizationNeeds';
import {ownedPlayers} from './renewalRules';
import {isIkuseiPlayer,evaluateRosterCapacity} from './rosterCapacity';

export function evaluateDraftContinuation(team,pool,round=1,acceptedPicks=[],context={}) {
  const draftPool=context.draftPool ?? [...acceptedPicks,...pool];
  const drafted=context.drafted ?? Object.fromEntries(acceptedPicks.map(p=>[p.id,team.id]));
  const participation=draftParticipation(team,draftPool,drafted,context);
  const stop=reason=>({continue:false,reason,candidates:[],decisions:[]});
  if(!participation.eligible)return stop(participation.reason);
  const organization=evaluateOrganizationNeeds(team,{...context,draftPool,drafted});
  if(!organization.ok)return stop('invalid-capacity');
  const observer=context.publicEvaluation?null:team.id;
  const owned=ownedPlayers(team).filter(p=>!isIkuseiPlayer(p)).map(p=>({p,current:ownedDraftCurrent(p),future:p.potential}));
  const additions=evaluateRosterCapacity(team,{...context,draftPool,drafted}).acceptedPicks
    .map(p=>({p,...draftReport(context.evaluation,p.id,observer)}));
  const layer=[...owned,...additions];
  const cpuPlan=cpuRosterPlan(team,{...context,draftPool,drafted,phase:'draft'});
  const decisions=pool.map(p=>{
    const report=draftReport(context.evaluation,p.id,observer);
    if(!report || !Number.isFinite(report.current)||!Number.isFinite(report.future))return {id:p.id,reason:'evaluation-missing',eligible:false};
    const manual=String(team.id)===String(context.myId??context.evaluation?.myId);
    const talent=draftTalentDecision(layer,p,report,organization,manual);
    const {reason,currentBaseline,futureBaseline,shortage,futureSource}=talent;
    const rosterDecision=assessCpuAddition(team,p,{...context,draftPool,drafted,phase:'draft',report,layer,cpuPlan,organization,
      manual});
    return {id:p.id,talentEligible:reason!=='no-upgrade',eligible:reason!=='no-upgrade'&&rosterDecision.eligible,reason:reason==='no-upgrade'||rosterDecision.eligible?reason:rosterDecision.reason,
      rosterReason:rosterDecision.reason,projectedCount:rosterDecision.projectedCount,current:report.current,future:report.future,
      currentBaseline,futureBaseline,futureSource,shortage};
  });
  const viable=new Set(decisions.filter(d=>d.eligible).map(d=>d.id));
  const candidates=pool.filter(p=>viable.has(p.id));
  return {continue:candidates.length>0,reason:candidates.length?'candidate-available':decisions.find(d=>d.talentEligible&&!d.eligible)?.rosterReason||'no-upgrade',candidates,decisions};
}
