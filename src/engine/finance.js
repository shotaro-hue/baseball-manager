import {
  FINANCE_BUDGET_FACTOR_MAX,
  FINANCE_BUDGET_FACTOR_MIN,
  FINANCE_MERCH_RATE,
  FINANCE_SPONSOR_BY_WINS,
  FINANCE_TICKET_LEVEL_MULT,
  TEAM_STADIUM_CAPACITY,
} from '../constants';
import { clamp } from '../utils';

/* ═══════════════════════════════════════════════
   FINANCE
═══════════════════════════════════════════════ */

export function calcRevenue(team) {
  const g = team.wins + team.losses;
  const wr = g > 0 ? team.wins / g : 0.5;
  const lvl = team.stadiumLevel ?? 0;
  const mult = FINANCE_TICKET_LEVEL_MULT[Math.min(lvl, FINANCE_TICKET_LEVEL_MULT.length - 1)];
  const budgetFactor = clamp(
    Math.sqrt(Math.max(team.budget ?? 0, 100000) / 450000),
    FINANCE_BUDGET_FACTOR_MIN,
    FINANCE_BUDGET_FACTOR_MAX,
  );
  const demand = budgetFactor * (0.82 + (team.popularity ?? 50) / 210 + wr * 0.42);
  const baseAvgTicketPrice = Math.round(900 * (0.9 + wr * 0.15 + (team.popularity ?? 50) / 500) * (0.96 + lvl * 0.08));
  const manualPriceRaw = Number(team.customAvgTicketPrice);
  const hasManualPrice = Number.isFinite(manualPriceRaw) && manualPriceRaw > 0;
  const avgTicketPrice = hasManualPrice ? Math.round(clamp(manualPriceRaw, 500, 5000)) : baseAvgTicketPrice; // 円/人
  const priceRatio = avgTicketPrice / Math.max(1, baseAvgTicketPrice);
  const priceAttendanceFactor = clamp(1 - (priceRatio - 1) * 0.48, 0.62, 1.18);
  const rawAttendance = 18500 * demand * (0.92 + lvl * 0.06) * priceAttendanceFactor;
  const stadiumCapacity = TEAM_STADIUM_CAPACITY[team.id] ?? 42000;
  const attendance = Math.round(clamp(rawAttendance, 11000, stadiumCapacity));
  const ticket = Math.round((avgTicketPrice * attendance) / 10000) * mult; // 万円
  const sponsor = FINANCE_SPONSOR_BY_WINS
    .slice()
    .reverse()
    .find((s) => team.wins >= s.minWin)?.perGame ?? FINANCE_SPONSOR_BY_WINS[0].perGame;
  return {
    ticket: Math.round(ticket),
    sponsor,
    merch: Math.round(ticket * FINANCE_MERCH_RATE),
    attendance,
    avgTicketPrice,
  };
}

// Read-only annual contract amounts (万円), independent of paid budget expenses.
export function calcContractPayroll(team) {
  const groups = [
    { key: 'active', label: '一軍支配下', count: 0, amount: 0, missingCount: 0, invalidCount: 0 },
    { key: 'farm', label: '二軍支配下', count: 0, amount: 0, missingCount: 0, invalidCount: 0 },
    { key: 'development', label: '育成', count: 0, amount: 0, missingCount: 0, invalidCount: 0 },
  ];
  // Resolve development classification across legacy duplicate copies first.
  const developmentIds = new Set([...(team?.players ?? []), ...(team?.farm ?? [])]
    .filter(player => player.育成).map(player => player.id ?? player));
  const seen = new Set();
  const entries = [];
  for (const [roster, players] of [['active', team?.players ?? []], ['farm', team?.farm ?? []]]) {
    for (const player of players) {
      const identity = player.id ?? player;
      if (seen.has(identity)) continue;
      seen.add(identity);
      const group = groups.find(g => g.key === (developmentIds.has(identity) ? 'development' : roster));
      const salaryStatus = player.salary == null ? 'missing'
        : Number.isFinite(player.salary) && player.salary >= 0 ? 'recorded' : 'invalid';
      group.count += 1;
      if (salaryStatus === 'recorded') group.amount += player.salary;
      else group[salaryStatus === 'missing' ? 'missingCount' : 'invalidCount'] += 1;
      entries.push({ player, category: group.key, categoryLabel: group.label, salaryStatus });
    }
  }
  // Sorting only the newly created entries preserves all source arrays/objects.
  entries.sort((a, b) => {
    if (a.salaryStatus !== 'recorded') return b.salaryStatus === 'recorded' ? 1 : 0;
    if (b.salaryStatus !== 'recorded') return -1;
    return b.player.salary - a.player.salary;
  });
  return {
    groups, entries,
    total: groups.reduce((sum, g) => sum + g.amount, 0),
    missingCount: groups.reduce((sum, g) => sum + g.missingCount, 0),
    invalidCount: groups.reduce((sum, g) => sum + g.invalidCount, 0),
  };
}
