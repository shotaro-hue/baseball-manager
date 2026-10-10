import React, { useState } from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useOffseason } from './useOffseason';
import { calcSeasonAwards, updateRecords } from '../engine/awards';
import { emptyStats } from '../engine/playerCore';
import { getCareerEntryKey } from '../engine/careerStats';
import { TEAM_DEFS } from '../constants';
vi.mock('../engine/player', () => ({ generateForeignFaPool: () => [], rollRetire: () => false,
  developPlayers: players => ({ players, summary: {} }) }));
vi.mock('../engine/scheduleGen', () => ({ generateSeasonSchedule: () => ({}), calcAllStarTriggerDay: () => 50 }));
vi.mock('../engine/contract', async original => ({ ...await original(), cpuRenewContracts: teams => ({ updatedTeams: teams, newFaPlayers: [], news: [] }) }));
const player = (id, stats = {}, extra = {}) => ({ id, name: `選手${id}`, age: 26, pos: '捕手', salary: 1000,
  contractYearsLeft: 5, serviceYears: 2, condition: 80, personality: {}, stats: { ...emptyStats(), ...stats }, playoffStats: emptyStats(), ...extra });
const team = (players, farm = [], id = 0) => ({ ...TEAM_DEFS[id], players, farm, wins: 80, losses: 63, draws: 0,
  budget: 100000, rf: 500, ra: 400, history: [], lineup: players.map(p => p.id), lineupNoDh: players.map(p => p.id), rotation: [] });
let current, view; const archived = new Map();
beforeEach(() => { vi.clearAllMocks(); archived.clear(); });
function recordCommittedEntries(entries=[]) {
  for (const { playerId, careerEntry } of entries) archived.set(`${playerId}:${getCareerEntryKey(careerEntry)}`, careerEntry);
}

