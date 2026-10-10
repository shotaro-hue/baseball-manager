import React, { useState } from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useOffseason } from './useOffseason';
import { generateSeasonSchedule } from '../engine/scheduleGen';
import { emptyStats } from '../engine/playerCore';
vi.mock('../engine/player', () => ({ generateForeignFaPool: () => [], developPlayers: players => ({ players, summary: {} }) }));
vi.mock('../engine/scheduleGen', () => ({ generateSeasonSchedule: vi.fn(() => ({})), calcAllStarTriggerDay: () => 50 }));
const p = (id, extra = {}) => ({ id, name: `選手${id}`, age: 26, pos: '捕手', condition: 0, salary: 1000, contractYearsLeft: 3,
  serviceYears: 5, stats: { ...emptyStats(), PA: 600, HR: 0 }, playoffStats: emptyStats(), ...extra });
const team = players => ({ id: 0, name: '自球団', budget: 10000, players, farm: [], lineup: players.map(p => p.id), rotation: [] });
const views = []; let current;
afterEach(() => views.splice(0).forEach(v => act(() => v.unmount())));
beforeEach(() => { vi.clearAllMocks(); generateSeasonSchedule.mockReturnValue({}); });
function setup(options = {}) {
  const save = options.save || vi.fn(async () => ({ ok: true }));
  const history = { awards: [{ year: 2026, titles: { hr: [{ id: 0 }] } }], championships: [{ year: 2026, teamId: 0 }] };
  function Harness() {
    const [teams, setTeams] = useState(options.teams || [team([p(0)])]);
    const [year, setYear] = useState(2026), [gameDay, setGameDay] = useState(143), [screen, setScreen] = useState(options.screen || 'spring_training');
    const [offseasonPlan, setOffseasonPlan] = useState(options.plan || { version: 1, year: 2026, myId: 0, stage: 'results', draftApplied: true,
      spring: { conditionDeltas: { 0: 0 } }, growth: { growth: [] }, seasonInfo: { draftCount: 1 } });
    const [faPool, setFaPool] = useState(options.faPool || []);
    const [isAutoSaveSuspended, setIsAutoSaveSuspended] = useState(false);
    const gs = { teams, setTeams, year, setYear, myId: 0, myTeam: teams[0], gameDay, setGameDay, screen, setScreen, offseasonPlan, setOffseasonPlan,
      faPool, setFaPool, handleSave: save, isAutoSaveSuspended, setIsAutoSaveSuspended, getGameResultsMap: () => ({}), getSeasonHistory: () => history,
      ...Object.fromEntries(['setFaYears','setAllStarDone','setAllStarResult','setSchedule','setGameResultsMap','setAllTeamResultsMap','setAllStarTriggerDay','notify'].map(k => [k, vi.fn()])) };
    current = { gs, os: useOffseason(gs) }; return null;
  }
  act(() => views.push(create(React.createElement(Harness)))); return { save, history, get current() { return current; } };
}
it('keeps the completed season and camp unchanged when the new-year save fails; retry applies once', async () => {
  const save = vi.fn().mockResolvedValueOnce({ ok: false }).mockResolvedValue({ ok: true }); const h = setup({ save });
  await act(async () => expect(await h.current.os.handleSpringTrainingComplete()).toBe(false));
  expect(h.current.gs.year).toBe(2026); expect(h.current.gs.teams[0].players[0]).toMatchObject({ age: 26, stats: { PA: 600, HR: 0 }, contractYearsLeft: 3 });
  expect(h.current.gs.offseasonPlan.spring).toEqual({ conditionDeltas: { 0: 0 } }); expect(h.current.gs.isAutoSaveSuspended).toBe(false);
  const next = h.current.os.handleSpringTrainingComplete;
  await act(async () => { const first = next(); expect(await next()).toBe(false); expect(await first).toBe(true); });
  expect(h.current.gs.year).toBe(2027); expect(save).toHaveBeenCalledTimes(2);
  expect(h.current.gs.teams[0].players[0]).toMatchObject({ age: 27, contractYearsLeft: 2, serviceYears: 6, stats: { PA: 0 }, recentCareerLog: [{ year: 2026, teamId: 0, stats: { PA: 600, HR: 0 } }] });
  expect(save.mock.calls[0][0].careerEntries[0].playerId).toBe('0');
  expect(h.current.gs.screen).toBe('new_season'); expect(h.current.gs.offseasonPlan).toMatchObject({ year: 2027, resumeScreen: 'new_season', seasonInfo: { draftCount: 1 } });
  expect(save.mock.lastCall[0].payload).toMatchObject({ year: 2027, gameDay: 1, faYears: {}, offseasonPlan: { year: 2027 } });
  await act(async () => expect(await h.current.os.handleNextYear()).toBe(false));
});
it('does not commit a year when career persistence or schedule preparation fails', async () => {
  const h = setup({save:vi.fn().mockResolvedValueOnce({ok:false,reason:'indexeddb_write_failed'}).mockResolvedValue({ok:true})});
  await act(async () => expect(await h.current.os.handleNextYear()).toBe(false));
  expect(h.save).toHaveBeenCalledTimes(1); expect(h.current.gs.year).toBe(2026);
  h.save.mockClear();
  generateSeasonSchedule.mockImplementationOnce(() => { throw new Error('schedule unavailable'); });
  await act(async () => expect(await h.current.os.handleNextYear()).toBe(false));
  expect(h.save).not.toHaveBeenCalled(); expect(h.current.gs.year).toBe(2026);
});
it('does not invent a zero-stat season at the new club for an offseason FA transfer', async () => {
  const moved = p(0, { faArchivedYear: 2026, faOriginTeamId: 1, contractSignedYear: 2026,
    stats: emptyStats(), recentCareerLog: [{ year: 2026, teamId: 1, teamName: '旧球団', stats: { PA: 600, HR: 0 } }] });
  const h = setup({ teams: [team([moved])] });
  await act(async () => expect(await h.current.os.handleNextYear()).toBe(true));
  expect(h.save.mock.lastCall[0].careerEntries).toEqual([]);
  expect(h.current.gs.teams[0].players[0].recentCareerLog).toHaveLength(1);
  expect(h.current.gs.teams[0].players[0].recentCareerLog[0]).toMatchObject({ teamId: 1, stats: { PA: 600 } });
  expect(h.history.awards).toHaveLength(1); expect(h.history.championships).toHaveLength(1);
});
it('applies draft acquisitions and saved camp once, excluding refused and already owned players', () => {
  const h = setup({ screen: 'draft_review', plan: { version: 1, year: 2026, myId: 0, stage: 'results' } });
  const candidates = [p(0), p(1, { _drafted: true, _r1winner: 0 }), p(2), p(3)];
  const done = h.current.os.handleDraftComplete;
  act(() => { expect(done(candidates, { 1: 0, 2: 'refused', 3: 0 })).toBe(true); expect(done(candidates, {})).toBe(false); });
  expect(h.current.gs.teams[0].farm.map(p => p.id)).toEqual([1, 3]);
  expect(h.current.gs.offseasonPlan).toMatchObject({ draftApplied: true, seasonInfo: { draftCount: 2 } });
  const saved = JSON.parse(JSON.stringify({ teams: h.current.gs.teams, plan: h.current.gs.offseasonPlan }));
  const restored = setup({ ...saved, screen: 'spring_training' });
  expect(restored.current.os.springTrainingData).toEqual(saved.plan.spring);
  act(() => expect(restored.current.os.handleDraftComplete(candidates, { 3: 0 })).toBe(false));
  expect(restored.current.gs.teams[0].farm.map(p => p.id)).toEqual([1, 3]);
});
it('permits next years draft in the same mounted game while preserving previous acquisitions', () => {
  const h = setup({ screen: 'draft_review', plan: { version: 1, year: 2026, myId: 0, stage: 'results' } });
  for (const year of [2026, 2027, 2028]) {
    act(() => { h.current.gs.setYear(year); h.current.gs.setScreen('draft_review'); h.current.gs.setOffseasonPlan({ version: 1, year, myId: 0, stage: 'results' }); });
    act(() => expect(h.current.os.handleDraftComplete([p(year)], { [year]: 0 })).toBe(true));
  }
  expect(h.current.gs.teams[0].farm.map(p => p.id)).toEqual([2026, 2027, 2028]);
});
