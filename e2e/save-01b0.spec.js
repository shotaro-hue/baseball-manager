import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, statSync, unlinkSync } from 'node:fs';
const PROBE = '/baseball-manager/scripts/save-01b0/';
test.beforeAll(() => {
  test.setTimeout(240_000);
  if (!existsSync('e2e/fixtures/save-capacity-generated.json.gz')) {
    execFileSync(process.execPath, ['scripts/generate-save-capacity-fixture.mjs'], { timeout: 240_000, stdio: 'pipe' });
  }
});

// Resolve barriers from the test; no sleeps or scheduling-dependent close.
async function interruptedPublisher(page) {
  await page.goto(PROBE);
  await page.evaluate(async path => {
    const j = await import(path + 'journal.js');
    localStorage.setItem(j.PROBE_PRIMARY_KEY, 'before');
    localStorage.setItem('baseball_manager_v1', 'production sentinel');
    await j.prepareProbeRestore({ year: 2046, checksumSentinel: 'persisted' });
    const db = await new Promise(resolve => { const r = indexedDB.open(j.PROBE_DB_NAME); r.onsuccess = () => resolve(r.result); });
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction('rows', 'readwrite'); tx.objectStore('rows').put('unrelated sentinel', 'unrelated');
        tx.oncomplete = resolve; tx.onabort = () => reject(tx.error);
      });
    } finally { db.close(); }
    window.publicationOutcome = 'pending';
    void j.publishProbeRestore({ afterPrimaryPublished: () => {
      window.afterPublication = true;
      return new Promise(() => {}); // destroyed with the page, never resolved
    } }).then(() => { window.publicationOutcome = 'completed'; }, error => { window.publicationOutcome = error.message; });
  }, PROBE);
  await expect.poll(() => page.evaluate(() => Boolean(window.afterPublication))).toBe(true);
  expect(await page.evaluate(() => window.publicationOutcome)).toBe('pending');
  await page.close();
}
async function probeState(page) {
  return page.evaluate(async path => {
    const j = await import(path + 'journal.js'), state = await j.inspectProbeRestore();
    const db = await new Promise(resolve => { const r = indexedDB.open(j.PROBE_DB_NAME); r.onsuccess = () => resolve(r.result); });
    try {
      const rows = await new Promise((resolve, reject) => {
        const tx = db.transaction('rows', 'readonly'), store = tx.objectStore('rows');
        const candidate = store.get('candidate'), unrelated = store.get('unrelated');
        tx.oncomplete = () => resolve({ candidate: candidate.result, unrelated: unrelated.result });
        tx.onabort = () => reject(tx.error);
      });
      return { state, rows, primary: localStorage.getItem(j.PROBE_PRIMARY_KEY), production: localStorage.getItem('baseball_manager_v1') };
    } finally { db.close(); }
  }, PROBE);
}
async function holdSnapshot(page) {
  await page.goto(PROBE);
  await page.evaluate(async path => {
    const { withProbeSnapshot } = await import(path + 'locks.js');
    window.probeOperation = withProbeSnapshot(async () => {
      window.probeHeld = true; await new Promise(resolve => { window.releaseProbe = resolve; });
    });
  }, PROBE);
  await expect.poll(() => page.evaluate(() => Boolean(window.probeHeld))).toBe(true);
}
async function queueSnapshot(page) {
  await page.goto(PROBE);
  await page.evaluate(async path => {
    const { withProbeSnapshot } = await import(path + 'locks.js'); window.archiveEntered = false;
    window.probeOperation = withProbeSnapshot(() => { window.archiveEntered = true; return 'second'; });
  }, PROBE);
  await expect.poll(() => page.evaluate(async () => (await navigator.locks.query()).pending
    .some(lock => lock.name === 'baseball-manager-save'))).toBe(true);
  expect(await page.evaluate(() => window.archiveEntered)).toBe(false);
}

test('backup probe two common-lock callers wait on save then execute after release', async ({ page, context }) => {
  await holdSnapshot(page);
  const other = await context.newPage(); await queueSnapshot(other);
  const locks = await other.evaluate(() => navigator.locks.query());
  expect(locks.held.map(lock => lock.name).sort()).toEqual(['baseball-manager-backup-archive-probe', 'baseball-manager-save']);
  expect(locks.pending.map(lock => lock.name)).toEqual(['baseball-manager-save']);
  await page.evaluate(async () => { window.releaseProbe(); await window.probeOperation; });
  expect(await other.evaluate(() => window.probeOperation)).toBe('second');
  expect(await other.evaluate(() => window.archiveEntered)).toBe(true); await other.close();
});

