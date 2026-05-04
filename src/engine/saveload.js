import LZString from 'lz-string';
import { resolveInitialContractYears } from './realplayer';

/* ═══════════════════════════════════════════════
   SAVE / LOAD — localStorage
═══════════════════════════════════════════════ */

const SAVE_KEY     = 'baseball_manager_v1';
const META_KEY     = 'baseball_manager_v1_meta';
const BACKUP_KEY_1 = 'baseball_manager_v1_bk1';
const BACKUP_KEY_2 = 'baseball_manager_v1_bk2';
const isDevEnv = import.meta.env.DEV;
const PERF_LOG_KEY = 'baseball_manager_save_perf_logs';
const MAX_PERF_LOGS = 30;
const BACKUP_ROTATE_INTERVAL_MS = 5 * 60 * 1000;
const AUTO_SAVE_INTERVAL_MS = 60 * 1000;
const LAST_BACKUP_ROTATE_KEY = 'baseball_manager_v1_last_rotate_at';
const SAVE_SIZE_DEBUG_KEY = 'baseball_manager_debug_save_size';

// 将来対応予定: CareerTable / awards 側が summary 集計を参照するまでは、careerLog 詳細は 120 件保持する。
const MAX_CAREER_LOG_ENTRIES = 120;

function sanitizeNumber(value, fallback = 0) {
  const safeFallback = Number.isFinite(Number(fallback)) ? Number(fallback) : 0;
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : safeFallback;
}

function sanitizeYear(value) {
  const normalized = Math.trunc(sanitizeNumber(value, 0));
  if (!Number.isFinite(normalized) || normalized < 0 || normalized > 9999) return 0;
  return normalized;
}

function createEmptyCareerLogSummary() {
  return {
    totalGames: 0,
    totalHits: 0,
    totalHomeRuns: 0,
    totalRbi: 0,
    firstYear: 0,
    lastYear: 0,
    trimmedEntries: 0,
  };
}

function isSaveSizeDebugEnabled() {
  if (!isDevEnv) return false;
  try {
    return localStorage.getItem(SAVE_SIZE_DEBUG_KEY) === '1';
  } catch {
    return false;
  }
}

function buildCareerLogSummary(entries) {
  const safeEntries = Array.isArray(entries) ? entries : [];
  return safeEntries.reduce((acc, entry) => {
    if (!entry || typeof entry !== 'object') return acc;
    const stats = entry.stats && typeof entry.stats === 'object' ? entry.stats : {};
    const games = sanitizeNumber(entry.games ?? entry.G ?? entry.g ?? stats.PA ?? stats.BF, 0);
    const hits = sanitizeNumber(entry.hits ?? entry.H ?? stats.H, 0);
    const homeRuns = sanitizeNumber(entry.homeRuns ?? entry.HR ?? stats.HR, 0);
    const rbi = sanitizeNumber(entry.rbi ?? entry.RBI ?? stats.RBI, 0);
    const year = sanitizeYear(entry.year);
    acc.totalGames += games;
    acc.totalHits += hits;
    acc.totalHomeRuns += homeRuns;
    acc.totalRbi += rbi;
    if (year > 0) {
      if (acc.firstYear === 0 || year < acc.firstYear) acc.firstYear = year;
      if (acc.lastYear === 0 || year > acc.lastYear) acc.lastYear = year;
    }
    return acc;
  }, createEmptyCareerLogSummary());
}

