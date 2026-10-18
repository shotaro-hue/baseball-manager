import {expect,it} from 'vitest';
import {assessCpuAddition} from '../rosterPlanning';
import {evaluateDraftContinuation} from '../draftContinuation';
import {ensureDraftEvaluation} from '../draftReports';
import {newDraftRules} from '../draftConference';

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
