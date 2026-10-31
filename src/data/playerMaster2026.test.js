import { expect, it } from 'vitest';
import { getOpeningRosters } from './playerMaster2026';
import { NPB2025_ROSTERS } from './npb2025';
import { REVIEWED_FACTS_2026 } from './playerMaster2026Facts';
import { realBatterToPlayer } from '../engine/realplayer';

it('keeps the legacy source immutable and clearly incomplete, with stable source identities',()=>{
 const before=structuredClone(NPB2025_ROSTERS),a=getOpeningRosters(),b=getOpeningRosters();
 const players=Object.values(a).flatMap(t=>[...t.batters,...t.pitchers]);
 expect(new Set(players.map(p=>p.playerId)).size).toBe(445);
 expect(a).toEqual(b);expect(NPB2025_ROSTERS).toEqual(before);
 expect(Object.values(a).every(t=>t.complete===false)).toBe(true);
 expect(players.every(p=>p.dataQuality.salary)).toBe(true);
});
it('applies dated registration corrections without changing source salary or end year',()=>{
 const r=getOpeningRosters();
 for(const [id,name] of [[3,'福島　圭音'],[4,'平山　功太']]) {
  const p=r[id].batters.find(p=>p.name===name),source=NPB2025_ROSTERS[id].batters.find(p=>p.name===name);
  expect(p.isIkusei).toBe(true);expect(p.salary).toBe(source.salary);expect(p.contractEndYear).toBe(source.contractEndYear);
 }
});
it('does not classify domestic draft players by katakana or miss international players with kanji names',()=>{
 const r=getOpeningRosters(),find=(id,name)=>[...r[id].batters,...r[id].pitchers].find(p=>p.name===name);
 expect(find(6,'イヒネ　イツア')).toMatchObject({isForeign:false,foreignQuotaStatus:'domestic',birthDate:'2004-09-02',batHand:'left'});
 expect(find(7,'ワォーターズ')).toMatchObject({isForeign:false,foreignQuotaStatus:'domestic',birthDate:'2005-10-14'});
 expect(find(10,'古林　睿煬')).toMatchObject({isForeign:true,foreignQuotaStatus:'counts',birthDate:'2000-06-12'});
 for(const [id,name] of [[6,'徐　若熙'],[7,'宋　家豪'],[8,'林　安可']])expect(find(id,name)).toMatchObject({isForeign:true,foreignQuotaStatus:'counts'});
 expect(find(1,'ビシエド')).toMatchObject({isForeign:false,foreignQuotaStatus:'exempt'});
 expect(find(9,'ソト')).toMatchObject({isForeign:false,foreignQuotaStatus:'exempt'});
});
it('connects reviewed Yamada terms to the bundled new-game roster',()=>{
 const p=getOpeningRosters()[0].batters.find(p=>p.name==='山田　哲人');
 expect(p).toMatchObject({playerId:'npb:91895133',contractEndYear:2027,
   salary:50000,dataQuality:{salary:'reported',contract:'reported'}});
 const game=realBatterToPlayer(p,{gameId:0,name:'東京ヤクルト',city:'東京'});
 expect(game).toMatchObject({realPlayerId:'npb:91895133',salary:50000,contractYearsLeft:2,
   openingContractEvidence:{asOf:'2026-03-27',annualSalaryManYen:50000,salaryStatus:'reported',contractEndYear:2027}});
 expect(game.openingContractEvidence.evidence.salary.length).toBeGreaterThan(0);
});
it('has an unambiguous legacy crosswalk and keeps the three annual equivalents out of reported salaries',()=>{
 const legacy=new Map(Object.entries(NPB2025_ROSTERS).flatMap(([teamId,r])=>[...r.batters,...r.pitchers].map(p=>[p.playerId,Number(teamId)])));
 for(const p of REVIEWED_FACTS_2026.byId.values())if(p.legacyPlayerId)expect(legacy.get(p.legacyPlayerId)).toBe(p.teamId);
 for(const id of ['npb:63965134','npb:13415155','npb:53755138'])expect(REVIEWED_FACTS_2026.byId.get(id)).toMatchObject({salaryStatus:'game-assumption'});
 expect(REVIEWED_FACTS_2026.byId.get('npb:53355150')).toMatchObject({foreignQuotaStatus:'unknown',gameIsForeign:false});
});
