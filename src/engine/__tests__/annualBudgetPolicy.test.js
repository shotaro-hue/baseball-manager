import { applyContractLedgerAction } from '../contractLedger';
import { describe, expect, it } from 'vitest';
import { economyFixture, economyPolicy, renewalEnvelope, freezeEconomy as freeze } from './fixtures/economyWorld';
import { createAnnualNewGameWorld, toAnnualState, fromAnnualState, reduceEconomyCommand } from '../contractEconomy';
import { quoteAnnualSpendingPlan, assessAnnualSpendingChange } from '../annualSpending';
import { faCashCompensationManYen, normalizeFaCompensationBasis } from '../faCompensation';
const json = x => JSON.parse(JSON.stringify(x));
const policyModule = () => import('../annualBudgetPolicy').catch(() => ({}));
const row = (w, season = 2027) => quoteAnnualSpendingPlan(toAnnualState(w).spending).find(r => r.teamId === 0 && r.season === season);
function planned() {
  const w = economyFixture();
  w.contractEconomy.engine.spending.renewalPlans = [{ teamId: 0, playerId: 0, sourceContractId: w.teams[0].players[0].contractId, season: 2027, amountManYen: 6000, basis: 'recorded-demand' }];
  return w;
}
const command = (w, transaction) => ({ saveId: w.saveId, epoch: w.contractEconomy.epoch, baseRevision: w.contractEconomy.revision, transaction });
const success = r => { expect(r.ok, r.error).toBe(true); return r.world; };
const policy = (w, start = 2026) => ({ policyVersion: 'experiment', allocationPercent: 50, smoothingYears: 1, maxChangePercent: 10,
  forecasts: w.teams.flatMap(t => Array.from({length:8}, (_,i) => ({ teamId:t.id, season:start+i, source:'profile', operatingSurplusesManYen:[100000], supportManYen:1000, previousApprovedManYen:null }))) });
const install = (w, q) => ({ ...w, contractEconomy: { ...w.contractEconomy, budgetPolicies:q.budgetPolicies,
  engine:{...w.contractEconomy.engine, rosterRequirements:q.rosterRequirements, spending:{...w.contractEconomy.engine.spending, authorizations:q.authorizations}} } });

