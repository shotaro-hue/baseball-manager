// One snapshot shared by UI, Worker completion and save/load. Detailed logs
// stay in IndexedDB; transient simulation screens are not part of this data.
export const MATCH_HISTORY_FIELDS = ['gameResultsMap', 'allTeamResultsMap', 'allTeamBoxScoresMap',
  'scheduleArchive', 'recentResults', 'allStarDone', 'allStarResult', 'lastPressDay', 'pressEvent'];

export function matchHistorySnapshot(state = {}) {
  return {
    gameResultsMap: state.gameResultsMap ?? {},
    allTeamResultsMap: state.allTeamResultsMap ?? {},
    allTeamBoxScoresMap: state.allTeamBoxScoresMap ?? {},
    scheduleArchive: state.scheduleArchive ?? [], recentResults: state.recentResults ?? [],
    allStarDone: state.allStarDone ?? false, allStarResult: state.allStarResult ?? null,
    lastPressDay: state.lastPressDay ?? 0, pressEvent: state.pressEvent ?? null,
  };
}

export function mergeTeamResultMaps(previous = {}, patch = {}) {
  const next = { ...previous };
  for (const [id, days] of Object.entries(patch ?? {})) next[id] = { ...previous[id], ...days };
  return next;
}

export function mergeMatchResultPatch(state, patch) {
  const previous = matchHistorySnapshot(state);
  const recent = patch.recentResults ?? patch.recentResultsPatch ?? [];
  // Replacing an already-recorded day must not duplicate its recent summary.
  const days = new Set(recent.map(entry => entry.gameNo));
  return { ...previous,
    gameResultsMap: { ...previous.gameResultsMap, ...patch.gameResultsMapPatch },
    allTeamResultsMap: mergeTeamResultMaps(previous.allTeamResultsMap, patch.allTeamResultsPatch),
    allTeamBoxScoresMap: mergeTeamResultMaps(previous.allTeamBoxScoresMap, patch.allTeamBoxScoresPatch),
    recentResults: [...recent, ...previous.recentResults.filter(entry => !days.has(entry.gameNo))].slice(0, 5),
    allStarDone: previous.allStarDone || !!patch.nextAllStarDone,
    allStarResult: patch.allStarPayload ?? previous.allStarResult,
  };
}

// Opponents in detailed results used to carry a complete historical roster,
// including stats and career data repeated for each game. Result views only
// need identity rows to label the persisted play log and box score.
export function matchHistoryForSave(state) {
  const history = matchHistorySnapshot(state);
  const compactResults = map => Object.fromEntries(Object.entries(map ?? {}).map(([day, result]) => {
    const opponent = result?.oppTeam;
    if (!opponent) return [day, result];
    const { id, name, short, emoji, color, league, dhEnabled } = opponent;
    return [day, { ...result, oppTeam: { id, name, short, emoji, color, league, dhEnabled,
      players: (opponent.players ?? []).map(({ id, name, pos, isPitcher }) => ({ id, name, pos, isPitcher })) } }];
  }));
  return { ...history, gameResultsMap: compactResults(history.gameResultsMap),
    scheduleArchive: history.scheduleArchive.map(entry => ({ ...entry, gameResultsMap: compactResults(entry.gameResultsMap) })) };
}

export function nextSeasonMatchHistory(state, year, schedule, myId) {
  const previous = matchHistorySnapshot(state);
  // Keep the existing five-year policy and only the user's box scores.
  const myTeamResultsMap = Object.fromEntries(Object.entries(previous.allTeamResultsMap[myId] ?? {})
    .map(([day, result]) => [day, { ...result, ...previous.allTeamBoxScoresMap[myId]?.[day] }]));
  return { ...matchHistorySnapshot(), scheduleArchive: schedule
    ? [...previous.scheduleArchive, { year, schedule, gameResultsMap: previous.gameResultsMap, myTeamResultsMap }].slice(-5)
    : previous.scheduleArchive };
}
