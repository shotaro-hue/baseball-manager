import {expect,it} from 'vitest';
import {assemble} from './assemble.mjs';
const p=(playerId,name,teamId)=>({playerId,name,teamId,kind:'pitcher',position:'投手',registration:'controlled',sourceUrl:'https://example.org/registered'});
const facts=players=>({facts:Object.fromEntries(players.map(p=>[p.playerId,{birthDate:'2000-01-01',throws:'right',bats:'left',sourceUrl:'https://example.org/profile'}])),fielding:[],observations:[]});
it('does not attach Raidel Martinez history to the 2026 newcomers sharing his abbreviated name',()=>{
 const players=[p('npb:23925134','Ｒ．マルティネス',4),p('npb:33935150','Ｒ．マルティネス',5),p('npb:13215159','Ａ．マルティネス',3)];
 const f=facts(players);f.observations=[{playerId:'npb:23925134',teamName:'中日ドラゴンズ',year:2024,outs:174,G:60,SV:43}];
 const m=assemble({asOf:'2026-03-27',scope:'all',players},f,{});
 expect(m.players.map(p=>p.history.length)).toEqual([1,0,0]);
 expect(m.players[0].history[0].teamName).toBe('中日ドラゴンズ');expect(m.players[0].pos).toBe('抑え');
 expect(m.sources.every(s=>s.redistribution==='unconfirmed')).toBe(true);
});
it('preserves a legacy contract, applies the controlled minimum, and never derives quota from spelling',()=>{
 const player=p('domestic','カタカナ',0),f=facts([player]);
 const m=assemble({asOf:'2026-03-27',scope:'all',players:[player]},f,{0:{batters:[],pitchers:[{name:'カタカナ',playerId:'old',salary:240,contractEndYear:2029,isForeign:false}]}});
 expect(m.players[0]).toMatchObject({legacyPlayerId:'old',gameSalaryManYen:420,gameContractEndYear:2029,foreignQuotaStatus:'unknown',gameIsForeign:false});
 expect(m.players[0].history).toEqual([]);
});
