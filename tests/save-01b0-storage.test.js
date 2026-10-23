// Permanent invariants: strict legacy reads and isolated v6 career staging.
import { it, expect, vi } from 'vitest';
import { openBaseballManagerDb } from '../src/engine/baseballManagerDb.js';
import { captureInlineCareerLogs, prepareCareerData } from '../src/engine/careerGenerations.js';
import { prepareGeneration, readCareerGeneration } from '../src/engine/saveGenerations.js';
import { entry, game, rows } from './helpers/save-01b0-storage.js';

for (const version of [3, 4, 5]) it(`v${version} numeric-zero career capture can stage v6 without overwriting global legacy rows`, async () => {
  const source = { ...game(), saveDataVersion: version };
  const db = await openBaseballManagerDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction('career_logs', 'readwrite');
    tx.objectStore('career_logs').put([entry(2010)], 0);
    tx.objectStore('career_logs').put([entry(2001)], 'unrelated');
    tx.oncomplete = resolve; tx.onabort = tx.onerror = () => reject(tx.error);
  }); db.close();
  const before = await rows('career_logs');
  const data = await prepareCareerData(source, source, {}, captureInlineCareerLogs(source), source);
  expect(data.players).toEqual([['0', [entry(2010), entry(2025)]]]);
  expect(await rows('career_logs')).toEqual(before); // source capture is read-only
  // The selected portable candidate has already captured source history. The
  // destination may contain BOTH colliding key types for an unrelated game.
  const destinationDb = await openBaseballManagerDb();
  await new Promise((resolve, reject) => {
    const tx = destinationDb.transaction('career_logs', 'readwrite');
    tx.objectStore('career_logs').put([entry(2088)], 0);
    tx.objectStore('career_logs').put([entry(2099)], '0');
    tx.oncomplete = resolve; tx.onabort = tx.onerror = () => reject(tx.error);
  }); destinationDb.close();
  const destinationBefore = await rows('career_logs');
  const restored = { ...source, saveId: 'fresh-destination' };
  const { manifest } = await prepareGeneration(restored, null, undefined, data);
  const actual = await readCareerGeneration({ ...restored, saveDataVersion: 6, saveManifest: manifest });
  expect(actual).toEqual(data);
  expect(await rows('career_logs')).toEqual(destinationBefore);
});

it('legacy career read errors reject capture rather than silently producing empty history', async () => {
  vi.stubGlobal('indexedDB', { open() { throw new Error('injected read failure'); } });
  const source = { ...game(), saveDataVersion: 4 };
  await expect(prepareCareerData(source, source)).rejects.toThrow('injected read failure');
});
