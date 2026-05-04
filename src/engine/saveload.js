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
const SAVE_DATA_VERSION = 2;
const IDB_NAME = 'baseball_manager_storage';
const IDB_VERSION = 1;
const IDB_STORES = {
  chunks: 'save_chunks',
  careerLogs: 'career_logs',
};

const MAX_RECENT_CAREER_LOG_YEARS = 3;

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
  const legacyCareerLog = Array.isArray(p.careerLog) ? p.careerLog : [];
  const recentCareerLog = Array.isArray(p.recentCareerLog) ? p.recentCareerLog : legacyCareerLog.slice(-MAX_RECENT_CAREER_LOG_YEARS);
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
    careerLog:          [],
    recentCareerLog:    recentCareerLog.slice(-MAX_RECENT_CAREER_LOG_YEARS),
    trimmedCareerLogSummary: mergeCareerLogSummary(createEmptyCareerLogSummary(), p.trimmedCareerLogSummary ?? p.careerLogSummary ?? buildCareerLogSummary(legacyCareerLog)),
    careerLogSummary:   mergeCareerLogSummary(createEmptyCareerLogSummary(), p.trimmedCareerLogSummary ?? p.careerLogSummary ?? buildCareerLogSummary(legacyCareerLog)),
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
  const {
    seasonHistory, news, mailbox,
    ...rest
  } = state;
  const teams = state.teams.map((team) => ({
    ...team,
    players: Array.isArray(team?.players) ? team.players.map((p) => ({
      ...p,
      careerLog: [],
      recentCareerLog: normalizeRecentCareerLog(p),
    })) : [],
    farm: Array.isArray(team?.farm) ? team.farm.map((p) => ({
      ...p,
      careerLog: [],
      recentCareerLog: normalizeRecentCareerLog(p),
    })) : [],
  }));
  return { ...rest, teams, seasonHistory, news, mailbox };
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

function openSaveDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'));
      return;
    }
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORES.chunks)) db.createObjectStore(IDB_STORES.chunks);
      if (!db.objectStoreNames.contains(IDB_STORES.careerLogs)) db.createObjectStore(IDB_STORES.careerLogs);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
  });
}

async function idbWrite(storeName, key, value) {
  const db = await openSaveDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(value, key);
    tx.oncomplete = () => { db.close(); resolve(true); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error('IndexedDB write failed')); };
  });
}

async function idbRead(storeName, key) {
  const db = await openSaveDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = () => { db.close(); resolve(req.result); };
    req.onerror = () => { db.close(); reject(req.error || new Error('IndexedDB read failed')); };
  });
}

async function persistLargeDataToIndexedDb(state) {
  const seasonHistory = state?.seasonHistory ?? {};
  const news = Array.isArray(state?.news) ? state.news : [];
  const mailbox = Array.isArray(state?.mailbox) ? state.mailbox : [];
  await idbWrite(IDB_STORES.chunks, 'seasonHistory', seasonHistory);
  await idbWrite(IDB_STORES.chunks, 'news', news);
  await idbWrite(IDB_STORES.chunks, 'mailbox', mailbox);
}

function normalizeRecentCareerLog(player) {
  const source = Array.isArray(player?.recentCareerLog)
    ? player.recentCareerLog
    : (Array.isArray(player?.careerLog) ? player.careerLog : []);
  return source.slice(-MAX_RECENT_CAREER_LOG_YEARS);
}


function normalizePlayerId(playerId) {
  return typeof playerId === 'string' ? playerId.trim() : '';
}

async function upsertCareerLogEntriesBatch(entriesByPlayer) {
  const db = await openSaveDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORES.careerLogs, 'readwrite');
    const store = tx.objectStore(IDB_STORES.careerLogs);
    const queue = entriesByPlayer instanceof Map ? Array.from(entriesByPlayer.entries()) : [];

    const readCurrent = (playerId) => new Promise((res, rej) => {
      const req = store.get(playerId);
      req.onsuccess = () => res(Array.isArray(req.result) ? req.result : []);
      req.onerror = () => rej(req.error || new Error('IndexedDB read failed'));
    });

    const writeNext = (playerId, value) => new Promise((res, rej) => {
      const req = store.put(value, playerId);
      req.onsuccess = () => res(true);
      req.onerror = () => rej(req.error || new Error('IndexedDB write failed'));
    });

    (async () => {
      for (const [playerIdRaw, rows] of queue) {
        const playerId = normalizePlayerId(playerIdRaw);
        if (!playerId || !Array.isArray(rows) || rows.length === 0) continue;
        const existing = await readCurrent(playerId);
        const byYear = new Map();
        for (const row of existing) {
          const year = sanitizeYear(row?.year);
          if (year > 0) byYear.set(year, row);
        }
        for (const row of rows) {
          const year = sanitizeYear(row?.year);
          if (year <= 0) continue;
          byYear.set(year, row);
        }
        const merged = Array.from(byYear.values()).sort((a, b) => sanitizeYear(a?.year) - sanitizeYear(b?.year));
        await writeNext(playerId, merged);
      }
    })().catch((error) => reject(error));

    tx.oncomplete = () => { db.close(); resolve({ ok: true }); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error('IndexedDB batch upsert failed')); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error('IndexedDB batch upsert aborted')); };
  });
}

