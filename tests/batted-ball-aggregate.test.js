import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  applyBattedBallBatchToAggregate,
  createBattedBallAggregateRecord,
  mergeBattedBallAggregateRows,
  rebuildBattedBallAggregateRecords,
} from '../src/engine/battedBallAggregate.js';

function event(result, evKmh, laDeg, seq) {
  return {
    result,
    evKmh,
    laDeg,
    sprayAngleDeg: 45,
    distanceM: result === 'hr' ? 120 : 70,
    seq,
  };
}

function batch(gameId, events, createdAt = 1) {
  return {
    id: `save-1:2026:${gameId}:player-1`,
    saveId: 'save-1',
    year: 2026,
    gameId,
    playerId: 'player-1',
    teamId: 'team-1',
    events,
    eventCount: events.length,
    createdAt,
  };
}

test('raw batch aggregation keeps all result buckets consistent', () => {
  const row = createBattedBallAggregateRecord(batch('g1', [
    event('hr', 161, 28, 0),
    event('out', 130, -2, 1),
  ]));

  assert.equal(row.totalEvents, 2);
  assert.equal(row.profilesByResult.all.bip, 2);
  assert.equal(row.profilesByResult.hit.bip, 1);
  assert.equal(row.profilesByResult.hr.bip, 1);
  assert.equal(row.profilesByResult.out.bip, 1);
  assert.equal(row.profilesByResult.all.barrel, 1);
});

test('saving the same batch twice does not double count', () => {
  const source = batch('g1', [
    event('s', 150, 12, 0),
    event('out', 125, 2, 1),
  ]);
  const first = applyBattedBallBatchToAggregate(null, source);
  const second = applyBattedBallBatchToAggregate(first, source, source);

  assert.equal(second.totalEvents, first.totalEvents);
  assert.equal(second.batchCount, first.batchCount);
  assert.deepEqual(second.profilesByResult, first.profilesByResult);
});

test('replacing a batch subtracts the previous contribution', () => {
  const original = batch('g1', [
    event('hr', 161, 28, 0),
    event('out', 125, 2, 1),
  ]);
  const replacement = batch('g1', [
    event('s', 148, 11, 0),
  ], 2);
  const first = applyBattedBallBatchToAggregate(null, original);
  const replaced = applyBattedBallBatchToAggregate(first, replacement, original);

  assert.equal(replaced.totalEvents, 1);
  assert.equal(replaced.batchCount, 1);
  assert.equal(replaced.profilesByResult.all.bip, 1);
  assert.equal(replaced.profilesByResult.hr.bip, 0);
  assert.equal(replaced.profilesByResult.hit.bip, 1);
});

test('career merge reads season aggregates without raw events', () => {
  const first = createBattedBallAggregateRecord(batch('g1', [
    event('s', 148, 11, 0),
  ]));
  const second = {
    ...createBattedBallAggregateRecord({
      ...batch('g2', [
        event('hr', 161, 28, 0),
        event('out', 125, 2, 1),
      ]),
      year: 2027,
      id: 'save-1:2027:g2:player-1',
    }),
  };
  const career = mergeBattedBallAggregateRows([first, second], 'player-1');

  assert.equal(career.totalEvents, 3);
  assert.equal(career.profilesByResult.all.bip, 3);
  assert.equal(career.profilesByResult.hit.bip, 2);
  assert.equal(career.profilesByResult.hr.bip, 1);
});

test('legacy backfill rebuild ignores duplicate batch ids', () => {
  const source = batch('g1', [
    event('s', 148, 11, 0),
    event('out', 125, 2, 1),
  ]);
  const rows = rebuildBattedBallAggregateRecords([source, source]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].totalEvents, 2);
  assert.equal(rows[0].batchCount, 1);
});

test('team id zero survives aggregate creation and replacement', () => {
  const original = {
    ...batch('g1', [event('s', 148, 11, 0)]),
    teamId: 0,
  };
  const replacement = {
    ...batch('g1', [event('hr', 161, 28, 0)], 2),
    teamId: 0,
  };
  const first = applyBattedBallBatchToAggregate(null, original);
  const replaced = applyBattedBallBatchToAggregate(first, replacement, original);

  assert.equal(first.teamId, 0);
  assert.equal(replaced.teamId, 0);
});
