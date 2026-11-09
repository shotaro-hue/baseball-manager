import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { saveGame, loadGame } from '../src/engine/saveload';
import { forecastNextAnnualBudget } from '../src/engine/annualBudgetForecast';
import { budgetForecastWorld } from '../src/engine/__tests__/fixtures/budgetForecast';
import { createInitialTeams } from '../src/engine/bootstrapTeams';
const primary = 'baseball_manager_v1';
let rows;
beforeEach(() => {
  rows = new Map(); vi.stubGlobal('indexedDB', new IDBFactory()); freshStorage();
  vi.stubGlobal('navigator', { locks: { request: (_key, operation) => Promise.resolve().then(operation) } });
});
afterEach(() => vi.unstubAllGlobals());
function freshStorage() {
  vi.stubGlobal('localStorage', { getItem: key => rows.get(key) ?? null,
    setItem: (key, value) => rows.set(key, String(value)), removeItem: key => rows.delete(key) });
}
const save = w => saveGame(w, { skipCompression: true });

// A budget-only persistence probe, not open-offseason or annual rollover. It
// keeps the current year/clock and tests the existing allowed policy update.
function installFutureQuote(world, quote) {
  const next = structuredClone(world), e = next.contractEconomy;
  const keep = list => list.filter(r => r.season <= world.year);
  e.budgetPolicies = [...keep(e.budgetPolicies), ...quote.budgetPolicies];
  e.engine.spending.authorizations = [...keep(e.engine.spending.authorizations), ...quote.authorizations];
  e.engine.rosterRequirements = [...keep(e.engine.rosterRequirements), ...quote.rosterRequirements];
  e.revision++;
  return next;
}

it('recreates the same forecast from real saved bootstrap data and persists only the existing approval format', async () => {
  const w = budgetForecastWorld(createInitialTeams());
  expect((await save(w)).ok).toBe(true); const originalRoot = rows.get(primary);
  freshStorage(); const loaded = await loadGame(), result = forecastNextAnnualBudget(loaded);
  expect(rows.get(primary)).toBe(originalRoot); // quote itself never publishes
  expect(result.quote.budgetPolicies).toHaveLength(96);
  const next = installFutureQuote(loaded, result.quote);
  expect((await save(next)).ok).toBe(true);
  freshStorage(); const restored = await loadGame();
  expect(restored.year).toBe(2026); expect(restored.contractEconomy.clock).toEqual(w.contractEconomy.clock);
  expect(restored.contractEconomy.engine.spending.budgetSeason).toBe(2026);
  expect(restored.contractEconomy.revision).toBe(w.contractEconomy.revision + 1);
  expect(restored).not.toHaveProperty('budgetForecast');
  expect(restored.contractEconomy.budgetPolicies).toEqual(next.contractEconomy.budgetPolicies);
  expect(forecastNextAnnualBudget(restored)).toEqual(result);
});

it('rejects tampered approval inputs before publishing and retains the prior root', async () => {
  const w = budgetForecastWorld(), result = forecastNextAnnualBudget(w), next = installFutureQuote(w, result.quote);
  expect((await save(w)).ok).toBe(true); expect((await save(next)).ok).toBe(true);
  const root = rows.get(primary), bad = structuredClone(next); bad.contractEconomy.revision++;
  bad.contractEconomy.budgetPolicies.find(r => r.teamId === 0 && r.season === 2027).operatingSurplusesManYen[0] += 100;
  expect((await save(bad)).ok).toBe(false); expect(rows.get(primary)).toBe(root);
  freshStorage(); expect(forecastNextAnnualBudget(await loadGame())).toEqual(result);
});

it('generates the same quote after the existing backup recovery path', async () => {
  const w = budgetForecastWorld(), result = forecastNextAnnualBudget(w);
  expect((await save(w)).ok).toBe(true); expect((await save(installFutureQuote(w, result.quote))).ok).toBe(true);
  rows.set(primary, 'corrupt-primary'); freshStorage();
  const recovered = await loadGame();
  expect(recovered.saveId).toBe(w.saveId); expect(recovered.contractEconomy.epoch).toBe(w.contractEconomy.epoch);
  expect(forecastNextAnnualBudget(recovered)).toEqual(result);
});

it('keeps a legacy save unchanged when forecast generation refuses activation', async () => {
  const w = budgetForecastWorld(); delete w.contractEconomy;
  expect((await save(w)).ok).toBe(true); const root = rows.get(primary);
  freshStorage(); const legacy = await loadGame();
  expect(() => forecastNextAnnualBudget(legacy)).toThrow(); expect(rows.get(primary)).toBe(root);
  expect(legacy.contractEconomy).toBeUndefined();
});
