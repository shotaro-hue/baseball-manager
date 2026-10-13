import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BatchResultScreen } from './BatchResult';
import BatchResultRoute from './screenRoutes/BatchResultRoute';
const rows = [
  { gameNo: 1, won: false, score: { my: 0, opp: 0 }, oppTeam: { short: '相手' } },
  { gameNo: 2, won: true, score: { my: 4, opp: 1 } },
  { gameNo: 3, won: false, score: { my: 1, opp: 4 } },
  { gameNo: 4 },
];
const html = props => renderToStaticMarkup(React.createElement(BatchResultScreen, {
  results: rows, myTeam: { players: [] }, onEnd: () => {}, onViewDetail: () => {}, ...props,
}));
let view;
afterEach(() => { if(view) act(() => view.unmount()); view = null; vi.unstubAllGlobals(); });
const text = node => typeof node === 'string' ? node : (node.children || []).map(text).join('');
it('counts only known outcomes and does not turn missing scores into draws', () => {
  const rendered = html({});
  expect(rendered).toContain('1勝 1敗 1分');
  expect(rendered).toContain('勝敗未確認');
});
it('unavailable detail has a visible reason and no actionable dead end', () => {
  const rendered = html({ canViewDetail: () => false });
  expect(rendered).toContain('詳細記録なし');
  expect(rendered).toContain('disabled=""');
});
it('new batch does not inherit the previous detail result visible window', () => {
  const results = Array.from({ length: 12 }, (_, i) => ({ gameNo: i + 20, score: { my: 4, opp: 1 } }));
  const gs = { screen: 'batch_result', getGameResultsMap: () => Object.fromEntries(results.map(r => [r.gameNo, r])) };
  const sf = { batchResults: results, gameResult: { _source: 'batch', gameNo: 12, _batchVisibleCount: 12,
    _batchResults: [{ gameNo: 12 }] } };
  const renderRoute = () => renderToStaticMarkup(React.createElement(BatchResultRoute, {
    gs, sf, setScreen: () => {}, ScreenComponent: BatchResultScreen,
  }));
  expect(renderRoute()).not.toContain('第28戦');
  sf.gameResult = { _source: 'batch', gameNo: 31, _batchVisibleCount: 12, _batchResults: results };
  expect(renderRoute()).toContain('第31戦');
});
it('accessible detail name includes score, outcome and unavailable reason', () => {
  expect(html({ canViewDetail: () => false })).toContain('aria-label="第1戦 相手の試合詳細 0 対 0 分 詳細記録なし"');
});
it.each([
  [{ saveDirty: true }, '保存待ち'],
  [{ saveQueueState: { isSaving: true } }, '保存中'],
  [{ saveResult: { ok: false } }, '保存失敗'],
  [{ saveResult: { ok: true } }, '保存済み'],
  [{}, '保存状態未確認'],
  [{ saveResult: { ok: true, archive: { ok: false } } }, '一部履歴は要確認'],
])('reports actual save state independently of result processing: %s', (props, label) => {
  expect(html({ ...props, isBatchProcessing: true })).toContain(label);
});
it('reports aggregation failure while keeping result and return actions available', () => {
  const pending = [];
  vi.stubGlobal('requestIdleCallback', cb => { pending.push(cb); return pending.length; });
  vi.stubGlobal('cancelIdleCallback', () => {});
  const broken = { ...rows[1], log: [{ result: 'hr', get scorer() { throw new Error('bad log'); } }] };
  act(() => { view = create(React.createElement(BatchResultScreen, { results: [broken], onEnd: () => {} })); });
  act(() => pending.forEach(cb => cb()));
  expect(text(view.root)).toContain('ハイライトの集計に失敗');
  expect(view.root.findAllByType('button').find(node => text(node) === 'ホームへ戻る').props.disabled).not.toBe(true);
});
