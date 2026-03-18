import { BATCH, SEASON_GAMES } from '../constants';

/* ═══════════════════════════════════════════════
   FINANCE
═══════════════════════════════════════════════ */

export function calcRevenue(team) {
  const g = team.wins + team.losses;
  const wr = g > 0 ? team.wins / g : 0.5;
  const lvl = team.stadiumLevel ?? 0;
  const STADIUM_MULT = [1.0, 1.25, 1.6, 2.0];
  const mult = STADIUM_MULT[Math.min(lvl, 3)];
  const ticket = Math.round(team.budget * 0.3 * (0.6 + team.popularity / 200 + wr * 0.4) / SEASON_GAMES * 1000 * mult);
  const sponsor = [
    { minWin: 0, v: 5000 }, { minWin: 30, v: 15000 },
    { minWin: 60, v: 40000 }, { minWin: 90, v: 90000 },
  ].slice().reverse().find((s) => team.wins >= s.minWin)?.v * 10000 || 50000;
  return { ticket, sponsor: Math.round(sponsor / SEASON_GAMES), merch: Math.round(ticket * 0.08) };
}
