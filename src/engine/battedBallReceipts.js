import { createSaveId } from './saveIdentity';
import LZString from 'lz-string';
import { openBaseballManagerDb, BASEBALL_MANAGER_DB_STORES } from './baseballManagerDb';
import { withBattedBallArchiveLock } from './archiveLock';
import { sanitizeBatchRecord, enqueueBattedBallBatches, flushBattedBallQueue, getBattedBallQueueStatus } from './battedBallArchive';
import { battedBallVersionKey, validateBattedBallReceipt, validateBattedBallVersionRef } from './battedBallRun';

const STORE = BASEBALL_MANAGER_DB_STORES.chunks;
const jobsByFactory = new WeakMap();
function jobs() {
  let factory;
  try { factory = globalThis.indexedDB || globalThis; } catch { factory = globalThis; }
  if (!jobsByFactory.has(factory)) jobsByFactory.set(factory, new Set());
  return jobsByFactory.get(factory);
}
async function digest(text) {
  const bytes = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
}
async function makeRow(key, data) {
  const json = JSON.stringify(data);
  return { ref: { key, digest: await digest(json) },
    row: { version: 1, codec: 'lz-utf16', payload: LZString.compressToUTF16(json) } };
}
async function mutateRows(entries, remove = false) {
  if (!entries.length) return [];
  return withBattedBallArchiveLock(async () => {
    const db = await openBaseballManagerDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite'), store = tx.objectStore(STORE);
        let failure; const created = [];
        tx.oncomplete = () => resolve(created);
        tx.onabort = tx.onerror = () => reject(failure || tx.error || new Error('archive_write_failed'));
        try {
          for (const [key, row] of entries) {
            if (remove) { store.delete(key); continue; }
            const req = store.get(key);
            req.onsuccess = () => {
              if (req.result === undefined) { created.push(key); store.add(row, key); }
              else if (req.result.version !== row.version || req.result.codec !== row.codec
                || req.result.payload !== row.payload || req.result.json !== row.json) {
                failure = new Error('archive_version_conflict'); tx.abort();
              }
            };
          }
        } catch (error) { failure = error; tx.abort(); }
      });
    } finally { db.close(); }
  });
}
async function readData(db, ref, saveId, kind) {
  const parts = validateBattedBallVersionRef(ref, saveId, kind);
  const row = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly'); let value;
    const req = tx.objectStore(STORE).get(ref.key); req.onsuccess = () => { value = req.result; };
    tx.oncomplete = () => resolve(value);
    tx.onabort = tx.onerror = () => reject(tx.error || new Error('archive_read_failed'));
  });
  const json = row?.codec === 'lz-utf16' && typeof row.payload === 'string'
    ? LZString.decompressFromUTF16(row.payload) : row?.json;
  if (row?.version !== 1 || typeof json !== 'string' || await digest(json) !== ref.digest) throw new Error('archive_missing_or_corrupt');
  const data = JSON.parse(json);
  if (data.version !== 1 || data.saveId !== saveId || data.runId !== parts[1] || data.kind !== kind) throw new Error('invalid_archive_identity');
  if (kind === 'chunk' && data.index !== parts[3]) throw new Error('invalid_archive_identity');
  return data;
}
function canonicalRecords(records, saveId) {
  if (!Array.isArray(records) || records.length === 0) throw new Error('invalid_archive_chunk');
  return records.map(record => {
    const safe = sanitizeBatchRecord(record);
    if (!safe || safe.saveId !== saveId || safe.events.length !== record.events?.length) throw new Error('invalid_archive_chunk');
    return safe;
  });
}
async function inspectNode(db, receipt, onChunk, requireComplete = false) {
  validateBattedBallReceipt(receipt, receipt.saveId);
  const node = await readData(db, receipt.head, receipt.saveId, 'run');
  validateBattedBallReceipt(node.previous, receipt.saveId);
  if (!Array.isArray(node.chunks) || typeof node.complete !== 'boolean') throw new Error('invalid_archive_node');
  if (requireComplete && !node.complete) throw new Error('incomplete_archive_run');
  let recordCount = 0, eventCount = 0;
  const seen = new Set();
  for (let index = 0; index < node.chunks.length; index++) {
    const ref = node.chunks[index], parts = validateBattedBallVersionRef(ref, receipt.saveId, 'chunk');
    if (parts[1] !== node.runId || parts[3] !== index) throw new Error('invalid_archive_order');
    const chunk = await readData(db, ref, receipt.saveId, 'chunk');
    const records = canonicalRecords(chunk.records, receipt.saveId);
    for (const record of records) {
      if (seen.has(record.id)) throw new Error('duplicate_archive_batch');
      seen.add(record.id); recordCount++; eventCount += record.events.length;
    }
    await onChunk?.(records);
  }
  if (node.complete && (node.summary?.runId !== node.runId || node.summary?.chunkCount !== node.chunks.length
    || node.summary?.recordCount !== recordCount || node.summary?.eventCount !== eventCount)) throw new Error('invalid_archive_totals');
  return node;
}