describe('renewal planning replaces rather than stacks obligations', () => {
  it('test_plan6000_offer5000_accept5000_replaces_reserve', () => {
    const w=planned(), before=json(w); expect(row(freeze(w))).toMatchObject({renewalPlanReserveManYen:6000,reservedManYen:0,minimumRosterReserveManYen:0,remainingManYen:44000});
    const offer=renewalEnvelope(w,{salary:5000}), held=success(reduceEconomyCommand(w,offer));
    expect(row(held)).toMatchObject({renewalPlanReserveManYen:0,reservedManYen:5000,remainingManYen:45000});
    const accept=command(held,{id:'accept',type:'accept-renewal',proposalId:'renewal',contractId:w.teams[0].players[0].contractId});
    const next=success(reduceEconomyCommand(held,accept));
    expect(row(next)).toMatchObject({renewalPlanReserveManYen:0,reservedManYen:0,salaryManYen:5000,remainingManYen:45000});
    const restored=json(next); expect(reduceEconomyCommand(restored,accept).world).toBe(restored); expect(w).toEqual(before);
  });
  it('cancellation restores the plan even in deficit, with no extra vacancy cost', () => {
    const w=planned(); for(const a of w.contractEconomy.engine.spending.authorizations) if(a.teamId===0) a.approvedManYen=5500;
    for(const a of w.contractEconomy.budgetPolicies) if(a.teamId===0) a.approvedManYen=5500;
    const held=success(reduceEconomyCommand(w,renewalEnvelope(w,{salary:5000})));
    const next=success(reduceEconomyCommand(held,command(held,{id:'cancel',type:'cancel-renewal',proposalId:'renewal'})));
    expect(row(next)).toMatchObject({renewalPlanReserveManYen:6000,reservedManYen:0,minimumRosterReserveManYen:0,remainingManYen:-500});
  });
  it.each(['duplicate','missing','negative','source','owner','year'])('rejects invalid %s plan without mutating it', kind=>{
    const w=planned(), plans=w.contractEconomy.engine.spending.renewalPlans,p=plans[0];
    if(kind==='duplicate')plans.push({...p}); if(kind==='missing')delete p.amountManYen; if(kind==='negative')p.amountManYen=-1;
    if(kind==='source')p.sourceContractId='absent'; if(kind==='owner')p.teamId=1; if(kind==='year')p.season=2028;
    const before=json(w); expect(()=>toAnnualState(freeze(w))).toThrow(); expect(w).toEqual(before);
  });
  it('releases the old-club estimate when a new contract starts after February 1',()=>{
    const w=planned(),before=json(w),s=toAnnualState(w).spending;
    const next={...s,ledger:applyContractLedgerAction(s.ledger,{
      id:'late-reacquisition',type:'sign',teamId:1,effectiveDate:'2027-04-01',
      contract:{version:1,contractId:'new-2027-contract',playerId:0,signedSeason:2027,
        agreementPhase:'season',purpose:'acquisition',startSeason:2027,endSeason:2027,
        termYears:1,annualSalaryManYen:1200,guaranteed:true,registrationType:'controlled'},
    })};
    const oldRows=quoteAnnualSpendingPlan(s),rows=quoteAnnualSpendingPlan(freeze(next));
    expect(oldRows.find(r=>r.teamId===0&&r.season===2027).renewalPlanReserveManYen).toBe(6000);
    expect(rows.find(r=>r.teamId===0&&r.season===2027).renewalPlanReserveManYen).toBe(0);
    expect(rows.find(r=>r.teamId===1&&r.season===2027).salaryManYen).toBeGreaterThan(0);
    expect(next.renewalPlans).toEqual(s.renewalPlans);expect(w).toEqual(before);
  });
  it('does not let ordinary spending assessment delete a plan to finance another obligation',()=>{
    const s=toAnnualState(planned()).spending;
    expect(()=>assessAnnualSpendingChange(s,{...s,renewalPlans:[]})).toThrow();
  });
});

