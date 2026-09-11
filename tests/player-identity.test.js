import assert from 'node:assert/strict';
import { test } from 'vitest';

import { resolvePlayerById } from '../src/engine/playerIdentity.js';

test('result name resolution follows a player moved to another team after the game', () => {
  const oldSnapshot = { id: 'a', players: [], farm: [] };
  const movedPlayer = { id: 'pitcher-1', name: '移籍後も表示される投手' };
  const currentTeams = [oldSnapshot, { id: 'b', players: [movedPlayer], farm: [] }];

  assert.equal(resolvePlayerById(oldSnapshot, currentTeams, movedPlayer.id), movedPlayer);
});

test('preferred game snapshot wins when it still contains the player', () => {
  const snapshotPlayer = { id: 'p1', name: '試合時の名前' };
  const preferred = { players: [snapshotPlayer] };
  const currentTeams = [{ players: [{ id: 'p1', name: '別データ' }] }];

  assert.equal(resolvePlayerById(preferred, currentTeams, 'p1'), snapshotPlayer);
});
