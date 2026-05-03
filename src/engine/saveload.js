import { resolveInitialContractYears } from './realplayer';

/* ═══════════════════════════════════════════════
   SAVE / LOAD — localStorage
═══════════════════════════════════════════════ */

const SAVE_KEY     = 'baseball_manager_v1';
const META_KEY     = 'baseball_manager_v1_meta';
const BACKUP_KEY_1 = 'baseball_manager_v1_bk1';
const BACKUP_KEY_2 = 'baseball_manager_v1_bk2';

// ── バックアップローテーション ──────────────────
// 保存前に呼ぶ: bk1→bk2, 現在→bk1
function rotateBk() {
  try {
    const bk1 = localStorage.getItem(BACKUP_KEY_1);
    if (bk1) localStorage.setItem(BACKUP_KEY_2, bk1);
    const cur = localStorage.getItem(SAVE_KEY);
    if (cur) localStorage.setItem(BACKUP_KEY_1, cur);
  } catch (e) {
    console.warn('Backup rotation failed:', e);
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

// ── セーブデータ圧縮 ──────────────────────────────
// battedBallEvents（最大500件/選手）が全12チーム×30選手分蓄積されると
// バックアップ3世代込みで localStorage 上限を超えるため保存前に削減する

function slimPlayer(p, keepBatted = 50) {
  if (!p?.stats) return p;
  return {
    ...p,
    stats: {
      ...p.stats,
      battedBallEvents: keepBatted > 0
        ? (p.stats.battedBallEvents ?? []).slice(-keepBatted)
        : [],
      sprayPoints: keepBatted > 0
        ? (p.stats.sprayPoints ?? [])
        : [],
    },
  };
}

function slimForSave(state) {
  return {
    ...state,
    mailbox: (state.mailbox ?? []).slice(-100),
    teams: (state.teams ?? []).map(t => ({
      ...t,
      players: (t.players ?? []).map(p => slimPlayer(p, 50)),
      history: (t.history ?? []).map(p => slimPlayer(p, 0)),
    })),
    faPool: (state.faPool ?? []).map(p => slimPlayer(p, 0)),
  };
}

// ── 公開 API ────────────────────────────────────

export function saveGame(state) {
  const slim = slimForSave(state);
  const writeMeta = () => {
    const myTeam = state.teams?.find(t => t.id === state.myId);
    localStorage.setItem(META_KEY, JSON.stringify({
      teamName:  myTeam?.name  ?? '不明',
      teamEmoji: myTeam?.emoji ?? '⚾',
      year:      state.year,
      gameDay:   state.gameDay,
      wins:      myTeam?.wins  ?? 0,
      losses:    myTeam?.losses ?? 0,
      savedAt:   new Date().toLocaleString('ja-JP'),
    }));
  };
  try {
    rotateBk();
    localStorage.setItem(SAVE_KEY, JSON.stringify(slim));
    writeMeta();
    return { ok: true };
  } catch (e) {
    const quota = e instanceof DOMException && e.name === 'QuotaExceededError';
    if (quota) {
      // バックアップ回転を諦めて直接上書き保存を試みる
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(slim));
        writeMeta();
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
  const candidates = [
    { key: SAVE_KEY,     label: 'primary' },
    { key: BACKUP_KEY_1, label: 'backup-1' },
    { key: BACKUP_KEY_2, label: 'backup-2' },
  ];
  for (const { key, label } of candidates) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const state = JSON.parse(raw);
      const result = validateAndMigrateSave(state);
      if (result.ok) {
        if (key !== SAVE_KEY) console.warn(`Loaded from ${label}`);
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
