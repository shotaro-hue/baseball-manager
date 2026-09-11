import assert from 'node:assert/strict';
import { test } from 'vitest';

import {
  PITCHER_BATTING_DEFAULTS,
  withEffectiveBatting,
} from '../src/engine/battingProfile.js';

test('a pitcher without batting ratings receives low game-only batting defaults', () => {
  const pitcher = { id: 'p1', name: '投手A', isPitcher: true, pitching: {} };
  const effective = withEffectiveBatting(pitcher);

  assert.equal(pitcher.batting, undefined);
  assert.deepEqual(effective.batting, PITCHER_BATTING_DEFAULTS);
  assert.ok(effective.batting.contact < 30);
  assert.ok(effective.batting.power < 20);
  assert.ok(effective.batting.eye < 30);
});

test('all pitchers use the same game-only ratings even if legacy batting ratings exist', () => {
  const pitcher = {
    id: 'p2',
    isPitcher: true,
    batting: { contact: 42, power: 30 },
  };
  const effective = withEffectiveBatting(pitcher);

  assert.deepEqual(effective.batting, PITCHER_BATTING_DEFAULTS);
  assert.equal(effective.batting.contact, 1);
  assert.equal(effective.batting.power, 1);
});

test('position players are not rewritten', () => {
  const batter = { id: 'b1', isPitcher: false, batting: { contact: 70 } };
  assert.equal(withEffectiveBatting(batter), batter);
});
