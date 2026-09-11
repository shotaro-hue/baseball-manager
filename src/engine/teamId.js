export function isTeamIdSet(teamId) {
  return teamId !== null && teamId !== undefined;
}

export function hasSelectedTeam(teams, teamId) {
  return (
    isTeamIdSet(teamId)
    && Array.isArray(teams)
    && teams.some((team) => team?.id === teamId)
  );
}

export function serializeTeamId(teamId) {
  if (!isTeamIdSet(teamId)) return null;
  const serialized = String(teamId).trim();
  return serialized || null;
}
