import {
  createEmptyBattedBallProfile,
  mergeBattedBallProfiles,
  normalizeBattedBallEvent,
  updateBattedBallProfile,
} from './battedBallProfile.js';

export const BATTED_BALL_AGGREGATE_SCHEMA_VERSION = 1;
export const BATTED_BALL_RESULT_BUCKETS = ['all', 'hit', 'hr', 'out'];

const PROFILE_FIELDS = [
  'bip', 'evSum', 'evN', 'laSum', 'laN', 'hardHit', 'barrel',
  'ground', 'line', 'fly', 'left', 'center', 'right',
  'pull', 'centerRelative', 'opposite', 'homeRun', 'parkAdjustedHrSum',
];

function isHit(event) {
  return ['s', 'd', 't', 'hr'].includes(event?.result);
}

export function createEmptyProfilesByResult() {
  return Object.fromEntries(
    BATTED_BALL_RESULT_BUCKETS.map((key) => [key, createEmptyBattedBallProfile()]),
  );
}

export function buildProfilesByResult(events) {
  const profiles = createEmptyProfilesByResult();
  for (const rawEvent of Array.isArray(events) ? events : []) {
    const event = normalizeBattedBallEvent(rawEvent);
    if (!event) continue;
    profiles.all = updateBattedBallProfile(profiles.all, event);
    const resultKey = isHit(event) ? 'hit' : 'out';
    profiles[resultKey] = updateBattedBallProfile(profiles[resultKey], event);
    if (event.result === 'hr') {
      profiles.hr = updateBattedBallProfile(profiles.hr, event);
    }
  }
  return profiles;
}

export function createBattedBallAggregateId(saveId, year, playerId) {
  return `${saveId}:${Math.trunc(Number(year))}:${playerId}`;
}

export function createBattedBallAggregateRecord(batchRecord) {
  const profilesByResult = buildProfilesByResult(batchRecord?.events);
  const saveId = String(batchRecord?.saveId || '');
  const year = Math.trunc(Number(batchRecord?.year) || 0);
  const playerId = String(batchRecord?.playerId || '');
  return {
    id: createBattedBallAggregateId(saveId, year, playerId),
    schemaVersion: BATTED_BALL_AGGREGATE_SCHEMA_VERSION,
    saveId,
    year,
    playerId,
    teamId: batchRecord?.teamId ?? null,
    profilesByResult,
    totalEvents: Number(profilesByResult.all?.bip) || 0,
    batchCount: 1,
    updatedAt: Number(batchRecord?.createdAt) || 0,
  };
}

function applyProfileDelta(current, next, previous) {
  const result = createEmptyBattedBallProfile();
  for (const field of PROFILE_FIELDS) {
    const value =
      (Number(current?.[field]) || 0)
      + (Number(next?.[field]) || 0)
      - (Number(previous?.[field]) || 0);
    result[field] = Math.max(0, value);
  }
  return result;
}

/**
 * 同じバッチIDを再保存した場合は旧バッチ分を差し引いてから新バッチ分を加える。
 * IndexedDBのバッチ本体と同一トランザクションで使うことで二重加算を防ぐ。
 */
export function applyBattedBallBatchToAggregate(currentAggregate, nextBatch, previousBatch = null) {
  const nextAggregate = createBattedBallAggregateRecord(nextBatch);
  const previousAggregate = previousBatch
    ? createBattedBallAggregateRecord(previousBatch)
    : null;
  const currentProfiles = currentAggregate?.profilesByResult || createEmptyProfilesByResult();
  const profilesByResult = Object.fromEntries(
    BATTED_BALL_RESULT_BUCKETS.map((key) => [
      key,
      applyProfileDelta(
        currentProfiles[key],
        nextAggregate.profilesByResult[key],
        previousAggregate?.profilesByResult?.[key],
      ),
    ]),
  );
  return {
    ...nextAggregate,
    teamId: nextAggregate.teamId ?? currentAggregate?.teamId ?? null,
    profilesByResult,
    totalEvents: Math.max(
      0,
      (Number(currentAggregate?.totalEvents) || 0)
      + nextAggregate.totalEvents
      - (Number(previousAggregate?.totalEvents) || 0),
    ),
    batchCount: Math.max(
      0,
      (Number(currentAggregate?.batchCount) || 0) + (previousBatch ? 0 : 1),
    ),
    updatedAt: Math.max(
      Number(currentAggregate?.updatedAt) || 0,
      Number(nextAggregate.updatedAt) || 0,
    ),
  };
}

export function mergeBattedBallAggregateRows(rows, playerId = null) {
  const filtered = (Array.isArray(rows) ? rows : [])
    .filter((row) => !playerId || row?.playerId === playerId);
  return {
    playerId: playerId || filtered[0]?.playerId || null,
    profilesByResult: Object.fromEntries(
      BATTED_BALL_RESULT_BUCKETS.map((key) => [
        key,
        mergeBattedBallProfiles(filtered.map((row) => row?.profilesByResult?.[key])),
      ]),
    ),
    totalEvents: filtered.reduce((sum, row) => sum + (Number(row?.totalEvents) || 0), 0),
  };
}

export function rebuildBattedBallAggregateRecords(batchRecords) {
  const uniqueBatches = new Map();
  for (const batch of Array.isArray(batchRecords) ? batchRecords : []) {
    if (batch?.id) uniqueBatches.set(batch.id, batch);
  }
  const aggregates = new Map();
  for (const batch of uniqueBatches.values()) {
    const id = createBattedBallAggregateId(batch.saveId, batch.year, batch.playerId);
    aggregates.set(
      id,
      applyBattedBallBatchToAggregate(aggregates.get(id), batch),
    );
  }
  return Array.from(aggregates.values());
}
