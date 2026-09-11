import { clamp, rng, uid } from '../utils';
import { POSITIONS } from '../constants';
import { emptyStats, makePlayer, applyPositionFields } from './playerCore';
import { DEFAULT_CONTRACT_END_YEAR } from '../data/npb2025';
import { buildCareerLogSummary, compactCareerStats, getRecentCareerLog } from './careerStats';

/* ═══════════════════════════════════════════════
   REAL PLAYER CONVERTER
   実成績 → ゲーム内能力値（30〜95スケール）に変換
═══════════════════════════════════════════════ */



const GAME_START_YEAR = 2026;

function validateYearOrNull(yearValue) {
  if (yearValue === null) return null;
  if (typeof yearValue !== 'number' || !Number.isFinite(yearValue)) return null;
  const y = Math.floor(yearValue);
  if (y < GAME_START_YEAR || y > GAME_START_YEAR + 10) return null;
  return y;
}

export function resolveInitialContractYears(contractEndYear) {
  const resolvedEndYear = validateYearOrNull(contractEndYear) ?? DEFAULT_CONTRACT_END_YEAR;
  const yearsLeft = resolvedEndYear - GAME_START_YEAR + 1;
  return clamp(yearsLeft, 1, 7);
}

// 線形スケール変換
function sc(val, inMin, inMax, outMin, outMax) {
  if (inMax === inMin) return Math.round((outMin + outMax) / 2);
  return clamp(
    Math.round(((val - inMin) / (inMax - inMin)) * (outMax - outMin) + outMin),
    outMin,
    outMax
  );
}

// 大雑把な守備位置を具体的ポジションに正規化
// 外野手→中堅手: SECONDARY_POSITION_RULES で左翼手・右翼手が自動付与される
// 内野手→二塁手: 同ルールで遊撃手・三塁手が付与され、一塁手は除外される
const GENERIC_POS_MAP = { '外野手': '中堅手', '内野手': '二塁手', 'OF': '中堅手', 'IF': '二塁手' };
function normalizeRealPos(pos) { return GENERIC_POS_MAP[pos] ?? pos; }

// ポジション別守備基準値
function posDefenseBase(pos) {
  const map = {
    捕手:   72, 一塁手: 55, 二塁手: 68, 三塁手: 62,
    遊撃手: 72, 左翼手: 55, 中堅手: 65, 右翼手: 58,
  };
  return (map[pos] ?? 58) + rng(-8, 8);
}

// ポジション別肩基準値
function posArmBase(pos) {
  const map = {
    捕手:   75, 一塁手: 48, 二塁手: 60, 三塁手: 62,
    遊撃手: 70, 左翼手: 58, 中堅手: 62, 右翼手: 68,
  };
  return (map[pos] ?? 58) + rng(-8, 8);
}

// 性格生成（player.jsと同じロジック）
function makePers(age) {
  return {
    money: rng(20, 90), winning: rng(20, 90), playing: rng(30, 95),
    hometown: rng(0, 80), loyalty: rng(10, 85),
    stability: rng(age > 28 ? 50 : 20, age > 28 ? 90 : 70),
    future: rng(age < 27 ? 50 : 10, age < 27 ? 90 : 60),
  };
}

/* ─── career配列から特定年度のチーム名を解決 ─── */
function resolveTeamName(career, year, fallback) {
  if (!career || career.length === 0) return fallback;
  for (let i = career.length - 1; i >= 0; i--) {
    const c = career[i];
    if (year >= c.from && (c.to === null || year <= c.to)) return c.team;
  }
  return fallback;
}

