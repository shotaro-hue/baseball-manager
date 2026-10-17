import {expect,it} from 'vitest';
import * as planning from '../rosterPlanning';
const p=(id,q=60,extra={})=>({id,name:String(id),pos:'捕手',age:26,potential:70,isPitcher:false,salary:440,contractYearsLeft:1,
 batting:Object.fromEntries(['contact','power','eye','speed','defense','catching','arm'].map(k=>[k,q])),...extra});
const team=(n=60,extra={})=>({id:0,players:[],farm:Array.from({length:n},(_,i)=>p(`owned-${i}`)),budget:100000,history:[],...extra});
const planFor=(t,extra={})=>({version:1,year:2026,myId:0,reinforcements:planning.newReinforcementPlan?.(t,2026),...extra});
it('records new goals and reserves two prospective rookies at65 without changing ownership',()=>{
 const t=team(65),before=structuredClone(t);
 expect(planning.newReinforcementPlan?.(t,2026)).toMatchObject({version:1,draftGoal:2,faGoal:0,conversionIds:[],baselineFaIds:[]});
 expect(planning.cpuRosterPlan?.(t)).toMatchObject({draftRemaining:2,rookieReserve:840});expect(t).toEqual(before);
});
it('projects goals separately from actual slots and consumes actual FA acquisitions once',()=>{
 const t=team(),plan=planFor(t);plan.reinforcements={...plan.reinforcements,draftGoal:6,faGoal:3,conversionIds:[0]};t.farm.push(p(0,50,{isIkusei:true}));
 const first=planning.reinforcementProjection?.(t,plan,2026);
 expect(first).toMatchObject({recorded:true,draftRemaining:6,faRemaining:3,conversionRemaining:1,projectedControlledCount:70,remainingSlots:10});
 const incoming=p('new');const next={...t,farm:[...t.farm,incoming],history:[{...incoming,exitYear:2026,exitReason:'fa'}]};
 expect(planning.reinforcementProjection?.(next,plan,2026)).toMatchObject({faRemaining:2,projectedControlledCount:70,remainingSlots:9});
});
it('excludes market acquisitions before the plan and counts same-year post-plan acquisitions after release',()=>{
 const prior=p('old'),t=team(60,{history:[{...prior,exitYear:2026,exitReason:'fa'}]}),plan=planFor(t);
 plan.reinforcements={...plan.reinforcements,draftGoal:0,faGoal:2};
 expect(planning.reinforcementProjection?.(t,plan,2026)).toMatchObject({faRemaining:2});
 t.history.push({...p('gone'),exitYear:2026,exitReason:'waiver_fa'});
 expect(planning.reinforcementProjection?.(t,plan,2026)).toMatchObject({faRemaining:1,projectedControlledCount:61});
});
it('removes conversion reservations after conversion or release, and supports IDzero',()=>{
 const dev=p(0,50,{育成:true}),t=team(60,{farm:[...team().farm,dev]}),plan=planFor(t);
 plan.reinforcements={...plan.reinforcements,draftGoal:0,conversionIds:[0,0]};
 expect(planning.reinforcementProjection?.(t,plan,2026)).toMatchObject({conversionRemaining:1,projectedControlledCount:61});
 expect(planning.reinforcementProjection?.({...t,farm:t.farm.map(p=>p.id===0?{...p,育成:false}:p)},plan,2026)).toMatchObject({conversionRemaining:0,projectedControlledCount:61});
 expect(planning.reinforcementProjection?.({...t,farm:t.farm.filter(p=>p.id!==0)},plan,2026)).toMatchObject({conversionRemaining:0,projectedControlledCount:60});
});
it('separates recorded zero, missing goals, and invalid goals',()=>{
 const t=team();expect(planning.reinforcementProjection?.(t,{year:2026},2026)).toMatchObject({recorded:false,draftRemaining:null,faRemaining:null});
 const plan=planFor(t);plan.reinforcements={...plan.reinforcements,draftGoal:0,faGoal:0};
 expect(planning.reinforcementProjection?.(t,plan,2026)).toMatchObject({recorded:true,draftRemaining:0,faRemaining:0});
 for(const draftGoal of [-1,1.5,'6',11])expect(planning.reinforcementProjection?.(t,{...plan,reinforcements:{...plan.reinforcements,draftGoal}},2026)).toMatchObject({ok:false});
});
it('subtracts nominations including refusal from draft goals and never double-counts accepted picks',()=>{
 const t=team(),pool=[p(0),p(1)],plan=planFor(t,{draftPool:pool,draftViews:{draft:{drafted:{0:0,1:'refused'},log:[{team:0,player:1,refused:true}]}}});
 plan.reinforcements={...plan.reinforcements,draftGoal:6};
 expect(planning.reinforcementProjection?.(t,plan,2026)).toMatchObject({draftRemaining:4,acceptedPickCount:1,projectedControlledCount:65});
});
it('release intentions reduce the projection but never create actual slots',()=>{
 const t=team(70),plan=planFor(t,{intents:[{id:'owned-0',value:'release'}]});plan.reinforcements={...plan.reinforcements,draftGoal:2};
 expect(planning.reinforcementProjection?.(t,plan,2026)).toMatchObject({remainingSlots:0,projectedControlledCount:71,projectedOverBy:1});
});
it('ordinary CPUFA keeps draft reservations while current upgrades may pass67 with an explicit reason',()=>{
 const t=team(65);
 expect(planning.assessCpuAddition?.(t,p('same'),{phase:'offseason'})).toMatchObject({eligible:false,reason:'normal-target',projectedCount:68});
 expect(planning.assessCpuAddition?.(t,p('strong',90),{phase:'offseason'})).toMatchObject({eligible:true,reason:'current-upgrade',projectedCount:68});
});
it('blocks ordinary depth beyond67 but permits genuine operating shortage and young upgrades',()=>{
 const t=team(67);
 expect(planning.assessCpuAddition?.(t,p('same'),{phase:'draft'})).toMatchObject({eligible:false,reason:'normal-target'});
 expect(planning.assessCpuAddition?.(t,p('pitch',60,{isPitcher:true,pos:'先発',subtype:'先発'}),{phase:'draft'})).toMatchObject({eligible:true,reason:'operating-shortage'});
 expect(planning.assessCpuAddition?.(t,p('future',60,{age:18,potential:90}),{phase:'draft'})).toMatchObject({eligible:true,reason:'future-upgrade'});
});
it('always enforces70, preserves a manual player choice below70, and reserves rookie salary without deducting current payroll',()=>{
 expect(planning.assessCpuAddition?.(team(70),p('upgrade',99),{phase:'draft'})).toMatchObject({eligible:false,reason:'roster-full'});
 expect(planning.assessCpuAddition?.(team(69),p('same'),{phase:'draft',manual:true})).toMatchObject({eligible:true,reason:'player-choice'});
 const t=team(60,{budget:3000});
 expect(planning.assessCpuAddition?.(t,p('strong',99),{phase:'offseason',salary:440})).toMatchObject({eligible:false,reason:'rookie-budget'});expect(t.budget).toBe(3000);
});
it('uses candidate observations in the draft, never hidden current or future skills',()=>{
 const t=team(67),candidate=p('x',99,{age:18,potential:99});
 expect(planning.assessCpuAddition?.(t,candidate,{phase:'draft',report:{current:55,future:55}})).toMatchObject({eligible:false,reason:'normal-target'});
});

