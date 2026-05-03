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

function logPerf(label, startedAt) {
  if (!isDevEnv || !Number.isFinite(startedAt)) return;
  const elapsedMs = performance.now() - startedAt;
  console.log(`[Perf] ${label}: ${elapsedMs.toFixed(1)}ms`);
}

// ── バックアップローテーション ──────────────────
// 保存前に呼ぶ: bk1→bk2, 現在→bk1
function rotateBk() {
  const rotateStart = isDevEnv ? performance.now() : 0;
  try {
    const bk1 = localStorage.getItem(BACKUP_KEY_1);
    if (bk1) localStorage.setItem(BACKUP_KEY_2, bk1);
    const cur = localStorage.getItem(SAVE_KEY);
    if (cur) localStorage.setItem(BACKUP_KEY_1, cur);
  } catch (e) {
    console.warn('Backup rotation failed:', e);
  } finally {
    logPerf('saveGame.rotateBackup', rotateStart);
  }
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

// ── 公開 API ────────────────────────────────────

function compress(state) {
  const compressStart = isDevEnv ? performance.now() : 0;
  const stringifyStart = isDevEnv ? performance.now() : 0;
  const json = JSON.stringify(state);
  logPerf('saveGame.stringify', stringifyStart);
  const lzStart = isDevEnv ? performance.now() : 0;
  const compressed = LZString.compressToUTF16(json);
  logPerf('saveGame.compressToUTF16', lzStart);
  logPerf('saveGame.compress', compressStart);
  return compressed;
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
  const saveGameStart = isDevEnv ? performance.now() : 0;
  const compressed = compress(state);
  const writeMeta = () => {
    const writeMetaStart = isDevEnv ? performance.now() : 0;
    const myTeam = state.teams?.find(t => t.id === state.myId);
    const metaStringifyStart = isDevEnv ? performance.now() : 0;
    const metaJson = JSON.stringify({
      teamName:  myTeam?.name  ?? '不明',
      teamEmoji: myTeam?.emoji ?? '⚾',
      year:      state.year,
      gameDay:   state.gameDay,
      wins:      myTeam?.wins  ?? 0,
      losses:    myTeam?.losses ?? 0,
      savedAt:   new Date().toLocaleString('ja-JP'),
    });
    logPerf('saveGame.meta.stringify', metaStringifyStart);

    const metaSetItemStart = isDevEnv ? performance.now() : 0;
    localStorage.setItem(META_KEY, metaJson);
    logPerf('saveGame.meta.localStorage.setItem', metaSetItemStart);
    logPerf('saveGame.meta', writeMetaStart);
  };
  try {
    rotateBk();
    const setItemStart = isDevEnv ? performance.now() : 0;
    localStorage.setItem(SAVE_KEY, compressed);
    logPerf('saveGame.localStorage.setItem', setItemStart);
    writeMeta();
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
  logPerf('loadGame', loadGameStart);
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