// A successful full traversal is the only completeness assertion. Chunk callbacks
// are provisional until this Promise resolves; consumers must discard on failure.
export async function readBattedBallReceipt(receipt, { onChunk } = {}) {
  if (receipt == null) return { status: 'legacy_unverified', recordCount: 0, eventCount: 0 };
  validateBattedBallReceipt(receipt, receipt.saveId);
  let status = receipt.coverage, recordCount = 0, eventCount = 0, current = receipt;
  const seenNodes = new Set(), seenBatches = new Set();
  const db = current.head ? await openBaseballManagerDb() : null;
  try {
    while (current?.head) {
      if (seenNodes.has(current.head.key)) throw new Error('cyclic_archive_reference');
      seenNodes.add(current.head.key);
      if (current.coverage === 'incomplete') status = 'incomplete';
      else if (current.coverage === 'legacy_unverified' && status === 'complete') status = 'legacy_unverified';
      const node = await inspectNode(db, current, async records => {
        const effective = records.filter(record => {
          if (seenBatches.has(record.id)) return false;
          seenBatches.add(record.id); recordCount++; eventCount += record.events.length; return true;
        });
        if (effective.length) await onChunk?.(effective);
      });
      if (!node.complete) status = 'incomplete';
      current = node.previous;
    }
    if (current == null && status === 'complete') status = 'legacy_unverified';
    else if (current?.coverage === 'incomplete') status = 'incomplete';
    else if (current?.coverage === 'legacy_unverified' && status === 'complete') status = 'legacy_unverified';
    return { status, recordCount, eventCount };
  } finally { db?.close(); }
}

