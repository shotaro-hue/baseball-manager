import { expect, it } from 'vitest';
import { compilePlayerMaster, comparePlayerMasters } from './playerMasterSchema';

export function syntheticMaster() {
 const players=Array.from({length:840},(_,i)=>({playerId:`fixture:${i}`,name:`検証${i}`,teamId:i%12,registration:i<720?'controlled':'development',kind:i%3?'batter':'pitcher',
   birthDate:'2000-03-28',throws:'right',bats:'left',pos:i%3?'捕手':'先発',positions:i%3?{捕手:100}:{},
   salaryManYen:null,gameSalaryManYen:i<720?420:240,salaryStatus:'game-assumption',contractEndYear:2027,contractStatus:'reported',
   foreignQuotaStatus:'domestic',sourceIds:['fixture'],history:[],entryType:'高卒'}));
 return {schemaVersion:1,asOf:'2026-03-27',status:'verified',sources:[{id:'fixture',url:'https://example.org/facts',redistribution:'cleared',rightsEvidence:'Synthetic project-authored test data'}],
 teams:Array.from({length:12},(_,teamId)=>({teamId,controlled:60,development:10,verified:true})),players};
}
it('compiles all 12 verified teams with explicit assumptions and stable identities',()=>{
 const m=syntheticMaster(),before=structuredClone(m),r=compilePlayerMaster(m);
 expect(r[0].complete).toBe(true);expect(r[0].pitchers).toHaveLength(70);
 expect(r[1].batters[0]).toMatchObject({playerId:'fixture:1',salary:420,hand:'right',batHand:'left',contractEndYear:2027});
 expect(r[1].batters[0].dataQuality.salary).toBe('game-assumption');expect(m).toEqual(before);
});
it.each([
 ['rights',m=>m.sources[0].redistribution='unconfirmed'],
 ['future performance',m=>m.players[0].history=[{year:2026,outs:3}]],
 ['duplicate id',m=>m.players[1].playerId=m.players[0].playerId],
 ['team evidence',m=>m.teams.pop()],
 ['salary confidence',m=>delete m.players[0].salaryStatus],
 ['missing evidence',m=>m.players[0].sourceIds=['missing']],
 ['fraction precision',m=>m.players[0].history=[{year:2025,IP:12.1}]],
 ['nonnumeric observation',m=>m.players[1].history=[{year:2025,AB:'bogus',H:'garbage',PA:50}]],
 ['impossible hit count',m=>m.players[1].history=[{year:2025,AB:1,H:10000,PA:1,HR:10000}]],
 ['fractional hit count',m=>m.players[1].history=[{year:2025,AB:1,H:.5,PA:1}]],
 ['inconsistent extra base hits',m=>m.players[1].history=[{year:2025,AB:10,H:2,'2B':2,'3B':1,HR:0,PA:10}]],
 ['negative service time',m=>m.players[0].daysOnActiveRoster=-1],
 ['impossible age',m=>m.players[0].birthDate='1800-01-01'],
 ['cap',m=>{for(const p of m.players)p.registration='controlled';m.players.push({...m.players[0],playerId:'extra'});}],
])('rejects %s before publishing or bootstrapping a candidate',(_,mutate)=>{
 const m=syntheticMaster();mutate(m);expect(()=>compilePlayerMaster(m)).toThrow();
});
it('diffs identities and attributes and compares both sides, including deletion and team moves',()=>{
 const a=syntheticMaster(),b=structuredClone(a);b.players[0].teamId=1;b.players.pop();b.players.push({...b.players[1],playerId:'new'});
 const d=comparePlayerMasters(a,b);
 expect(d.added).toEqual(['new']);expect(d.removed).toEqual(['fixture:839']);
 expect(d.changed).toEqual(['fixture:0']);
});
