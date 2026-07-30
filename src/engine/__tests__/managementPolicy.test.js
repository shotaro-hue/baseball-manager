import { describe, expect, it } from 'vitest';
import {
  MANAGEMENT_POLICIES,
  evaluateBatterForPolicy,
  getManagementPolicy,
} from '../managementPolicy';
import {
  applyManagementPolicy,
  buildAutoLineupEntries,
} from '../rosterAutomation';

const POSITIONS = ['捕手', '一塁手', '二塁手', '三塁手', '遊撃手', '左翼手', '中堅手', '右翼手', 'DH'];

function makeBatter(pos, index) {
  const young = index === 8;
  return {
    id: `p${index}`,
    name: `選手${index}`,
    pos,
    positions: { [pos]: 100 },
    age: young ? 21 : 29,
    potential: young ? 95 : 60,
    condition: 100,
    form: index === 0 ? 70 : 50,
    isPitcher: false,
    injuryDaysLeft: 0,
    batting: {
      contact: 55 + index,
      power: 50 + index,
      eye: 52,
      speed: 50,
      defense: 55,
      arm: 50,
      catching: 50,
    },
    stats: {
      PA: young ? 10 : 120,
      AB: young ? 9 : 105,
      H: young ? 2 : 30,
      D: 0,
      T: 0,
      HR: young ? 0 : 8,
      BB: young ? 1 : 12,
      HBP: 0,
      SF: 0,
      K: 10,
      battedBallProfile: { bip: 0, recent: { bip: 0 } },
    },
  };
}

function makeTeam(policyId = 'development') {
  return {
    id: 'T1',
    name: 'Test',
    league: 'セ',
    players: POSITIONS.map(makeBatter),
    farm: [],
    dhEnabled: true,
    rosterDhMode: true,
    managementPolicyId: policyId,
    managementTraitId: 'youth',
  };
}

describe('management policy engine', () => {
  it('gives a young high-potential player more value under development policy', () => {
    const developmentTeam = makeTeam('development');
    const resultsTeam = makeTeam('results');
    const youngDevelopment = developmentTeam.players[8];
    const youngResults = resultsTeam.players[8];

    const development = evaluateBatterForPolicy(youngDevelopment, developmentTeam, {
      teams: [developmentTeam],
    });
    const results = evaluateBatterForPolicy(youngResults, resultsTeam, {
      teams: [resultsTeam],
    });

    expect(development.total).toBeGreaterThan(results.total);
  });

  it('uses the same policy engine to build a complete, unique lineup', () => {
    const team = makeTeam();
    const entries = buildAutoLineupEntries(team, {
      teams: [team],
      rosterDhMode: true,
    });
    const managed = applyManagementPolicy(team, {
      teams: [team],
      gameDay: 7,
      force: true,
      includeRosterChanges: false,
    });

    expect(entries).toHaveLength(9);
    expect(new Set(entries.map((entry) => entry.id)).size).toBe(9);
    expect(managed.lineup).toHaveLength(9);
    expect(managed.managementMeta.lastDecision).toContain('育成重視');
  });

  it('re-evaluates form policy faster and distributes CPU identities', () => {
    expect(MANAGEMENT_POLICIES.form.lineupInterval).toBe(3);
    expect(MANAGEMENT_POLICIES.data.lineupInterval).toBe(7);

    const ids = ['G', 'T', 'D', 'DB', 'C', 'S', 'B', 'M', 'E', 'H', 'F', 'L'];
    const defaults = new Set(ids.map((id) => getManagementPolicy({ id }).id));
    expect(defaults.size).toBeGreaterThanOrEqual(4);
  });
});