export function createBattedBallReceiptRun({ saveId, previousReceipt = null, runId = createSaveId() }) {
  validateBattedBallReceipt(previousReceipt, saveId);
  previousReceipt = structuredClone(previousReceipt);
  const chunks = [], pending = new Map(), keys = [], seen = new Set(), superseded = new Set();
  let tail = Promise.resolve(), sealed = false, adopted = false, discarded = false, invalid = false;
  let recordCount = 0, eventCount = 0, head, receipt, active = null;
  const persist = async entry => {
    pending.set(entry.ref.key, entry.row);
    try { keys.push(...await mutateRows([[entry.ref.key, entry.row]])); pending.delete(entry.ref.key); } catch { /* Retain identical retry bytes. */ }
    return entry.ref;
  };
  const retry = async () => {
    if (active) return active;
    active = (async () => {
      try {
        for (const entry of [...pending]) { keys.push(...await mutateRows([entry])); pending.delete(entry[0]); }
        if (!receipt?.head) return { ok: false };
        const db = await openBaseballManagerDb();
        try {
          await inspectNode(db, receipt, async records => {
            // A failed older projection may retry after a newer accepted run.
            // Repair its immutable bytes, but never roll newer logical batches back.
            const effective = records.filter(record => !superseded.has(record.id));
            if (!effective.length) return;
            enqueueBattedBallBatches(effective);
            await flushBattedBallQueue();
            let state = getBattedBallQueueStatus();
            while (state.isWriting || state.queuedRecords) { await flushBattedBallQueue(); state = getBattedBallQueueStatus(); }
            if (state.failedRecords) throw new Error('archive_projection_failed');
          }, true);
        } finally { db.close(); }
        jobs().delete(job); return { ok: true };
      } catch { return { ok: false }; }
    })().finally(() => { active = null; });
    return active;
  };
  const job = { saveId, retry, supersede(ids) {
    for (const id of ids) if (seen.has(id)) superseded.add(id);
  } };
  return {
    runId,
    append(chunk) {
      if (sealed || discarded) throw new Error('archive_run_closed');
      const index = chunks.length;
      let records;
      try {
        if (chunk?.runId !== runId || chunk.index !== index) throw new Error('invalid_archive_order');
        records = canonicalRecords(chunk.records, saveId);
        for (const record of records) {
          if (seen.has(record.id)) throw new Error('duplicate_archive_batch');
          seen.add(record.id);
        }
      } catch { invalid = true; return; }
      const data = { version: 1, kind: 'chunk', saveId, runId, index, records };
      recordCount += records.length; eventCount += records.reduce((n, r) => n + r.events.length, 0);
      chunks.push(null);
      tail = tail.then(async () => { chunks[index] = await persist(await makeRow(battedBallVersionKey(saveId, runId, 'chunk', index), data)); });
      // Hash/serialization failures must become explicit gaps, not unhandled rejections.
      tail = tail.catch(() => { invalid = true; });
    },
    async seal(summary) {
      if (sealed || discarded) throw new Error('archive_run_closed');
      sealed = true; await tail;
      const complete = !invalid && chunks.every(Boolean) && summary?.version === 1 && summary.runId === runId
        && summary.chunkCount === chunks.length && summary.recordCount === recordCount && summary.eventCount === eventCount;
      const coverage = !complete ? 'incomplete' : previousReceipt?.coverage ?? 'legacy_unverified';
      try {
        head = await persist(await makeRow(battedBallVersionKey(saveId, runId, 'run'),
          { version: 1, kind: 'run', saveId, runId, previous: previousReceipt, chunks: chunks.filter(Boolean), complete, summary }));
        receipt = { version: 1, saveId, coverage, head };
      } catch { receipt = { version: 1, saveId, coverage: 'incomplete', head: previousReceipt?.head ?? null }; }
      return structuredClone(receipt);
    },
    adopt() {
      if (!sealed || discarded) throw new Error('archive_run_not_sealed');
      if (!adopted) {
        adopted = true;
        for (const older of jobs()) if (older.saveId === saveId) older.supersede(seen);
        jobs().add(job); void retry();
      }
    },
    async discard() {
      if (adopted) return false; // Published references may already exist.
      discarded = true; await tail; pending.clear();
      try { await mutateRows(keys.map(key => [key]), true); return true; } catch { return false; }
    },
  };
}

// Save-time status covers retry/projection and the current run's durable head.
// It does not certify a historical chain; the full strict reader does that.
export async function flushBattedBallReceipts(receipt) {
  const results = await Promise.all([...jobs()].filter(job => !receipt?.saveId || job.saveId === receipt.saveId).map(job => job.retry()));
  if (results.some(result => !result.ok)) return { ok: false, scope: 'head' };
  if (receipt == null) return { ok: true, scope: 'head' };
  let db;
  try {
    validateBattedBallReceipt(receipt, receipt.saveId);
    if (receipt.coverage === 'incomplete') return { ok: false, scope: 'head' };
    if (receipt.head) { db = await openBaseballManagerDb(); if (!(await inspectNode(db, receipt)).complete) return { ok: false, scope: 'head' }; }
    return { ok: true, scope: 'head' };
  } catch { return { ok: false, scope: 'head' }; }
  finally { db?.close(); }
}
