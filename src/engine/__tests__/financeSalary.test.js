import { expect, it } from 'vitest';
import { calcContractPayroll } from '../finance';
const p=(id,salary,extra={})=>({id,salary,...extra});
const team=()=>({players:[p(0,100),p(1,500)],farm:[p(2,900),p(3,300,{育成:true})],scoutResults:[p(4,10000)],faPool:[p(5,20000)]});
it('counts owned contracts once and returns exact groups and descending top entries',()=>{
  const t=team();t.farm.push({...t.players[0]}, {...t.farm[1]});
  const r=calcContractPayroll(t);
  expect(r.groups.map(g=>[g.key,g.count,g.amount])).toEqual([['active',2,600],['farm',1,900],['development',1,300]]);
  expect(r.total).toBe(1800);expect(r.entries.map(e=>e.player.id)).toEqual([2,1,3,0]);expect(r.missingCount).toBe(0);expect(r.invalidCount).toBe(0);
});
it('classifies development before roster and deduplicates zero IDs',()=>{
  const r=calcContractPayroll({players:[p(0,300,{育成:true})],farm:[p(0,900)]});
  expect(r.groups.map(g=>g.amount)).toEqual([0,0,300]);expect(r.entries).toHaveLength(1);
});
it('distinguishes zero, missing and invalid values without coercion',()=>{
  const r=calcContractPayroll({players:[p(0,0),p(1,null),p(2,undefined)],farm:[p(3,-1),p(4,NaN),p(5,Infinity),p(6,'300')]});
  expect(r.total).toBe(0);expect(r.missingCount).toBe(2);expect(r.invalidCount).toBe(4);
  expect(r.entries[0].salaryStatus).toBe('recorded');expect(r.entries.slice(1).map(e=>e.salaryStatus)).toEqual(['missing','missing','invalid','invalid','invalid','invalid']);
});
it('returns empty categories and valid zero for empty owned rosters',()=>{
  const r=calcContractPayroll({});expect(r.total).toBe(0);expect(r.groups.every(g=>g.count===0&&g.amount===0)).toBe(true);expect(r.entries).toEqual([]);
});
it('reflects promotion/demotion, salary changes, acquisition and release',()=>{
  const t=team(),initial=calcContractPayroll(t);const promoted=t.farm.shift();t.players.push(promoted);
  const up=calcContractPayroll(t);expect(up.total).toBe(initial.total);expect(up.groups.map(g=>g.amount)).toEqual([1500,0,300]);
  t.farm.push(t.players.pop());expect(calcContractPayroll(t).groups).toEqual(initial.groups);
  t.players[0]={...t.players[0],salary:200};expect(calcContractPayroll(t).total).toBe(1900);
  t.farm.push(p(8,700));expect(calcContractPayroll(t).total).toBe(2600);t.farm=t.farm.filter(p=>p.id!==8);expect(calcContractPayroll(t).total).toBe(1900);
});
it('retains tie order and does not mutate frozen arrays or objects',()=>{
  const a=Object.freeze(p('a',100)),b=Object.freeze(p('b',100));
  const t=Object.freeze({players:Object.freeze([a,b]),farm:Object.freeze([a])});
  expect(calcContractPayroll(t).entries.map(e=>e.player.id)).toEqual(['a','b']);expect(t.players).toEqual([a,b]);
});
it('does not collapse distinct objects without IDs',()=>{
  const a={salary:100},b={salary:200};const r=calcContractPayroll({players:[a,b],farm:[a]});expect(r.total).toBe(300);expect(r.entries).toHaveLength(2);
});
it('classifies duplicated IDs as development when either copy has the development flag',()=>{
  const active=Object.freeze(p(0,300));
  const development=Object.freeze(p(0,300,{育成:true}));
  const t=Object.freeze({players:Object.freeze([active]),farm:Object.freeze([development])});
  const r=calcContractPayroll(t);
  expect(r.groups.map(g=>[g.count,g.amount])).toEqual([[0,0],[0,0],[1,300]]);
  expect(r.entries[0]).toMatchObject({category:'development',categoryLabel:'育成',player:active});
  expect(t.players[0]).toBe(active);expect(t.farm[0]).toBe(development);
});