export async function saveGame(state, options = {}) {
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
    safeState = sanitizeSaveState(state);
  } catch (e) {
    console.error('Save failed: sanitize state error', e);
    return { ok: false, quota: false, reason: 'sanitize_state_failed' };
  }
  try {
    await persistLargeDataToIndexedDb(safeState);
  } catch (e) {
    console.error('Save failed: IndexedDB write error', e);
    return { ok: false, quota: false, reason: 'indexeddb_write_failed' };
  }
  safeState.seasonHistory = null;
  safeState.news = [];
  safeState.mailbox = [];
  safeState.teams = safeState.teams.map((team) => ({
    ...team,
    players: Array.isArray(team.players) ? team.players.map((p) => {
      const recentCareerLog = normalizeRecentCareerLog(p);
      const nextSummary = mergeCareerLogSummary(createEmptyCareerLogSummary(), p.careerLogSummary ?? buildCareerLogSummary(recentCareerLog));
      return { ...p, careerLog: [], recentCareerLog, careerLogSummary: nextSummary, trimmedCareerLogSummary: nextSummary };
    }) : [],
    farm: Array.isArray(team.farm) ? team.farm.map((p) => {
      const recentCareerLog = normalizeRecentCareerLog(p);
      const nextSummary = mergeCareerLogSummary(createEmptyCareerLogSummary(), p.careerLogSummary ?? buildCareerLogSummary(recentCareerLog));
      return { ...p, careerLog: [], recentCareerLog, careerLogSummary: nextSummary, trimmedCareerLogSummary: nextSummary };
    }) : [],
  }));
  safeState.saveDataVersion = SAVE_DATA_VERSION;

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

export async function loadGame() {
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
      if (state?.saveDataVersion >= SAVE_DATA_VERSION) {
        try {
          state.seasonHistory = (await idbRead(IDB_STORES.chunks, 'seasonHistory')) ?? state.seasonHistory;
          state.news = (await idbRead(IDB_STORES.chunks, 'news')) ?? state.news;
          state.mailbox = (await idbRead(IDB_STORES.chunks, 'mailbox')) ?? state.mailbox;
        } catch (e) {
          console.warn('IndexedDB load failed. Fallback to localStorage payload.', e);
        }
      }
      for (const team of (state?.teams || [])) {
        for (const bucket of ['players', 'farm']) {
          for (const player of (team?.[bucket] || [])) {
            const legacyCareerLog = Array.isArray(player?.careerLog) ? player.careerLog : [];
            if (player?.id && legacyCareerLog.length > 0) {
              const existing = await idbRead(IDB_STORES.careerLogs, player.id);
              if (!Array.isArray(existing) || existing.length === 0) {
                await idbWrite(IDB_STORES.careerLogs, player.id, legacyCareerLog);
              }
            }
            const recentCareerLog = Array.isArray(player?.recentCareerLog)
              ? player.recentCareerLog.slice(-MAX_RECENT_CAREER_LOG_YEARS)
              : legacyCareerLog.slice(-MAX_RECENT_CAREER_LOG_YEARS);
            player.recentCareerLog = recentCareerLog;
            player.careerLogSummary = mergeCareerLogSummary(createEmptyCareerLogSummary(), player.careerLogSummary ?? buildCareerLogSummary(legacyCareerLog));
            player.trimmedCareerLogSummary = mergeCareerLogSummary(createEmptyCareerLogSummary(), player.trimmedCareerLogSummary ?? player.careerLogSummary);
            player.careerLog = [];
          }
        }
      }
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

export async function loadPlayerCareerLogById(playerId) {
  if (typeof playerId !== 'string' || playerId.trim() === '') return [];
  try {
    const loaded = await idbRead(IDB_STORES.careerLogs, playerId);
    return Array.isArray(loaded) ? loaded : [];
  } catch (e) {
    console.warn('Career log load failed:', e);
    return [];
  }
}

export async function appendCareerEntryToIndexedDb(playerId, careerEntry) {
  const normalizedPlayerId = normalizePlayerId(playerId);
  if (!normalizedPlayerId || !careerEntry || typeof careerEntry !== 'object') return { ok: false };
  try {
    const entriesByPlayer = new Map([[normalizedPlayerId, [careerEntry]]]);
    await upsertCareerLogEntriesBatch(entriesByPlayer);
    return { ok: true };
  } catch (e) {
    console.warn('Career log append failed:', e);
    return { ok: false };
  }
}

export async function appendCareerEntriesToIndexedDb(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return { ok: true, appendedPlayers: 0 };
  const entriesByPlayer = new Map();
  for (const item of entries) {
    const playerId = normalizePlayerId(item?.playerId);
    const careerEntry = item?.careerEntry;
    if (!playerId || !careerEntry || typeof careerEntry !== 'object') continue;
    const existing = entriesByPlayer.get(playerId) || [];
    entriesByPlayer.set(playerId, [...existing, careerEntry]);
  }
  if (entriesByPlayer.size === 0) return { ok: false, appendedPlayers: 0 };
  try {
    await upsertCareerLogEntriesBatch(entriesByPlayer);
    return { ok: true, appendedPlayers: entriesByPlayer.size };
  } catch (e) {
    console.warn('Career log batch append failed:', e);
    return { ok: false, appendedPlayers: 0 };
  }
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
  if (typeof indexedDB !== 'undefined') {
    indexedDB.deleteDatabase(IDB_NAME);
  }
}
