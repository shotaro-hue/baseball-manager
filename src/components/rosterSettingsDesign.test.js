import React from 'react';
import { act, create } from 'react-test-renderer';
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import { RosterTab } from './tabs/RosterTab';

const source = JSON.parse(readFileSync(new URL('../../e2e/fixtures/ui02a/team.json', import.meta.url)));
const text = n => typeof n === 'string' ? n : (n.children || []).map(text).join('');
let view;
afterEach(() => { if (view) act(() => view.unmount()); });
function render(team = structuredClone(source), callbacks = {}) {
  act(() => { view = create(React.createElement(RosterTab, { team, allTeams: [team], farmState: { year: 2026 }, ...callbacks })); });
  return view.root.findByType('details');
}
function click(root, name) { act(() => root.findAllByType('button').find(n => text(n) === name).props.onClick()); }

it('offers a return to the overview without another persistent view or game update', () => {
  const root = render();
  expect(text(root)).toContain('編成概要へ戻る');
  expect(text(root)).toContain('変更は随時反映');
  expect(root.findByProps({ 'aria-label': '編成モード' }).props.value).toBeDefined();
});

it('keeps zero OPS/ERA and marks missing stats and condition explicitly', () => {
  const t = structuredClone(source);
  for (const p of t.players) { p.stats = { AB: 10, H: 0, D: 0, T: 0, HR: 0, BB: 0, HBP: 0, SF: 0, IP: 3, ER: 0, BBp: 0, Hp: 0 }; p.condition = 0; p.morale = 0; }
  const root = render(t);
  expect(text(root)).toContain('0.000');
  click(root, '⚾ 投手・継投');
  expect(text(root)).toContain('0.00');
  act(() => view.unmount());
  for (const p of t.players) { p.stats = {}; delete p.condition; delete p.morale; }
  const missing = render(t);
  expect(text(missing)).toContain('未記録');
  expect(text(missing)).not.toContain('NaN');
  click(missing, '⚾ 投手・継投');
  expect(text(missing)).toContain('未記録');
});

it('labels lineup/fielding controls, keeps ID zero and does not mutate the team', () => {
  const t = structuredClone(source), p = t.players.find(p => !p.isPitcher);
  const oldId = p.id; p.id = 0; t.lineup = t.lineup.map(id => id === oldId ? 0 : id);
  const before = structuredClone(t), onSetLineupOrder = vi.fn(), onSetPlayerPosition = vi.fn();
  const root = render(t, { onSetLineupOrder, onSetPlayerPosition });
  act(() => root.findByProps({ 'aria-label': `${p.name}の打順` }).props.onChange({ target: { value: '2' } }));
  act(() => root.findByProps({ 'aria-label': `${p.name}の守備位置` }).props.onChange({ target: { value: 'DH' } }));
  expect(onSetLineupOrder).toHaveBeenCalledWith(0, 2);
  expect(onSetPlayerPosition).toHaveBeenCalledWith(0, 'DH');
  expect(t).toEqual(before);
});

it('keeps injury/order guards and full-auto preview separate from apply', () => {
  const t = structuredClone(source), p = t.players.find(p => p.id === t.lineup[0]);
  p.injuryDaysLeft = 5;
  const onApplyRosterPlan = vi.fn(), root = render(t, { onApplyRosterPlan });
  expect(root.findByProps({ 'aria-label': `${p.name}の打順` }).props.disabled).toBe(true);
  click(root, '🔄 一括自動編成を確認');
  expect(onApplyRosterPlan).not.toHaveBeenCalled();
  expect(text(root)).toContain('反映');
});

it('distinguishes zero denominators from missing records and handles 1.000', () => {
  const t = structuredClone(source);
  const batters = t.players.filter(p => !p.isPitcher);
  batters[0].stats = { AB: 0, H: 0, D: 0, T: 0, HR: 0, BB: 0, HBP: 0, SF: 0 };
  batters[1].stats = { AB: 1, H: 1, D: 0, T: 0, HR: 0, BB: 0, HBP: 0, SF: 0 };
  const root = render(t);
  expect(text(root)).toContain('算出不可 · 0打数');
  expect(text(root)).toContain('1.000');
  click(root, '⚾ 投手・継投');
  expect(text(root)).toContain('算出不可 · 0投球回');
});

it('keeps policy and automation callbacks and exposes current policy text', () => {
  const onSetManagementPolicy = vi.fn(), onSetRosterAutomationMode = vi.fn();
  const root = render(undefined, { onSetManagementPolicy, onSetRosterAutomationMode });
  const slider = root.findByProps({ 'aria-label': '起用方針' });
  expect(slider.props['aria-valuetext']).toBeTruthy();
  act(() => slider.props.onChange({ target: { value: '0' } }));
  act(() => root.findByProps({ 'aria-label': '編成モード' }).props.onChange({ target: { value: 'manual' } }));
  expect(onSetManagementPolicy).toHaveBeenCalledOnce();
  expect(onSetRosterAutomationMode).toHaveBeenCalledWith('manual');
});
