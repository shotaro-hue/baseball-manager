import { describe, expect, it, vi } from 'vitest';
import { TEAM_DEFS } from '../../constants';
import { NPB2025_ROSTERS } from '../../data/npb2025';
import { buildRealTeam } from '../../engine/realplayer';
import { generateSeasonSchedule, calcAllStarTriggerDay } from '../../engine/scheduleGen';
import { simulateSeasonBatch } from '../seasonBatchCore';

function buildSnapshot() {
  const teams = TEAM_DEFS.map((definition) => {
    const team = buildRealTeam(definition, NPB2025_ROSTERS[definition.id]);
    const nonPitcherIds = (team.players || [])
      .filter((player) => !player.isPitcher)
      .map((player) => player.id);
    team.lineupNoDh = (team.lineupNoDh || team.lineup || nonPitcherIds)
      .filter((id) => nonPitcherIds.includes(id))
      .slice(0, 8);
    team.lineupDh = (team.lineupDh || team.lineup || nonPitcherIds)
      .filter((id) => nonPitcherIds.includes(id))
      .slice(0, 9);
    team.rosterDhMode = team.rosterDhMode ?? team.dhEnabled ?? false;
    team.lineup = (team.rosterDhMode ? team.lineupDh : team.lineupNoDh).slice();
    team.history = [];
    return team;
  });
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
  it('stays compact enough to transfer without retaining physics trajectories', () => {
    const snapshot = buildSnapshot();
    const perfLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    let result;
    try {
      result = simulateSeasonBatch({ snapshot, count: 100 });
    } finally {
      perfLogSpy.mockRestore();
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
    expect(payloadJsonMiB).toBeLessThan(30);
    expect(counts.retainedEventTrajectoryPoints).toBe(0);
    expect(counts.retainedBatchTrajectoryPoints).toBe(0);
    expect(counts.maxBattedBallEventsPerPlayer).toBeLessThanOrEqual(80);
    expect(counts.batchLogEntries.every((entry) => (
      !entry.physicsMeta && !entry.pitchLog
    ))).toBe(true);
  }, 120_000);
});
