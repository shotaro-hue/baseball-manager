import assert from 'node:assert/strict';
import { test } from 'vitest';

import {
  appendCareerEntryToPlayer,
  buildCareerLogSummary,
  getCareerEntryKey,
  getRecentCareerLog,
  makeCareerEntry,
  mergeCareerLogWithCurrentSeason,
} from '../src/engine/careerStats.js';

test('移籍年の分割行を別エントリのまま保持する', () => {
  const first = makeCareerEntry({ PA: 55, H: 15 }, {}, 2024, 1, '移籍後');
  const second = makeCareerEntry({ PA: 86, H: 20 }, {}, 2024, 2, '移籍前');

  assert.notEqual(getCareerEntryKey(first), getCareerEntryKey(second));
  assert.equal(getRecentCareerLog([first, second], 1).length, 2);
});

test('通算サマリーと当年行を正しい項目で更新する', () => {
  const first = makeCareerEntry(
    { G: 100, PA: 400, AB: 350, H: 100, D: 20, T: 3, HR: 10, RBI: 50, BB: 35, K: 70, SB: 8 },
    {},
    2025,
    1,
    '球団A',
  );
  const second = makeCareerEntry(
    { G: 25, IP: 120, ER: 30, Kp: 110, W: 12, L: 5, SV: 1, HLD: 2 },
    {},
    2026,
    1,
    '球団A',
  );
  const summary = buildCareerLogSummary([first, second]);
  assert.equal(summary.totalGames, 125);
  assert.equal(summary.totalPlateAppearances, 400);
  assert.equal(summary.totalInningsPitched, 120);
  assert.equal(summary.totalWins, 12);
  assert.equal(summary.totalPitchingStrikeouts, 110);

  const updated = appendCareerEntryToPlayer({ careerLogSummary: buildCareerLogSummary([first]), recentCareerLog: [first] }, second);
  assert.equal(updated.careerLogSummary.totalWins, 12);
  assert.equal(updated.careerLogSummary.lastYear, 2026);

  const merged = mergeCareerLogWithCurrentSeason([first], {
    year: 2026,
    teamId: 1,
    teamName: '球団A',
    stats: { PA: 12, AB: 10, H: 4, HR: 1 },
    playoffStats: {},
  });
  assert.equal(merged.length, 2);
  assert.equal(merged.at(-1).stats.H, 4);
  assert.equal(mergeCareerLogWithCurrentSeason(merged, {
    year: 2026,
    stats: { PA: 99 },
  }).length, 2);
});
