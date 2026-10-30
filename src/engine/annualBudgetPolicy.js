import { toAnnualState } from './contractEconomy';
import { validateContractLedger } from './contractLedger';

const fail = () => { throw new Error('年度予算の根拠・係数・全審査年度を確認してください。'); };
const year = n => Number.isInteger(n) && n >= 1 && n <= 9999;
const money = n => Number.isSafeInteger(n) && n >= 0;
const id = n => (typeof n === 'string' && n.trim()) || (Number.isSafeInteger(n) && n >= 0);
const key = (team, season) => JSON.stringify([team, season]);
const kind = 'annual-budget-approval';
export function annualBudgetHorizon(spending) {
  if (!year(spending?.budgetSeason)) fail();
  validateContractLedger(spending.ledger);
  if (!Array.isArray(spending.reservations)) fail();
  const ends = [...spending.ledger.records.map(r => r.contract.endSeason), ...spending.reservations.map(h => h.proposal?.contract?.endSeason)];
  if (!ends.every(year)) fail();
  const end = Math.max(spending.budgetSeason + 7, ...ends);
  if (!year(end)) fail();
  return end;
}
function approval(input, policy, precedingApproved) {
  const { allocationPercent, smoothingYears, maxChangePercent } = policy;
  if (!id(policy.policyVersion) || ![allocationPercent, maxChangePercent].every(n => Number.isInteger(n) && n >= 0 && n <= 100)
    || !Number.isInteger(smoothingYears) || smoothingYears < 1 || smoothingYears > 3
    || !['profile', 'observed'].includes(input.source) || !Array.isArray(input.operatingSurplusesManYen)
    || input.operatingSurplusesManYen.length !== smoothingYears || !input.operatingSurplusesManYen.every(Number.isSafeInteger)
    || !money(input.supportManYen) || !(input.previousApprovedManYen === null || money(input.previousApprovedManYen))
    || (precedingApproved !== undefined && input.previousApprovedManYen !== null
      && input.previousApprovedManYen !== precedingApproved)) fail();
  // Future null baselines inherit the immediately preceding forecast.
  const effectivePrevious=precedingApproved === undefined ? input.previousApprovedManYen : precedingApproved;
  const total = input.operatingSurplusesManYen.reduce((a,n)=>a+BigInt(n),0n);
  let amount = (total > 0n ? total : 0n) * BigInt(allocationPercent) / BigInt(100 * smoothingYears) + BigInt(input.supportManYen);
  if (effectivePrevious !== null) {
    const prior=BigInt(effectivePrevious), lower=(prior*BigInt(100-maxChangePercent)+99n)/100n, upper=prior*BigInt(100+maxChangePercent)/100n;
    amount = amount < lower ? lower : amount > upper ? upper : amount;
  }
  if (amount > BigInt(Number.MAX_SAFE_INTEGER)) fail();
  return Number(amount);
}
// Pure quote only. Boundary receipts/publication are owned by annual rollover.
// Inputs are explicit payroll-before estimates; no legacy cash/budget fallback.
export function quoteAnnualBudgetPolicy(world, policy) {
  const e=world?.contractEconomy, spending=e?.engine?.spending;
  if (e?.mode !== 'annual' || !Array.isArray(world.teams) || !world.teams.length
    || !year(world.year) || world.year !== e.clock?.season
    || spending?.budgetSeason !== world.year + Number(e.clock?.phase === 'offseason') || !Array.isArray(policy?.forecasts)) fail();
  toAnnualState(world); // Validate the complete input; quoting never repairs an invalid world.
  const end=annualBudgetHorizon(spending), teams=new Map(), typed=new Set();
  for (const t of world.teams) { if(!id(t.id)||typed.has(String(t.id)))fail(); typed.add(String(t.id)); teams.set(t.id,t); }
  const forecasts=new Map();
  for(const f of policy.forecasts){
    if(!f||!teams.has(f.teamId)||!year(f.season)||f.season<spending.budgetSeason||f.season>end||forecasts.has(key(f.teamId,f.season)))fail();
    forecasts.set(key(f.teamId,f.season),f);
  }
  const authorizations=[],budgetPolicies=[],rosterRequirements=[];
  for(const teamId of teams.keys()){
    let precedingApproved;
    for(let season=spending.budgetSeason;season<=end;season++){
      const f=forecasts.get(key(teamId,season));if(!f)fail();
      const approvedManYen=approval(f,policy,precedingApproved), pair={teamId,season};
      precedingApproved=approvedManYen;
    authorizations.push({...pair,approvedManYen,minimumRosterReserveManYen:0});
    rosterRequirements.push({...pair,requiredControlledCount:65});
    budgetPolicies.push({...pair,kind,policyVersion:policy.policyVersion,inputsRecorded:true,
      source:f.source,operatingSurplusesManYen:[...f.operatingSurplusesManYen],supportManYen:f.supportManYen,
      previousApprovedManYen:f.previousApprovedManYen,allocationPercent:policy.allocationPercent,smoothingYears:policy.smoothingYears,
      maxChangePercent:policy.maxChangePercent,approvedManYen,reason:'payroll-before-estimate; future approval is a planning forecast'});
    }
  }
  return {authorizations,budgetPolicies,rosterRequirements};
}
export function inspectAnnualBudgetCoverage(world) {
  const e=world.contractEconomy;
  if(!e.budgetPolicies.some(p=>p?.kind===kind))return; // Earlier explicit fixture policies remain supported.
  const s=e.engine.spending,end=annualBudgetHorizon(s), teams=new Set(world.teams.map(t=>t.id));
  for(const p of e.budgetPolicies)if(!teams.has(p.teamId)||p.kind!==kind||p.inputsRecorded!==true)fail();
  for(const teamId of teams){
    // Retained historical rows also prove the earlier budget in future years.
    const policies=e.budgetPolicies.filter(p=>p.teamId===teamId).sort((a,b)=>a.season-b.season);
    let precedingApproved,precedingSeason;
    for(const p of policies){
      const previous=precedingSeason===p.season-1?precedingApproved:undefined;
      if(!year(p.season)||p.approvedManYen!==approval(p,p,previous))fail();
      precedingApproved=p.approvedManYen;precedingSeason=p.season;
    }
    for(let season=s.budgetSeason;season<=end;season++){
      for(const list of [e.budgetPolicies,s.authorizations,e.engine.rosterRequirements])
        if(list.filter(r=>r.teamId===teamId&&r.season===season).length!==1)fail();
    }
  }
}