describe('explicit budget policy, no live calibration',()=>{
  it('quotes all clubs/years from payroll-before inputs, never legacy budget',async()=>{
    const {quoteAnnualBudgetPolicy:quote}=await policyModule(); expect(quote).toBeTypeOf('function');
    const w=economyFixture(),p=policy(w),before=json(w); const q=quote(freeze(w),freeze(p));
    expect(q.authorizations).toHaveLength(16); expect(q.authorizations[0].approvedManYen).toBe(51000);
    expect(q.rosterRequirements.every(r=>r.requiredControlledCount===65)).toBe(true);
    expect(q.budgetPolicies[0]).toMatchObject({policyVersion:'experiment',inputsRecorded:true,approvedManYen:51000});
    expect(w).toEqual(before); expect(quote(json(w),json(p))).toEqual(q);
  });
  it('chains year-on-year budget limits when future prior approvals are null',async()=>{
    const {quoteAnnualBudgetPolicy:quote}=await policyModule(),w=economyFixture(),p=policy(w);
    p.forecasts.find(f=>f.teamId===0&&f.season===2027).operatingSurplusesManYen=[500000];
    const q=quote(freeze(w),freeze(p));
    expect(q.authorizations.find(a=>a.teamId===0&&a.season===2026).approvedManYen).toBe(51000);
    expect(q.authorizations.find(a=>a.teamId===0&&a.season===2027).approvedManYen).toBe(56100);
    expect(q.budgetPolicies.find(a=>a.teamId===0&&a.season===2027).previousApprovedManYen).toBeNull();
    const next=install(w,q);expect(()=>toAnnualState(next)).not.toThrow();
    // Recalculation of an individual row is insufficient: the prior year is authoritative.
    const tampered=json(next),policyRow=tampered.contractEconomy.budgetPolicies.find(a=>a.teamId===0&&a.season===2027);
    policyRow.previousApprovedManYen=500000;
    policyRow.approvedManYen=450000;
    tampered.contractEconomy.engine.spending.authorizations.find(a=>a.teamId===0&&a.season===2027).approvedManYen=450000;
    expect(()=>toAnnualState(freeze(tampered))).toThrow();
  });
  it('rejects an explicit future-year prior that differs from preceding approval',async()=>{
    const {quoteAnnualBudgetPolicy:quote}=await policyModule(),w=economyFixture(),p=policy(w);
    p.forecasts.find(f=>f.teamId===0&&f.season===2027).previousApprovedManYen=1000000;
    expect(()=>quote(freeze(w),freeze(p))).toThrow();
  });
  it('smooths observations and bounds changes using explicit prior approvals',async()=>{
    const {quoteAnnualBudgetPolicy:quote}=await policyModule(),w=economyFixture(),p=policy(w);p.smoothingYears=3;
    p.forecasts.forEach(f=>{f.operatingSurplusesManYen=[20000,40000,60000];f.previousApprovedManYen=f.season===2026?10000:null;});
    expect(quote(w,p).authorizations[0].approvedManYen).toBe(11000);
    p.forecasts.forEach(f=>f.operatingSurplusesManYen=[-10000,-20000,-30000]);
    expect(quote(w,p).authorizations[0].approvedManYen).toBe(9000);
  });
  it.each(['duplicate','missing','fraction','unknown-team','absent-year'])('rejects %s input rather than filling zero',async kind=>{
    const {quoteAnnualBudgetPolicy:quote}=await policyModule(),w=economyFixture(),p=policy(w);
    if(kind==='duplicate')p.forecasts.push({...p.forecasts[0]});if(kind==='missing')delete p.forecasts[0].supportManYen;
    if(kind==='fraction')p.forecasts[0].supportManYen=0.5;if(kind==='unknown-team')p.forecasts[0].teamId=99;if(kind==='absent-year')p.forecasts.pop();
    expect(quote).toBeTypeOf('function');expect(()=>quote(freeze(w),freeze(p))).toThrow();
  });
  it('preserves explicit zero and rejects absent policy',async()=>{
    const {quoteAnnualBudgetPolicy:quote}=await policyModule(),w=economyFixture(),p=policy(w);p.forecasts.forEach(f=>{f.supportManYen=0;f.operatingSurplusesManYen=[0];});
    expect(quote(w,p).authorizations[0].approvedManYen).toBe(0);expect(()=>quote(w)).toThrow();
  });
  it('test_offseason_budget_horizon_covers_next_season_seven_year_renewal',async()=>{
    const {quoteAnnualBudgetPolicy:quote}=await policyModule(),w=economyFixture();
    w.contractEconomy.clock={season:2026,phase:'offseason',date:'2026-12-01',offseasonTurn:0};w.contractEconomy.engine.spending.budgetSeason=2027;
    const q=quote(w,policy(w,2027)); expect(q.authorizations.filter(a=>a.teamId===0).map(a=>a.season)).toEqual([2027,2028,2029,2030,2031,2032,2033,2034]);
    const next=install(w,q);expect(()=>toAnnualState(next)).not.toThrow();
    for(const field of ['authorizations','budgetPolicies','rosterRequirements']){const bad=json(next);const holder=field==='authorizations'?bad.contractEconomy.engine.spending:field==='budgetPolicies'?bad.contractEconomy:bad.contractEconomy.engine;holder[field]=holder[field].filter(r=>r.season!==2034);expect(()=>toAnnualState(freeze(bad))).toThrow();}
  });
  it('test_next_year_seven_year_renewal_checks_2033',()=>{
    const w=economyFixture(),c=renewalEnvelope(w,{salary:5000});Object.assign(c.transaction.proposal.contract,{termYears:7,endSeason:2033});
    for(const rows of [w.contractEconomy.engine.spending.authorizations,w.contractEconomy.budgetPolicies]) rows.find(r=>r.teamId===0&&r.season===2033).approvedManYen=4999;
    const before=json(w),r=reduceEconomyCommand(freeze(w),c);expect(r.ok).toBe(false);expect(r.world).toBe(w);expect(w).toEqual(before);
  });
});

