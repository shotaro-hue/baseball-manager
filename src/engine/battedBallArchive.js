import { MAX_BATTED_BALL_CHART_POINTS } from '../constants';
import {
  BATTED_BALL_SCHEMA_VERSION,
  normalizeBattedBallEvent,
  sampleBattedBallEvents,
  updateBattedBallProfile,
} from './battedBallProfile';
import {
  BATTED_BALL_AGGREGATE_SCHEMA_VERSION,
  applyBattedBallBatchToAggregate,
  createBattedBallAggregateId,
  mergeBattedBallAggregateRows,
  rebuildBattedBallAggregateRecords,
} from './battedBallAggregate';
import {
  BASEBALL_MANAGER_DB_STORES,
  openBaseballManagerDb,
} from './baseballManagerDb';

const pendingById = new Map();
const failedById = new Map();
const perfSamples = [];
const comparisonCache = new Map();
const aggregateReadyBySave = new Set();
const aggregateBackfillBySave = new Map();
let activeFlush = null;
let archiveMutationTail = Promise.resolve();
let lastError = null;
let retryCount = 0;

function runArchiveMutation(task) {
  const current = archiveMutationTail.then(task, task);
  archiveMutationTail = current.catch(() => {});
  return current;
}

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
        BASEBALL_MANAGER_DB_STORES.battedBallAggregates,
        BASEBALL_MANAGER_DB_STORES.battedBallMeta,
      ],
      'readwrite',
    );
    const batchStore = transaction.objectStore(BASEBALL_MANAGER_DB_STORES.battedBallBatches);
    const aggregateStore = transaction.objectStore(
      BASEBALL_MANAGER_DB_STORES.battedBallAggregates,
    );
    const metaStore = transaction.objectStore(BASEBALL_MANAGER_DB_STORES.battedBallMeta);
    const bySave = new Map();
    for (const record of records) {
      const previousRecord = await idbRequest(batchStore.get(record.id));
      const aggregateId = createBattedBallAggregateId(
        record.saveId,
        record.year,
        record.playerId,
      );
      const currentAggregate = await idbRequest(aggregateStore.get(aggregateId));
      aggregateStore.put(
        applyBattedBallBatchToAggregate(currentAggregate, record, previousRecord),
      );
      batchStore.put(record);
      const current = bySave.get(record.saveId) || {
        saveId: record.saveId,
        schemaVersion: BATTED_BALL_SCHEMA_VERSION,
        archiveStartYear: record.year,
        lastWriteAt: 0,
        lastFailureAt: null,
        failureCount: 0,
        eventDelta: 0,
      };
      current.archiveStartYear = Math.min(current.archiveStartYear, record.year);
      current.lastWriteAt = Date.now();
      current.eventDelta += record.eventCount - (Number(previousRecord?.eventCount) || 0);
      bySave.set(record.saveId, current);
    }
    for (const meta of bySave.values()) {
      const existing = await idbRequest(metaStore.get(meta.saveId));
      const nextMeta = {
        ...(existing || {}),
        ...meta,
        archiveStartYear: Math.min(
          Number(existing?.archiveStartYear) || meta.archiveStartYear,
          meta.archiveStartYear,
        ),
        estimatedEventCount: Math.max(
          0,
          (Number(existing?.estimatedEventCount) || 0) + meta.eventDelta,
        ),
        failureCount: Number(existing?.failureCount) || 0,
      };
      delete nextMeta.eventDelta;
      if (!existing) {
        nextMeta.aggregateSchemaVersion = BATTED_BALL_AGGREGATE_SCHEMA_VERSION;
        nextMeta.aggregateBackfilledAt = Date.now();
        aggregateReadyBySave.add(meta.saveId);
      } else if (
        Number(existing.aggregateSchemaVersion) >= BATTED_BALL_AGGREGATE_SCHEMA_VERSION
      ) {
        aggregateReadyBySave.add(meta.saveId);
      }
      metaStore.put(nextMeta);
    }
    await completeTransaction(transaction);
    comparisonCache.clear();
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
    await runArchiveMutation(() => writeRecords(records));
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

