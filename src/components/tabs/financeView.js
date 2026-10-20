import { SEASON_GAMES } from '../../constants';
import { calcRevenue } from '../../engine/finance';
import { calcClubGameFinance, forecastClubFinance, stadiumUpgradeCosts, startClubFinance } from '../../engine/clubFinance';
import { regularSeasonProgress } from '../../engine/seasonProgress';
import { fmtSal } from '../../utils';

const sum = values => Object.values(values).reduce((a, b) => a + b, 0);
export const range = (a, b = a) => ({ min: Math.min(a, b), max: Math.max(a, b) });
export const moneyText = value => Number.isFinite(value) ? fmtSal(value) : '— 未記録';
export const rangeText = (value, format = fmtSal) => value && Number.isFinite(value.min) && Number.isFinite(value.max)
  ? value.min === value.max ? format(value.min) : `${format(value.min)} 〜 ${format(value.max)}` : '— 算出不可';
export const payrollText = total => total.missing + total.invalid > 0
  ? `確認済み ${fmtSal(total.amount)}（集計不完全）` : fmtSal(total.amount);

// Read-only scenarios: drafts never enter the game state or the save payload.
export function financeView(team, schedule) {
  try {
    const forecast = forecastClubFinance(team, schedule);
    if (!forecast) {
      const quote = calcRevenue(team), progress = regularSeasonProgress(team);
      const recorded = Number.isFinite(team.revenueThisSeason) ? team.revenueThisSeason : null;
      return { status: 'legacy', quote, hostRevenue: quote.ticket + quote.merch, forecast: null,
        legacyAnnual: (quote.ticket + quote.sponsor + quote.merch) * SEASON_GAMES,
        legacyProjection: recorded != null && progress.valid && progress.playedGames > 0
          ? Math.round(recorded / progress.playedGames * SEASON_GAMES) : null,
        actual: { revenue: recorded, operatingCosts: null, operatingSurplus: null } };
    }
    const quote = calcClubGameFinance(team, true, Math.min(SEASON_GAMES, forecast.gamesPlayed + 1));
    const f = team.clubFinance;
    return { status: 'ready', forecast, quote, hostRevenue: quote.income.ticket + quote.income.food + quote.income.merch,
      actual: { revenue: sum(f.income), operatingCosts: sum(f.costs), operatingSurplus: f.operatingSurplus,
        income: f.income, costs: f.costs } };
  } catch (error) {
    return { status: 'invalid', error: error.message, forecast: null, quote: null,
      actual: { revenue: null, operatingCosts: null, operatingSurplus: null } };
  }
}

export function ticketPreview(team, schedule, input) {
  const raw = String(input).trim(), price = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(price) || price < 500 || price > 5000)
    return { ok: false, error: '500〜5,000円の整数を入力してください。' };
  const before = financeView(team, schedule), after = financeView({ ...team, customAvgTicketPrice: price }, schedule);
  if (!before.quote || !after.quote) return { ok: false, error: '収支データを確認できないため比較できません。' };
  return { ok: true, price, before, after };
}

export function stadiumPreview(team, schedule) {
  const level = team.stadiumLevel ?? 0;
  if (level >= 3) return { max: true };
  const cost = stadiumUpgradeCosts(team)[level];
  const budgetAfter = Number.isFinite(team.budget) && Number.isFinite(cost) ? team.budget - cost : null;
  const base = { level, cost, budgetAfter, affordable: budgetAfter != null && budgetAfter >= 0 };
  if (financeView(team, schedule).status !== 'ready') return { ...base, available: false };
  // A full-year, current-conditions comparison. Keep the actual annual contracts
  // and all demand inputs. Only the scenario ledger is reset; the saved one is not.
  const fresh = startClubFinance(team, team.clubFinance.year);
  const annualTeam = { ...fresh, clubFinance: { ...fresh.clubFinance, annual: team.clubFinance.annual } };
  const before = financeView(annualTeam, schedule);
  const after = financeView({ ...annualTeam, stadiumLevel: level + 1 }, schedule);
  if (!before.quote || !after.quote) return { ...base, available: false };
  const homes = before.forecast.homeGames;
  const scale = delta => range(delta * homes.min, delta * homes.max);
  const attendanceDelta = scale(after.quote.attendance - before.quote.attendance);
  const revenueDelta = scale(after.hostRevenue - before.hostRevenue);
  const surplusDelta = scale(after.quote.operatingSurplus - before.quote.operatingSurplus);
  const payback = surplusDelta.min > 0 ? range(cost / surplusDelta.max, cost / surplusDelta.min) : null;
  return { ...base, available: true, before, after, attendanceDelta, revenueDelta, surplusDelta, payback };
}
