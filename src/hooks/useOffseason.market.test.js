import React, { useState } from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useOffseason } from './useOffseason';
import { cpuRenewContracts, processCpuFaBids } from '../engine/contract';
import { emptyStats } from '../engine/playerCore';
import { addMarketSigning } from '../components/hub/faMarket';

vi.mock('../engine/player', () => ({ developPlayers: players => ({ players, summary: {} }), rollRetire: () => false, generateForeignFaPool: () => [{ id: 'foreign', isForeign: true }] }));
vi.mock('../engine/saveload', () => ({ appendCareerEntriesToIndexedDb: vi.fn(async () => ({ ok: true })) }));
vi.mock('../engine/scheduleGen', () => ({ generateSeasonSchedule: () => ({}), calcAllStarTriggerDay: () => 50 }));
vi.mock('../engine/awards', () => ({ calcSeasonAwards: () => ({ titles: {} }), updateRecords: records => ({ records, broken: [] }), checkHallOfFame: () => [] }));
vi.mock('../engine/contract', async original => ({ ...await original(), cpuRenewContracts: vi.fn(), processCpuFaBids: vi.fn((teams, id, pool) => ({ updatedTeams: teams, remainingFaPool: pool, news: [], claimed: [] })) }));
const player = (id, extra = {}) => ({ id, name: `選手${id}`, age: 26, pos: '捕手', salary: 1000, condition: 80, morale: 70, stats: emptyStats(), contractYearsLeft: 1, personality: {}, ...extra });
const team = (id, players) => ({ id, name: `球団${id}`, league: id === 0 ? 'セ' : 'パ', budget: 10000, players, farm: [], history: [], wins: 70, losses: 70, rf: 500, ra: 500 });
let view;
afterEach(() => { if (view) act(() => view.unmount()); view = null; });
beforeEach(() => vi.clearAllMocks());
function setup(pool = [], oldExtra = {}) {
  let current;
  const old = player(0, oldExtra); const other = player(1, { contractYearsLeft: 0, stats: { ...emptyStats(), PA: 500, AB: 450, H: 150, HR: 10 } });
  cpuRenewContracts.mockImplementation(teams => ({ updatedTeams: teams.map(t => t.id === 1 ? { ...t, players: [] } : t), newFaPlayers: [{ ...other, isFA: true }], news: [] }));
  function Harness() {
    const [teams, setTeams] = useState([team(0, [old]), team(1, [other])]);
    const [faPool, setFaPool] = useState(pool); const [screen, setScreen] = useState('retire_phase');
    const [year, setYear] = useState(2026); const [gameDay, setGameDay] = useState(143);
    const [history, setSeasonHistory] = useState({ awards: [], records: {}, hallOfFame: [], championships: [], standingsHistory: [] });
    const gs = { teams, setTeams, myId: 0, myTeam: teams[0], faPool, setFaPool, screen, setScreen, year, setYear, gameDay, setGameDay, setSeasonHistory,
      getSeasonHistory: () => history, getGameResultsMap: () => ({}), upd: (id, update) => setTeams(prev => prev.map(t => t.id === id ? update(t) : t)),
      ...Object.fromEntries(['setFaYears', 'setMailbox', 'notify', 'addNews', 'addToHistory', 'addTransferLog', 'setRetireModal', 'setRetireGamePlayer', 'setAllStarDone', 'setAllStarResult', 'setSchedule', 'setGameResultsMap', 'setScheduleArchive', 'setAllTeamResultsMap', 'setAllStarTriggerDay'].map(key => [key, vi.fn()])) };
    const os = useOffseason(gs); current = { gs, os }; return null;
  }
  act(() => { view = create(React.createElement(Harness)); });
  return { get current() { return current; }, other };
}

it('makes other clubs candidates available before own renewal and processes CPU renewals only once', async () => {
  const h = setup(); await act(async () => { await h.current.os.handleRetirePhaseNext({}); });
  expect(h.current.gs.screen).toBe('offseason_fa_phase'); expect(cpuRenewContracts).toHaveBeenCalledTimes(1);
  expect(h.current.gs.faPool[0]).toMatchObject({ id: 1, faEnteredYear: 2026, faOriginTeamId: 1 });
  expect(h.current.os.contractRenewalDemands).toHaveProperty('0'); expect(h.current.os.contractRenewalDemands).not.toHaveProperty('1');
  act(() => {
    const p = h.current.gs.faPool[0]; h.current.gs.upd(0, t => addMarketSigning(t, p, 1000, 1, 2026, 'offseason'));
    h.current.gs.setFaPool([]);
  });
  const next = h.current.os.handleFaPhaseNext;
  act(() => { next(); next(); }); expect(h.current.gs.screen).toBe('contract_renewal_phase');
  expect(h.current.gs.myTeam.budget).toBe(9000); expect(h.current.gs.myTeam.players).toHaveLength(2);
  act(() => h.current.os.handleContractRenewalPhaseNext([]));
  expect(h.current.gs.screen).toBe('development_phase'); expect(cpuRenewContracts).toHaveBeenCalledTimes(1);
  expect(h.current.gs.myTeam.players).toHaveLength(2); expect(h.current.gs.myTeam.budget).toBe(9000);
});

