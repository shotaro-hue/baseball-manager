import assert from 'node:assert/strict';
import { test } from 'vitest';

import { TEAM_DEFS } from '../src/constants.js';
import { NPB2025_ROSTERS } from '../src/data/npb2025.js';
import { getCareerEntryKey, getRecentCareerLog } from '../src/engine/careerStats.js';
import { buildRealTeam, realBatterToPlayer } from '../src/engine/realplayer.js';

const value = (input) => {
  const number = Number(input);
  return Number.isFinite(number) ? number : 0;
};

test('実選手の全履歴行を推定せず元データどおり変換する', () => {
  let playerCount = 0;
  let historyRowCount = 0;

  for (const teamDef of TEAM_DEFS) {
    const roster = NPB2025_ROSTERS[teamDef.id];
    if (!roster) continue;
    const team = buildRealTeam(teamDef, roster);
    const expectedPlayers = [...roster.batters, ...roster.pitchers];
    assert.equal(team.players.length, expectedPlayers.length);

    expectedPlayers.forEach((source, index) => {
      const player = team.players[index];
      const sourceHistory = Array.isArray(source.history) ? source.history : [];
      assert.equal(player.name, source.name);
      assert.equal(player.careerLog.length, sourceHistory.length, source.name);
      playerCount += 1;
      historyRowCount += sourceHistory.length;

      sourceHistory.forEach((row, rowIndex) => {
        const stats = player.careerLog[rowIndex].stats;
        const expected = player.isPitcher
          ? {
            G: row.G, GS: row.GS, CG: row.CG, SHO: row.SHO,
            ERA: row.ERA, WHIP: row.WHIP, IP: row.IP, ER: row.ER,
            BBp: row.BB, HBPp: row.HBP, Kp: row.SO, HRp: row.HR,
            Hp: row.H, W: row.W, L: row.L, SV: row.SV, HLD: row.HLD,
          }
          : {
            G: row.G, AVG: row.AVG, OBP: row.OBP, SLG: row.SLG, OPS: row.OPS,
            PA: row.PA, AB: row.AB, H: row.H, D: row['2B'], T: row['3B'],
            HR: row.HR, RBI: row.RBI, BB: row.BB, K: row.SO, HBP: row.HBP,
            SF: row.SF, SH: row.SH, SB: row.SB, CS: row.CS, R: row.R,
          };
        for (const [key, expectedValue] of Object.entries(expected)) {
          assert.equal(stats[key], value(expectedValue), `${source.name} ${row.year} ${key}`);
        }
      });
    });
  }

  assert.equal(playerCount, 445);
  assert.equal(historyRowCount, 2009);
});

test('移籍年の分割行を在籍履歴の別チームへ対応させる', () => {
  const player = realBatterToPlayer({
    name: '分割 選手',
    age: 30,
    pos: '外野手',
    stats: { AVG: .250, HR: 1, RBI: 2, SB: 0, BB: 2, PA: 20, OPS: .700 },
    history: [
      { year: 2024, G: 20, AB: 50, H: 15, HR: 2, RBI: 8, BB: 3, SO: 10, PA: 55, AVG: .300, OBP: .330, SLG: .440, OPS: .770 },
      { year: 2024, G: 30, AB: 80, H: 20, HR: 1, RBI: 7, BB: 4, SO: 12, PA: 86, AVG: .250, OBP: .280, SLG: .340, OPS: .620 },
    ],
    career: [
      { team: '移籍前', from: 2020, to: 2024 },
      { team: '移籍後', from: 2024, to: null },
    ],
  }, { gameId: 1, name: '現在球団', city: '東京' });

  assert.deepEqual(player.careerLog.map((row) => row.teamName), ['移籍後', '移籍前']);
  assert.equal(new Set(player.careerLog.map(getCareerEntryKey)).size, 2);
  assert.equal(getRecentCareerLog(player.careerLog, 1).length, 2);
});
