import { appendCareerEntryToPlayer, getCareerEntryKey, makeCareerEntry } from './careerStats';
import { emptyStats } from './playerCore';
import { hasRecordedFirstTeamSeason } from './seasonParticipants';

export const shouldArchiveFreeAgentSeason = (player, year) => player.faEnteredYear === year
  && (player.faOriginRoster !== 'farm' || hasRecordedFirstTeamSeason(player) || hasRecordedFirstTeamSeason({ stats: player.playoffStats }));

// Keep the previous club's saved season, rather than attributing its production
// to a club joined after the season. Unknown origins/years stay unknown.
export function prepareOffseasonFreeAgent(player, year, destinationTeamId) {
  // A declaration followed by a stay is not a transfer: preserve this club's
  // season and archive it normally at year end, rather than replacing it by 0.
  if (destinationTeamId != null && player.faOriginTeamId === destinationTeamId && player.faEnteredYear === year) return player;
  const entry = shouldArchiveFreeAgentSeason(player, year)
    ? makeCareerEntry(player.stats, player.playoffStats, year, player.faOriginTeamId, player.faOriginTeamName)
    : null;
  const alreadyArchived = player.faArchivedYear === year || (entry && [...(player.recentCareerLog || []), ...(player.careerLog || [])].some(row => getCareerEntryKey(row) === getCareerEntryKey(entry)));
  return {
    ...(entry && !alreadyArchived ? appendCareerEntryToPlayer(player, entry) : player),
    faArchivedYear: player.faEnteredYear === year ? year : player.faArchivedYear,
    marketLastStats: player.marketLastStats || player.stats,
    stats: emptyStats(), playoffStats: emptyStats(),
  };
}
