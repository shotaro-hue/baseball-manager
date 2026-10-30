import { createAnnualNewGameWorld } from '../../contractEconomy';
import { createSeasonContract } from '../../seasonContract';

export function economyPolicy(teams, season = 2026, approvedManYen = 50000) {
  const pairs = teams.flatMap(t => Array.from({ length: 8 }, (_, i) => ({ teamId: t.id, season: season + i })));
  return {
    authorizations: pairs.map(pair => ({ ...pair, approvedManYen, minimumRosterReserveManYen: 0 })),
    rosterRequirements: pairs.map(pair => ({ ...pair, requiredControlledCount: 1 })),
    budgetPolicies: pairs.map(pair => ({ ...pair, policyVersion: 'explicit-test-policy', approvedManYen })),
  };
}
export function economyFixture() {
  const teams = [{ id: 0, budget: 999999, players: [{ id: 0, name: 'A', pos: '一塁手', salary: 1000, contractYearsLeft: 1, contractYears: 7 }], farm: [] },
    { id: 1, budget: 123, players: [{ id: 'b', name: 'B', pos: '一塁手', salary: 1000, contractYearsLeft: 1 }], farm: [] }];
  const world = createAnnualNewGameWorld({ teams, faPool: [{ id: 'free', name: 'FA', pos: '一塁手', salary: 1000, isForeign: true }],
    myId: 0, saveId: 'test-save', season: 2026, policy: economyPolicy(teams), randomRoot: { algorithmVersion: 1, seed: 'test-seed' } });
  return { ...world, schedule: [null, { date: { month: 7, day: 16 } }],
    contractEconomy: { ...world.contractEconomy, clock: { season: 2026, phase: 'season', date: '2026-07-16', offseasonTurn: 0 } } };
}
export function renewalEnvelope(world, { id = 0, salary = 1600, guaranteed = true } = {}) {
  return { saveId: world.saveId, epoch: world.contractEconomy.epoch, baseRevision: world.contractEconomy.revision,
    transaction: { id, type: 'offer-renewal', contractId: world.teams[0].players[0].contractId,
      proposal: { id: 'renewal', type: 'sign', teamId: 0, effectiveDate: '2027-02-01',
        contract: createSeasonContract({ contractId: 'next-0', playerId: 0, signedSeason: 2026,
          agreementPhase: 'season', purpose: 'renewal', termYears: 3, annualSalaryManYen: salary,
          registrationType: 'controlled', guaranteed }) } } };
}
export const freezeEconomy = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freezeEconomy); Object.freeze(value); }
  return value;
};
