import {initialRosterSlots} from './initialRoster';
import { prepareRealPlayer } from './realPlayerProjection';
import { isIkuseiPlayer } from './rosterCapacity';
import { clamp, rng, uid } from '../utils';
import { emptyStats, makePlayer, applyPositionFields } from './playerCore';
import { DEFAULT_CONTRACT_END_YEAR } from '../data/npb2025';
import { buildCareerLogSummary, compactCareerStats, getRecentCareerLog } from './careerStats';

/* ═══════════════════════════════════════════════
   REAL PLAYER CONVERTER
   実成績 → ゲーム内能力値（30〜95スケール）に変換
═══════════════════════════════════════════════ */



const GAME_START_YEAR = 2026;

const openingContractEvidence=source=>source.reviewedEvidence?{
  asOf:'2026-03-27',annualSalaryManYen:source.salary,salaryStatus:source.dataQuality.salary,
  salaryBasis:source.salaryBasis,contractEndYear:source.contractEndYear,
  contractStatus:source.dataQuality.contract,contractBasis:source.contractBasis,
  ...(source.contractOption?{contractOption:source.contractOption}:{}),
  evidence:source.reviewedEvidence,
}:undefined;

function applyRealPositionFields(player, source) {
  if (source.positions && !player.isPitcher) return {...player, positions:{...source.positions}, convertTarget:null};
  const result = applyPositionFields(player);
  if (source.dataQuality.position === 'game-assumption') result.positions = {[player.pos]:100};
  return result;
}

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
    if(row.teamName)return row.teamName;
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

function historyBatterEntry(h, teamId, teamName, preserveUnknown = false) {
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
  }, { preserveUnknown });
  return {
    year, teamId, teamName,
    stats,
    playoffStats: compactCareerStats({}, { preserveUnknown }),
  };
}

function historyPitcherEntry(h, teamId, teamName, preserveUnknown = false) {
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
    BF: h.BF,
  }, { preserveUnknown });
  return {
    year, teamId, teamName,
    stats,
    playoffStats: compactCareerStats({}, { preserveUnknown }),
  };
}

/* ─── 打者変換 ─── */
export function realBatterToPlayer(input, teamDef) {
  const b = prepareRealPlayer(input, 'batter');
  const { name, age, hometown = teamDef.city, isForeign = false, salary, stats, history, career } = b;
  const pos = b.pos;
  const { AVG = 0.250, HR = 5, RBI = 30, SB = 5, BB = 30, PA = 300, OPS = 0.680 } = stats;

  const bbPct = PA > 0 ? BB / PA : 0.08;
  const hrPct = PA > 0 ? HR / PA : 0.02;

  // Recent exposure-weighted estimate, with no future or career-peak leakage.
  const bestSB = SB;

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
    historyBatterEntry(h, teamDef.gameId, historyTeamNames[index], b.dataQuality.history === 'sourced')
  );
  const recentCareerLog = getRecentCareerLog(careerLog);
  const careerLogSummary = buildCareerLogSummary(careerLog);
  const { serviceYears, entryAge } = b;

  return applyRealPositionFields({
    id: uid(), name, pos, age,
    realPlayerId: b.playerId, batHand: b.batHand, hand: b.hand,
    dataQuality: b.dataQuality, ratingsThrough: b.ratingsThrough, foreignQuotaStatus: b.foreignQuotaStatus,
    openingContractEvidence:openingContractEvidence(b),
    potential: clamp(sc(OPS, 0.60, 1.05, 55, 96) + rng(-5, 8), 55, 99),
    isPitcher: false, isForeign,
    salary,
    contractYears: resolveInitialContractYears(b.contractEndYear), contractYearsLeft: resolveInitialContractYears(b.contractEndYear),
    育成: Boolean(b.育成 || b.isIkusei), isIkusei: Boolean(b.育成 || b.isIkusei), isFA: false,
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
    entryType: b.entryType,
    daysOnActiveRoster: b.daysOnActiveRoster,
    ikuseiYears: 0,
    playerType: '',
    playerComment: '',
  }, b);
}

/* ─── 投手変換 ─── */
export function realPitcherToPlayer(input, teamDef) {
  const p = prepareRealPlayer(input, 'pitcher');
  const { name, age, hand = 'right', hometown = teamDef.city, isForeign = false, salary, stats, history, career } = p;
  const pos = p.pos;
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
    historyPitcherEntry(h, teamDef.gameId, historyTeamNames[index], p.dataQuality.history === 'sourced')
  );
  const recentCareerLog = getRecentCareerLog(careerLog);
  const careerLogSummary = buildCareerLogSummary(careerLog);
  const { serviceYears, entryAge } = p;

  return applyRealPositionFields({
    id: uid(), name, pos, age,
    realPlayerId: p.playerId, batHand: p.batHand,
    dataQuality: p.dataQuality, ratingsThrough: p.ratingsThrough, foreignQuotaStatus: p.foreignQuotaStatus,
    openingContractEvidence:openingContractEvidence(p),
    potential: clamp(sc(ERA, 5.5, 1.8, 55, 97) + rng(-5, 8), 55, 99),
    isPitcher: true, isForeign,
    hand,
    subtype,
    salary,
    contractYears: resolveInitialContractYears(p.contractEndYear), contractYearsLeft: resolveInitialContractYears(p.contractEndYear),
    育成: Boolean(p.育成 || p.isIkusei), isIkusei: Boolean(p.育成 || p.isIkusei), isFA: false,
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
    entryType: p.entryType,
    daysOnActiveRoster: p.daysOnActiveRoster,
    ikuseiYears: 0,
    playerType: '',
    playerComment: '',
  }, p);
}

/* ─── チーム構築 ─── */
export function buildRealTeam(def, rosterData) {
  const batters  = rosterData.batters.map(b => realBatterToPlayer(b, def));
  const pitchers = rosterData.pitchers.map(p => realPitcherToPlayer(p, def));
  const allRealPlayers = [...batters, ...pitchers];
  const players = allRealPlayers.filter(p=>!isIkuseiPlayer(p));

  // ファームはランダム生成（ドラフト候補など）
  const q = rng(42, 58);
  const nonPitchers = players.filter(p => !p.isPitcher);
  const slots=initialRosterSlots(allRealPlayers, {complete:rosterData.complete===true});
  const farm=[...allRealPlayers.filter(isIkuseiPlayer), ...slots.batterPositions.map(pos=>makePlayer(pos,q,false,rng(18,25)))];
  for(const role of slots.pitcherRoles)farm.push(makePlayer(role,q-5,true,rng(18,24)));

  const starters    = players.filter(p => p.isPitcher && p.subtype === '先発');
  const dhEnabled = def.league === 'パ';
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
