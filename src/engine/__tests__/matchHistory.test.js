import { expect, it } from 'vitest';
import { matchHistorySnapshot, mergeMatchResultPatch, nextSeasonMatchHistory, matchHistoryForSave } from '../matchHistory';

it('merges Worker histories without losing previous clubs/days and replaces repeated recent summaries', () => {
  const original = { gameResultsMap: { 1: { myScore: 1 } }, allTeamResultsMap: { 0: { 1: { myScore: 1 } }, 2: { 1: {} } },
    recentResults: [{ gameNo: 1 }], allStarDone: true, allStarResult: { rosters: {} }, lastPressDay: 10 };
  const patch = { gameResultsMapPatch: { 2: { myScore: 2 } }, allTeamResultsPatch: { 0: { 2: { myScore: 2 } } },
    allTeamBoxScoresPatch: { 0: { 2: { myBatting: [{ H: 1 }] } } }, recentResults: [{ gameNo: 2 }] };
  const next = mergeMatchResultPatch(original, patch);
  expect(Object.keys(next.gameResultsMap)).toEqual(['1', '2']);
  expect(Object.keys(next.allTeamResultsMap[0])).toEqual(['1', '2']);
  expect(next.allTeamResultsMap[2]).toEqual(original.allTeamResultsMap[2]);
  expect(next.allStarDone).toBe(true); expect(next.allStarResult).toEqual(original.allStarResult);
  expect(mergeMatchResultPatch(next, patch)).toEqual(next);
  expect(original.recentResults).toEqual([{ gameNo: 1 }]);
});
it('archives the completed year and resets all current-year history/events together', () => {
  const previous = { ...matchHistorySnapshot(), gameResultsMap: { 143: { myScore: 3 } },
    allTeamResultsMap: { 0: { 143: { myScore: 3 } }, 1: { 143: { myScore: 1 } } },
    allTeamBoxScoresMap: { 0: { 143: { myBatting: [{ H: 1 }] } } }, allStarDone: true, lastPressDay: 140 };
  const next = nextSeasonMatchHistory(previous, 2026, [null], 0);
  expect(next.scheduleArchive[0]).toMatchObject({ year: 2026, gameResultsMap: previous.gameResultsMap,
    myTeamResultsMap: { 143: { myScore: 3, myBatting: [{ H: 1 }] } } });
  expect(next).toMatchObject({ gameResultsMap: {}, allTeamResultsMap: {}, allTeamBoxScoresMap: {},
    allStarDone: false, allStarResult: null, lastPressDay: 0, pressEvent: null, recentResults: [] });
  expect(previous.allStarDone).toBe(true);
});
it('retains result logs and participant names without duplicating opponent stats and career histories', () => {
  const log = [{ batterId: 0, result: 'H' }];
  const previous = { gameResultsMap: { 1: { log, oppTeam: { id: 1, name: '相手',
    players: [{ id: 0, name: '選手', pos: 'C', stats: { H: 3 }, careerLog: [{ year: 2025 }] }] } } } };
  const saved = matchHistoryForSave(previous);
  expect(saved.gameResultsMap[1].log).toBe(log);
  expect(saved.gameResultsMap[1].oppTeam.players[0]).toMatchObject({ id: 0, name: '選手', pos: 'C' });
  expect(saved.gameResultsMap[1].oppTeam.players[0]).not.toHaveProperty('careerLog');
  expect(previous.gameResultsMap[1].oppTeam.players[0].stats.H).toBe(3);
});
