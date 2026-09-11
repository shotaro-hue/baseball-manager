const RECENT_CAREER_LOG_YEARS = 3;

const CAREER_STAT_KEYS = [
  'G', 'GS', 'CG', 'SHO',
  'AVG', 'OBP', 'SLG', 'OPS', 'ERA', 'WHIP',
  'PA', 'AB', 'H', 'D', 'T', 'HR', 'RBI', 'BB', 'K', 'HBP', 'SF', 'SH', 'SB', 'CS', 'R',
  'IP', 'ER', 'BBp', 'HBPp', 'Kp', 'HRp', 'Hp', 'BF', 'W', 'L', 'SV', 'HLD', 'QS', 'BS',
];

const SUMMARY_KEYS = [
  'totalGames',
  'totalPlateAppearances',
  'totalAtBats',
  'totalHits',
  'totalDoubles',
  'totalTriples',
  'totalHomeRuns',
  'totalRbi',
  'totalWalks',
  'totalBattingStrikeouts',
  'totalStolenBases',
  'totalInningsPitched',
  'totalEarnedRuns',
  'totalPitchingStrikeouts',
  'totalWins',
  'totalLosses',
  'totalSaves',
  'totalHolds',
  'trimmedEntries',
];

function safeNumber(value) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : 0;
}

function safeYear(value) {
  const normalized = Math.trunc(safeNumber(value));
  return normalized > 0 && normalized <= 9999 ? normalized : 0;
}

export function getCareerEntryKey(entry) {
  const year = safeYear(entry?.year);
  const teamId = entry?.teamId == null ? '' : String(entry.teamId);
  const teamName = typeof entry?.teamName === 'string' ? entry.teamName : '';
  return `${year}:${teamId}:${teamName}`;
}

export function getRecentCareerLog(entries, yearCount = RECENT_CAREER_LOG_YEARS) {
  const sorted = [...(Array.isArray(entries) ? entries : [])]
    .filter((entry) => safeYear(entry?.year) > 0)
    .sort((a, b) => safeYear(a?.year) - safeYear(b?.year));
  const years = [...new Set(sorted.map((entry) => safeYear(entry?.year)))];
  const recentYears = new Set(years.slice(-Math.max(1, yearCount)));
  return sorted.filter((entry) => recentYears.has(safeYear(entry?.year)));
}

export function createEmptyCareerLogSummary() {
  return {
    totalGames: 0,
    totalPlateAppearances: 0,
    totalAtBats: 0,
    totalHits: 0,
    totalDoubles: 0,
    totalTriples: 0,
    totalHomeRuns: 0,
    totalRbi: 0,
    totalWalks: 0,
    totalBattingStrikeouts: 0,
    totalStolenBases: 0,
    totalInningsPitched: 0,
    totalEarnedRuns: 0,
    totalPitchingStrikeouts: 0,
    totalWins: 0,
    totalLosses: 0,
    totalSaves: 0,
    totalHolds: 0,
    firstYear: 0,
    lastYear: 0,
    trimmedEntries: 0,
  };
}

export function compactCareerStats(stats = {}) {
  return CAREER_STAT_KEYS.reduce((result, key) => {
    result[key] = safeNumber(stats?.[key]);
    return result;
  }, {});
}

export function makeCareerEntry(stats, playoffStats, year, teamId, teamName) {
  return {
    year: safeYear(year),
    teamId,
    teamName: typeof teamName === 'string' ? teamName : '',
    stats: compactCareerStats(stats),
    playoffStats: compactCareerStats(playoffStats),
  };
}

