import { createSaveId } from './saveIdentity';
import { createBattedBallArchiveChunker } from './battedBallProfile';

export const BATTED_BALL_VERSION_PREFIX = 'batted-ball-version:';
export const battedBallVersionKey = (saveId, runId, kind, index) => BATTED_BALL_VERSION_PREFIX
  + JSON.stringify(index === undefined ? [saveId, runId, kind] : [saveId, runId, kind, index]);
const id = value => typeof value === 'string' && value.length > 0 && value.length <= 300;
export function validateBattedBallVersionRef(ref, saveId, kind) {
  if (!ref || typeof ref.key !== 'string' || !/^[a-f0-9]{64}$/.test(ref.digest)) throw new Error('invalid_archive_reference');
  let parts;
  try { parts = JSON.parse(ref.key.slice(BATTED_BALL_VERSION_PREFIX.length)); } catch { /* Reject below. */ }
  if (!ref.key.startsWith(BATTED_BALL_VERSION_PREFIX) || !Array.isArray(parts)
    || parts[0] !== saveId || !id(parts[1]) || parts[2] !== kind
    || (kind === 'run' ? parts.length !== 3 : parts.length !== 4 || !Number.isSafeInteger(parts[3]) || parts[3] < 0)
    || ref.key !== battedBallVersionKey(...parts)) throw new Error('invalid_archive_reference');
  return parts;
}
export const emptyBattedBallReceipt = saveId => ({ version: 1, saveId, coverage: 'complete', head: null });
export function validateBattedBallReceipt(receipt, saveId) {
  if (receipt == null) return null; // Legacy provenance is unknown, never empty-complete.
  if (receipt.version !== 1 || !id(receipt.saveId) || receipt.saveId !== saveId
    || !['complete', 'legacy_unverified', 'incomplete'].includes(receipt.coverage)
    || !Object.hasOwn(receipt, 'head')) throw new Error('invalid_archive_receipt');
  if (receipt.head !== null) validateBattedBallVersionRef(receipt.head, saveId, 'run');
  return receipt;
}

// Same bounded chunk producer in synchronous cores and normal result handlers.
export function createBattedBallRunEmitter(onChunk, { runId = createSaveId() } = {}) {
  let closed = false, chunkCount = 0, recordCount = 0, eventCount = 0;
  const chunker = createBattedBallArchiveChunker(chunk => {
    recordCount += chunk.records.length; eventCount += chunk.eventCount;
    onChunk?.({ ...chunk, runId, index: chunkCount++ });
  });
  return {
    add(records) {
      if (closed) throw new Error('archive_run_closed');
      chunker.add((Array.isArray(records) ? records : []).map(record => ({
        ...record, eventCount: Array.isArray(record.events) ? record.events.length : 0,
      })));
    },
    finish() {
      if (!closed) { chunker.flush(); closed = true; }
      return { version: 1, runId, chunkCount, recordCount, eventCount };
    },
  };
}
