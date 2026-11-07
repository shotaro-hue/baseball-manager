import { test, expect } from '@playwright/test';
import { createServer } from 'vite';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';

const root = fileURLToPath(new URL('../', import.meta.url));
const legacy = JSON.parse(gunzipSync(readFileSync(new URL('../src/engine/__tests__/fixtures/postingMathV1.json.gz', import.meta.url))));
const command = w => ({ saveId: w.saveId, epoch: w.contractEconomy.epoch, baseRevision: 2,
  transaction: { id: 'generated', type: 'run-posting-market', requestId: 'request' } });
const effects = w => JSON.parse(JSON.stringify({ economy: w.contractEconomy, rosters: w.teams.map(t => ({
  id: t.id, budget: t.budget, players: t.players.map(p => p.id), farm: t.farm.map(p => p.id),
  history: (t.history ?? []).map(p => ({ id: p.id, departure: p.postingDepartureId })) })) }));

// Node genuinely executes the V8 save/restore code; each test has its own IDB
// and SSR module instance. Browser evaluation below executes in the page's VM.
async function withNodeSave(run) {
  const rows = new Map(), globals = { localStorage: { getItem: k => rows.get(k) ?? null,
    setItem: (k, v) => rows.set(k, String(v)), removeItem: k => rows.delete(k) }, indexedDB: new IDBFactory(), IDBKeyRange };
  const previous = Object.fromEntries(Object.keys(globals).map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  for (const [k, value] of Object.entries(globals)) Object.defineProperty(globalThis, k, { value, writable: true, configurable: true });
  const server = await createServer({ root, configFile: root + '/vite.config.js', server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
  try {
    const save = await server.ssrLoadModule('/src/engine/saveload.js');
    const economy = await server.ssrLoadModule('/src/engine/contractEconomy.js');
    const validation = await server.ssrLoadModule('/src/engine/economyPersistence.js');
    const fixture = await server.ssrLoadModule('/src/engine/__tests__/fixtures/postingMarketResults.js');
    await run({ save, economy, validation, fixture });
  } finally {
    await server.close();
    for (const k of Object.keys(globals)) if (previous[k]) Object.defineProperty(globalThis, k, previous[k]); else delete globalThis[k];
  }
}

for (const key of ['v8', 'jsc', 'threshold-v8', 'threshold-jsc', 'new', 'new-threshold']) {
  test(`save generations: posting numeric compatibility ${key} crosses V8 and page save engines without rewriting results`, async ({ page, browser }, info) => {
    await withNodeSave(async ({ save, economy, validation, fixture }) => {
      let source;
      if (key.startsWith('new')) {
        const before = fixture.postingMathWorld();
        if (key === 'new-threshold') before.teams[0].players[0].personality.overseas = 15.076381453789548;
        const result = economy.reduceEconomyCommand(before, command(before)); expect(result.ok, result.error).toBe(true); source = result.world;
      } else source = structuredClone(legacy[key]);
      expect(validation.validateEconomySave(source)).toBe('annual');
      expect((await save.saveGame(source, { skipCompression: true })).ok).toBe(true);
      const fromV8 = await save.loadGame(), original = effects(fromV8), envelope = command(fromV8);
      expect(original).toEqual(effects(source));
      await page.goto('/');
      const returned = await page.evaluate(async ({ world, envelope }) => {
        const { validateEconomySave } = await import('/baseball-manager/src/engine/economyPersistence.js');
        const { reduceEconomyCommand } = await import('/baseball-manager/src/engine/contractEconomy.js');
        const { saveGame, loadGame } = await import('/baseball-manager/src/engine/saveload.js');
        const validation = validateEconomySave(world), commit = await saveGame(world, { skipCompression: true });
        if (!commit.ok) throw Error(JSON.stringify(commit));
        const cold = await loadGame(); if (!cold) throw Error('page cold load failed');
        const before = JSON.stringify(cold.contractEconomy), replay = reduceEconomyCommand(cold, envelope);
        if (!replay.ok || !replay.replayed || before !== JSON.stringify(replay.world.contractEconomy)) throw Error('page replay changed economics');
        const primary = localStorage.getItem('baseball_manager_v1'), rejected = [];
        for (const field of ['amount', 'outcome', 'root', 'qualification', 'child', 'money', 'income']) {
          const bad = structuredClone(cold), e = bad.contractEconomy, g = e.engine.transactions.at(-1).generatedPostingMarket;
          if (field === 'amount') g.evaluation.offer.guaranteedUsdCents++;
          if (field === 'outcome') g.evaluation.outcome = g.evaluation.outcome === 'signed' ? 'declined' : 'signed';
          if (field === 'root') e.randomRoot.seed += '-tampered';
          if (field === 'qualification') g.qualificationId = 'wrong';
          if (field === 'child') e.engine.postingMarketResults[0].id = 'wrong';
          if (field === 'money') g.evaluation.acceptance.moneyScore += 1e-7;
          if (field === 'income') {
            if (e.incomeReceipts.length) e.incomeReceipts[0].amountManYen++;
            else e.engine.postingMarketResults[0].outcome = 'signed';
          }
          let invalid = false; try { validateEconomySave(bad); } catch { invalid = true; }
          if (!invalid || (await saveGame(bad)).ok) throw Error('accepted corruption: ' + field);
          if (localStorage.getItem('baseball_manager_v1') !== primary) throw Error('invalid world changed root');
          rejected.push(field);
        }
        return { validation, world: JSON.parse(JSON.stringify(cold)), rejected, ua: navigator.userAgent };
      }, { world: fromV8, envelope });
      expect(returned.validation).toBe('annual'); expect(returned.rejected).toHaveLength(7);
      expect(effects(returned.world)).toEqual(original);
      expect(validation.validateEconomySave(returned.world)).toBe('annual');
      expect((await save.saveGame(returned.world, { skipCompression: true })).ok).toBe(true);
      expect(effects(await save.loadGame())).toEqual(original);
      expect(economy.reduceEconomyCommand(returned.world, envelope)).toMatchObject({ ok: true, replayed: true });

      if (key.startsWith('new')) {
        // Fresh storage, so the page itself GENERATES and saves the new receipt.
        const context = await browser.newContext();
        try {
          const other = await context.newPage(); await other.goto(page.url());
          const fromPage = await other.evaluate(async threshold => {
            const { postingMathWorld } = await import('/baseball-manager/src/engine/__tests__/fixtures/postingMarketResults.js');
            const { reduceEconomyCommand } = await import('/baseball-manager/src/engine/contractEconomy.js');
            const { saveGame, loadGame } = await import('/baseball-manager/src/engine/saveload.js');
            const before = postingMathWorld(); if (threshold) before.teams[0].players[0].personality.overseas = 15.076381453789548;
            const r = reduceEconomyCommand(before, { saveId: before.saveId, epoch: before.contractEconomy.epoch, baseRevision: 2,
              transaction: { id: 'generated', type: 'run-posting-market', requestId: 'request' } });
            if (!r.ok || !(await saveGame(r.world, { skipCompression: true })).ok) throw Error(r.error ?? 'page-generated save failed');
            return JSON.parse(JSON.stringify(await loadGame()));
          }, key === 'new-threshold');
          expect(effects(fromPage)).toEqual(original);
          expect(validation.validateEconomySave(fromPage)).toBe('annual');
          expect((await save.saveGame(fromPage, { skipCompression: true })).ok).toBe(true);
          expect(effects(await save.loadGame())).toEqual(original);
        } finally { await context.close(); }
      }
      await info.attach('posting-engine-versions', { body: JSON.stringify({ node: process.version,
        v8: process.versions.v8, browser: browser.version(), userAgent: returned.ua }), contentType: 'application/json' });
    });
  });
}
test('save generations: posting numeric boundaries use identical price cells and acceptance scores in the page engine', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { POSTING_NUMERIC_SCALE: S, postingPow2, postingLog2, postingAgeFactor,
      postingPriceUsd, postingScore, postingMoneyScore } = await import('/baseball-manager/src/engine/postingMarketNumbers.js');
    return {
      major: [1024999999999n, 1025000000000n, 1025000000001n].map(n => postingPriceUsd(n, 1000000n, 50000, 1000000, 35000000)),
      minor: [499999n, 500000n, 500001n].map(n => postingPriceUsd(n, 100n, 10000, 0, 6500000)),
      scores: [599999999999994n, 599999999999996n, 600000000000004n, 600000000000006n].map(n => postingScore(n, 10000000000000n)),
      money: postingMoneyScore(100000000, 5700),
      log: postingScore(postingLog2(3n, 2n), S), power: postingScore(postingPow2(1n, 2n), S),
      age: String(postingAgeFactor(2)), scale: String(S)
    };
  });
  expect(result).toEqual({ major: [1000000, 1050000, 1050000], minor: [0, 10000, 10000],
    scores: [59.999999999999, 60, 60, 60.000000000001], money: 84.898158061614,
    log: .584962500721, power: 1.414213562373, age: '864900000000000000000000000000', scale: '1000000000000000000000000000000' });
  expect(result.scores.map(score => score >= 60)).toEqual([false, true, true, true]);
});
