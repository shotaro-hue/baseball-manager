import React from 'react';
import { act, create } from 'react-test-renderer';
import { it, expect, vi, afterEach } from 'vitest';
import { useSeasonFlow } from './useSeasonFlow';
import { TEAM_DEFS } from '../constants';
import { buildTeam } from '../engine/player';
import { generateSeasonSchedule } from '../engine/scheduleGen';

const { start } = vi.hoisted(() => ({ start: vi.fn() }));
vi.mock('../workers/seasonBatchWorker?worker', () => ({ default: class {
  postMessage(message) { start(message); } terminate() {}
} }));
let view;
afterEach(() => { act(() => view?.unmount()); start.mockClear(); });
function setup({ played = 140, plan = null, gameDay = played + 1 } = {}) {
  let api;
  const teams = TEAM_DEFS.map(def => ({...buildTeam(def), wins: played, losses: 0, draws: 0}));
  const gs = {teams, myId:teams[0].id, myTeam:teams[0], gameDay, year:2026, schedule:generateSeasonSchedule(2026,teams), offseasonPlan:plan,
    getGameResultsMap:()=>({}), getSeasonHistory:()=>({}), getNewsBySelector:()=>[], getMailboxBySelector:()=>[], getScheduleArchive:()=>[],
    setIsAutoSaveSuspended:vi.fn(),setScreen:vi.fn(),notify:vi.fn(),setPregameError:vi.fn()};
  function Harness() { api = useSeasonFlow(gs); return null; }
  act(() => {view = create(React.createElement(Harness));});
  return {gs,get api(){return api;}};
}
it('synchronously claims one Worker task even when the same handler is called twice before render', async () => {
  const h = setup(); const run = h.api.handleBatchSim;
  await act(async () => { run(5); run(5); });
  expect(start).toHaveBeenCalledTimes(1);
  expect(start.mock.calls[0][0].payload.count).toBe(3);
  expect(h.gs.setIsAutoSaveSuspended).toHaveBeenCalledTimes(1);
});
it('blocks invalid requests, completed seasons and offseason before starting a Worker', async () => {
  for (const count of [0,-1,NaN,1.5,undefined]) {
    const h=setup(); await act(async () => h.api.handleBatchSim(count)); act(() => view.unmount());
  }
  for (const options of [{played:143},{gameDay:1},{plan:{year:2026,myId:TEAM_DEFS[0].id,stage:'planning'}}]) {
    const h=setup(options); await act(async () => {h.api.handleBatchSim(5);h.api.handleSeasonSim();await h.api.handleStartGame();}); act(() => view.unmount());
  }
  expect(start).not.toHaveBeenCalled();
});
