import { describe, expect, it, vi } from 'vitest';
import {
  classifyBattedBallType,
  createBattedBallArchiveChunker,
  createBattedBallBatchRecords,
  normalizeBattedBallEvent,
  resolveRelativeDirection,
} from '../battedBallProfile';

describe('batted-ball profile', () => {
  it('normalizes valid contact and rejects non-contact plate appearances', () => {
    expect(normalizeBattedBallEvent({
      result: 'd',
      ev: 151,
      la: 14,
      sprayAngle: 28,
      batterSide: 'right',
      pitcherHand: 'left',
    })).toMatchObject({
      result: 'd',
      evKmh: 151,
      laDeg: 14,
      fieldDirection: 'left',
      relativeDirection: 'pull',
      battedBallType: 'line',
    });

    expect(normalizeBattedBallEvent({ result: 'k', ev: 160, la: 20 })).toBeNull();
    expect(classifyBattedBallType(7.9)).toBe('ground');
    expect(classifyBattedBallType(8)).toBe('line');
    expect(resolveRelativeDirection('right', 'left')).toBe('pull');
  });

  it('creates deterministic per-player game records and bounded worker chunks', () => {
    const teams = [
      {
        id: 'home',
        players: [{ id: 'b1', batHand: 'right' }],
      },
      {
        id: 'away',
        players: [{ id: 'p1', isPitcher: true, hand: 'left' }],
      },
    ];
    const records = createBattedBallBatchRecords([
      {
        batId: 'b1',
        pitcherId: 'p1',
        result: 'hr',
        ev: 162,
        la: 27,
        sprayAngle: 20,
      },
    ], {
      saveId: 'save-1',
      year: 2026,
      gameDay: 12,
      gameId: 'game-12',
      teams,
      createdAt: 123,
      source: 'worker',
    });

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      id: 'save-1:2026:game-12:b1',
      saveId: 'save-1',
      playerId: 'b1',
      teamId: 'home',
      opponentTeamId: 'away',
      eventCount: 1,
      source: 'worker',
    });

    const onChunk = vi.fn();
    const chunker = createBattedBallArchiveChunker(onChunk, {
      maxGames: 1,
      maxEvents: 100,
      maxBytes: 100_000,
    });
    chunker.add(records);

    expect(onChunk).toHaveBeenCalledTimes(1);
    expect(onChunk.mock.calls[0][0]).toMatchObject({
      gameCount: 1,
      eventCount: 1,
    });
  });
});
