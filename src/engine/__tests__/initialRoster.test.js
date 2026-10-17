import {afterEach,expect,it,vi} from 'vitest';
import {buildRealTeam} from '../realplayer';
import {createInitialTeams,createInitialTeamsAsync} from '../bootstrapTeams';
import {TEAM_DEFS} from '../../constants';
import {NPB2025_ROSTERS} from '../../data/npb2025';
const roster=NPB2025_ROSTERS[0],def=TEAM_DEFS[0];
const repeat=(source,n)=>Array.from({length:n},(_,i)=>({...source,name:`入力${i}`}));
afterEach(()=>vi.restoreAllMocks());
it('preserves 66 existing real players and never adds generated players merely to reach a target',()=>{
 const data={batters:repeat(roster.batters[0],34),pitchers:repeat(roster.pitchers[0],32)};
 const t=buildRealTeam(def,data);expect([...t.players,...t.farm]).toHaveLength(66);expect(t.farm).toEqual([]);
});
it('keeps existing one-sided rosters and uses the other side for remaining slots',()=>{
 const data={batters:repeat(roster.batters[0],40),pitchers:repeat(roster.pitchers[0],10)},t=buildRealTeam(def,data);
 const all=[...t.players,...t.farm];expect(all).toHaveLength(65);expect(all.filter(p=>!p.isPitcher)).toHaveLength(40);expect(all.filter(p=>p.isPitcher)).toHaveLength(25);
});
it('detects real input over the hard70 limit instead of trimming it',()=>{
 expect(()=>buildRealTeam(def,{batters:repeat(roster.batters[0],40),pitchers:repeat(roster.pitchers[0],31)})).toThrow(/70/);
});
it('keeps development input outside the65 controlled count',()=>{
 const data={batters:[...roster.batters,{...roster.batters[0],name:'育成入力',isIkusei:true}],pitchers:roster.pitchers},t=buildRealTeam(def,data);
 const all=[...t.players,...t.farm];expect(all).toHaveLength(66);expect(all.find(p=>p.name==='育成入力').育成).toBe(true);expect(all.filter(p=>!p.育成&&!p.isIkusei)).toHaveLength(65);
});
it('keeps real names, skills, original histories and salary across generated supplementation',()=>{
 const t=buildRealTeam(def,roster),all=[...t.players,...t.farm];
 for(const b of [...roster.batters,...roster.pitchers]){const p=all.find(p=>p.name===b.name);expect(p).toBeTruthy();expect(p.salary).toBe(b.salary);expect(p.careerLog.map(r=>r.year)).toEqual((b.history||[]).map(r=>r.year));}
});
it('uses identical RNG and IDs for synchronous and asynchronous initialization',async()=>{
 const original=Math.random,run=async f=>{let x=20261017;Math.random=()=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return x/4294967296;};return f();};
 try{const a=await run(createInitialTeams),b=await run(createInitialTeamsAsync);expect(b).toEqual(a);}finally{Math.random=original;}
});

it('does not convert the ninth real batter primary position toDH',()=>{const data={batters:repeat(roster.batters[0],9).map((p,i)=>i===8?{...p,pos:'捕手'}:p),pitchers:roster.pitchers};const t=buildRealTeam(def,data);expect(t.players.find(p=>p.name==='入力8').pos).toBe('捕手');});
