import {
  FINANCE_BUDGET_FACTOR_MAX,
  FINANCE_BUDGET_FACTOR_MIN,
  FINANCE_MERCH_RATE,
  FINANCE_SPONSOR_BY_WINS,
  FINANCE_TICKET_LEVEL_MULT,
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
  const attendance = Math.round(clamp(18500 * demand * (0.92 + lvl * 0.06), 14000, 42000));
  const avgTicketPrice = Math.round(900 * (0.9 + wr * 0.15 + (team.popularity ?? 50) / 500) * (0.96 + lvl * 0.08)); // 円/人
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
