import { describe,it,expect } from 'vitest';
import { faWinter, declaration, envelope } from './fixtures/faDeclarations';
import { freezeEconomy,renewalEnvelope } from './fixtures/economyWorld';
import { reduceEconomyCommand,quoteEconomyCommand,toAnnualState,fromAnnualState } from '../contractEconomy';
import { validateEconomySave,economyOverwriteIssue } from '../economyPersistence';
import { contractLiabilityRows } from '../contractLedger';
import { createSeasonContract } from '../seasonContract';
import { prepareEconomyMigration } from '../economyMigration';
import { createInitialTeams } from '../bootstrapTeams';
import { reduceRenewalRequest,renewalRequest } from '../renewalDecisions';
import { nextSeasonForDepartureTest } from './fixtures/inSeasonDepartures';
import { economyPolicy } from './fixtures/economyWorld';
import { applyAnnualTransaction } from '../annualTransactions';

const apply=(w,c)=>{const r=reduceEconomyCommand(w,c);expect(r.ok,r.error).toBe(true);return r.world;};
const denied=(w,c)=>{const old=structuredClone(w);freezeEconomy(w);expect(quoteEconomyCommand(w,c).ok).toBe(false);const r=reduceEconomyCommand(w,c);expect(r.ok).toBe(false);expect(r.world).toBe(w);expect(w).toEqual(old);return r;};
const engine=w=>w.contractEconomy.engine;
const marketOffer=(w,teamId=1)=>{const p=w.faPool[0];return {id:'bid',type:'sign',teamId,offeredDate:'2026-12-01',effectiveDate:'2027-02-01',marketEntry:p.marketEntry,
  contract:createSeasonContract({contractId:'new-contract',playerId:p.id,signedSeason:2026,agreementPhase:'offseason',purpose:'acquisition',termYears:1,
    annualSalaryManYen:5000,registrationType:'controlled',guaranteed:true})};};

