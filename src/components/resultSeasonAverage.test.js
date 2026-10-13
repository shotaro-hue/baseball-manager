import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';
import { ResultScreen } from './ResultScreen';

let view;
afterEach(() => { if (view) act(() => view.unmount()); vi.unstubAllGlobals(); });
function average(snapshotStats, currentStats, teamsPresent = true) {
  if (view) act(() => view.unmount());
  const player = stats => ({ id: 'opp-batter', name: '相手打者', stats });
  const snapshot = { id: 0, name: '相手球団', short: 'OPP', players: [player(snapshotStats)], farm: [] };
  const current = { ...snapshot, players: [player(currentStats)] };
  const pending = [];
  vi.stubGlobal('requestIdleCallback', callback => { pending.push(callback); return pending.length; });
  vi.stubGlobal('cancelIdleCallback', () => {});
  const props = { myTeam: { id: 1, name: '自球団', players: [] }, oppTeam: snapshot,
    teams: teamsPresent ? [current] : [], onNext: () => {},
    gsResult: { oppTeam: snapshot, score: { my: 0, opp: 1 }, log: [
      { batId: 'opp-batter', batter: '相手打者', scorer: false, result: 's', inning: 1, isTop: true },
    ] } };
  const before = structuredClone({ snapshot, current });
  act(() => { view = create(React.createElement(ResultScreen, props)); });
  act(() => pending.forEach(callback => callback()));
  const row = view.root.findAllByType('tr').find(node => node.findAllByType('th').some(th => th.children.includes('相手打者')));
  expect({ snapshot, current }).toEqual(before);
  return row.findAllByType('td')[0].children.join('');
}
it('opening result uses post-game canonical opponent stats, including team ID zero', () => {
  expect(average({ AB: 0, H: 0 }, { AB: 4, H: 2 })).toBe('.500');
});
it('later and batch result snapshots do not override current season AVG', () => {
  expect(average({ AB: 20, H: 5 }, { AB: 24, H: 6 })).toBe('.250');
  expect(average({ AB: 20, H: 5 }, { AB: 24, H: 7 })).toBe('.292');
});
it('keeps real zero, no at-bats and missing stats distinct', () => {
  expect(average({ AB: 4, H: 2 }, { AB: 4, H: 0 })).toBe('.000');
  expect(average({ AB: 4, H: 2 }, { AB: 0, H: 0 })).toBe('.---');
  expect(average({ AB: 4, H: 2 }, undefined)).toBe('.---');
});
it('retains readable legacy snapshot when the current opponent is unavailable', () => {
  expect(average({ AB: 4, H: 2 }, undefined, false)).toBe('.500');
});