function resolveHistoryTeamNames(history, career, fallback) {
  const rows = Array.isArray(history) ? history : [];
  const yearTotals = rows.reduce((counts, row) => {
    counts.set(row.year, (counts.get(row.year) || 0) + 1);
    return counts;
  }, new Map());
  const yearSeen = new Map();
  return rows.map((row) => {
    const year = row.year;
    const seen = yearSeen.get(year) || 0;
    yearSeen.set(year, seen + 1);
    if ((yearTotals.get(year) || 0) <= 1) return resolveTeamName(career, year, fallback);
    // 移籍年の分割成績はデータ上「移籍後→移籍前」の順で並ぶため、在籍履歴を新しい順に対応させる。
    const matchingStints = (Array.isArray(career) ? career : [])
      .filter((stint) => year >= stint.from && (stint.to === null || year <= stint.to))
      .reverse();
    return matchingStints[seen]?.team || resolveTeamName(career, year, fallback);
  });
}

/* ─── 過去成績 → careerLog エントリ変換 ─── */

function historyBatterEntry(h, teamId, teamName) {
  const { year } = h;
  // 過去実績は元データに存在する実数だけを使う。AVG/PAからの逆算・平均値補完は行わない。
  const stats = compactCareerStats({
    G: h.G,
    AVG: h.AVG,
    OBP: h.OBP,
    SLG: h.SLG,
    OPS: h.OPS,
    PA: h.PA,
    AB: h.AB,
    H: h.H,
    D: h['2B'],
    T: h['3B'],
    HR: h.HR,
    RBI: h.RBI,
    BB: h.BB,
    K: h.SO,
    HBP: h.HBP,
    SF: h.SF,
    SH: h.SH,
    SB: h.SB,
    CS: h.CS,
    R: h.R,
  });
  return {
    year, teamId, teamName,
    stats,
    playoffStats: compactCareerStats(),
  };
}

function historyPitcherEntry(h, teamId, teamName) {
  const { year } = h;
  const stats = compactCareerStats({
    G: h.G,
    GS: h.GS,
    CG: h.CG,
    SHO: h.SHO,
    ERA: h.ERA,
    WHIP: h.WHIP,
    IP: h.IP,
    ER: h.ER,
    BBp: h.BB,
    HBPp: h.HBP,
    Kp: h.SO,
    HRp: h.HR,
    Hp: h.H,
    W: h.W,
    L: h.L,
    SV: h.SV,
    HLD: h.HLD,
  });
  return {
    year, teamId, teamName,
    stats,
    playoffStats: compactCareerStats(),
  };
}

