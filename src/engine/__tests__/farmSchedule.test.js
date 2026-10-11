import { describe, it, expect, vi } from 'vitest';
import { createFarmSchedule, createFarmRng } from '../farmSchedule';
import { teams, freeze } from './farmFixtures';

describe('farm schedule', () => {
  it('has six unique cards per round, 143 appearances per team and balanced pairs/home', () => {
    const schedule = createFarmSchedule(freeze(teams()), 2026);
    expect(schedule).toHaveLength(858);
    const count = {}, home = {}, pairs = {};
    for (let r = 1; r <= 143; r++) {
      const cards = schedule.filter(c => c.round === r);
      expect(cards).toHaveLength(6);
      expect(new Set(cards.flatMap(c => [c.homeId, c.awayId])).size).toBe(12);
      for (const c of cards) {
        expect((c.homeId < 6) === (c.awayId < 6)).toBe(true);
        for (const id of [c.homeId, c.awayId]) count[id] = (count[id] || 0) + 1;
        home[c.homeId] = (home[c.homeId] || 0) + 1;
        const key = [c.homeId, c.awayId].sort((a,b) => a-b).join(':');
        pairs[key] = (pairs[key] || 0) + 1;
      }
    }
    expect(new Set(Object.values(count))).toEqual(new Set([143]));
    expect(Math.max(...Object.values(pairs)) - Math.min(...Object.values(pairs))).toBeLessThanOrEqual(1);
    expect(Math.max(...Object.values(home)) - Math.min(...Object.values(home))).toBeLessThanOrEqual(1);
    expect(new Set(schedule.map(c => c.id)).size).toBe(858);
  });
  it('is order independent and year/round IDs differ', () => {
    const input = teams();
    expect(createFarmSchedule(input, 2026)).toEqual(createFarmSchedule(input.reverse(), 2026));
    expect(createFarmSchedule(input, 2026)[0]?.id).not.toBe(createFarmSchedule(input, 2027)[0]?.id);
  });
  it('rejects malformed leagues, duplicate team IDs and invalid years', () => {
    expect(() => createFarmSchedule(teams().slice(1), 2026)).toThrow();
    const input = teams(); input[0].id = input[1].id;
    expect(() => createFarmSchedule(input, 2026)).toThrow();
    expect(() => createFarmSchedule(teams(), NaN)).toThrow();
  });
  it('uses independent reproducible random streams with bounded values', () => {
    const random = vi.spyOn(Math, 'random').mockImplementation(() => { throw Error('main RNG consumed'); });
    try {
      const a = createFarmRng(['save', 2026, 1, 'card', 'v1']);
      const b = createFarmRng(['save', 2026, 1, 'card', 'v1']);
      const c = createFarmRng(['save', 2026, 2, 'card', 'v1']);
      const xs = Array.from({ length: 1000 }, a);
      expect(xs).toEqual(Array.from({ length: 1000 }, b));
      expect(xs).not.toEqual(Array.from({ length: 1000 }, c));
      expect(xs.every(x => Number.isFinite(x) && x >= 0 && x < 1)).toBe(true);
      expect(random).not.toHaveBeenCalled();
    } finally { random.mockRestore(); }
  });
});

it('has a total ID order for mixed numeric/string IDs under any input permutation', () => {
  const input=teams(), mixed=[2,10,'11',30,40,50];
  input.slice(0,6).forEach((t,i)=>{t.id=mixed[i];});
  input.slice(6).forEach((t,i)=>{t.id=100+i;});
  const reordered=[input[2],input[0],input[1],...input.slice(3)];
  expect(createFarmSchedule(input,2026)).toEqual(createFarmSchedule(reordered,2026));
});
