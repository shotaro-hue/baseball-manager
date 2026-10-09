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

// Display-only snapshot. IDs are unique across owned rosters; players wins if
// a legacy save also contains the same ID in farm. Never mutate either roster.
export function summarizeContractSalaries(team) {
  const groups = [
    { key: 'active', label: '一軍支配下', amount: 0, count: 0, missingCount: 0, invalidCount: 0 },
    { key: 'farm', label: '二軍支配下', amount: 0, count: 0, missingCount: 0, invalidCount: 0 },
    { key: 'development', label: '育成', amount: 0, count: 0, missingCount: 0, invalidCount: 0 },
  ];
  const seen = new Set();
  const entries = [];
  for (const [roster, groupIndex] of [[team.players ?? [], 0], [team.farm ?? [], 1]]) {
    for (const player of roster) {
      // Missing IDs must not collapse distinct players into one contract.
      const identity = player.id ?? player;
      if (seen.has(identity)) continue;
      seen.add(identity);
      const group = groups[player.育成 ? 2 : groupIndex];
      const salary = player.salary;
      const status = salary == null ? 'missing'
        : typeof salary === 'number' && Number.isFinite(salary) && salary >= 0 ? 'valid' : 'invalid';
      group.count++;
      if (status === 'valid') group.amount += salary;
      else group[status === 'missing' ? 'missingCount' : 'invalidCount']++;
      entries.push({ player, group: group.key, label: group.label, status });
    }
  }
  const missingCount = groups.reduce((sum, g) => sum + g.missingCount, 0);
  const invalidCount = groups.reduce((sum, g) => sum + g.invalidCount, 0);
  return { groups, entries,
    total: groups.reduce((sum, g) => sum + g.amount, 0),
    missingCount, invalidCount, complete: missingCount + invalidCount === 0,
    ranked: entries.filter(e => e.status === 'valid').sort((a, b) => b.player.salary - a.player.salary),
  };
}