afterEach(() => { if (view) act(() => view.unmount()); view = null; });
function setup(teams, options = {}) {
  const save = vi.fn(async options => {recordCommittedEntries(options.careerEntries);return {ok:true};});
  function Harness() {
    const [owned, setTeams] = useState(teams), [year, setYear] = useState(options.year || 2026), [screen, setScreen] = useState('spring_training');
    const [offseasonPlan, setOffseasonPlan] = useState({ version: 1, year: options.year || 2026, myId: 0, stage: 'results', spring: { conditionDeltas: {} } });
    const [faPool, setFaPool] = useState([]), [history, setSeasonHistory] = useState(options.history || { awards: [], records: {}, hallOfFame: [], standingsHistory: [], championships: [{ year: 2026, teamId: 0 }] });
    const gs = { teams: owned, setTeams, year, setYear, screen, setScreen, offseasonPlan, setOffseasonPlan, myId: 0, myTeam: owned[0],
      faPool, setFaPool, getSeasonHistory: () => history, setSeasonHistory, getGameResultsMap: () => ({}), handleSave: save, stageCareerEntries:recordCommittedEntries,
      ...Object.fromEntries(['setGameDay','setFaYears','setAllStarDone','setAllStarResult','setSchedule','setGameResultsMap','setAllTeamResultsMap','setAllStarTriggerDay','notify','setMailbox','addNews'].map(k => [k, vi.fn()])) };
    current = { gs, os: useOffseason(gs) }; return null;
  }
  act(() => { view = create(React.createElement(Harness)); }); return { save, get current() { return current; } };
}
it('retains three recorded seasons across promotion/demotion for all 12 clubs, without duplicate ownership or career rows', async () => {
  const teams = TEAM_DEFS.map((_, id) => team([player(id, { PA: 500, AB: 450, H: 150, HR: 20 })], [], id));
  let h = setup(teams);
  for (let offset = 0; offset < 3; offset++) {
    act(() => {
      h.current.gs.setScreen('spring_training'); h.current.gs.setOffseasonPlan({ version: 1, year: 2026 + offset, myId: 0, stage: 'results', spring: { conditionDeltas: {} } });
      h.current.gs.setTeams(prev => prev.map(t => {
        const p = [...t.players, ...t.farm][0]; const next = { ...p, stats: { ...emptyStats(), PA: 500, AB: 450, H: 150, HR: 20 + offset } };
        return { ...t, players: offset % 2 ? [next] : [], farm: offset % 2 ? [] : [next] };
      }));
    });
    const next = h.current.os.handleNextYear;
    await act(async () => { const pending = next(); expect(await next()).toBe(false); expect(await pending).toBe(true); });
    const owned = h.current.gs.teams.flatMap(t => [...t.players, ...t.farm]);
    expect(new Set(owned.map(p => p.id)).size).toBe(12); expect(h.current.gs.year).toBe(2027 + offset);
    owned.forEach(p => { expect(p.age).toBe(27 + offset); expect(p.serviceYears).toBe(3 + offset);
      expect(p.stats.PA).toBe(0); expect(p.recentCareerLog).toHaveLength(offset + 1);
      expect(p.recentCareerLog.map(row => row.stats.HR)).toEqual(Array.from({ length: offset + 1 }, (_, i) => 20 + i));
      expect(p.careerLogSummary.totalHomeRuns).toBe([20, 41, 63][offset]); });
    expect(archived.size).toBe(12 * (offset + 1));
    if (offset === 1) {
      const saved = JSON.parse(JSON.stringify({ teams: h.current.gs.teams, year: h.current.gs.year, history: h.current.gs.getSeasonHistory() }));
      act(() => view.unmount()); h = setup(saved.teams, saved);
    }
  }
  expect(h.current.gs.getSeasonHistory().championships).toEqual([{ year: 2026, teamId: 0 }]);
});
it('keeps farm stats and career data on a failed new-year save, then retries without duplicate season rows', async () => {
  const h = setup([team([], [player(0, { PA: 200, AB: 180, H: 50, HR: 0 })])]);
  h.save.mockResolvedValueOnce({ ok: false });
  await act(async () => expect(await h.current.os.handleNextYear()).toBe(false));
  expect(h.current.gs.year).toBe(2026); expect(h.current.gs.teams[0].farm[0].stats.PA).toBe(200);
  expect(h.current.gs.teams[0].farm[0].recentCareerLog).toBeUndefined();
  await act(async () => expect(await h.current.os.handleNextYear()).toBe(true));
  expect(h.current.gs.teams[0].farm[0].recentCareerLog).toHaveLength(1); expect(archived.size).toBe(1);
});
it('updates a continuing active contract once per year and preserves FA service days through serialization', async () => {
  let h = setup([team([player(0, {}, { contractYearsLeft: 4, daysOnActiveRoster: 700 })])]);
  for (let i = 0; i < 3; i++) {
    act(() => { h.current.gs.setScreen('spring_training'); h.current.gs.setOffseasonPlan({ version: 1, year: h.current.gs.year, myId: 0, stage: 'results' }); });
    await act(async () => expect(await h.current.os.handleNextYear()).toBe(true));
    const p = h.current.gs.teams[0].players[0]; expect(p.contractYearsLeft).toBe(3 - i); expect(p.daysOnActiveRoster).toBe(700);
    const saved = JSON.parse(JSON.stringify({ teams: h.current.gs.teams, year: h.current.gs.year, history: h.current.gs.getSeasonHistory() }));
    act(() => view.unmount()); h = setup(saved.teams, saved);
  }
});
it('keeps measured zero ERA in titles when the pitcher ends the season in the farm', () => {
  const teams = [team([player(1, { IP: 150, ER: 30 }, { isPitcher: true })], [player(0, { IP: 160, BF: 600, ER: 0, W: 15, L: 0 }, { isPitcher: true })])];
  const titles = calcSeasonAwards(teams, 2026).titles.central;
  expect(titles.era).toMatchObject({ playerId: 0, value: 0 }); expect(titles.winPct).toMatchObject({ playerId: 0, value: 1 });
});
it('includes a demoted league leader in first-team titles and records but never uses farm stats as first-team stats', () => {
  const leader = player(0, { PA: 600, AB: 500, H: 180, HR: 40 });
  const neverPlayed = player(1, {}, { stats2: { PA: 600, AB: 500, H: 300, HR: 90 } });
  const teams = [team([player(2, { PA: 600, AB: 500, H: 150, HR: 20 })], [leader, neverPlayed])];
  const awards = calcSeasonAwards(teams, 2026); expect(awards.titles.central.hr.playerId).toBe(0);
  expect(awards.titles.central.avg.playerId).toBe(0); expect(updateRecords({}, teams).records.singleSeasonHR.value).toBe(40);
});
it('counts a retiring players final season in awards and records once, before removing them from the roster', async () => {
  const h = setup([team([player(0, { PA: 600, AB: 500, H: 180, HR: 40 }, { age: 36 })])]);
  act(() => h.current.gs.setScreen('retire_phase'));
  await act(async () => expect(await h.current.os.handleRetirePhaseNext({ 0: 'accepted' })).toBe(true));
  expect(h.current.gs.teams[0].players).toHaveLength(0);
  expect(h.current.gs.getSeasonHistory().awards[0].titles.central.hr.playerId).toBe(0);
  expect(h.current.gs.getSeasonHistory().records.careerHR[0].value).toBe(40);
  expect(h.current.gs.teams[0].history[0].recentCareerLog[0].stats.HR).toBe(40);
});
it('archives measured zero-ERA relief appearances and playoff-only appearances, but does not invent a rookie season', async () => {
  const h = setup([team([], [player(0, { BF: 1, IP: 0, ER: 0 }, { isPitcher: true }),
    player(1, {}, { playoffStats: { ...emptyStats(), PA: 5, H: 2 } }), player(2)])]);
  await act(async () => expect(await h.current.os.handleNextYear()).toBe(true));
  expect(h.current.gs.teams[0].farm[0].recentCareerLog[0].stats).toMatchObject({ BF: 1, IP: 0, ER: 0 });
  expect(h.current.gs.teams[0].farm[1].recentCareerLog[0].playoffStats.PA).toBe(5);
  expect(h.current.gs.teams[0].farm[1].playoffStats.PA).toBe(0);
  expect(h.current.gs.teams[0].farm[2].recentCareerLog).toBeUndefined(); expect(archived.size).toBe(2);
});
