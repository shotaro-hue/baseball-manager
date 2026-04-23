import {
  FINANCE_BUDGET_FACTOR_MAX,
  FINANCE_BUDGET_FACTOR_MIN,
  FINANCE_MERCH_RATE,
  FINANCE_SPONSOR_BY_WINS,
  FINANCE_TICKET_BASE_PER_GAME,
  FINANCE_TICKET_LEVEL_MULT,
  SEASON_GAMES,
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
  const ticket = Math.round(
    FINANCE_TICKET_BASE_PER_GAME
      * budgetFactor
      * (0.75 + (team.popularity ?? 50) / 220 + wr * 0.45)
      * mult,
  );
  const sponsor = FINANCE_SPONSOR_BY_WINS
    .slice()
    .reverse()
    .find((s) => team.wins >= s.minWin)?.perGame ?? FINANCE_SPONSOR_BY_WINS[0].perGame;
  return { ticket, sponsor, merch: Math.round(ticket * FINANCE_MERCH_RATE) };
}
