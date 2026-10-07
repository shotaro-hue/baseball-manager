import { rngf } from '../utils';
import { INJURY_HISTORY_MAX } from '../constants';
import { applyGameStatsFromLog, applyPostGameCondition } from './postGame';
import { applyPopularityDelta } from './fanSentiment';
import { calcRevenue } from './finance';

function tickCooldowns(players) {
  return players.map(p => (p.registrationCooldownDays ?? 0) > 0
    ? { ...p, registrationCooldownDays: Math.max(0, p.registrationCooldownDays - 1) } : p);
}

function applyDefenseCoachRecovery(players, coaches) {
  const bonus = (coaches || []).filter(c => c.type === 'defense').reduce((n, c) => n + (c.bonus || 0), 0);
  if (!bonus) return players;
  return players.map(p => {
    if (!p.injuryDaysLeft || rngf(0, 1) >= bonus * .1) return p;
    const days = Math.max(0, p.injuryDaysLeft - 1);
    return { ...p, injuryDaysLeft: days, injury: days > 0 ? p.injury : null, injuryPart: days > 0 ? p.injuryPart : null };
  });
}

// Perspective describes result.score/log, whereas home describes the actual
// defending inning. Neither decides which club receives lifecycle updates.
// playerRules is supplied by the caller to preserve lazy loading in React.
// This regular-season operation must not be used for playoffs or All-Star games.
export function applyRegularSeasonTeamUpdate(team, result, { isFirstTeam, isHomeTeam, gameDay, year }, playerRules) {
  const scoreFor = isFirstTeam ? result.score.my : result.score.opp;
  const scoreAgainst = isFirstTeam ? result.score.opp : result.score.my;
  const won = scoreFor > scoreAgainst, drew = scoreFor === scoreAgainst;
  const log = result.log || [];
  let players = applyGameStatsFromLog(team.players, log, isFirstTeam, won, gameDay);
  players = applyPostGameCondition(players, log, isFirstTeam, gameDay, isHomeTeam);
  players = playerRules.tickPositionTraining(playerRules.tickInjuries(players));
  players = tickCooldowns(players.map(p => ({ ...p, daysOnActiveRoster: (p.daysOnActiveRoster ?? 0) + 1 })));
  players = applyDefenseCoachRecovery(players, team.coaches);
  const injuries = playerRules.checkForInjuries(players, year);
  const injuriesById = new Map(injuries.map(i => [i.id, i]));
  players = players.map(p => {
    const injury = injuriesById.get(p.id);
    return injury ? { ...p, injury: injury.type, injuryDaysLeft: injury.days, injuryPart: injury.part,
      injuryHistory: [...(p.injuryHistory || []), { part: injury.part, year }].slice(-INJURY_HISTORY_MAX) } : p;
  });
  const updated = { ...team, players, farm: tickCooldowns(playerRules.tickInjuries(team.farm || [])),
    wins: (team.wins ?? 0) + (won ? 1 : 0), losses: (team.losses ?? 0) + (!won && !drew ? 1 : 0),
    draws: (team.draws ?? 0) + (drew ? 1 : 0), rf: (team.rf ?? 0) + scoreFor, ra: (team.ra ?? 0) + scoreAgainst,
    rotIdx: (team.rotIdx ?? 0) + 1, ...applyPopularityDelta(team, won, drew) };
  // Preserve the game's per-played-game revenue model. Home-only revenue is a
  // separate economy change; here every participating club follows one rule.
  const revenue = calcRevenue(updated);
  const total = revenue.ticket + revenue.sponsor + revenue.merch;
  updated.budget = (team.budget ?? 0) + total;
  updated.revenueThisSeason = (team.revenueThisSeason ?? 0) + total;
  return { team: updated, injuries };
}
