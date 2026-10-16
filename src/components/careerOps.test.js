import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { CareerTable } from './tabs/CareerTable';
import { emptyStats } from '../engine/playerCore';
import { saveGame, loadGame, loadPlayerCareerLogById } from '../engine/saveload';

// Chart sizing is browser-only; exercise the real table and persistence in Node.
vi.mock('recharts', () => ({
  ResponsiveContainer: ({children}) => React.createElement('div',null,children),
  LineChart: () => null, Line: () => null, XAxis: () => null, YAxis: () => null, Tooltip: () => null, CartesianGrid: () => null,
}));

const known = { ...emptyStats(), PA: 500, AB: 450, H: 129, D: 25, T: 3, HR: 14, BB: 40, HBP: 5, SF: 5, OPS: .8 };
const row = (stats, year = 2025, teamName = '旧球団', playoffStats) => ({ year, teamId: year, teamName, stats, playoffStats });
const player = logs => ({ id: 's3', name: '佐藤海斗', isPitcher: false, recentCareerLog: logs });
let view;
beforeEach(() => {
  const data = new Map();
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('localStorage', { getItem: k => data.get(k) ?? null, setItem: (k,v) => data.set(k,String(v)), removeItem: k => data.delete(k) });
});
afterEach(() => { if (view) act(() => view.unmount()); view = null; vi.unstubAllGlobals(); });
async function render(p, extra = {}) {
  await act(async () => { view = create(React.createElement(CareerTable, { player: p, includeCurrentSeason: false, ...extra })); });
  for (let i=0; i<60 && JSON.stringify(view.toJSON()).includes('成績を読み込み中'); i++)
    await act(async () => { await new Promise(resolve => setTimeout(resolve,5)); });
  expect(JSON.stringify(view.toJSON())).not.toContain('成績を読み込み中');
}
const text = n => typeof n === 'string' || typeof n === 'number' ? String(n) : (n?.children || []).map(text).join('');
function opsRows() { return view.root.findAllByType('tbody')[0].findAllByType('tr').map(r => r.findAllByType('td').map(text)); }
it('recomputes old stored .800 as .797 in the year and career row without rewriting the record', async () => {
  const p = player([row(known)]), before = structuredClone(p);
  await render(p);
  expect(opsRows().map(r => r.at(-1))).toEqual(['0.797','0.797']);
  expect(p).toEqual(before);
});
it('sums numerators/denominators across stints and years and separates postseason', async () => {
  const second = { ...emptyStats(), PA: 151, AB: 100, H: 10, BB: 50, SF: 1, SH: 0, OPS: .8 };
  const post = { ...emptyStats(), PA: 4, AB: 4, H: 4 };
  const p = player([row(known,2025,'球団A',post),row(second,2025,'球団B'),row({...emptyStats(), PA: 3, AB: 3, H: 1},2026,'球団B')]);
  await render(p);
  // OBP = 235/654, SLG = 213/553; sum = .7444990..., rounded .744. Neither a mean of yearly OPS nor PA-weighted rounded OBP.
  expect(opsRows().map(r => r.at(-1))).toEqual(['0.667','0.497','0.797','0.744']);
  expect(opsRows().filter(r => r[0] === '2025').map(r => r[1])).toEqual(['球団B','球団A']);
  act(() => view.root.findAllByType('button').find(b => text(b) === 'ポスト').props.onClick());
  expect(opsRows().map(r => r.at(-1))).toEqual(['2.000','2.000']);
});
it('keeps stored positive OPS for partial legacy counts but does not invent a career total', async () => {
  await render(player([row({...known, HBP: undefined}), row({ ...known, PA: 510, HBP: 0, SF: 0 },2024)]));
  expect(opsRows().map(r => r.at(-1))).toEqual(['0.800','0.800','— 未記録']);
});
it('distinguishes recorded zero, missing counts and no denominator', async () => {
  await render(player([row({...emptyStats(), PA: 4, AB: 4},2023),row({PA: 4, AB: 4},2024),row(emptyStats(),2025)]));
  expect(opsRows().map(r => r.at(-1))).toEqual(['— 算出不可','— 未記録','0.000','— 未記録']);
});
it('does not turn current-season missing counts into compact zeroes', async () => {
  await render({...player([]), stats: {PA: 4, AB: 4, H: 0}}, {year:2026, includeCurrentSeason:true});
  expect(opsRows().map(r => r.at(-1))).toEqual(['— 未記録','— 未記録']);
});
it('preserves old save ownership, history and stored rate through load and read-only display', async () => {
  const logs = [row(known,2025,'移籍前'),row({...known,H:130,D:26},2026,'移籍後')];
  const p = {...player([]),stats:emptyStats()};
  const state = {saveId:'s3-save', year:2027,gameDay:1,myId:0,teams:[{id:0,name:'移籍後',players:[p],farm:[]}],seasonHistory:{},news:[],mailbox:[],gameResultsMap:{}};
  await saveGame(state,{initialCareerLogs:[{playerId:p.id,careerEntries:logs}]});
  const loaded = await loadGame();
  const stored = await loadPlayerCareerLogById(p.id,'s3-save');
  await render(loaded.teams[0].players[0],{saveId:'s3-save'});
  expect(opsRows().map(r => r.at(-1))).toEqual(['0.803','0.797','0.800']);
  expect(await loadPlayerCareerLogById(p.id,'s3-save')).toEqual(stored);
  expect((await loadGame()).teams).toEqual(loaded.teams);
});
it('does not let an absent season object silently become a zero contribution to career OPS', async () => {
  await render(player([row(undefined,2024),row(known,2025)]));
  expect(opsRows().map(r=>r.at(-1))).toEqual(['0.797','— 未記録','— 未記録']);
});
it('keeps annual OPS but withholds career OPS when saved historical details are unavailable', async () => {
  await render({...player([row(known)]),careerLogSummary:{trimmedEntries:4}});
  expect(JSON.stringify(view.toJSON())).toContain('過去の詳細成績を読み込めませんでした');
  expect(opsRows().map(r=>r.at(-1))).toEqual(['0.797','— 未記録']);
});
