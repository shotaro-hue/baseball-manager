import { buildTeam } from './playerCore';
import { buildRealTeam } from './realplayer';
import { optimizeTeamForGameStart, validateTeamRoster } from './rosterAutomation';
import { hasCompleteFieldingCoverage } from './initialRoster';
import { getOpeningRosters } from '../data/playerMaster2026';
import { isIkuseiPlayer } from './rosterCapacity';
import { TEAM_DEFS } from '../constants';
import { yieldToBrowser } from './yieldToBrowser';
import { startClubFinance } from './clubFinance';

export function createInitialTeams(master, options) {
  const rosters=getOpeningRosters(master, options);
  return TEAM_DEFS.map(def=>createInitialTeam(def,rosters));
}

export async function createInitialTeamsAsync(master, options) {
  const rosters=getOpeningRosters(master, options);
  const teams = [];
  for (const def of TEAM_DEFS) {
    if (teams.length > 0) await yieldToBrowser();
    teams.push(createInitialTeam(def,rosters));
  }
  return teams;
}

function createInitialTeam(def,rosters) {
  const rawTeam = rosters[def.id]
    ? buildRealTeam(def, rosters[def.id])
    : buildTeam(def);
  const catchers = [...rawTeam.farm,...rawTeam.players].filter(p => !p.isPitcher && p.pos === '捕手' && !isIkuseiPlayer(p));
  // Reserve a farm catcher without removing the only fielder for another slot.
  // Complete input must produce a legal team without adding fictional players.
  for(const farmCatcher of rosters[def.id]?.complete ? catchers : [catchers[0]]) {
    const team=optimizeInitialTeam(rawTeam,farmCatcher,rosters[def.id]?.complete===true);
    const batters=team.players.filter(p=>!p.isPitcher);
    if(rosters[def.id]?.complete&&(batters.length<9||!hasCompleteFieldingCoverage(batters)||validateTeamRoster(team).errors.length))continue;
    return startClubFinance(team, 2026);
  }
  throw new Error('完全名簿では一軍・二軍の守備が成立しません。捕手と守備適性を確認してください');
}

function optimizeInitialTeam(rawTeam,farmCatcher,complete=false) {
  const team = optimizeTeamForGameStart({
    ...rawTeam,
    // A complete master starts unassigned. Treating every controlled player as
    // active causes mass demotions and artificial cooldowns before opening day.
    players: complete ? [] : rawTeam.players.filter(p => p !== farmCatcher),
    farm: (complete ? [...rawTeam.players,...rawTeam.farm] : rawTeam.farm).filter(p => p !== farmCatcher),
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
  return team;
}
