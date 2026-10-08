import { describe, it, expect } from 'vitest';
import { regularSeasonProgress, batchGameOptions, regularSeasonRequest } from '../seasonProgress';
import { applyRegularSeasonTeamUpdate } from '../regularGameUpdates';
import { simulateSeasonBatch } from '../../workers/seasonBatchCore';
import { simulateSingleDay } from '../../workers/singleDayCore';
import { buildTeam } from '../player';
import { generateSeasonSchedule } from '../scheduleGen';
import { TEAM_DEFS, SEASON_GAMES } from '../../constants';

it.each([[0,0,0,0,143],[10,5,0,15,128],[60,50,5,115,28],[70,70,3,143,0],[10,5,undefined,15,128]])('counts %i wins %i losses %s draws', (wins,losses,draws,playedGames,remainingGames) => {
  expect(regularSeasonProgress({wins,losses,draws})).toEqual({valid:true,playedGames,remainingGames});
});
it('applies a deterministic final draw without changing wins/losses', () => {
  const team = {...buildTeam(TEAM_DEFS[0]),wins:71,losses:70,draws:1};
  expect(regularSeasonProgress(team).remainingGames).toBe(1);
  const rules = {tickInjuries: p => p, tickPositionTraining: p => p, checkForInjuries: () => []};
  const next = applyRegularSeasonTeamUpdate(team,{score:{my:0,opp:0},log:[]},{isFirstTeam:true,isHomeTeam:true,gameDay:143,year:2026},rules).team;
  expect(next).toMatchObject({wins:71,losses:70,draws:2});
  expect(regularSeasonProgress(next)).toMatchObject({playedGames:143,remainingGames:0});
});
it.each([1,2,4,5,6])('offers every remaining tail for %i', remain => {
  const choices = batchGameOptions(remain);
  expect(choices).toContain(remain);
  expect(choices.every(n => n > 0 && n <= remain)).toBe(true);
});
it.each([undefined,null,{wins:NaN,losses:0},{wins:-1,losses:0},{wins:'10',losses:5},{wins:0,losses:0,draws:null},{wins:144,losses:0}])('rejects corrupt or unloaded standings', team => {
  const progress = regularSeasonProgress(team);
  expect(progress.valid).toBe(false);
  expect(Number.isNaN(progress.remainingGames)).toBe(false);
  expect(progress.remainingGames).toBeGreaterThanOrEqual(0);
});
it('does not generate positive choices at zero or invalid remaining counts', () => {
  for (const n of [0,-1,NaN,undefined]) expect(batchGameOptions(n)).toEqual([]);
});
function snapshot(played = 140) {
  const teams = TEAM_DEFS.map(def => ({...buildTeam(def),wins:played,losses:0,draws:0}));
  return {teams,myId:teams[0].id,year:2026,gameDay:played+1,schedule:generateSeasonSchedule(2026,teams),gameResultsMap:{},allStarDone:true};
}
it('caps a real Worker batch at three and ends the regular season', () => {
  const state = snapshot();
  const result = simulateSeasonBatch({snapshot:state,count:5});
  expect(result.batchResults).toHaveLength(3);
  expect(result.nextState.gameDay).toBe(SEASON_GAMES+1);
  expect(regularSeasonProgress(result.nextState.teams[0]).playedGames).toBe(SEASON_GAMES);
  expect(result.shouldEnterPlayoff).toBe(true);
  expect(regularSeasonProgress(state.teams[0]).playedGames).toBe(140);
});
it('rejects ended, nonregular, invalid, replayed and inconsistent Worker requests', () => {
  const base = snapshot();
  const cases = [snapshot(143),{...base,gameDay:1},{...base,schedule:[]}, {...base,gameResultsMap:{141:{}}},
    {...base,offseasonPlan:{year:2026,myId:base.myId,stage:'postseason'}}];
  for (const state of cases) {
    expect(regularSeasonRequest(state,1).count).toBe(0);
    expect(() => simulateSeasonBatch({snapshot:state,count:1})).toThrow();
    expect(() => simulateSingleDay({snapshot:state,gameContext:{}})).toThrow();
  }
  for (const count of [0,-1,NaN,Infinity,1.5,undefined]) expect(regularSeasonRequest(base,count).count).toBe(0);
});
it('preserves standings winning percentage excluding draws', () => {
  const t = {wins:60,losses:50,draws:5};
  const before = t.wins/(t.wins+t.losses);
  regularSeasonProgress(t);
  expect(t.wins/(t.wins+t.losses)).toBe(before);
  expect(t).toEqual({wins:60,losses:50,draws:5});
});
