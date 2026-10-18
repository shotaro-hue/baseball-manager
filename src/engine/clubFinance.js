import { SEASON_GAMES, TEAM_STADIUM_CAPACITY, TEAM_DEFS,
  OWNER_TRUST_BUDGET_LOW, OWNER_TRUST_BUDGET_HIGH, OWNER_TRUST_FACTOR_LOW, OWNER_TRUST_FACTOR_HIGH } from '../constants';
import { CLUB_FINANCE_PROFILES, CLUB_STADIUM_UPGRADE_COSTS, LEGACY_STADIUM_UPGRADE_COSTS } from '../data/clubFinanceProfiles';
import { contractPayroll } from './contractPayroll';
import { clamp } from '../utils';

const INCOME_KEYS = ['ticket', 'food', 'merch', 'sponsor', 'broadcast', 'membership'];
const COST_KEYS = ['fixed', 'matchday', 'goods'];
const TEAM_IDS = new Set(TEAM_DEFS.map(team => team.id));
const empty = keys => Object.fromEntries(keys.map(key => [key, 0]));
const sum = object => Object.values(object).reduce((a, b) => a + b, 0);
const count = n => Number.isSafeInteger(n) && n >= 0;
const money = n => Number.isSafeInteger(n) && n >= 0;
const fail = () => { throw new Error('球団収支データを確認できません。保存データを読み直してください。'); };
const profile = team => CLUB_FINANCE_PROFILES[team.id] ?? CLUB_FINANCE_PROFILES[0];
const portion = (annual, n) => Math.round(annual * n / SEASON_GAMES) - Math.round(annual * (n - 1) / SEASON_GAMES);

export function validateClubFinance(f) {
  if (f === undefined) return true;
  if (!f || f.version !== 1 || !Number.isInteger(f.year) || f.year < 1
    || !count(f.homeGames) || !count(f.awayGames) || f.homeGames + f.awayGames > SEASON_GAMES
    || !Array.isArray(f.postedRounds) || f.postedRounds.length !== f.homeGames + f.awayGames
    || new Set(f.postedRounds).size !== f.postedRounds.length
    || !f.postedRounds.every(n => Number.isInteger(n) && n >= 1 && n <= SEASON_GAMES)
    || !INCOME_KEYS.every(key => money(f.income?.[key])) || !COST_KEYS.every(key => money(f.costs?.[key]))
    || !['sponsor', 'broadcast', 'membership', 'fixedCost'].every(key => money(f.annual?.[key]))
    || f.operatingSurplus !== sum(f.income) - sum(f.costs)) fail();
  const n = f.postedRounds.length;
  for (const key of ['sponsor', 'broadcast', 'membership'])
    if (f.income[key] !== Math.round(f.annual[key] * n / SEASON_GAMES)) fail();
  if (f.costs.fixed !== Math.round(f.annual.fixedCost * n / SEASON_GAMES)) fail();
  return true;
}

export function startClubFinance(team, year) {
  if (!Number.isInteger(year) || year < 1) fail();
  const p = profile(team), pop = Number.isFinite(team.popularity) ? team.popularity : 50;
  const g = (team.wins || 0) + (team.losses || 0), wr = g ? team.wins / g : .5;
  const factor = clamp(1 + (pop - 50) * .003 + (wr - .5) * .1, .8, 1.2);
  const annual = Object.fromEntries(['sponsor', 'broadcast', 'membership'].map(key => [key, Math.round(p[key] * factor)]));
  annual.fixedCost = p.fixedCost;
  return { ...team, revenueThisSeason: 0, clubFinance: { version: 1, year, annual,
    income: empty(INCOME_KEYS), costs: empty(COST_KEYS), operatingSurplus: 0,
    homeGames: 0, awayGames: 0, postedRounds: [] } };
}

export function stadiumUpgradeCosts(team) {
  return team?.clubFinance ? CLUB_STADIUM_UPGRADE_COSTS : LEGACY_STADIUM_UPGRADE_COSTS;
}

export function calcClubGameFinance(team, isHomeTeam, index) {
  const f = team.clubFinance;
  validateClubFinance(f);
  if (!f || typeof isHomeTeam !== 'boolean' || !Number.isInteger(index) || index < 1 || index > SEASON_GAMES) fail();
  const p = profile(team), lvl = clamp(Number.isInteger(team.stadiumLevel) ? team.stadiumLevel : 0, 0, 3);
  const pop = Number.isFinite(team.popularity) ? team.popularity : 50;
  const games = (team.wins || 0) + (team.losses || 0), wr = games ? team.wins / games : .5;
  const basePrice = Math.round(p.ticketYield * (1 + lvl * .035));
  const manual = Number(team.customAvgTicketPrice);
  const avgTicketPrice = Number.isFinite(manual) && manual > 0 ? Math.round(clamp(manual, 500, 5000)) : basePrice;
  const demand = clamp(1 + (pop - 50) * .006 + (wr - .5) * .2, .65, 1.2);
  const attendance = isHomeTeam ? Math.round(clamp(p.attendance * demand * (1 + lvl * .02)
    * Math.pow(avgTicketPrice / basePrice, -1.25), 0, TEAM_STADIUM_CAPACITY[team.id] ?? 42000)) : 0;
  const income = { ticket: Math.round(attendance * avgTicketPrice / 10000),
    food: Math.round(attendance * p.foodYield * (1 + lvl * .02) / 10000),
    merch: Math.round(attendance * p.merchYield * (1 + lvl * .02) / 10000),
    ...Object.fromEntries(['sponsor', 'broadcast', 'membership'].map(key => [key, portion(f.annual[key], index)])) };
  const costs = { fixed: portion(f.annual.fixedCost, index), matchday: Math.round(attendance * 500 / 10000),
    goods: Math.round(income.food * .55 + income.merch * .45) };
  const revenue = sum(income), operatingCosts = sum(costs);
  return { income, costs, revenue, operatingCosts, operatingSurplus: revenue - operatingCosts, attendance, avgTicketPrice };
}

