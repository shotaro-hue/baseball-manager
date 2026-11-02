import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';
import { FarmDevelopmentPanel } from './FarmDevelopmentPanel';
import { developmentFixture } from '../engine/__tests__/fixtures/developmentWorld';
import { pendingDevelopmentFixture } from '../engine/__tests__/fixtures/pendingDevelopmentWorld';

let view;
const text = n => n == null ? '' : typeof n === 'object' ? (Array.isArray(n) ? n : n.children || []).map(text).join('') : String(n);
const button = label => view.root.findAllByType('button').find(b => text(b) === label);
const click = label => act(() => button(label).props.onClick());
const props = (w, onConvertIkusei) => ({ team: w.teams.find(t => t.id === w.myId), farmState: { year: w.year }, annualGs: w, onConvertIkusei });
function mount(w = developmentFixture(), submit = vi.fn()) {
  act(() => { view = create(React.createElement(FarmDevelopmentPanel, props(w, submit))); });
  click('支配下登録'); return w;
}
afterEach(() => { if (view) act(() => view.unmount()); view = null; });

it.each([['fa', '3 → 4'], ['personnel', '2 → 3']])('includes pending %s joins in the preseason confirmation', (kind, count) => {
  mount(pendingDevelopmentFixture(kind));
  expect(text(view.root.findByProps({ role: 'dialog' }))).toContain(`${count} / 70人`);
});

it('previews prorated salary and unchanged 2028 end without the legacy deduction/one-year reset', () => {
  mount(); const dialog = view.root.findByProps({ role: 'dialog' });
  expect(text(dialog)).toContain('322万円'); expect(text(dialog)).toContain('2028');
  expect(text(dialog)).toContain('420万円'); expect(text(dialog)).not.toContain('予算からの差額控除');
  expect(text(dialog)).not.toContain('1年・残り1年');
  expect(text(dialog)).toContain('1 → 2 / 70人'); expect(text(dialog)).not.toContain('NaN');
});
it('waits for saved adoption, prevents double submit and retains confirmation on failure', async () => {
  let finish; const submit = vi.fn(() => new Promise(r => { finish = r; })); mount(developmentFixture(), submit);
  const confirm = button('登録を確定'); act(() => { confirm.props.onClick(); confirm.props.onClick(); });
  expect(submit).toHaveBeenCalledTimes(1); expect(view.root.findAllByProps({ role: 'dialog' })).toHaveLength(1);
  await act(async () => finish({ ok: false, error: '保存できません' }));
  expect(text(view.toJSON())).toContain('保存できません'); expect(view.root.findAllByProps({ role: 'dialog' })).toHaveLength(1);
  expect(button('登録を確定').props.disabled).toBe(false);
  click('登録を確定'); await act(async () => finish({ ok: true }));
  expect(text(view.toJSON())).toContain('支配下登録を保存しました');
  expect(view.root.findAllByProps({ role: 'dialog' })).toHaveLength(0);
});
it('shows the registration deadline reason and does not submit', () => {
  const submit = vi.fn(); mount(developmentFixture({ date: '2026-08-01' }), submit);
  expect(button('登録を確定').props.disabled).toBe(true);
  expect(submit).not.toHaveBeenCalled();
});
it('keeps published-ack recovery reachable after returning to the farm with an already converted player', async () => {
  const w = developmentFixture(); w.teams[0].farm[0].isIkusei = false; w.teams[0].farm[0].育成 = false;
  const recover = vi.fn(async () => ({ ok: true }));
  const gs = { ...w, saveResult: { reason: 'economy_adoption_required' }, recoverEconomyCommand: recover };
  act(() => { view = create(React.createElement(FarmDevelopmentPanel, props(gs, vi.fn()))); });
  expect(button('保存済みの契約を復旧する')).toBeTruthy();
  await act(async () => button('保存済みの契約を復旧する').props.onClick());
  expect(text(view.toJSON())).toContain('保存済みの契約を復旧しました');
});