/* ─── 打者変換 ─── */
export function realBatterToPlayer(b, teamDef) {
  const { name, age, hometown = teamDef.city, isForeign = false, salary, stats, history, career } = b;
  const pos = normalizeRealPos(b.pos);
  const { AVG = 0.250, HR = 5, RBI = 30, SB = 5, BB = 30, PA = 300, OPS = 0.680 } = stats;

  const bbPct = PA > 0 ? BB / PA : 0.08;
  const hrPct = PA > 0 ? HR / PA : 0.02;

  // キャリア最高盗塁数: 2025年スナップショットは開幕直後で少ないため history の最大値を使用
  const bestSB = Math.max(SB, ...(history ?? []).map(h => h.SB || 0));

  const batting = {
    contact:     sc(AVG,   0.195, 0.345, 38, 90),
    power:       sc(hrPct, 0.005, 0.080, 30, 93),
    eye:         sc(bbPct, 0.04,  0.18,  30, 90),
    speed:       sc(bestSB, 0,    60,    30, 88),
    stealSkill:  sc(bestSB, 0,    60,    30, 88),
    arm:         posArmBase(pos),
    defense:     posDefenseBase(pos),
    baseRunning: sc(bestSB, 0,    50,    30, 85),
    clutch:      clamp(55 + rng(-12, 15), 30, 90),
    vsLeft:      clamp(sc(OPS, 0.55, 1.05, 35, 88) + rng(-8, 8), 30, 90),
    breakingBall:clamp(sc(AVG, 0.195, 0.345, 35, 85) + rng(-8, 8), 30, 88),
    catching:    pos === '捕手' ? rng(60, 85) : rng(30, 55),
    stamina:     clamp(60 + rng(-10, 15), 40, 85),
    recovery:    clamp(55 + rng(-10, 15), 35, 80),
  };

  const growthPhase = age <= 24 ? 'growth' : age <= 29 ? 'peak' : age <= 33 ? 'earlyDecline' : 'decline';

  // careerLog: 実際の過去成績から生成（なければ空配列）
  const historyTeamNames = resolveHistoryTeamNames(history, career, teamDef.name);
  const careerLog = (history ?? []).map((h, index) =>
    historyBatterEntry(h, teamDef.gameId, historyTeamNames[index])
  );
  const recentCareerLog = getRecentCareerLog(careerLog);
  const careerLogSummary = buildCareerLogSummary(careerLog);
  // serviceYears: 実績年数優先、なければ年齢から推定
  const serviceYears = careerLog.length > 0
    ? careerLog.length
    : rng(0, Math.max(0, age - 18));
  const entryAge = age - serviceYears;

  return applyPositionFields({
    id: uid(), name, pos, age,
    potential: clamp(sc(OPS, 0.60, 1.05, 55, 96) + rng(-5, 8), 55, 99),
    isPitcher: false, isForeign,
    salary: salary ?? 5000000,
    contractYears: resolveInitialContractYears(b.contractEndYear), contractYearsLeft: resolveInitialContractYears(b.contractEndYear),
    育成: false, isFA: false,
    condition: rng(85, 100),
    form: 50,
    injury: null, injuryDaysLeft: 0,
    trainingFocus: null,
    morale: rng(65, 100), trust: 55,
    hometown,
    personality: makePers(age),
    skills: [],
    growthPhase,
    stats: emptyStats(),
    batting,
    careerLog,
    recentCareerLog,
    careerLogSummary,
    trimmedCareerLogSummary: careerLogSummary,
    serviceYears,
    entryAge,
    entryType: isForeign ? '外国人' : age <= 19 ? '高卒' : age <= 22 ? '大卒' : '社会人',
    daysOnActiveRoster: serviceYears * rng(100, 140),
    ikuseiYears: 0,
    playerType: '',
    playerComment: '',
  });
}

