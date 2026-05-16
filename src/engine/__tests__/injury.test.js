import { beforeEach, describe, expect, it, vi } from 'vitest';

const rngMock = vi.fn();

vi.mock('../../utils', async () => {
  const actual = await vi.importActual('../../utils');
  return {
    ...actual,
    rng: (...args) => rngMock(...args),
  };
});

import { checkForInjuries, tickInjuries } from '../player';

describe('checkForInjuries - recurrence risk', () => {
  beforeEach(() => {
    rngMock.mockReset();
  });

  it('過去2年以内の怪我歴があると発生確率が上がる（×1.2）', () => {
    rngMock
      .mockReturnValueOnce(31) // no history: 31 >= 30 で発生しない
      .mockReturnValueOnce(31) // history: 31 < 36 で発生
      .mockReturnValueOnce(0)  // type roll
      .mockReturnValueOnce(10) // days
      .mockReturnValueOnce(0); // part roll

    const res = checkForInjuries([
      { id: 'p1', age: 28, condition: 100, injuryDaysLeft: 0, injuryHistory: [] },
      { id: 'p2', age: 28, condition: 100, injuryDaysLeft: 0, injuryHistory: [{ part: '肘', year: 2025 }] },
    ], 2026);

    expect(res).toHaveLength(1);
    expect(res[0].id).toBe('p2');
  });

  it('3年以上前の怪我歴は再発倍率に影響しない', () => {
    rngMock.mockReturnValueOnce(31);
    const res = checkForInjuries([
      { id: 'p1', age: 28, condition: 100, injuryDaysLeft: 0, injuryHistory: [{ part: '肩', year: 2022 }] },
    ], 2026);
    expect(res).toHaveLength(0);
  });

  it('同部位の再発歴があると当該部位の重みが2倍になる', () => {
    rngMock
      .mockReturnValueOnce(0)  // trigger
      .mockReturnValueOnce(0)  // type roll
      .mockReturnValueOnce(8)  // days
      .mockReturnValueOnce(30); // part roll (肩通常20では外れるが、40なら肩に入る)

    const res = checkForInjuries([
      { id: 'p1', age: 28, condition: 100, injuryDaysLeft: 0, injuryHistory: [{ part: '肩', year: 2025 }] },
    ], 2026);
    expect(res).toHaveLength(1);
    expect(res[0].part).toBe('肩');
  });

  it('injuryHistory が undefined でもクラッシュしない', () => {
    rngMock.mockReturnValueOnce(9999);
    expect(() => checkForInjuries([
      { id: 'p1', age: 28, condition: 100, injuryDaysLeft: 0 },
    ], 2026)).not.toThrow();
  });
});

describe('tickInjuries - part clearing', () => {
  it('injuryDaysLeft が 0 になると injuryPart も null になる', () => {
    const [p] = tickInjuries([{ id: 'p1', injury: '筋肉系', injuryDaysLeft: 1, injuryPart: '腰' }]);
    expect(p.injuryDaysLeft).toBe(0);
    expect(p.injury).toBeNull();
    expect(p.injuryPart).toBeNull();
  });

  it('injuryDaysLeft > 0 の間は injuryPart を維持する', () => {
    const [p] = tickInjuries([{ id: 'p1', injury: '筋肉系', injuryDaysLeft: 4, injuryPart: '腰' }]);
    expect(p.injuryDaysLeft).toBe(3);
    expect(p.injury).toBe('筋肉系');
    expect(p.injuryPart).toBe('腰');
  });
});
