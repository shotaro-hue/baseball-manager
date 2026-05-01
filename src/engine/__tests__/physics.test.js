import { describe, expect, it } from 'vitest';
import { calcBallDist, calcTrajectory } from '../physics';
import { lookupBallDist } from '../physicsLookup';

describe('physics flight simulation', () => {
  it('increases distance as EV increases with same LA', () => {
    const low = calcBallDist(85, 25);
    const mid = calcBallDist(95, 25);
    const high = calcBallDist(105, 25);

    expect(low).toBeLessThan(mid);
    expect(mid).toBeLessThan(high);
  });

  it('has plausible distance ordering for typical launch angles', () => {
    const ev = 100;
    const d0 = calcBallDist(ev, 0);
    const d10 = calcBallDist(ev, 10);
    const d25 = calcBallDist(ev, 25);
    const d45 = calcBallDist(ev, 45);
    const d70 = calcBallDist(ev, 70);

    expect(d0).toBeLessThan(d10);
    expect(d10).toBeLessThan(d25);
    expect(d45).toBeGreaterThan(d70);
  });

  it('trajectory ends at ground level', () => {
    const traj = calcTrajectory(100, 28);
    const last = traj[traj.length - 1];

    expect(last[1]).toBe(0);
    expect(last[0]).toBeGreaterThan(0);
  });

  it('is deterministic for same input', () => {
    const a = calcTrajectory(97, 31);
    const b = calcTrajectory(97, 31);

    expect(a).toEqual(b);
  });

  it('dragCoeff calibration: EV=100mph LA=25° lands 118-138m', () => {
    const d = calcBallDist(100, 25);
    expect(d).toBeGreaterThanOrEqual(118);
    expect(d).toBeLessThanOrEqual(138);
  });

  it('HR-range EV/LA clears typical NPB CF fence', () => {
    // power=77+ 相当の EV=92mph で CF フェンス (120m) を越える
    const d = calcBallDist(92, 30);
    expect(d).toBeGreaterThanOrEqual(120);
  });

  it('groundball LA does not clear fence', () => {
    const d = calcBallDist(95, 5);
    expect(d).toBeLessThan(90);
  });

});


describe('lookupBallDist', () => {
  it('matches calcBallDist within ±3m for mid-range inputs', () => {
    const pairs = [[100, 25], [85, 10], [110, 30], [72, 5], [95, 0]];
    for (const [ev, la] of pairs) {
      expect(Math.abs(lookupBallDist(ev, la) - calcBallDist(ev, la))).toBeLessThanOrEqual(3);
    }
  });

  it('clamps out-of-range EV/LA gracefully', () => {
    expect(() => lookupBallDist(50, 25)).not.toThrow();
    expect(() => lookupBallDist(120, 25)).not.toThrow();
    expect(() => lookupBallDist(100, -20)).not.toThrow();
    expect(() => lookupBallDist(100, 60)).not.toThrow();
  });

  it('HR-range returns ≥ typical NPB CF fence (122m)', () => {
    expect(lookupBallDist(108, 30)).toBeGreaterThanOrEqual(122);
  });
});
