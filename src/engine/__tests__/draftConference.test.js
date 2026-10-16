import {afterEach,expect,it,vi} from 'vitest';
import {initDraftPool} from '../draft';
import * as conference from '../draftConference';
import {evaluateRosterCapacity} from '../rosterCapacity';
const p=(id,extra={})=>({id,pos:'捕手',age:22,potential:60,...extra});
const t=(count=0)=>({id:0,players:[],farm:Array.from({length:count},(_,i)=>p(`owned-${i}`))});
afterEach(()=>vi.restoreAllMocks());
it('creates 160 raw candidates with 80 pitchers in 32/27/21 roles plus existing scout players',()=>{
 vi.spyOn(Math,'random').mockReturnValue(.5);
 const pool=initDraftPool({scoutResults:[p('scouted',{batting:{contact:60,power:60,eye:60}})]});
 expect(pool).toHaveLength(161);
 const raw=pool.filter(p=>!p.fromScout),pitchers=raw.filter(p=>p.isPitcher);
 expect(pitchers).toHaveLength(80);expect(raw.filter(p=>!p.isPitcher)).toHaveLength(80);
 expect(['先発','中継ぎ','抑え'].map(role=>pitchers.filter(p=>p.subtype===role).length)).toEqual([32,27,21]);
 expect(pool.find(p=>p.id==='scouted')).toMatchObject({fromScout:true});
});
it('fixes new conferences at ten while missing or unrecognized rules remain old six',()=>{
 expect(conference.newDraftRules()).toEqual({version:2,maxPicks:10});
 expect(conference.draftRulesFor(conference.newDraftRules()).maxPicks).toBe(10);
 for(const rules of [undefined,{}, {version:1,maxPicks:10},{version:2,maxPicks:99}])expect(conference.draftRulesFor(rules).maxPicks).toBe(6);
});
it('counts a confirmed winner once, losing bids never, and refusals against the annual limit',()=>{
 const pool=[p(0,{_drafted:true,_r1winner:0}),...Array.from({length:9},(_,i)=>p(i+1)),p('lost')];
 const drafted=Object.fromEntries(pool.slice(1,10).map(p=>[p.id,p.id===9?'refused':0]));
 const log=pool.slice(1,10).map(p=>({team:0,player:p.id,refused:p.id===9}));
 expect(conference.draftNominationCount(0,pool,{...drafted,0:0},log)).toBe(10);
 expect(evaluateRosterCapacity(t(60),{draftPool:pool,drafted}).acceptedPickCount).toBe(9);
 const result=conference.draftParticipation(t(60),pool,drafted,{rules:conference.newDraftRules(),log});
 expect(result).toMatchObject({eligible:false,count:10,maxPicks:10,reason:'pick-limit'});
});
it('supports live and encoded logs, including player and team zero, and ignores duplicate logs',()=>{
 const pool=[p(0),p(1)];
 expect(conference.draftNominationCount(0,pool,{0:'refused'},[{team:{id:0},player:pool[0]},{team:0,player:0}])).toBe(1);
 expect(conference.draftNominationCount(0,pool,{},[],{0:0})).toBe(1);
});
it('distinguishes ended clubs, full rosters and exhausted pools without mutating inputs',()=>{
 const pool=[p(0)],before=structuredClone(pool),rules=conference.newDraftRules();
 expect(conference.draftParticipation(t(),pool,{}, {rules,endedTeams:{0:'manual'}})).toMatchObject({eligible:false,reason:'manual'});
 expect(conference.draftParticipation(t(70),pool,{}, {rules})).toMatchObject({eligible:false,reason:'roster-full'});
 expect(conference.draftParticipation(t(),pool,{0:1}, {rules})).toMatchObject({eligible:false,reason:'pool-exhausted'});
 expect(conference.draftParticipation(t(),pool,{}, {rules})).toMatchObject({eligible:true,count:0});
 expect(pool).toEqual(before);
});
it('rejects more than ten nominations atomically at acquisition even when refusal frees a slot',async()=>{
 const {applyDraftAcquisitions}=await import('../draftRules');
 const team=t(59),pool=Array.from({length:11},(_,i)=>p(i)),drafted=Object.fromEntries(pool.map(p=>[p.id,p.id===10?'refused':0]));
 const log=[{team:0,player:10,refused:true}];
 expect(applyDraftAcquisitions([team],pool,drafted,2026,{rules:conference.newDraftRules(),log}).ok).toBe(false);
 expect(team.farm).toHaveLength(59);
});
it('separates a refused saved first winner from accepted picks but retains its annual nomination',async()=>{
 const {draftPicksForTeam}=await import('../offseasonResume');
 const pool=[p(0,{_drafted:true,_r1winner:0})];
 expect(draftPicksForTeam(pool,{0:'refused'},0)).toEqual([]);
 expect(conference.draftNominationCount(0,pool,{0:'refused'})).toBe(1);
});
