import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { BoxScoreModal } from './BoxScoreModal';

const batting = (id, hits) => [{ id, name: id, pos: '捕手', AB: 4, H: hits, HR: 0, RBI: hits, BB: 0, K: 1 }];
const pitching = (id, hits) => [{ id, name: id, ip: 7, H: hits, ER: 0, BB: 0, K: 5, result: null }];
const own = { batting: batting('own-hitter', 2), pitching: pitching('own-pitcher', 1) };
const opponent = { batting: batting('opponent-hitter', 1), pitching: pitching('opponent-pitcher', 2) };
function record(isHome = true) {
  return { homeId: isHome ? 0 : 1, awayId: isHome ? 1 : 0, won: true, drew: false,
    myScore: 2, oppScore: 1, inningScores: [{ inning: 1, home: isHome ? 2 : 1, away: isHome ? 1 : 2 }] };
}
const perspective = () => ({ myBatting: own.batting, oppBatting: opponent.batting,
  myPitching: own.pitching, oppPitching: opponent.pitching });
const legacyHome = () => ({ homeBatting: own.batting, awayBatting: opponent.batting,
  homePitching: own.pitching, awayPitching: opponent.pitching });
function render(result) {
  return renderToStaticMarkup(React.createElement(BoxScoreModal, {
    result, myTeamName: 'Own Club', oppTeamName: 'Opponent Club', teamId: 0, dayNo: 1, onClose() {},
  }));
}
function assertTables(markup) {
  assert.equal(markup.includes('詳細成績データなし'), false);
  const tables = markup.match(/<table\b[\s\S]*?<\/table>/g) || [];
  assert.equal(tables.length, 5, 'inning score and all four player tables must be rendered');
  for (const [index, name, wrongName] of [
    [1, 'own-hitter', 'opponent-hitter'], [2, 'opponent-hitter', 'own-hitter'],
    [3, 'own-pitcher', 'opponent-pitcher'], [4, 'opponent-pitcher', 'own-pitcher'],
  ]) {
    assert.ok(tables[index].includes(name), `table ${index} must contain ${name}`);
    assert.ok(!tables[index].includes(wrongName), `table ${index} must not swap clubs`);
  }
  // A recorded zero is still rendered, not treated as missing data.
  assert.match(tables[1], /<td[^>]*>0<\/td>/);
}

describe('BoxScoreModal saved result compatibility', () => {
  for (const isHome of [true, false]) {
    it(`renders Worker perspective records when the selected club is ${isHome ? 'home' : 'away'}`, () => {
      const result = { ...record(isHome), ...perspective() };
      const before = structuredClone(result);
      assertTables(render(result));
      assert.deepEqual(result, before);
    });
  }
  it('keeps legacy/tactical home records readable', () => {
    assertTables(render({ ...record(), ...legacyHome() }));
  });
  it('prefers perspective fields over stale legacy fields without swapping clubs', () => {
    const stale = { homeBatting: batting('stale-hitter', 4), awayBatting: batting('stale-opponent', 4),
      homePitching: pitching('stale-pitcher', 4), awayPitching: pitching('stale-opponent-pitcher', 4) };
    const markup = render({ ...record(), ...stale, ...perspective() });
    assertTables(markup);
    assert.equal(markup.includes('stale-'), false);
  });
  it('falls back per field for mixed saved formats', () => {
    const markup = render({ ...record(), ...legacyHome(), myBatting: own.batting, oppPitching: opponent.pitching });
    assertTables(markup);
  });
  it('does not replace explicitly empty arrays with stale legacy data', () => {
    const markup = render({ ...record(), ...legacyHome(),
      myBatting: [], oppBatting: [], myPitching: [], oppPitching: [] });
    assert.ok(markup.includes('詳細成績データなし'));
    assert.equal(markup.includes('own-hitter'), false);
    assert.equal(markup.includes('own-pitcher'), false);
  });
  it('does not invent player rows for score-only records', () => {
    const markup = render(record());
    assert.ok(markup.includes('詳細成績データなし'));
    assert.equal((markup.match(/<table\b/g) || []).length, 1);
    assert.equal(render(null), '');
  });
  it('renders the same player tables after JSON serialization of either saved format', () => {
    for (const fields of [perspective(), legacyHome()]) {
      const result = { ...record(), ...fields };
      const reopened = JSON.parse(JSON.stringify(result));
      assertTables(render(reopened));
      assert.equal(render(reopened), render(result));
      assert.deepEqual(reopened, result);
    }
  });
});
