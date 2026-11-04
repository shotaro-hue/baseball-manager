import { describe, it, expect } from 'vitest';
import { inSeasonWorld, playableClub, atDate, nextSeasonForDepartureTest, releaseCommand } from './fixtures/inSeasonDepartures';
import { freezeEconomy, renewalEnvelope } from './fixtures/economyWorld';
import { reduceEconomyCommand, quoteEconomyCommand, fromAnnualState, toAnnualState } from '../contractEconomy';
import { applyAnnualTransaction } from '../annualTransactions';
import { contractEmploymentAt, contractLiabilityRows } from '../contractLedger';
import { validateEconomySave } from '../economyPersistence';
import { assessPostTransactionPlayability } from '../postTransactionPlayability';
import { prepareEconomyMigration } from '../economyMigration';
import { renewalRequest, reduceRenewalRequest } from '../renewalDecisions';
import { createSeasonContract } from '../seasonContract';
import { createInitialTeams } from '../bootstrapTeams';

import { wrap, reserve, finish, winter } from './fixtures/annualRetirements';
const apply = (w,c) => { const r=reduceEconomyCommand(w,c);expect(r.ok,r.error).toBe(true);return r.world; };
const denied = (w,c) => { const old=structuredClone(w);freezeEconomy(w);const r=reduceEconomyCommand(w,c);expect(r.ok).toBe(false);expect(r.world).toBe(w);expect(w).toEqual(old);return r; };
const ledger = w=>w.contractEconomy.engine.spending.ledger;

