import { it, expect, vi } from 'vitest';
import { IDBObjectStore } from 'fake-indexeddb';
import LZString from 'lz-string';
import { openBaseballManagerDb } from '../src/engine/baseballManagerDb.js';
import * as producer from '../src/engine/battedBallRun.js';
import * as receipts from '../src/engine/battedBallReceipts.js';
import { batch, rows } from './helpers/save-01b0-storage.js';
import { enqueueBattedBallBatches, flushBattedBallQueue, deleteBattedBallArchiveBySaveId } from '../src/engine/battedBallArchive.js';
import { collectUnusedChunks } from '../src/engine/saveGenerations.js';

async function stage(runId, speed, previousReceipt = producer.emptyBattedBallReceipt('source'), id) {
  const run = receipts.createBattedBallReceiptRun({ saveId: 'source', runId, previousReceipt });
  const emit = producer.createBattedBallRunEmitter(chunk => run.append(chunk), { runId });
  emit.add([{ ...batch(speed), ...(id ? { id, gameId: id } : {}) }]);
  const receipt = await run.seal(emit.finish());
  return { run, receipt };
}
async function capture(receipt) {
  const records = [];
  const result = await receipts.readBattedBallReceipt(receipt, { onChunk: chunk => records.push(...chunk) });
  return { result, records };
}

it('keeps different bytes for the same batch identity independently of mutable replacement and deletion', async () => {
  const a = await stage('run-a', 140), b = await stage('run-b', 180);
  a.run.adopt(); b.run.adopt();
  expect(await receipts.flushBattedBallReceipts()).toMatchObject({ ok: true });
  enqueueBattedBallBatches([batch(200)]); await flushBattedBallQueue();
  await deleteBattedBallArchiveBySaveId('source');
  expect((await capture(a.receipt)).records[0].events[0].evKmh).toBe(140);
  expect((await capture(b.receipt)).records[0].events[0].evKmh).toBe(180);
  expect((await capture(a.receipt)).result).toMatchObject({ status: 'complete', recordCount: 1, eventCount: 1 });
  expect((await rows('batted_ball_batches'))).toEqual([]);
});

it('follows only the accepted parent chain and retains versions across root GC and abandoned root publication', async () => {
  const a = await stage('accepted-a', 140); a.run.adopt();
  const ahead = await stage('ahead', 190);
  const b = await stage('accepted-b', 180, a.receipt, 'other-game'); b.run.adopt();
  await collectUnusedChunks([]);
  const snapshot = await capture(b.receipt);
  expect(snapshot.records.map(r => r.events[0].evKmh)).toEqual([180, 140]);
  expect(snapshot.result).toMatchObject({ status: 'complete', recordCount: 2, eventCount: 2 });
  await ahead.run.discard();
  expect((await capture(b.receipt)).records).toEqual(snapshot.records);
});

it('never projects unadopted chunks and removes only its own staged rows after cancellation', async () => {
  const a = await stage('kept', 140); a.run.adopt(); await receipts.flushBattedBallReceipts();
  const before = await rows('batted_ball_batches');
  const cancelled = await stage('cancelled', 190);
  expect(await rows('batted_ball_batches')).toEqual(before);
  await cancelled.run.discard();
  expect(await rows('batted_ball_batches')).toEqual(before);
  expect((await rows('save_chunks')).some(([key]) => key.includes('cancelled'))).toBe(false);
  expect((await capture(a.receipt)).records[0].events[0].evKmh).toBe(140);
});

it('keeps legacy provenance unknown while explicitly new empty saves are complete', async () => {
  const runId = 'legacy';
  const run = receipts.createBattedBallReceiptRun({ saveId: 'source', runId });
  const emit = producer.createBattedBallRunEmitter(chunk => run.append(chunk), { runId });
  emit.add([batch()]); const receipt = await run.seal(emit.finish());
  expect((await capture(receipt)).result.status).toBe('legacy_unverified');
  expect((await capture(producer.emptyBattedBallReceipt('source'))).result).toMatchObject({ status: 'complete', recordCount: 0 });
  expect((await capture(null)).result.status).toBe('legacy_unverified');
  await run.discard();
});

it('marks a missing or repeated producer stream incomplete instead of treating fewer chunks as a complete run', async () => {
  const run = receipts.createBattedBallReceiptRun({ saveId: 'source', runId: 'missing', previousReceipt: producer.emptyBattedBallReceipt('source') });
  const chunks = [], emitter = producer.createBattedBallRunEmitter(c => chunks.push(c), { runId: 'missing' });
  emitter.add([batch()]); const summary = emitter.finish();
  const receipt = await run.seal(summary);
  expect((await capture(receipt)).result.status).toBe('incomplete');
  await run.discard();
  const duplicate = receipts.createBattedBallReceiptRun({ saveId: 'source', runId: 'missing' });
  duplicate.append(chunks[0]); duplicate.append(chunks[0]);
  const duplicateReceipt = await duplicate.seal(summary);
  expect((await capture(duplicateReceipt)).result.status).toBe('incomplete');
  await duplicate.discard();
});

