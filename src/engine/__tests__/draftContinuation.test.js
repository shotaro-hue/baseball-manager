import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {evaluateDraftContinuation} from '../draftContinuation';
import {newDraftRules} from '../draftConference';
import {ensureDraftEvaluation} from '../draftReports';
import {chooseDraftProspect,forecastDraft,resolveFirstRound} from '../draftRules';
const p=(id,q=70,extra={})=>({id,name:String(id),age:22,pos:'捕手',isPitcher:false,potential:q,
 batting:Object.fromEntries(['contact','power','eye','speed','defense','catching','arm'].map(k=>[k,q])),...extra});
const team={id:0,players:[],farm:Array.from({length:6},(_,i)=>p(`C${i}`,70))};
const session=(pool,teams=[team])=>ensureDraftEvaluation({teams,pool,year:2026,myId:0});
function context(pool,q=65){const evaluation=session(pool);for(const r of [evaluation.public,...Object.values(evaluation.teams)])for(const v of Object.values(r)){v.current=q;v.future=q;v.value=q;}return {rules:newDraftRules(),teams:[team],draftPool:pool,evaluation};}
it('ends with covered catchers of similar quality but allows a clear current upgrade above six',()=>{
 const pool=[p('same'),p('upgrade')],ctx=context(pool);
 let d=evaluateDraftContinuation(team,pool,2,[],ctx);
 expect(d).toMatchObject({continue:false,reason:'no-upgrade',candidates:[]});
 ctx.evaluation.teams[0].upgrade.current=80;
 d=evaluateDraftContinuation(team,pool,2,[],ctx);
 expect(d.candidates.map(p=>p.id)).toEqual(['upgrade']);
 expect(d.decisions.find(d=>d.id==='upgrade')).toMatchObject({reason:'current-upgrade',currentBaseline:70});
 expect(chooseDraftProspect(team,pool,2,[],ctx).id).toBe('upgrade');
});
it('fills genuine shortages, then includes accepted observed picks in depth and future comparisons',()=>{
 const sparse={...team,farm:team.farm.slice(0,5)},pool=[p(0),p('next')],ctx=context(pool,60);
 expect(evaluateDraftContinuation(sparse,pool,2,[],ctx).continue).toBe(true);
 const drafted={0:0};
 expect(evaluateDraftContinuation(sparse,[pool[1]],3,[pool[0]],{...ctx,drafted}).continue).toBe(false);
 ctx.evaluation.teams[0].next.future=90;
 expect(evaluateDraftContinuation(sparse,[pool[1]],3,[pool[0]],{...ctx,drafted}).continue).toBe(true);
 expect(evaluateDraftContinuation(sparse,[pool[1]],3,[],{...ctx,drafted:{0:'refused'}}).continue).toBe(true);
});
it('keeps legacy choices and excludes ended teams from public forecasts without private leaks',()=>{
 const pool=[p('x')],ctx=context(pool),other={...team,id:1};ctx.teams=[team,other];ctx.evaluation=session(pool,ctx.teams);
 const ended={...ctx,endedTeams:{1:'manual'}};
 expect(forecastDraft(ctx.teams,pool,0,ended).x.mass).toBe(0);
 const before=forecastDraft(ctx.teams,pool,0,ctx);
 expect(forecastDraft(ctx.teams,pool,0,{...ctx,evaluation:{...ctx.evaluation,teams:{}}})).toEqual(before);
 expect(chooseDraftProspect(team,pool,2,[],{evaluation:ctx.evaluation})).not.toBeNull();
 expect(resolveFirstRound(ctx.teams,pool,{...ended,endedTeams:{0:'manual',1:'manual'}}).picks).toEqual({});
});
it('uses the recorded 6→8→11 inputs to distinguish strong first-round talent from repeat depth',()=>{
 for(const year of [2026,2027]){
  const f=JSON.parse(gunzipSync(readFileSync(new URL(`../../../docs/validation/variable-draft/catcher-trace-${year}.json.gz`,import.meta.url))));
  const ctx={rules:newDraftRules(),teams:[f.team],draftPool:f.pool,evaluation:f.evaluation};
  const rows=f.trace.filter(r=>r.selectedPos==='捕手');
  for(const row of rows){
   const pick=f.pool.find(p=>p.id===row.selectedId);
   const prior=f.pool.filter(p=>row.priorPicks.some(x=>x.id===p.id));
   const d=evaluateDraftContinuation(f.team,[pick],row.round,prior,{...ctx,drafted:Object.fromEntries(prior.map(p=>[p.id,f.team.id]))}).decisions[0];
   expect(d.reason,`${year} round ${row.round}`).toBe(year===2027&&row.round===1?'current-upgrade':'no-upgrade');
  }
 }
});
it('uses the validated accepted record when a rejected same-ID record has another role',()=>{
 const sparse={...team,farm:team.farm.slice(0,5)};
 const pool=[p(0,60,{pos:'先発',isPitcher:true,_drafted:true,_r1winner:1}),p(0,60),p('next',60)];
 const ctx=context(pool,60);
 expect(evaluateDraftContinuation(sparse,[pool[2]],3,[],{...ctx,drafted:{0:0}}).continue).toBe(false);
});
it('never reads hidden prospect abilities or potential to decide continuation',()=>{
 const pool=[p('x')],ctx=context(pool,85);
 const before=evaluateDraftContinuation(team,pool,2,[],ctx);
 const changed=pool.map(p=>({...p,potential:1,batting:{contact:1}}));
 expect(evaluateDraftContinuation(team,changed,2,[],ctx)).toEqual({...before,candidates:changed});
});
