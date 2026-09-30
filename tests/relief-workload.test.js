import { describe, expect, it } from 'vitest';
import { autoSwapPitcher } from '../src/engine/simulation';
import { reliefPitchBudget } from '../src/engine/reliefWorkload';

const arm = (id, overrides = {}) => ({ id, isPitcher: true, subtype: '中継ぎ', condition: 80,
  pitching: { stamina: 50, velocity: 60, control: 60, breaking: 60 }, ...overrides });
const keyFor = side => side === 'my' ? 'my' : 'op';
function state(side, pitches, role = 'middle', overrides = {}) {
  const key = keyFor(side);
  return { inning: 6, isTop: side === 'my', outs: 0, bases: [null, null, null], score: { my: 0, opp: 0 },
    [`${key}StartingPitcherId`]: 1, [`${key}Pitcher`]: arm(2), [`${key}PitchCount`]: pitches,
    [`${key}PitcherState`]: { enteredInning: 5, battersFaced: 6, role },
    [`${key}Bullpen`]: [arm(3)], [`${key}Lineup`]: [], ...overrides };
}

describe.each(['my', 'opp'])('relief workloads on %s side', side => {
  const key = keyFor(side);
  const swapped = gs => autoSwapPitcher(gs, side)[`${key}Pitcher`].id !== gs[`${key}Pitcher`].id;

  it('lets a nine-pitch reliever continue into another inning', () => {
    const gs = state(side, 9);
    expect(autoSwapPitcher(gs, side)).toBe(gs);
  });
  it('changes a middle reliever at the next inning after the soft budget', () => {
    expect(swapped(state(side, 32))).toBe(true);
    expect(swapped(state(side, 32, 'middle', { outs: 1 }))).toBe(false);
    expect(swapped(state(side, 40, 'middle', { outs: 1 }))).toBe(true);
  });
  it('gives long relief more pitches and retains that role after the score changes', () => {
    expect(swapped(state(side, 35, 'long', { inning: 7, score: { my: 1, opp: 0 } }))).toBe(false);
    expect(swapped(state(side, 55, 'long'))).toBe(true);
  });
  it('reduces the workload for a tired pitcher', () => {
    expect(swapped(state(side, 24))).toBe(false);
    expect(swapped(state(side, 24, 'middle', { [`${key}Pitcher`]: arm(2, { condition: 60 }) }))).toBe(true);
  });
  it('does not immediately replace a fresh reliever to bring in the closer', () => {
    const score = side === 'my' ? { my: 2, opp: 0 } : { my: 0, opp: 2 };
    const overrides = { inning: 9, score, [`${key}Bullpen`]: [arm(3, { subtype: '抑え' })] };
    expect(swapped(state(side, 9, 'middle', overrides))).toBe(false);
    expect(swapped(state(side, 18, 'middle', overrides))).toBe(true);
  });
  it('allows an earlier change in a late close-game scoring threat', () => {
    expect(swapped(state(side, 22, 'middle', { inning: 8, outs: 1, bases: [null, { id: 99 }, null] }))).toBe(true);
    expect(swapped(state(side, 9, 'middle', { inning: 8, outs: 1, bases: [null, { id: 99 }, null] }))).toBe(false);
  });
  it('avoids tired replacements until the safety limit, and never selects an injured arm', () => {
    const bullpen = [arm(3, { injuryDaysLeft: 2 }), arm(4, { condition: 50 })];
    expect(swapped(state(side, 32, 'middle', { [`${key}Bullpen`]: bullpen }))).toBe(false);
    const next = autoSwapPitcher(state(side, 45, 'middle', { outs: 1, [`${key}Bullpen`]: bullpen }), side);
    expect(next[`${key}Pitcher`].id).toBe(4);
    expect(swapped(state(side, 60, 'middle', { [`${key}Bullpen`]: [bullpen[0]] }))).toBe(false);
    expect(swapped(state(side, 60, 'middle', { [`${key}Bullpen`]: [] }))).toBe(false);
  });
  it('assigns a long role after an early starter exit and resets the appearance', () => {
    const gs = state(side, 130, 'middle', { inning: 3, [`${key}Pitcher`]: arm(1) });
    const next = autoSwapPitcher(gs, side);
    expect(next[`${key}Pitcher`].id).toBe(3);
    expect(next[`${key}PitchCount`]).toBe(0);
    expect(next[`${key}PitcherState`]).toMatchObject({ role: 'long', enteredInning: 3, battersFaced: 0 });
    expect(next[`${key}Bullpen`]).toEqual([]);
  });
});

it('budgets reflect the entry role and stamina', () => {
  expect(reliefPitchBudget(arm(1), 'middle')).toBe(30);
  expect(reliefPitchBudget(arm(1), 'long')).toBe(53);
  expect(reliefPitchBudget(arm(1), 'closer')).toBe(25);
  expect(reliefPitchBudget(arm(1, { pitching: { stamina: 100 } }), 'middle')).toBe(35);
  expect(reliefPitchBudget(arm(1, { condition: 40 }), 'middle')).toBeLessThan(30);
});
