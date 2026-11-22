import { afterEach, expect, it, vi } from 'vitest';
import * as capacity from '../rosterCapacity';
import { renewalFixture } from './fixtures/renewalWorld';
import { economyPolicy } from './fixtures/economyWorld';
import { createAnnualNewGameWorld, fromAnnualState, toAnnualState, reduceEconomyCommand } from '../contractEconomy';
import { cpuContractsRequest } from '../annualCpuContracts';

afterEach(() => vi.restoreAllMocks());

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
