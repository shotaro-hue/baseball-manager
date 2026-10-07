// First-team stats survive demotion. Farm stats (stats2) are a separate competition.
export function hasRecordedFirstTeamSeason(player) {
  return ['G', 'GS', 'PA', 'AB', 'H', 'HR', 'RBI', 'BB', 'K', 'HBP', 'SF', 'SH', 'SB', 'CS', 'R',
    'BF', 'IP', 'W', 'L', 'SV', 'HLD', 'QS', 'Kp', 'BBp', 'HBPp', 'ER', 'Hp']
    .some(key => Number.isFinite(player.stats?.[key]) && player.stats[key] > 0);
}

export function seasonParticipants(team) {
  return [...(team.players || []), ...(team.farm || []).filter(hasRecordedFirstTeamSeason)];
}
