import { describe, it, expect } from 'vitest';
import { evaluateAcrossParks, getFenceDistanceBySpray } from '../parkEffects';
import { STADIUMS } from '../stadiums';

describe('parkEffects', () => {
  it('角度ごとにフェンス距離を返す', () => {
    const stadium = { lf: 100, cf: 122, rf: 98 };
    expect(getFenceDistanceBySpray(stadium, 0)).toBe(100);
    expect(getFenceDistanceBySpray(stadium, 45)).toBe(122);
    expect(getFenceDistanceBySpray(stadium, 90)).toBe(98);
  });

  it('同一打球の球場横断判定を返す', () => {
    const trajectory = [[0, 1.0], [100, 14], [122, 4.3], [125, 0.7], [129, 0]];
    const result = evaluateAcrossParks({ trajectory, sprayAngleDeg: 45, stadiums: STADIUMS, currentStadiumId: 'tokyo_dome' });
    expect(result.parkHrCount).toBeGreaterThan(0);
    expect(result.totalParkCount).toBe(Object.keys(STADIUMS).length);
    expect(result.hrParkIds.includes('tokyo_dome')).toBe(true);
    expect(result.nonHrParkIds.length).toBeGreaterThan(0);
  });
});