export function buildCareerLogSummary(entries) {
  const summary = createEmptyCareerLogSummary();
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry || typeof entry !== 'object') continue;
    const stats = compactCareerStats(entry.stats);
    const year = safeYear(entry.year);
    summary.totalGames += safeNumber(entry.games ?? stats.G);
    summary.totalPlateAppearances += stats.PA;
    summary.totalAtBats += stats.AB;
    summary.totalHits += stats.H;
    summary.totalDoubles += stats.D;
    summary.totalTriples += stats.T;
    summary.totalHomeRuns += stats.HR;
    summary.totalRbi += stats.RBI;
    summary.totalWalks += stats.BB;
    summary.totalBattingStrikeouts += stats.K;
    summary.totalStolenBases += stats.SB;
    summary.totalInningsPitched += stats.IP;
    summary.totalEarnedRuns += stats.ER;
    summary.totalPitchingStrikeouts += stats.Kp;
    summary.totalWins += stats.W;
    summary.totalLosses += stats.L;
    summary.totalSaves += stats.SV;
    summary.totalHolds += stats.HLD;
    summary.trimmedEntries += 1;
    if (year > 0) {
      summary.firstYear = summary.firstYear === 0 ? year : Math.min(summary.firstYear, year);
      summary.lastYear = Math.max(summary.lastYear, year);
    }
  }
  return summary;
}

export function normalizeCareerLogSummary(summary) {
  const source = summary && typeof summary === 'object' ? summary : {};
  const normalized = createEmptyCareerLogSummary();
  for (const key of SUMMARY_KEYS) normalized[key] = safeNumber(source[key]);
  normalized.firstYear = safeYear(source.firstYear);
  normalized.lastYear = safeYear(source.lastYear);
  return normalized;
}

export function addCareerLogSummaries(base, delta) {
  const left = normalizeCareerLogSummary(base);
  const right = normalizeCareerLogSummary(delta);
  const result = createEmptyCareerLogSummary();
  for (const key of SUMMARY_KEYS) result[key] = left[key] + right[key];
  const firstYears = [left.firstYear, right.firstYear].filter((year) => year > 0);
  result.firstYear = firstYears.length > 0 ? Math.min(...firstYears) : 0;
  result.lastYear = Math.max(left.lastYear, right.lastYear);
  return result;
}

export function appendCareerEntryToPlayer(player, entry) {
  if (!player || typeof player !== 'object' || !entry) return player;
  const baseSummary = normalizeCareerLogSummary(
    player.careerLogSummary ?? buildCareerLogSummary(player.careerLog),
  );
  const careerLogSummary = addCareerLogSummaries(
    baseSummary,
    buildCareerLogSummary([entry]),
  );
  const recentByKey = new Map();
  for (const row of [
    ...(Array.isArray(player.recentCareerLog) ? player.recentCareerLog : []),
    entry,
  ]) {
    const year = safeYear(row?.year);
    if (year > 0) recentByKey.set(getCareerEntryKey(row), row);
  }
  const recentCareerLog = getRecentCareerLog(Array.from(recentByKey.values()));
  return {
    ...player,
    careerLog: [],
    recentCareerLog,
    careerLogSummary,
    trimmedCareerLogSummary: careerLogSummary,
  };
}

export function hasCareerStats(stats) {
  if (!stats || typeof stats !== 'object') return false;
  return CAREER_STAT_KEYS.some((key) => safeNumber(stats[key]) !== 0);
}

export function mergeCareerLogWithCurrentSeason(entries, currentSeason) {
  const merged = [...(Array.isArray(entries) ? entries : [])]
    .filter((entry) => safeYear(entry?.year) > 0);
  const currentYear = safeYear(currentSeason?.year);
  if (
    currentSeason?.include !== false
    && currentYear > 0
    && !merged.some((entry) => safeYear(entry?.year) === currentYear)
    && (hasCareerStats(currentSeason?.stats) || hasCareerStats(currentSeason?.playoffStats))
  ) {
    merged.push(makeCareerEntry(
      currentSeason.stats,
      currentSeason.playoffStats,
      currentYear,
      currentSeason.teamId,
      currentSeason.teamName,
    ));
  }
  return merged.sort((a, b) => safeYear(a?.year) - safeYear(b?.year));
}

export function collectCareerLogsForIndexedDb(teams) {
  const entries = [];
  for (const team of Array.isArray(teams) ? teams : []) {
    for (const bucket of ['players', 'farm']) {
      for (const player of Array.isArray(team?.[bucket]) ? team[bucket] : []) {
        const careerEntries = Array.isArray(player?.careerLog) ? player.careerLog : [];
        if (typeof player?.id !== 'string' || player.id.trim() === '' || careerEntries.length === 0) continue;
        entries.push({ playerId: player.id, careerEntries });
      }
    }
  }
  return entries;
}
