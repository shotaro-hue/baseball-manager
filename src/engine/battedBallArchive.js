import { MAX_BATTED_BALL_CHART_POINTS } from '../constants';
import {
  BATTED_BALL_SCHEMA_VERSION,
  mergeBattedBallProfiles,
  normalizeBattedBallEvent,
  sampleBattedBallEvents,
  updateBattedBallProfile,
} from './battedBallProfile';
import {
  BASEBALL_MANAGER_DB_STORES,
  openBaseballManagerDb,
} from './baseballManagerDb';

const pendingById = new Map();
const failedById = new Map();
const perfSamples = [];
let activeFlush = null;
let lastError = null;
let retryCount = 0;

function isValidId(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 300;
}

function sanitizeBatchRecord(record) {
  if (!record || typeof record !== 'object') return null;
  const events = (Array.isArray(record.events) ? record.events : [])
    .map((event) => normalizeBattedBallEvent(event))
    .filter(Boolean);
  if (
    !isValidId(record.id)
    || !isValidId(record.saveId)
    || !isValidId(record.playerId)
    || !isValidId(record.gameId)
    || !Number.isFinite(Number(record.year))
    || events.length === 0
  ) {
    return null;
  }
  return {
    id: record.id,
    schemaVersion: BATTED_BALL_SCHEMA_VERSION,
    saveId: record.saveId,
    year: Math.trunc(Number(record.year)),
    gameId: record.gameId,
    gameDay: Math.max(0, Math.trunc(Number(record.gameDay) || 0)),
    teamId: isValidId(record.teamId) ? record.teamId : null,
    opponentTeamId: isValidId(record.opponentTeamId) ? record.opponentTeamId : null,
    playerId: record.playerId,
    source: record.source === 'worker' ? 'worker' : 'normal',
    eventCount: events.length,
    events,
    createdAt: Number.isFinite(Number(record.createdAt)) ? Number(record.createdAt) : Date.now(),
  };
}

function idbRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
  });
}

function completeTransaction(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve(true);
    transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed'));
    transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted'));
  });
}

async function writeRecords(records) {
  const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const db = await openBaseballManagerDb();
  try {
    const transaction = db.transaction(
      [
        BASEBALL_MANAGER_DB_STORES.battedBallBatches,
        BASEBALL_MANAGER_DB_STORES.battedBallMeta,
      ],
      'readwrite',
    );
    const batchStore = transaction.objectStore(BASEBALL_MANAGER_DB_STORES.battedBallBatches);
    const metaStore = transaction.objectStore(BASEBALL_MANAGER_DB_STORES.battedBallMeta);
    const bySave = new Map();
    for (const record of records) {
      batchStore.put(record);
      const current = bySave.get(record.saveId) || {
        saveId: record.saveId,
        schemaVersion: BATTED_BALL_SCHEMA_VERSION,
        archiveStartYear: record.year,
        lastWriteAt: 0,
        lastFailureAt: null,
        failureCount: 0,
        estimatedEventCount: 0,
      };
      current.archiveStartYear = Math.min(current.archiveStartYear, record.year);
      current.lastWriteAt = Date.now();
      current.estimatedEventCount += record.eventCount;
      bySave.set(record.saveId, current);
    }
    for (const meta of bySave.values()) {
      const existing = await idbRequest(metaStore.get(meta.saveId));
      metaStore.put({
        ...meta,
        archiveStartYear: Math.min(
          Number(existing?.archiveStartYear) || meta.archiveStartYear,
          meta.archiveStartYear,
        ),
        estimatedEventCount: (Number(existing?.estimatedEventCount) || 0) + meta.estimatedEventCount,
        failureCount: Number(existing?.failureCount) || 0,
      });
    }
    await completeTransaction(transaction);
  } finally {
    db.close();
  }
  const endedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
  perfSamples.push({
    at: Date.now(),
    recordCount: records.length,
    eventCount: records.reduce((sum, record) => sum + record.eventCount, 0),
    writeMs: Math.max(0, endedAt - startedAt),
  });
  if (perfSamples.length > 30) perfSamples.splice(0, perfSamples.length - 30);
}

async function flushInternal() {
  const records = Array.from(pendingById.values());
  if (records.length === 0) return { ok: true, written: 0 };
  records.forEach((record) => pendingById.delete(record.id));
  try {
    await writeRecords(records);
    records.forEach((record) => failedById.delete(record.id));
    lastError = null;
    retryCount = 0;
    return { ok: true, written: records.length };
  } catch (error) {
    for (const record of records) failedById.set(record.id, record);
    lastError = error instanceof Error ? error.message : 'IndexedDB write failed';
    retryCount += 1;
    console.warn('打球アーカイブの保存に失敗しました。試合セーブは継続します。', error);
    return { ok: false, written: 0, error: lastError };
  }
}

export function enqueueBattedBallBatches(records) {
  let accepted = 0;
  for (const record of Array.isArray(records) ? records : []) {
    const safeRecord = sanitizeBatchRecord(record);
    if (!safeRecord) continue;
    pendingById.set(safeRecord.id, safeRecord);
    accepted += 1;
  }
  if (accepted > 0 && !activeFlush) {
    activeFlush = flushInternal().finally(() => {
      activeFlush = null;
      if (pendingById.size > 0) void flushBattedBallQueue();
    });
  }
  return { accepted, queued: pendingById.size };
}

export async function flushBattedBallQueue() {
  if (activeFlush) return activeFlush;
  activeFlush = flushInternal().finally(() => {
    activeFlush = null;
  });
  return activeFlush;
}

