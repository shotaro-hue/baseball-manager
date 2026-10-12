import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it } from 'vitest';
import { TeamComparisonPanel } from './TeamComparisonPanel';
import { emptyStats } from '../engine/playerCore';
const text = node => typeof node === 'string' ? node : (node.children || []).map(text).join('');

describe('FIX-S2 comparison display', () => {
  it('shows zero, missing, rank and incomplete annual payroll with explicit populations', () => {
    const myTeam = { id: 0, name: '自球団', league: 'セ', players: [
      { id: 0, isPitcher: true, subtype: '先発', salary: 0, stats: { ...emptyStats(), IP: 9 } },
      { id: 1, salary: 100, stats: { ...emptyStats(), AB: 4, PA: 4 } },
    ], farm: [{ id: 2, salary: null, stats: emptyStats() }, { id: 3, salary: '200', stats: emptyStats(), 育成: true }] };
    const opponent = { id: 1, name: '相手', league: 'セ', players: [], farm: [] }; let view;
    act(() => { view = create(React.createElement(TeamComparisonPanel, { myTeam, opponent, allTeams: [myTeam, opponent] })); });
    const rows = view.root.findAllByType('tr');
    const row = label => text(rows.find(node => text(node).startsWith(label)));
    expect(row('先発 ERA')).toContain('0.001/1位---');
    expect(row('打線 OPS')).toContain('0.0001/1位---');
    expect(row('総年俸')).toContain('確認済み 100万円');
    expect(row('総年俸')).toContain('集計不完全');
    expect(row('総年俸')).toContain('未記録1人'); expect(row('総年俸')).toContain('不正値1人');
    const display = text(view.toJSON());
    expect(display).toContain('二軍'); expect(display).toContain('年額');
    expect(display).toContain('現一軍');
    act(() => view.unmount());
  });
});
