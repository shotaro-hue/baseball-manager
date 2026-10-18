import {expect,it} from 'vitest';
import {assessCpuAddition,cpuRosterPlan} from '../rosterPlanning';
import {evaluateDraftContinuation} from '../draftContinuation';
import {ensureDraftEvaluation} from '../draftReports';
import {newDraftRules} from '../draftConference';
import * as cycle from '../cpuRosterCycle';
import {cpuRenewContracts} from '../contract';
import {ownedPlayers} from '../renewalRules';

const skills=q=>Object.fromEntries(['contact','power','eye','speed','defense','catching','arm'].map(k=>[k,q]));
const p=(id,q=65,extra={})=>({id,name:String(id),age:29,pos:'一塁手',isPitcher:false,potential:70,salary:500,
 contractYearsLeft:1,stats:{PA:100},batting:skills(q),...extra});
const team=(n=67)=>({id:1,name:'CPU',budget:100000,players:[],farm:Array.from({length:n},(_,i)=>p(`own-${i}`,65,{pos:i<6?'捕手':'一塁手'})),history:[]});
function draftContext(t,pool,q=60,f=65){
 const evaluation=ensureDraftEvaluation({teams:[t],pool,year:2026,myId:0});
 for(const rows of [evaluation.public,...Object.values(evaluation.teams)])for(const r of Object.values(rows)){r.current=q;r.future=f;r.value=q*.65+f*.35;}
 return {rules:newDraftRules(),teams:[t],draftPool:pool,evaluation,year:2026};
}
it('does not buy an ordinary young contingency prospect just because same-age peers are absent',()=>{
 const t=team(),candidate=p('rookie',60,{age:18,potential:65});
 expect(assessCpuAddition(t,candidate,{phase:'draft',report:{current:60,future:65}})).toMatchObject({eligible:false});
 expect(evaluateDraftContinuation(t,[candidate],1,[],draftContext(t,[candidate]))).toMatchObject({continue:false});
});
it('uses current role strength when no young peers exist, preserving the existing two-band exception',()=>{
 const t=team(),candidate=p('elite',60,{age:18,potential:90});
 expect(assessCpuAddition(t,candidate,{phase:'draft',report:{current:60,future:90}})).toMatchObject({eligible:true,reason:'future-upgrade',futureBaseline:65,futureSource:'current-role'});
 const young={...t,farm:t.farm.map(x=>({...x,age:22,potential:80}))};
 expect(assessCpuAddition(young,candidate,{phase:'draft',report:{current:60,future:90}})).toMatchObject({eligible:false,futureBaseline:80,futureSource:'young-peers'});
});
it('does not change the player delegated draft decision for a recorded old conference',()=>{
 const t={...team(),id:0},candidate=p('rookie',60,{age:18,potential:65}),ctx=draftContext(t,[candidate]);
 expect(evaluateDraftContinuation(t,[candidate],1,[],ctx).continue).toBe(true);
});

