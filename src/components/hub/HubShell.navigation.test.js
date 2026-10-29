import React, { useState } from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';
import HubShell from './HubShell';

vi.mock('./HubContentRouter', () => ({ default: function Content({ tab, onTabChange }) {
  const [draft, setDraft] = useState('');
  return React.createElement('section', { 'data-test-tab': tab }, tab,
    React.createElement('input', { value: draft, onChange: e => setDraft(e.target.value) }),
    React.createElement('button', { onClick: () => onTabChange('fa') }, '候補を探す'));
} }));
const team = { id: 0, name: '自軍', wins: 0, losses: 0, draws: 0, players: [], farm: [], lineup: [], rotation: [] };
const opponent = { ...team, id: 1, name: '相手' };
const schedule = { 1: { date: { month: 3, day: 27 }, matchups: [{ homeId: 0, awayId: 1 }] } };
let view;
afterEach(() => { if (view) act(() => view.unmount()); view = null; });
const text = n => typeof n === 'string' ? n : (n.children || []).map(text).join('');
const button = (label, parent = view.root) => parent.findAllByType('button').find(n => text(n) === label || n.props['aria-label'] === label);
const click = label => { const b = button(label); expect(b, `button ${label}`).toBeTruthy(); act(() => b.props.onClick()); };
function mount({ initialTab = 'dashboard', mailbox = [], news = [], year = 2026, saveId = 'navigation', notif = null, saveResult = null } = {}) {
  const setTabSpy = vi.fn();
  function Harness({ year, saveId }) {
    const [tab, update] = useState(initialTab);
    const gs = { myTeam: team, teams: [team, opponent], myId: 0, year, gameDay: 1, schedule,
      gameResultsMap: {}, tab, tabBadges: {}, saveId, mailbox, news, notif, saveResult,
      getMailboxBySelector: () => mailbox, getNewsBySelector: () => news,
      getUnreadMailboxCount: () => mailbox.filter(m => !m.read && (m.deliverOnDay ?? 0) <= 1).length,
      setTab: id => { setTabSpy(id); update(id); }, notify: vi.fn() };
    const app = { gs, sf: {}, os: {} };
    return React.createElement(HubShell, { state: { gs }, flows: app, app });
  }
  act(() => { view = create(React.createElement(Harness, { year, saveId })); });
  setTabSpy.setScope = props => act(() => view.update(React.createElement(Harness, { year, saveId, ...props })));
  return setTabSpy;
}
it('uses the same five approved sections on mobile and desktop', () => {
  mount();
  const nav = view.root.findByProps({ 'aria-label': 'メインメニュー' });
  expect(nav.findAllByType('button').map(text)).toEqual(['ホーム', '編成', '日程', '成績', '経営']);
  expect(view.root.findByProps({ 'aria-label': '監督メニュー' }).findAllByType('button').map(text)).toEqual(['ホーム', '編成', '日程', '成績', '経営']);
});
it('allows reading management with an invalid lineup and remembers each section', () => {
  const changed = mount({ initialTab: 'roster' });
  click('経営'); expect(changed).toHaveBeenLastCalledWith('management');
  click('候補を探す'); expect(changed).toHaveBeenLastCalledWith('fa');
  click('日程'); click('経営'); expect(changed).toHaveBeenLastCalledWith('fa');
});
it('keeps unread and actionable counts separate, including read offers but excluding future delivery', () => {
  mount({ mailbox: [
    { id: 1, type: 'trade', read: true, resolved: false, offer: {} },
    { id: 2, type: 'info', read: false },
    { id: 3, type: 'trade', read: false, resolved: false, deliverOnDay: 2, offer: {} },
    { id: 4, type: 'posting_request', read: false, resolved: true },
  ], news: [{ id: 5, type: 'interview', answered: false }] });
  expect(button('通知（未読2件・要対応2件）')).toBeTruthy();
});
it('returns from notifications to the mounted original page', () => {
  mount({ initialTab: 'fa' });
  click('通知（未読0件・要対応0件）');
  expect(view.root.findByProps({ 'data-hub-route': 'fa' }).props.hidden).toBe(true);
  click('ニュース');
  click('元の画面へ戻る');
  expect(view.root.findByProps({ 'data-hub-route': 'fa' }).props.hidden).toBe(false);
});
it('maps OB to records and FA to recruitment without changing existing route IDs', () => {
  mount({ initialTab: 'alumni' });
  expect(button('記録・球団史').props['aria-current']).toBe('page');
  click('経営'); click('補強'); click('FA');
  expect(button('補強').props['aria-current']).toBe('page');
});
it('moves balance under settings with a return route', () => {
  const changed = mount({ initialTab: 'schedule' });
  click('設定'); expect(changed).toHaveBeenLastCalledWith('settings');
  click('元の画面へ戻る'); expect(changed).toHaveBeenLastCalledWith('schedule');
});

it('keeps an unconfirmed trade draft across notifications', () => {
  mount({ initialTab: 'trade' });
  act(() => view.root.findByProps({ 'data-test-tab': 'trade' }).findByType('input').props.onChange({ target: { value: '未確定の条件' } }));
  click('通知（未読0件・要対応0件）');
  click('元の画面へ戻る');
  expect(view.root.findByProps({ 'data-test-tab': 'trade' }).findByType('input').props.value).toBe('未確定の条件');
});
it.each([{ year: 2027 }, { saveId: 'another-save' }])('clears mounted drafts when the session scope changes: %s', scope => {
  const changed = mount({ initialTab: 'trade' });
  act(() => view.root.findByProps({ 'data-test-tab': 'trade' }).findByType('input').props.onChange({ target: { value: '前セッションの条件' } }));
  changed.setScope(scope);
  expect(view.root.findByProps({ 'data-test-tab': 'trade' }).findByType('input').props.value).toBe('');
});
it.each(['contract', 'trade', 'scout', 'fa', 'mailbox', 'news', 'alumni'])('keeps successful autosave feedback in the header without inserting a row above %s', initialTab => {
  mount({ initialTab, notif: { type: 'ok', msg: '💾 オートセーブ' }, saveResult: { ok: true } });
  expect(view.root.findAll(n => typeof n.type === 'string' && n.props.className === 'notif nok')).toHaveLength(0);
  expect(text(view.root.findByProps({ 'data-ds': 'home-header' }))).toContain('保存済み');
});
it.each([{ type: 'warn', msg: '保存失敗' }, { type: 'ok', msg: '💾 セーブしました' }, { type: 'ok', msg: '獲得が成立しました' }])('retains nonredundant feedback on decision pages: %s', notif => {
  mount({ initialTab: 'scout', notif, saveResult: { ok: true } });
  expect(view.root.find(n => typeof n.type === 'string' && n.props.className?.startsWith('notif ')).children).toContain(notif.msg);
});
it('keeps autosave feedback when the header cannot yet confirm the save, and on other Hub pages', () => {
  mount({ initialTab: 'contract', notif: { type: 'ok', msg: '💾 オートセーブ' } });
  expect(text(view.root)).toContain('💾 オートセーブ');
  act(() => view.unmount()); view = null;
  mount({ initialTab: 'dashboard', notif: { type: 'ok', msg: '💾 オートセーブ' }, saveResult: { ok: true } });
  expect(text(view.root)).toContain('💾 オートセーブ');
});
