import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test, vi } from 'vitest';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { PlayerModal } from '../src/components/PlayerModal';
import { emptyStats } from '../src/engine/playerCore';
import { saberBatter } from '../src/engine/sabermetrics';
vi.mock('../src/engine/saveload', () => ({ loadPlayerCareerLogById: vi.fn(async () => []) }));
const content = node => typeof node === 'string' ? node : (node.children || []).map(content).join('');

test('pitcher details retain GitHub batting fields alongside imported at-bats and sacrifice hits', async () => {
  const stats = { ...emptyStats(), PA: 6, AB: 4, H: 2, D: 1, RBI: 3, SH: 2, IP: 3 };
  const player = { id: 0, name: '投手打撃確認', isPitcher: true, pitching: {}, stats };
  const before = structuredClone(player); let view;
  act(() => { view = create(React.createElement(PlayerModal, { player, initialSection: 'stats', year: 2026, onClose() {} })); });
  const rows = view.root.findAllByProps({ className: 'player-stat-row' });
  const value = label => content(rows.find(row => content(row).startsWith(label))).slice(label.length);
  assert.equal(value('打席'), '6'); assert.equal(value('打数'), '4'); assert.equal(value('打率'), '0.500');
  assert.equal(value('安打'), '2'); assert.equal(value('打点'), '3'); assert.equal(value('犠打'), '2');
  assert.equal(value('OPS'), saberBatter(stats).OPS.toFixed(3));
  assert.deepEqual(player, before);
  act(() => view.unmount());
});

test('title screen retains the GitHub Pages base path', async () => {
  const source = await readFile(new URL('../src/components/TitleScreen.jsx', import.meta.url), 'utf8');
  assert.ok(source.includes('href="/baseball-manager/flow-diagram.html"'));
});
