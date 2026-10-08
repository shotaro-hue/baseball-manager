import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { TEAM_DEFS, POS_TRAINING_PER_DAY } from '../constants';
import * as playerRules from '../engine/player';
import { applyRegularSeasonTeamUpdate } from '../engine/regularGameUpdates';
import { simulateSingleDay } from '../workers/singleDayCore';
import { simulateSeasonBatch } from '../workers/seasonBatchCore';
import { useSeasonFlow } from './useSeasonFlow';
import { generateCpuCpuTrade } from '../engine/trade';
import { executeCpuTrade } from '../engine/cpuTradeExecution';
import { optimizeTeamForGameStart } from '../engine/rosterAutomation';

const fixture = vi.hoisted(() => ({ score: { my: 1, opp: 0 } }));
vi.mock('../engine/simulation', () => ({
  quickSimGame: vi.fn(() => ({ score: { ...fixture.score }, won: fixture.score.my > fixture.score.opp, log: [], inningSummary: [] })),
  runFarmSeason: teams => teams,
}));
vi.mock('../engine/player', async importOriginal => ({ ...(await importOriginal()), checkForInjuries: vi.fn(() => []) }));
vi.mock('../engine/trade', async importOriginal => ({ ...(await importOriginal()), generateCpuOffer: vi.fn(() => null), generateCpuCpuTrade: vi.fn(() => null) }));
vi.mock('../engine/cpuTradeExecution', async importOriginal => ({ ...(await importOriginal()), executeCpuTrade: vi.fn((await importOriginal()).executeCpuTrade) }));
// Keep roster selection out of this parity test: each mode must update the same
// registered players. Actual automation and trade behavior have separate tests.
vi.mock('../engine/rosterAutomation', async importOriginal => {
  const actual = await importOriginal();
  return { ...actual, applyEmergencyRosterMaintenance: team => team,
    applyManagementPolicy: (team, options) => options?.force ? actual.applyManagementPolicy(team, options) : team,
    prepareTeamForGame: team => team };
});

function snapshot(isHome) {
  const teams = TEAM_DEFS.slice(0, 4).map(def => playerRules.buildTeam(def));
  teams.forEach(team => {
    team.players = team.players.map((p, index) => ({ ...p, id: `active-${team.id}-${index}`, daysOnActiveRoster: 119, registrationCooldownDays: 2,
      ...(!p.isPitcher ? { convertTarget: 'LF', positions: { ...p.positions, LF: 50 } } : {}) }));
    team.farm = team.farm.map((p, index) => ({ ...p, id: `farm-${team.id}-${index}`, injury: 'test', injuryPart: 'leg', injuryDaysLeft: 2, registrationCooldownDays: 2 }));
  });
  return { teams, myId: teams[0].id, gameDay: 1, year: 2026, allStarDone: true,
    allStarTriggerDay: 72, faPool: [], mailbox: [], news: [], seasonHistory: { transfers: [] },
    gameResultsMap: {}, scheduleArchive: [], saveRevision: 0,
    schedule: [null, { gameNo: 1, date: { month: 4, day: 1 }, matchups: [
      { homeId: teams[isHome ? 0 : 1].id, awayId: teams[isHome ? 1 : 0].id },
      { homeId: teams[2].id, awayId: teams[3].id },
    ] }] };
}

async function runHook(state, isHome, mode) {
  let api, updated;
  const gs = { ...state, myTeam: state.teams[0], setTeams: next => { updated = typeof next === 'function' ? next(updated || state.teams) : next; },
    getGameResultsMap: () => state.gameResultsMap, setGameDay: vi.fn(), setScreen: vi.fn(), notify: vi.fn(), addNews: vi.fn(), addTransferLog: vi.fn(), pushResult: vi.fn(), pushGameResult: vi.fn(),
    setMailbox: vi.fn(), setRetireModal: vi.fn(), setAllTeamResultsMap: vi.fn(), cpuTradeOffers: [],
  };
  function Harness() { api = useSeasonFlow(gs); return null; }
  let renderer;
  act(() => { renderer = TestRenderer.create(React.createElement(Harness)); });
  act(() => { api.setCurrentOpp(state.teams[1]); api.setCurrentGameTeams({ isHome }); });
  await act(async () => {
    const result = { score: { ...fixture.score }, log: [], inningSummary: [] };
    await (mode === 'auto' ? api.handleAutoSimEnd(result) : api.handleTacticalGameEnd(result));
  });
  expect(gs.notify).not.toHaveBeenCalled();
  act(() => renderer.unmount());
  return updated;
}

