import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createInitialTeams } from '../../engine/bootstrapTeams';
import { generateSeasonSchedule } from '../../engine/scheduleGen';
import { validateTeamRoster } from '../../engine/rosterAutomation';
import { simulateSeasonBatch } from '../seasonBatchCore';

function seedRandom(seed) {
  let n = seed;
  vi.spyOn(Math, 'random').mockImplementation(() => {
    n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
    return n / 4294967296;
  });
}
afterEach(() => vi.restoreAllMocks());

it('continues after the seed-99 second injury instead of leaving a seven-player lineup', () => {
  seedRandom(1);
  const state = JSON.parse(gunzipSync(readFileSync('e2e/fixtures/new-game.json.gz')));
  state.teams = createInitialTeams();
  state.myId = 4;
  state.schedule = generateSeasonSchedule(state.year, state.teams);
  const team = state.teams.find(t => t.id === state.myId);
  const shortstop = team.players.find(p => team.fieldingNoDh[p.id] === '遊撃手');
  Object.assign(shortstop, { injuryDaysLeft: 10, injury: '軽微' });
  seedRandom(99);
  const first = simulateSeasonBatch({ snapshot: state, count: 5, isCancelled: () => false });
  const after = first.nextState.teams.find(t => t.id === state.myId);
  expect([...after.players, ...after.farm].some(p => p.id !== shortstop.id && !p.isPitcher && p.injuryDaysLeft > 0)).toBe(true);
  expect(validateTeamRoster(after).errors).toEqual([]);
  expect(after.lineupNoDh).toHaveLength(8);
  const next = simulateSeasonBatch({ snapshot: first.nextState, count: 1, isCancelled: () => false });
  expect(next.nextState.gameDay).toBe(first.nextState.gameDay + 1);
  expect(validateTeamRoster(next.nextState.teams.find(t => t.id === state.myId)).errors).toEqual([]);
});
