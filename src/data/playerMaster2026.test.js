import { expect, it } from 'vitest';
import { getOpeningRosters } from './playerMaster2026';
import { NPB2025_ROSTERS } from './npb2025';

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
 expect(find(1,'ビシエド')).toMatchObject({isForeign:false,foreignQuotaStatus:'exempt'});
 expect(find(9,'ソト')).toMatchObject({isForeign:false,foreignQuotaStatus:'exempt'});
});