test('backup probe common locks release after synchronous callback throw', async ({ page, context }) => {
  await page.goto(PROBE);
  expect(await page.evaluate(async path => {
    const { withProbeSnapshot } = await import(path + 'locks.js');
    try { await withProbeSnapshot(() => { throw new Error('injected_sync'); }); }
    catch (error) { return error.message; }
  }, PROBE)).toBe('injected_sync');
  const other = await context.newPage(); await other.goto(PROBE);
  expect(await other.evaluate(async path => (await import(path + 'locks.js')).withProbeSnapshot(() => 'peer'), PROBE)).toBe('peer');
  expect(await page.evaluate(async path => (await import(path + 'locks.js')).withProbeSnapshot(() => 'same-page'), PROBE)).toBe('same-page');
  await other.close();
});

test('backup probe rejected async callback releases a waiting common-lock caller', async ({ page, context }) => {
  await page.goto(PROBE);
  await page.evaluate(async path => {
    const { withProbeSnapshot } = await import(path + 'locks.js');
    window.probeOperation = withProbeSnapshot(async () => {
      window.probeHeld = true; await new Promise(resolve => { window.releaseProbe = resolve; });
      throw new Error('injected_async');
    }).catch(error => error.message);
  }, PROBE);
  await expect.poll(() => page.evaluate(() => Boolean(window.probeHeld))).toBe(true);
  const other = await context.newPage(); await queueSnapshot(other);
  expect(await page.evaluate(async () => { window.releaseProbe(); return window.probeOperation; })).toBe('injected_async');
  expect(await other.evaluate(() => window.probeOperation)).toBe('second');
  expect(await page.evaluate(async path => (await import(path + 'locks.js')).withProbeSnapshot(() => 'recovered'), PROBE)).toBe('recovered');
  await other.close();
});

test('backup probe archive-first raw caller creates an inversion; aborting it restores progress', async ({ page, context }) => {
  await page.goto(PROBE);
  await page.evaluate(async path => {
    const { ARCHIVE_PROBE_LOCK } = await import(path + 'locks.js');
    window.inverted = navigator.locks.request(ARCHIVE_PROBE_LOCK, async () => {
      window.archiveHeld = true;
      await new Promise(resolve => { window.requestReverseSave = resolve; });
      window.reverseAbort = new AbortController();
      try { await navigator.locks.request('baseball-manager-save', { signal: window.reverseAbort.signal }, () => { window.reverseEntered = true; }); }
      catch (error) { window.reverseError = error.name; }
    });
  }, PROBE);
  await expect.poll(() => page.evaluate(() => Boolean(window.archiveHeld))).toBe(true);
  const other = await context.newPage(); await other.goto(PROBE);
  await other.evaluate(async path => {
    window.forward = (await import(path + 'locks.js')).withProbeSnapshot(() => { window.forwardEntered = true; return 'forward'; });
  }, PROBE);
  await expect.poll(() => other.evaluate(async () => (await navigator.locks.query()).pending
    .some(lock => lock.name === 'baseball-manager-backup-archive-probe'))).toBe(true);
  await page.evaluate(() => window.requestReverseSave());
  await expect.poll(() => page.evaluate(async () => (await navigator.locks.query()).pending.map(lock => lock.name).sort()))
    .toEqual(['baseball-manager-backup-archive-probe', 'baseball-manager-save']);
  expect(await other.evaluate(() => Boolean(window.forwardEntered))).toBe(false);
  expect(await page.evaluate(() => Boolean(window.reverseEntered))).toBe(false);
  await page.evaluate(async () => { window.reverseAbort.abort(); await window.inverted; });
  expect(await page.evaluate(() => window.reverseError)).toBe('AbortError');
  expect(await other.evaluate(() => window.forward)).toBe('forward'); await other.close();
});