/* ─── 投手変換 ─── */
export function realPitcherToPlayer(p, teamDef) {
  const { name, age, hand = 'right', hometown = teamDef.city, isForeign = false, salary, stats, history, career } = p;
  const pos = normalizeRealPos(p.pos);
  const { ERA = 4.00, W = 5, L = 8, IP = 80, SO = 70, BB = 35, WHIP = 1.40 } = stats;
  const K = SO;

  const k9  = IP > 0 ? K  / IP * 9 : 7;
  const bb9 = IP > 0 ? BB / IP * 9 : 3.5;

  const pitching = {
    velocity:    sc(k9,   3.0, 12.0,  38, 94),
    control:     sc(bb9,  7.0,  0.5,  35, 93),  // 逆スケール（少ないほど高い）
    stamina:     pos === '先発' ? sc(IP, 80, 200, 48, 90) : clamp(50 + rng(-8, 10), 40, 68),
    breaking:    sc((k9 - bb9), -1, 10, 35, 90),
    variety:     clamp(55 + rng(-10, 12), 35, 85),
    sharpness:   sc(WHIP, 2.0, 0.90, 35, 90),
    tempo:       clamp(55 + rng(-10, 12), 35, 82),
    clutchP:     clamp(sc(ERA, 6.0, 2.0, 35, 88) + rng(-8, 10), 30, 90),
    recovery:    pos === '先発' ? clamp(55 + rng(-10, 12), 35, 80) : clamp(65 + rng(-8, 12), 45, 90),
    durability:  sc(IP, 40, 200, 38, 90),
  };

  const subtype = pos === '抑え' ? '抑え' : pos === '中継ぎ' ? '中継ぎ' : '先発';
  const growthPhase = age <= 24 ? 'growth' : age <= 29 ? 'peak' : age <= 33 ? 'earlyDecline' : 'decline';

  const historyTeamNames = resolveHistoryTeamNames(history, career, teamDef.name);
  const careerLog = (history ?? []).map((h, index) =>
    historyPitcherEntry(h, teamDef.gameId, historyTeamNames[index])
  );
  const recentCareerLog = getRecentCareerLog(careerLog);
  const careerLogSummary = buildCareerLogSummary(careerLog);
  const serviceYears = careerLog.length > 0
    ? careerLog.length
    : rng(0, Math.max(0, age - 18));
  const entryAge = age - serviceYears;

  return applyPositionFields({
    id: uid(), name, pos, age,
    potential: clamp(sc(ERA, 5.5, 1.8, 55, 97) + rng(-5, 8), 55, 99),
    isPitcher: true, isForeign,
    hand,
    subtype,
    salary: salary ?? 5000000,
    contractYears: resolveInitialContractYears(p.contractEndYear), contractYearsLeft: resolveInitialContractYears(p.contractEndYear),
    育成: false, isFA: false,
    condition: rng(85, 100),
    form: 50,
    injury: null, injuryDaysLeft: 0,
    trainingFocus: null,
    morale: rng(65, 100), trust: 55,
    hometown,
    personality: makePers(age),
    skills: [],
    growthPhase,
    stats: { ...emptyStats(), W: 0, L: 0, SV: 0 },
    pitching,
    careerLog,
    recentCareerLog,
    careerLogSummary,
    trimmedCareerLogSummary: careerLogSummary,
    serviceYears,
    entryAge,
    entryType: isForeign ? '外国人' : age <= 19 ? '高卒' : age <= 22 ? '大卒' : '社会人',
    daysOnActiveRoster: serviceYears * rng(100, 140),
    ikuseiYears: 0,
    playerType: '',
    playerComment: '',
  });
}

/* ─── チーム構築 ─── */
export function buildRealTeam(def, rosterData) {
  const batters  = rosterData.batters.map(b => realBatterToPlayer(b, def));
  const pitchers = rosterData.pitchers.map(p => realPitcherToPlayer(p, def));
  const players  = [...batters, ...pitchers];

  // ファームはランダム生成（ドラフト候補など）
  const q = rng(42, 58);
  const farm = [];
  for (let i = 0; i < 12; i++) farm.push(makePlayer(POSITIONS[rng(0, 7)], q, false, rng(18, 25)));
  for (let i = 0; i < 6;  i++) farm.push(makePlayer('先発', q - 5, true, rng(18, 24)));

  const nonPitchers = players.filter(p => !p.isPitcher);
  const starters    = players.filter(p => p.isPitcher && p.subtype === '先発');
  const dhEnabled = def.league === 'パ';
  if (nonPitchers[8]) nonPitchers[8].pos = 'DH';
  const lineupNoDh = nonPitchers.slice(0, 8).map(p => p.id);
  const lineupDh = nonPitchers.slice(0, 9).map(p => p.id);

  return {
    ...def,
    players, farm,
    育成Players: [],
    dhEnabled,
    rosterDhMode: dhEnabled,
    lineup: dhEnabled ? lineupDh : lineupNoDh,
    lineupNoDh,
    lineupDh,
    rotation: starters.slice(0, 5).map(p => p.id),
    rotIdx:   0,
    wins: 0, losses: 0, draws: 0, rf: 0, ra: 0,
    coaches: [],
    budget: def.budget,
    scoutMissions: [], scoutResults: [],
    history: [],
    popularity: rng(45, 75),
    winStreak: 0, loseStreak: 0,
    stadiumLevel: 0,
    revenueThisSeason: 0,
    ownerGoal: "cs",
    ownerTrust: 50,
  };
}
