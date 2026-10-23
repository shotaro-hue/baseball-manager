import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
const PROBE = '/baseball-manager/scripts/save-01b0/';
test.beforeAll(() => {
  test.setTimeout(240_000);
  if (!existsSync('e2e/fixtures/save-capacity-generated.json.gz')) {
    execFileSync(process.execPath, ['scripts/generate-save-capacity-fixture.mjs'], { timeout: 240_000, stdio: 'pipe' });
  }
});

test('backup probe current archive writer bypasses save lock and replaces same batch ID', async ({ page, context }) => {
  await page.goto('/baseball-manager/');
  await page.evaluate(async () => {
    const a = await import('/baseball-manager/src/engine/battedBallArchive.js');
    a.enqueueBattedBallBatches([{ id: 'probe:2026:g:p', saveId: 'probe', year: 2026, gameId: 'g',
      playerId: 'p', events: [{ result: 's', evKmh: 140, laDeg: 15 }] }]); await a.flushBattedBallQueue();
    void navigator.locks.request('baseball-manager-save', async () => {
      window.saveLockHeld = true; await new Promise(resolve => { window.releaseSaveLock = resolve; });
    });
  });
  await expect.poll(() => page.evaluate(() => window.saveLockHeld)).toBe(true);
  const other = await context.newPage(); await other.goto('/baseball-manager/');
  try {
    const result = await other.evaluate(async () => {
      const a = await import('/baseball-manager/src/engine/battedBallArchive.js');
      a.enqueueBattedBallBatches([{ id: 'probe:2026:g:p', saveId: 'probe', year: 2026, gameId: 'g',
        playerId: 'p', events: [{ result: 's', evKmh: 180, laDeg: 15 }] }]);
      await a.flushBattedBallQueue();
      const meta = await a.loadBattedBallArchiveMeta('probe'), events = await a.loadGameBattedBalls('probe', 2026, 'g');
      return { count: meta.estimatedEventCount, velocity: events[0].events[0].evKmh };
    });
    expect(result).toEqual({ count: 1, velocity: 180 });
  } finally { await page.evaluate(() => window.releaseSaveLock()); await other.close(); }
});

test('backup probe proposed origin archive lock serializes a cooperating second page', async ({ page, context }) => {
  await page.goto('/baseball-manager/');
  await page.evaluate(async path => {
    const { withProbeSnapshot } = await import(path + 'locks.js');
    void withProbeSnapshot(async () => { window.probeHeld = true; await new Promise(resolve => { window.releaseProbe = resolve; }); });
  }, PROBE);
  await expect.poll(() => page.evaluate(() => window.probeHeld)).toBe(true);
  const other = await context.newPage(); await other.goto('/baseball-manager/');
  await other.evaluate(async path => {
    const { ARCHIVE_PROBE_LOCK } = await import(path + 'locks.js'); window.archiveEntered = false;
    void navigator.locks.request(ARCHIVE_PROBE_LOCK, () => { window.archiveEntered = true; });
  }, PROBE);
  await expect.poll(() => other.evaluate(async () => (await navigator.locks.query()).pending.length)).toBeGreaterThan(0);
  expect(await other.evaluate(() => window.archiveEntered)).toBe(false);
  await page.evaluate(() => window.releaseProbe());
  await expect.poll(() => other.evaluate(() => window.archiveEntered)).toBe(true); await other.close();
});

test('backup probe publication survives closing the page before journal phase update', async ({ page, context }) => {
  await page.goto('/baseball-manager/');
  await page.evaluate(async path => {
    const j = await import(path + 'journal.js'); localStorage.setItem(j.PROBE_PRIMARY_KEY, 'before');
    await j.prepareProbeRestore({ year: 2046, checksumSentinel: 'persisted' }); await j.publishProbeRestore();
  }, PROBE);
  await page.close();
  const cold = await context.newPage(); await cold.goto('/baseball-manager/');
  const result = await cold.evaluate(async path => {
    const j = await import(path + 'journal.js'), state = await j.inspectProbeRestore();
    await j.rollbackProbeRestore(); return { state, primary: localStorage.getItem(j.PROBE_PRIMARY_KEY) };
  }, PROBE);
  expect(result.state).toMatchObject({ status: 'published', phase: 'verified', payload: { year: 2046, checksumSentinel: 'persisted' } });
  expect(result.primary).toBe('before'); await cold.close();
});

test('backup probe ZIP prepares first, then a separate click downloads an independently verified file', async ({ page }, testInfo) => {
  await page.goto(PROBE); await page.getByRole('button', { name: 'ZIPを準備' }).click();
  await expect(page.getByRole('link', { name: 'ZIPをダウンロード' })).toBeVisible();
  const downloadPromise = page.waitForEvent('download'); await page.getByRole('link', { name: 'ZIPをダウンロード' }).click();
  const download = await downloadPromise, path = testInfo.outputPath('probe.zip'); await download.saveAs(path);
  const output = execFileSync('python3', ['scripts/save-01b0/verify-zip.py', path], { encoding: 'utf8' });
  expect(JSON.parse(output)).toMatchObject({ verified: true, entries: 4, inputBytes: 1048576 });
  await testInfo.attach('independent-zip-verification', { body: output, contentType: 'application/json' });
});

