import {it,expect} from 'vitest';
import {renewalFixture} from './fixtures/renewalWorld';
import {reduceEconomyCommand,toAnnualState} from '../contractEconomy';
import {cpuContractsRequest} from '../annualCpuContracts';
import {validateEconomySave} from '../economyPersistence';
import {contractEmploymentAt} from '../contractLedger';
it('rejects a renewed CPU result missing both accepted reservation and ledger promise',()=>{
 const w=renewalFixture({phase:'offseason',date:'2026-12-01'});
 const r=reduceEconomyCommand(w,cpuContractsRequest(w));expect(r.ok,r.error).toBe(true);
 const n=JSON.parse(JSON.stringify(r.world)),s=n.contractEconomy.engine.spending;
 s.ledger.records=s.ledger.records.filter(r=>r.contract.purpose!=='renewal');
 s.resolvedReservations=s.resolvedReservations.filter(r=>r.kind!=='renewal');
 // Authoritative projection corrects wallet just as a normal reload does.
 for(const t of n.teams)t.budget=w.teams.find(x=>x.id===t.id).budget;
 expect(()=>validateEconomySave(n)).toThrow();
});
import {createAnnualNewGameWorld,fromAnnualState} from '../contractEconomy';
import {economyPolicy} from './fixtures/economyWorld';
import {ensureDraftEvaluation} from '../draftReports';
import {planCpuRenewals} from '../cpuRosterCycle';
const skills=q=>Object.fromEntries(['contact','power','eye','speed','defense','catching','arm'].map(k=>[k,q]));
const p=(id,q=65,extra={})=>({id,name:String(id),age:29,pos:'一塁手',isPitcher:false,potential:70,salary:500,contractYearsLeft:1,stats:{PA:100},batting:skills(q),...extra});
it('uses ledger expiry for native CPU replacement planning despite the projected signed year',()=>{
 const positions=['捕手','捕手','捕手','捕手','捕手','捕手','一塁手','二塁手','三塁手','遊撃手','左翼手','中堅手','右翼手'];
 const list=Array.from({length:65},(_,i)=>i<32?p(`p${i}`,65,{isPitcher:true,pos:i<14?'先発':i<28?'中継ぎ':'抑え',subtype:i<14?'先発':i<28?'中継ぎ':'抑え',pitching:Object.fromEntries(['velocity','control','breaking','stamina'].map(k=>[k,65])),stats:{BF:100}}):p(`b${i}`,65,{pos:positions[(i-32)%positions.length]}));
 list[list.length-1]=p('weak',35,{age:31,potential:40,stats:{PA:0}});
 const clubs=[{id:0,name:'Human',players:[p('human')],farm:[]},{id:1,name:'CPU',players:list.slice(0,28),farm:list.slice(28),wins:70,losses:70,city:'東京',league:'セ',lineup:[]}];
 let w=createAnnualNewGameWorld({teams:clubs,faPool:[],myId:0,saveId:'review-roster',season:2026,policy:economyPolicy(clubs,2026,1000000),randomRoot:{algorithmVersion:1,seed:'review'}});
 w.contractEconomy.clock={season:2026,phase:'offseason',date:'2026-12-01',offseasonTurn:0};w.contractEconomy.engine.spending.budgetSeason=2027;
 w=fromAnnualState(w,toAnnualState(w));
 const team=w.teams[1],pool=[p('upgrade',60,{age:18,potential:85})];
 const evaluation=ensureDraftEvaluation({teams:w.teams,pool,year:2026,myId:0});
 for(const rows of [evaluation.public,...Object.values(evaluation.teams)])for(const r of Object.values(rows)){r.current=85;r.future=90;r.value=86.75;}
 const ctx={teams:w.teams,draftPool:pool,evaluation,year:2026};
 expect(team.farm.at(-1).contractYearsLeft).toBe(1);
 expect(planCpuRenewals(team,ctx).releaseIds).toEqual([]);
 w.offseasonPlan={year:2026,draftPool:pool,draftEvaluation:evaluation};
 const result=reduceEconomyCommand(w,cpuContractsRequest(w));expect(result.ok,result.error).toBe(true);
 expect(result.world.contractEconomy.engine.transactions.at(-1).cpuContracts.rows.find(r=>r.playerId==='weak').outcome).toBe('release');
 expect(result.world.faPool.find(p=>p.id==='weak')).toMatchObject({departureReason:'release',marketEntry:{kind:'released'}});
 expect(validateEconomySave(result.world)).toBe('annual');
});