describe('A1-2c-3 common FA declaration',()=>{
  it.each([[0,'A'],[3,'B'],[10,'C'],[11,'C']])('registers controlled active/farm ID %s as %s and preserves all source liabilities', (id,rank)=>{
    const w=freezeEconomy(faWinter()),c=declaration(w,id,{id:0}),q=quoteEconomyCommand(w,c);expect(q.ok,q.error).toBe(true);
    const n=apply(w,c),record=engine(n).faDeclarations[0];
    expect(record).toMatchObject({id:0,season:2026,teamId:0,sourceContractId:c.transaction.contractId,notifiedDate:'2026-12-01',effectiveDate:'2026-12-01',kind:'domestic-fa'});
    expect(n.faPool[0]).toMatchObject({id,isFA:true,isWaiverReleased:false,marketEntry:{kind:'domestic-fa',originTeamId:0,compensationRank:rank}});
    if(rank!=='C')expect(n.faPool[0].marketEntry.compensationBasis).toEqual({previousAnnualSalaryManYen:12000-id*1000,exercise:'first'});
    else expect(n.faPool[0].marketEntry).not.toHaveProperty('compensationBasis');
    expect(engine(n).spending.ledger).toEqual(engine(w).spending.ledger);
    expect(contractLiabilityRows(engine(n).spending.ledger)).toEqual(contractLiabilityRows(engine(w).spending.ledger));
    expect([...n.teams[0].players,...n.teams[0].farm].some(p=>p.id===id)).toBe(false);expect(n.teams[0].history).toHaveLength(1);
    expect(n.faYears).toEqual(w.faYears);expect(validateEconomySave(n)).toBe('annual');expect(economyOverwriteIssue(w,n)).toBeNull();
    const loaded=JSON.parse(JSON.stringify(n)),r=reduceEconomyCommand(loaded,c);expect(r).toMatchObject({ok:true,replayed:true});expect(r.world).toBe(loaded);
    denied(n,declaration(w,id,{id:'again'}));denied(n,{...c,transaction:{...c.transaction,kind:'overseas-fa'}});
  });
  it('prunes all placement references and deactivates but retains the renewal estimate',()=>{
    let w=faWinter();const plan={teamId:0,playerId:0,sourceContractId:w.teams[0].players[0].contractId,season:2027,amountManYen:13000,basis:'observed'};
    engine(w).spending.renewalPlans=[plan];w=fromAnnualState(w,toAnnualState(w));const n=apply(w,declaration(w));
    expect(n.teams[0]).toMatchObject({lineup:[1],rotation:[],fieldingDh:{},pitchingPattern:{closerId:null,middleOrder:[]}});
    expect(engine(n).spending.renewalPlans).toEqual([plan]);expect(toAnnualState(n).spending.offseasonDepartures).toHaveLength(1);
    expect(quoteEconomyCommand(w,declaration(w)).rows.find(r=>r.teamId===0&&r.season===2027).renewalPlanReserveManYen).toBe(0);
  });
  it('uses the ledger rate rather than a displayed demand and keeps rank stable after a prior declaration',()=>{
    const w=faWinter();w.teams[0].players[0].salary=99999;
    const first=apply(w,declaration(w)),next=apply(first,declaration(first,3));
    expect(next.faPool[0].marketEntry.compensationBasis.previousAnnualSalaryManYen).toBe(12000);
    expect(next.faPool[1].marketEntry.compensationRank).toBe('B');expect(validateEconomySave(next)).toBe('annual');
  });
  it('registers explicit overseas FA rights for the NPB market without an overseas departure or income',()=>{
    const w=faWinter(),n=apply(w,declaration(w,0,{kind:'overseas-fa'}));
    expect(n.faPool[0].marketEntry).toMatchObject({kind:'overseas-fa',compensationRank:'A'});expect(engine(n).spending.oneOffCosts).toEqual([]);
    expect(n.contractEconomy.incomeReceipts).toEqual([]);expect(engine(n).spending.ledger).toEqual(engine(w).spending.ledger);
  });
  it('preserves the existing foreign/exempt rule only for an explicit qualified FA kind',()=>{
    const w=faWinter({foreign:true}),n=apply(w,declaration(w));expect(n.faPool[0].marketEntry).toMatchObject({kind:'domestic-fa',compensationRank:'exempt'});
    expect(n.faPool[0].marketEntry).not.toHaveProperty('compensationBasis');
  });
  it.each([['domestic-fa',959],['overseas-fa',1079]])('refuses insufficient %s qualification at %s days', (kind,days)=>{
    const w=faWinter();w.teams[0].players[0].daysOnActiveRoster=days;denied(w,declaration(w,0,{kind}));
  });
  it('preserves estimated service-year qualification provenance',()=>{const w=faWinter();delete w.teams[0].players[0].daysOnActiveRoster;
    const n=apply(w,declaration(w));expect(engine(n).faDeclarations[0].eligibility.estimated).toBe(true);});
  it.each([{teamId:1},{contractId:'wrong'},{kind:'released'},{notifiedDate:'2026-12-01'},{compensationRank:'C'},{exercise:'first'}])('rejects an invalid/overridden command %j',extra=>{
    const w=faWinter();denied(w,declaration(w,0,extra));
  });
  it.each(['isRetired','_retireNow'])('rejects retired flag %s',field=>{const w=faWinter();w.teams[0].players[0][field]=true;denied(w,declaration(w));});
  it('rejects development and continuing contracts',()=>{for(const opts of [{development:true},{years:3}]){const w=faWinter(opts);denied(w,declaration(w));}});
  it.each([[2,3],[9,10]])('refuses an equal-salary block crossing the %s/%s rank boundary', (a,b)=>{
    let w=faWinter(),r=engine(w).spending.ledger.records[b];r.contract.annualSalaryManYen=engine(w).spending.ledger.records[a].contract.annualSalaryManYen;
    w=fromAnnualState(w,toAnnualState(w));denied(w,declaration(w,a));
  });
  it('permits ties wholly within one compensation rank, excluding development and foreign salary peers',()=>{
    let w=faWinter();engine(w).spending.ledger.records[1].contract.annualSalaryManYen=12000;
    w=fromAnnualState(w,toAnnualState(w));expect(apply(w,declaration(w)).faPool[0].marketEntry.compensationRank).toBe('A');
  });
  it('excludes foreign and development salary peers from the domestic controlled rank',()=>{
    const clubs=structuredClone(faWinter().teams);clubs[0].players[0].isForeign=true;clubs[0].players[1].isForeign=true;clubs[0].players[2].isIkusei=true;
    const w=faWinter({teams:clubs}),n=apply(w,declaration(w,10));expect(n.faPool[0].marketEntry.compensationRank).toBe('B');
  });
  it('retains the closing-year salary rank after a prior winter expiry leaves the same club',()=>{
    let w=faWinter();w=apply(w,envelope(w,{id:'expire',type:'enter-market',teamId:0,playerId:0,contractId:w.teams[0].players[0].contractId,reason:'expiry'}));
    w=apply(w,declaration(w,3));expect(w.faPool.find(p=>p.id===3).marketEntry.compensationRank).toBe('B');expect(validateEconomySave(w)).toBe('annual');
  });
  it('rejects pending formal/human renewal and accepted future employment without cancelling promises',()=>{
    const w=faWinter(),p=renewalEnvelope(w);p.transaction.proposal.contract.agreementPhase='offseason';
    const held=apply(w,p);denied(held,declaration(held));
    const accepted=apply(held,envelope(held,{id:'accepted',type:'accept-renewal',proposalId:'renewal',contractId:p.transaction.contractId}));denied(accepted,declaration(accepted));
    const human=reduceRenewalRequest(w,renewalRequest(w,{type:'offer',playerId:0,salary:20000,years:1}));expect(human.ok,human.error).toBe(true);denied(human.world,declaration(human.world));
  });
  it('rejects a retirement reservation',()=>{
    let w=faWinter();w.contractEconomy.clock={season:2026,phase:'season',date:'2026-07-16',offseasonTurn:0};w.schedule=[null,{date:{month:7,day:16}}];engine(w).spending.budgetSeason=2026;
    w=fromAnnualState(w,toAnnualState(w));const n=apply(w,envelope(w,{id:'retire',type:'reserve-retirement',teamId:0,playerId:0,contractId:w.teams[0].players[0].contractId}));
    n.contractEconomy.clock={season:2026,phase:'offseason',date:'2026-12-01',offseasonTurn:0};engine(n).spending.budgetSeason=2027;
    const off=fromAnnualState(n,toAnnualState(n));denied(off,declaration(off));
  });
  it('refuses season, wrong world clock, and direct-engine dates around the boundary',()=>{
    const w=faWinter(),c=declaration(w),s=toAnnualState(w);
    for(const date of ['2026-11-30','2026-12-02'])expect(applyAnnualTransaction({...s,date},c.transaction).ok).toBe(false);
    const bad=structuredClone(w);bad.contractEconomy.clock.date='2026-11-30';denied(bad,c);
    const legacy={...s,version:1};expect(applyAnnualTransaction(legacy,c.transaction).ok).toBe(false);
  });
  it('uses conservative unknown history without inventing zero or reading faYears',()=>{
    const w=faWinter();delete engine(w).faExerciseOrigins;w.faYears={0:7};const n=apply(w,declaration(w));
    expect(n.faPool[0].marketEntry.compensationBasis.exercise).toBe('legacy-conservative-max');expect(n.faYears).toEqual({0:7});
  });
  it('preserves real migration unknown guarantee/history and uses the observed ledger rate',()=>{
    let w=faWinter(),teams=structuredClone(w.teams);while(teams.length<12)teams.push({id:teams.length,players:[],farm:[],budget:0});
    for(const t of teams)for(const p of [...t.players,...t.farm]){p.contractSignedYear=2024;p.contractYearsLeft=2;p.contractYears=2;}
    const m=prepareEconomyMigration({...w,teams,year:2025,phase:'season',contractEconomy:undefined},{season:2025,stage:'unstarted-offseason',legacyOffseasonStarted:false});expect(m.ok,JSON.stringify(m.issues)).toBe(true);
    engine(w).spending.ledger=m.candidate.ledger;delete engine(w).faExerciseOrigins;w=fromAnnualState(w,toAnnualState(w));
    const n=apply(w,declaration(w));expect(n.faPool[0].marketEntry.compensationBasis).toEqual({previousAnnualSalaryManYen:12000,exercise:'legacy-conservative-max'});
    expect(engine(n).spending.ledger).toEqual(engine(w).spending.ledger);expect(validateEconomySave(n)).toBe('annual');
  });
  it.each([0,1])('hands real declaration evidence to same/other-club acquisition and funded cash settlement (club=%s)',teamId=>{
    let w=faWinter();const c=declaration(w);w=apply(w,c);const p=marketOffer(w,teamId);
    w=apply(w,envelope(w,{id:'offer',type:'offer-fa',proposal:p}));w=apply(w,envelope(w,{id:'accept',type:'accept-fa',proposalId:p.id}));
    if(teamId===1){expect(engine(w).spending.faCompensations[0].resolution).toBe('pending');w=apply(w,envelope(w,{id:'cash',type:'settle-fa-compensation',proposalId:p.id,teamId:0,method:'cash-only'}));
      expect(engine(w).spending.oneOffCosts.map(r=>r.amountManYen)).toEqual([9600,-9600]);}
    else expect(engine(w).spending.faCompensations??[]).toHaveLength(0);
    expect(validateEconomySave(JSON.parse(JSON.stringify(w)))).toBe('annual');expect(reduceEconomyCommand(w,c)).toMatchObject({ok:true,replayed:true});
  });
  it.each([false,true])('records repeat exercise after a real first declaration and later re-signing (unknown=%s)',unknown=>{
    let w=faWinter();if(unknown)delete engine(w).faExerciseOrigins;
    for(const r of engine(w).spending.ledger.records)if(r.contract.playerId!==0){r.contract.termYears=3;r.contract.endSeason=2028;}
    w=fromAnnualState(w,toAnnualState(w));const first=declaration(w);w=apply(w,first);const p=marketOffer(w,0);
    w=apply(w,envelope(w,{id:'offer',type:'offer-fa',proposal:p}));w=apply(w,envelope(w,{id:'accept',type:'accept-fa',proposalId:p.id}));
    w=nextSeasonForDepartureTest(w);w=apply(w,envelope(w,{id:'join',type:'join-fa',proposalId:p.id}));
    w.contractEconomy.clock={season:2027,phase:'offseason',date:'2027-12-01',offseasonTurn:0};engine(w).spending.budgetSeason=2028;
    const policy=economyPolicy(w.teams,2028,1000000),tail=list=>list.filter(r=>r.season===2035);
    engine(w).spending.authorizations.push(...tail(policy.authorizations));engine(w).rosterRequirements.push(...tail(policy.rosterRequirements));w.contractEconomy.budgetPolicies.push(...tail(policy.budgetPolicies));
    w=fromAnnualState(w,toAnnualState(w));const second=envelope(w,{id:'second-declaration',type:'declare-fa',teamId:0,playerId:0,contractId:p.contract.contractId,kind:'domestic-fa'});
    w=apply(w,second);expect(w.faPool[0].marketEntry.compensationBasis.exercise).toBe('repeat');
    expect(engine(w).faDeclarations[1].exercise).toMatchObject({countBefore:unknown?null:1,countAfter:unknown?null:2,priorDeclarationIds:[first.transaction.id]});
    expect(validateEconomySave(JSON.parse(JSON.stringify(w)))).toBe('annual');expect(reduceEconomyCommand(w,first)).toMatchObject({ok:true,replayed:true});
  });
  it('hands the declaration to the existing personnel compensation route',()=>{
    let w=faWinter();w=apply(w,declaration(w));const p=marketOffer(w);
    w=apply(w,envelope(w,{id:'offer',type:'offer-fa',proposal:p}));w=apply(w,envelope(w,{id:'accept',type:'accept-fa',proposalId:p.id}));
    w=apply(w,envelope(w,{id:'protect',type:'submit-fa-protection',proposalId:p.id,teamId:1,protectedPlayerIds:[]}));
    w=apply(w,envelope(w,{id:'personnel',type:'settle-fa-personnel',selections:[{proposalId:p.id,teamId:0,playerId:'other'}]}));
    expect(engine(w).spending.faCompensations[0].resolution).toBe('player-and-cash');expect(engine(w).faPersonnelMoves[0].player.id).toBe('other');
    expect(engine(w).spending.oneOffCosts.map(r=>r.amountManYen)).toEqual([6000,-6000]);expect(validateEconomySave(w)).toBe('annual');
  });
  it('rejects the real zero-service bootstrap and accepts its explicitly qualified player scenario',()=>{
    const teams=createInitialTeams();let candidate,club;
    for(const t of teams){const ps=[...t.players,...t.farm].filter(p=>!p.isIkusei&&!p.育成&&!p.isForeign);
      candidate=ps.find(p=>p.contractYearsLeft===1&&ps.filter(q=>q.salary===p.salary).length===1);if(candidate){club=t;break;}}
    expect(candidate).toBeTruthy();expect(candidate.daysOnActiveRoster).toBe(0);
    const w=faWinter({teams:[club,...teams.filter(t=>t!==club)]}),c=declaration(w,candidate.id);denied(w,c);
    const eligible=structuredClone(w);[...eligible.teams[0].players,...eligible.teams[0].farm].find(p=>p.id===candidate.id).daysOnActiveRoster=1080;
    const n=apply(eligible,c);expect(validateEconomySave(n)).toBe('annual');
  });
  it.each([
    ['receipt',w=>engine(w).transactions.pop()],['row',w=>engine(w).faDeclarations=[]],['both',w=>{engine(w).transactions=[];engine(w).faDeclarations=[];}],
    ['history',w=>w.teams[0].history=[]],['listing',w=>w.faPool=[]],['listing rank',w=>w.faPool[0].marketEntry.compensationRank='C'],
    ['source amount',w=>engine(w).spending.ledger.records[0].contract.annualSalaryManYen=99999],
    ['proof+receipt',w=>{engine(w).faDeclarations[0].marketEntry.compensationBasis.previousAnnualSalaryManYen=99999;engine(w).transactions[0].faDeclaration.marketEntry.compensationBasis.previousAnnualSalaryManYen=99999;}],
    ['history+receipt',w=>{w.teams[0].history=[];engine(w).transactions=[];}],['origin count',w=>engine(w).faExerciseOrigins[0].count=1],
  ])('refuses cold tampering of %s',(_,edit)=>{const w=faWinter(),n=JSON.parse(JSON.stringify(apply(w,declaration(w))));edit(n);expect(()=>validateEconomySave(freezeEconomy(n))).toThrow();});
});
