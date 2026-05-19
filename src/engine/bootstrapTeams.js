import { buildTeam } from './playerCore';
import { buildRealTeam } from './realplayer';
import { optimizeTeamForGameStart } from './rosterAutomation';
import { NPB2025_ROSTERS } from '../data/npb2025';
import { TEAM_DEFS } from '../constants';

const STATE_RECENT_CAREER_LOG_YEARS = 3;
const STATE_MAX_SPRAY_POINTS = 40;
const STATE_MAX_BATTED_BALL_EVENTS = 80;

function slimPlayerForState(player) {
  if (!player || typeof player !== 'object') return player;
  const stats = player.stats && typeof player.stats === 'object' ? player.stats : {};
  const recentCareerLog = Array.isArray(player.recentCareerLog)
    ? player.recentCareerLog.slice(-STATE_RECENT_CAREER_LOG_YEARS)
    : [];
  return {
    ...player,
    careerLog: [],
    recentCareerLog,
    stats: {
      ...stats,
      sprayPoints: Array.isArray(stats.sprayPoints)
        ? stats.sprayPoints.slice(-STATE_MAX_SPRAY_POINTS)
        : [],
      battedBallEvents: Array.isArray(stats.battedBallEvents)
        ? stats.battedBallEvents.slice(-STATE_MAX_BATTED_BALL_EVENTS)
        : [],
    },
  };
}

function slimTeamForState(team) {
  if (!team || typeof team !== 'object') return team;
  return {
    ...team,
    players: Array.isArray(team.players)
      ? team.players.map(slimPlayerForState)
      : [],
    farm: Array.isArray(team.farm) ? team.farm.map(slimPlayerForState) : [],
  };
}

export function createInitialTeams() {
  return TEAM_DEFS.map((def) => {
    const rawTeam = NPB2025_ROSTERS[def.id]
      ? buildRealTeam(def, NPB2025_ROSTERS[def.id])
      : buildTeam(def);
    const team = optimizeTeamForGameStart(rawTeam);
    const nonPitcherIds = (team.players || [])
      .filter((player) => !player.isPitcher)
      .map((player) => player.id);
    team.lineupNoDh = (team.lineupNoDh || team.lineup || nonPitcherIds)
      .filter((id) => nonPitcherIds.includes(id))
      .slice(0, 8);
    team.lineupDh = (team.lineupDh || team.lineup || nonPitcherIds)
      .filter((id) => nonPitcherIds.includes(id))
      .slice(0, 9);
    team.rosterDhMode = team.rosterDhMode ?? team.dhEnabled ?? false;
    team.lineup = (team.rosterDhMode ? team.lineupDh : team.lineupNoDh).slice();
    team.history = [];
    return slimTeamForState(team);
  });
}
