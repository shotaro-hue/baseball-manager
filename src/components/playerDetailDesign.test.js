import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { PlayerModal } from './PlayerModal';
import { compareRows, PlayerComparisonDialog } from './PlayerComparisonTray';

vi.mock('../engine/saveload', () => ({ loadPlayerCareerLogById: vi.fn(async () => []) }));
const team = JSON.parse(readFileSync(new URL('../../e2e/fixtures/ui02a/team.json', import.meta.url)));
const text = n => typeof n === 'string' ? n : (n?.children || []).map(text).join('');
let view;
afterEach(() => { if (view) act(() => view.unmount()); });
function player(pitcher = false) { return structuredClone(team.players.find(p => !!p.isPitcher === pitcher)); }
function render(p, props = {}) {
  act(() => { view = create(React.createElement(PlayerModal, { player: p, year: 2026, teamName: team.name, teams: [team], onClose() {}, initialSection: 'stats', ...props })); });
  return view.root;
}
const row = (root, name) => root.findAll(n => n.props.className === 'player-stat-row').find(n => text(n).startsWith(name));

it('shows actual zero OPS and OBP instead of an absent record in player details', () => {
  const p = player();
  p.stats = { PA: 4, AB: 4, H: 0, D: 0, T: 0, HR: 0, BB: 0, HBP: 0, SF: 0, RBI: 0, SB: 0 };
  const root = render(p);
  expect(text(root)).toContain('一軍・2026年');
  expect(text(row(root, 'OPS'))).toBe('OPS0.000');
  expect(text(row(root, '出塁率'))).toBe('出塁率0.000');
});

it('distinguishes missing numerator, zero denominator and zero counts without mutation', () => {
  const p = player(); p.stats = { AB: 0, H: 0, HR: 0 }; delete p.condition; delete p.morale;
  const before = structuredClone(p), root = render(p);
  expect(text(row(root, '打率'))).toContain('算出不可');
  expect(text(row(root, 'OPS'))).toContain('未記録');
  expect(text(root)).not.toMatch(/NaN|undefined/);
  const header = root.findByProps({ className: 'player-state-summary' });
  expect(text(header)).toContain('未記録');
  expect(p).toEqual(before);
});

it('renders partial and absent pitching stats safely and keeps recorded zero ERA/WHIP', () => {
  const p = player(true); p.stats = { IP: 3, ER: 0, Hp: 0, BBp: 0 };
  let root = render(p);
  expect(text(row(root, '防御率'))).toBe('防御率0.00');
  expect(text(row(root, 'WHIP'))).toBe('WHIP0.00');
  act(() => view.unmount()); delete p.stats;
  root = render(p);
  expect(text(root)).toContain('未記録');
  expect(text(root)).not.toMatch(/NaN|undefined/);
});

it('gives each detail tab an associated panel and preserves compare/navigation callbacks', () => {
  const p = player(), compare = vi.fn(), navigate = vi.fn();
  const root = render(p, { isMyTeam: true, onToggleCompare: compare, onNavigate: navigate });
  const tab = root.findAllByProps({ role: 'tab' }).find(n => text(n) === '概要');
  act(() => tab.props.onClick());
  const panel = root.findByProps({ role: 'tabpanel' });
  expect(panel.props.id).toBe(tab.props['aria-controls']);
  expect(panel.props['aria-labelledby']).toBe(tab.props.id);
  act(() => root.findAllByType('button').find(n => text(n) === '＋ 比較').props.onClick());
  expect(compare).toHaveBeenCalledWith(p, team.name);
  act(() => root.findAllByType('button').find(n => text(n) === '起用へ').props.onClick());
  expect(navigate).toHaveBeenCalledWith('roster', p, team.name);
});

it('compares only recorded values and separates inapplicable metrics from missing ones', () => {
  const batter = player(), pitcher = player(true);
  batter.stats = { AB: 4, H: 0, D: 0, T: 0, HR: 0, BB: 0, HBP: 0, SF: 0 };
  pitcher.stats = { IP: 3, ER: 0, BBp: 0 }; pitcher.salary = -1;
  const before = structuredClone([batter, pitcher]), rows = new Map(compareRows(batter, pitcher).map(([k, ...v]) => [k, v]));
  expect(rows.get('OPS')).toEqual(['0.000', '— 対象外']);
  expect(rows.get('WHIP')).toEqual(['— 対象外', '— 未記録']);
  expect(rows.get('防御率')).toEqual(['— 対象外', '0.00']);
  expect(rows.get('年俸')[1]).toBe('— 不正値');
  expect([batter, pitcher]).toEqual(before);
});

it('labels comparison records with their first-team season, even for farm players', () => {
  const p = { ...player(), _teamName: team.name }, q = { ...player(true), _teamName: '他球団' };
  act(() => { view = create(React.createElement(PlayerComparisonDialog, { players: [p, q], year: 2026, onClose() {}, onRemove() {} })); });
  expect(text(view.root)).toContain('一軍・2026年');
  expect(text(view.root)).toContain('二軍成績は合算しません');
});

it('refreshes selected comparison stats by ID instead of retaining the selection snapshot', () => {
  const p = player(true), q = player(); p.stats = { IP: 9, ER: 0 };
  const updated = { ...p, stats: { IP: 9, ER: 4 } };
  const selections = [{ ...p, _teamName: team.name }, { ...q, _teamName: team.name }];
  act(() => { view = create(React.createElement(PlayerComparisonDialog, { players: selections, year: 2026, teams: [{ ...team, players: [updated, q] }], onClose() {}, onRemove() {} })); });
  const era = view.root.findAllByType('tr').find(n => text(n).startsWith('防御率'));
  expect(text(era)).toContain('4.00');
  expect(selections[0].stats.ER).toBe(0);
});
