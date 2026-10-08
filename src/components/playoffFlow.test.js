import React, { useState } from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';
import { PlayoffScreen } from './PlayoffScreen';
import PlayoffRoute from './screenRoutes/PlayoffRoute';
import { initPlayoff, createSeries, recordSeriesGame, advancePlayoff, encodePlayoff } from '../engine/playoff';
import { planningResumeScreen } from '../engine/offseasonPlanning';
import { loadGame } from '../engine/saveload';
import { quickSimGame } from '../engine/simulation';

vi.mock('../engine/simulation', () => ({ quickSimGame: vi.fn(() => ({ score: { my: 1, opp: 0 }, log: [] })) }));
vi.mock('../engine/rosterAutomation', async original => ({ ...await original(), prepareTeamForGame: t => t }));
const teams = [0, 1, 2, 6, 7, 8].map((id, i) => ({ id, name: `球団${id}`, short: `球${id}`, league: id < 6 ? 'セ' : 'パ',
  wins: 90 - i % 3 * 4, losses: 50 + i % 3 * 4, draws: 3, players: [], farm: [], rotIdx: 0 }));
const text = n => typeof n === 'string' ? n : (n.children || []).map(text).join('');
const button = (view, label) => view.root.findAllByType('button').find(b => text(b) === label);
let view, current;
afterEach(() => { if (view) act(() => view.unmount()); view = null; vi.clearAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); });
function mount(playoff = initPlayoff(teams)) {
  function Harness() {
    const [p, setPlayoff] = useState(playoff), [clubs, setTeams] = useState(teams);
    current = { playoff: p, teams: clubs };
    return React.createElement(PlayoffScreen, { playoff: p, setPlayoff, teams: clubs, setTeams, myId: 0, year: 2026, onFinish: vi.fn() });
  }
  act(() => { view = create(React.createElement(Harness)); }); return view;
}
it('displays a draw without announcing an opponent win', async () => {
  quickSimGame.mockReturnValueOnce({ score: { my: 0, opp: 0 }, log: [] });
  mount(); await act(async () => button(view, '次の1試合を進める').props.onClick());
  expect(current.playoff.cs1_se.wins).toEqual([0, 0]);
  expect(text(view.toJSON())).toContain('1試合消化／1引分');
  expect(text(view.root.findByProps({ role: 'status' }))).toContain('引分');
  expect(text(view.root.findByProps({ role: 'status' }))).not.toContain('勝利');
});
it('finishes a partial postseason in batch mode without replacing previous results', async () => {
  vi.useFakeTimers();
  let p = initPlayoff(teams);
  p.cs1_se = recordSeriesGame(recordSeriesGame(p.cs1_se, { score: { my: 7, opp: 0 } }), { score: { my: 5, opp: 0 } });
  p.cs1_pa = recordSeriesGame(recordSeriesGame(p.cs1_pa, { score: { my: 3, opp: 0 } }), { score: { my: 2, opp: 0 } });
  p = advancePlayoff(p);
  p.cs2_se = recordSeriesGame(p.cs2_se, { score: { my: 9, opp: 0 } });
  mount(JSON.parse(JSON.stringify(encodePlayoff(p))));
  let running;
  act(() => { running = button(view, '残り全試合をまとめてシム').props.onClick(); });
  await act(async () => { await vi.runAllTimersAsync(); await running; });
  expect(current.playoff.champion.id).toBe(0);
  expect(current.playoff.cs1_se.games.map(g => g.score)).toEqual(['7-0', '5-0']);
  expect(current.playoff.cs2_se.games[0].score).toBe('9-0');
  expect(quickSimGame).toHaveBeenCalledTimes(9); // 2 + 3 + 4 remaining games
  expect(button(view, '引退・シーズン終了後の手続きへ')).toBeDefined();
});
it('stops between games and resumes from the current series', async () => {
  vi.useFakeTimers(); mount(); let running;
  act(() => { running = button(view, '残り全試合をまとめてシム').props.onClick(); });
  act(() => button(view, 'ここで止める').props.onClick());
  await act(async () => { await vi.runAllTimersAsync(); await running; });
  expect(quickSimGame).toHaveBeenCalledTimes(1);
  expect(current.playoff.cs1_se.games).toHaveLength(1);
  await act(async () => button(view, '次の1試合を進める').props.onClick());
  expect(current.playoff.cs1_se.games).toHaveLength(2);
  expect(current.playoff.phase).toBe('cs1_pa');
});
it('allows retry after a failed game without incrementing series wins', async () => {
  quickSimGame.mockImplementationOnce(() => { throw new Error('編成を見直してください'); });
  mount(); await act(async () => button(view, '次の1試合を進める').props.onClick());
  expect(current.playoff.cs1_se.games).toHaveLength(0);
  expect(text(view.root.findByProps({ role: 'status' }))).toContain('編成を見直してください');
  await act(async () => button(view, '次の1試合を進める').props.onClick());
  expect(current.playoff.cs1_se.games).toHaveLength(1);
});
it('round-trips a saved postseason through the existing save loader and resume route', async () => {
  const playoff = initPlayoff(teams);
  playoff.cs1_se = recordSeriesGame(playoff.cs1_se, { score: { my: 0, opp: 0 } });
  const plan = { version: 1, year: 2026, myId: 0, stage: 'postseason', resumeScreen: 'playoff', playoff: encodePlayoff(playoff) };
  const save = { teams, myId: 0, year: 2026, gameDay: 144, offseasonPlan: plan, saveDataVersion: 2 };
  vi.stubGlobal('localStorage', { getItem: key => key === 'baseball_manager_v1' ? JSON.stringify(save) : null });
  const loaded = await loadGame();
  expect(planningResumeScreen(loaded.offseasonPlan, loaded.year, loaded.myId)).toBe('playoff');
  mount(loaded.offseasonPlan.playoff);
  expect(text(view.toJSON())).toContain('1試合消化／1引分');
  await act(async () => button(view, '次の1試合を進める').props.onClick());
  expect(current.playoff.cs1_se.games).toHaveLength(2);
  expect(current.playoff.cs1_se.games[0].drew).toBe(true);
  expect(planningResumeScreen({ ...plan, year: 2025 }, 2026, 0)).toBe('hub');
});
it('records the championship, mail and trust change only once on a double tap', () => {
  let finish;
  const history = vi.fn(), mailbox = vi.fn(), upd = vi.fn(), screen = vi.fn(), setPlan = vi.fn();
  const gs = { screen: 'playoff', teams, setTeams: vi.fn(), setSeasonHistory: history, setMailbox: mailbox,
    upd, setOffseasonPlan: setPlan, handleSave: vi.fn() };
  const playoff = { ...initPlayoff(teams), champion: teams[0], jpSeries: { ...createSeries(teams[0], teams[3], 'japan'), wins: [4, 1] } };
  function Screen(props) { finish = props.onFinish; return null; }
  act(() => { view = create(React.createElement(PlayoffRoute, { gs, sf: { playoff, setPlayoff: vi.fn() }, myTeam: teams[0], myId: 0, year: 2026, setScreen: screen, ScreenComponent: Screen })); });
  act(() => { finish(); finish(); });
  expect(history).toHaveBeenCalledTimes(1); expect(mailbox).toHaveBeenCalledTimes(1); expect(upd).toHaveBeenCalledTimes(1);
  expect(screen).toHaveBeenCalledWith('retire_phase');
  expect(setPlan.mock.calls[0][0]({ stage: 'postseason' })).toMatchObject({ resumeScreen: 'retire_phase' });
});
