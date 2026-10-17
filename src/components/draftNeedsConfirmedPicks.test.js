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
  // Five owned plus one accepted catcher meet the six-player depth target.
  const depth = team.farm.filter(p => p.pos === '捕手').slice(0, 3);
  team.farm = [...team.farm.filter(p => p.pos !== '捕手'), ...depth];
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
  act(() => { view = create(React.createElement(DraftScreen, { teams: [team, { ...team, id: 1, wins: 10, players: team.players.map(p=>({...p,id:`other-${p.id}`})), farm: team.farm.map(p=>({...p,id:`other-${p.id}`})) }],
    myId: 1, year: 2026, pool, savedState, onStateChange: changed, onDraftDone: vi.fn() })); });
  views.push(view);
  act(() => vi.advanceTimersByTime(350));
  expect(changed.mock.lastCall[0].drafted['best-DH']).toBe(0);
  expect(changed.mock.lastCall[0].drafted['another-C']).toBeUndefined();
  expect({ team, pool, savedState }).toEqual(before);
});

for (const role of ['先発', '中継ぎ', '抑え']) it(`real DraftScreen rewards ${role} rather than a higher-ranked other pitcher`, () => {
  const pit = (id, subtype) => ({ id, name: String(id), isPitcher: true, pos: subtype, subtype,
    age: 22, potential: 70, readinessScore: 50, salary: 500,
    pitching: { velocity: 70, control: 70, breaking: 70, stamina: 70 } });
  const bat = (id, pos) => ({ id, name: String(id), isPitcher: false, pos, age: 22, potential: 70,
    readinessScore: 50, salary: 500, batting: { contact: 70, power: 70, eye: 70, speed: 70 }, fielding: {} });
  const staff = [...Array.from({ length: 4 }, (_, i) => pit(`sp-${i}`, '先発')),
    ...Array.from({ length: 3 }, (_, i) => pit(`rp-${i}`, '中継ぎ')), pit('cl', '抑え')];
  const missing = staff.find(p => p.subtype === role);
  const cpu = { id: 0, wins: 0, players: [...staff.filter(p => p.id !== missing.id),
    ...Array.from({ length: 3 }, (_, i) => bat(`c-${i}`, '捕手')),
    ...['遊撃手', '二塁手', '三塁手'].flatMap(pos => [bat(`${pos}-1`, pos), bat(`${pos}-2`, pos)])], farm: [] };
  const mine = { ...cpu, id: 1, wins: 10, players: cpu.players.map(p => ({ ...p, id: `my-${p.id}` })) };
  const pool = [pit('wrong', role === '先発' ? '中継ぎ' : '先発'), pit('needed', role)];
  vi.spyOn(Math, 'random').mockReturnValue(.5); vi.useFakeTimers();
  const changed = vi.fn();
  let view;
  act(() => { view = create(React.createElement(DraftScreen, { teams: [cpu, mine], myId: 1,
    year: 2026, pool, savedState: { pickIdx: 0, drafted: {}, log: [], scouted: [], scoutPt: 0 },
    onStateChange: changed, onDraftDone: vi.fn() })); });
  views.push(view);
  act(() => vi.advanceTimersByTime(350));
  expect(changed.mock.lastCall[0].drafted.needed).toBe(0);
  expect(changed.mock.lastCall[0].drafted.wrong).toBeUndefined();
});