it('reconciles draft留保 after an exceptional FA uses the final hard-cap slot',()=>{const t=team(69);expect(planning.assessCpuAddition?.(t,p('great',99),{phase:'offseason',rosterPlan:{draftRemaining:6}})).toMatchObject({eligible:true,projectedCount:70,draftRemaining:0});});
it('treats a development-flagged draft prospect as a controlled acquisition',()=>{expect(planning.assessCpuAddition(team(67),p('scouted',60,{育成:true,isIkusei:true}),{phase:'draft',report:{current:55,future:55}})).toMatchObject({eligible:false,reason:'normal-target',projectedCount:68});});
it('requires two report bands to spend the final three contingency slots',()=>{
 expect(planning.assessCpuAddition(team(67),p('small-current',75),{phase:'draft'})).toMatchObject({eligible:false,reason:'normal-target'});
 const young=team(67);young.farm=young.farm.map(p=>({...p,age:22,potential:80}));
 expect(planning.assessCpuAddition(young,p('small-future',60,{age:18,potential:90}),{phase:'draft'})).toMatchObject({eligible:false,reason:'normal-target'});
 expect(planning.assessCpuAddition(young,p('clear-current',85),{phase:'draft'})).toMatchObject({eligible:true,reason:'current-upgrade'});
});
