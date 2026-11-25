import { activeRenewalPlans } from './renewalPlanning';
import { quoteAnnualSpendingPlan } from './annualSpending';
import { MIN_SALARY_SHIHAKA } from '../constants';
import { CPU_RENEWAL_ROUNDS, CPU_TEAM_ROUND2_GAP_CLOSE } from '../constants';
import { calcPlayerDemand, evaluateRenewalOffer, getFaProgress } from './contract';
import { planCpuRenewals } from './cpuRosterCycle';
import { ownedPlayers, isIkuseiPlayer, ikuseiContractYears } from './renewalRules';
import { renewalSalaryFloor } from './salaryDemand';
import { createSeasonContract, employmentContractId } from './seasonContract';
import { contractEmploymentAt } from './contractLedger';
import { yearEndGrowthId, requiresYearEndGrowth } from './annualYearEndGrowth';
import { postingPhaseId } from './annualPostingPhase';
import { postingApplicationViews } from './annualPostingApplications';

const stable = v => JSON.stringify(v, (_, x) => x && !Array.isArray(x) && typeof x === 'object'
  ? Object.fromEntries(Object.keys(x).sort().map(k => [k, x[k]])) : x);
const fail = message => { throw Error(message ?? 'CPU契約整理の対象・契約・市場・確定証跡を確認してください。'); };
const id = v => typeof v === 'string' && v.trim().length > 0 || Number.isSafeInteger(v) && v >= 0;
const order = (a,b) => stable(a).localeCompare(stable(b));
export const cpuContractsId = season => JSON.stringify(['cpu-contracts',season]);
const childId = (parent, player, suffix) => JSON.stringify(['cpu-contract-child',parent,player,suffix]);
export const isCpuContractsCommand = c => c?.type === 'prepare-cpu-contracts';
export function normalizeCpuContracts(c) {
  if (!isCpuContractsCommand(c) || Object.keys(c).sort().join(',') !== 'humanTeamId,id,type' || !id(c.id) || !id(c.humanTeamId)) fail();
  return {id:c.id,type:c.type,humanTeamId:c.humanTeamId};
}
export function cpuContractsRequest(world) {
  return {saveId:world.saveId,epoch:world.contractEconomy?.epoch,baseRevision:world.contractEconomy?.revision,
    transaction:{id:cpuContractsId(world.year),type:'prepare-cpu-contracts',humanTeamId:world.myId}};
}
// Native growth must not make CPU renewals pre-empt existing posting wishes.
// Older annual saves with no native opening/growth retain explicit opt-in use.
export function cpuContractsIssue(world) {
  const e=world.contractEconomy;
  if(e?.mode!=='annual'||e.clock.phase!=='offseason')return 'オフシーズンの新契約制度が必要です。';
  if(requiresYearEndGrowth(world))return '先に年度末成長・要求年俸を保存してください。';
  if(e.engine.transactions.some(t=>t.id===yearEndGrowthId(world.year))&&!e.engine.transactions.some(t=>t.id===postingPhaseId(world.year)))
    return '先に海外挑戦の希望確認とCPUポスティングを保存してください。';
  return null;
}
const nextDate = season => `${season+1}-02-01`;