async function readAllAggregatesFromIndex(indexName, query) {
  const db = await openBaseballManagerDb();
  try {
    const transaction = db.transaction(
      BASEBALL_MANAGER_DB_STORES.battedBallAggregates,
      'readonly',
    );
    const store = transaction.objectStore(BASEBALL_MANAGER_DB_STORES.battedBallAggregates);
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
  const profilesByResult = {
    all: null,
    hit: null,
    hr: null,
    out: null,
  };
  for (const record of sortedRecords) {
    for (const rawEvent of Array.isArray(record.events) ? record.events : []) {
      const event = normalizeBattedBallEvent(rawEvent);
      if (!event) continue;
      events.push({
        ...event,
        year: record.year,
        gameDay: record.gameDay,
        gameId: record.gameId,
      });
      const isHit = ['s', 'd', 't', 'hr'].includes(event.result);
      profilesByResult.all = updateBattedBallProfile(profilesByResult.all, event);
      profilesByResult[isHit ? 'hit' : 'out'] = updateBattedBallProfile(
        profilesByResult[isHit ? 'hit' : 'out'],
        event,
      );
      if (event.result === 'hr') {
        profilesByResult.hr = updateBattedBallProfile(profilesByResult.hr, event);
      }
    }
  }
  return {
    events,
    profile: profilesByResult.all,
    profilesByResult,
  };
}

async function replaceAggregateRowsForSave(saveId, rows, metaSnapshot) {
  const db = await openBaseballManagerDb();
  try {
    const transaction = db.transaction(
      [
        BASEBALL_MANAGER_DB_STORES.battedBallAggregates,
        BASEBALL_MANAGER_DB_STORES.battedBallMeta,
      ],
      'readwrite',
    );
    const aggregateStore = transaction.objectStore(
      BASEBALL_MANAGER_DB_STORES.battedBallAggregates,
    );
    const metaStore = transaction.objectStore(BASEBALL_MANAGER_DB_STORES.battedBallMeta);
    const cursorRequest = aggregateStore.index('bySave').openCursor(IDBKeyRange.only(saveId));
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
        return;
      }
      for (const row of rows) aggregateStore.put(row);
      const years = rows.map((row) => Number(row.year)).filter(Number.isFinite);
      metaStore.put({
        ...(metaSnapshot || {}),
        saveId,
        schemaVersion: BATTED_BALL_SCHEMA_VERSION,
        archiveStartYear: years.length
          ? Math.min(...years)
          : Number(metaSnapshot?.archiveStartYear) || null,
        estimatedEventCount: rows.reduce(
          (sum, row) => sum + (Number(row?.totalEvents) || 0),
          0,
        ),
        aggregateSchemaVersion: BATTED_BALL_AGGREGATE_SCHEMA_VERSION,
        aggregateBackfilledAt: Date.now(),
      });
    };
    cursorRequest.onerror = () => transaction.abort();
    await completeTransaction(transaction);
  } finally {
    db.close();
  }
}

async function performAggregateBackfill(saveId) {
  const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const meta = await loadBattedBallArchiveMeta(saveId);
  if (
    Number(meta?.aggregateSchemaVersion) >= BATTED_BALL_AGGREGATE_SCHEMA_VERSION
  ) {
    aggregateReadyBySave.add(saveId);
    return { backfilled: false, rows: 0 };
  }
  const records = await readAllFromIndex(
    'byPlayer',
    IDBKeyRange.bound([saveId, ''], [saveId, '\uffff']),
  );
  const aggregateRows = rebuildBattedBallAggregateRecords(records);
  await replaceAggregateRowsForSave(saveId, aggregateRows, meta);
  aggregateReadyBySave.add(saveId);
  comparisonCache.clear();
  const endedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
  perfSamples.push({
    at: Date.now(),
    query: 'aggregate-backfill',
    source: 'archive',
    rows: records.length,
    aggregateRows: aggregateRows.length,
    eventCount: aggregateRows.reduce(
      (sum, row) => sum + (Number(row?.totalEvents) || 0),
      0,
    ),
    readMs: Math.max(0, endedAt - startedAt),
  });
  if (perfSamples.length > 30) perfSamples.splice(0, perfSamples.length - 30);
  return { backfilled: true, rows: aggregateRows.length };
}

