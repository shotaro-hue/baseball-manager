import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';
import { DraftReviewScreen } from './Draft';
import { rookieFixture } from '../engine/__tests__/fixtures/rookieWorld';
import { reduceRookieRequest, rookieRequest } from '../engine/rookieContracts';

let view;
const text = n => typeof n === 'string' ? n : (n.children || []).map(text).join('');
const button = label => view.root.findAllByType('button').find(n => text(n) === label);
const click = label => act(() => button(label).props.onClick());
const props = (w, os = {}) => ({ teams: w.teams, myId: w.myId, year: w.year,
  pool: w.offseasonPlan.draftResult.pool, drafted: w.offseasonPlan.draftResult.drafted, gs: w, os });
const mount = (w = rookieFixture(), os) => act(() => { view = create(React.createElement(DraftReviewScreen, props(w, os))); });
afterEach(() => { if (view) act(() => view.unmount()); view = null; });

it('shows recorded single-year terms and separate classes without allowing immediate joining', () => {
  mount(); expect(text(view.root)).toContain('翌年度の新人契約'); expect(text(view.root)).toContain('240万円');
  expect(button('2027年シーズン開幕！')).toBeUndefined();
  click('支配下新人の留保条件を確認'); expect(text(view.root)).toContain('600万円'); expect(text(view.root)).toContain('単年');
  click('戻って見直す'); click('育成新人の留保条件を確認');
  const region = view.root.findByProps({ role: 'region', 'aria-label': '新人契約の最終確認' });
  expect(text(region)).toContain('育成新人'); expect(text(region)).not.toContain('600万円');
});

it('waits for acknowledged save, blocks duplicate clicks and retains failed confirmation', async () => {
  let finish; const submit = vi.fn(() => new Promise(r => { finish = r; })); mount(rookieFixture(), { handleReserveRookie: submit });
  click('支配下新人の留保条件を確認'); let task;
  act(() => { task = button('この条件を留保する').props.onClick(); });
  act(() => button('この条件を留保する').props.onClick()); expect(submit).toHaveBeenCalledTimes(1);
  expect(text(view.root)).not.toContain('契約留保を保存しました');
  await act(async () => { finish({ ok: false }); await task; });
  expect(text(view.root)).toContain('保存できません'); expect(button('この条件を留保する')).toBeTruthy();
});

it('keeps declined history and uses persisted terms after reload', () => {
  let w = rookieFixture(); w = reduceRookieRequest(w, rookieRequest(w, { type: 'reserve', playerId: 'rookie' })).world;
  mount(w); expect(text(view.root)).toContain('留保済み・翌春加入待ち'); expect(button('支配下新人の留保条件を確認')).toBeUndefined();
  w = reduceRookieRequest(w, rookieRequest(w, { type: 'decline', playerId: 'rookie' })).world;
  act(() => view.update(React.createElement(DraftReviewScreen, props(JSON.parse(JSON.stringify(w))))));
  expect(text(view.root)).toContain('支配下新人'); expect(text(view.root)).toContain('辞退済み');
  expect(button('支配下新人の辞退を確認')).toBeUndefined();
});

it('blocks unrecorded salary while allowing explicit decline and exposes recovery', () => {
  const w = rookieFixture(); delete w.offseasonPlan.draftResult.pool[0].salary;
  w.saveResult = { reason: 'economy_adoption_required' };
  mount(w); expect(button('保存済みの新人契約を復旧する')).toBeTruthy();
  expect(button('支配下新人の留保条件を確認').props.disabled).toBe(true);
  expect(button('支配下新人の辞退を確認').props.disabled).toBe(true);
  act(() => view.unmount()); delete w.saveResult; mount(w);
  click('支配下新人の留保条件を確認'); expect(button('この条件を留保する').props.disabled).toBe(true);
  click('戻って見直す'); click('支配下新人の辞退を確認'); expect(button('辞退を確定する').props.disabled).toBe(false);
});

it('preserves the legacy review end action', () => {
  const w = rookieFixture(); delete w.contractEconomy; mount(w);
  expect(button('2027年シーズン開幕！')).toBeTruthy(); expect(text(view.root)).not.toContain('翌年度の新人契約');
});
