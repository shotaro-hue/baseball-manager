import { describe, expect, it } from 'vitest';
import { TEAM_DEFS } from '../../constants';
import { buildTeam } from '../../engine/player';
import { generateSeasonSchedule } from '../../engine/scheduleGen';
import { createSeasonBatchProgressState, shouldEmitSeasonBatchProgress, simulateSeasonBatch } from '../seasonBatchCore';

describe('season batch progress throttling', () => {
  it('emits immediately on first update and then throttles by time', () => {
    const state = createSeasonBatchProgressState(250);

    expect(shouldEmitSeasonBatchProgress(state, 0)).toBe(true);
    expect(shouldEmitSeasonBatchProgress(state, 100)).toBe(false);
    expect(shouldEmitSeasonBatchProgress(state, 251)).toBe(true);
  });

  it('always emits on completion even inside the throttle window', () => {
    const state = createSeasonBatchProgressState(250);

    shouldEmitSeasonBatchProgress(state, 0);

    expect(shouldEmitSeasonBatchProgress(state, 120, { force: true })).toBe(true);
  });
});

describe('simulateSeasonBatch payload shaping', () => {
  it('returns lightweight batch results while preserving detailed game records in the patch', () => {
    const teams = TEAM_DEFS.map((def) => buildTeam(def));
    const schedule = generateSeasonSchedule(2026, teams);
    const result = simulateSeasonBatch({
      snapshot: {
        teams,
        schedule,
        faPool: [],
        seasonHistory: { transfers: [] },
        news: [],
        mailbox: [],
        gameResultsMap: {},
        scheduleArchive: [],
        myId: teams[0].id,
        gameDay: 1,
        year: 2026,
        allStarDone: true,
        allStarResult: null,
        allStarTriggerDay: 72,
        saveRevision: 0,
      },
      count: 2,
      isCancelled: () => false,
    });

    expect(result.batchResults.length).toBeGreaterThan(0);
    expect(result.batchResults[0].log).toBeUndefined();
    expect(result.batchResults[0].inningSummary).toBeUndefined();
    expect(result.batchResults[0].oppTeam?.short).toBeTruthy();
    const gameNo = result.batchResults[0].gameNo;
    expect(Array.isArray(result.gameResultsMapPatch[gameNo]?.log)).toBe(true);
    expect(Array.isArray(result.gameResultsMapPatch[gameNo]?.inningSummary)).toBe(true);

    const firstTeamId = Object.keys(result.allTeamResultsPatch)[0];
    const firstDay = Object.keys(result.allTeamResultsPatch[firstTeamId] || {})[0];
    expect(result.allTeamResultsPatch[firstTeamId][firstDay]?.myBatting).toBeUndefined();
    expect(result.allTeamResultsPatch[firstTeamId][firstDay]?.inningScores).toBeUndefined();

    const detailEntry = Object.values(result.allTeamBoxScoresPatch || {})
      .flatMap((days) => Object.values(days || {}))
      .find((entry) => Array.isArray(entry?.inningScores));
    expect(detailEntry?.inningScores?.length).toBeGreaterThan(0);
  });
});
