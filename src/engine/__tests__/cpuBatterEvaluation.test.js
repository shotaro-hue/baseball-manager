import { describe, expect, it } from 'vitest';
import { calcCpuBatterEvaluation } from '../cpuBatterEvaluation';

function makePlayer(profile) {
  return {
    batting: {
      contact: 60,
      eye: 60,
      power: 60,
      speed: 60,
    },
    stats: {
      AB: 100,
      H: 25,
      BB: 10,
      HR: 10,
      doubles: 5,
      triples: 0,
      battedBallProfile: profile,
    },
  };
}

describe('CPU batted-ball evaluation', () => {
  it('keeps the base score unchanged when no profile exists', () => {
    const evaluation = calcCpuBatterEvaluation(makePlayer(null));

    expect(evaluation.total).toBe(evaluation.base);
    expect(evaluation.battedBallAdjustment).toBe(0);
    expect(evaluation.recentAdjustment).toBe(0);
  });

  it('ranks strong contact above weak contact at equal results and ability', () => {
    const strong = calcCpuBatterEvaluation(makePlayer({
      bip: 120,
      hardHit: 72,
      barrel: 18,
      line: 32,
      ground: 40,
      fly: 48,
      laN: 120,
      laSum: 1_920,
      recent: {
        bip: 30,
        hardHit: 18,
        barrel: 5,
        line: 9,
        ground: 10,
        fly: 11,
        laN: 30,
        laSum: 450,
      },
    }));
    const weak = calcCpuBatterEvaluation(makePlayer({
      bip: 120,
      hardHit: 18,
      barrel: 1,
      line: 16,
      ground: 80,
      fly: 24,
      laN: 120,
      laSum: 360,
      recent: {
        bip: 30,
        hardHit: 4,
        barrel: 0,
        line: 3,
        ground: 22,
        fly: 5,
        laN: 30,
        laSum: 90,
      },
    }));

    expect(strong.total).toBeGreaterThan(strong.base);
    expect(weak.total).toBeLessThan(weak.base);
    expect(strong.total).toBeGreaterThan(weak.total);
  });

  it('shrinks a one-ball sample to a negligible adjustment', () => {
    const evaluation = calcCpuBatterEvaluation(makePlayer({
      bip: 1,
      hardHit: 1,
      barrel: 1,
      line: 1,
      ground: 0,
      fly: 0,
      laN: 1,
      laSum: 15,
      recent: {
        bip: 1,
        hardHit: 1,
        barrel: 1,
        line: 1,
        ground: 0,
        fly: 0,
        laN: 1,
        laSum: 15,
      },
    }), {}, { includeRecent: false });

    expect(evaluation.battedBallAdjustment / evaluation.base).toBeLessThan(0.001);
  });
});
