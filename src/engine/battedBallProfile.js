import {
  BATTED_BALL_ARCHIVE_BYTES_PER_CHUNK,
  BATTED_BALL_ARCHIVE_EVENTS_PER_CHUNK,
  BATTED_BALL_ARCHIVE_GAMES_PER_CHUNK,
  BATTED_BALL_RECENT_WINDOW,
  HARD_HIT_THRESHOLD_KMH,
} from '../constants';

export const BATTED_BALL_SCHEMA_VERSION = 1;
const IN_PLAY_RESULTS = new Set(['s', 'd', 't', 'hr', 'out', 'sf', 'go', 'fo']);
const CONTACT_QUALITIES = new Set(['weak', 'normal', 'solid', 'hard', 'barrel']);
const VALID_BATTER_SIDES = new Set(['left', 'right']);
const VALID_PITCHER_HANDS = new Set(['left', 'right']);

const finite = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const clampNumber = (value, min, max, fallback = null) => {
  const number = finite(value);
  if (number == null) return fallback;
  return Math.max(min, Math.min(max, number));
};

const safeString = (value, fallback = '') =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, 120) : fallback;

export function createEmptyBattedBallProfile() {
  return {
    schemaVersion: BATTED_BALL_SCHEMA_VERSION,
    bip: 0,
    evSum: 0,
    evN: 0,
    laSum: 0,
    laN: 0,
    hardHit: 0,
    barrel: 0,
    ground: 0,
    line: 0,
    fly: 0,
    left: 0,
    center: 0,
    right: 0,
    pull: 0,
    centerRelative: 0,
    opposite: 0,
    homeRun: 0,
    parkAdjustedHrSum: 0,
    recent: {
      window: BATTED_BALL_RECENT_WINDOW,
      bip: 0,
      evSum: 0,
      evN: 0,
      laSum: 0,
      laN: 0,
      hardHit: 0,
      barrel: 0,
      ground: 0,
      line: 0,
      fly: 0,
      left: 0,
      center: 0,
      right: 0,
      pull: 0,
      centerRelative: 0,
      opposite: 0,
      homeRun: 0,
      parkAdjustedHrSum: 0,
    },
  };
}

/**
 * 打球角度から全インプレー共通の打球種別を返す。
 */
export function classifyBattedBallType(launchAngleDeg) {
  const launchAngle = finite(launchAngleDeg);
  if (launchAngle == null) return null;
  if (launchAngle < 8) return 'ground';
  if (launchAngle < 18) return 'line';
  return 'fly';
}

/**
 * 0°=左翼線、45°=中堅、90°=右翼線として物理方向を返す。
 */
export function resolveFieldDirection(sprayAngleDeg) {
  const sprayAngle = finite(sprayAngleDeg);
  if (sprayAngle == null) return null;
  if (sprayAngle < 35) return 'left';
  if (sprayAngle > 55) return 'right';
  return 'center';
}

export function resolveBatterSide(batHand, pitcherHand, actualSide) {
  if (VALID_BATTER_SIDES.has(actualSide)) return actualSide;
  if (VALID_BATTER_SIDES.has(batHand)) return batHand;
  if (batHand === 'switch') {
    return pitcherHand === 'left' ? 'right' : 'left';
  }
  return pitcherHand === 'left' ? 'right' : 'left';
}

/**
 * 物理方向を打者基準（引っ張り/中/逆方向）へ変換する。
 */
export function resolveRelativeDirection(fieldDirection, batterSide) {
  if (fieldDirection === 'center') return 'center';
  if (!['left', 'right'].includes(fieldDirection)) return null;
  if (!VALID_BATTER_SIDES.has(batterSide)) return null;
  if (batterSide === 'right') return fieldDirection === 'left' ? 'pull' : 'opposite';
  return fieldDirection === 'right' ? 'pull' : 'opposite';
}

/**
 * シミュレーションログまたは保存済みイベントをV1形式へ正規化する。
 * 不正なインプレーはnullを返し、未知フィールドは無視する。
 */
