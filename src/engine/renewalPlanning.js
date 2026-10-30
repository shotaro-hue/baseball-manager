import { contractEmploymentAt } from './contractLedger';
import { employmentContractId } from './seasonContract';
import { MIN_SALARY_SHIHAKA, MIN_SALARY_IKUSEI } from '../constants';
const fail = () => { throw new Error('未更改計画の選手・元契約・年度・予定額を確認してください。'); };
const id = n => (typeof n === 'string' && n.trim()) || (Number.isSafeInteger(n) && n >= 0);
const date = (year, suffix) => `${String(year).padStart(4,'0')}-${suffix}`;
// Retain observed plans as evidence after offers/acceptance; quote only the active
// component. Cancellation therefore restores exactly the same recorded estimate.
export function activeRenewalPlans(spending) {
  const plans=spending.renewalPlans === undefined ? [] : spending.renewalPlans, seen=new Set(), dates=new Map(), active=[];
  if(!Array.isArray(plans))fail();
  const at=d=>{if(!dates.has(d))dates.set(d,contractEmploymentAt(spending.ledger,d));return dates.get(d);};
  for(const p of plans){
    if(!p||![p.teamId,p.playerId,p.sourceContractId,p.basis].every(id)||!Number.isInteger(p.season)||p.season<2||p.season>9999
      ||!Number.isSafeInteger(p.amountManYen)||p.amountManYen<0)fail();
    const key=JSON.stringify([String(p.playerId),p.season]);if(seen.has(key))fail();seen.add(key);
    const source=spending.ledger.records.find(r=>employmentContractId(r.contract)===p.sourceContractId);
    if(!source||source.contract.playerId!==p.playerId||source.contract.endSeason+1!==p.season)fail();
    // The recorded planning club must have held this contract; a later transfer
    // disables its old plan, but must not legitimize an invented club claim.
    if(![source.initialTeamId,...source.changes.filter(a=>a.type==='transfer').map(a=>a.toTeamId)].includes(p.teamId))fail();
    const e=at(date(p.season-1,'11-30')).find(e=>employmentContractId(e.contract)===p.sourceContractId);
    const recordedMinimum=source.contract.registrationType==='development'?MIN_SALARY_IKUSEI:MIN_SALARY_SHIHAKA;
    if(p.amountManYen<recordedMinimum)fail();
    if(p.season<spending.budgetSeason||!e||e.teamId!==p.teamId)continue;
    // In-season new contracts supersede the expiring contract's old estimate.
    const seasonStart=date(p.season,'02-01'),seasonEnd=date(p.season,'11-30');
    const superseded=spending.ledger.records.some(r=>{
      if(r.contract.playerId!==p.playerId||employmentContractId(r.contract)===p.sourceContractId
        ||r.contract.endSeason<p.season||r.effectiveDate>seasonEnd)return false;
      const checkDate=r.effectiveDate>seasonStart?r.effectiveDate:seasonStart;
      return at(checkDate).some(e=>employmentContractId(e.contract)===employmentContractId(r.contract));
    });
    if(superseded)continue;
    if(spending.reservations.some(h=>h.kind==='renewal'&&h.proposal.teamId===p.teamId&&h.proposal.contract.playerId===p.playerId
      &&h.proposal.contract.startSeason<=p.season&&h.proposal.contract.endSeason>=p.season))continue;
    active.push({...p,amountManYen:Math.max(p.amountManYen,e.registrationType==='development'?MIN_SALARY_IKUSEI:MIN_SALARY_SHIHAKA),registrationType:e.registrationType});
  }
  return active;
}
