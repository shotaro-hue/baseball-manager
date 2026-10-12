import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResultScreen } from './ResultScreen';
import { computeBoxScore, applyGameStatsFromLog } from '../engine/postGame';
import { decisionFixture as fixture, decisionScenarios as scenarios } from '../../tests/fixtures/pitcherDecisions';

let view;
afterEach(() => {
  if (view) act(() => view.unmount());
  view = null;
  vi.unstubAllGlobals();
});
const text = node => typeof node === 'string' ? node : (node.children || []).map(text).join('');
function decisionRows() {
  const card = view.root.findAll(n => n.type === 'div' && n.props.className === 'card')
    .find(n => text(n).startsWith('勝敗投手'));
  return card ? card.findAll(n => n.type === 'div' && n.props.className === 'fsb')
    .map(n => text(n).replace(/(?:MY|OPP)$/, '')).sort() : [];
}
function render(f) {
  const pending = [];
  vi.stubGlobal('requestIdleCallback', callback => { pending.push(callback); return pending.length; });
  vi.stubGlobal('cancelIdleCallback', () => {});
  act(() => {
    view = create(React.createElement(ResultScreen, {
      gsResult: f.result, myTeam: f.myTeam, oppTeam: f.oppTeam,
      teams: [f.myTeam, f.oppTeam], onNext: () => {},
    }));
  });
  act(() => pending.forEach(callback => callback()));
}

describe('result decisions agree with existing box score and recorded stats', () => {
  for (const isHome of [true, false]) for (const [name, sequence] of Object.entries(scenarios)) {
    it(`${name} (${isHome ? 'home' : 'away'})`, () => {
      const f = fixture(sequence, isHome), before = structuredClone(f);
      const box = computeBoxScore(f.result.log, [], isHome ? f.myTeam.players : f.oppTeam.players,
        isHome ? f.oppTeam.players : f.myTeam.players, isHome ? f.result.score.my : f.result.score.opp,
        isHome ? f.result.score.opp : f.result.score.my);
      const expected = [...box.homePitching, ...box.awayPitching].filter(p => p.result)
        .map(p => p.result + p.name).sort();
      const recorded = [
        ...applyGameStatsFromLog(f.myTeam.players, f.result.log, true, f.result.score.my > f.result.score.opp),
        ...applyGameStatsFromLog(f.oppTeam.players, f.result.log, false, f.result.score.opp > f.result.score.my),
      ].flatMap(p => [['W', p.stats.W], ['L', p.stats.L], ['S', p.stats.SV]]
        .filter(([, n]) => n === 1).map(([role]) => role + p.name)).sort();
      expect(recorded).toEqual(expected);
      render(f);
      expect(decisionRows()).toEqual(expected);
      act(() => view.root.findAllByType('button').find(n => text(n) === '投手成績').props.onClick());
      const rows = view.root.findAllByType('tr').map(text);
      for (const decision of expected) {
        expect(rows.some(row => row.includes(decision.slice(1)) && row.includes(decision[0]))).toBe(true);
      }
      expect(f).toEqual(before);
    });
  }
  it.each([true, false])('keeps scorer-only legacy logs readable (home=%s)', isHome => {
    const f = fixture(scenarios['own relief loss'], isHome);
    f.result.log = f.result.log.map(({ isTop, ...event }) => event);
    const before = structuredClone(f);
    render(f);
    expect(decisionRows()).toContain('L自軍救援');
    expect(decisionRows()).not.toContain('L自軍先発');
    expect(f).toEqual(before);
  });
  it('has no invented decisions for an empty log', () => {
    render(fixture([], true));
    expect(decisionRows()).toEqual([]);
  });
});
