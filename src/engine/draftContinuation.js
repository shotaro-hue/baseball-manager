import {draftParticipation} from './draftConference';
import {draftReport,ownedDraftCurrent} from './draftReports';
import {evaluateOrganizationNeeds} from './organizationNeeds';
import {ownedPlayers} from './renewalRules';
import {isIkuseiPlayer,evaluateRosterCapacity} from './rosterCapacity';

const roleOf=p=>p.isPitcher ? p.subtype || p.pos : p.pos;
const sameRole=(a,b)=>Boolean(a.isPitcher)===Boolean(b.isPitcher)&&roleOf(a)===roleOf(b);
// One existing report band. Calibration, not a catcher ownership cap.
const UPDATE_MARGIN=10;

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
  const decisions=pool.map(p=>{
    const report=draftReport(context.evaluation,p.id,observer);
    if(!report || !Number.isFinite(report.current)||!Number.isFinite(report.future))return {id:p.id,reason:'evaluation-missing',eligible:false};
    const role=Object.values(organization.roles).find(r=>r.label===roleOf(p));
    const peers=layer.filter(x=>sameRole(x.p,p));
    const minimum=role?.organizationMinimum ?? 1,activeMinimum=role?.activeMinimum ?? 1;
    const currents=peers.map(x=>x.current).filter(Number.isFinite).sort((a,b)=>b-a);
    const currentBaseline=currents[Math.min(activeMinimum,currents.length)-1] ?? 0;
    const futureBaseline=Math.max(0,...peers.filter(x=>(x.p.age || 25)<=24).map(x=>x.future).filter(Number.isFinite));
    const shortage=Math.max(0,minimum-peers.length);
    const reason=shortage>0&&(report.current>=50||report.future>=60) ? 'organization-shortage'
      : report.current>=50&&report.current>=currentBaseline+UPDATE_MARGIN ? 'current-upgrade'
        : (p.age || 25)<=24&&report.future>=60&&report.future>=futureBaseline+UPDATE_MARGIN ? 'future-upgrade' : 'no-upgrade';
    return {id:p.id,eligible:reason!=='no-upgrade',reason,current:report.current,future:report.future,
      currentBaseline,futureBaseline,shortage};
  });
  const viable=new Set(decisions.filter(d=>d.eligible).map(d=>d.id));
  const candidates=pool.filter(p=>viable.has(p.id));
  return {continue:candidates.length>0,reason:candidates.length?'candidate-available':'no-upgrade',candidates,decisions};
}
