import { describe, expect, it } from 'vitest';
import { TEAM_DEFS, MAX_ROSTER } from '../../constants';
import { buildTeam } from '../playerCore';
import { createInitialTeams } from '../bootstrapTeams';
import {
  optimizeTeamForGameStart,
  buildAutoManagedRoster,
} from '../rosterAutomation';

function makeOverfullTeam() {
  const team = buildTeam(TEAM_DEFS[0]);
  const extraBatters = team.farm.filter((player) => !player.isPitcher).slice(0, 5);
  const extraPitchers = team.farm.filter((player) => player.isPitcher).slice(0, 4);
  const promotedIds = new Set([...extraBatters, ...extraPitchers].map((player) => player.id));
  return {
    ...team,
    players: [...team.players, ...extraBatters, ...extraPitchers],
    farm: team.farm.filter((player) => !promotedIds.has(player.id)),
  };
}

describe('optimizeTeamForGameStart', () => {
  it('reduces an overfull roster to the active limit and prepares playable lineups', () => {
    const optimized = optimizeTeamForGameStart(makeOverfullTeam());

    expect(optimized.players).toHaveLength(MAX_ROSTER);
    expect(optimized.lineupNoDh).toHaveLength(8);
    expect(optimized.lineupDh).toHaveLength(9);
    expect(optimized.rotation.length).toBeGreaterThan(0);
    expect(optimized.rotation.length).toBeLessThanOrEqual(6);
    expect(optimized.pitchingPattern).toMatchObject({
      closerId: expect.anything(),
      setupId: expect.anything(),
      seventhId: expect.anything(),
      middleOrder: expect.any(Array),
    });

    const activeIds = new Set(optimized.players.map((player) => player.id));
    const lineupIds = [...optimized.lineupNoDh, ...optimized.lineupDh];
    lineupIds.forEach((id) => {
      expect(activeIds.has(id)).toBe(true);
      expect(optimized.players.find((player) => player.id === id)?.isPitcher).toBe(false);
    });
  });

  it('builds a UI-friendly full roster payload from the same shared logic', () => {
    const optimized = buildAutoManagedRoster(makeOverfullTeam());

    expect(optimized.players).toHaveLength(MAX_ROSTER);
    expect(optimized.lineupEntries).toHaveLength(optimized.rosterDhMode ? 9 : 8);
    expect(optimized.rotation.length).toBeGreaterThan(0);
    expect(optimized.rotation.length).toBeLessThanOrEqual(6);
    expect(new Set(optimized.lineupEntries.map((entry) => entry.id)).size).toBe(optimized.lineupEntries.length);
    optimized.lineupEntries.forEach((entry) => {
      expect(entry.pos).toBeTruthy();
    });
  });
});

describe('createInitialTeams', () => {
  it('creates teams that can start a game without manual roster trimming', () => {
    const teams = createInitialTeams();

    teams.forEach((team) => {
      expect(team.players.length).toBeLessThanOrEqual(MAX_ROSTER);
      expect(team.rotation.length).toBeGreaterThan(0);
      expect(team.rotation.length).toBeLessThanOrEqual(6);
      expect(team.pitchingPattern).toBeTruthy();
      expect(team.lineupNoDh).toHaveLength(8);
      expect(team.lineupDh).toHaveLength(9);
    });
  });
});
