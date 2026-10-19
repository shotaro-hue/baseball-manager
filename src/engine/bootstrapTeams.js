import { buildTeam } from './playerCore';
import { buildRealTeam } from './realplayer';
import { optimizeTeamForGameStart } from './rosterAutomation';
import { NPB2025_ROSTERS } from '../data/npb2025';
import { TEAM_DEFS } from '../constants';
import { yieldToBrowser } from './yieldToBrowser';
import { startClubFinance } from './clubFinance';

export function createInitialTeams() {
  return TEAM_DEFS.map(createInitialTeam);
}

export async function createInitialTeamsAsync() {
  const teams = [];
  for (const def of TEAM_DEFS) {
    if (teams.length > 0) await yieldToBrowser();
    teams.push(createInitialTeam(def));
  }
  return teams;
}

function createInitialTeam(def) {
  const rawTeam = NPB2025_ROSTERS[def.id]
    ? buildRealTeam(def, NPB2025_ROSTERS[def.id])
    : buildTeam(def);
  // Keep one generated catcher in the farm during the initial roster optimization.
  // Daily automation uses its existing rules; this reservation applies only at game start.
  const farmCatcher = rawTeam.farm.find(p => !p.isPitcher && p.pos === '捕手');
  const team = optimizeTeamForGameStart({
    ...rawTeam,
    farm: rawTeam.farm.filter(p => p !== farmCatcher),
  });
  if (farmCatcher) team.farm = [...team.farm, farmCatcher];
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
  // 呼び出し側が全履歴をIndexedDBへ保存してからReact state用に軽量化する。
  return startClubFinance(team, 2026);
}