function mergeCareerLogSummary(base, delta) {
  const safeBase = base && typeof base === 'object' ? base : createEmptyCareerLogSummary();
  const safeDelta = delta && typeof delta === 'object' ? delta : createEmptyCareerLogSummary();
  const baseFirstYear = sanitizeYear(safeBase.firstYear);
  const baseLastYear = sanitizeYear(safeBase.lastYear);
  const deltaFirstYear = sanitizeYear(safeDelta.firstYear);
  const deltaLastYear = sanitizeYear(safeDelta.lastYear);
  const mergedFirstYear = [baseFirstYear, deltaFirstYear]
    .filter((year) => year > 0)
    .reduce((min, year) => Math.min(min, year), Number.POSITIVE_INFINITY);
  return {
    totalGames: sanitizeNumber(safeBase.totalGames, 0) + sanitizeNumber(safeDelta.totalGames, 0),
    totalHits: sanitizeNumber(safeBase.totalHits, 0) + sanitizeNumber(safeDelta.totalHits, 0),
    totalHomeRuns: sanitizeNumber(safeBase.totalHomeRuns, 0) + sanitizeNumber(safeDelta.totalHomeRuns, 0),
    totalRbi: sanitizeNumber(safeBase.totalRbi, 0) + sanitizeNumber(safeDelta.totalRbi, 0),
    firstYear: Number.isFinite(mergedFirstYear) ? mergedFirstYear : 0,
    lastYear: [baseLastYear, deltaLastYear].filter((year) => year > 0).reduce((max, year) => Math.max(max, year), 0),
    trimmedEntries: sanitizeNumber(safeBase.trimmedEntries, 0) + sanitizeNumber(safeDelta.trimmedEntries, 0),
  };
}

function trimCareerLogWithSummary(player, maxEntries = MAX_CAREER_LOG_ENTRIES) {
  if (!player || typeof player !== 'object') return player;
  const safeMaxEntries = Math.max(0, Math.trunc(sanitizeNumber(maxEntries, MAX_CAREER_LOG_ENTRIES)));
  const careerLog = Array.isArray(player.careerLog) ? player.careerLog : [];
  const existingSummary = player.trimmedCareerLogSummary ?? player.careerLogSummary;
  const baseSummary = mergeCareerLogSummary(createEmptyCareerLogSummary(), existingSummary);
  if (careerLog.length <= safeMaxEntries) {
    return {
      ...player,
      careerLog,
      trimmedCareerLogSummary: baseSummary,
      careerLogSummary: baseSummary,
    };
  }

  const trimCount = careerLog.length - safeMaxEntries;
  const trimmedEntries = careerLog.slice(0, trimCount);
  const remainedEntries = careerLog.slice(trimCount);
  const trimmedSummary = buildCareerLogSummary(trimmedEntries);
  const nextSummary = mergeCareerLogSummary(baseSummary, {
    ...trimmedSummary,
    trimmedEntries: trimCount,
  });
  return {
    ...player,
    careerLog: remainedEntries,
    trimmedCareerLogSummary: nextSummary,
    careerLogSummary: nextSummary,
  };
}


function logPerf(label, startedAt) {
  if (!isDevEnv || !Number.isFinite(startedAt)) return;
  const elapsedMs = performance.now() - startedAt;
  console.log(`[Perf] ${label}: ${elapsedMs.toFixed(1)}ms`);
}

