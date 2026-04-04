import { describe, it, expect } from 'vitest';
import { generateForeignFaPool } from '../player';

describe('generateForeignFaPool', () => {
  it('指定人数の外国人選手を生成する', () => {
    const pool = generateForeignFaPool(7);
    expect(pool).toHaveLength(7);
    pool.forEach((p) => {
      expect(p.isForeign).toBe(true);
      expect(p.entryType).toBe('外国人');
      expect(p.isFA).toBe(true);
      expect(p.salary).toBeGreaterThanOrEqual(8000);
      expect(p.salary).toBeLessThanOrEqual(25000);
    });
  });

  it('投手と野手が概ね半々で生成される（偶数インデックスが投手）', () => {
    const pool = generateForeignFaPool(6);
    const pitchers = pool.filter((p) => p.isPitcher);
    expect(pitchers).toHaveLength(3);
  });
});
