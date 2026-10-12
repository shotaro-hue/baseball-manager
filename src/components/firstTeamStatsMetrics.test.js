import { it, expect } from 'vitest';
import { firstTeamMetric, BATTER_COLUMNS, PITCHER_COLUMNS } from './firstTeamStatsMetrics';
import { emptyStats } from '../engine/playerCore';
import { saberBatter, saberPitcher } from '../engine/sabermetrics';
import { fmtAvg, fmtPct } from '../utils';

it('keeps the existing formula and formatter precision for complete measured records', () => {
  const stats = {...emptyStats(), PA:31,AB:27,H:7,D:2,T:1,HR:1,BB:3,HBP:1,K:6,IP:5+1/3,ER:2,Hp:6,BBp:1,HBPp:1,Kp:5,HRp:1,BF:24,evSum:900,evN:7,laSum:-13,laN:7};
  for (const isPitcher of [false,true]) {
    const p={stats,isPitcher}, sb=isPitcher?saberPitcher(stats):saberBatter(stats);
    for (const c of (isPitcher?PITCHER_COLUMNS:BATTER_COLUMNS).filter(c=>c.key in sb)) {
      const result=firstTeamMetric(p,c.key);
      expect(result.value).toBe(c.key==='AVG'?stats.H/stats.AB:sb[c.key]);
      if (c.key==='AVG') expect(result.display).toBe(fmtAvg(stats.H,stats.AB));
      if (['BBpct','Kpct'].includes(c.key)) expect(result.display).toBe(fmtPct(sb[c.key]));
    }
    expect(p.stats).toEqual(stats);
  }
});
it('does not let unrelated missing fields hide an independently recorded metric', () => {
  expect(firstTeamMetric({stats:{HR:0}},'HR')).toEqual({value:0,display:0});
  expect(firstTeamMetric({stats:{AB:4,H:0}},'AVG').display).toBe('.000');
  expect(firstTeamMetric({isPitcher:true,stats:{IP:3,ER:0}},'ERA').display).toBe('0.00');
  expect(firstTeamMetric({stats:{AB:4,H:0}},'OPS').display).toBe('— 未記録');
});
it.each([
  ['BABIP',{AB:4,H:0,K:4,HR:0,SF:0},false],
  ['wOBA',{...emptyStats()},false],
  ['Kpct',{BF:0,Kp:0},true],
  ['EVavg',{evN:0,evSum:0},false],
])('%s rejects its actual zero denominator', (key,stats,isPitcher) => {
  expect(firstTeamMetric({stats,isPitcher},key)).toEqual({value:null,display:'— 算出不可'});
});
it('keeps negative launch angles and WAR valid, while rejecting invalid counters', () => {
  expect(firstTeamMetric({stats:{laN:2,laSum:-4}},'LAavg')).toEqual({value:-2,display:'-2.0'});
  expect(firstTeamMetric({stats:{...emptyStats(),PA:4,AB:4}},'WAR').value).toBeLessThan(0);
  expect(firstTeamMetric({stats:{HR:-1}},'HR')).toEqual({value:null,display:'— 不正値'});
  for (const value of [undefined,null,'0',NaN,Infinity]) expect(firstTeamMetric({stats:{HR:value}},'HR')).toEqual({value:null,display:'— 未記録'});
});