export function normalizeBattedBallEvent(logEntry, context = {}) {
  if (!logEntry || typeof logEntry !== 'object') return null;
  const result = safeString(logEntry.result).toLowerCase();
  if (!IN_PLAY_RESULTS.has(result)) return null;

  const evKmh = clampNumber(logEntry.evKmh ?? logEntry.ev ?? logEntry.exitVelo, 0, 250);
  const laDeg = clampNumber(logEntry.laDeg ?? logEntry.la ?? logEntry.launchAngle, -90, 90);
  const sprayAngleDeg = clampNumber(
    logEntry.sprayAngleDeg ?? logEntry.sprayAngle,
    0,
    90,
    45,
  );
  if (evKmh == null || evKmh <= 0 || laDeg == null) return null;

  const pitcherHandRaw = safeString(
    logEntry.pitcherHand ?? context.pitcherHand,
  ).toLowerCase();
  const pitcherHand = VALID_PITCHER_HANDS.has(pitcherHandRaw) ? pitcherHandRaw : 'right';
  const batterSide = resolveBatterSide(
    safeString(logEntry.batHand ?? context.batHand).toLowerCase(),
    pitcherHand,
    safeString(logEntry.batterSide ?? context.batterSide).toLowerCase(),
  );
  const fieldDirection = resolveFieldDirection(sprayAngleDeg);
  const relativeDirection = resolveRelativeDirection(fieldDirection, batterSide);
  const contactQualityRaw = safeString(
    logEntry.contactQuality ?? logEntry.physicsMeta?.quality,
  ).toLowerCase();
  const contactQuality = CONTACT_QUALITIES.has(contactQualityRaw) ? contactQualityRaw : null;
  const battedBallType = classifyBattedBallType(laDeg);
  const parkHrCount = clampNumber(
    logEntry.parkHrCount ?? logEntry.physicsMeta?.parkHrCount,
    0,
    1000,
  );
  const totalParkCount = clampNumber(
    logEntry.totalParkCount ?? logEntry.physicsMeta?.totalParkCount,
    1,
    1000,
  );

  return {
    seq: Math.max(0, Math.trunc(finite(logEntry.seq ?? context.seq) ?? 0)),
    pitcherId: safeString(logEntry.pitcherId ?? context.pitcherId) || null,
    batterSide,
    pitcherHand,
    result,
    hitType: safeString(logEntry.hitType) || null,
    evKmh,
    laDeg,
    distanceM: clampNumber(logEntry.distanceM ?? logEntry.dist ?? logEntry.distance, 0, 250, 0),
    sprayAngleDeg,
    fieldDirection,
    relativeDirection,
    battedBallType,
    contactQuality,
    parkId: safeString(logEntry.parkId ?? context.parkId) || null,
    isHrByTrajectory: Boolean(
      logEntry.isHrByTrajectory ?? logEntry.physicsMeta?.isHrByTrajectory,
    ),
    ...(finite(logEntry.environmentDeltaM ?? logEntry.physicsMeta?.environmentDeltaM) != null
      ? { environmentDeltaM: finite(logEntry.environmentDeltaM ?? logEntry.physicsMeta?.environmentDeltaM) }
      : {}),
    ...(parkHrCount != null && totalParkCount != null
      ? { parkHrCount, totalParkCount }
      : {}),
    ...(Array.isArray(logEntry.evaluationTags)
      ? { evaluationTags: logEntry.evaluationTags.filter((tag) => typeof tag === 'string').slice(0, 8) }
      : {}),
  };
}

