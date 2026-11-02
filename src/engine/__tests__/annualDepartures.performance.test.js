import { afterEach, expect, it, vi } from 'vitest';
import * as ledger from '../contractLedger';
import * as departures from '../annualDepartures';
import { applyAnnualTransaction, projectAnnualState, quoteAnnualTransaction } from '../annualTransactions';
import { createAnnualNewGameWorld, toAnnualState } from '../contractEconomy';
import { economyPolicy, freezeEconomy } from './fixtures/economyWorld';
import { winter } from './fixtures/winterDepartures';

afterEach(() => vi.restoreAllMocks());

// Produce real departure records independently for each winter, then carry all
// original ledgers, receipts and listings into the last year's validation input.
function longHistory(years = 12, playersPerYear = 12) {
  const history = [], records = [], receipts = [], listings = [], exits = [];
  let state;
  for (let season = 2026; season < 2026 + years; season++) {
    const teams = [{ id: 0, players: Array.from({ length: playersPerYear }, (_, i) => ({
      id: `player-${season}-${i}`, name: `Player ${i}`, pos: '一塁手', salary: 1000, contractYearsLeft: 1,
    })), farm: [] }];
    state = toAnnualState(createAnnualNewGameWorld({ teams, faPool: [], myId: 0, saveId: 'history', season,
      policy: economyPolicy(teams, season), randomRoot: { algorithmVersion: 1, seed: 'history' } }));
    state = { ...state, phase: 'offseason', date: `${season}-12-01`,
      spending: { ...state.spending, budgetSeason: season + 1 } };
    for (const p of [...state.teams[0].players]) {
      const c = { id: `departure-${p.id}`, type: 'enter-market', teamId: 0, playerId: p.id,
        contractId: p.contractId, reason: 'expiry' };
      const signature = JSON.stringify(Object.fromEntries(Object.keys(c).sort().map(k => [k, c[k]])));
      state = departures.createWinterDeparture(state, c, signature);
    }
    records.push(...state.spending.ledger.records); receipts.push(...state.transactions);
    listings.push(...state.faPool); exits.push(...state.offseasonDepartures); history.push(...state.teams[0].history);
  }
  return { ...state, faPool: listings, transactions: receipts, offseasonDepartures: exits,
    teams: [{ ...state.teams[0], history }], spending: { ...state.spending,
      ledger: { ...state.spending.ledger, records } } };
}

it('does not reconstruct the ledger for zero departure histories', () => {
  const state = freezeEconomy(toAnnualState(winter()));
  const employment = vi.spyOn(ledger, 'contractEmploymentAt');
  expect(departures.inspectAnnualDepartures(state)).toEqual([]);
  expect(employment).not.toHaveBeenCalled();
});

it('reconstructs employment once per winter across twelve years, without retaining a cache', () => {
  const state = freezeEconomy(longHistory()), before = JSON.stringify(state);
  const employment = vi.spyOn(ledger, 'contractEmploymentAt');
  expect(departures.inspectAnnualDepartures(state)).toHaveLength(144);
  expect(employment.mock.calls.map(([, date]) => date)).toEqual(
    Array.from({ length: 12 }, (_, i) => `${2026 + i}-11-30`));
  expect(JSON.stringify(state)).toBe(before);
  // A later call must inspect its own ledger, not reuse the old successful view.
  const broken = structuredClone(state); broken.spending.ledger.records[0].changes.push({ type: 'forged' });
  expect(() => departures.inspectAnnualDepartures(broken)).toThrow();
});

it('validates departures once per projection and preserves quote/replay with long history', () => {
  const state = freezeEconomy(longHistory()), before = JSON.stringify(state);
  const inspection = vi.spyOn(departures, 'inspectAnnualDepartures');
  expect(projectAnnualState(state).offseasonDepartures).toHaveLength(144);
  expect(inspection).toHaveBeenCalledTimes(1);
  const command = JSON.parse(state.transactions[0].signature);
  inspection.mockClear();
  expect(quoteAnnualTransaction(state, command).ok).toBe(true);
  expect(inspection).toHaveBeenCalledTimes(1);
  inspection.mockClear();
  const replay = applyAnnualTransaction(state, command);
  expect(replay.ok, replay.error).toBe(true); expect(replay.replayed).toBe(true); expect(replay.state).toBe(state);
  expect(inspection).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(state)).toBe(before);
});

it('never trusts an earlier spending projection in place of current world validation', () => {
  const state = projectAnnualState(longHistory(2, 2));
  state.faPool[0].isFA = false;
  const before = JSON.stringify(state); freezeEconomy(state);
  expect(() => projectAnnualState(state)).toThrow();
  expect(quoteAnnualTransaction(state, JSON.parse(state.transactions[0].signature)).ok).toBe(false);
  expect(JSON.stringify(state)).toBe(before);
});