test('backup probe cold page recovers publication interrupted before promise completion', async ({ page, context }) => {
  await interruptedPublisher(page);
  const cold = await context.newPage(); await cold.goto(PROBE);
  const before = await probeState(cold);
  expect(before.state).toMatchObject({ status: 'published', phase: 'verified', payload: { year: 2046, checksumSentinel: 'persisted' } });
  expect(before.primary).toBe(before.state.newPrimary);
  expect(before.rows.candidate).toBe(JSON.stringify(before.state.payload));
  await cold.evaluate(async path => (await import(path + 'journal.js')).rollbackProbeRestore(), PROBE);
  const after = await probeState(cold);
  expect(after).toEqual({ state: { status: 'none' }, primary: 'before', production: 'production sentinel',
    rows: { candidate: undefined, unrelated: 'unrelated sentinel' } }); await cold.close();
});

test('backup probe cold recovery refuses stale rollback after another participating tab updates primary', async ({ page, context }) => {
  await interruptedPublisher(page);
  const writer = await context.newPage(); await writer.goto(PROBE);
  await writer.evaluate(async path => {
    const { withProbeSnapshot } = await import(path + 'locks.js'), j = await import(path + 'journal.js');
    await withProbeSnapshot(() => localStorage.setItem(j.PROBE_PRIMARY_KEY, 'newer-tab-primary'));
  }, PROBE);
  const cold = await context.newPage(); await cold.goto(PROBE);
  const before = await probeState(cold);
  expect(before.state).toMatchObject({ status: 'conflict', phase: 'verified' });
  expect(await cold.evaluate(async path => {
    const j = await import(path + 'journal.js'), errors = [];
    for (const operation of [j.rollbackProbeRestore, j.publishProbeRestore, j.discardProbeStage]) {
      try { await operation(); errors.push('unexpected success'); } catch (error) { errors.push(error.message); }
    }
    return errors;
  }, PROBE)).toEqual(['probe_conflict', 'probe_conflict', 'probe_conflict']);
  expect(await probeState(cold)).toEqual(before);
  expect(before.primary).toBe('newer-tab-primary'); expect(before.rows.unrelated).toBe('unrelated sentinel');
  expect(before.production).toBe('production sentinel'); await cold.close(); await writer.close();
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

for (const mib of [16, 64]) test(`backup probe synthetic ${mib} MiB output has bounded source entries and independently verified content`, async ({ page }, testInfo) => {
  await page.goto('/baseball-manager/');
  const result = await page.evaluate(async ({ path, mib }) => {
    const zip = await import(path + 'zip.js');
    const { file, metrics } = await zip.createProbeZip({ entries: zip.syntheticProbeEntries(mib * 1024 * 1024) });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(file); link.download = `capacity-${mib}.zip`;
    link.dataset.testid = 'capacity-file'; link.textContent = 'Download generated capacity file';
    document.body.append(link);
    return { ...metrics, bytes: file.size, memoryObservation: 'No peak-memory measurement; not real iPhone evidence' };
  }, { path: PROBE, mib });
  expect(result.inputBytes).toBe(mib * 1024 * 1024); expect(result.maxInputEntryBytes).toBe(256 * 1024);
  expect(result.bytes).toBeGreaterThan(mib * 1024 * 1024 * 0.95); expect(result.peakHeapBytes).toBeNull();
  const downloadReady = page.waitForEvent('download');
  await page.getByTestId('capacity-file').click();
  const path = testInfo.outputPath(`capacity-${mib}.zip`);
  await (await downloadReady).saveAs(path);
  expect(statSync(path).size).toBe(result.bytes);
  // Python reads 64 KiB blocks; no whole File arrayBuffer/base64/unzip in the browser.
  result.independentVerification = JSON.parse(execFileSync('python3', [
    'scripts/save-01b0/verify-zip.py', path, '--synthetic-bytes', String(mib * 1024 * 1024),
  ], { encoding: 'utf8', timeout: 90_000 }));
  expect(result.independentVerification).toEqual({ verified: true, entries: mib * 4,
    inputBytes: mib * 1024 * 1024, sourceVerified: true });
  await page.getByTestId('capacity-file').evaluate(link => { URL.revokeObjectURL(link.href); link.remove(); });
  await testInfo.attach(`capacity-${mib}`, { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
  // Successful deterministic payloads are reproducible; retain JSON evidence,
  // not 160 MiB of incompressible ZIPs per CI run. Failures keep their files.
  unlinkSync(path);
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
