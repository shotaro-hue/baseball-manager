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
 const cpu=t(67);cpu.farm=cpu.farm.map((p,i)=>i<6?p:{...p,pos:i===6?'遊撃手':'一塁手'});const pool=[p('prospect',{pos:'遊撃手'})],evaluation=ensureDraftEvaluation({teams:[cpu],pool,year:2026,myId:0});
 for(const reports of [evaluation.public,...Object.values(evaluation.teams)])for(const r of Object.values(reports)){r.current=60;r.future=60;r.value=60;}
 const context={rules:newDraftRules(),teams:[cpu],draftPool:pool,evaluation};
 expect(evaluateDraftContinuation(cpu,pool,2,[],context)).toMatchObject({continue:false,reason:'normal-target'});
 expect(resolveFirstRound([cpu],pool,context).endedTeams[1]).toBe('normal-target');
 expect(evaluateDraftContinuation(cpu,pool,2,[],{...context,evaluation:{...evaluation,myId:1}}).continue).toBe(true);
});
it('counts accepted-array reservations even when the caller has no canonical pool assignments',()=>{
 const cpu=t(65);cpu.farm=cpu.farm.map((p,i)=>i<6?p:{...p,pos:i===6?'遊撃手':'一塁手'});
 const pool=[p('candidate',{pos:'遊撃手'})],accepted=[p('r1',{pos:'一塁手'}),p('r2',{pos:'一塁手'}),p('r3',{pos:'一塁手'})],evaluation=ensureDraftEvaluation({teams:[cpu],pool:[...accepted,...pool],year:2026,myId:0});
 for(const reports of [evaluation.public,...Object.values(evaluation.teams)])for(const r of Object.values(reports)){r.current=60;r.future=60;r.value=60;}
 expect(evaluateDraftContinuation(cpu,pool,4,accepted,{rules:newDraftRules(),teams:[cpu],evaluation}).continue).toBe(false);
});
it('closes a contingency operating shortage when an accepted same-role rookie already covers it',()=>{
 const starter=id=>p(id,{isPitcher:true,pos:'先発',subtype:'先発',pitching:Object.fromEntries(['velocity','control','stamina','breaking','variety','sharpness','tempo','clutchP','recovery','durability'].map(k=>[k,60]))});
 const cpu=t(67);cpu.farm=cpu.farm.map((p,i)=>i<3?starter(p.id):i<9?p:{...p,pos:'一塁手'});
 const accepted=[starter('accepted')],pool=[starter('candidate')];
 const evaluation=ensureDraftEvaluation({teams:[cpu],pool:[...accepted,...pool],year:2026,myId:0});
 for(const reports of [evaluation.public,...Object.values(evaluation.teams)])for(const r of Object.values(reports)){r.current=60;r.future=60;r.value=60;}
 const context={rules:newDraftRules(),teams:[cpu],evaluation};
 expect(evaluateDraftContinuation(cpu,pool,2,[],context).decisions[0]).toMatchObject({eligible:true,rosterReason:'operating-shortage',projectedCount:68});
 expect(evaluateDraftContinuation(cpu,pool,3,accepted,context)).toMatchObject({continue:false,reason:'no-upgrade'});
 expect(evaluateDraftContinuation(cpu,pool,3,accepted,context).decisions[0].rosterReason).toBe('normal-target');
 // A different role and a refused pick must not pretend to cover starter demand.
 expect(evaluateDraftContinuation(cpu,pool,3,[{...accepted[0],pos:'中継ぎ',subtype:'中継ぎ'}],context).decisions[0]).toMatchObject({eligible:true,rosterReason:'operating-shortage'});
 expect(evaluateDraftContinuation(cpu,pool,3,[],{...context,draftPool:[...accepted,...pool],drafted:{accepted:'refused'}}).decisions[0]).toMatchObject({eligible:true,rosterReason:'operating-shortage'});
});

it('fills the final two slots with missing catchers instead of a higher-rated unrelated FA',()=>{
 const cpu=t(68);cpu.farm=cpu.farm.map((p,i)=>i<4?p:{...p,pos:'一塁手'});
 const star=p('star',{pos:'一塁手',batting:Object.fromEntries(Object.keys(p('x').batting).map(k=>[k,99]))});
 const r=processCpuFaBids([mine,cpu],0,[star,p('catcher5'),p('catcher6')],[mine,cpu],2026,'offseason');
 expect(r.claimed.map(c=>c.player.id)).toEqual(['catcher5','catcher6']);
 expect(r.claimed.every(c=>c.rosterDecision==='catcher-depth-shortage')).toBe(true);
 const all=[...r.updatedTeams[1].players,...r.updatedTeams[1].farm];
 expect(all.filter(p=>p.pos==='捕手')).toHaveLength(6);
 expect(all).toHaveLength(70);expect(r.remainingFaPool.map(p=>p.id)).toEqual(['star']);
});
it('closes catcher depth with accepted picks without consuming the same reserved slots twice',()=>{
 const cpu=t(68);cpu.farm=cpu.farm.map((p,i)=>i<4?p:{...p,pos:'一塁手'});
 const pool=[p('catcher5'),p('catcher6'),p('star',{pos:'一塁手'})],evaluation=ensureDraftEvaluation({teams:[cpu],pool,year:2026,myId:0});
 for(const reports of [evaluation.public,...Object.values(evaluation.teams)])for(const r of Object.values(reports)){r.current=60;r.future=60;r.value=60;}
 const ctx={rules:newDraftRules(),teams:[cpu],draftPool:pool,evaluation};
 let d=evaluateDraftContinuation(cpu,pool,1,[],ctx);
 expect(d.candidates.map(p=>p.id)).toEqual(['catcher5','catcher6']);
 d=evaluateDraftContinuation(cpu,pool.slice(1),2,[pool[0]],{...ctx,drafted:{catcher5:1}});
 expect(d.candidates.map(p=>p.id)).toEqual(['catcher6']);
 expect(evaluateDraftContinuation(cpu,[pool[2]],3,pool.slice(0,2),{...ctx,drafted:{catcher5:1,catcher6:1}})).toMatchObject({continue:false,reason:'roster-full'});
});
