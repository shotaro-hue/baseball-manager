import {afterEach,expect,it,vi} from 'vitest';
import {buildRealTeam} from '../realplayer';
import {createInitialTeams,createInitialTeamsAsync} from '../bootstrapTeams';
import {TEAM_DEFS,FIELDING_POSITIONS} from '../../constants';
import {initialRosterSlots} from '../initialRoster';
import {NPB2025_ROSTERS} from '../../data/npb2025';
const roster=NPB2025_ROSTERS[0],def=TEAM_DEFS[0];
const repeat=(source,n)=>Array.from({length:n},(_,i)=>({...source,name:`入力${i}`}));
afterEach(()=>vi.restoreAllMocks());
it('preserves 66 existing real players and never adds generated players merely to reach a target',()=>{
 const data={batters:repeat(roster.batters[0],34).map((p,i)=>({...p,pos:i<6?'捕手':FIELDING_POSITIONS[1+(i-6)%7]})),pitchers:repeat(roster.pitchers[0],32)};
 const t=buildRealTeam(def,data);expect([...t.players,...t.farm]).toHaveLength(66);expect(t.farm).toEqual([]);
});
it('keeps existing one-sided rosters and uses the other side for remaining slots',()=>{
 const data={batters:repeat(roster.batters[0],40),pitchers:repeat(roster.pitchers[0],10)},t=buildRealTeam(def,data);
 const all=[...t.players,...t.farm];expect(all).toHaveLength(65);expect(all.filter(p=>!p.isPitcher).length).toBeGreaterThanOrEqual(40);expect(all.filter(p=>!p.isPitcher&&p.pos==='捕手')).toHaveLength(6);for(const pos of FIELDING_POSITIONS)expect(all.some(p=>!p.isPitcher&&p.pos===pos)).toBe(true);
});
it('detects real input over the hard70 limit instead of trimming it',()=>{
 expect(()=>buildRealTeam(def,{batters:repeat(roster.batters[0],40),pitchers:repeat(roster.pitchers[0],31)})).toThrow(/70/);
});
it('keeps development input outside the65 controlled count',()=>{
 const data={batters:[...roster.batters,{...roster.batters[0],name:'育成入力',isIkusei:true}],pitchers:roster.pitchers},t=buildRealTeam(def,data);
 const all=[...t.players,...t.farm];expect(all).toHaveLength(66);expect(all.find(p=>p.name==='育成入力').育成).toBe(true);expect(all.filter(p=>!p.育成&&!p.isIkusei)).toHaveLength(65);
});
it('retains a complete 64-player club with four catchers without adding fictional players',()=>{
 const data={complete:true,batters:repeat(roster.batters[0],32).map((p,i)=>({...p,pos:i<4?'捕手':FIELDING_POSITIONS[1+(i-4)%7],positions:{[i<4?'捕手':FIELDING_POSITIONS[1+(i-4)%7]]:100}})),pitchers:repeat(roster.pitchers[0],32)};
 const t=buildRealTeam(def,data);
 expect([...t.players,...t.farm]).toHaveLength(64);
 expect([...t.players,...t.farm].every(p=>p.name.startsWith('入力'))).toBe(true);
});
it('uses secondary defensive coverage without rewriting or supplementing a complete roster',()=>{
 const players=[...controlled(4,'捕手'),...controlled(6,'一塁手').map((p,i)=>({...p,positions:{一塁手:100,[FIELDING_POSITIONS[i+2]]:80}})),...controlled(1,'一塁手'),...controlled(53,'先発',true)];
 expect(initialRosterSlots(players,{complete:true})).toEqual({batterPositions:[],pitcherRoles:[]});
});
it('rejects an unplayable complete roster instead of disguising it with fictional players',()=>{
 expect(()=>initialRosterSlots(controlled(65,'先発',true),{complete:true})).toThrow(/完全名簿/);
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

const controlled=(n,pos='一塁手',isPitcher=false)=>Array.from({length:n},(_,id)=>({id,pos,isPitcher}));
const coveredBatters=n=>controlled(n).map((p,i)=>({...p,pos:i<6?'捕手':FIELDING_POSITIONS[1+(i-6)%7]}));
const supplemented=players=>{const slots=initialRosterSlots(players);return [...players,...slots.batterPositions.map(pos=>({pos,isPitcher:false})),...slots.pitcherRoles.map(pos=>({pos,isPitcher:true}))];};
it('reserves six controlled catchers and every field before allocating pitchers for 40 batters / 10 pitchers',()=>{
 const players=[...controlled(40),...controlled(10,'先発',true)],before=structuredClone(players),all=supplemented(players);
 expect(all).toHaveLength(65);expect(all.filter(p=>p.pos==='捕手')).toHaveLength(6);
 for(const pos of FIELDING_POSITIONS)expect(all.some(p=>!p.isPitcher&&p.pos===pos)).toBe(true);
 expect(players).toEqual(before);
});
it('can exceed 65 only to fill required positions, without changing originals',()=>{
 const players=[...coveredBatters(55).filter((p,i)=>i>=6),...controlled(10,'先発',true)];
 // 59 players with all other fields covered require exactly six catchers.
 expect(supplemented(players)).toHaveLength(65);
 const crowded=[...players,...controlled(3,'先発',true)];
 expect(supplemented(crowded)).toHaveLength(68);
 expect(supplemented(crowded).filter(p=>p.pos==='捕手')).toHaveLength(6);
});
it.each([66,67,68,69,70])('preserves all %i existing controlled players when coverage is sufficient',n=>{
 const players=[...coveredBatters(n-32),...controlled(32,'先発',true)],before=structuredClone(players);
 expect(initialRosterSlots(players)).toEqual({pitcherRoles:[],batterPositions:[]});expect(players).toEqual(before);
});
it('fills missing catchers on an existing 66-person roster up to the hard limit',()=>{
 const players=[...coveredBatters(37).filter((p,i)=>i>=4),...controlled(33,'先発',true)];
 expect(players).toHaveLength(66);expect(supplemented(players)).toHaveLength(70);
 expect(supplemented(players).filter(p=>p.pos==='捕手')).toHaveLength(6);
});
it('explicitly rejects a <=70 input whose minimum defensive coverage cannot fit under 70',()=>{
 expect(()=>initialRosterSlots([...controlled(40),...controlled(25,'先発',true)])).toThrow(/70.*守備|守備.*70/);
 expect(()=>initialRosterSlots(controlled(70,'先発',true))).toThrow(/70/);
 expect(()=>initialRosterSlots(controlled(71))).toThrow(/70/);
});
it('handles heavily pitcher-biased input without dropping controlled players',()=>{
 const players=[...controlled(50,'先発',true),...coveredBatters(2)],all=supplemented(players);
 expect(all).toHaveLength(65);expect(all.filter(p=>p.isPitcher)).toHaveLength(50);
 expect(all.filter(p=>p.pos==='捕手')).toHaveLength(6);
 for(const pos of FIELDING_POSITIONS)expect(all.some(p=>!p.isPitcher&&p.pos===pos)).toBe(true);
});
it('reserves a pitcher even when 65 existing batters cover all field positions',()=>{
 const all=supplemented(coveredBatters(65));expect(all).toHaveLength(66);expect(all.filter(p=>p.isPitcher)).toHaveLength(1);
});
it('counts both development flags separately and cannot use them as controlled catcher coverage',()=>{
 const players=[...controlled(40),...controlled(10,'先発',true),...controlled(3,'捕手').map(p=>({...p,育成:true})),...controlled(3,'捕手').map(p=>({...p,isIkusei:true}))];
 const all=supplemented(players),owned=all.filter(p=>!p.育成&&!p.isIkusei);
 expect(all).toHaveLength(71);expect(owned).toHaveLength(65);expect(owned.filter(p=>p.pos==='捕手')).toHaveLength(6);
});
it('does not mutate real primary positions, abilities or histories while planning exceptional supplementation',()=>{
 const players=[...controlled(40),...controlled(10,'先発',true)].map((p,i)=>({...p,name:`実在${i}`,batting:{contact:80},careerLog:[{year:2025,PA:100}],positions:{[p.pos]:100}})),before=structuredClone(players);
 initialRosterSlots(players);expect(players).toEqual(before);
});

it('keeps exceptional input identical through synchronous and asynchronous team generation',async()=>{
 const originalRoster=NPB2025_ROSTERS[0],originalRandom=Math.random;
 NPB2025_ROSTERS[0]={batters:repeat(roster.batters[0],40).map(p=>({...p,pos:'一塁手'})),pitchers:repeat(roster.pitchers[0],10)};
 const run=async f=>{let x=20261017;Math.random=()=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return x/4294967296;};const teams=await f();return {teams,next:Math.random()};};
 try{expect(await run(createInitialTeamsAsync)).toEqual(await run(createInitialTeams));}
 finally{NPB2025_ROSTERS[0]=originalRoster;Math.random=originalRandom;}
});