async function ensureAggregateBackfill(saveId) {
  if (aggregateReadyBySave.has(saveId)) return { backfilled: false, rows: 0 };
  const active = aggregateBackfillBySave.get(saveId);
  if (active) return active;
  const backfill = runArchiveMutation(() => performAggregateBackfill(saveId))
    .finally(() => {
      aggregateBackfillBySave.delete(saveId);
    });
  aggregateBackfillBySave.set(saveId, backfill);
  return backfill;
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
      profilesByResult: aggregate.profilesByResult,
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

export async function loadBattedBallComparisonProfiles({
  saveId,
  year,
  period = 'season',
  playerIds,
}) {
  if (!isValidId(saveId)) {
    return { status: 'unavailable', peers: [], source: 'aggregate' };
  }
  const ids = [...new Set((Array.isArray(playerIds) ? playerIds : []).filter(isValidId))].sort();
  if (ids.length === 0) return { status: 'ready', peers: [], source: 'aggregate' };
  const cacheKey = `${saveId}:${period}:${Math.trunc(Number(year) || 0)}:${ids.join(',')}`;
  const cached = comparisonCache.get(cacheKey);
  if (cached) return cached;
  const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
  try {
    await ensureAggregateBackfill(saveId);
    const query = period === 'career'
      ? IDBKeyRange.only(saveId)
      : IDBKeyRange.only([saveId, Math.trunc(Number(year))]);
    const aggregateRows = await readAllAggregatesFromIndex(
      period === 'career' ? 'bySave' : 'bySaveYear',
      query,
    );
    const allowed = new Set(ids);
    const byPlayer = new Map();
    for (const row of aggregateRows) {
      if (!allowed.has(row?.playerId)) continue;
      const list = byPlayer.get(row.playerId) || [];
      list.push(row);
      byPlayer.set(row.playerId, list);
    }
    const result = {
      status: 'ready',
      source: 'aggregate',
      peers: ids.map((playerId) => {
        const aggregate = mergeBattedBallAggregateRows(
          byPlayer.get(playerId) || [],
          playerId,
        );
        return {
          playerId,
          profilesByResult: aggregate.profilesByResult,
          totalEvents: aggregate.totalEvents,
        };
      }),
    };
    const endedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    perfSamples.push({
      at: Date.now(),
      query: `comparison-${period}`,
      source: 'aggregate',
      rows: aggregateRows.length,
      playerCount: ids.length,
      readMs: Math.max(0, endedAt - startedAt),
    });
    if (perfSamples.length > 30) perfSamples.splice(0, perfSamples.length - 30);
    comparisonCache.set(cacheKey, result);
    if (comparisonCache.size > 8) {
      comparisonCache.delete(comparisonCache.keys().next().value);
    }
    return result;
  } catch (error) {
    return {
      status: typeof indexedDB === 'undefined' ? 'unavailable' : 'error',
      source: 'aggregate',
      peers: [],
      error: error instanceof Error ? error.message : 'comparison_load_failed',
    };
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
  return runArchiveMutation(async () => {
    const db = await openBaseballManagerDb();
    let deleted = 0;
    try {
      const transaction = db.transaction(
        [
          BASEBALL_MANAGER_DB_STORES.battedBallBatches,
          BASEBALL_MANAGER_DB_STORES.battedBallAggregates,
          BASEBALL_MANAGER_DB_STORES.battedBallMeta,
        ],
        'readwrite',
      );
      const batchStore = transaction.objectStore(BASEBALL_MANAGER_DB_STORES.battedBallBatches);
      const batchCursorRequest = batchStore.index('byPlayer').openCursor(
        IDBKeyRange.bound([saveId, ''], [saveId, '\uffff']),
      );
      batchCursorRequest.onsuccess = () => {
        const cursor = batchCursorRequest.result;
        if (!cursor) return;
        cursor.delete();
        deleted += 1;
        cursor.continue();
      };
      const aggregateStore = transaction.objectStore(
        BASEBALL_MANAGER_DB_STORES.battedBallAggregates,
      );
      const aggregateCursorRequest = aggregateStore.index('bySave').openCursor(
        IDBKeyRange.only(saveId),
      );
      aggregateCursorRequest.onsuccess = () => {
        const cursor = aggregateCursorRequest.result;
        if (!cursor) return;
        cursor.delete();
        cursor.continue();
      };
      transaction.objectStore(BASEBALL_MANAGER_DB_STORES.battedBallMeta).delete(saveId);
      await completeTransaction(transaction);
      comparisonCache.clear();
      aggregateReadyBySave.delete(saveId);
      aggregateBackfillBySave.delete(saveId);
      return { ok: true, deleted };
    } finally {
      db.close();
    }
  });
}

export function getBattedBallPerfMetrics() {
  return [...perfSamples];
}