export function getBattedBallQueueStatus() {
  return {
    isWriting: Boolean(activeFlush),
    queuedRecords: pendingById.size,
    failedRecords: failedById.size,
    lastError,
    retryCount,
    retryAfterMs: failedById.size > 0 ? Math.min(60_000, 1000 * (2 ** Math.min(6, retryCount))) : 0,
  };
}

export async function retryFailedBattedBallWrites() {
  for (const record of failedById.values()) pendingById.set(record.id, record);
  return flushBattedBallQueue();
}

async function readAllFromIndex(indexName, query) {
  const db = await openBaseballManagerDb();
  try {
    const transaction = db.transaction(BASEBALL_MANAGER_DB_STORES.battedBallBatches, 'readonly');
    const store = transaction.objectStore(BASEBALL_MANAGER_DB_STORES.battedBallBatches);
    const request = store.index(indexName).getAll(query);
    const result = await idbRequest(request);
    await completeTransaction(transaction);
    return Array.isArray(result) ? result : [];
  } finally {
    db.close();
  }
}

function aggregateRecords(records) {
  const sortedRecords = [...records].sort((a, b) =>
    (Number(a.year) - Number(b.year))
    || (Number(a.gameDay) - Number(b.gameDay))
    || String(a.gameId).localeCompare(String(b.gameId)));
  const events = [];
  const profiles = [];
  for (const record of sortedRecords) {
    let profile = null;
    for (const rawEvent of Array.isArray(record.events) ? record.events : []) {
      const event = normalizeBattedBallEvent(rawEvent);
      if (!event) continue;
      events.push({
        ...event,
        year: record.year,
        gameDay: record.gameDay,
        gameId: record.gameId,
      });
      profile = updateBattedBallProfile(profile, event);
    }
    if (profile) profiles.push(profile);
  }
  return {
    events,
    profile: mergeBattedBallProfiles(profiles),
  };
}

export async function loadPlayerBattedBalls({
  saveId,
  playerId,
  year,
  period = 'season',
  chartLimit = MAX_BATTED_BALL_CHART_POINTS,
}) {
  if (!isValidId(saveId) || !isValidId(playerId)) {
    return { status: 'unavailable', events: [], profile: null, totalEvents: 0 };
  }
  const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
  try {
    const records = period === 'career'
      ? await readAllFromIndex('byPlayer', IDBKeyRange.only([saveId, playerId]))
      : await readAllFromIndex(
        'byPlayerSeason',
        IDBKeyRange.only([saveId, playerId, Math.trunc(Number(year))]),
      );
    const aggregate = aggregateRecords(records);
    const events = sampleBattedBallEvents(aggregate.events, chartLimit);
    const endedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    perfSamples.push({
      at: Date.now(),
      query: period,
      playerId,
      rows: records.length,
      eventCount: aggregate.events.length,
      readMs: Math.max(0, endedAt - startedAt),
    });
    if (perfSamples.length > 30) perfSamples.splice(0, perfSamples.length - 30);
    return {
      status: 'ready',
      events,
      profile: aggregate.profile,
      totalEvents: aggregate.events.length,
      sampled: aggregate.events.length > events.length,
    };
  } catch (error) {
    console.warn('打球アーカイブを読み込めません。直近データへフォールバックします。', error);
    return {
      status: typeof indexedDB === 'undefined' ? 'unavailable' : 'error',
      events: [],
      profile: null,
      totalEvents: 0,
      error: error instanceof Error ? error.message : 'load_failed',
    };
  }
}

export async function loadPlayerBattedBallYears(saveId, playerId) {
  if (!isValidId(saveId) || !isValidId(playerId)) return [];
  try {
    const records = await readAllFromIndex('byPlayer', IDBKeyRange.only([saveId, playerId]));
    return [...new Set(records.map((record) => Number(record.year)).filter(Number.isFinite))]
      .sort((a, b) => b - a);
  } catch {
    return [];
  }
}

export async function loadGameBattedBalls(saveId, year, gameId) {
  if (!isValidId(saveId) || !isValidId(gameId)) return [];
  try {
    return await readAllFromIndex(
      'byGame',
      IDBKeyRange.only([saveId, Math.trunc(Number(year)), gameId]),
    );
  } catch {
    return [];
  }
}

export async function loadBattedBallArchiveMeta(saveId) {
  if (!isValidId(saveId)) return null;
  try {
    const db = await openBaseballManagerDb();
    const transaction = db.transaction(BASEBALL_MANAGER_DB_STORES.battedBallMeta, 'readonly');
    const result = await idbRequest(
      transaction.objectStore(BASEBALL_MANAGER_DB_STORES.battedBallMeta).get(saveId),
    );
    await completeTransaction(transaction);
    db.close();
    return result || null;
  } catch {
    return null;
  }
}

export async function deleteBattedBallArchiveBySaveId(saveId) {
  if (!isValidId(saveId)) return { ok: false, deleted: 0 };
  const db = await openBaseballManagerDb();
  let deleted = 0;
  try {
    const transaction = db.transaction(
      [
        BASEBALL_MANAGER_DB_STORES.battedBallBatches,
        BASEBALL_MANAGER_DB_STORES.battedBallMeta,
      ],
      'readwrite',
    );
    const store = transaction.objectStore(BASEBALL_MANAGER_DB_STORES.battedBallBatches);
    const cursorRequest = store.index('byPlayer').openCursor();
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) return;
      if (cursor.value?.saveId === saveId) {
        cursor.delete();
        deleted += 1;
      }
      cursor.continue();
    };
    transaction.objectStore(BASEBALL_MANAGER_DB_STORES.battedBallMeta).delete(saveId);
    await completeTransaction(transaction);
    return { ok: true, deleted };
  } finally {
    db.close();
  }
}

export function getBattedBallPerfMetrics() {
  return [...perfSamples];
}
