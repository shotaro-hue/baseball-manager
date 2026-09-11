import { buildTeam } from './playerCore';
import { buildRealTeam } from './realplayer';
import { optimizeTeamForGameStart } from './rosterAutomation';
import { NPB2025_ROSTERS } from '../data/npb2025';
import { TEAM_DEFS } from '../constants';

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
    // 呼び出し側が全履歴をIndexedDBへ保存してからReact state用に軽量化する。
    return team;
  });
}