function appendSavePerfLog(log) {
  if (!isDevEnv || !log || typeof log !== 'object') return;
  try {
    const raw = localStorage.getItem(PERF_LOG_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const logs = Array.isArray(parsed) ? parsed : [];
    logs.push(log);
    const limited = logs.slice(-MAX_PERF_LOGS);
    localStorage.setItem(PERF_LOG_KEY, JSON.stringify(limited));
  } catch (e) {
    console.warn('Save perf log write failed:', e);
  }
}

function safeElapsedMs(startedAt) {
  if (!isDevEnv || !Number.isFinite(startedAt)) return 0;
  return performance.now() - startedAt;
}

// ── バックアップローテーション ──────────────────
// 保存前に呼ぶ: bk1→bk2, 現在→bk1
function rotateBk() {
  try {
    const bk1 = localStorage.getItem(BACKUP_KEY_1);
    if (bk1) localStorage.setItem(BACKUP_KEY_2, bk1);
    const cur = localStorage.getItem(SAVE_KEY);
    if (cur) localStorage.setItem(BACKUP_KEY_1, cur);
    localStorage.setItem(LAST_BACKUP_ROTATE_KEY, String(Date.now()));
  } catch (e) {
    console.warn('Backup rotation failed:', e);
  }
}

function shouldRotateBackupNow() {
  const lastRotateRaw = localStorage.getItem(LAST_BACKUP_ROTATE_KEY);
  const lastRotateAt = Number(lastRotateRaw);
  if (!Number.isFinite(lastRotateAt) || lastRotateAt <= 0) return true;
  return Date.now() - lastRotateAt >= BACKUP_ROTATE_INTERVAL_MS;
}

// ── 選手フィールドのマイグレーション ──────────────
function migratePlayer(p) {
  const migratedStats = {
    ...(p.stats ?? {}),
    sprayPoints: Array.isArray(p?.stats?.sprayPoints) ? p.stats.sprayPoints : [],
    battedBallEvents: Array.isArray(p?.stats?.battedBallEvents) ? p.stats.battedBallEvents : [],
  };
  return {
    ...p,
    entryAge:           p.entryAge           ?? p.age,
    serviceYears:       p.serviceYears       ?? 0,
    ikuseiYears:        p.ikuseiYears        ?? 0,
    condition:          p.condition          ?? 100,
    morale:             p.morale             ?? 60,
    trust:              p.trust              ?? 50,
    injuryDaysLeft:     p.injuryDaysLeft     ?? 0,
    growthPhase:        p.growthPhase        ?? 'peak',
    recentPitchingDays: p.recentPitchingDays ?? [],
    careerLog:          p.careerLog          ?? [],
    trimmedCareerLogSummary: mergeCareerLogSummary(createEmptyCareerLogSummary(), p.trimmedCareerLogSummary ?? p.careerLogSummary),
    careerLogSummary:   mergeCareerLogSummary(createEmptyCareerLogSummary(), p.trimmedCareerLogSummary ?? p.careerLogSummary),
    peakAbilities:      p.peakAbilities      ?? null,
    stats:              migratedStats,
    stats2:             p.stats2             ?? { PA:0, H:0, HR:0, W:0, IP:0, ER:0, K:0 },
    entryType:          p.entryType          ?? (p.isForeign ? '外国人' : (p.entryAge??p.age) <= 19 ? '高卒' : (p.entryAge??p.age) <= 22 ? '大卒' : '社会人'),
    daysOnActiveRoster: p.daysOnActiveRoster ?? (p.serviceYears ?? 0) * 120,
  };
}

// ── セーブデータのバリデーション＆マイグレーション ──


function shouldFixInitialContractInSave(state) {
  const safeYear = Number(state?.year);
  const safeDay = Number(state?.gameDay);
  return Number.isFinite(safeYear) && safeYear === 2026 && Number.isFinite(safeDay) && safeDay <= 1;
}

function migrateInitialContractYears(player, teamName, state) {
  if (!shouldFixInitialContractInSave(state)) return player;
  if (!player || typeof player !== 'object') return player;

  const currentYears = Number(player.contractYears ?? 1);
  const currentLeft = Number(player.contractYearsLeft ?? 1);
  const isSingleYear = currentYears <= 1 && currentLeft <= 1;
  if (!isSingleYear) return player;

  const resolvedYears = resolveInitialContractYears(teamName, player.name);
  if (!Number.isFinite(resolvedYears) || resolvedYears <= 1) return player;

  return {
    ...player,
    contractYears: resolvedYears,
    contractYearsLeft: resolvedYears,
  };
}

function validateAndMigrateSave(state) {
  if (!state || !Array.isArray(state.teams) || !state.myId || !state.year) {
    return { ok: false };
  }
  const teams = state.teams.map(t => ({
    ...t,
    wins:               t.wins               ?? 0,
    losses:             t.losses             ?? 0,
    budget:             t.budget             ?? 5000,
    pitchingPattern:    t.pitchingPattern    ?? {},
    stadiumLevel:       t.stadiumLevel       ?? 0,
    revenueThisSeason:  t.revenueThisSeason  ?? 0,
    players: Array.isArray(t.players) ? t.players.map(migratePlayer).map(p => migrateInitialContractYears(p, t.name, state)) : [],
  }));
  return { ok: true, state: { ...state, teams } };
}

function sanitizeSaveState(state) {
  if (!state || typeof state !== 'object' || !Array.isArray(state.teams)) {
    throw new Error('Invalid state for saving');
  }
  // ⚠️ セキュリティ: 保存時に意図しないプロトタイプ汚染【＝Objectの継承先改ざん】を避けるため、
  // JSONシリアライズ可能なデータのみを抽出する。
  return JSON.parse(JSON.stringify(state));
}

function buildSavableState(state) {
  const safeState = sanitizeSaveState(state);
  safeState.teams = safeState.teams.map((team) => ({
    ...team,
    players: Array.isArray(team.players) ? team.players.map((player) => trimCareerLogWithSummary(player, MAX_CAREER_LOG_ENTRIES)) : [],
    farm: Array.isArray(team.farm) ? team.farm.map((player) => trimCareerLogWithSummary(player, MAX_CAREER_LOG_ENTRIES)) : [],
  }));
  return safeState;
}

function formatJsonSize(byteSize) {
  if (!Number.isFinite(byteSize) || byteSize < 0) return '0B';
  if (byteSize >= 1024 * 1024) return `${(byteSize / (1024 * 1024)).toFixed(2)}MB`;
  if (byteSize >= 1024) return `${(byteSize / 1024).toFixed(2)}KB`;
  return `${Math.round(byteSize)}B`;
}

function getJsonByteSize(value) {
  try {
    const serializedValue = JSON.stringify(value);
    if (typeof serializedValue !== 'string') return 0;
    return new TextEncoder().encode(serializedValue).length;
  } catch (e) {
    if (isSaveSizeDebugEnabled()) console.warn('[SaveSize] JSONサイズ計測に失敗しました:', e);
    return -1;
  }
}


function collectObjectFieldSizes(target, fieldNames) {
  const fieldSizes = [];
  fieldNames.forEach((fieldName) => {
    const fieldValue = target?.[fieldName];
    const byteSize = getJsonByteSize(fieldValue);
    if (byteSize >= 0) fieldSizes.push({ key: fieldName, byteSize });
  });
  return fieldSizes;
}

function summarizeTopObjectFields(target, limit = 5) {
  if (!target || typeof target !== 'object' || Array.isArray(target)) return [];
  return Object.keys(target)
    .map((key) => ({ key, byteSize: getJsonByteSize(target[key]) }))
    .filter((entry) => entry.byteSize >= 0)
    .sort((a, b) => b.byteSize - a.byteSize)
    .slice(0, limit);
}

function logTeamsBreakdownSize(state) {
  if (!isSaveSizeDebugEnabled() || !state || !Array.isArray(state.teams)) return;
  const teamsTotalSize = getJsonByteSize(state.teams);
  if (teamsTotalSize >= 0) {
    console.info(`[SaveSize:teams] total: ${formatJsonSize(teamsTotalSize)}`);
  }

  state.teams.forEach((team) => {
    if (!team || typeof team !== 'object') return;
    const teamName = team.name ?? 'Unknown';
    const teamId = team.id ?? 'unknown';
    const teamSize = getJsonByteSize(team);
    console.info(`[SaveSize:team] id=${teamId} name=${teamName} total=${formatJsonSize(teamSize)}`);

    const targetTeamFields = [
      'players', 'farm', 'lineup', 'lineupDh', 'lineupNoDh', 'rotation',
      'pitchingPattern', 'coaches', 'staff', 'contracts', 'stats', 'gameLogs',
      'resultLogs', 'results', 'matchLogs', 'gameResultLogs',
    ];
    const knownFieldSizes = collectObjectFieldSizes(team, targetTeamFields);
    const knownFieldKeys = new Set(targetTeamFields);
    const unknownLargeFields = Object.keys(team)
      .filter((key) => !knownFieldKeys.has(key))
      .map((key) => ({ key, byteSize: getJsonByteSize(team[key]) }))
      .filter((entry) => entry.byteSize >= 50 * 1024)
      .sort((a, b) => b.byteSize - a.byteSize)
      .slice(0, 8);

    const safeTeamSize = teamSize > 0 ? teamSize : 1;
    const teamFieldSummary = knownFieldSizes
      .sort((a, b) => b.byteSize - a.byteSize)
      .map((entry) => `${entry.key}=${formatJsonSize(entry.byteSize)}(${((entry.byteSize / safeTeamSize) * 100).toFixed(1)}%)`)
      .join(' ');
    const unknownSummary = unknownLargeFields.length > 0
      ? unknownLargeFields.map((entry) => `${entry.key}=${formatJsonSize(entry.byteSize)}`).join(' ')
      : 'none';
    console.info(`[SaveSize:team.fields] ${teamName} ${teamFieldSummary} unknownLargeFields=${unknownSummary}`);

    const players = Array.isArray(team.players) ? team.players : [];
    const farm = Array.isArray(team.farm) ? team.farm : [];
    const rosterPlayers = [...players, ...farm].filter((player) => player && typeof player === 'object');
    const playersSize = getJsonByteSize(players);
    const farmSize = getJsonByteSize(farm);
    const totalPlayerCount = rosterPlayers.length;
    const averagePlayerByteSize = totalPlayerCount > 0
      ? rosterPlayers.reduce((sum, player) => sum + Math.max(getJsonByteSize(player), 0), 0) / totalPlayerCount
      : 0;
    console.info(`[SaveSize:team.players] ${teamName} playersTotal=${formatJsonSize(playersSize)} farmTotal=${formatJsonSize(farmSize)} averagePlayer=${formatJsonSize(averagePlayerByteSize)}`);

    const topPlayers = rosterPlayers
      .map((player) => ({ player, byteSize: getJsonByteSize(player) }))
      .filter((entry) => entry.byteSize >= 0)
      .sort((a, b) => b.byteSize - a.byteSize)
      .slice(0, 10);

    topPlayers.forEach(({ player, byteSize }, index) => {
      const playerName = player.name ?? `unknown-${index + 1}`;
      const playerFieldSizes = collectObjectFieldSizes(player, [
        'stats', 'injuryHistory', 'batting', 'pitching', 'gameLogs', 'battedBallLogs',
        'physicsLogs', 'seasonStats', 'careerStats', 'careerLog', 'careerLogSummary',
      ]);
      const knownPlayerFieldKeys = new Set(['stats', 'injuryHistory', 'batting', 'pitching', 'gameLogs', 'battedBallLogs', 'physicsLogs', 'seasonStats', 'careerStats', 'careerLog', 'careerLogSummary']);
      const playerUnknownLarge = Object.keys(player)
        .filter((key) => !knownPlayerFieldKeys.has(key))
        .map((key) => ({ key, byteSize: getJsonByteSize(player[key]) }))
        .filter((entry) => entry.byteSize >= 10 * 1024)
        .sort((a, b) => b.byteSize - a.byteSize)
        .slice(0, 5);
      const safePlayerSize = byteSize > 0 ? byteSize : 1;
      const playerFieldSummary = playerFieldSizes
        .sort((a, b) => b.byteSize - a.byteSize)
        .map((entry) => `${entry.key}=${formatJsonSize(entry.byteSize)}(${((entry.byteSize / safePlayerSize) * 100).toFixed(1)}%)`)
        .join(' ');
      const playerUnknownSummary = playerUnknownLarge.length > 0
        ? playerUnknownLarge.map((entry) => `${entry.key}=${formatJsonSize(entry.byteSize)}`).join(' ')
        : 'none';
      const careerLogCount = Array.isArray(player.careerLog) ? player.careerLog.length : 0;
      const careerLogSummarySize = getJsonByteSize(player.careerLogSummary);
      const trimmedEntries = sanitizeNumber(player?.careerLogSummary?.trimmedEntries, 0);
      console.info(`[SaveSize:player.top] ${teamName} rank=${index + 1} name=${playerName} total=${formatJsonSize(byteSize)} careerLogCount=${careerLogCount} careerLogSummarySize=${formatJsonSize(careerLogSummarySize)} trimmedEntries=${trimmedEntries} ${playerFieldSummary} unknownLargeFields=${playerUnknownSummary}`);
      const topObjectFields = summarizeTopObjectFields(player, 3)
        .map((entry) => `${entry.key}=${formatJsonSize(entry.byteSize)}`)
        .join(' ');
      console.info(`[SaveSize:player.top.fields] ${teamName} name=${playerName} topFields=${topObjectFields}`);
    });
  });
}

function logTopLevelSaveSize(state) {
  if (!isSaveSizeDebugEnabled() || !state || typeof state !== 'object' || Array.isArray(state)) return;
  const measuredEntries = [];
  Object.keys(state).forEach((topLevelKey) => {
    const keyByteSize = getJsonByteSize(state[topLevelKey]);
    if (keyByteSize < 0) {
      console.warn(`[SaveSize] ${topLevelKey}: 計測失敗`);
      return;
    }
    measuredEntries.push({ key: topLevelKey, byteSize: keyByteSize });
  });
  measuredEntries
    .sort((a, b) => b.byteSize - a.byteSize)
    .forEach(({ key, byteSize }) => {
      console.info(`[SaveSize] ${key}: ${formatJsonSize(byteSize)}`);
    });
}

// ── 公開 API ────────────────────────────────────

function compress(state) {
  const stringifyStart = isDevEnv ? performance.now() : 0;
  const json = JSON.stringify(state);
  logPerf('saveGame.stringify', stringifyStart);
  const compressStart = isDevEnv ? performance.now() : 0;
  const compressed = LZString.compressToUTF16(json);
  logPerf('saveGame.compressToUTF16', compressStart);
  return { compressed, jsonLength: json.length, compressedLength: compressed?.length ?? 0 };
}

function decompress(raw) {
  // 既存の非圧縮セーブとの後方互換: 展開失敗時は生 JSON として扱う
  try {
    const decompressed = LZString.decompressFromUTF16(raw);
    if (decompressed) {
      const parseStart = isDevEnv ? performance.now() : 0;
      const parsed = JSON.parse(decompressed);
      logPerf('loadGame.parse', parseStart);
      return parsed;
    }
  } catch { /* fall through */ }
  const parseStart = isDevEnv ? performance.now() : 0;
  const parsed = JSON.parse(raw);
  logPerf('loadGame.parse', parseStart);
  return parsed;
}

export function saveGame(state, options = {}) {
  // ⚠️ 入力値検証: 想定外の形式を保存しない（破損セーブ防止）
  if (!state || typeof state !== 'object' || !Array.isArray(state.teams)) {
    console.error('Save failed: invalid state payload');
    return { ok: false, quota: false, reason: 'invalid_state' };
  }
  const saveGameStart = isDevEnv ? performance.now() : 0;
  const skipCompression = options?.skipCompression === true;
  const skipBackupRotation = options?.skipBackupRotation === true;
  const preferMainSave = options?.preferMainSave !== false;
  const perfBreakdown = {};
  let safeState;
  try {
    safeState = buildSavableState(state);
  } catch (e) {
    console.error('Save failed: sanitize state error', e);
    return { ok: false, quota: false, reason: 'sanitize_state_failed' };
  }

  const serializeStart = isDevEnv ? performance.now() : 0;
  logTopLevelSaveSize(safeState);
  logTeamsBreakdownSize(safeState);
  const json = JSON.stringify(safeState);
  logPerf('saveGame.stringify', serializeStart);
  let compressed = json;
  let compressedLength = json.length;
  if (!skipCompression) {
    const compressStart = isDevEnv ? performance.now() : 0;
    compressed = LZString.compressToUTF16(json);
    compressedLength = compressed?.length ?? 0;
    logPerf('saveGame.compressToUTF16', compressStart);
  }
  const jsonLength = json.length;
  const writeMeta = () => {
    const metaStart = isDevEnv ? performance.now() : 0;
    const myTeam = safeState.teams?.find(t => t.id === safeState.myId);
    localStorage.setItem(META_KEY, JSON.stringify({
      teamName:  myTeam?.name  ?? '不明',
      teamEmoji: myTeam?.emoji ?? '⚾',
      year:      safeState.year,
      gameDay:   safeState.gameDay,
      wins:      myTeam?.wins  ?? 0,
      losses:    myTeam?.losses ?? 0,
      savedAt:   new Date().toLocaleString('ja-JP'),
    }));
    perfBreakdown.writeMetaMs = safeElapsedMs(metaStart);
  };
  try {
    if (!skipBackupRotation && shouldRotateBackupNow()) {
      const rotateStart = isDevEnv ? performance.now() : 0;
      rotateBk();
      perfBreakdown.rotateBackupMs = safeElapsedMs(rotateStart);
    } else {
      perfBreakdown.rotateBackupMs = 0;
    }
    const setItemStart = isDevEnv ? performance.now() : 0;
    localStorage.setItem(SAVE_KEY, compressed);
    perfBreakdown.writeMainSaveMs = safeElapsedMs(setItemStart);
    logPerf('saveGame.localStorage.setItem', setItemStart);
    writeMeta();
    perfBreakdown.totalMs = safeElapsedMs(saveGameStart);
    perfBreakdown.jsonLength = jsonLength;
    perfBreakdown.compressedLength = compressedLength;
    appendSavePerfLog({ at: new Date().toISOString(), ...perfBreakdown });
    if (isDevEnv) console.table({ saveGame: perfBreakdown });
    logPerf('saveGame', saveGameStart);
    return { ok: true };
  } catch (e) {
    const quota = e instanceof DOMException && e.name === 'QuotaExceededError';
    if (quota) {
      // ⚠️ 容量超過時は古いバックアップから削除し、main save を優先する
      const cleanupBackupKeys = [BACKUP_KEY_2, BACKUP_KEY_1];
      for (const key of cleanupBackupKeys) {
        try {
          localStorage.removeItem(key);
          if (preferMainSave) {
            const retryStart = isDevEnv ? performance.now() : 0;
            localStorage.setItem(SAVE_KEY, compressed);
            logPerf('saveGame.localStorage.setItem', retryStart);
            writeMeta();
            return { ok: true, recoveredFromQuota: true };
          }
        } catch (cleanupErr) {
          console.warn('Backup cleanup failed:', cleanupErr);
        }
      }
      // バックアップ回転を諦めて直接上書き保存を試みる
      try {
        const setItemStart = isDevEnv ? performance.now() : 0;
        localStorage.setItem(SAVE_KEY, compressed);
        logPerf('saveGame.localStorage.setItem', setItemStart);
        writeMeta();
        perfBreakdown.writeMainSaveMs = safeElapsedMs(setItemStart);
        perfBreakdown.totalMs = safeElapsedMs(saveGameStart);
        perfBreakdown.jsonLength = jsonLength;
        perfBreakdown.compressedLength = compressedLength;
        appendSavePerfLog({ at: new Date().toISOString(), fallbackOverwrite: true, ...perfBreakdown });
        if (isDevEnv) console.table({ saveGameFallback: perfBreakdown });
        logPerf('saveGame', saveGameStart);
        return { ok: true };
      } catch {
        console.error('Save failed: storage quota exceeded');
        return { ok: false, quota: true };
      }
    }
    console.error('Save failed:', e);
    return { ok: false, quota: false };
  }
}

export function analyzeSaveBottleneck(state, options = {}) {
  // ⚠️ 入力値検証: 計測APIでも不正データを受け付けない
  if (!state || typeof state !== 'object' || !Array.isArray(state.teams)) {
    return { ok: false, reason: 'invalid_state' };
  }
  const skipCompression = options?.skipCompression === true;
  try {
    const startedAt = performance.now();
    const buildStart = performance.now();
    const safeState = buildSavableState(state);
    const buildSavableStateMs = performance.now() - buildStart;

    const stringifyStart = performance.now();
    const json = JSON.stringify(safeState);
    const stringifyMs = performance.now() - stringifyStart;

    let compressMs = 0;
    let compressedLength = json.length;
    if (!skipCompression) {
      const compressStart = performance.now();
      const compressed = LZString.compressToUTF16(json);
      compressMs = performance.now() - compressStart;
      compressedLength = compressed?.length ?? 0;
    }
    const totalMs = performance.now() - startedAt;
    const bottleneck = [
      { key: 'buildSavableStateMs', value: buildSavableStateMs },
      { key: 'stringifyMs', value: stringifyMs },
      { key: 'compressMs', value: compressMs },
    ].sort((a, b) => b.value - a.value)[0];

    return {
      ok: true,
      totalMs,
      jsonLength: json.length,
      compressedLength,
      breakdown: {
        buildSavableStateMs,
        stringifyMs,
        compressMs,
      },
      bottleneck,
    };
  } catch (e) {
    console.error('Analyze save bottleneck failed:', e);
    return { ok: false, reason: 'analyze_failed' };
  }
}

export function getSavePerfLogs() {
  try {
    const raw = localStorage.getItem(PERF_LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function clearSavePerfLogs() {
  try {
    localStorage.removeItem(PERF_LOG_KEY);
    return { ok: true };
  } catch (e) {
    console.error('Clear save perf logs failed:', e);
    return { ok: false };
  }
}

export function getSavePerfSummary() {
  const logs = getSavePerfLogs();
  if (!Array.isArray(logs) || logs.length === 0) {
    return {
      count: 0,
      average: null,
      slowest: null,
    };
  }
  const safeNumber = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
  const sum = logs.reduce((acc, row) => ({
    totalMs: acc.totalMs + safeNumber(row.totalMs),
    rotateBackupMs: acc.rotateBackupMs + safeNumber(row.rotateBackupMs),
    writeMainSaveMs: acc.writeMainSaveMs + safeNumber(row.writeMainSaveMs),
    writeMetaMs: acc.writeMetaMs + safeNumber(row.writeMetaMs),
    jsonLength: acc.jsonLength + safeNumber(row.jsonLength),
    compressedLength: acc.compressedLength + safeNumber(row.compressedLength),
  }), {
    totalMs: 0,
    rotateBackupMs: 0,
    writeMainSaveMs: 0,
    writeMetaMs: 0,
    jsonLength: 0,
    compressedLength: 0,
  });
  const average = {
    totalMs: sum.totalMs / logs.length,
    rotateBackupMs: sum.rotateBackupMs / logs.length,
    writeMainSaveMs: sum.writeMainSaveMs / logs.length,
    writeMetaMs: sum.writeMetaMs / logs.length,
    jsonLength: sum.jsonLength / logs.length,
    compressedLength: sum.compressedLength / logs.length,
  };
  const slowest = logs.reduce((prev, current) => (safeNumber(current.totalMs) > safeNumber(prev?.totalMs) ? current : prev), logs[0]);
  return { count: logs.length, average, slowest };
}

export function loadGame() {
  const loadGameStart = isDevEnv ? performance.now() : 0;
  const candidates = [
    { key: SAVE_KEY,     label: 'primary' },
    { key: BACKUP_KEY_1, label: 'backup-1' },
    { key: BACKUP_KEY_2, label: 'backup-2' },
  ];
  for (const { key, label } of candidates) {
    try {
      const getItemStart = isDevEnv ? performance.now() : 0;
      const raw = localStorage.getItem(key);
      logPerf('loadGame.localStorage.getItem', getItemStart);
      if (!raw) continue;
      const state = decompress(raw);
      const result = validateAndMigrateSave(state);
      if (result.ok) {
        if (key !== SAVE_KEY) console.warn(`Loaded from ${label}`);
        logPerf('loadGame', loadGameStart);
        return result.state;
      }
      console.warn(`Validation failed for ${label}`);
    } catch (e) {
      console.error(`Load from ${label} failed:`, e);
    }
  }
  return null;
}


export function getAutoSaveIntervalMs() {
  return AUTO_SAVE_INTERVAL_MS;
}

export function hasSave() {
  return !!localStorage.getItem(SAVE_KEY);
}

export function getSaveMeta() {
  try {
    const raw = localStorage.getItem(META_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function deleteSave() {
  localStorage.removeItem(SAVE_KEY);
  localStorage.removeItem(META_KEY);
  localStorage.removeItem(BACKUP_KEY_1);
  localStorage.removeItem(BACKUP_KEY_2);
}