// Only existing evaluators decide value and consent. The old wallet/salary
// mutator is deliberately not called. Child transactions own every money move.
export function* createCpuContractsSteps(state,c,signature,applySteps) {
  if (state.version !== 2 || state.phase !== 'offseason' || state.date !== `${state.season}-12-01`
    || c.id !== cpuContractsId(state.season) || !state.teams.some(t=>t.id===c.humanTeamId)) fail();
  const cpuIds = new Set(state.teams.filter(t=>t.id!==c.humanTeamId).map(t=>t.id));
  if (state.spending.reservations.some(h=>cpuIds.has(h.proposal.teamId)))
    fail('CPU球団の回答待ち留保が残っています。正式な回答を解決してから整理してください。');
  if ((state.retirementReservations??[]).some(r=>r.season===state.season&&cpuIds.has(r.teamId)&&!r.finalization)
    || postingApplicationViews(state).some(r=>r.season===state.season&&cpuIds.has(r.teamId)&&['pending','approved'].includes(r.status)))
    fail('CPU球団の引退予約・ポスティング案件を解決してから契約を整理してください。');
  if(state.transactions.some(t=>t.id===yearEndGrowthId(state.season))&&!state.transactions.some(t=>t.id===postingPhaseId(state.season)))
    fail('先に海外挑戦の希望確認とCPUポスティングを保存してください。');
  const employed = contractEmploymentAt(state.spending.ledger,`${state.season}-11-30`);
  const future = new Map(contractEmploymentAt(state.spending.ledger,nextDate(state.season)).map(e=>[e.contract.playerId,e]));
  const forecastAmounts=new Map(activeRenewalPlans(state.spending).map(p=>[JSON.stringify([p.teamId,p.playerId,p.season]),p.amountManYen]));
  const growth = state.transactions.find(t=>t.id===yearEndGrowthId(state.season))?.yearEndGrowth;
  const plans = new Map(), unavailableProspectIds = new Set();
  for (const t of state.teams.filter(t=>cpuIds.has(t.id)).sort((a,b)=>(a.wins??0)-(b.wins??0)||order(a.id,b.id))) {
    // Legacy planning's signed-year guard is a projection concern. The ledger
    // defines annual expiry, including a native one-year opening contract.
    const forPlan = {...t, ...Object.fromEntries(['players','farm'].map(roster=>[roster,t[roster].map(p=>{
      const e=employed.find(e=>e.teamId===t.id&&e.contract.playerId===p.id);
      return e?.contract.endSeason===state.season&&!future.has(p.id)?{...p,contractYearsLeft:1,contractSignedYear:state.season-1}:p;
    })]))};
    const plan = planCpuRenewals(forPlan,{...state.draftContext,year:state.season,teams:state.teams,unavailableProspectIds});
    if(plan.reason==='invalid-capacity') fail('CPU球団の登録枠・編成候補を確認できません。');
    plans.set(t.id,plan);plan.replacements.forEach(r=>unavailableProspectIds.add(r.prospectId));
  }
  let result = {state};const rows=[];
  const subjects = state.teams.filter(t=>cpuIds.has(t.id)).flatMap(t=>ownedPlayers(t).map(p=>({team:t,player:p})))
    .sort((a,b)=>order([a.team.id,a.player.id],[b.team.id,b.player.id]));
  for (const {team,player:p} of subjects) {
    yield;
    const current = employed.find(e=>e.teamId===team.id && e.contract.playerId===p.id);
    if(!current || p.isRetired || p._retireNow) fail();
    const contractId=employmentContractId(current.contract), transactionIds=[], attempts=[];
    const row={teamId:team.id,playerId:p.id,name:p.name??String(p.id),contractId,attempts,transactionIds};
    if(future.has(p.id)) {
      if(future.get(p.id).teamId!==team.id) fail();
      rows.push({...row,outcome:'continuing',reason:'来季の契約が既に確定しています。',futureContractId:employmentContractId(future.get(p.id).contract)});continue;
    }
    if(current.contract.endSeason!==state.season) fail();
    let outcome,reason;
    const progress=getFaProgress(p), overseas=p.personality?.overseas??0;
    if(plans.get(team.id).releaseIds.includes(p.id)) {outcome='release';reason='既存戦力・補強候補を比較した編成判断';}
    else if(isIkuseiPlayer(p) && p.ikuseiYears>=3) {outcome='expiry';reason='育成契約の3年満了';}
    else if(!isIkuseiPlayer(p) && overseas>=70 && progress.recorded && progress.overseas.eligible) {
      outcome='overseas-fa';reason='海外志向と海外FA資格による本人の宣言';
    } else {
      const demand=calcPlayerDemand(p,{year:state.season,team,teams:state.teams},growth?.rows.find(r=>r.playerId===p.id)?.salary);
      if(!Number.isSafeInteger(demand.demandSalary) || demand.demandSalary<=0) fail('CPU更改の要求年俸を確認できません。');
      row.demand=demand;
      const initial=Math.min(demand.demandSalary,Math.max(renewalSalaryFloor(p),Math.round(demand.demandSalary*.85/100)*100));
      const gap=Math.max(0,demand.demandSalary-initial);
      let signed=false;
      for(let round=1;round<=CPU_RENEWAL_ROUNDS&&!signed;round++) {
        const salary=round===1?initial:round===2?Math.min(demand.demandSalary,Math.round((initial+gap*CPU_TEAM_ROUND2_GAP_CLOSE)/100)*100):demand.demandSalary;
        const terms=p.age<=28 && (!isIkuseiPlayer(p)||ikuseiContractYears(p)>=2)?[2,1]:[1];
        for(const years of terms) {
          const evaluation=evaluateRenewalOffer(p,{salary,years},team,state.teams,demand,round);
          if(!evaluation.valid) fail(evaluation.reason);
          // Do not reserve money for a condition the player already declines.
          // These bounded hypothetical rounds still retain the shared score.
          if(!evaluation.accepted) {attempts.push({round,salary,years,evaluation,admitted:false,reason:evaluation.reason});continue;}
          // A read-only upper bound can reject an impossible offer before
          // constructing its hold. Refund its own forecast and at most one
          // controlled vacancy floor; never admit through this shortcut.
          const budgetRows=quoteAnnualSpendingPlan(result.state.spending);
          const impossible=Array.from({length:years},(_,i)=>state.season+1+i).some(season=>{
            const row=budgetRows.find(r=>r.teamId===team.id&&r.season===season);
            if(!row)return true;
            const refund=forecastAmounts.get(JSON.stringify([team.id,p.id,season]))??0;
            const vacancy=isIkuseiPlayer(p)?0:Math.min(MIN_SALARY_SHIHAKA,row.minimumRosterReserveManYen);
            return BigInt(row.remainingManYen)+BigInt(refund)+BigInt(vacancy)<BigInt(salary);
          });
          if(impossible){attempts.push({round,salary,years,evaluation,admitted:false,reason:'対象年度の支出許可・計画留保では提示額を確保できません。'});continue;}
          const proposalId=childId(c.id,p.id,`proposal-${round}-${years}`);
          const proposal={id:proposalId,type:'sign',teamId:team.id,effectiveDate:nextDate(state.season),
            contract:createSeasonContract({contractId:childId(c.id,p.id,`contract-${round}-${years}`),playerId:p.id,signedSeason:state.season,
              agreementPhase:'offseason',purpose:'renewal',termYears:years,annualSalaryManYen:salary,guaranteed:true,
              registrationType:isIkuseiPlayer(p)?'development':'controlled'})};
          const offer={id:childId(c.id,p.id,`offer-${round}-${years}`),type:'offer-renewal',contractId,proposal};
          let offered;
          try {offered=yield* applySteps(result.state,offer);} catch(error) {
            attempts.push({round,salary,years,evaluation,admitted:false,reason:error.message});continue;
          }
          const budget=offered.rows.find(r=>r.teamId===team.id&&r.season===state.season+1);
          if(!budget || budget.remainingManYen<Math.max(0,plans.get(team.id).rookieReserve-budget.minimumRosterReserveManYen)) {
            attempts.push({round,salary,years,evaluation,admitted:false,reason:'補強候補の年俸留保を維持できません。'});continue;
          }
          transactionIds.push(offer.id);
          const answer={id:childId(c.id,p.id,`answer-${round}-${years}`),type:evaluation.accepted?'accept-renewal':'reject-renewal',proposalId,
            ...(evaluation.accepted?{contractId}:{})};
          result=yield* applySteps(offered.state,answer);transactionIds.push(answer.id);
          attempts.push({round,salary,years,evaluation,admitted:true,proposalId});
          if(evaluation.accepted) {signed=true;outcome='renewed';reason='要求額・受諾評価と全契約年度の予算審査を通過';break;}
        }
      }
      if(!signed) {
        outcome=!isIkuseiPlayer(p)&&progress.recorded&&progress.domestic.eligible?'domestic-fa':'expiry';
        reason=attempts.some(a=>a.admitted)?'有限回の交渉で合意に至りませんでした。':'全年度予算・登録枠の審査を通過する提示がありません。';
      }
    }
    if(outcome!=='renewed') {
      const command={id:childId(c.id,p.id,'market'),teamId:team.id,playerId:p.id,contractId,
        ...(['domestic-fa','overseas-fa'].includes(outcome)?{type:'declare-fa',kind:outcome}:{type:'enter-market',reason:outcome})};
      result=yield* applySteps(result.state,command);transactionIds.push(command.id);
    }
    rows.push({...row,outcome,reason});
  }
  const cpuContracts={version:1,season:state.season,humanTeamId:c.humanTeamId,rows};
  return {...result,replayed:false,state:{...result.state,transactions:[...result.state.transactions,{id:c.id,signature,cpuContracts}]}};
}

