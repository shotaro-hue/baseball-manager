import { describe, expect, it } from 'vitest';
import { applyTradeTransaction } from '../tradeTransaction';
const p = (id, extra={}) => ({ id, name:`選手${id}`, pos:'一塁手', ...extra });
const fixture = () => [{id:0,budget:1000,players:[p(0)],farm:[]},{id:1,budget:2000,players:[p(1)],farm:[]}];
const request = {fromId:0,toId:1,outgoing:[p(0)],incoming:[p(1)],cash:500};
const freeze = x => { for(const v of Object.values(x)) if(v && typeof v==='object') freeze(v); return Object.freeze(x); };
it('does not mutate frozen input and conserves money/ownership', () => {
  const teams=freeze(fixture()); const result=applyTradeTransaction(teams, request);
  expect(result.ok).toBe(true); expect(result.teams.map(t=>t.budget)).toEqual([500,2500]);
  expect(result.teams.flatMap(t=>[...t.players,...t.farm]).map(p=>p.id).sort()).toEqual([0,1]);
  expect(teams[0].players[0].id).toBe(0);
});
it.each([{育成:true},{isIkusei:true},{injuryDaysLeft:5},{registrationCooldownDays:3}])('keeps an ineligible incoming player in farm: %j', extra => {
  const teams=fixture(); Object.assign(teams[1].players[0],extra);
  const r=applyTradeTransaction(teams,request); expect(r.ok).toBe(true);
  expect(r.teams[0].players).toEqual([]);expect(r.teams[0].farm[0].id).toBe(1);
});
it('routes the fifth foreigner to farm', () => {
  const teams=fixture();teams[0].players.push(...[2,3,4,5].map(id=>p(id,{isForeign:true})));
  teams[1].players[0].isForeign=true;
  const r=applyTradeTransaction(teams,request);expect(r.ok).toBe(true);expect(r.teams[0].farm[0].id).toBe(1);
});
it('checks both registered counts after outgoing/incoming netting, including farm', () => {
  const teams=fixture();teams[1].farm=Array.from({length:69},(_,i)=>p(100+i));
  teams[0].players.push(p(2));
  const before=JSON.stringify(teams);
  expect(applyTradeTransaction(teams,{...request,outgoing:[p(0),p(2)]}).ok).toBe(false);
  expect(JSON.stringify(teams)).toBe(before);
  expect(applyTradeTransaction(teams,request).ok).toBe(true);
});
it('rejects duplicate current ownership and missing money rather than repairing data', () => {
  const teams=fixture();teams[1].farm.push(p(0));
  expect(applyTradeTransaction(teams,request).ok).toBe(false);
  const clean=fixture();delete clean[1].budget;
  expect(applyTradeTransaction(clean,request).ok).toBe(false);
});
it('rejects empty cash transfers and non-finite overflow', () => {
  expect(applyTradeTransaction(fixture(),{...request,outgoing:[],incoming:[]}).ok).toBe(false);
  const teams=fixture();teams[0].budget=Number.MAX_VALUE;teams[1].budget=Number.MAX_VALUE;
  expect(applyTradeTransaction(teams,{...request,cash:Number.MAX_VALUE}).ok).toBe(false);
});
