import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, it, expect, vi } from 'vitest';
import { StatsTab } from './tabs/StatsTab';
import { emptyStats } from '../engine/playerCore';

const text = n => typeof n === 'string' ? n : (n.children || []).map(text).join('');
const player = (id, stats = {}, extra = {}) => ({ id, name: `選手${id}`, stats: { ...emptyStats(), PA: 4, AB: 4, ...stats }, ...extra });
const render = (players, farm = [], props = {}) => { let v; act(() => { v = create(React.createElement(StatsTab, { teams: [{ id: 0, name: '自球団', players, farm }], myId: 0, year: 2026, ...props })); }); return v; };
const click = (v, label) => act(() => v.root.findAllByType('button').find(n => text(n) === label).props.onClick());
const rows = v => v.root.findAllByProps({ className: 'interactive-player-row' });
const cell = (row, key) => row.findAllByType('td').find(n => n.props['data-metric'] === key);

describe('first-team list display and source', () => {
  it('keeps demoted participants, excludes farm-only estimates and changes no data', () => {
    const active = player('active'), demoted = player('demoted', {}, { stats2: { HR: 99 } });
    const farmOnly = player('farm-only', { PA: 0, AB: 0 }, { stats2: { PA: 100, HR: 88 } });
    const before = JSON.stringify([active, demoted, farmOnly]);
    const v = render([active], [demoted, farmOnly]);
    expect(rows(v).map(text)).toHaveLength(2);
    expect(text(v.toJSON())).toContain('一軍・2026年');
    expect(text(rows(v)[1])).toContain('二軍所属');
    expect(JSON.stringify([active, demoted, farmOnly])).toBe(before);
    v.unmount();
  });
  it('renders missing counters and rates without fabricating zero and sorts them last both ways', () => {
    const zero = player('zero'), missing = player('missing', { HR: undefined, H: undefined });
    const v = render([missing, zero]);
    expect(text(cell(rows(v)[0], 'OPS'))).toBe('0.000');
    expect(text(cell(rows(v)[1], 'HR'))).toBe('— 未記録');
    const sort = () => act(() => v.root.findByProps({ 'aria-label': '本塁打でソート' }).props.onClick());
    sort(); expect(text(rows(v)[0])).toContain('選手zero');
    sort(); expect(text(rows(v)[0])).toContain('選手zero');
    v.unmount();
  });
  it('distinguishes denominator zero, old incomplete stats and recorded zero advanced metrics', () => {
    const v = render([player('denominator', { PA: 0, AB: 0 }), player('measured', { evN: 1, evSum: 0, laN: 1, laSum: 0 }), player('legacy', {}, { stats: { PA: 4, AB: 4, H: 0 } })]);
    click(v, '詳細指標');
    const measured = rows(v).find(n => text(n).includes('選手measured'));
    expect(text(cell(measured, 'EVavg'))).toBe('0.0');
    expect(text(cell(measured, 'LAavg'))).toBe('0.0');
    expect(text(cell(rows(v).find(n => text(n).includes('選手denominator')), 'OPS'))).toBe('— 算出不可');
    expect(text(cell(rows(v).find(n => text(n).includes('選手legacy')), 'OPS'))).toBe('— 未記録');
    v.unmount();
  });
  it('handles missing pitcher stats and measured zero innings without NaN', () => {
    const v = render([player('zero', { IP: 0 }, { isPitcher: true }), player('missing', {}, { isPitcher: true, stats: undefined })]);
    click(v, '投手');
    expect(text(cell(rows(v)[0], 'IP'))).toBe('0.0');
    expect(text(cell(rows(v)[0], 'ERA'))).toBe('— 算出不可');
    expect(text(cell(rows(v)[1], 'ERA'))).toBe('— 未記録');
    expect(text(v.toJSON())).not.toMatch(/NaN|Infinity/);
    v.unmount();
  });
  it('filters team, current membership and name while preserving sort and exact player callbacks', () => {
    const open = vi.fn(), compare = vi.fn(), p = player('other');
    const v = render([player('own')], [], { teams: [{ id: 0, name: '自球団', players: [player('own')] }, { id: 1, name: '他球団', players: [], farm: [p] }], onPlayerClick: open, onToggleCompare: compare });
    act(() => v.root.findByProps({ 'aria-label': '成績対象の球団' }).props.onChange({ target: { value: '1' } }));
    act(() => v.root.findByProps({ 'aria-label': '現在の所属で絞り込み' }).props.onChange({ target: { value: 'farm' } }));
    act(() => v.root.findByProps({ 'aria-label': '選手名で検索' }).props.onChange({ target: { value: 'other' } }));
    act(() => rows(v)[0].props.onKeyDown({ key: 'Enter', preventDefault() {} }));
    expect(open).toHaveBeenCalledWith(p, '他球団', 'battedBall');
    act(() => v.root.findByProps({ 'aria-label': '選手otherを比較へ追加' }).props.onClick({ stopPropagation() {} }));
    expect(compare).toHaveBeenCalledWith(p, '他球団');
    v.unmount();
  });
});