export function inspectCpuContracts(state) {
  const ts=new Map(state.transactions.map((t,i)=>[t.id,{...t,index:i}]));
  const holds=new Map(state.spending.resolvedReservations.map(h=>[h.proposal.id,h]));
  const records=new Map(state.spending.ledger.records.map(r=>[r.actionId,r]));
  const contracts=new Map(state.spending.ledger.records.map(r=>[employmentContractId(r.contract),r]));
  for(const t of state.transactions) {
    let c;try{c=JSON.parse(t.signature);}catch{/* old opaque */}
    if(!isCpuContractsCommand(c) && t.cpuContracts===undefined)continue;
    c=normalizeCpuContracts(c);const g=t.cpuContracts;
    if(!g || Object.keys(g).sort().join(',')!=='humanTeamId,rows,season,version' || g.version!==1 || !Number.isSafeInteger(g.season)
      || g.season<1 || g.season>state.season || c.id!==t.id || c.id!==cpuContractsId(g.season) || stable(c)!==t.signature
      || g.humanTeamId!==c.humanTeamId || !Array.isArray(g.rows))fail();
    const childIds=g.rows.flatMap(r=>r.transactionIds??[]),set=new Set(childIds);
    if(set.size!==childIds.length)fail();
    // Reconstruct who was still owned when this batch began. Departures from
    // this batch remain subjects; earlier formal exits do not.
    const priorExit=new Set();
    for(const key of ['offseasonDepartures','faDeclarations','postingDepartures'])for(const d of state[key]??[])
      if(ts.get(d.id)?.index<ts.get(t.id).index&&!set.has(d.id))priorExit.add(d.sourceContractId);
    for(const r of state.retirementReservations??[])if(r.finalization && ts.get(r.finalization.id)?.index<ts.get(t.id).index)priorExit.add(r.sourceContractId);
    const subjects=contractEmploymentAt(state.spending.ledger,`${g.season}-11-30`).filter(e=>e.teamId!==g.humanTeamId&&!priorExit.has(employmentContractId(e.contract)))
      .map(e=>[e.teamId,e.contract.playerId,employmentContractId(e.contract)]).sort(order);
    if(stable(subjects)!==stable(g.rows.map(r=>[r.teamId,r.playerId,r.contractId]).sort(order)))fail();
    for(const r of g.rows) {
      if(r.teamId===g.humanTeamId || typeof r.name!=='string' || !r.reason || !Array.isArray(r.attempts) || r.attempts.length>CPU_RENEWAL_ROUNDS*2
        || !Array.isArray(r.transactionIds) || r.transactionIds.some(id=>!ts.has(id)||ts.get(id).index>=ts.get(t.id).index))fail();
      const commands=r.transactionIds.map(id=>JSON.parse(ts.get(id).signature));
      const expected=[];
      for(const a of r.attempts) {
        if(!Number.isInteger(a.round)||a.round<1||a.round>CPU_RENEWAL_ROUNDS||![1,2].includes(a.years)||!Number.isSafeInteger(a.salary)||a.salary<=0
          || !a.evaluation?.valid || typeof a.evaluation.accepted!=='boolean' || typeof a.admitted!=='boolean')fail();
        if(!a.admitted) {if(typeof a.reason!=='string'||!a.reason)fail();continue;}
        const offerId=childId(c.id,r.playerId,`offer-${a.round}-${a.years}`),answerId=childId(c.id,r.playerId,`answer-${a.round}-${a.years}`);
        expected.push(offerId,answerId);
        const offer=ts.get(offerId),answer=ts.get(answerId),o=offer&&JSON.parse(offer.signature),v=answer&&JSON.parse(answer.signature);
        if(!o || !v || o.type!=='offer-renewal'||o.contractId!==r.contractId||o.proposal.id!==a.proposalId
          || o.proposal.teamId!==r.teamId||o.proposal.contract.playerId!==r.playerId||o.proposal.contract.termYears!==a.years
          || o.proposal.contract.annualSalaryManYen!==a.salary||v.proposalId!==a.proposalId
          || v.type!==(a.evaluation.accepted?'accept-renewal':'reject-renewal')||offer.index>=answer.index)fail();
        const hold=holds.get(a.proposalId);
        if(!hold || hold.kind!=='renewal' || stable(hold.proposal)!==stable(o.proposal) || hold.resolution!==(a.evaluation.accepted?'accepted':'rejected'))fail();
        const record=records.get(a.proposalId);
        if(a.evaluation.accepted && (!record || record.initialTeamId!==r.teamId || stable(record.contract)!==stable(o.proposal.contract) || record.effectiveDate!==o.proposal.effectiveDate))fail();
      }
      const accepted=r.attempts.filter(a=>a.admitted&&a.evaluation.accepted);
      if(r.outcome==='continuing') {
        const x=contracts.get(r.futureContractId);
        if(commands.length||r.attempts.length||!x||x.contract.playerId!==r.playerId||x.contract.startSeason>g.season+1||x.contract.endSeason<g.season+1)fail();
      } else if(r.outcome==='renewed') {if(accepted.length!==1 || accepted[0]!==r.attempts.at(-1))fail();}
      else {
        if(!['expiry','release','domestic-fa','overseas-fa'].includes(r.outcome)||accepted.length)fail();
        const market=commands.at(-1),marketId=childId(c.id,r.playerId,'market');expected.push(marketId);
        if(!market || market.id!==marketId||market.teamId!==r.teamId||market.playerId!==r.playerId||market.contractId!==r.contractId
          || (r.outcome.endsWith('-fa')?market.type!=='declare-fa'||market.kind!==r.outcome:market.type!=='enter-market'||market.reason!==r.outcome))fail();
      }
      if(stable(expected)!==stable(r.transactionIds))fail();
    }
  }
}

// Complete world boundary only: child transactions are transiently produced
// before their parent inside the generator, never publishable on their own.
export function assertCpuContractsCoverage(state) {
  // projectAnnualState has already inspected each parent and its proof.
  const parents=state.transactions.filter(t=>t.cpuContracts);
  for(const t of state.transactions) {
    let parts;try{parts=JSON.parse(t.id);}catch{continue;}
    if(Array.isArray(parts)&&parts[0]==='cpu-contract-child' && parents.filter(p=>p.id===parts[1]
      && p.cpuContracts.rows.some(r=>r.playerId===parts[2]&&r.transactionIds.includes(t.id))).length!==1)fail();
  }
}
