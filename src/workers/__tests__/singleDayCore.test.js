import { describe, expect, it } from 'vitest';
import { TEAM_DEFS } from '../../constants';
import { buildTeam } from '../../engine/player';
import { simulateSingleDay } from '../singleDayCore';

describe('simulateSingleDay', () => {
  it('returns worker-friendly single day payloads and progress updates', () => {
    const teams = TEAM_DEFS.slice(0, 4).map((def) => buildTeam(def));
    const phases = [];

    const result = simulateSingleDay({
      snapshot: {
        teams,
        schedule: [],
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
      gameContext: {
        myId: teams[0].id,
        gameDay: 1,
        selectedOpponentId: teams[1].id,
        useDh: true,
        isHome: true,
        simulationMode: 'detailed',
      },
      isCancelled: () => false,
      onProgress: (progress) => phases.push(progress.phase),
    });

    expect(result.nextState.gameDay).toBe(2);
    expect(result.userGameResult.gameNo).toBe(1);
    expect(Array.isArray(result.userGameResult.log)).toBe(true);
    expect(result.recentResultsPatch).toHaveLength(1);
    expect(result.gameResultsMapPatch[1]).toBeTruthy();
    expect(result.allTeamResultsPatch[teams[0].id]?.[1]).toBeTruthy();
    expect(result.allTeamResultsPatch[teams[1].id]?.[1]).toBeTruthy();
    expect(result.nextState.teams).toHaveLength(4);
    expect(phases).toContain('試合シム');
    expect(phases).toContain('他試合処理');
    expect(phases).toContain('日次反映');
    expect(phases).toContain('完了');
  });
});
