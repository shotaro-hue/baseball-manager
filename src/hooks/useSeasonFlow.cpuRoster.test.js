import React from 'react';
import { act, create } from 'react-test-renderer';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useSeasonFlow } from './useSeasonFlow';
import { quickSimGame } from '../engine/simulation';
import { prepareTeamForGame } from '../engine/rosterAutomation';

vi.mock('../engine/simulation', () => ({
  quickSimGame: vi.fn(() => ({ score: { my: 2, opp: 1 }, won: true, log: [], inningSummary: [] })),
  runFarmSeason: teams => teams,
}));
vi.mock('../engine/player', async original => ({ ...(await original()), checkForInjuries: () => [] }));
vi.mock('../engine/trade', async original => ({ ...(await original()), generateCpuOffer: () => null }));

let view;
beforeEach(() => { vi.spyOn(Math, 'random').mockReturnValue(0.99); quickSimGame.mockClear(); });
afterEach(() => { act(() => view?.unmount()); vi.restoreAllMocks(); });

function setup(useDh, isHome) {
  const fixture = JSON.parse(gunzipSync(readFileSync(new URL('../../e2e/fixtures/new-game.json.gz', import.meta.url))));
  const teams = fixture.teams.slice(0, 4);
  teams.forEach(t => { t.dhEnabled = useDh; });
  const injured = [teams[1], teams[2]].map(team => {
    const id = team.lineupNoDh[0];
    team.players = team.players.map(p => p.id === id ? { ...p, injury: 'test', injuryDaysLeft: 3 } : p);
    // CPU ownership must not inherit a saved manual-mode restriction.
    team.rosterAutomationMode = 'manual';
    return id;
  });
  const state = { teams, myId: teams[0].id, myTeam: teams[0], gameDay: 1, year: 2026,
    allStarDone: true, allStarTriggerDay: 72, cpuTradeOffers: [],
    schedule: [null, { gameNo: 1, date: { month: 4, day: 1 }, matchups: [
      { homeId: teams[isHome ? 0 : 1].id, awayId: teams[isHome ? 1 : 0].id },
      { homeId: teams[2].id, awayId: teams[3].id },
    ] }],
    getGameResultsMap: () => ({}), setGameDay: vi.fn(), setScreen: vi.fn(), setPregameError: vi.fn(),
    setTeams: vi.fn(), notify: vi.fn(), addNews: vi.fn(), addTransferLog: vi.fn(),
    pushResult: vi.fn(), pushGameResult: vi.fn(), setAllTeamResultsMap: vi.fn(),
  };
  let api;
  function Harness() { api = useSeasonFlow(state); return null; }
  act(() => { view = create(React.createElement(Harness)); });
  return { state, injured, get api() { return api; } };
}

for (const useDh of [false, true]) for (const isHome of [false, true]) {
  it(`finalizes tactical results with injured CPU starters (DH=${useDh}, home=${isHome}) exactly once`, async () => {
    const h = setup(useDh, isHome), original = structuredClone(h.state.teams);
    await act(async () => { await h.api.handleStartGame(); });
    expect(h.state.setPregameError).toHaveBeenLastCalledWith(null);
    const playedOpponent = h.api.currentGameTeams.opp;
    expect(playedOpponent.lineup).not.toContain(h.injured[0]);
    const finish = h.api.handleTacticalGameEnd;
    const result = { score: { my: 3, opp: 1 }, log: [], inningSummary: [] };
    await act(async () => { await finish(result); await finish(result); });
    expect(h.state.notify).not.toHaveBeenCalled();
    expect(h.state.setTeams).toHaveBeenCalledTimes(1);
    expect(h.state.pushGameResult).toHaveBeenCalledTimes(1);
    expect(h.state.pushGameResult).toHaveBeenCalledWith(1, expect.objectContaining({ myScore: 3, oppScore: 1, isHome }));
    expect(h.state.setGameDay).toHaveBeenCalledTimes(1);
    expect(h.state.setGameDay.mock.calls[0][0](1)).toBe(2);
    const updated = h.state.setTeams.mock.calls[0][0];
    expect(updated[0].lineupNoDh).toEqual(original[0].lineupNoDh);
    expect(updated[0].lineupDh).toEqual(original[0].lineupDh);
    updated.forEach(team => expect(team.wins + team.losses + team.draws).toBe(1));
    expect(quickSimGame).toHaveBeenCalledTimes(1);
    const simulatedCpu = quickSimGame.mock.calls[0][0];
    expect(simulatedCpu.lineup).not.toContain(h.injured[1]);
    expect(() => prepareTeamForGame(simulatedCpu, useDh)).not.toThrow();
    // Stats must be applied to the actual pregame roster, not the stale one.
    for (const p of playedOpponent.players) {
      expect(updated[1].players.concat(updated[1].farm).find(q => q.id === p.id).daysOnActiveRoster)
        .toBe((p.daysOnActiveRoster || 0) + 1);
    }
    const allResults = h.state.setAllTeamResultsMap.mock.calls[0][0]({});
    expect(Object.keys(allResults)).toHaveLength(4);
    for (const team of updated) expect(Object.keys(allResults[team.id])).toEqual(['1']);
    expect(h.state.teams).toEqual(original);
  });
}

it('does not simulate unscheduled CPU games', async () => {
  const h = setup(false, true);
  h.state.schedule[1].matchups = h.state.schedule[1].matchups.slice(0, 1);
  await act(async () => { await h.api.handleStartGame(); });
  await act(async () => { await h.api.handleTacticalGameEnd({ score: { my: 0, opp: 0 }, log: [] }); });
  expect(h.state.notify).not.toHaveBeenCalled();
  expect(quickSimGame).not.toHaveBeenCalled();
  const updated = h.state.setTeams.mock.calls[0][0];
  expect(updated[0].draws).toBe(1);
  expect(updated[1].draws).toBe(1);
  for (const team of updated.slice(2)) expect(team.wins + team.losses + team.draws).toBe(0);
  expect(Object.keys(h.state.setAllTeamResultsMap.mock.calls[0][0]({}))).toHaveLength(2);
});