function accumulateProfile(profile, event) {
  const next = { ...profile };
  next.bip += 1;
  next.evSum += event.evKmh;
  next.evN += 1;
  next.laSum += event.laDeg;
  next.laN += 1;
  if (event.evKmh >= HARD_HIT_THRESHOLD_KMH) next.hardHit += 1;
  if (event.contactQuality === 'barrel') next.barrel += 1;
  if (event.battedBallType) next[event.battedBallType] += 1;
  if (event.fieldDirection) next[event.fieldDirection] += 1;
  if (event.relativeDirection === 'center') next.centerRelative += 1;
  else if (event.relativeDirection) next[event.relativeDirection] += 1;
  if (event.result === 'hr') next.homeRun += 1;
  next.parkAdjustedHrSum += event.totalParkCount > 0
    ? (event.parkHrCount ?? 0) / event.totalParkCount
    : (event.result === 'hr' ? 1 : 0);
  return next;
}

/**
 * 1打球をプロフィールへ加算する。入力オブジェクトは変更しない。
 */
export function updateBattedBallProfile(profile, event) {
  const safeEvent = normalizeBattedBallEvent(event);
  if (!safeEvent) return profile && typeof profile === 'object'
    ? { ...createEmptyBattedBallProfile(), ...profile }
    : createEmptyBattedBallProfile();
  const base = { ...createEmptyBattedBallProfile(), ...(profile || {}) };
  return accumulateProfile(base, safeEvent);
}

export function createRecentBattedBallProfile(events, windowSize = BATTED_BALL_RECENT_WINDOW) {
  const safeWindow = Math.max(1, Math.min(500, Math.trunc(finite(windowSize) ?? BATTED_BALL_RECENT_WINDOW)));
  const normalized = (Array.isArray(events) ? events : [])
    .map((event) => normalizeBattedBallEvent(event))
    .filter(Boolean)
    .slice(-safeWindow);
  const aggregate = normalized.reduce(
    (profile, event) => accumulateProfile(profile, event),
    createEmptyBattedBallProfile(),
  );
  const { recent: _recent, schemaVersion: _schemaVersion, ...recent } = aggregate;
  return { window: safeWindow, ...recent };
}

export function mergeBattedBallProfiles(profiles) {
  const result = createEmptyBattedBallProfile();
  const fields = [
    'bip', 'evSum', 'evN', 'laSum', 'laN', 'hardHit', 'barrel',
    'ground', 'line', 'fly', 'left', 'center', 'right',
    'pull', 'centerRelative', 'opposite', 'homeRun', 'parkAdjustedHrSum',
  ];
  for (const profile of Array.isArray(profiles) ? profiles : []) {
    if (!profile || typeof profile !== 'object') continue;
    for (const field of fields) result[field] += finite(profile[field]) ?? 0;
  }
  return result;
}

function buildPlayerLookup(teams) {
  const players = new Map();
  for (const team of Array.isArray(teams) ? teams : []) {
    for (const player of [...(team?.players || []), ...(team?.farm || [])]) {
      if (player?.id) players.set(player.id, player);
    }
  }
  return players;
}

/**
 * 1試合のログを「1選手×1試合」の冪等レコードへ変換する。
 */
export function createBattedBallBatchRecords(log, context = {}) {
  const safeSaveId = safeString(context.saveId);
  const safeYear = Math.trunc(finite(context.year) ?? 0);
  const gameDay = Math.trunc(finite(context.gameDay) ?? 0);
  const gameId = safeString(context.gameId, `${safeYear}-${gameDay}`);
  if (!safeSaveId || safeYear <= 0 || !gameId) return [];

  const teams = Array.isArray(context.teams) ? context.teams : [];
  const playerLookup = context.playerLookup instanceof Map
    ? context.playerLookup
    : buildPlayerLookup(teams);
  const teamByPlayer = new Map();
  for (const team of teams) {
    for (const player of team?.players || []) teamByPlayer.set(player.id, team);
  }

  const byPlayer = new Map();
  (Array.isArray(log) ? log : []).forEach((entry, seq) => {
    const playerId = safeString(entry?.batId ?? entry?.playerId);
    if (!playerId) return;
    const batter = playerLookup.get(playerId);
    const pitcher = playerLookup.get(entry?.pitcherId);
    const event = normalizeBattedBallEvent(entry, {
      seq,
      batHand: batter?.batHand,
      batterSide: entry?.batterSide,
      pitcherHand: entry?.pitcherHand ?? pitcher?.hand,
      parkId: context.parkId,
    });
    if (!event) return;
    if (!byPlayer.has(playerId)) byPlayer.set(playerId, []);
    byPlayer.get(playerId).push(event);
  });

  const createdAt = finite(context.createdAt) ?? Date.now();
  return Array.from(byPlayer.entries()).map(([playerId, events]) => {
    const team = teamByPlayer.get(playerId);
    const opponent = teams.find((candidate) => candidate?.id !== team?.id);
    return {
      id: `${safeSaveId}:${safeYear}:${gameId}:${playerId}`,
      schemaVersion: BATTED_BALL_SCHEMA_VERSION,
      saveId: safeSaveId,
      year: safeYear,
      gameId,
      gameDay,
      teamId: safeString(team?.id) || null,
      opponentTeamId: safeString(opponent?.id) || null,
      playerId,
      source: context.source === 'worker' ? 'worker' : 'normal',
      eventCount: events.length,
      events,
      createdAt,
    };
  });
}

