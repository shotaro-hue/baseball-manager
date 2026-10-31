import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { CareerTable } from './tabs/CareerTable';
import { realBatterToPlayer, realPitcherToPlayer } from '../engine/realplayer';
import { appendCareerEntryToPlayer, makeCareerEntry } from '../engine/careerStats';
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

it('preserves unknown imported history, real zeroes and career totals through save/reload and next season', async () => {
  const p = realBatterToPlayer({name:'入力検証', pos:'捕手', age:24, salary:420,
    dataQuality:{history:'sourced'}, history:[{year:2025, PA:10, AB:10, H:null, HR:null, RBI:0, SB:0}]}, {gameId:0,name:'球団'});
  expect(p.careerLog[0].stats).toMatchObject({PA:10,H:null,HR:null,RBI:0,AVG:null,OPS:null});
  expect(p.careerLogSummary).toMatchObject({totalHits:null,totalHomeRuns:null,totalRbi:0});
  const state={saveId:'unknown-history',year:2026,gameDay:1,myId:0,teams:[{id:0,name:'球団',players:[p],farm:[]}],seasonHistory:{},news:[],mailbox:[],gameResultsMap:{}};
  await saveGame(state,{initialCareerLogs:[{playerId:p.id,careerEntries:p.careerLog}]});
  const loaded=await loadGame();
  expect((await loadPlayerCareerLogById(p.id,state.saveId))[0].stats.H).toBeNull();
  const saved=loaded.teams[0].players[0];
  expect(saved.careerLogSummary.totalHits).toBeNull();
  await render(saved,{saveId:state.saveId});
  expect(opsRows().map(r=>r.slice(2,7))).toEqual([
    ['10','— 未記録','— 未記録','0','0'], ['10','— 未記録','— 未記録','0','0'],
  ]);
  const next=appendCareerEntryToPlayer(saved,makeCareerEntry({...emptyStats(),PA:4,AB:4,H:1,HR:0},undefined,2026,0,'球団'));
  expect(next.careerLogSummary).toMatchObject({totalHits:null,totalHomeRuns:null,totalPlateAppearances:14});
});
it('does not derive pitching rates from missing observations or lose exact outs', async () => {
  const p=realPitcherToPlayer({name:'投手検証',pos:'先発',age:24,salary:420,
    dataQuality:{history:'sourced'}, history:[{year:2025,outs:1,W:0,L:null,SO:0,ER:null,H:null,BB:0}]}, {gameId:0,name:'球団'});
  expect(p.careerLog[0].stats).toMatchObject({IP:1/3,W:0,L:null,ER:null,Hp:null,GS:null});
  await render({...p,recentCareerLog:p.careerLog});
  expect(opsRows().map(r=>r.slice(2))).toEqual([
    ['— 未記録','0','— 未記録','— 未記録','0.1','0','— 未記録'],
    ['— 未記録','0','— 未記録','— 未記録','0.1','0','— 未記録'],
  ]);
});

it('retains explicitly observed zero rates while missing denominators stay unknown in career totals', async () => {
  const p=realBatterToPlayer({name:'ゼロ実測',pos:'捕手',age:24,salary:420,dataQuality:{history:'sourced'},
    history:[{year:2025,PA:10,AB:10,AVG:0,OPS:0,H:null}]},{gameId:0,name:'球団'});
  await render({...p,recentCareerLog:p.careerLog});
  expect(opsRows()[0][3]).toBe('.000');
  expect(opsRows()[0].at(-1)).toBe('0.000');
  expect(opsRows()[1][3]).toBe('— 未記録');
  expect(opsRows()[1].at(-1)).toBe('— 未記録');
});
it('includes zero-out runs and walks in imported career pitching rates', async () => {
  const p=realPitcherToPlayer({name:'アウト検証',pos:'先発',age:24,salary:420,dataQuality:{history:'sourced'},
    history:[{year:2024,outs:0,ER:1,BB:1,H:0},{year:2025,outs:3,ER:0,BB:0,H:0}]},{gameId:0,name:'球団'});
  await render({...p,recentCareerLog:p.careerLog});
  expect(opsRows()[0][2]).toBe('0.00');
  expect(opsRows()[1][2]).toBe('---');
  expect(opsRows()[2][2]).toBe('9.00');
  expect(opsRows()[2].at(-1)).toBe('1.00');
});
