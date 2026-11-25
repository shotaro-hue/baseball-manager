import { afterEach, expect, it, vi } from 'vitest';
import * as capacity from '../rosterCapacity';
import * as ledger from '../contractLedger';
import { projectAnnualState } from '../annualTransactions';
import { renewalFixture } from './fixtures/renewalWorld';
import { economyPolicy } from './fixtures/economyWorld';
import { createAnnualNewGameWorld, fromAnnualState, toAnnualState, reduceEconomyCommand } from '../contractEconomy';
import { cpuContractsRequest } from '../annualCpuContracts';

afterEach(() => vi.restoreAllMocks());

it('indexes dated employment by club once while preserving every annual funding floor', () => {
  const state = toAnnualState(renewalFixture()), expected = projectAnnualState(state);
  const original = ledger.contractEmploymentsAt;
  let reads = 0, employments = 0;
  vi.spyOn(ledger, 'contractEmploymentsAt').mockImplementation((...args) => {
    const result = original(...args);
    for (const rows of result.values()) for (const row of rows) {
      const teamId = row.teamId; employments++;
      Object.defineProperty(row, 'teamId', { enumerable: true, get() { reads++; return teamId; } });
    }
    return result;
  });
  expect(projectAnnualState(state)).toEqual(expected);
  expect(employments).toBeGreaterThan(0); expect(reads).toBe(employments);
});

it('shares unchanged roster-capacity inspection across CPU renewals and rechecks the final candidate', () => {
  const teams = structuredClone(renewalFixture().teams), player = teams[1].players[0];
  teams[1].players = Array.from({ length: 8 }, (_, i) => ({ ...player, id: `cpu-${i}` }));
  let world = createAnnualNewGameWorld({ teams, faPool: [], myId: 0, saveId: 'cpu-performance', season: 2026,
    policy: economyPolicy(teams), randomRoot: { algorithmVersion: 1, seed: 'cpu-performance' } });
  world.contractEconomy.clock = { season: 2026, phase: 'offseason', date: '2026-12-01', offseasonTurn: 0 };
  world.contractEconomy.engine.spending.budgetSeason = 2027;
  world = fromAnnualState(world, toAnnualState(world));
  const inspected = vi.spyOn(capacity, 'evaluateRosterCapacity');
  const result = reduceEconomyCommand(world, cpuContractsRequest(world));
  expect(result.ok, result.error).toBe(true);
  expect(result.world.contractEconomy.engine.transactions.at(-1).cpuContracts.rows.every(r => r.outcome === 'renewed')).toBe(true);
  // Whole-state entry/final inspections remain; eight unchanged offers must
  // not add sixteen scans of the league's owned IDs and draft assignments.
  expect(inspected.mock.calls.length).toBeLessThan(40);
  const broken = structuredClone(result.world);
  broken.teams[1].players.push({ ...broken.teams[1].players[0] });
  expect(() => toAnnualState(broken)).toThrow();
});
