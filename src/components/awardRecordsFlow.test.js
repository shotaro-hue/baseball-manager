import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, it, expect } from 'vitest';
import { RecordsTab } from './tabs/RecordsTab';

const text = node => typeof node === 'string' ? node : (node.children || []).map(text).join('');
const render = history => { let view; act(() => { view = create(React.createElement(RecordsTab, { history })); }); return view; };
const openTitles = view => act(() => view.root.findAllByType('button').find(n => text(n) === 'タイトル歴代').props.onClick());

describe('award records compatibility', () => {
  it('shows pitcher MVP, league rookies and vacant Sawamura without undefined fields', () => {
    const view = render({ awards: [{ year: 2026, version: 2, mvp: { central: { name: '投手MVP', teamName: '球団', pos: '投手', ERA: 0 }, pacific: null }, rookie: { central: { name: 'セ新人', teamName: '球団' }, pacific: { name: 'パ新人', teamName: '球団' } } }] });
    const content = text(view.root);
    expect(content).toContain('防御率 0.00'); expect(content).toContain('セ新人王'); expect(content).toContain('パ新人王');
    expect(content).toContain('沢村賞：該当者なし'); expect(content).not.toContain('undefined');
    act(() => view.unmount());
  });
  it('renders all tied winners, the new titles and winning percentage 1.000', () => {
    const view = render({ standingsHistory: [{ year: 2026, titles: { central: { version: 2, sv: { name: '甲', winners: [{ name: '甲', value: 30 }, { name: '乙', value: 30 }] }, winPct: { name: '丙', value: 1 }, obp: { name: '丁', value: .4 }, hld: { name: '戊', value: 40 } } } }] });
    openTitles(view); const content = text(view.root);
    for (const label of ['甲','乙','最高出塁率','最高勝率','1.000','最多ホールド']) expect(content).toContain(label);
    act(() => view.unmount());
  });
  it('retains old single-winner titles and rookie records with their old meaning', () => {
    const view = render({ awards: [{ year: 2025, rookie: { name: '旧新人', teamName: '球団' }, mvp: { central: null, pacific: null } }], standingsHistory: [{ year: 2025, titles: { central: { sv: { name: '旧救援', value: 50 } } } }] });
    expect(text(view.root)).toContain('旧新人'); expect(text(view.root)).not.toContain('undefined');
    openTitles(view); expect(text(view.root)).toContain('旧救援'); expect(text(view.root)).toContain('セーブ＋ホールド（旧集計）');
    act(() => view.unmount());
  });
});