describe('regular season post-game parity', () => {
  beforeEach(() => { vi.spyOn(Math, 'random').mockReturnValue(.99); playerRules.checkForInjuries.mockReturnValue([]); });
  afterEach(() => vi.restoreAllMocks());
  for (const mode of ['auto', 'tactical']) {
    it(`keeps match updates when a deadline trade succeeds (${mode})`, async () => {
      fixture.score = { my: 1, opp: 0 };
      const state = snapshot(true);
      state.teams = state.teams.map(optimizeTeamForGameStart);
      state.schedule[1].date.month = 7;
      const buyer = state.teams[1], seller = state.teams[2];
      const sellerGets = buyer.players.find(p => !p.isPitcher);
      const buyerGets = seller.players.find(p => !p.isPitcher && p.pos === sellerGets.pos);
      generateCpuCpuTrade.mockReturnValueOnce({ buyerId: buyer.id, sellerId: seller.id, buyerName: buyer.name, sellerName: seller.name, buyerGets, sellerGets });
      Math.random.mockReturnValue(0);
      const before = structuredClone(state);
      const updated = await runHook(state, true, mode);
      expect(executeCpuTrade.mock.results.at(-1).value).toBe(true);
      updated.forEach((team, index) => {
        expect(team.wins + team.losses + team.draws).toBe(1);
        expect(team.budget).toBeGreaterThan(before.teams[index].budget);
        expect(team.rotIdx).toBe(before.teams[index].rotIdx + 1);
        expect(team.players.every(p => p.daysOnActiveRoster === 120)).toBe(true);
      });
      expect(updated[1].players.some(p => p.id === buyerGets.id)).toBe(true);
      expect(updated[2].players.some(p => p.id === sellerGets.id)).toBe(true);
      expect(state).toEqual(before);
    });
  }
  for (const isHome of [true, false]) {
    for (const score of [{ my: 1, opp: 0 }, { my: 0, opp: 0 }]) {
      it(`updates every club equally across four modes (${isHome ? 'home' : 'away'}, ${score.my === score.opp ? 'draw' : 'win'})`, async () => {
        fixture.score = score;
        const state = snapshot(isHome), original = structuredClone(state);
        const single = simulateSingleDay({ snapshot: state, gameContext: { selectedOpponentId: state.teams[1].id, isHome }, isCancelled: () => false }).nextState.teams;
        const batch = simulateSeasonBatch({ snapshot: state, count: 1, isCancelled: () => false }).nextState.teams;
        const auto = await runHook(state, isHome, 'auto');
        const tactical = await runHook(state, isHome, 'tactical');
        for (const teams of [single, batch, auto, tactical]) {
          teams.forEach((team, index) => {
            const before = state.teams[index];
            expect(team.players.every(p => p.daysOnActiveRoster === 120 && p.registrationCooldownDays === 1)).toBe(true);
            expect(team.farm.every(p => p.injuryDaysLeft === 1 && p.registrationCooldownDays === 1)).toBe(true);
            expect(team.players.filter(p => !p.isPitcher).every(p => p.positions.LF === 50 + POS_TRAINING_PER_DAY)).toBe(true);
            expect(team.rotIdx).toBe(before.rotIdx + 1);
            expect(team.budget).toBeGreaterThan(before.budget);
            expect(team.revenueThisSeason - (before.revenueThisSeason || 0)).toBe(team.budget - before.budget);
            expect(team.wins + team.losses + team.draws).toBe(1);
            expect(team.draws).toBe(score.my === score.opp ? 1 : 0);
          });
          expect(teams).toEqual(single);
        }
        expect(state).toEqual(original);
      });
    }
  }

  it('uses actual home/away innings for pitcher fatigue even when the first team is away', () => {
    const state = snapshot(false), team = state.teams[0];
    const pitcher = team.players.find(p => p.isPitcher);
    const result = { score: { my: 0, opp: 0 }, log: [
      { pitcherId: pitcher.id, isTop: false, pitches: 90 },
      { pitcherId: 'other', isTop: true, pitches: 90 },
    ] };
    const updated = applyRegularSeasonTeamUpdate(team, result, { isFirstTeam: true, isHomeTeam: false, gameDay: 1, year: 2026 }, playerRules).team;
    expect(updated.players.find(p => p.id === pitcher.id).condition).toBeLessThan(pitcher.condition);
    expect(updated.players.find(p => p.id === pitcher.id).recentPitchingDays).toEqual([1]);
  });

  it('records a new injury for player ID zero without immediately consuming its first day', () => {
    const team = snapshot(true).teams[0];
    team.players[0] = { ...team.players[0], id: 0 };
    playerRules.checkForInjuries.mockReturnValue([{ id: 0, type: 'test', days: 10, part: 'leg' }]);
    const update = applyRegularSeasonTeamUpdate(team, { score: { my: 0, opp: 0 }, log: [] }, { isFirstTeam: true, isHomeTeam: true, gameDay: 1, year: 2026 }, playerRules);
    expect(update.team.players[0].injuryDaysLeft).toBe(10);
    expect(update.team.players[0].injuryHistory.at(-1)).toEqual({ part: 'leg', year: 2026 });
    expect(team.players[0].injuryDaysLeft).toBeFalsy();
  });
});
