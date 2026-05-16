import { describe, it, expect } from 'vitest';
import { calcOwnerTrustDelta } from '../frontend';

const makePlayoff = ({ champion, jpSeries, cs2_se, cs1_se } = {}) => ({
  champion: champion ? { id: champion } : undefined,
  jpSeries: jpSeries ? { teams: [{ id: jpSeries[0] }, { id: jpSeries[1] }] } : undefined,
  cs2_se:   cs2_se   ? { teams: [{ id: cs2_se[0] },  { id: cs2_se[1] }]  } : undefined,
  cs1_se:   cs1_se   ? { teams: [{ id: cs1_se[0] },  { id: cs1_se[1] }]  } : undefined,
});

describe('calcOwnerTrustDelta', () => {
  it('myTeam が null のとき 0 を返す', () => {
    expect(calcOwnerTrustDelta('t1', null, {})).toBe(0);
  });

  it('playoff が null のとき 0 を返す', () => {
    expect(calcOwnerTrustDelta('t1', { ownerGoal: 'cs' }, null)).toBe(0);
  });

  describe('目標: champion', () => {
    const team = { ownerGoal: 'champion', wins: 60, losses: 50 };
    it('日本一 → +30', () => {
      const po = makePlayoff({ champion: 't1', jpSeries: ['t1', 't2'] });
      expect(calcOwnerTrustDelta('t1', team, po)).toBe(30);
    });
    it('日本シリーズ敗退 → -10', () => {
      const po = makePlayoff({ champion: 't2', jpSeries: ['t1', 't2'] });
      expect(calcOwnerTrustDelta('t1', team, po)).toBe(-10);
    });
    it('CS止まり → -20', () => {
      const po = makePlayoff({ champion: 't3', cs2_se: ['t1', 't4'] });
      expect(calcOwnerTrustDelta('t1', team, po)).toBe(-20);
    });
    it('CS未出場 → -25', () => {
      const po = makePlayoff({ champion: 't3' });
      expect(calcOwnerTrustDelta('t1', team, po)).toBe(-25);
    });
  });

  describe('目標: pennant', () => {
    const team = { ownerGoal: 'pennant', wins: 60, losses: 50 };
    it('日本シリーズ進出 → +20', () => {
      const po = makePlayoff({ champion: 't2', jpSeries: ['t1', 't2'] });
      expect(calcOwnerTrustDelta('t1', team, po)).toBe(20);
    });
    it('CS止まり → -5', () => {
      const po = makePlayoff({ champion: 't3', cs2_se: ['t1', 't4'] });
      expect(calcOwnerTrustDelta('t1', team, po)).toBe(-5);
    });
    it('CS未出場 → -20', () => {
      const po = makePlayoff({ champion: 't3' });
      expect(calcOwnerTrustDelta('t1', team, po)).toBe(-20);
    });
  });

  describe('目標: cs', () => {
    const team = { ownerGoal: 'cs', wins: 60, losses: 50 };
    it('CS出場 → +15', () => {
      const po = makePlayoff({ champion: 't3', cs1_se: ['t1', 't4'] });
      expect(calcOwnerTrustDelta('t1', team, po)).toBe(15);
    });
    it('CS未出場 → -15', () => {
      const po = makePlayoff({ champion: 't3' });
      expect(calcOwnerTrustDelta('t1', team, po)).toBe(-15);
    });
  });

  describe('目標: rebuild', () => {
    it('勝ち越し → +10', () => {
      const team = { ownerGoal: 'rebuild', wins: 75, losses: 68 };
      const po = makePlayoff({ champion: 't3' });
      expect(calcOwnerTrustDelta('t1', team, po)).toBe(10);
    });
    it('負け越し → -5', () => {
      const team = { ownerGoal: 'rebuild', wins: 55, losses: 88 };
      const po = makePlayoff({ champion: 't3' });
      expect(calcOwnerTrustDelta('t1', team, po)).toBe(-5);
    });
  });

  it('ownerGoal 未定義の場合 cs 扱い', () => {
    const team = { wins: 60, losses: 50 };
    const po = makePlayoff({ champion: 't3', cs1_se: ['t1', 't4'] });
    expect(calcOwnerTrustDelta('t1', team, po)).toBe(15);
  });
});