it('producer emits a contiguous run identity and its exact final totals without retaining full result logs', () => {
  const chunks = [], emit = producer.createBattedBallRunEmitter(c => chunks.push(c), { runId: 'producer' });
  emit.add([batch(), { ...batch(180), id: 'other', playerId: 'other' }]);
  expect(emit.finish()).toEqual({ version: 1, runId: 'producer', chunkCount: chunks.length, recordCount: 2, eventCount: 2 });
  expect(chunks.map(c => c.index)).toEqual(chunks.map((_, i) => i));
  expect(chunks.every(c => c.runId === 'producer')).toBe(true);
});

it('selects a child replacement once without changing the ancestor snapshot', async () => {
  const a = await stage('parent', 140), b = await stage('child', 180, a.receipt);
  expect((await capture(a.receipt)).records.map(r => r.events[0].evKmh)).toEqual([140]);
  expect((await capture(b.receipt)).records.map(r => r.events[0].evKmh)).toEqual([180]);
  expect((await capture(b.receipt)).result).toMatchObject({ status: 'complete', recordCount: 1, eventCount: 1 });
  await a.run.discard(); await b.run.discard();
});

async function mutateStored(key, change) {
  const db = await openBaseballManagerDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction('save_chunks', 'readwrite'), store = tx.objectStore('save_chunks'), req = store.get(key);
      req.onsuccess = () => {
        const row = req.result;
        const next = change(row?.codec === 'lz-utf16' ? { version: row.version, json: LZString.decompressFromUTF16(row.payload) } : row);
        if (next === undefined) store.delete(key);
        else store.put({ version: next.version, codec: 'lz-utf16', payload: LZString.compressToUTF16(next.json) }, key);
      };
      tx.oncomplete = resolve; tx.onabort = tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}

it.each(['missing', 'changed'])('rejects %s immutable data and reports head failure even after the retry queue is empty', async mode => {
  const a = await stage(mode, 140); a.run.adopt(); await receipts.flushBattedBallReceipts();
  const [key] = (await rows('save_chunks')).find(([key]) => key.includes('"chunk"'));
  await mutateStored(key, row => mode === 'missing' ? undefined : { ...row, json: row.json.replace('140', '180') });
  await expect(capture(a.receipt)).rejects.toThrow('archive_missing_or_corrupt');
  expect(await receipts.flushBattedBallReceipts(a.receipt)).toMatchObject({ ok: false, scope: 'head' });
});

it('refuses cross-save refs and cyclic parent refs instead of capturing another save or looping', async () => {
  const a = await stage('cycle', 140);
  await expect(capture({ ...a.receipt, saveId: 'foreign' })).rejects.toThrow('invalid_archive_reference');
  const [key, row] = (await rows('save_chunks')).find(([key]) => key.includes('"run"'));
  const data = JSON.parse(row.codec === 'lz-utf16' ? LZString.decompressFromUTF16(row.payload) : row.json); data.previous = a.receipt;
  const json = JSON.stringify(data), hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(json));
  const digest = Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
  await mutateStored(key, () => ({ version: 1, json }));
  await expect(capture({ ...a.receipt, head: { key, digest } })).rejects.toThrow('cyclic_archive_reference');
  await a.run.discard();
});

it('retries identical failed immutable bytes without permanently marking a repairable run incomplete', async () => {
  const add = IDBObjectStore.prototype.add;
  vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementationOnce(function(value, key) {
    if (this.name === 'save_chunks') throw new DOMException('injected', 'QuotaExceededError');
    return add.call(this, value, key);
  });
  const a = await stage('retry', 140);
  expect(a.receipt.coverage).toBe('complete');
  await expect(capture(a.receipt)).rejects.toThrow('archive_missing_or_corrupt');
  a.run.adopt();
  expect(await receipts.flushBattedBallReceipts(a.receipt)).toMatchObject({ ok: true });
  expect((await capture(a.receipt)).result.status).toBe('complete');
});

it('rejects same-key replacement and protects an adopted run from accidental discard', async () => {
  const a = await stage('collision', 140); a.run.adopt(); await receipts.flushBattedBallReceipts();
  const b = await stage('collision', 180);
  await expect(capture(b.receipt)).rejects.toThrow('archive_missing_or_corrupt');
  await b.run.discard();
  expect(await a.run.discard()).toBe(false);
  expect((await capture(a.receipt)).records[0].events[0].evKmh).toBe(140);
  expect(() => a.run.append({})).toThrow('archive_run_closed');
});

