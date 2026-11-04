import { own, protect, run, settle, spring } from '../faPersonnelFixtures';
import { createAnnualNewGameWorld, fromAnnualState, toAnnualState } from '../../contractEconomy';
import { economyPolicy } from './economyWorld';

// Real settled FA/personnel history, awaiting spring roster adoption.
export function pendingDevelopmentFixture(kind) {
  const myId = kind === 'fa' ? 0 : 1;
  const s = spring(run(protect(), settle()));
  own(s, 0, myId, { name: '育成選手', salary: 240, isIkusei: true, 育成: true, age: 20 },
    { signedSeason: 2027, annualSalaryManYen: 240, registrationType: 'development' });
  const teams = s.teams.map(t => ({ ...t, name: `球団${t.id}`, players: t.players.map(p => ({ ...p, contractYearsLeft: 3 })),
    farm: t.farm.map(p => ({ ...p, contractYearsLeft: 3 })) }));
  const policy = economyPolicy(teams, 2027, 200000);
  const w = createAnnualNewGameWorld({ teams, faPool: [], myId, saveId: 'pending-development', season: 2027,
    policy, randomRoot: { algorithmVersion: 1, seed: 'pending-development' } });
  w.contractEconomy.engine = { ...w.contractEconomy.engine,
    ...Object.fromEntries(['transactions', 'acquisitions', 'faProtectionLists', 'faPersonnelMoves', 'faCompensationStandings'].map(k => [k, s[k]])),
    spending: { ...s.spending, authorizations: [...s.spending.authorizations.filter(r => r.season === 2026), ...policy.authorizations] } };
  // Imported historical ledger has no native initial-sign birth evidence.
  delete w.contractEconomy.engine.faExerciseOrigins; delete w.contractEconomy.faExerciseBirth;
  w.contractEconomy.budgetPolicies = w.contractEconomy.engine.spending.authorizations.map(({ teamId, season, approvedManYen }) =>
    ({ teamId, season, approvedManYen, policyVersion: 'explicit-test-policy' }));
  return fromAnnualState(w, toAnnualState(w));
}