const positions=['捕手','捕手','捕手','捕手','捕手','捕手','一塁手','二塁手','三塁手','遊撃手','左翼手','中堅手','右翼手'];
function balanced(n=70){
 const list=Array.from({length:n},(_,i)=>i<32?p(`p${i}`,65,{isPitcher:true,pos:i<14?'先発':i<28?'中継ぎ':'抑え',subtype:i<14?'先発':i<28?'中継ぎ':'抑え',
  pitching:Object.fromEntries(['velocity','control','breaking','stamina'].map(k=>[k,65])),stats:{BF:100}}):p(`b${i}`,65,{pos:positions[(i-32)%positions.length]}));
 return {...team(),players:list.slice(0,28),farm:list.slice(28),wins:70,losses:70,city:'東京',league:'セ',lineup:[]};
}
function cycleContext(t,pool,q=65,f=80){return {...draftContext(t,pool,q,f),farmCompetition:{year:2026,players:[]}};}
it.each([65,67,69,70])('replaces a redundant expiring player at %i only when a viable rookie improves that role',n=>{
 const t=balanced(n),weak=p('weak',35,{age:31,potential:40,pos:'一塁手',stats:{PA:0}});t.farm[t.farm.length-1]=weak;
 const pool=[p('upgrade',60,{age:18,pos:'一塁手',potential:85})],ctx=cycleContext(t,pool);
 const plan=cycle.planCpuRenewals(t,ctx);
 expect(plan.releaseIds).toEqual(['weak']);
 expect(plan.replacements[0]).toMatchObject({releaseId:'weak',prospectId:'upgrade',reason:'rookie-current-upgrade'});
 const before=structuredClone(t),result=cpuRenewContracts([t],0,[t],ctx),next=result.updatedTeams[0];
 expect(ownedPlayers(next).some(p=>p.id==='weak')).toBe(false);
 expect(result.newFaPlayers.find(p=>p.id==='weak')).toMatchObject({departureReason:'roster-renewal',isWaiverReleased:true});
 expect(next.history.find(p=>p.id==='weak')).toMatchObject({exitYear:2026,exitReason:'戦力外'});
 expect(t).toEqual(before);
});
it('retains covered veterans, young upside and ongoing contracts when the class cannot improve them',()=>{
 const t=balanced(),pool=[p('weak-rookie',30,{age:18,potential:35})],ctx=cycleContext(t,pool,30,35);
 t.farm[0]={...t.farm[0],age:39};t.farm[1]={...t.farm[1],age:18,potential:95};
 expect(cycle.planCpuRenewals(t,ctx).releaseIds).toEqual([]);
 t.farm[t.farm.length-1]=p('contracted',25,{contractYearsLeft:3});
 expect(cycle.planCpuRenewals(t,cycleContext(t,[p('elite',95,{age:18,potential:99})],95,99)).releaseIds).not.toContain('contracted');
});
it('protects six catchers and both operating lineups even with superior replacements available',()=>{
 const t=balanced(65);t.farm=t.farm.filter(x=>x.pos!=='捕手').concat(Array.from({length:6},(_,i)=>p(`catcher-${i}`,40,{pos:'捕手',potential:40})));
 const pool=[p('star-catcher',95,{age:18,pos:'捕手',potential:99})];
 expect(cycle.planCpuRenewals(t,cycleContext(t,pool,95,99)).releaseIds).toEqual([]);
});
it('does not promise the same prospect twice or release an entire position for one exceptional candidate',()=>{
 const t=balanced();t.farm.splice(-2,2,p('weak-a',25,{potential:30}),p('weak-b',25,{potential:30}));
 const pool=[p('only-one',85,{age:18,potential:95})];
 const plan=cycle.planCpuRenewals(t,cycleContext(t,pool,85,95));
 expect(plan.releaseIds).toHaveLength(1);expect(new Set(plan.replacements.map(r=>r.prospectId)).size).toBe(1);
});
it('protects an actual rookie opportunity from an inferior exceptional FA at69, but allows a superior star',()=>{
 const t=balanced(69),rookie=p('rookie',85,{age:18,potential:90,salary:1500}),ctx={...draftContext(t,[rookie],85,90),phase:'offseason',cpuOpportunityPlanning:1};
 const plan=cpuRosterPlan(t,ctx);
 expect(plan).toMatchObject({draftRemaining:1,rookieReserve:1500});
 const fa=p('FA',85,{age:30,potential:90});
 expect(assessCpuAddition(t,fa,{...ctx,rosterPlan:plan})).toMatchObject({eligible:false,reason:'draft-opportunity'});
 expect(assessCpuAddition(t,p('star',99,{age:30}),{...ctx,rosterPlan:plan})).toMatchObject({eligible:true,displacedDraftSlots:1,draftRemaining:0});
 expect(assessCpuAddition(t,fa,{...ctx,rosterPlan:plan,manual:true})).toMatchObject({eligible:true,reason:'player-choice'});
});
it('does not invent a rookie reservation for a weak class, and keeps recorded zero distinct from old saves',()=>{
 const t=balanced(65),pool=[p('weak',20,{age:18,potential:30})],ctx={...draftContext(t,pool,20,30),phase:'offseason',cpuOpportunityPlanning:1};
 expect(cpuRosterPlan(t,ctx)).toMatchObject({draftRemaining:0,rookieReserve:0});
 expect(cpuRosterPlan(t,{phase:'offseason'}).draftRemaining).toBe(2);
});
