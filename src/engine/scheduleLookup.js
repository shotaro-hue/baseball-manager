export function getMyMatchup(schedule, gameDay, myId) {
  const day = schedule?.[gameDay];
  if (!day) return null;
  const matchup = day.matchups.find((item) => item.homeId === myId || item.awayId === myId);
  if (!matchup) return null;
  return {
    oppId: matchup.homeId === myId ? matchup.awayId : matchup.homeId,
    isHome: matchup.homeId === myId,
    venueNote: matchup.venueNote,
    isInterleague: day.isInterleague,
  };
}

export function getCpuMatchups(schedule, gameDay, myId, oppId) {
  const day = schedule?.[gameDay];
  if (!day) return [];
  return day.matchups.filter(
    (matchup) => matchup.homeId !== myId && matchup.awayId !== myId &&
      matchup.homeId !== oppId && matchup.awayId !== oppId,
  );
}
