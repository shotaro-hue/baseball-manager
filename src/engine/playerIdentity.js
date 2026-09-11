const teamPlayerPools = (team) => [
  ...(Array.isArray(team?.players) ? team.players : []),
  ...(Array.isArray(team?.farm) ? team.farm : []),
  ...(Array.isArray(team?.育成Players) ? team.育成Players : []),
];

export function findPlayerInTeam(team, playerId) {
  if (!playerId) return null;
  return teamPlayerPools(team).find((player) => player?.id === playerId) || null;
}

export function resolvePlayerById(preferredTeam, allTeams, playerId) {
  const preferred = findPlayerInTeam(preferredTeam, playerId);
  if (preferred) return preferred;
  for (const team of Array.isArray(allTeams) ? allTeams : []) {
    const player = findPlayerInTeam(team, playerId);
    if (player) return player;
  }
  return null;
}
