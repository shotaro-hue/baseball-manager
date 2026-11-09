import { TEAM_DEFS } from '../../../constants';
import { createAnnualNewGameWorld, fromAnnualState, toAnnualState } from '../../contractEconomy';
import { quoteAnnualBudgetPolicy } from '../../annualBudgetPolicy';
import { startClubFinance, applyClubGameFinance } from '../../clubFinance';
import { generateSeasonSchedule } from '../../scheduleGen';
import { economyPolicy } from './economyWorld';

export const forecastSettings = (smoothingYears = 1) => ({ policyVersion: 'forecast-test', allocationPercent: 50,
  smoothingYears, maxChangePercent: 100, supports: TEAM_DEFS.map(t => ({ teamId: t.id, supportManYen: 0 })) });

// Explicit test approvals are not a proposed production policy or calibration.
export function budgetForecastWorld(source) {
  const teams = source ?? TEAM_DEFS.map(t => startClubFinance({ ...t, popularity: 50, wins: 0, losses: 0, draws: 0,
    players: [{ id: `budget-${t.id}`, name: 'Player', pos: '捕手', salary: 1000, contractYearsLeft: 3, stats: {} }], farm: [] }, 2026));
  const w = createAnnualNewGameWorld({ teams, faPool: [], myId: 0, saveId: 'budget-forecast', season: 2026,
    policy: economyPolicy(teams, 2026, 1000000), randomRoot: { algorithmVersion: 1, seed: 'budget-forecast' } });
  w.schedule = generateSeasonSchedule(w.year, w.teams);
  const q = quoteAnnualBudgetPolicy(w, { ...forecastSettings(), forecasts: teams.flatMap(t => Array.from({ length: 8 }, (_, i) => ({
    teamId: t.id, season: 2026 + i, source: 'profile', operatingSurplusesManYen: [2000000],
    supportManYen: 0, previousApprovedManYen: null,
  }))) });
  w.contractEconomy.budgetPolicies = q.budgetPolicies;
  w.contractEconomy.engine.spending.authorizations = q.authorizations;
  w.contractEconomy.engine.rosterRequirements = q.rosterRequirements;
  return fromAnnualState(w, toAnnualState(w));
}

export function closeFinance(team, season = 2026, teams = TEAM_DEFS) {
  const schedule = generateSeasonSchedule(season, teams);
  let t = startClubFinance(team, season);
  for (let day = 1; day <= 143; day++) t = applyClubGameFinance(t, { year: season, gameDay: day,
    isHomeTeam: schedule[day].matchups.some(m => m.homeId === team.id) });
  return t.clubFinance;
}

// A valid zero/deficit observation makes arithmetic expectations independent
// of the profile predictor; real production receipts are exercised separately.
export function observedFinance(team, season, surplus = 0) {
  const f = closeFinance(team, season);
  return { ...f, annual: { sponsor: 0, broadcast: 0, membership: 0, fixedCost: 0 },
    income: { ticket: Math.max(0, surplus), food: 0, merch: 0, sponsor: 0, broadcast: 0, membership: 0 },
    costs: { fixed: 0, matchday: Math.max(0, -surplus), goods: 0 }, operatingSurplus: surplus };
}
