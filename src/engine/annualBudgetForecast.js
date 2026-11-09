import { TEAM_DEFS, SEASON_GAMES } from '../constants';
import { toAnnualState } from './contractEconomy';
import { annualBudgetHorizon, quoteNextAnnualBudgetPolicy } from './annualBudgetPolicy';
import { validateClubFinance, startClubFinance, forecastClubFinance } from './clubFinance';
import { generateSeasonSchedule } from './scheduleGen';

const fail = () => { throw new Error('翌年度予算の全球団・収支証跡・明示policyを確認してください。'); };
const money = n => Number.isSafeInteger(n) && n >= 0;
const pair = (teamId, season) => JSON.stringify([teamId, season]);
const total = values => {
  const sum = values.reduce((n, v) => n + BigInt(v), 0n);
  if (sum < -BigInt(Number.MAX_SAFE_INTEGER) || sum > BigInt(Number.MAX_SAFE_INTEGER)) fail();
  return Number(sum);
};

function recordedPolicy(world, teams) {
  const rows = teams.map(t => world.contractEconomy.budgetPolicies.find(p => p.teamId === t.id && p.season === world.year));
  const fields = ['policyVersion', 'allocationPercent', 'smoothingYears', 'maxChangePercent'];
  if (rows.some(p => p?.kind !== 'annual-budget-approval' || !p.inputsRecorded)
    || fields.some(field => rows.some(p => p[field] !== rows[0][field]))) fail();
  return { ...Object.fromEntries(fields.map(k => [k, rows[0][k]])),
    supports: rows.map(p => ({ teamId: p.teamId, supportManYen: p.supportManYen })) };
}

// A deterministic, read-only producer. Evidence is a return value for review,
// not another saved finance ledger or a native boundary transaction receipt.
export function forecastNextAnnualBudget(world, { policy: inputPolicy, financeHistory = [] } = {}) {
  const annual = toAnnualState(world); // Includes all income/contract/approval validation.
  const teams = [...world.teams].sort((a, b) => a.id - b.id);
  if (teams.length !== TEAM_DEFS.length || teams.some((t, i) => t.id !== TEAM_DEFS[i].id || t.league !== TEAM_DEFS[i].league)) fail();
  const settings = inputPolicy === undefined ? recordedPolicy(world, teams) : inputPolicy;
  if (!Number.isInteger(settings?.smoothingYears) || settings.smoothingYears < 1 || settings.smoothingYears > 3
    || !Array.isArray(settings.supports) || settings.supports.length !== teams.length || !Array.isArray(financeHistory)) fail();
  const supports = new Map();
  for (const row of settings.supports) {
    if (!row || !teams.some(t => t.id === row.teamId) || supports.has(row.teamId) || !money(row.supportManYen)) fail();
    supports.set(row.teamId, row.supportManYen);
  }
  const budgetSeason = world.year + 1;
  const endSeason = annualBudgetHorizon({ ...annual.spending, budgetSeason });
  if (budgetSeason - settings.smoothingYears < 1) fail();
  const finances = new Map();
  const acceptFinance = (teamId, finance, historical) => {
    validateClubFinance(finance);
    if (!finance || !Number.isSafeInteger(finance.operatingSurplus)
      || (historical ? finance.year >= world.year || finance.postedRounds.length !== SEASON_GAMES : finance.year !== world.year)) fail();
    const key = pair(teamId, finance.year);
    if (finances.has(key)) fail();
    finances.set(key, finance);
  };
  for (const t of teams) if (t.clubFinance !== undefined) acceptFinance(t.id, t.clubFinance, false);
  for (const row of financeHistory) {
    if (!row || !teams.some(t => t.id === row.teamId)) fail();
    acceptFinance(row.teamId, row.finance, true);
  }
  const income = new Map();
  for (const row of annual.incomeReceipts) if (row.kind === 'retirement-game') {
    const key = pair(row.teamId, row.season), list = income.get(key) ?? [];
    list.push(row); income.set(key, list);
  }
  const schedules = new Map(), samples = new Map();
  const sample = (team, season) => {
    const key = pair(team.id, season);
    if (samples.has(key)) return samples.get(key);
    const finance = finances.get(key);
    let source, basis, range, completeSchedule;
    if (finance?.postedRounds.length === SEASON_GAMES) {
      source = 'observed'; basis = 'club-finance'; completeSchedule = true;
      range = { min: finance.operatingSurplus, max: finance.operatingSurplus };
    } else {
      source = 'estimated';
      let forecast;
      if (finance) {
        basis = 'remaining-season';
        forecast = forecastClubFinance({ ...team, clubFinance: finance }, world.schedule);
      } else {
        basis = 'profile';
        if (!schedules.has(season)) schedules.set(season, generateSeasonSchedule(season, teams));
        // Hold known commercial conditions, use neutral future performance.
        const normal = startClubFinance({ ...team, wins: 0, losses: 0, draws: 0 }, season);
        forecast = forecastClubFinance(normal, schedules.get(season));
      }
      range = forecast.operatingSurplus; completeSchedule = forecast.completeSchedule;
    }
    if (![range.min, range.max].every(Number.isSafeInteger) || range.min > range.max) fail();
    const receipts = [...(income.get(key) ?? [])].sort((a, b) => {
      const x = JSON.stringify(a.id), y = JSON.stringify(b.id);
      return x < y ? -1 : x > y ? 1 : 0;
    });
    const retirementIncomeManYen = total(receipts.map(r => r.amountManYen));
    const value = { season, source, basis, operatingSurplusManYen: range.min, range: { ...range }, completeSchedule,
      retirementIncomeManYen, incomeReceiptIds: receipts.map(r => r.id),
      reviewSurplusManYen: total([range.min, retirementIncomeManYen]) };
    samples.set(key, value);
    return value;
  };
  const forecasts = [], evidence = [];
  for (const team of teams) for (let season = budgetSeason; season <= endSeason; season++) {
    const observations = Array.from({ length: settings.smoothingYears }, (_, i) => sample(team, season - settings.smoothingYears + i));
    const previous = season === budgetSeason
      ? world.contractEconomy.budgetPolicies.find(p => p.teamId === team.id && p.season === world.year)?.approvedManYen ?? null : null;
    forecasts.push({ teamId: team.id, season, source: observations.every(s => s.source === 'observed') ? 'observed' : 'profile',
      operatingSurplusesManYen: observations.map(s => s.reviewSurplusManYen),
      supportManYen: supports.get(team.id), previousApprovedManYen: previous });
    evidence.push({ teamId: team.id, season, samples: observations });
  }
  const policy = { policyVersion: settings.policyVersion, allocationPercent: settings.allocationPercent,
    smoothingYears: settings.smoothingYears, maxChangePercent: settings.maxChangePercent, forecasts };
  const quote = quoteNextAnnualBudgetPolicy(world, policy);
  return { budgetSeason, endSeason, policy, evidence, quote };
}