describe('A1-2c-2c retirement',()=>{
  it.each([0,18,19,20])('reserves active/farm batter/pitcher %s without changing eligibility, money or placement',id=>{
    const w=freezeEconomy(inSeasonWorld()), c=reserve(w,id,{id:0});
    expect(quoteEconomyCommand(w,c).ok).toBe(true);
    const n=apply(w,c);
    expect(n.teams).toEqual(w.teams);expect(ledger(n)).toEqual(ledger(w));expect(n.faPool).toEqual(w.faPool);
    expect(assessPostTransactionPlayability(n.teams[0],{round:n.gameDay}).ok).toBe(true);
    expect(n.contractEconomy.engine.retirementReservations[0]).toMatchObject({id:0,playerId:id,notifiedDate:'2026-07-16',effectiveDate:'2026-12-01'});
    expect(n.contractEconomy.engine).not.toHaveProperty('gameDay');
    expect(validateEconomySave(n)).toBe('annual');
    const loaded=JSON.parse(JSON.stringify(n)), r=reduceEconomyCommand(loaded,c);
    expect(r.ok,r.error).toBe(true);expect(r.replayed).toBe(true);expect(r.world).toBe(loaded);
    denied(n,reserve(n,id,{id:'duplicate'}));denied(n,{...c,transaction:{...c.transaction,teamId:1}});
  });
  it.each([1,19])('does not reject reservation of a last usable role %s',id=>{
    const w=inSeasonWorld();w.teams[0].farm.forEach(p=>{p.injuryDaysLeft=30;});
    expect(apply(w,reserve(w,id)).teams).toEqual(w.teams);
  });
  it.each([1,3])('finalizes natural/continuing contract years=%s exactly once, preserving current salary and career',years=>{
    const w=inSeasonWorld({years});w.teams[0].players[0].stats={G:80,HR:20};
    let n=apply(w,reserve(w)); n.teams[0].players[0].stats={G:143,HR:30};
    const off=winter(n), c=finish(off), done=apply(off,c);
    expect(done.teams[0].players.some(p=>p.id===0)).toBe(false);expect(done.teams[0].lineup).toEqual([1]);
    expect(done.faPool).toEqual([]);expect(done.teams[0].history).toHaveLength(1);
    expect(done.teams[0].history[0]).toMatchObject({id:0,isRetired:true,exitYear:2026,exitReason:'引退',careerLogSummary:{totalHomeRuns:30}});
    expect(done.teams[0].history[0].recentCareerLog).toHaveLength(1);
    expect(ledger(done).records[0].changes).toHaveLength(years===1?0:1);
    if(years===3)expect(ledger(done).records[0].changes[0]).toMatchObject({reason:'retirement',settlement:'retain',effectiveDate:'2026-12-01'});
    expect(contractLiabilityRows(ledger(done)).filter(r=>r.season===2026)).toEqual(contractLiabilityRows(ledger(w)).filter(r=>r.season===2026));
    expect(contractEmploymentAt(ledger(done),'2026-11-30').some(e=>e.contract.playerId===0)).toBe(true);
    expect(contractEmploymentAt(ledger(done),'2026-12-01').some(e=>e.contract.playerId===0)).toBe(false);
    expect(validateEconomySave(JSON.parse(JSON.stringify(done)))).toBe('annual');
    expect(reduceEconomyCommand(done,c)).toMatchObject({ok:true,replayed:true,world:done});
    expect(reduceEconomyCommand(done,reserve(w))).toMatchObject({ok:true,replayed:true});
    denied(done,wrap(done,{...c.transaction,id:'again'}));
    if(years===3) expect(contractLiabilityRows(ledger(done)).filter(r=>r.playerId===0&&r.season>2026).every(r=>r.kind==='guarantee')).toBe(true);
  });
  it.each([{teamId:1},{contractId:'bad'},{notifiedDate:'2026-01-01'},{settlement:'waive'},{gameDay:1}])('rejects invalid reservation %j',extra=>{
    const w=inSeasonWorld();denied(w,reserve(w,0,extra));
  });
  it.each(['isRetired','_retireNow'])('rejects already retired %s',field=>{const w=inSeasonWorld();w.teams[0].players[0][field]=true;denied(w,reserve(w));});
  it('rejects pending renewal and accepted future employment without deleting promises',()=>{
    let w=inSeasonWorld({years:1});w=apply(w,renewalEnvelope(w));denied(w,reserve(w));
    const n=apply(w,wrap(w,{id:'accept',type:'accept-renewal',proposalId:'renewal',contractId:w.teams[0].players[0].contractId}));denied(n,reserve(n));
  });
  it('rejects a real human renewal decision and does not erase mail or promises',()=>{
    const w=inSeasonWorld({years:1}), offered=reduceRenewalRequest(w,renewalRequest(w,{type:'offer',playerId:0,salary:2000,years:1}));
    expect(offered.ok,offered.error).toBe(true);expect(validateEconomySave(offered.world)).toBe('annual');denied(offered.world,reserve(offered.world));
  });
  it('preserves prior-year payroll and finalized history across a later season',()=>{
    let w=inSeasonWorld();for(const r of ledger(w).records){r.contract=createSeasonContract({...r.contract,signedSeason:2025,termYears:4});r.effectiveDate='2025-02-01';}
    w=fromAnnualState(w,toAnnualState(w));const before=contractLiabilityRows(ledger(w)).filter(r=>r.season<2026);
    const n=apply(w,reserve(w)), off=winter(n), c=finish(off), done=apply(off,c);
    expect(contractLiabilityRows(ledger(done)).filter(r=>r.season<2026)).toEqual(before);
    const later=nextSeasonForDepartureTest(done);expect(validateEconomySave(later)).toBe('annual');
    expect(reduceEconomyCommand(later,c)).toMatchObject({ok:true,replayed:true});
  });
  it('rejects subsequent release, trade, conversion and renewal without altering reservation',()=>{
    const w=apply(inSeasonWorld({years:1}),reserve(inSeasonWorld({years:1})));
    denied(w,releaseCommand(w));denied(w,renewalEnvelope(w));
    denied(w,wrap(w,{id:'trade',type:'trade',fromId:0,toId:1,outgoingIds:[0],incomingIds:[],cashManYen:0,mode:'spend'}));
    denied(w,wrap(w,{id:'convert',type:'convert-to-controlled',teamId:0,playerId:0,contractId:w.teams[0].players[0].contractId,annualSalaryManYen:2000}));
  });
  it('rejects early finalization, bad world clock, and rolling a pending reservation into another year',()=>{
    const w=apply(inSeasonWorld(),reserve(inSeasonWorld()));denied(w,finish(w));
    const bad=structuredClone(w);bad.contractEconomy.clock.date='2026-07-15';denied(bad,finish(bad));
    expect(()=>nextSeasonForDepartureTest(w)).toThrow();
    const state=toAnnualState(w);state.phase='offseason';state.spending.budgetSeason=2027;state.date='2026-11-30';
    expect(applyAnnualTransaction(state,finish(w).transaction).ok).toBe(false);
    state.date='2026-12-02';expect(applyAnnualTransaction(state,finish(w).transaction).ok).toBe(false);
  });
  it.each(['2026-07-31','2026-08-01','2026-11-30'])('reserves at %s with world calendar and keeps current employment',date=>{
    const w=atDate(inSeasonWorld(),date);expect(validateEconomySave(apply(w,reserve(w)))).toBe('annual');
  });
  it('records deficit vacancy costs without forcing retirement withdrawal or forgiving liability',()=>{
    const teams=[playableClub(),playableClub(1)];for(const t of teams)for(const p of [...t.players,...t.farm])p.contractYearsLeft=3;
    let w=inSeasonWorld({teams}); const e=w.contractEconomy;
    for(const r of e.engine.rosterRequirements)if(r.teamId===0)r.requiredControlledCount=21;
    for(const list of [e.budgetPolicies,e.engine.spending.authorizations])for(const r of list)r.approvedManYen=21000;
    w=fromAnnualState(w,toAnnualState(w));const n=apply(w,reserve(w)), off=winter(n), q=quoteEconomyCommand(off,finish(off));
    expect(q.ok,q.error).toBe(true);expect(q.rows.find(r=>r.teamId===0&&r.season===2027)).toMatchObject({remainingManYen:-420,minimumRosterReserveManYen:420,guaranteeManYen:1000});
    expect(validateEconomySave(apply(off,finish(off)))).toBe('annual');
  });
  it('deactivates but preserves unoffered renewal plans only on finalization',()=>{
    let w=inSeasonWorld({years:1});w.contractEconomy.engine.spending.renewalPlans=[{teamId:0,playerId:0,sourceContractId:w.teams[0].players[0].contractId,season:2027,amountManYen:1200,basis:'observed'}];
    w=fromAnnualState(w,toAnnualState(w));const n=apply(w,reserve(w));expect(n.teams).toEqual(w.teams);
    const off=winter(n), done=apply(off,finish(off));expect(done.contractEconomy.engine.spending.renewalPlans).toEqual(w.contractEconomy.engine.spending.renewalPlans);
    expect(toAnnualState(done).spending.offseasonDepartures.some(d=>d.player.id===0)).toBe(true);
  });
  it('retains unknown legacy future guarantees from the actual migration',()=>{
    let w=inSeasonWorld(), teams=structuredClone(w.teams);while(teams.length<12)teams.push({id:teams.length,players:[],farm:[],budget:0});
    for(const t of teams)for(const p of [...t.players,...t.farm]){p.contractSignedYear=2024;p.contractYearsLeft=p.id===0?4:2;p.contractYears=p.contractYearsLeft;}
    const m=prepareEconomyMigration({...w,teams,year:2025,phase:'season',contractEconomy:undefined},{season:2025,stage:'unstarted-offseason',legacyOffseasonStarted:false});
    expect(m.ok,JSON.stringify(m.issues)).toBe(true);w.contractEconomy.engine.spending.ledger=m.candidate.ledger;delete w.contractEconomy.engine.faExerciseOrigins;w=fromAnnualState(w,toAnnualState(w));
    const n=apply(w,reserve(w)), off=winter(n), done=apply(off,finish(off));
    expect(ledger(done).records[0].contract.guaranteeStatus).toBe('unknown');expect(ledger(done).records[0].changes[0].settlement).toBe('retain');
    expect(validateEconomySave(done)).toBe('annual');
  });
  it('accepts current createInitialTeams data and rejects a wrong source contract on the same data',()=>{
    const w=inSeasonWorld({teams:createInitialTeams()}), id=w.teams[0].players[0].id;
    const n=apply(w,reserve(w,id));const off=winter(n), done=apply(off,finish(off));expect(validateEconomySave(done)).toBe('annual');
    denied(w,reserve(w,id,{contractId:'wrong'}));
  });
  it.each([
    ['notice',w=>w.contractEconomy.engine.retirementReservations[0].notifiedDate='2026-07-15'],
    ['effective',w=>w.contractEconomy.engine.retirementReservations[0].effectiveDate='2027-02-01'],
    ['reservation receipt',w=>w.contractEconomy.engine.transactions.shift()],
    ['reservation row',w=>w.contractEconomy.engine.retirementReservations=[]],
    ['final receipt',w=>w.contractEconomy.engine.transactions.pop()],
    ['final row',w=>delete w.contractEconomy.engine.retirementReservations[0].finalization],
    ['history',w=>w.teams[0].history=[]],
    ['history+receipt',w=>{w.teams[0].history=[];w.contractEconomy.engine.transactions.pop();}],
    ['row+receipts',w=>{w.contractEconomy.engine.retirementReservations=[];w.contractEconomy.engine.transactions=[];}],
    ['source',w=>w.contractEconomy.engine.spending.ledger.records[0].contract.annualSalaryManYen=9999],
    ['end',w=>w.contractEconomy.engine.spending.ledger.records[0].changes=[]],
    ['snapshot+receipt',w=>{w.contractEconomy.engine.retirementReservations[0].finalization.player.stats.HR=99;w.contractEconomy.engine.transactions.at(-1).retirement.player.stats.HR=99;}],
  ])('rejects tampering %s during cold validation',(_,edit)=>{
    const n=apply(inSeasonWorld(),reserve(inSeasonWorld())), off=winter(n), done=JSON.parse(JSON.stringify(apply(off,finish(off))));edit(done);
    expect(()=>validateEconomySave(freezeEconomy(done))).toThrow();
  });
});
