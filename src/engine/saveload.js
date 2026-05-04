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
const LAST_BACKUP_ROTATE_KEY = 'baseball_manager_v1_last_rotate_at';

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

export function saveGame(state) {
  // ⚠️ 入力値検証: 想定外の形式を保存しない（破損セーブ防止）
  if (!state || typeof state !== 'object' || !Array.isArray(state.teams)) {
    console.error('Save failed: invalid state payload');
    return { ok: false, quota: false, reason: 'invalid_state' };
  }
  const saveGameStart = isDevEnv ? performance.now() : 0;
  const perfBreakdown = {};
  let safeState;
  try {
    safeState = sanitizeSaveState(state);
  } catch (e) {
    console.error('Save failed: sanitize state error', e);
    return { ok: false, quota: false, reason: 'sanitize_state_failed' };
  }
  const { compressed, jsonLength, compressedLength } = compress(safeState);
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
    if (shouldRotateBackupNow()) {
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
