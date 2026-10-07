import { appendCareerEntryToPlayer, getCareerEntryKey, makeCareerEntry } from './careerStats';
import { emptyStats } from './playerCore';

// Keep the previous club's saved season, rather than attributing its production
// to a club joined after the season. Unknown origins/years stay unknown.
export function prepareOffseasonFreeAgent(player, year, destinationTeamId) {
  // A declaration followed by a stay is not a transfer: preserve this club's
  // season and archive it normally at year end, rather than replacing it by 0.
  if (destinationTeamId != null && player.faOriginTeamId === destinationTeamId && player.faEnteredYear === year) return player;
  const entry = player.faEnteredYear === year
    ? makeCareerEntry(player.stats, player.playoffStats, year, player.faOriginTeamId, player.faOriginTeamName)
    : null;
  const alreadyArchived = player.faArchivedYear === year || (entry && [...(player.recentCareerLog || []), ...(player.careerLog || [])].some(row => getCareerEntryKey(row) === getCareerEntryKey(entry)));
  return {
    ...(entry && !alreadyArchived ? appendCareerEntryToPlayer(player, entry) : player),
    faArchivedYear: entry ? year : player.faArchivedYear,
    marketLastStats: player.marketLastStats || player.stats,
    stats: emptyStats(), playoffStats: emptyStats(),
  };
}
