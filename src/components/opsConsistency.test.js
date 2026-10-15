import { expect, it } from 'vitest';
import { firstTeamMetric } from './firstTeamStatsMetrics';
import { detailRate } from './playerDetailMetrics';
import { settingBatterRate } from './rosterSettingMetrics';
import { marketMetrics } from './hub/faMarket';
import { compareRows } from './PlayerComparisonTray';
import { careerOps, careerTotalOps } from './careerOpsMetrics';
import { buildTeamMetrics, stableSort } from '../engine/analysisComparison';
import { calcCpuBatterEvaluation } from '../engine/cpuBatterEvaluation';
import { evaluateBatterForPolicy } from '../engine/managementPolicy';
import { emptyStats } from '../engine/playerCore';
const counts = { ...emptyStats(), PA:500,AB:450,H:129,D:25,T:3,HR:14,BB:40,HBP:5,SF:5 };
const p = (id,stats=counts) => ({id,name:id,isPitcher:false,stats,batting:{contact:60,eye:60,power:60,speed:60}});
it('renders the same measured .797 across selectors, comparison, career and FA snapshot', () => {
  const player = p('s3');
  expect(firstTeamMetric(player,'OPS')).toEqual({value:.797,display:'0.797'});
  expect(detailRate(counts,'OPS')).toBe('0.797');
  expect(settingBatterRate(player,'OPS')).toBe('0.797');
  expect(Object.fromEntries(marketMetrics(player)).OPS).toBe('0.797');
  expect(Object.fromEntries(marketMetrics({...player,isFA:true,stats:emptyStats(),marketLastStats:counts})).OPS).toBe('0.797');
  expect(compareRows(player,player).find(r=>r[0]==='OPS')).toEqual(['OPS','0.797','0.797']);
  expect(careerOps({...counts,OPS:.8}).display).toBe('0.797');
  expect(careerTotalOps([counts]).display).toBe('0.797');
});
it('sorts numeric third decimals, retains tied order, and never ranks missing OPS as zero', () => {
  const low=p('low'),high=p('high',{...counts,H:130,D:26}),tie=p('tie',{...counts,H:130,D:26}),zero=p('zero',{...emptyStats(),PA:4,AB:4}),missing=p('missing',{PA:10});
  expect(stableSort([missing,low,zero,high,tie],p=>firstTeamMetric(p,'OPS').value).map(p=>p.id)).toEqual(['high','tie','low','zero','missing']);
  expect(firstTeamMetric(high,'OPS').value).toBe(.803);
});
it('computes club OPS from combined counts including walks and sacrifices, not individual means', () => {
  const second = {...emptyStats(),PA:151,AB:100,H:10,BB:50,SF:1};
  const team = {id:0,players:[p('a'),p('b',second)],farm:[]};
  // 234/651 + 212/550 = .74490155... -> .745, not (.797+.497)/2.
  expect(buildTeamMetrics(team).ops).toBe(.745);
});
it.each([
  // Boundary cases catch accidental r2(r3(raw)) instead of the old r2(raw).
  [{...emptyStats(),PA:195,AB:195,H:77,D:1}, .79], // raw .79487179
  [{...emptyStats(),PA:195,AB:195,H:78}, .80],
  [counts,.80],
])('retains original CPU scoring precision for raw counts: %o', (stats,expected) => {
  const player=p('cpu',stats);
  expect(calcCpuBatterEvaluation(player).resultScore).toBe(expected*1000);
  const policy=evaluateBatterForPolicy(player,{players:[player]},{policyId:'results'});
  expect(policy.components.season).toBeCloseTo(50+(expected-.7)*100,10);
});
it('uses the same rounding policy in FA at a binary floating-point tie', () => {
  const stats={...emptyStats(),PA:80,AB:80,H:3,D:1};
  expect(firstTeamMetric(p('tie',stats),'OPS').display).toBe('0.088');
  expect(Object.fromEntries(marketMetrics(p('tie',stats))).OPS).toBe('0.088');
});
