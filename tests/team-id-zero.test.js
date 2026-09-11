import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'vitest';

import { TEAM_DEFS } from '../src/constants.js';
import { createBattedBallBatchRecords } from '../src/engine/battedBallProfile.js';
import { getMyMatchup } from '../src/engine/scheduleLookup.js';
import {
  hasSelectedTeam,
  isTeamIdSet,
  serializeTeamId,
} from '../src/engine/teamId.js';

test('all 12 team ids, including zero, are valid selections', () => {
  assert.equal(TEAM_DEFS.length, 12);
  for (const team of TEAM_DEFS) {
    assert.equal(hasSelectedTeam(TEAM_DEFS, team.id), true, team.name);
  }
  assert.equal(hasSelectedTeam(TEAM_DEFS, null), false);
  assert.equal(hasSelectedTeam(TEAM_DEFS, undefined), false);
  assert.equal(hasSelectedTeam(TEAM_DEFS, 12), false);
});

test('team id helpers preserve zero and reject only missing ids', () => {
  assert.equal(isTeamIdSet(0), true);
  assert.equal(isTeamIdSet(null), false);
  assert.equal(isTeamIdSet(undefined), false);
  assert.equal(serializeTeamId(0), '0');
  assert.equal(serializeTeamId(11), '11');
  assert.equal(serializeTeamId(null), null);
});

test('schedule lookup works when Yakult is either the user team or opponent', () => {
  const schedule = [];
  schedule[1] = {
    isInterleague: false,
    matchups: [{ homeId: 0, awayId: 1, venueNote: null }],
  };

  assert.deepEqual(getMyMatchup(schedule, 1, 0), {
    oppId: 1,
    isHome: true,
    venueNote: null,
    isInterleague: false,
  });
  assert.deepEqual(getMyMatchup(schedule, 1, 1), {
    oppId: 0,
    isHome: false,
    venueNote: null,
    isInterleague: false,
  });
});

test('batted-ball archive metadata serializes numeric team id zero', () => {
  const teams = [
    { id: 0, players: [{ id: 'yakult-batter' }] },
    { id: 1, players: [{ id: 'baystars-pitcher' }] },
  ];
  const rows = createBattedBallBatchRecords([
    {
      batId: 'yakult-batter',
      pitcherId: 'baystars-pitcher',
      result: 'hr',
      evKmh: 161,
      laDeg: 28,
      sprayAngleDeg: 45,
    },
  ], {
    saveId: 'save-1',
    year: 2026,
    gameDay: 1,
    gameId: '1:0:1',
    teams,
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].teamId, '0');
  assert.equal(rows[0].opponentTeamId, '1');
});

test('team selection control paths never use truthiness checks', async () => {
  const forbiddenByFile = new Map([
    ['src/engine/saveload.js', [/!state\.myId\b/]],
    ['src/hooks/useGameState.js', [/if\s*\(\s*!myId\b/, /if\s*\(\s*id\s*\)\s*markSaveDirty/]],
    ['src/hooks/useSeasonFlow.js', [/!myId\b/, /!oppId\b/, /\?\.id\s*\|\|\s*['"]team[12]['"]/]],
    ['src/hooks/useOffseason.js', [/\bmyId\s*\?\s*\(allTeamResultsMap/]],
    ['src/components/tabs/BalanceTab.jsx', [/\|\|\s*!myId\b/]],
    ['src/engine/battedBallAggregate.js', [/teamId\s*\|\|\s*null/, /teamId\s*\|\|\s*currentAggregate/]],
    ['src/workers/seasonBatchCore.js', [/\?\.id\s*\|\|\s*['"]team[12]['"]/]],
    ['src/workers/singleDayCore.js', [/\?\.id\s*\|\|\s*['"]team[12]['"]/]],
  ]);

  for (const [path, patterns] of forbiddenByFile) {
    const source = await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
    for (const pattern of patterns) {
      assert.doesNotMatch(source, pattern, `${path}: ${pattern}`);
    }
  }
});
