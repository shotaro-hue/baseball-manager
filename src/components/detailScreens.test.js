import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { StatsTab } from './tabs/StatsTab';
import { CareerTable } from './tabs/CareerTable';
import { CondBadge } from './ui';
import { emptyStats } from '../engine/playerCore';

vi.mock('../engine/saveload', () => ({ loadPlayerCareerLogById: vi.fn(async () => []) }));
const text = (node) => typeof node === 'string' ? node : (node.children || []).map(text).join('');
const click = (view, label) => act(() => view.root.findAllByType('button').find(n => text(n) === label).props.onClick());
const player = (id, stats) => ({ id, name: `選手${id}`, stats: { ...emptyStats(), ...stats } });
const renderStats = (players, props = {}) => create(React.createElement(StatsTab, {
  teams: [{ id: 0, name: '自チーム', players }], myId: 0, ...props,
}));

describe('detail screens', () => {
  it('distinguishes a recorded zero OPS/wOBA from no appearances', () => {
    let view;
    act(() => { view = renderStats([player(0, { PA: 4, AB: 4 }), player(1, {})]); });
    click(view, '詳細指標');
    const rows = view.root.findAllByProps({ className: 'interactive-player-row' });
    expect(text(rows[0])).toContain('0.000');
    expect(text(rows[1])).not.toContain('0.000');
    act(() => view.unmount());
  });

  it('retains sorting across major/detail toggles and opens the same player', () => {
    const open = vi.fn();
    const a = player(0, { PA: 4, AB: 4, HR: 0 });
    const b = player(1, { PA: 4, AB: 4, H: 1, HR: 1 });
    let view;
    act(() => { view = renderStats([a, b], { onPlayerClick: open }); });
    const sort = () => act(() => view.root.findByProps({ 'aria-label': '本塁打でソート' }).props.onClick());
    sort(); sort();
    click(view, '詳細指標'); click(view, '主要指標');
    const row = view.root.findAllByProps({ className: 'interactive-player-row' })[0];
    expect(text(row)).toContain('選手0');
    act(() => row.props.onKeyDown({ key: 'Enter', preventDefault() {} }));
    expect(open).toHaveBeenCalledWith(a, '自チーム', 'battedBall');
    act(() => view.unmount());
  });

  it('shows zero career ERA/WHIP and loads player ID zero correctly', async () => {
    const p = { ...player(0, { IP: 1, BF: 3 }), isPitcher: true };
    let view;
    await act(async () => { view = create(React.createElement(CareerTable, { player: p, year: 2026, teamId: 0, teamName: '自チーム' })); });
    const { loadPlayerCareerLogById } = await import('../engine/saveload');
    expect(loadPlayerCareerLogById).toHaveBeenCalledWith('0',undefined);
    const totals = view.root.findAllByType('tr').find(n => text(n).startsWith('通算'));
    expect(text(totals).match(/0\.00/g)).toHaveLength(2);
    act(() => view.unmount());
  });

  it('does not display exhausted condition zero as 100', () => {
    const view = create(React.createElement(CondBadge, { p: { condition: 0 } }));
    expect(text(view.toJSON())).toBe('●0');
    view.unmount();
  });
});
