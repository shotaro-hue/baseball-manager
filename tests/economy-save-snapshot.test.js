import { afterEach, expect, it, vi } from 'vitest';
import * as ledger from '../src/engine/contractLedger';
import { validateEconomySave } from '../src/engine/economyPersistence';
import { renewalFixture } from '../src/engine/__tests__/fixtures/renewalWorld';

afterEach(() => vi.restoreAllMocks());

it('isolates one immutable ledger per save inspection and rechecks subsequent mutable and cold inputs', () => {
  const world = renewalFixture(), original = structuredClone(world);
  const employment = vi.spyOn(ledger, 'contractEmploymentAt');
  expect(validateEconomySave(world)).toBe('annual');
  const inspected = employment.mock.calls.map(([value]) => value);
  expect(inspected.length).toBeGreaterThan(1);
  expect(inspected.every(value => Object.isFrozen(value) && value !== world.contractEconomy.engine.spending.ledger)).toBe(true);
  expect(new Set(inspected).size).toBe(1);
  expect(world).toEqual(original);
  expect(Object.isFrozen(world.contractEconomy.engine.spending.ledger)).toBe(false);
  world.contractEconomy.engine.spending.ledger.records[0].contract.annualSalaryManYen = -1;
  expect(() => validateEconomySave(world)).toThrow();
  const cold = JSON.parse(JSON.stringify(original));
  cold.contractEconomy.engine.spending.ledger.records.push(cold.contractEconomy.engine.spending.ledger.records[0]);
  expect(() => validateEconomySave(cold)).toThrow();
  expect(validateEconomySave(original)).toBe('annual');
});
