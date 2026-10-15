import {afterEach,expect,it,vi} from 'vitest';
import {chooseDraftProspect,rankDraftProspects,forecastDraft,resolveFirstRound} from '../draftRules';
import {ensureDraftEvaluation} from '../draftReports';
const teams=Array.from({length:12},(_,id)=>({id,wins:50,losses:70,players:[],farm:[]}));
const p=(id,q=65)=>({id,name:String(id),age:22,pos:'外野手',potential:q,readinessScore:50,
  batting:{contact:q,power:q,eye:q,speed:q,defense:q,arm:q}});
const pool=Array.from({length:20},(_,i)=>p(i));
const evaluation=(candidates=pool)=>ensureDraftEvaluation({teams,pool:candidates,year:2026,myId:0});
afterEach(()=>vi.restoreAllMocks());
it('uses observed ability rather than array position or hidden potential',()=>{
 const e=evaluation(),ctx={teams,evaluation:e};
 const a=chooseDraftProspect(teams[0],pool,1,[],ctx);
 expect(chooseDraftProspect(teams[0],[...pool].reverse(),1,[],ctx).id).toBe(a.id);
 expect(chooseDraftProspect(teams[0],pool.map(p=>({...p,potential:1,batting:{contact:1}})),1,[],ctx).id).toBe(a.id);
 expect(rankDraftProspects(teams[0],pool,1,[],ctx)[0]).toHaveProperty('fitReason');
});
it('public forecasts do not read private reports or already computed nominations',()=>{
 const e=evaluation(),before=forecastDraft(teams,pool,0,{evaluation:e});
 const changed={...e,teams:{}};
 expect(forecastDraft(teams,pool,0,{evaluation:changed,cpuPicks:{1:pool[19]}})).toEqual(before);
});
it('keeps a clearly superior candidate worth contesting',()=>{
 const candidates=[p('star',98),...Array.from({length:12},(_,i)=>p(i,45))];
 const ctx={teams,evaluation:evaluation(candidates)};
 expect(teams.map(t=>chooseDraftProspect(t,candidates,1,[],ctx).id).filter(id=>id==='star')).toHaveLength(12);
});
it('splits close candidates more than the old shared ordering and fixed departure',()=>{
 vi.spyOn(Math,'random').mockReturnValue(.9);
 const old=new Set(teams.map(t=>chooseDraftProspect(t,pool).id));
 const ctx={teams,evaluation:evaluation()};
 const chosen=new Set(teams.map(t=>chooseDraftProspect(t,pool,1,[],ctx).id));
 expect(chosen.size).toBeGreaterThan(old.size);
});
it('later-round forecasts use intervening clubs and distinguish no information',()=>{
 const ctx={evaluation:evaluation(),round:2,nextTeams:[]};
 const before=forecastDraft(teams,pool,0,ctx);
 expect(Object.values(before).every(x=>x.label==='高')).toBe(true);
 const after=forecastDraft(teams,pool,0,{...ctx,nextTeams:teams.slice(1)});
 expect(Object.values(after).some((x,i)=>x.survival<Object.values(before)[i].survival)).toBe(true);
 expect(forecastDraft(teams,pool,0,{} )[0].label).toBe('不明');
});
it('reports real nomination rounds while keeping the existing acquisition result contract',()=>{
 vi.spyOn(Math,'random').mockReturnValue(.9);
 const result=resolveFirstRound(teams.slice(0,2),[p('first'),p('second')]);
 expect(result.rounds).toEqual([{0:'first',1:'first'},{0:'second'}]);
 expect(result.picks[1].id).toBe('first');expect(result.picks[0].id).toBe('second');
});
it('does not forecast survival to a turn that the club will never have',()=>{
 const forecast=forecastDraft(teams,pool,0,{evaluation:evaluation(),round:6,nextTeams:teams.slice(1),noNextPick:true});
 expect(Object.values(forecast).every(f=>f.label==='不明')).toBe(true);
});
