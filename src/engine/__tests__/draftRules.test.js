import { afterEach, expect, it, vi } from 'vitest';
import { applyDraftAcquisitions, autoFirstRound, registeredDraftCount, remainingDraftSlots } from '../draftRules';
vi.mock('../trade',()=>({analyzeTeamNeeds:()=>[]}));
const p=(id,extra={})=>({id,potential:70,salary:500,age:22,...extra});
const t=(id,count=0)=>({id,players:[],farm:Array.from({length:count},(_,i)=>p(`owned-${id}-${i}`))});
afterEach(()=>vi.restoreAllMocks());
it('counts development flags in both rosters and reserves only accepted team picks',()=>{
 const team={...t(0,68),players:[p('育成',{育成:true}),p('dev',{isIkusei:true})]};
 expect(registeredDraftCount(team)).toBe(68);
 expect(remainingDraftSlots(team,[p(0,{_drafted:true,_r1winner:0}),p(1),p(2)],{1:'refused',2:1})).toBe(1);
});
it('reselects lottery losers until each eligible club has one unique pick without mutating inputs',()=>{
 vi.spyOn(Math,'random').mockReturnValue(.9);
 const teams=[t(0),t(1),t(2)],pool=[p(0),p(1),p(2)],before=structuredClone({teams,pool});
 const result=autoFirstRound(teams,pool);
 expect(result[2].id).toBe(0);expect(Object.values(result).map(p=>p.id).sort()).toEqual([0,1,2]);
 expect({teams,pool}).toEqual(before);
});
it('finishes an exhausted or empty first-round pool and excludes full clubs',()=>{
 vi.spyOn(Math,'random').mockReturnValue(.9);
 expect(autoFirstRound([t(0),t(1)],[])).toEqual({});
 expect(Object.values(autoFirstRound([t(0),t(1),t(2,70)],[p(0)]))).toHaveLength(1);
});
it('applies team/player zero once, excludes refused/unrecorded/owned and signs registered contracts',()=>{
 const teams=[t(0,68),t(1)],pool=[p(0,{_drafted:true,_r1winner:0,salary:100,isIkusei:true}),p(1),p(2,{_drafted:true}),p('owned-0-0')];
 const before=structuredClone({teams,pool});
 const r=applyDraftAcquisitions(teams,pool,{1:'refused','owned-0-0':0},2026);
 expect(r.ok).toBe(true);expect(r.teams[0].farm).toHaveLength(69);
 expect(r.teams[0].farm.at(-1)).toMatchObject({id:0,salary:420,育成:false,isIkusei:false,contractYearsLeft:1,contractSignedYear:2026});
 expect({teams,pool}).toEqual(before);
 expect(applyDraftAcquisitions(r.teams,pool,{1:'refused','owned-0-0':0},2026).teams).toEqual(r.teams);
});
for(const bad of ['duplicate','missing','owner','conflict'])it(`rejects ${bad} draft data atomically`,()=>{
 const teams=[t(0),t(1)];let pool=[p(0)],drafted={0:0};
 if(bad==='duplicate')pool.push(p(0));if(bad==='missing')pool=[p(null)];if(bad==='owner')drafted={0:99};
 if(bad==='conflict'){pool=[p(0,{_drafted:true,_r1winner:1})];}
 const before=structuredClone(teams);expect(applyDraftAcquisitions(teams,pool,drafted,2026).ok).toBe(false);expect(teams).toEqual(before);
});
it('rejects all clubs together at capacity rather than partially signing another club',()=>{
 const teams=[t(0,70),t(1)],before=structuredClone(teams);
 expect(applyDraftAcquisitions(teams,[p(0),p(1)],{0:0,1:1},2026).ok).toBe(false);expect(teams).toEqual(before);
});
