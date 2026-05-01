import { writeFileSync } from 'node:fs';
import {
  simAtBat,
  STADIUMS,
  DEFAULT_LEAGUE_ENV,
  _generateContactEVLA_TEST,
  _adjustResultByPhysics_TEST,
} from '../src/engine/simulation.js';
import { lookupBallDist } from '../src/engine/physicsLookup.js';
import { clamp } from '../src/utils.js';
import { PHYSICS_BAT } from '../src/constants.js';
import { calcSprayAngle } from '../src/engine/physics.js';

const BATTER_PROFILES = [
  { name: 'スラッガー',   batting: { contact: 55, power: 85, speed: 45, eye: 60, defense: 50, baseRunning: 45, stealSkill: 30 } },
  { name: '巧打者',       batting: { contact: 82, power: 45, speed: 65, eye: 72, defense: 55, baseRunning: 60, stealSkill: 55 } },
  { name: 'バランス型',   batting: { contact: 65, power: 65, speed: 60, eye: 62, defense: 60, baseRunning: 55, stealSkill: 45 } },
  { name: '俊足好守型',   batting: { contact: 58, power: 38, speed: 82, eye: 55, defense: 72, baseRunning: 78, stealSkill: 75 } },
  { name: '四球選手',     batting: { contact: 50, power: 55, speed: 50, eye: 88, defense: 50, baseRunning: 50, stealSkill: 40 } },
];

const PITCHER_PROFILES = [
  { name: 'エース',       pitching: { velocity: 82, breaking: 80, control: 82, stamina: 78, movement: 75 } },
  { name: '速球派',       pitching: { velocity: 92, breaking: 60, control: 65, stamina: 65, movement: 55 } },
  { name: '技巧派',       pitching: { velocity: 62, breaking: 82, control: 88, stamina: 72, movement: 80 } },
  { name: 'バランス型',   pitching: { velocity: 72, breaking: 70, control: 72, stamina: 70, movement: 68 } },
  { name: '敗戦処理',     pitching: { velocity: 55, breaking: 52, control: 58, stamina: 60, movement: 50 } },
];

// NPB 2024 許容レンジ（打席あたり比率）
const RANGES = {
  hr:   [0.015, 0.04],
  d:    [0.035, 0.07],
  s:    [0.12,  0.22],
  k:    [0.16,  0.28],
  bb:   [0.06,  0.14],
  prom: [0.001, 0.03],  // d→hr 昇格
  dem:  [0.001, 0.03],  // hr→d 降格
};

const N_PER_PAIR = 2000;

function inRange(v, [lo, hi]) {
  return v >= lo && v <= hi;
}

function makeCounter() {
  return { pa: 0, hr: 0, d: 0, t: 0, s: 0, k: 0, bb: 0, hbp: 0, go: 0, fo: 0, out: 0, prom: 0, dem: 0 };
}

function addCounter(target, src) {
  for (const k of Object.keys(target)) target[k] += src[k] || 0;
}

function clampLaByResult(result, la) {
  if (result === 'hr') return clamp(la, PHYSICS_BAT.LA_HR_MIN, PHYSICS_BAT.LA_HR_MAX);
  if (result === 'd')  return clamp(la, PHYSICS_BAT.LA_D_MIN,  PHYSICS_BAT.LA_D_MAX);
  if (result === 't')  return clamp(la, PHYSICS_BAT.LA_T_MIN,  PHYSICS_BAT.LA_T_MAX);
  if (result === 's')  return clamp(la, PHYSICS_BAT.LA_S_MIN,  PHYSICS_BAT.LA_S_MAX);
  return la;
}

const all = [];
const total = makeCounter();

for (const batter of BATTER_PROFILES) {
  for (const pitcher of PITCHER_PROFILES) {
    const c = makeCounter();

    for (let i = 0; i < N_PER_PAIR; i++) {
      const at = simAtBat(
        { batting: batter.batting },
        { pitching: pitcher.pitching },
        'normal', 0,
        { stadium: 'tokyo_dome' },
        DEFAULT_LEAGUE_ENV,
      );
      const initial = at.result;

      let ev = 0, la = 0;
      if (!['k', 'bb', 'hbp'].includes(initial)) {
        ({ ev, la } = _generateContactEVLA_TEST({ batting: batter.batting }, { pitching: pitcher.pitching }));
        la = clampLaByResult(initial, la);
      }

      const dist   = ev > 0 ? lookupBallDist(ev, la) : 0;
      const spray  = ev > 0 ? calcSprayAngle(initial) : 45;
      const final  = _adjustResultByPhysics_TEST(initial, dist, spray, STADIUMS.tokyo_dome);

      c.pa++;
      if (c[final] !== undefined) c[final]++;
      if (['go', 'fo', 'out'].includes(final)) c.out++;
      if (initial === 'd'  && final === 'hr') c.prom++;
      if (initial === 'hr' && final === 'd')  c.dem++;
    }

    all.push({ batter: batter.name, pitcher: pitcher.name, counts: c });
    addCounter(total, c);
  }
}

const rates = {
  hr:   total.hr   / total.pa,
  d:    total.d    / total.pa,
  t:    total.t    / total.pa,
  s:    total.s    / total.pa,
  k:    total.k    / total.pa,
  bb:   total.bb   / total.pa,
  hbp:  total.hbp  / total.pa,
  prom: total.prom / total.pa,
  dem:  total.dem  / total.pa,
};

const checks = Object.fromEntries(
  Object.entries(RANGES).map(([key, range]) => [key, inRange(rates[key], range)]),
);

const report = {
  meta:      { date: new Date().toISOString(), N_PER_PAIR, totalPA: total.pa },
  aggregate: { total, rates, checks },
  pairs:     all,
};

writeFileSync(new URL('./mc-results.json', import.meta.url), JSON.stringify(report, null, 2));
console.log('Monte Carlo complete', report.aggregate);