export function applyClubGameFinance(team, { year, gameDay, isHomeTeam }) {
  const f = team.clubFinance;
  validateClubFinance(f);
  if (!f || year !== f.year || !Number.isInteger(gameDay) || gameDay < 1 || gameDay > SEASON_GAMES
    || typeof isHomeTeam !== 'boolean') fail();
  if (f.postedRounds.includes(gameDay)) return team;
  const q = calcClubGameFinance(team, isHomeTeam, f.postedRounds.length + 1);
  const income = Object.fromEntries(INCOME_KEYS.map(key => [key, f.income[key] + q.income[key]]));
  const costs = Object.fromEntries(COST_KEYS.map(key => [key, f.costs[key] + q.costs[key]]));
  return { ...team, budget: team.budget + q.operatingSurplus, revenueThisSeason: sum(income),
    clubFinance: { ...f, income, costs, operatingSurplus: sum(income) - sum(costs),
      homeGames: f.homeGames + Number(isHomeTeam), awayGames: f.awayGames + Number(!isHomeTeam),
      postedRounds: [...f.postedRounds, gameDay] } };
}

export function forecastClubFinance(team, schedule) {
  const f = team?.clubFinance;
  if (f === undefined) return null;
  validateClubFinance(f);
  const posted = new Set(f.postedRounds), remaining = SEASON_GAMES - posted.size;
  let completeSchedule = true, homeRemaining = 0;
  for (let round = 1; round <= SEASON_GAMES; round++) {
    const matchups = schedule?.[round]?.matchups;
    if (!Array.isArray(matchups) || !matchups.every(m => m && TEAM_IDS.has(m.homeId)
      && TEAM_IDS.has(m.awayId) && m.homeId !== m.awayId)) { completeSchedule = false; continue; }
    const matches = matchups.filter(m => m.homeId === team.id || m.awayId === team.id);
    if (matches.length !== 1) { completeSchedule = false; continue; }
    if (!posted.has(round) && matches[0].homeId === team.id) homeRemaining++;
  }
  const minHomes = completeSchedule ? homeRemaining : clamp(71 - f.homeGames, 0, remaining);
  const maxHomes = completeSchedule ? homeRemaining : clamp(72 - f.homeGames, 0, remaining);
  // Only the host-dependent amounts use a per-home-game quote. Annual fixed
  // contracts use their exact unaccrued balances, not a rounded daily multiple.
  const q = calcClubGameFinance(team, true, Math.min(SEASON_GAMES, posted.size + 1));
  const estimate = homes => {
    const income = { ...f.income }, costs = { ...f.costs };
    for (const key of ['ticket', 'food', 'merch']) income[key] += q.income[key] * homes;
    for (const key of ['sponsor', 'broadcast', 'membership']) income[key] = f.annual[key];
    costs.fixed = f.annual.fixedCost;
    for (const key of ['matchday', 'goods']) costs[key] += q.costs[key] * homes;
    return { income, revenue: sum(income), costs, operatingCosts: sum(costs), operatingSurplus: sum(income) - sum(costs) };
  };
  const a = estimate(minHomes), b = estimate(maxHomes), range = (x, y) => ({ min: Math.min(x, y), max: Math.max(x, y) });
  return { completeSchedule, gamesPlayed: posted.size,
    homeGames: range(f.homeGames + minHomes, f.homeGames + maxHomes),
    revenue: range(a.revenue, b.revenue), operatingCosts: range(a.operatingCosts, b.operatingCosts),
    operatingSurplus: range(a.operatingSurplus, b.operatingSurplus),
    income: Object.fromEntries(INCOME_KEYS.map(key => [key, range(a.income[key], b.income[key])])) };
}

export function nextClubBudget(team, nextRoster, myId) {
  const baseBudget = TEAM_DEFS.find(t => t.id === team.id)?.budget ?? team.budget;
  const payroll = contractPayroll(nextRoster).total;
  if (payroll.missing || payroll.invalid) throw new Error('年俸の未記録・不正値を確認してください。');
  if (team.clubFinance) validateClubFinance(team.clubFinance);
  const surplus = team.clubFinance?.operatingSurplus ?? team.revenueThisSeason ?? 0;
  const salary = payroll.amount;
  const trust = team.ownerTrust ?? 50;
  const factor = team.id === myId ? (trust < OWNER_TRUST_BUDGET_LOW ? OWNER_TRUST_FACTOR_LOW
    : trust > OWNER_TRUST_BUDGET_HIGH ? OWNER_TRUST_FACTOR_HIGH : 1) : 1;
  return Math.max(Math.round(baseBudget * .5), Math.round((baseBudget + Math.round(surplus * .6) - salary) * factor));
}
