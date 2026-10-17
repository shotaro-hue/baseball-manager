import {expect,it} from 'vitest';
import {resolveFirstRound} from '../draftRules';
import {processCpuFaBids} from '../contract';
import {evaluateDraftContinuation} from '../draftContinuation';
import {ensureDraftEvaluation} from '../draftReports';
import {newDraftRules} from '../draftConference';
const p=(id,extra={})=>({id,name:String(id),pos:'捕手',isPitcher:false,age:26,salary:500,potential:70,trust:60,hometown:'東京',personality:{money:50,winning:50,playing:50,hometown:30,loyalty:50,stability:50,future:50},batting:Object.fromEntries(['contact','power','eye','speed','defense','catching','arm','clutch'].map(k=>[k,60])),...extra});
const t=(n=65)=>({id:1,name:'CPU',city:'東京',league:'セ',wins:70,losses:70,budget:100000,players:[],farm:Array.from({length:n},(_,i)=>p(`own${i}`)),lineup:[],history:[]});
const mine={id:0,name:'自球団',players:[],farm:[],budget:0};
it('retains draft capacity before CPU offseasonFA and records why an exceptional acquisition crosses67',()=>{
 const cpu=t(),ordinary=p('ordinary'),strong=p('strong',{batting:Object.fromEntries(Object.keys(ordinary.batting).map(k=>[k,95]))});
 const blocked=processCpuFaBids([mine,cpu],0,[ordinary],[mine,cpu],2026,'offseason');expect(blocked.claimed||[]).toHaveLength(0);
 const allowed=processCpuFaBids([mine,cpu],0,[strong],[mine,cpu],2026,'offseason');expect(allowed.claimed).toHaveLength(1);expect(allowed.claimed[0].rosterDecision).toBe('current-upgrade');expect(allowed.updatedTeams[1].budget).toBe(99500);
});
it('preserves a fixed draft reserve through consecutive ordinary FA acquisitions',()=>{
 const cpu=t(60),pool=[p('a'),p('b'),p('c')],r=processCpuFaBids([mine,cpu],0,pool,[mine,cpu],2026,'offseason');
 expect(r.claimed).toHaveLength(1);expect(r.updatedTeams[1].farm.length+r.updatedTeams[1].players.length).toBe(61);expect(r.remainingFaPool).toHaveLength(2);
});
it('rejects depth-only draft additions above67 and retains manual delegation compatibility',()=>{
 const cpu=t(67);cpu.farm=cpu.farm.map((p,i)=>i<5?p:{...p,pos:'一塁手'});const pool=[p('prospect')],evaluation=ensureDraftEvaluation({teams:[cpu],pool,year:2026,myId:0});
 for(const reports of [evaluation.public,...Object.values(evaluation.teams)])for(const r of Object.values(reports)){r.current=60;r.future=60;r.value=60;}
 const context={rules:newDraftRules(),teams:[cpu],draftPool:pool,evaluation};
 expect(evaluateDraftContinuation(cpu,pool,2,[],context)).toMatchObject({continue:false,reason:'normal-target'});
 expect(resolveFirstRound([cpu],pool,context).endedTeams[1]).toBe('normal-target');
 expect(evaluateDraftContinuation(cpu,pool,2,[],{...context,evaluation:{...evaluation,myId:1}}).continue).toBe(true);
});
it('counts accepted-array reservations even when the caller has no canonical pool assignments',()=>{
 const cpu=t(65);cpu.farm=cpu.farm.map((p,i)=>i<5?p:{...p,pos:'一塁手'});
 const pool=[p('candidate')],accepted=[p('r1',{pos:'一塁手'}),p('r2',{pos:'一塁手'}),p('r3',{pos:'一塁手'})],evaluation=ensureDraftEvaluation({teams:[cpu],pool:[...accepted,...pool],year:2026,myId:0});
 for(const reports of [evaluation.public,...Object.values(evaluation.teams)])for(const r of Object.values(reports)){r.current=60;r.future=60;r.value=60;}
 expect(evaluateDraftContinuation(cpu,pool,4,accepted,{rules:newDraftRules(),teams:[cpu],evaluation}).continue).toBe(false);
});
it('closes a contingency operating shortage when an accepted same-role rookie already covers it',()=>{
 const cpu=t(67);cpu.farm=cpu.farm.map((p,i)=>i===0?p:{...p,pos:'一塁手'});
 const accepted=[p('accepted')],pool=[p('candidate')];
 const evaluation=ensureDraftEvaluation({teams:[cpu],pool:[...accepted,...pool],year:2026,myId:0});
 for(const reports of [evaluation.public,...Object.values(evaluation.teams)])for(const r of Object.values(reports)){r.current=60;r.future=60;r.value=60;}
 const context={rules:newDraftRules(),teams:[cpu],evaluation};
 expect(evaluateDraftContinuation(cpu,pool,2,[],context).decisions[0]).toMatchObject({eligible:true,rosterReason:'operating-shortage',projectedCount:68});
 expect(evaluateDraftContinuation(cpu,pool,3,accepted,context)).toMatchObject({continue:false,reason:'normal-target'});
 // A different role and a refused pick must not pretend to cover catcher demand.
 expect(evaluateDraftContinuation(cpu,pool,3,[{...accepted[0],pos:'一塁手'}],context).decisions[0]).toMatchObject({eligible:true,rosterReason:'operating-shortage'});
 expect(evaluateDraftContinuation(cpu,pool,3,[],{...context,draftPool:[...accepted,...pool],drafted:{accepted:'refused'}}).decisions[0]).toMatchObject({eligible:true,rosterReason:'operating-shortage'});
});