it('owns a copy of the accepted parent while a later run is being staged', async () => {
  const a = await stage('original-parent', 140);
  const runId = 'owns-parent', run = receipts.createBattedBallReceiptRun({ saveId: 'source', runId, previousReceipt: a.receipt });
  const emit = producer.createBattedBallRunEmitter(chunk => run.append(chunk), { runId });
  emit.add([{ ...batch(180), id: 'another-game', gameId: 'another-game' }]);
  a.receipt.head.key = 'mutated-by-caller';
  const receipt = await run.seal(emit.finish());
  expect((await capture(receipt)).records.map(r => r.events[0].evKmh)).toEqual([180, 140]);
  await run.discard(); await a.run.discard();
});

it('bounds added serialized storage against the actual legacy rows while preserving its records', async () => {
  const runId = 'compressed', run = receipts.createBattedBallReceiptRun({ saveId: 'source', runId, previousReceipt: producer.emptyBattedBallReceipt('source') });
  const events = Array.from({ length: 300 }, (_, i) => ({ result: ['s', 'd', 'hr', 'go'][i % 4], evKmh: 90 + i % 100, laDeg: i % 65 - 20 }));
  const record = { ...batch(), events, eventCount: events.length };
  enqueueBattedBallBatches([record]); await flushBattedBallQueue();
  const legacy = (await rows('batted_ball_batches'))[0][1];
  const emitter = producer.createBattedBallRunEmitter(chunk => run.append(chunk), { runId }); emitter.add([record]);
  const receipt = await run.seal(emitter.finish());
  const chunk = (await rows('save_chunks')).find(([key]) => key.includes('"chunk"'))[1];
  expect(new TextEncoder().encode(JSON.stringify(chunk)).length).toBeLessThan(new TextEncoder().encode(JSON.stringify(legacy)).length / 2);
  expect((await capture(receipt)).records[0].events).toHaveLength(300);
  await run.discard();
});

it('projects a valid newly accepted run even when an earlier known gap keeps the complete snapshot unavailable', async () => {
  const gap = receipts.createBattedBallReceiptRun({ saveId: 'source', runId: 'gap' });
  const gapReceipt = await gap.seal({ version: 1, runId: 'gap', chunkCount: 1, recordCount: 1, eventCount: 1 }); gap.adopt();
  const next = await stage('after-gap', 140, gapReceipt); next.run.adopt();
  expect(await receipts.flushBattedBallReceipts(next.receipt)).toMatchObject({ ok: false });
  expect((await rows('batted_ball_batches')).map(([, row]) => row.events[0].evKmh)).toEqual([140]);
  expect((await capture(next.receipt)).result.status).toBe('incomplete');
});

it('does not let another save identity\'s failed archive job poison this save\'s head status', async () => {
  const foreign = receipts.createBattedBallReceiptRun({ saveId: 'foreign', runId: 'failed-foreign' });
  await foreign.seal({ version: 1, runId: 'failed-foreign', chunkCount: 1, recordCount: 1, eventCount: 1 }); foreign.adopt();
  expect(await receipts.flushBattedBallReceipts(producer.emptyBattedBallReceipt('source'))).toMatchObject({ ok: true });
});

it('repairs an older failed run without overwriting a newer accepted replacement or its aggregate', async () => {
  const put = IDBObjectStore.prototype.put;
  const failOld = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function(row, ...args) {
    if (this.name === 'batted_ball_batches' && row.events?.[0]?.evKmh === 140) throw new DOMException('injected', 'AbortError');
    return put.call(this, row, ...args);
  });
  const a = await stage('old-pending', 140); a.run.adopt();
  expect(await receipts.flushBattedBallReceipts(a.receipt)).toMatchObject({ ok: false });
  const b = await stage('newest', 180, a.receipt); b.run.adopt();
  await vi.waitFor(async () => expect((await rows('batted_ball_batches'))[0]?.[1].events[0].evKmh).toBe(180));
  const aggregate = await rows('batted_ball_aggregates'); failOld.mockRestore();
  expect(await receipts.flushBattedBallReceipts(b.receipt)).toMatchObject({ ok: true });
  expect((await rows('batted_ball_batches'))[0][1].events[0].evKmh).toBe(180);
  expect(await rows('batted_ball_aggregates')).toEqual(aggregate);
  expect((await capture(a.receipt)).records[0].events[0].evKmh).toBe(140);
});
