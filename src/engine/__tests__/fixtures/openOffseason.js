import { budgetForecastWorld, closeFinance } from './budgetForecast';
import { initPlayoff, advancePlayoff, recordSeriesGame, encodePlayoff, postseasonClosingDate } from '../../playoff';

// Existing producers, not a year-transition implementation. The future annual
// Worker must supply this complete snapshot; public gameplay remains legacy.
export function completedPlayoff(teams, year, schedule, extended = false) {
  let p = initPlayoff(teams, { year, ...(schedule ? { schedule } : {}) });
  while (p.phase !== 'champion') {
    const key = p.phase, s = p[key], n = s.games.length + 1;
    const score = extended && key === 'jpSeries'
      ? n <= 7 ? { my: 0, opp: 0 } : n % 2 === 0 ? { my: 1, opp: 0 } : { my: 0, opp: 1 }
      : { my: 1, opp: 0 };
    p = advancePlayoff({ ...p, [key]: recordSeriesGame(s, { score }) });
  }
  return encodePlayoff(p);
}

export function closedPostseasonWorld(source, { extended = false } = {}) {
  return closeNativePostseason(budgetForecastWorld(source), { extended });
}

export function closeNativePostseason(w, { extended = false } = {}) {
  // Each scheduled home club wins: counters follow all 143 actual rounds.
  w.teams = w.teams.map(t => ({ ...t, wins: 0, losses: 0, draws: 0 }));
  for (const round of w.schedule.slice(1, 144)) for (const m of round.matchups) {
    w.teams.find(t => t.id === m.homeId).wins++;
    w.teams.find(t => t.id === m.awayId).losses++;
  }
  w.teams = w.teams.map(t => ({ ...t, clubFinance: closeFinance(t, w.year, w.teams) }));
  w.offseasonPlan = { version: 1, year: w.year, myId: w.myId, stage: 'postseason', resumeScreen: 'retire_phase',
    playoff: completedPlayoff(w.teams, w.year, w.schedule, extended) };
  w.gameDay = 144;
  w.contractEconomy.cycle.stage = 'postseason';
  w.contractEconomy.clock = { season: w.year, phase: 'season', offseasonTurn: 0,
    date: postseasonClosingDate(w.offseasonPlan.playoff, { year: w.year, teams: w.teams, schedule: w.schedule }) };
  return w;
}
