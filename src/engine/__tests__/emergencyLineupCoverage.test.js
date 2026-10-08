import { describe, expect, it } from 'vitest';
import { FIELDING_POSITIONS } from '../../constants';
import { applyEmergencyRosterMaintenance, prepareTeamForGame, validateLineup } from '../rosterAutomation';

function injuredShortstopTeam(days) {
  const players = FIELDING_POSITIONS.map((pos, index) => ({
    id: `starter-${index}`, name: pos, pos, isPitcher: false,
    positions: { [pos]: 100 }, batting: { contact: 50, power: 50, eye: 50, speed: 50 },
  }));
  const shortstop = players.find(p => p.pos === '遊撃手');
  shortstop.injuryDaysLeft = days;
  players.find(p => p.pos === '二塁手').positions['遊撃手'] = 50;
  const bench = { id: 'bench', name: '控え二塁手', pos: '二塁手', isPitcher: false,
    positions: { 二塁手: 100, DH: 100 }, batting: { contact: 30, power: 30, eye: 30, speed: 30 } };
  const dh = { ...bench, id: 'dh', name: '指名打者', pos: 'DH', positions: { DH: 100 } };
  const pitcher = { id: 'pitcher', name: '先発', isPitcher: true, pos: '投手', subtype: '先発' };
  const lineup = players.map(p => p.id);
  const fielding = Object.fromEntries(players.map(p => [p.id, p.pos]));
  return { id: 4, rosterAutomationMode: 'emergency', rosterDhMode: false, dhEnabled: false,
    players: [...players, bench, dh, pitcher], farm: [], lineup, lineupNoDh: [...lineup],
    lineupDh: [...lineup, dh.id], fieldingNoDh: fielding, fieldingDh: { ...fielding, [dh.id]: 'DH' },
    rotation: [pitcher.id], rotIdx: 0 };
}

describe('emergency fielding coverage', () => {
  for (const days of [5, 15]) {
    for (const useDh of [false, true]) {
      it(`keeps a playable ${useDh ? 'DH' : 'no-DH'} lineup after a ${days}-day shortstop injury`, () => {
        const team = injuredShortstopTeam(days), before = structuredClone(team);
        const repaired = applyEmergencyRosterMaintenance(team);
        const shortstop = team.players.find(p => p.pos === '遊撃手');
        const second = team.players.find(p => p.pos === '二塁手');
        const oldLineup = useDh ? team.lineupDh : team.lineupNoDh;
        const lineup = useDh ? repaired.lineupDh : repaired.lineupNoDh;
        const fielding = useDh ? repaired.fieldingDh : repaired.fieldingNoDh;
        expect(validateLineup(repaired, useDh).errors).toEqual([]);
        expect(lineup).toEqual([...oldLineup.filter(id => id !== shortstop.id), 'bench']);
        expect(fielding[second.id]).toBe('遊撃手');
        expect(fielding.bench).toBe('二塁手');
        for (const id of oldLineup.filter(id => id !== shortstop.id && id !== second.id)) {
          expect(fielding[id]).toBe((useDh ? team.fieldingDh : team.fieldingNoDh)[id]);
        }
        expect(prepareTeamForGame(repaired, useDh).lineup).toHaveLength(9);
        expect(team).toEqual(before);
        expect(repaired.rotation).toEqual(['pitcher']);
      });
    }
  }
  it('keeps healthy manual choices when no emergency is present', () => {
    const team = injuredShortstopTeam(0);
    const repaired = applyEmergencyRosterMaintenance(team);
    expect(repaired.lineupNoDh).toEqual(team.lineupNoDh);
    expect(repaired.lineupDh).toEqual(team.lineupDh);
    expect(repaired.fieldingNoDh).toEqual(team.fieldingNoDh);
    expect(repaired.fieldingDh).toEqual(team.fieldingDh);
  });
  it('can refill a vacancy through more than one fielding move', () => {
    const team = injuredShortstopTeam(5);
    const third = team.players.find(p => p.pos === '三塁手');
    const second = team.players.find(p => p.pos === '二塁手');
    third.positions['二塁手'] = 50;
    Object.assign(team.players.find(p => p.id === 'bench'), { pos: '三塁手', positions: { 三塁手: 100 } });
    const repaired = applyEmergencyRosterMaintenance(team);
    expect(validateLineup(repaired, false).errors).toEqual([]);
    expect(repaired.fieldingNoDh[second.id]).toBe('遊撃手');
    expect(repaired.fieldingNoDh[third.id]).toBe('二塁手');
    expect(repaired.fieldingNoDh.bench).toBe('三塁手');
  });
  it('does not invent coverage when no eligible replacement exists', () => {
    const team = injuredShortstopTeam(5);
    team.players = team.players.filter(p => p.id !== 'bench');
    const repaired = applyEmergencyRosterMaintenance(team);
    expect(validateLineup(repaired, false).errors.length).toBeGreaterThan(0);
    expect(repaired.lineupNoDh).toHaveLength(7);
    expect(repaired.fieldingNoDh).toEqual(Object.fromEntries(
      Object.entries(team.fieldingNoDh).filter(([id]) => repaired.lineupNoDh.includes(id)),
    ));
  });
  it('leaves injury handling to the user in manual mode', () => {
    const team = { ...injuredShortstopTeam(5), rosterAutomationMode: 'manual' };
    const repaired = applyEmergencyRosterMaintenance(team);
    expect(repaired.lineupNoDh).toEqual(team.lineupNoDh);
    expect(repaired.fieldingNoDh).toEqual(team.fieldingNoDh);
  });

});
