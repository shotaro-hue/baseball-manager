import { it, expect } from 'vitest';
import { createInitialTeams } from '../src/engine/bootstrapTeams';
import { initGameState } from '../src/engine/simulation';
import { advanceTacticalAction } from '../src/engine/tacticalActions';

it('an intentional walk from a tactical stop changes runners, batter and log in the real engine', () => {
  const teams = createInitialTeams();
  const initial = initGameState(teams[0], teams[1], { isMyHome: true });
  const gs = { ...initial, stopped: true, stopReason: 'scoring_position_crisis', stopData: {}, outs: 2, bases: [null, initial.opLineup[1], null] };
  const next = advanceTacticalAction(gs, 'walk');
  expect(next.opBatIdx).toBe(gs.opBatIdx + 1);
  expect(next.log).toHaveLength(gs.log.length + 1);
  expect(next.log.at(-1)).toMatchObject({ result: 'bb', isIntentional: true, strategy: 'walk' });
  expect(next.bases[0]).toBeTruthy();
  expect(next.bases[1]).toBe(gs.bases[1]);
  expect(gs.bases[0]).toBeNull();
});