test('backup probe cancelled native share keeps the ready file and permits a second explicit click', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    Object.defineProperty(navigator, 'share', { value: async () => {
      window.probeShareCalls = (window.probeShareCalls || 0) + 1;
      throw new DOMException('User cancelled', 'AbortError');
    }, configurable: true });
  });
  await page.goto(PROBE); await page.getByRole('button', { name: 'ZIPを準備' }).click();
  const share = page.getByRole('button', { name: '保存・共有' }); await expect(share).toBeEnabled();
  expect(await page.evaluate(() => window.probeShareCalls || 0)).toBe(0);
  await share.click(); await expect(page.getByRole('status')).toContainText('キャンセル');
  await expect(share).toBeEnabled(); await share.click();
  expect(await page.evaluate(() => window.probeShareCalls)).toBe(2);
  await expect(page.getByRole('link', { name: 'ZIPをダウンロード' })).toBeVisible();
});

test('backup probe unsupported file sharing exposes download without invoking share', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { value: () => false, configurable: true });
    Object.defineProperty(navigator, 'share', { value: async () => { window.unexpectedShare = true; }, configurable: true });
  });
  await page.goto(PROBE); await page.getByRole('button', { name: 'ZIPを準備' }).click();
  await expect(page.getByRole('status')).toContainText('ダウンロード');
  await expect(page.getByRole('button', { name: '保存・共有' })).toBeDisabled();
  const ready = page.waitForEvent('download'); await page.getByRole('link', { name: 'ZIPをダウンロード' }).click();
  const path = testInfo.outputPath('unsupported-share.zip'); await (await ready).saveAs(path);
  const result = JSON.parse(execFileSync('python3', ['scripts/save-01b0/verify-zip.py', path], { encoding: 'utf8' }));
  expect(result.verified).toBe(true); expect(await page.evaluate(() => Boolean(window.unexpectedShare))).toBe(false);
});

test('backup probe preparation cancellation allows a fresh smaller ZIP', async ({ page }) => {
  await page.goto(PROBE); await page.getByLabel('合成データのサイズ').selectOption('64');
  await page.getByRole('button', { name: 'ZIPを準備' }).click();
  await page.getByRole('button', { name: '準備を中止' }).click();
  await expect(page.getByRole('status')).toContainText('キャンセル');
  await expect(page.getByRole('link', { name: 'ZIPをダウンロード' })).toBeHidden();
  await page.getByLabel('合成データのサイズ').selectOption('1');
  await page.getByRole('button', { name: 'ZIPを準備' }).click();
  await expect(page.getByRole('link', { name: 'ZIPをダウンロード' })).toBeVisible();
});

for (const mib of [16, 64]) test(`backup probe synthetic ${mib} MiB output has bounded source entries`, async ({ page }, testInfo) => {
  await page.goto('/baseball-manager/');
  const result = await page.evaluate(async ({ path, mib }) => {
    const zip = await import(path + 'zip.js');
    const { file, metrics } = await zip.createProbeZip({ entries: zip.syntheticProbeEntries(mib * 1024 * 1024) });
    return { ...metrics, bytes: file.size, memoryObservation: 'No peak-memory measurement; not real iPhone evidence' };
  }, { path: PROBE, mib });
  expect(result.inputBytes).toBe(mib * 1024 * 1024); expect(result.maxInputEntryBytes).toBe(256 * 1024);
  expect(result.bytes).toBeGreaterThan(mib * 1024 * 1024 * 0.95); expect(result.peakHeapBytes).toBeNull();
  await testInfo.attach(`capacity-${mib}`, { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
});

test('backup probe sizes actual Hanshin source root and 20-equivalent-year career before transport', async ({ page }, testInfo) => {
  await page.goto('/baseball-manager/');
  const result = await page.evaluate(async () => {
    const response = await fetch('/baseball-manager/e2e/fixtures/save-capacity-generated.json.gz');
    const bytes = new Uint8Array(await response.arrayBuffer());
    const fixture = bytes[0] === 31 && bytes[1] === 139
      ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).json()
      : JSON.parse(new TextDecoder().decode(bytes));
    const { capacityScenario } = await import('/baseball-manager/e2e/helpers/capacity-scenarios.js');
    const save = await import('/baseball-manager/src/engine/saveload.js');
    const root = await import('/baseball-manager/src/engine/saveRootBodies.js');
    const generations = await import('/baseball-manager/src/engine/saveGenerations.js');
    const source = capacityScenario(fixture, 20), committed = await save.saveGame(source);
    if (!committed.ok) throw new Error(JSON.stringify(committed));
    const startedAt = performance.now(), raw = await root.readRootBody(localStorage.getItem('baseball_manager_v1'));
    const json = await root.decodeRootJson(raw);
    if (json === null) throw new Error('native compression unavailable for source sizing case');
    const state = JSON.parse(json), career = await generations.readCareerGeneration(state);
    return { fixture: 'one real 2026 season; 20 equivalent historical years, not 20 simulated seasons',
      year: state.year, gameDay: state.gameDay, encodedRootCharacters: raw.length,
      decodedRootBytes: new TextEncoder().encode(json).length,
      decodedCareerBytes: new TextEncoder().encode(JSON.stringify(career)).length,
      sourceReadMs: performance.now() - startedAt, peakHeapBytes: null,
      scope: 'source sizing only; no complete portable export or real-iPhone claim' };
  });
  expect(result.year).toBe(2026); expect(result.gameDay).toBe(106);
  expect(result.decodedRootBytes).toBeGreaterThan(256 * 1024);
  expect(result.decodedCareerBytes).toBeGreaterThan(256 * 1024);
  await testInfo.attach('source-sizing', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
});
