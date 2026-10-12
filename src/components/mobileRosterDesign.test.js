import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';
import { MobileRoster } from './MobileRoster';

const player = (id, extra = {}) => ({ id, name: `選手${id}`, pos: '捕', condition: 70,
  batting: { contact: 50, power: 50 }, stats: { AB: 0, H: 0, HR: 0 }, ...extra });
const team = () => ({ id: 0, name: '確認球団', lineup: [0], rosterDhMode: false,
  fieldingNoDh: { 0: '捕' }, players: [player(0, { condition: 0, batting: { contact: 0, power: 0 }, stats: { AB: 10, H: 0, HR: 0 } }),
    player(1), player(2, { injuryDaysLeft: 5 }), player(3, { isPitcher: true, subtype: '中継ぎ' })],
  farm: [player(4, { 育成: true, stats2: { PA: 9999, H: 9999 } })], rotation: [] });
const text = node => typeof node === 'string' ? node : (node.children || []).map(text).join('');
let view;
afterEach(() => { if (view) act(() => view.unmount()); view = null; });
function render(props = {}) { act(() => { view = create(React.createElement(MobileRoster, { team: team(), farmState: {}, ...props })); }); }
function button(name) { return view.root.findAllByType('button').find(node => text(node) === name); }
function click(name) { act(() => button(name).props.onClick()); }

it('presents first/farm affiliation, roles and record scope in a labelled table', () => {
  render();
  expect(view.root.findAllByType('table')).toHaveLength(1);
  expect(text(view.root)).toContain('一軍の打線');
  click('二軍');
  expect(text(view.root)).toContain('育成');
  expect(text(view.root)).toContain('二軍実測');
  expect(text(view.root)).not.toContain('9999');
  expect(view.root.findAllByType('table')).toHaveLength(1);
});
it('preserves measured zero and identifies missing condition/stats rather than inventing zero', () => {
  const t = team(); t.lineup.push(1); t.players[1] = { ...t.players[1], condition: undefined, stats: {} };
  render({ team: t });
  expect(text(view.root)).toContain('状態未記録');
  click('成績');
  expect(text(view.root)).toContain('打率 0.000');
  expect(text(view.root)).toContain('HR 0');
  expect(text(view.root)).toContain('HR —');
});
it('preserves batting averages through the 1.000 rounding boundary', () => {
  const t = team();
  t.players = [[0, 10, 0], [1, 3, 1], [2, 1, 1], [3, 2000, 1999]].map(([id, AB, H]) => player(id, { stats: { AB, H, HR: 0 } }));
  t.lineup = t.players.map(p => p.id);
  render({ team: t }); click('成績');
  const content = text(view.root);
  for (const average of ['0.000', '0.333', '1.000']) expect(content).toContain(`打率 ${average}`);
  expect(content).not.toContain('0.1000');
});
it('keeps ID zero callbacks, existing lineup positions and the injury guard', () => {
  const t = team(), before = structuredClone(t), onReplaceLineup = vi.fn(), onSetLineupOrder = vi.fn(), onPlayerClick = vi.fn();
  render({ team: t, onReplaceLineup, onSetLineupOrder, onPlayerClick });
  act(() => view.root.findByProps({ 'aria-label': '選手0の打順' }).props.onChange({ target: { value: '1' } }));
  expect(onSetLineupOrder).toHaveBeenCalledWith(0, 1);
  click('入替');
  const picks = view.root.findAllByType('button').filter(node => text(node) === '起用');
  expect(picks[1].props.disabled).toBe(true);
  act(() => picks[1].props.onClick()); expect(onReplaceLineup).not.toHaveBeenCalled();
  act(() => picks[0].props.onClick()); expect(onReplaceLineup).toHaveBeenCalledWith([{ id: 1, pos: '捕' }]);
  expect(t).toEqual(before);
});
it('keeps DH change, pitching roles and player detail reachable', () => {
  const onSetRosterDhMode = vi.fn(), onPlayerClick = vi.fn();
  render({ onSetRosterDhMode, onPlayerClick });
  act(() => view.root.findByType('input').props.onChange({ target: { checked: true } }));
  expect(onSetRosterDhMode).toHaveBeenCalledWith(true);
  click('投手'); expect(text(view.root)).toContain('中継ぎ');
  const name = view.root.findAllByType('button').find(node => text(node).includes('選手3'));
  act(() => name.props.onClick()); expect(onPlayerClick).toHaveBeenCalledWith(expect.objectContaining({ id: 3 }), '確認球団');
});
