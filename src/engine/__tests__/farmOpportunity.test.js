import { describe, expect, it } from 'vitest';
import { selectFarmTeam } from '../farmSelection';
import { selectFarmUsage } from '../farmSelectors';
import { createFarmCompetition, applyFarmRound } from '../farmRecords';
import { simulateFarmRound } from '../farmGame';
import { validateFarmCompetition } from '../farmRecordValidation';
import { batter, pitcher, team, teams, freeze } from './farmFixtures';

const weakBat = { contact: 34, power: 37, eye: 25, stamina: 27 };
const rookies = [batter('rookie-1b', '一塁手', { age: 23, batting: weakBat }),
  batter('rookie-c', '捕手', { age: 19, batting: weakBat }),
  batter('rookie-rf', '右翼手', { age: 21, batting: weakBat })];

describe('farm development opportunities', () => {
  it('gives an unused healthy batter a real DH start while preserving eight suitable defenders', () => {
    const t = team(); t.farm.push(rookies[0]);
    const usage = Object.fromEntries(t.farm.filter(p => !p.isPitcher && p.id !== rookies[0].id)
      .map(p => [p.id, { battingGames: 12, battingPA: 40, lastBattedRound: 12 }]));
    const selected = selectFarmTeam(freeze(t), { round: 13, usage: freeze(usage) });
    expect(selected.lineup.find(x => x.position === 'DH').player.id).toBe(rookies[0].id);
    expect(selected.lineup.filter(x => x.position !== 'DH').every(x => x.proficiency === 100)).toBe(true);
    expect(new Set(selected.lineup.map(x => x.player.id)).size).toBe(9);
    expect(selectFarmTeam({ ...t, farm: [...t.farm].reverse() }, { round: 13, usage })).toEqual(selected);
  });

  it('rotates several weaker rookies through repeated complete games across serialization', () => {
    const ts = teams(); ts[0].farm.push(...rookies);
    let competition = createFarmCompetition({ saveId: 'opportunity', year: 2027, teams: ts });
    for (let round = 1; round <= 40; round++) {
      const result = simulateFarmRound({ teams: ts, year: 2027, round, saveId: 'opportunity', usage: selectFarmUsage(competition) });
      competition = applyFarmRound(competition, result, ts);
      if (round % 7 === 0) {
        const reloaded = JSON.parse(JSON.stringify(competition));
        validateFarmCompetition(reloaded);
        expect(selectFarmTeam(ts[0], { round: round + 1, usage: selectFarmUsage(reloaded) }))
          .toEqual(selectFarmTeam(ts[0], { round: round + 1, usage: selectFarmUsage(competition) }));
        competition = reloaded;
      }
    }
    for (const rookie of rookies) {
      const record = competition.players.find(p => p.playerId === rookie.id);
      expect(record, `${rookie.id}: repeatedly selected`).toBeDefined();
      expect(record.teams[0].batting.G).toBeGreaterThanOrEqual(3);
      expect(record.teams[0].batting.PA).toBeGreaterThanOrEqual(9);
    }
    expect(competition.cards.every(c => c.status === 'played')).toBe(true);
    validateFarmCompetition(competition);
  });

  it('offers a rested unused pitcher a start without changing the others into rescue pitchers', () => {
    const t = team();
    t.farm.push(pitcher('rookie-p', { pitching: { stamina: 20, control: 20, velocity: 20, breaking: 20 } }));
    const usage = Object.fromEntries(t.farm.filter(p => p.isPitcher && p.id !== 'rookie-p')
      .map(p => [p.id, { pitchingBF: 120, lastPitchedRound: 5 }]));
    const selected = selectFarmTeam(t, { round: 12, usage });
    expect(selected.pitchers[0].player.id).toBe('rookie-p');
    expect(selected.pitchers[0].rescue).toBe(false);
    expect(selected.pitchers.slice(1).every(p => !p.rescue)).toBe(true);
  });

  it.each([{ injuryDaysLeft: 1 }, { condition: 20 }, { recentPitchingDays: [11] }])
    ('does not prioritize an unused pitcher who fails the existing safety conditions: %j', extra => {
      const t = team(); t.farm.push(pitcher('unavailable', extra));
      const usage = Object.fromEntries(t.farm.filter(p => p.isPitcher && p.id !== 'unavailable')
        .map(p => [p.id, { pitchingBF: 120, lastPitchedRound: 5 }]));
      const selected = selectFarmTeam(t, { round: 12, usage });
      expect(selected.pitchers[0].player.id).not.toBe('unavailable');
      if (extra.injuryDaysLeft) expect(selected.pitchers.some(p => p.player.id === 'unavailable')).toBe(false);
    });

  it('keeps injured and active-roster batters outside the opportunity rotation', () => {
    const t = team(); t.players.push(batter('active-rookie'));
    t.farm.push(batter('injured-rookie', '一塁手', { injuryDaysLeft: 1 }));
    const usage = Object.fromEntries(t.farm.filter(p => !p.isPitcher && p.id !== 'injured-rookie')
      .map(p => [p.id, { battingGames: 20, battingPA: 70, lastBattedRound: 20 }]));
    const selected = selectFarmTeam(t, { round: 21, usage });
    expect(selected.lineup.some(x => ['active-rookie', 'injured-rookie'].includes(x.player.id))).toBe(false);
  });

  it('derives only measured seasonal workload, combining traded stints without persisting new fields', () => {
    const c = freeze({
      usage: [{ playerId: 'b', lastBattedRound: 8, recentPitching: [] },
        { playerId: 'p', lastPitchedRound: 7, recentPitching: [{ round: 7, outs: 6, BF: 10 }] }],
      players: [{ playerId: 'b', isPitcher: false, teams: [{ batting: { G: 3, PA: 10 } }, { batting: { G: 2, PA: 8 } }] },
        { playerId: 'p', isPitcher: true, teams: [{ pitching: { BF: 20 } }, { pitching: { BF: 10 } }] }],
      legacy: { source: 'legacy-estimated', entries: [{ playerId: 'b', PA: 999 }] },
    });
    const usage = selectFarmUsage(c);
    expect(usage.b).toMatchObject({ battingGames: 5, battingPA: 18, lastBattedRound: 8 });
    expect(usage.p).toMatchObject({ pitchingBF: 30, outs7: 6, lastPitchedRound: 7 });
    expect(c.usage[0]).not.toHaveProperty('battingGames');
    expect(selectFarmUsage(null)).toEqual({});
  });
});