it('allows no acquisition and preserves own FA declarations after the market phase', async () => {
  const h = setup(); await act(async () => { await h.current.os.handleRetirePhaseNext({}); });
  act(() => h.current.os.handleFaPhaseNext());
  act(() => h.current.os.handleContractRenewalPhaseNext([0]));
  expect(h.current.gs.myTeam.players).toHaveLength(0);
  expect(h.current.gs.faPool.map(p => p.id)).toEqual([1, 0]);
  expect(h.current.gs.faPool[1]).toMatchObject({ faEnteredYear: 2026, faOriginTeamId: 0, contractYearsLeft: 0 });
  expect(cpuRenewContracts).toHaveBeenCalledTimes(1);
});

it('keeps unsigned domestic candidates into next year with saved career and fresh foreign candidates', async () => {
  const h = setup([player(0, { isFA: true, faEnteredYear: 2026, faOriginTeamId: 0, stats: { ...emptyStats(), PA: 200, HR: 0 } }), player('old-foreign', { isForeign: true })]);
  await act(async () => { expect(await h.current.os.handleNextYear()).toBe(true); });
  expect(h.current.gs.year).toBe(2027);
  expect(h.current.gs.faPool.map(p => p.id)).toEqual([0, 'foreign']);
  const p = h.current.gs.faPool[0]; expect(p.age).toBe(27); expect(p.stats.PA).toBe(0);
  expect(p.recentCareerLog[0]).toMatchObject({ year: 2026, teamId: 0, stats: { PA: 200, HR: 0 } });
  expect(p.marketLastStats.PA).toBe(200);
});
it('removes numeric ID 0 retirees, archives them and prunes roster references', async () => {
  const h = setup([], { age: 36 }); act(() => h.current.gs.upd(0, t => ({ ...t, lineup: [0], rotation: [0] })));
  await act(async () => { await h.current.os.handleRetirePhaseNext({ 0: 'accepted' }); });
  expect(h.current.gs.myTeam.players).toHaveLength(0); expect(h.current.gs.myTeam.lineup).toEqual([]);
  expect(h.current.gs.myTeam.history[0]).toMatchObject({ id: 0, isRetired: true, exitReason: '引退' });
  expect(h.current.os.newSeasonInfo.retiredNames).toEqual(['選手0']);
});
it('passes the roster after release to CPU bids and commits one release with its history', async () => {
  const h = setup(); act(() => { h.current.gs.setScreen('waiver_phase'); h.current.gs.upd(0, t => ({ ...t, players: [...t.players, player(2, { contractYearsLeft: 3 })], lineup: [0, 2], lineupDh: [0, 2], rotation: [0] })); });
  const next = h.current.os.handleWaiverPhaseNext;
  act(() => { expect(next([0, 0])).toBe(true); expect(next([0])).toBe(false); });
  expect(processCpuFaBids).toHaveBeenCalledTimes(1);
  expect(processCpuFaBids.mock.calls[0][0][0].players.map(p => p.id)).toEqual([2]);
  expect(h.current.gs.myTeam.players.map(p => p.id)).toEqual([2]); expect(h.current.gs.myTeam.lineupDh).toEqual([2]); expect(h.current.gs.myTeam.rotation).toEqual([]);
  expect(h.current.gs.myTeam.history).toHaveLength(1); expect(h.current.gs.faPool.filter(p => p.id === 0)).toHaveLength(1);
  expect(h.current.os.waiverClaimResults.unclaimed.map(p => p.id)).toEqual([0]);
});
it('rejects stale and ineligible release targets without changing the roster or starting CPU bids', () => {
  const h = setup([], { contractYearsLeft: 3 }); act(() => h.current.gs.setScreen('waiver_phase'));
  act(() => { expect(h.current.os.handleWaiverPhaseNext([0])).toBe(false); expect(h.current.os.handleWaiverPhaseNext(['gone'])).toBe(false); });
  expect(h.current.gs.myTeam.players).toHaveLength(1); expect(processCpuFaBids).not.toHaveBeenCalled(); expect(h.current.gs.screen).toBe('waiver_phase');
});
it('marks a completed renewal with its actual signing year', () => {
  const h = setup(); act(() => h.current.os.handleContractRenewalSign(0, 1000, 1, 0, 0));
  expect(h.current.gs.myTeam.players[0].contractSignedYear).toBe(2026);
});
