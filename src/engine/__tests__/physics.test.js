import { describe, expect, it } from 'vitest';
import { calcBallDist, calcTrajectory } from '../physics';

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

  it('dragCoeff calibration: EV=100mph LA=25° lands 110-120m', () => {
    const d = calcBallDist(100, 25);
    expect(d).toBeGreaterThanOrEqual(110);
    expect(d).toBeLessThanOrEqual(120);
  });

  it('HR-range EV/LA clears typical NPB CF fence', () => {
    const d = calcBallDist(108, 30);
    expect(d).toBeGreaterThanOrEqual(122);
  });

  it('groundball LA does not clear fence', () => {
    const d = calcBallDist(95, 5);
    expect(d).toBeLessThan(90);
  });

});
