import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';
import { DraftScreen } from './Draft';
import { createInitialTeams } from '../engine/bootstrapTeams';
vi.mock('./ui', () => ({ OV: () => null, HandBadge: () => null }));
const views = [];
afterEach(() => {
  views.forEach(view => act(() => view.unmount())); views.length = 0;
  vi.useRealTimers(); vi.restoreAllMocks();
});
for (const firstRound of [true, false]) it(`CPU uses ${firstRound ? 'first' : 'later'} confirmed picks after draft state reload`, () => {
  let seed = 4;
  vi.spyOn(Math, 'random').mockImplementation(() => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  });
  const team = createInitialTeams()[0];
  const keep = new Set(team.players.filter(p => p.pos === '捕手').slice(0, 2).map(p => p.id));
  team.players = team.players.filter(p => p.pos !== '捕手' || keep.has(p.id));
  team.farm = team.farm.filter(p => p.pos !== '捕手');
  team.wins = 0;
  Math.random.mockReturnValue(.5); vi.useFakeTimers();
  const p = (id, pos = '捕手', extra = {}) => ({ id, name: String(id), pos, isPitcher: false,
    age: 22, salary: 500, potential: 70, readinessScore: 50,
    batting: { contact: 60, power: 60, eye: 60, speed: 60 }, fielding: {}, ...extra });
  const pool = [p(0, '捕手', firstRound ? { _drafted: true, _r1winner: 0 } : {}),
    p('best-DH', 'DH'), p('another-C')];
  const savedState = JSON.parse(JSON.stringify({ pickIdx: 0,
    drafted: firstRound ? {} : { 0: 0 }, log: [], scouted: [], scoutPt: 0 }));
  const before = structuredClone({ team, pool, savedState });
  const changed = vi.fn();
  let view;
  act(() => { view = create(React.createElement(DraftScreen, { teams: [team, { ...team, id: 1, wins: 10 }],
    myId: 1, year: 2026, pool, savedState, onStateChange: changed, onDraftDone: vi.fn() })); });
  views.push(view);
  act(() => vi.advanceTimersByTime(350));
  expect(changed.mock.lastCall[0].drafted['best-DH']).toBe(0);
  expect(changed.mock.lastCall[0].drafted['another-C']).toBeUndefined();
  expect({ team, pool, savedState }).toEqual(before);
});
