import { describe, expect, it, vi } from 'vitest';
import { createInitialTeams } from '../../engine/bootstrapTeams';
import { generateSeasonSchedule, calcAllStarTriggerDay } from '../../engine/scheduleGen';
import { simulateSeasonBatch } from '../seasonBatchCore';

function buildSnapshot() {
  // Use the same validated DH/no-DH assignments as a real new game.
  // Taking the first eight batters can omit a required defensive position.
  const teams = createInitialTeams().map((team) => ({ ...team, history: [] }));
  const schedule = generateSeasonSchedule(2026, teams);
  return {
    teams,
    schedule,
    faPool: [],
    seasonHistory: {
      awards: [],
      records: {},
      hallOfFame: [],
      championships: [],
      standingsHistory: [],
      transfers: [],
    },
    news: [],
    mailbox: [],
    myId: teams[0].id,
    gameDay: 1,
    year: 2026,
    allStarDone: false,
    allStarResult: null,
    allStarTriggerDay: calcAllStarTriggerDay(schedule, []),
    saveRevision: 0,
  };
}

function countPayload(result) {
  const players = result.nextState.teams.flatMap((team) => [
    ...(team.players || []),
    ...(team.farm || []),
  ]);
  const battedBallEvents = players.flatMap((player) => player.stats?.battedBallEvents || []);
  const retainedEventTrajectoryPoints = battedBallEvents.reduce(
    (total, event) => total + (event.physics?.trajectoryPoints?.length || 0),
    0,
  );
  const savedGames = Object.values(result.gameResultsMapPatch || {});
  const batchLogEntries = savedGames.flatMap((game) => game.log || []);
  const retainedBatchTrajectoryPoints = batchLogEntries.reduce(
    (total, event) => total + (event.physicsMeta?.trajectory?.length || 0),
    0,
  );
  return {
    battedBallEvents,
    batchLogEntries,
    retainedEventTrajectoryPoints,
    retainedBatchTrajectoryPoints,
    maxBattedBallEventsPerPlayer: Math.max(
      0,
      ...players.map((player) => player.stats?.battedBallEvents?.length || 0),
    ),
  };
}

describe('100-game season batch payload', () => {
  it.each([1, 42, 20260911])('stays compact enough to transfer without retaining physics trajectories (seed %i)', (initialSeed) => {
    let seed = initialSeed;
    const random = vi.spyOn(Math, 'random').mockImplementation(() => {
      seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
      return seed / 4294967296;
    });
    const snapshot = buildSnapshot();
    const perfLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    let result;
    try {
      result = simulateSeasonBatch({ snapshot, count: 100 });
    } finally {
      perfLogSpy.mockRestore();
      random.mockRestore();
    }

    const counts = countPayload(result);
    const payloadJsonMiB = Math.round(
      (Buffer.byteLength(JSON.stringify(result)) / 1024 / 1024) * 100,
    ) / 100;

    console.info('[season-batch-100]', {
      payloadJsonMiB,
      batchResultCount: result.batchResults.length,
      battedBallEventCount: counts.battedBallEvents.length,
      batchLogEntryCount: counts.batchLogEntries.length,
      maxBattedBallEventsPerPlayer: counts.maxBattedBallEventsPerPlayer,
    });

    expect(result.batchResults).toHaveLength(100);
    // Score summaries are season history, independent of the bounded detailed
    // box-score payload. Losing early rounds makes the league calendar blank.
    for (const team of result.nextState.teams) {
      const days = result.allTeamResultsPatch[team.id];
      expect(Object.keys(days), `club ${team.id} score history`).toHaveLength(100);
      expect(Object.keys(days).map(Number)).toEqual(Array.from({ length: 100 }, (_, i) => i + 1));
      const games = Object.values(days);
      expect(games.filter(g => g.won).length).toBe(team.wins);
      expect(games.filter(g => !g.won && !g.drew).length).toBe(team.losses);
      expect(games.filter(g => g.drew).length).toBe(team.draws);
      expect(games.reduce((n, g) => n + g.myScore, 0)).toBe(team.rf);
      expect(games.reduce((n, g) => n + g.oppScore, 0)).toBe(team.ra);
      for (const [day, game] of Object.entries(days)) {
        const scheduled = snapshot.schedule[Number(day)].matchups.find(m => m.homeId === team.id || m.awayId === team.id);
        expect([game.homeId, game.awayId]).toEqual([scheduled.homeId, scheduled.awayId]);
        const reverse = result.allTeamResultsPatch[game.oppId][day];
        expect([reverse.oppId, reverse.myScore, reverse.oppScore, reverse.drew]).toEqual([team.id, game.oppScore, game.myScore, game.drew]);
      }
    }
    expect(Object.values(result.allTeamBoxScoresPatch).flatMap(days => Object.keys(days)).length).toBeLessThanOrEqual(240);
    expect(payloadJsonMiB).toBeLessThan(30);
    expect(counts.retainedEventTrajectoryPoints).toBe(0);
    expect(counts.retainedBatchTrajectoryPoints).toBe(0);
    expect(counts.maxBattedBallEventsPerPlayer).toBeLessThanOrEqual(80);
    expect(counts.batchLogEntries.every((entry) => (
      !entry.physicsMeta && !entry.pitchLog
    ))).toBe(true);
  }, 120_000);
});
