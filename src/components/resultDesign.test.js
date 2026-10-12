import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { ResultScreen } from './ResultScreen';

const teams = [{ id: 0, name: '自軍', short: '自軍', players: [], farm: [] },
  { id: 1, name: '相手', short: '相手', players: [], farm: [] }];
const render = (result) => renderToStaticMarkup(React.createElement(ResultScreen, {
  gsResult: result, myTeam: teams[0], oppTeam: teams[1], teams, onNext: () => {},
}));
describe('DES-01 result overview', () => {
  it.each([[3, 2, '勝利'], [1, 2, '敗北'], [0, 0, '引き分け']])('labels %s-%s in plain language', (my, opp, label) => {
    const html = render({ score: { my, opp }, log: [], inningSummary: [], isHome: true });
    expect(html).toMatch(/<h1[^>]*>試合結果<\/h1>/);
    expect(html).toContain(`試合終了 / ${label}`);
    expect(html).toContain('この試合の記録');
    expect(html).toContain('この試合の個人成績は未記録です');
    expect(html).not.toContain('保存済み');
  });
  it('does not label absent results as a completed draw', () => {
    const html = render(null);
    expect(html).toContain('結果未確認');
    expect(html).not.toContain('試合終了 / 引き分け');
    expect(html).toContain('試合結果データが不足しています');
  });
  it('keeps absent hit records distinct from measured zero', () => {
    const pending = [];
    vi.stubGlobal('requestIdleCallback', callback => { pending.push(callback); return 1; });
    vi.stubGlobal('cancelIdleCallback', () => {});
    let view;
    try {
      act(() => { view = create(React.createElement(ResultScreen, {
        gsResult: { score: { my: 3, opp: 2 }, log: [], inningSummary: [] },
        myTeam: teams[0], oppTeam: teams[1], teams, onNext: () => {},
      })); });
      act(() => pending.forEach(callback => callback()));
      const rows = view.root.findByType('tbody').findAllByType('tr');
      expect(rows.map(row => row.findAllByType('td').at(-1).children.join(''))).toEqual(['—', '—']);
    } finally {
      if (view) act(() => view.unmount());
      vi.unstubAllGlobals();
    }
  });
  it.each([true, false])('puts the visiting team first and only marks the home final inning X (home=%s)', isHome => {
    const html = render({ score: { my: 1, opp: 0 }, isHome, log: [],
      inningSummary: [{ inning: 9, isTop: true, runs: 0 }] });
    const rows = [...html.matchAll(/<th scope="row">([^<]+)<\/th>/g)].map(match => match[1]);
    expect(rows).toEqual(isHome ? ['相手', '自軍'] : ['自軍', '相手']);
    expect(html.includes('>X</td>')).toBe(isHome);
  });
});
