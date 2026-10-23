// Disposable publication protocol experiment. Never reads/writes game primary
// or baseball_manager_storage. It verifies bytes, not full game semantics.
import { withProbeSnapshot } from './locks.js';
export const PROBE_DB_NAME = 'baseball_manager_backup_probe_v1';
export const PROBE_PRIMARY_KEY = 'baseball_manager_backup_probe_primary';
const hash = async text => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(v => v.toString(16).padStart(2, '0')).join('');

async function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PROBE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('rows'); request.result.createObjectStore('journal');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('probe_db_blocked'));
  });
}
async function transaction(mode, work) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(['rows', 'journal'], mode);
      let value, failure;
      tx.oncomplete = () => resolve(typeof value === 'function' ? value() : value);
      tx.onabort = () => reject(failure || tx.error || new Error('probe_tx_aborted'));
      // A synchronous add()/put() error must abort requests already queued in
      // this transaction. Rejecting the Promise alone would still commit them.
      try { value = work(tx.objectStore('rows'), tx.objectStore('journal')); }
      catch (error) { failure = error; tx.abort(); }
    });
  } finally { db.close(); }
}
async function context() {
  const { journal, payload } = await transaction('readonly', (rows, journals) => {
    const j = journals.get('active'), p = rows.get('candidate');
    return () => ({ journal: j.result, payload: p.result });
  });
  const current = localStorage.getItem(PROBE_PRIMARY_KEY);
  return { journal, payload, current };
}
async function inspect() {
  const { journal, payload, current } = await context();
  if (!journal) return { status: 'none' };
  const shared = { ...journal };
  if (current !== journal.oldPrimary && current !== journal.newPrimary) return { ...shared, status: 'conflict' };
  if (typeof payload !== 'string' || await hash(payload) !== journal.hash) return { ...shared, status: 'invalid' };
  return { ...shared, status: current === journal.newPrimary ? 'published' : 'unpublished', payload: JSON.parse(payload) };
}
export function inspectProbeRestore() { return withProbeSnapshot(inspect); }

export function prepareProbeRestore(value) {
  const payload = JSON.stringify(value);
  return withProbeSnapshot(async () => {
    if ((await context()).journal) throw new Error('probe_pending');
    const digest = await hash(payload), operationId = crypto.randomUUID();
    const journal = { operationId, phase: 'verified', oldPrimary: localStorage.getItem(PROBE_PRIMARY_KEY),
      newPrimary: JSON.stringify({ probeVersion: 1, operationId, hash: digest }), hash: digest, ownedKeys: ['candidate'] };
    await transaction('readwrite', (rows, journals) => { rows.add(payload, 'candidate'); journals.add(journal, 'active'); });
    const verified = await inspect(); // separate transaction, no published game loader
    if (verified.status !== 'unpublished') throw new Error('probe_stage_invalid');
    return journal;
  });
}
export function publishProbeRestore({ afterPrimaryPublished } = {}) {
  return withProbeSnapshot(async () => {
    const candidate = await inspect();
    if (candidate.status === 'conflict') throw new Error('probe_conflict');
    if (candidate.status !== 'unpublished') throw new Error('probe_stage_invalid');
    // This prototype never updates phase: inspect actual primary, not phase.
    localStorage.setItem(PROBE_PRIMARY_KEY, candidate.newPrimary);
    // Probe-only deterministic interruption/failure injection, while still
    // holding both locks and before the publication Promise completes.
    if (afterPrimaryPublished) await afterPrimaryPublished();
    return candidate.newPrimary;
  });
}
async function removeOwnedStage(journal) {
  await transaction('readwrite', (rows, journals) => {
    for (const key of journal.ownedKeys) rows.delete(key);
    journals.delete('active');
  });
}
export function discardProbeStage() {
  return withProbeSnapshot(async () => {
    const { journal, current } = await context(); if (!journal) return;
    if (current === journal.newPrimary) throw new Error('probe_published');
    if (current !== journal.oldPrimary) throw new Error('probe_conflict');
    await removeOwnedStage(journal);
  });
}
export function rollbackProbeRestore() {
  return withProbeSnapshot(async () => {
    const { journal, current } = await context();
    if (!journal || current !== journal.newPrimary) throw new Error('probe_conflict');
    if (journal.oldPrimary === null) localStorage.removeItem(PROBE_PRIMARY_KEY);
    else localStorage.setItem(PROBE_PRIMARY_KEY, journal.oldPrimary);
    await removeOwnedStage(journal);
  });
}