const byteSize = (value) => {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
};

/**
 * Worker内でのみ使うストリーミング用チャンク生成器。
 */
export function createBattedBallArchiveChunker(onChunk, limits = {}) {
  const maxGames = limits.maxGames ?? BATTED_BALL_ARCHIVE_GAMES_PER_CHUNK;
  const maxEvents = limits.maxEvents ?? BATTED_BALL_ARCHIVE_EVENTS_PER_CHUNK;
  const maxBytes = limits.maxBytes ?? BATTED_BALL_ARCHIVE_BYTES_PER_CHUNK;
  let records = [];
  let gameIds = new Set();
  let eventCount = 0;
  let estimatedBytes = 2;

  const emit = () => {
    if (records.length === 0) return;
    onChunk?.({
      schemaVersion: BATTED_BALL_SCHEMA_VERSION,
      records,
      eventCount,
      gameCount: gameIds.size,
      estimatedBytes,
    });
    records = [];
    gameIds = new Set();
    eventCount = 0;
    estimatedBytes = 2;
  };

  const addRecord = (record) => {
    const recordBytes = byteSize(record) + 1;
    const nextGameCount = gameIds.has(record.gameId) ? gameIds.size : gameIds.size + 1;
    const nextEvents = eventCount + (finite(record.eventCount) ?? 0);
    if (
      records.length > 0
      && (nextGameCount > maxGames || nextEvents > maxEvents || estimatedBytes + recordBytes > maxBytes)
    ) {
      emit();
    }
    records.push(record);
    gameIds.add(record.gameId);
    eventCount += finite(record.eventCount) ?? 0;
    estimatedBytes += recordBytes;
    // ゲーム数上限は同一試合の全選手レコードを追加し終えてから判定する。
    // 件数/バイト上限だけはメッセージ上限を守るためレコード境界で即時送出する。
    if (eventCount >= maxEvents || estimatedBytes >= maxBytes) emit();
  };

  return {
    add(recordsForGame) {
      for (const record of Array.isArray(recordsForGame) ? recordsForGame : []) addRecord(record);
      if (gameIds.size >= maxGames) emit();
    },
    flush: emit,
    getStatus() {
      return { recordCount: records.length, eventCount, gameCount: gameIds.size, estimatedBytes };
    },
  };
}

/**
 * 可視化用の決定的サンプリング。先頭/末尾を保ち、入力順に等間隔抽出する。
 */
export function sampleBattedBallEvents(events, limit) {
  const source = Array.isArray(events) ? events : [];
  const safeLimit = Math.max(0, Math.trunc(finite(limit) ?? 0));
  if (safeLimit === 0) return [];
  if (source.length <= safeLimit) return [...source];
  if (safeLimit === 1) return [source[source.length - 1]];
  return Array.from({ length: safeLimit }, (_, index) => {
    const sourceIndex = Math.round((index * (source.length - 1)) / (safeLimit - 1));
    return source[sourceIndex];
  });
}
