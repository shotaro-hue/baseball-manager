import assert from 'node:assert/strict';
import { test, vi } from 'vitest';
import { applyGameStatsFromLog } from '../src/engine/postGame.js';
import * as simulation from '../src/engine/simulation.js';
const { replacePitcherInBattingOrder } = simulation;

test('pitcher batting, sacrifice hits, saves, and playoff stats are recorded separately', () => {

  const players = [
    { id: 'starter', name: '先発', isPitcher: true, stats: {}, playoffStats: {} },
    { id: 'closer', name: '抑え', isPitcher: true, stats: {}, playoffStats: {} },
  ];
  const offense = [
    { scorer: true, batId: 'starter', result: 'sac', rbi: 0, scorers: [], ev: 120, la: 5, dist: 30, sprayAngle: 45 },
    { scorer: true, batId: 'starter', result: 's', rbi: 2, scorers: ['r1', 'r2'], ev: 125, la: 10, dist: 60, sprayAngle: 40 },
  ];
  const starterOuts = Array.from({ length: 15 }, (_, index) => ({
    scorer: false, batId: `opp-s-${index}`, pitcherId: 'starter', result: 'out', rbi: 0, pitches: 3,
  }));
  const closerOuts = Array.from({ length: 3 }, (_, index) => ({
    scorer: false, batId: `opp-c-${index}`, pitcherId: 'closer', result: 'out', rbi: 0, pitches: 3,
  }));
  const log = [...offense, ...starterOuts, ...closerOuts];

  const regular = applyGameStatsFromLog(players, log, true, true, 1);
  const starter = regular.find((player) => player.id === 'starter');
  const closer = regular.find((player) => player.id === 'closer');
  assert.equal(starter.stats.PA, 2);
  assert.equal(starter.stats.AB, 1);
  assert.equal(starter.stats.H, 1);
  assert.equal(starter.stats.SH, 1);
  assert.equal(starter.stats.W, 1);
  assert.equal(starter.stats.sprayPoints.length, 0);
  assert.equal(starter.stats.battedBallEvents.length, 0);
  assert.equal(closer.stats.SV, 1);

  const playoff = applyGameStatsFromLog(players, offense, true, undefined, 0, 'playoffStats');
  const playoffStarter = playoff.find((player) => player.id === 'starter');
  assert.equal(playoffStarter.stats.PA, undefined);
  assert.equal(playoffStarter.playoffStats.PA, 2);
  assert.equal(playoffStarter.playoffStats.SH, 1);
});

test('relievers inherit the fixed pitcher batting slot', () => {
  const lineup = Array.from({ length: 9 }, (_, index) => ({ id: `b${index}`, isPitcher: false }));
  lineup[8] = { id: 'pinch-hitter', isPitcher: false };
  const reliever = { id: 'reliever', name: '中継ぎ', isPitcher: true, batting: { contact: 99 } };

  const replaced = replacePitcherInBattingOrder(lineup, 'old-pitcher', reliever, 8);
  assert.equal(replaced[8].id, 'reliever');
  assert.equal(replaced[8].batting.contact, 1);
});

test('uniform pitcher profile calibrates to roughly a .100 average over 100,000 at-bats', () => {
  const batter = { id: 'pitcher-batter', isPitcher: true, pitching: {} };
  const pitcher = {
    id: 'opponent-pitcher', isPitcher: true, hand: 'right',
    pitching: { velocity: 50, control: 50, breaking: 50, stamina: 70, variety: 50, sharpness: 50, clutchP: 50 },
  };
  let atBats = 0;
  let hits = 0;
  let seed = 20260911;
  const random = vi.spyOn(Math, 'random').mockImplementation(() => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  });
  const originalLog = console.log;
  console.log = () => {};
  try {
    while (atBats < 100_000) {
      const plateAppearance = simulation.simAtBat(batter, pitcher);
      if (plateAppearance.result === 'bb' || plateAppearance.result === 'hbp') continue;
      atBats += 1;
      let result = plateAppearance.result;
      if (result === 'inplay') {
        result = simulation.resolveBattedBallOutcomeFromPhysicsForBalance(
          batter,
          pitcher,
          simulation.STADIUMS.tokyo_dome,
          {},
          {},
        ).result;
      }
      if (['s', 'd', 't', 'hr'].includes(result)) hits += 1;
    }
  } finally {
    console.log = originalLog;
    random.mockRestore();
  }
  const average = hits / atBats;
  assert.ok(average >= 0.09 && average <= 0.11, `pitcher average was ${average}`);
}, 120000);
