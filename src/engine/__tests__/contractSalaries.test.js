import { describe, it, expect } from 'vitest';
import { summarizeContractSalaries } from '../finance';
const p = (id, salary, 育成 = false) => ({ id, salary, 育成 });
const fixture = () => ({ players: [p(1, 100), p(2, 0)], farm: [p(3, 300), p(4, 50, true)], scoutResults: [p(5,99999)], faPool: [p(6,99999)] });
describe('contract salary summary', () => {
  it('totals only owned contracts and classifies development before squad', () => {
    const t = fixture(); t.players.push(p(7,20,true)); t.farm.push(p(4,500,false), p(1,900,true));
    const s = summarizeContractSalaries(t);
    expect(s.groups.map(g => [g.key,g.amount,g.count])).toEqual([['active',100,2],['farm',300,1],['development',70,2]]);
    expect(s.total).toBe(470); expect(s.entries).toHaveLength(5);
    expect(s.ranked.map(e=>e.player.id)).toEqual([3,1,4,7,2]);
  });
  it('changes only breakdown after promotion/demotion', () => {
    const t = fixture(), before = summarizeContractSalaries(t);
    t.players.push(t.farm.shift());
    const promoted = summarizeContractSalaries(t);
    expect(promoted.total).toBe(before.total); expect(promoted.groups[0].amount).toBe(400); expect(promoted.groups[1].amount).toBe(0);
    t.farm.push(t.players.shift());
    expect(summarizeContractSalaries(t).total).toBe(before.total);
  });
  it('reflects salary changes, acquisition and release without cached state', () => {
    const t = fixture(); t.farm[0].salary += 10;
    expect(summarizeContractSalaries(t).total).toBe(460);
    t.farm.push(p(9,90)); expect(summarizeContractSalaries(t).total).toBe(550);
    t.players.shift(); expect(summarizeContractSalaries(t).total).toBe(450);
  });
  it('preserves measured zero and distinguishes missing from invalid salaries', () => {
    const t = { players: [p(0,0),p(1,undefined),p(2,null),p(3,NaN),p(4,Infinity),p(5,-1),p(6,'10'),p(7,'')], farm: [] };
    const s = summarizeContractSalaries(t);
    expect(s.total).toBe(0); expect(s.missingCount).toBe(2); expect(s.invalidCount).toBe(5); expect(s.complete).toBe(false);
    expect(s.ranked.map(e=>e.player.id)).toEqual([0]);
    expect(s.groups[0]).toMatchObject({ amount:0,missingCount:2,invalidCount:5,count:8 });
  });
  it('accepts empty/missing farm and does not conflate players without IDs', () => {
    expect(summarizeContractSalaries({ players: [] })).toMatchObject({ total:0,complete:true,ranked:[] });
    const anonymous = {salary:10};
    expect(summarizeContractSalaries({players:[anonymous,{salary:20}],farm:[anonymous]}).total).toBe(30);
  });
  it('uses stable ties and leaves frozen arrays and objects intact', () => {
    const t = { players:[p(2,10),p(1,10)],farm:[p(3,10)] };
    for(const list of [t.players,t.farm]) { list.forEach(Object.freeze); Object.freeze(list); } Object.freeze(t);
    const before = JSON.stringify(t); const s = summarizeContractSalaries(t);
    expect(s.ranked.map(e=>e.player.id)).toEqual([2,1,3]); expect(JSON.stringify(t)).toBe(before);
  });
});