describe('annual staff and conservative legacy FA',()=>{
  const staff=()=>({id:'coach-a',teamId:0,season:2026,role:'batting',annualSalaryManYen:800});
  it('projects one authoritative annual staff cost through world and JSON',()=>{
    const w=economyFixture();w.contractEconomy.staffContracts=[staff()];
    expect(row(w,2026)).toMatchObject({staffManYen:800,remainingManYen:48200});
    const next=fromAnnualState(w,toAnnualState(w));expect(next.contractEconomy.engine.spending).not.toHaveProperty('staffContracts');
    expect(row(json(next),2026).staffManYen).toBe(800);
  });
  it.each(['duplicate-role','duplicate-id','missing','double-cost'])('rejects %s staff costs',kind=>{
    const w=economyFixture();w.contractEconomy.staffContracts=[staff()];
    if(kind==='duplicate-role')w.contractEconomy.staffContracts.push({...staff(),id:'coach-b'});
    if(kind==='duplicate-id')w.contractEconomy.staffContracts.push({...staff(),role:'pitching'});
    if(kind==='missing')delete w.contractEconomy.staffContracts[0].annualSalaryManYen;
    if(kind==='double-cost')w.contractEconomy.engine.spending.oneOffCosts.push({id:'old-coach',teamId:0,season:2026,kind:'coach',amountManYen:800});
    expect(()=>toAnnualState(freeze(w))).toThrow();
  });
  it.each(['A','B'])('reserves first-exercise maximum for unknown legacy %s without claiming first history',rank=>{
    const basis={previousAnnualSalaryManYen:10000,exercise:'legacy-conservative-max'};
    expect(normalizeFaCompensationBasis(basis)).toEqual(basis);
    const p={teamId:1,marketEntry:{kind:'domestic-fa',compensationRank:rank,originTeamId:0,compensationBasis:basis}};
    expect(faCashCompensationManYen(p)).toBe(rank==='A'?8000:6000);
    expect(faCashCompensationManYen(p,'player-and-cash')).toBe(rank==='A'?5000:4000);
  });
});

describe('policy boundary and restore regression',()=>{
  it('uses the offseason approval in a 2027 fixture and rejects only 2034 shortfall',async()=>{
    const {quoteAnnualBudgetPolicy:quote}=await policyModule(),old=economyFixture();
    old.contractEconomy.clock={season:2026,phase:'offseason',date:'2026-12-01',offseasonTurn:0};old.contractEconomy.engine.spending.budgetSeason=2027;
    const p=policy(old,2027);p.maxChangePercent=100;p.forecasts.find(r=>r.teamId===0&&r.season===2034).operatingSurplusesManYen=[61758];
    const q=quote(old,p);
    // A spring envelope fixture, not the future production rollover builder.
    let w=createAnnualNewGameWorld({teams:old.teams,faPool:[],myId:0,saveId:'spring',season:2027,policy:q,randomRoot:{algorithmVersion:1,seed:'spring'}});
    w={...w,schedule:[null,{date:{month:7,day:16}}],contractEconomy:{...w.contractEconomy,clock:{season:2027,phase:'season',date:'2027-07-16',offseasonTurn:0}}};
    const c=renewalEnvelope(w,{salary:5000});c.transaction.contractId=w.teams[0].players[0].contractId;
    c.transaction.proposal.effectiveDate='2028-02-01';Object.assign(c.transaction.proposal.contract,{signedSeason:2027,startSeason:2028,endSeason:2034,termYears:7});
    expect(row(w,2034).remainingManYen).toBe(4579);
    const before=json(w),r=reduceEconomyCommand(freeze(w),c);expect(r.ok).toBe(false);expect(r.world).toBe(w);expect(w).toEqual(before);
    expect(quoteAnnualSpendingPlan(toAnnualState(w).spending).filter(r=>r.season===2034&&r.teamId===0)).toHaveLength(1);
  });
  it('rejects a malformed input world even when the arithmetic inputs are valid',async()=>{
    const {quoteAnnualBudgetPolicy:quote}=await policyModule(),w=economyFixture();w.contractEconomy.clock.phase='unknown';
    expect(()=>quote(freeze(w),policy(w))).toThrow();
  });
  it('rejects null plan arrays on reload instead of treating them as empty',()=>{
    const w=planned();w.contractEconomy.engine.spending.renewalPlans=null;expect(()=>toAnnualState(json(w))).toThrow();
  });
  it('counts explicit zero staff salary, rejects ordinary reassignment or missing projection',()=>{
    const w=economyFixture();w.contractEconomy.staffContracts=[{id:'coach',teamId:0,season:2026,role:'batting',annualSalaryManYen:0}];
    const s=toAnnualState(w);expect(row(w,2026).staffManYen).toBe(0);
    expect(()=>assessAnnualSpendingChange(s.spending,{...s.spending,staffContracts:[]})).toThrow();
    delete s.spending.staffContracts;expect(()=>fromAnnualState(w,s)).toThrow();
  });
});

