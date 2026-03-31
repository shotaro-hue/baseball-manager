import { clamp, rng, uid } from '../utils';
import { POSITIONS } from '../constants';
import { emptyStats, makePlayer } from './player';

/* ═══════════════════════════════════════════════
   REAL PLAYER CONVERTER
   実成績 → ゲーム内能力値（30〜95スケール）に変換
═══════════════════════════════════════════════ */

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

/* ─── 打者変換 ─── */
export function realBatterToPlayer(b, teamDef) {
  const { name, age, pos, hometown = teamDef.city, isForeign = false, salary, stats } = b;
  const { AVG = 0.250, HR = 5, RBI = 30, SB = 5, BB = 30, PA = 300, OPS = 0.680 } = stats;

  const bbPct = PA > 0 ? BB / PA : 0.08;
  const hrPct = PA > 0 ? HR / PA : 0.02;

  const batting = {
    contact:     sc(AVG,   0.195, 0.345, 38, 90),
    power:       sc(hrPct, 0.005, 0.080, 30, 93),
    eye:         sc(bbPct, 0.04,  0.18,  30, 90),
    speed:       sc(SB,    0,     60,    30, 88),
    stealSkill:  sc(SB,    0,     60,    30, 88),
    arm:         posArmBase(pos),
    defense:     posDefenseBase(pos),
    baseRunning: sc(SB,    0,     50,    30, 85),
    clutch:      clamp(55 + rng(-12, 15), 30, 90),
    vsLeft:      clamp(sc(OPS, 0.55, 1.05, 35, 88) + rng(-8, 8), 30, 90),
    breakingBall:clamp(sc(AVG, 0.195, 0.345, 35, 85) + rng(-8, 8), 30, 88),
    catching:    pos === '捕手' ? rng(60, 85) : rng(30, 55),
    stamina:     clamp(60 + rng(-10, 15), 40, 85),
    recovery:    clamp(55 + rng(-10, 15), 35, 80),
  };

  const growthPhase = age <= 24 ? 'growth' : age <= 29 ? 'peak' : age <= 33 ? 'earlyDecline' : 'decline';

  return {
    id: uid(), name, pos, age,
    potential: clamp(sc(OPS, 0.60, 1.05, 55, 96) + rng(-5, 8), 55, 99),
    isPitcher: false, isForeign,
    salary: salary ?? 5000000,
    contractYears: rng(1, 4), contractYearsLeft: rng(1, 3),
    育成: false, isFA: false,
    condition: rng(85, 100),
    injury: null, injuryDaysLeft: 0,
    trainingFocus: null,
    morale: rng(65, 100), trust: 55,
    hometown,
    personality: makePers(age),
    skills: [],
    growthPhase,
    stats: emptyStats(),
    batting,
    serviceYears: rng(0, Math.max(0, age - 18)),
    entryAge: age - rng(0, Math.max(0, age - 18)),
    entryType: isForeign ? '外国人' : age <= 19 ? '高卒' : age <= 22 ? '大卒' : '社会人',
    daysOnActiveRoster: rng(0, Math.max(0, age - 18)) * 120,
    ikuseiYears: 0,
    playerType: '',
    playerComment: '',
  };
}

/* ─── 投手変換 ─── */
export function realPitcherToPlayer(p, teamDef) {
  const { name, age, pos, hand = 'right', hometown = teamDef.city, isForeign = false, salary, stats } = p;
  const { ERA = 4.00, W = 5, L = 8, IP = 80, K = 70, BB = 35, WHIP = 1.40 } = stats;

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

  return {
    id: uid(), name, pos, age,
    potential: clamp(sc(ERA, 5.5, 1.8, 55, 97) + rng(-5, 8), 55, 99),
    isPitcher: true, isForeign,
    hand,
    subtype,
    salary: salary ?? 5000000,
    contractYears: rng(1, 4), contractYearsLeft: rng(1, 3),
    育成: false, isFA: false,
    condition: rng(85, 100),
    injury: null, injuryDaysLeft: 0,
    trainingFocus: null,
    morale: rng(65, 100), trust: 55,
    hometown,
    personality: makePers(age),
    skills: [],
    growthPhase,
    stats: { ...emptyStats(), W: 0, L: 0, SV: 0 },
    pitching,
    serviceYears: rng(0, Math.max(0, age - 18)),
    entryAge: age - rng(0, Math.max(0, age - 18)),
    entryType: isForeign ? '外国人' : age <= 19 ? '高卒' : age <= 22 ? '大卒' : '社会人',
    daysOnActiveRoster: rng(0, Math.max(0, age - 18)) * 120,
    ikuseiYears: 0,
    playerType: '',
    playerComment: '',
  };
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

  return {
    ...def,
    players, farm,
    育成Players: [],
    lineup:   nonPitchers.slice(0, 9).map(p => p.id),
    rotation: starters.slice(0, 5).map(p => p.id),
    rotIdx:   0,
    wins: 0, losses: 0, draws: 0, rf: 0, ra: 0,
    coaches: [],
    budget: def.budget,
    scoutMissions: [], scoutResults: [],
    history: [],
    popularity: rng(45, 75),
    stadiumLevel: 0,
    revenueThisSeason: 0,
    ownerGoal: "cs",
    ownerTrust: 50,
  };
}
