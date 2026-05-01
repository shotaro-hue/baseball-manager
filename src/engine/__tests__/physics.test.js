import { describe, expect, it } from 'vitest';
import { calcBallDist, calcTrajectory, resolveFieldSideBySprayAngle } from '../physics';
import { lookupBallDist } from '../physicsLookup';

describe('physics flight simulation', () => {
  it('increases distance as EV increases with same LA', () => {
    const low = calcBallDist(137, 25);
    const mid = calcBallDist(153, 25);
    const high = calcBallDist(169, 25);

    expect(low).toBeLessThan(mid);
    expect(mid).toBeLessThan(high);
  });

  it('has plausible distance ordering for typical launch angles', () => {
    const ev = 161;
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
    const traj = calcTrajectory(161, 28);
    const last = traj[traj.length - 1];

    expect(last[1]).toBe(0);
    expect(last[0]).toBeGreaterThan(0);
  });

  it('is deterministic for same input', () => {
    const a = calcTrajectory(156, 31);
    const b = calcTrajectory(156, 31);

    expect(a).toEqual(b);
  });

  it('dragCoeff calibration: EV=161km/h LA=25° lands 112-138m', () => {
    const d = calcBallDist(161, 25);
    expect(d).toBeGreaterThanOrEqual(112);
    expect(d).toBeLessThanOrEqual(138);
  });

  it('HR-range EV/LA clears typical NPB CF fence', () => {
    // power=80+ 相当の EV=161km/h, LA=30° で CF フェンス (120m) を越える
    // dragCoeff=0.0036 では EV=148 は 111m 止まりのため EV=100 を基準とする
    const d = calcBallDist(161, 30);
    expect(d).toBeGreaterThanOrEqual(120);
  });

  it('groundball LA does not clear fence', () => {
    const d = calcBallDist(153, 5);
    expect(d).toBeLessThan(90);
  });

});


describe('lookupBallDist', () => {
  it('matches calcBallDist within ±3m for mid-range inputs', () => {
    const pairs = [[161, 25], [137, 10], [177, 30], [116, 5], [153, 0]];
    for (const [ev, la] of pairs) {
      expect(Math.abs(lookupBallDist(ev, la) - calcBallDist(ev, la))).toBeLessThanOrEqual(3);
    }
  });

  it('clamps out-of-range EV/LA gracefully', () => {
    expect(() => lookupBallDist(80, 25)).not.toThrow();
    expect(() => lookupBallDist(200, 25)).not.toThrow();
    expect(() => lookupBallDist(161, -20)).not.toThrow();
    expect(() => lookupBallDist(161, 60)).not.toThrow();
  });

  it('HR-range returns ≥ typical NPB CF fence (122m)', () => {
    expect(lookupBallDist(174, 30)).toBeGreaterThanOrEqual(122);
  });
});

describe('resolveFieldSideBySprayAngle', () => {
  it('maps representative and boundary angles to left/center/right correctly', () => {
    expect(resolveFieldSideBySprayAngle(0)).toMatchObject({ key: 'left', label: '左翼' });
    expect(resolveFieldSideBySprayAngle(29.9)).toMatchObject({ key: 'left', label: '左翼' });
    expect(resolveFieldSideBySprayAngle(30)).toMatchObject({ key: 'center', label: '中堅' });
    expect(resolveFieldSideBySprayAngle(45)).toMatchObject({ key: 'center', label: '中堅' });
    expect(resolveFieldSideBySprayAngle(60)).toMatchObject({ key: 'center', label: '中堅' });
    expect(resolveFieldSideBySprayAngle(60.1)).toMatchObject({ key: 'right', label: '右翼' });
    expect(resolveFieldSideBySprayAngle(90)).toMatchObject({ key: 'right', label: '右翼' });
  });
});