it('keeps a non-worsening cashless trade legal in deficit and releases only the former club plan',()=>{
  const w=planned();for(const rows of [w.contractEconomy.engine.spending.authorizations,w.contractEconomy.budgetPolicies])rows.forEach(r=>r.approvedManYen=0);
  const c=command(w,{id:'trade-plan',type:'trade',fromId:0,toId:1,outgoingIds:[0],incomingIds:['b'],cashManYen:0,mode:'cashless-trade'});
  const next=success(reduceEconomyCommand(freeze(w),c));
  expect(row(next).renewalPlanReserveManYen).toBe(0);expect(row(next).minimumRosterReserveManYen).toBe(420);
  expect(next.contractEconomy.engine.spending.renewalPlans).toEqual(w.contractEconomy.engine.spending.renewalPlans);
});

describe('review regression: development planning survives legal lifecycle changes',()=>{
  function development(){
    const teams=[{id:0,players:[],farm:[{id:'dev',salary:300,contractYearsLeft:1,isIkusei:true}]}];
    const w=createAnnualNewGameWorld({teams,faPool:[],myId:0,saveId:'dev-plan',season:2026,policy:economyPolicy(teams),randomRoot:{algorithmVersion:1,seed:'dev-plan'}});
    w.contractEconomy.engine.spending.renewalPlans=[{teamId:0,playerId:'dev',sourceContractId:w.teams[0].farm[0].contractId,season:2027,amountManYen:300,basis:'demand'}];
    return w;
  }
  it('converts a planned development player and quotes the controlled minimum without rewriting evidence',()=>{
    const w=development(),before=json(w);
    expect(row(w)).toMatchObject({renewalPlanReserveManYen:300,minimumRosterReserveManYen:420});
    const next=success(reduceEconomyCommand(freeze(w),command(w,{id:'convert',type:'convert-to-controlled',teamId:0,playerId:'dev',contractId:w.teams[0].farm[0].contractId,annualSalaryManYen:420})));
    expect(row(json(next))).toMatchObject({renewalPlanReserveManYen:420,minimumRosterReserveManYen:0});
    expect(next.contractEconomy.engine.spending.renewalPlans[0].amountManYen).toBe(300);expect(w).toEqual(before);
  });
  it('does not treat increased future planning cost as cancellation relief',()=>{
    const w=development();
    for(const rows of [w.contractEconomy.engine.spending.authorizations,w.contractEconomy.budgetPolicies])rows.find(r=>r.season===2027).approvedManYen=350;
    w.contractEconomy.engine.rosterRequirements.find(r=>r.season===2027).requiredControlledCount=0;
    const before=json(w),r=reduceEconomyCommand(freeze(w),command(w,{id:'convert-deficit',type:'convert-to-controlled',teamId:0,playerId:'dev',contractId:w.teams[0].farm[0].contractId,annualSalaryManYen:420}));
    expect(r.ok).toBe(false);expect(r.world).toBe(w);expect(w).toEqual(before);
  });
  it('deactivates a terminated development source while retaining its guaranteed debt',()=>{
    const w=development(),s=toAnnualState(w).spending,before=json(s);
    const next={...s,ledger:applyContractLedgerAction(s.ledger,{id:'end-dev',type:'end',teamId:0,contractId:w.teams[0].farm[0].contractId,effectiveDate:'2026-07-01',reason:'retirement',settlement:'retain'})};
    const rows=quoteAnnualSpendingPlan(freeze(next));
    expect(rows.find(r=>r.season===2027).renewalPlanReserveManYen).toBe(0);
    expect(rows.find(r=>r.season===2026)).toMatchObject({salaryManYen:150,guaranteeManYen:150});expect(s).toEqual(before);
  });
});
