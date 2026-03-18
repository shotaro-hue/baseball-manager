import { rng, clamp, uid, pname, CITIES } from '../utils';
import { POSITIONS, PLAYER_TYPES_B, PLAYER_TYPES_P, PLAYER_COMMENTS_B, PLAYER_COMMENTS_P, MIN_SALARY_IKUSEI } from '../constants';


/* ═══════════════════════════════════════════════
   PLAYER GENERATION & RETIRE SYSTEM
═══════════════════════════════════════════════ */

// 空の成績オブジェクト
export const emptyStats = () => ({
  PA: 0, AB: 0, H: 0, D: 0, T: 0, HR: 0, RBI: 0, BB: 0, K: 0, HBP: 0,
  SB: 0, CS: 0, R: 0, SF: 0, evSum: 0, evN: 0, laSum: 0, laN: 0,
  IP: 0, ER: 0, BBp: 0, HBPp: 0, Kp: 0, HRp: 0, Hp: 0, BF: 0, W: 0, L: 0, SV: 0, HLD: 0, QS: 0, BS: 0,
});

// 性格生成
const makePers = (age) => ({
  money: rng(20, 90), winning: rng(20, 90), playing: rng(30, 95),
  hometown: rng(0, 80), loyalty: rng(10, 85),
  stability: rng(age > 28 ? 50 : 20, age > 28 ? 90 : 70),
  future: rng(age < 27 ? 50 : 10, age < 27 ? 90 : 60),
  overseas: rng(0, 100), // 海外志向 (≥70: 国内FAをスキップして海外FA待ち)
});

// 選手生成
export function makePlayer(pos, q, isPitch, ageOverride, isForeign = false) {
  const s = (b = 0) => clamp(rng(q - 18 + b, q + 15 + b), 25, 99);
  const age = ageOverride ?? rng(18, 36);
  const p = {
    id: uid(), name: pname(), pos, age, potential: rng(55, 99),
    isPitcher: isPitch, isForeign, salary: 0,
    contractYears: rng(1, 3), contractYearsLeft: rng(1, 3),
    育成: false, isFA: false, condition: rng(80, 100),
    injury: null, injuryDaysLeft: 0,
    trainingFocus: null,
    morale: rng(60, 100), trust: 50,
    hometown: CITIES[rng(0, CITIES.length - 1)],
    personality: makePers(age), skills: [],
    growthPhase: age <= 24 ? "growth" : age <= 29 ? "peak" : age <= 33 ? "earlydecline" : "decline",
    stats: emptyStats(),
    serviceYears: 0, entryAge: age, recentPitchingDays: [],
  };

  if (isPitch) {
    p.hand = Math.random() < 0.30 ? "left" : "right";
    p.pitching = {
      velocity: s(5), control: s(), stamina: s(-3), breaking: s(),
      variety: s(-5), sharpness: s(-2), tempo: s(-8), clutchP: s(-5),
      recovery: s(-5), durability: s(-3),
    };
    p.subtype = pos === "抑え" ? "抑え" : pos === "中継ぎ" ? "中継ぎ" : "先発";
    const ov = (p.pitching.velocity + p.pitching.control * 1.2 + p.pitching.stamina + p.pitching.breaking + p.pitching.clutchP * 0.3) / 4.5;
    p.salary = Math.max(MIN_SALARY_IKUSEI, clamp(Math.round((ov * 60 - 2800) / 500) * 500, 0, 50000) * 100);
  } else {
    p.batting = {
      contact: s(), power: s(), eye: s(-5), speed: s(), arm: s(-5),
      defense: s(-5), catching: s(-3), stealSkill: s(-8), baseRunning: s(-5),
      clutch: s(-8), vsLeft: s(-5), breakingBall: s(-8), stamina: s(-3), recovery: s(-5),
    };
    const ov = (p.batting.contact * 1.2 + p.batting.power + p.batting.eye + p.batting.speed * 0.7 + p.batting.clutch * 0.3) / 4.2;
    p.salary = Math.max(MIN_SALARY_IKUSEI, clamp(Math.round((ov * 55 - 2500) / 500) * 500, 0, 60000) * 100);
  }

  const types = isPitch ? PLAYER_TYPES_P : PLAYER_TYPES_B;
  const comments = isPitch ? PLAYER_COMMENTS_P : PLAYER_COMMENTS_B;
  p.playerType = types[rng(0, types.length - 1)];
  p.playerComment = comments[rng(0, comments.length - 1)];
  return p;
}

// チーム構築
export function buildTeam(def) {
  const q = rng(56, 76);
  const players = [];
  POSITIONS.forEach((pos) => players.push(makePlayer(pos, q + (pos === "捕手" ? 3 : 0), false)));
  for (let i = 0; i < 6; i++) players.push(makePlayer(POSITIONS[rng(0, 7)], q - 14, false));
  for (let i = 0; i < 5; i++) players.push(makePlayer("先発", q + 5 - i * 3, true, rng(21, 33)));
  for (let i = 0; i < 4; i++) players.push(makePlayer("中継ぎ", q - 4, true, rng(23, 31)));
  players.push(makePlayer("抑え", q + 4, true, rng(24, 32)));

  const farm = [];
  for (let i = 0; i < 15; i++) farm.push(makePlayer(POSITIONS[rng(0, 7)], q - 20, false, rng(18, 25)));
  for (let i = 0; i < 8; i++) farm.push(makePlayer("先発", q - 15, true, rng(18, 24)));

  return {
    ...def, players, farm, 育成Players: [],
    lineup: players.filter((p) => !p.isPitcher).slice(0, 9).map((p) => p.id),
    rotation: players.filter((p) => p.isPitcher && p.subtype === "先発").map((p) => p.id),
    rotIdx: 0, wins: 0, losses: 0, draws: 0, rf: 0, ra: 0,
    coaches: [], budget: def.budget,
    scoutMissions: [], scoutResults: [],
    popularity: rng(40, 70),
  };
}
/* ═══════════════════════════════════════════════
   RETIRE SYSTEM
═══════════════════════════════════════════════ */

// 引退意欲スコア計算（0〜100）
export function calcRetireWill(p) {
  if (p.age < 35) return 0;
  let score = 0;

  // 年齢
  if (p.age >= 40) score += 50;
  else if (p.age >= 38) score += 30;
  else if (p.age >= 36) score += 15;
  else score += 5;

  // 出場機会
  const pa = p.stats?.PA || 0;
  const bf = p.stats?.BF || 0;
  if (p.isPitcher && bf < 40) score += 15;
  if (!p.isPitcher && pa < 80) score += 15;

  // モラル
  if ((p.morale || 60) < 40) score += 10;

  // 契約残年
  if ((p.contractYearsLeft || 0) === 0) score += 20;

  // 引退に関する価値観
  const rs = p.retireStyle || 50;
  if (rs >= 70) {
    score = Math.round(score * 1.4);
  } else if (rs <= 30) {
    score = Math.round(score * 0.6);
  }

  return Math.min(100, score);
}

// 引退発生判定
export function rollRetire(p) {
  const will = calcRetireWill(p);
  return Math.random() * 100 < will;
}


/* ═══════════════════════════════════════════════
   PLAYER DEVELOPMENT SYSTEM
   年度末に呼び出す成長・劣化エンジン
═══════════════════════════════════════════════ */

const BATTER_KEYS  = ['contact','power','eye','speed','arm','defense','stealSkill','baseRunning','clutch'];
const PITCHER_KEYS = ['velocity','control','stamina','breaking','variety','sharpness'];

function calcGrowthBudget(p) {
  const age = p.age;
  const pot = p.potential ?? 65;
  let base;
  if      (age <= 20) base = rng(8, 13)  + Math.round((pot - 65) * 0.5);   // 若手: 原石、まだ荒削り
  else if (age <= 24) base = rng(12, 18) + Math.round((pot - 65) * 0.7);  // 全盛期: 最大成長ピーク
  else if (age <= 27) base = rng(4, 8);
  else if (age <= 30) base = rng(-1, 4);
  else if (age <= 33) base = rng(-5, -2);
  else if (age <= 37) base = rng(-9, -5);
  else                base = rng(-12, -8);

  // ブレイクアウト/バスト（若手のみ）
  if (age <= 26) {
    const roll = Math.random();
    if (roll < 0.05) return base * 2;   // ブレイク 5%
    if (roll < 0.08) return 0;           // バスト   3%
  }
  return base;
}

function applyGrowthToAbilities(abilities, keys, budget, trainingFocus, potential) {
  if (!abilities || budget === 0) return { ...abilities };
  const cap = Math.min(potential ?? 90, 99);
  const result = { ...abilities };
  const isGrowth = budget > 0;
  let remaining = Math.abs(budget);

  // キーをシャッフルして偏りを防ぐ
  const shuffled = [...keys].sort(() => Math.random() - 0.5);
  if (trainingFocus && keys.includes(trainingFocus)) {
    const idx = shuffled.indexOf(trainingFocus);
    shuffled.splice(idx, 1);
    if (isGrowth) shuffled.unshift(trainingFocus);   // 成長: focus を先に
    else          shuffled.push(trainingFocus);        // 劣化: focus を最後に（保護）
  }

  for (const key of shuffled) {
    if (remaining <= 0 || !(key in result)) break;
    const isFocus = key === trainingFocus;
    if (isGrowth) {
      const gain = isFocus ? Math.min(remaining, rng(4, 10)) : Math.min(remaining, rng(2, 6));
      result[key] = Math.min(cap, (result[key] || 50) + gain);
      remaining -= gain;
    } else {
      const loss = isFocus ? Math.min(remaining, rng(0, 2)) : Math.min(remaining, rng(2, 5));
      result[key] = Math.max(1, (result[key] || 50) - loss);
      remaining -= loss;
    }
  }
  return result;
}

export function developPlayers(players, coaches = []) {
  const summary = { breakout: [], growth: [], decline: [] };

  // コーチボーナス: 成長フェーズにのみ加算（劣化は防がない）
  const battingBonus  = coaches.filter(c => c.type === 'batting').reduce((s, c)  => s + (c.bonus || 0), 0);
  const pitchingBonus = coaches.filter(c => c.type === 'pitching').reduce((s, c) => s + (c.bonus || 0), 0);
  const mentalBonus   = coaches.filter(c => c.type === 'mental').reduce((s, c)   => s + Math.floor((c.bonus || 0) / 2), 0);

  const developed = players.map(p => {
    const rawBudget = calcGrowthBudget(p);
    const coachBonus = (p.isPitcher ? pitchingBonus : battingBonus) + mentalBonus;
    const budget = rawBudget > 0 ? rawBudget + coachBonus : rawBudget;
    const focus  = p.trainingFocus ?? null;
    const pot    = p.potential ?? 65;
    let newP = { ...p };

    if (p.isPitcher && p.pitching) {
      const before = { ...p.pitching };
      newP.pitching = applyGrowthToAbilities(p.pitching, PITCHER_KEYS, budget, focus, pot);
      const diff = PITCHER_KEYS.reduce((s, k) => s + (newP.pitching[k] || 0) - (before[k] || 0), 0);
      if (budget > 0 && diff >= 8) summary.breakout.push({ p, diff, type: 'pitcher' });
      else if (diff > 1)  summary.growth.push({ p, diff });
      else if (diff < -4) summary.decline.push({ p, diff });
    } else if (!p.isPitcher && p.batting) {
      const before = { ...p.batting };
      newP.batting = applyGrowthToAbilities(p.batting, BATTER_KEYS, budget, focus, pot);
      const diff = BATTER_KEYS.reduce((s, k) => s + (newP.batting[k] || 0) - (before[k] || 0), 0);
      if (budget > 0 && diff >= 10) summary.breakout.push({ p, diff, type: 'batter' });
      else if (diff > 1)  summary.growth.push({ p, diff });
      else if (diff < -5) summary.decline.push({ p, diff });
    }

    newP.growthPhase = p.age <= 24 ? 'growth' : p.age <= 29 ? 'peak' : p.age <= 33 ? 'earlydecline' : 'decline';
    return newP;
  });

  return { players: developed, summary };
}


/* ═══════════════════════════════════════════════
   INJURY SYSTEM
   試合後の怪我チェック・回復ティック
═══════════════════════════════════════════════ */

const INJURY_TYPES = [
  { label: '軽微',           days: [5,  14],  weight: 55 },
  { label: '筋肉系',         days: [15, 30],  weight: 30 },
  { label: '骨折',           days: [31, 60],  weight: 12 },
  { label: 'シーズンエンド', days: [143, 143], weight: 3  },
];

export function checkForInjuries(players) {
  const injured = [];
  for (const p of players) {
    if ((p.injuryDaysLeft ?? 0) > 0) continue;
    const ageMod  = p.age > 33 ? 2.0 : p.age > 29 ? 1.4 : 1.0;
    const condMod = (p.condition || 100) < 70 ? 1.6 : 1.0;
    if (Math.random() < 0.003 * ageMod * condMod) { // 0.3%/試合が基準（過去0.7%は多すぎた）
      const roll = Math.random() * 100;
      let cum = 0, type = INJURY_TYPES[0];
      for (const t of INJURY_TYPES) { cum += t.weight; if (roll < cum) { type = t; break; } }
      const days = rng(type.days[0], type.days[1]);
      injured.push({ id: p.id, type: type.label, days });
    }
  }
  return injured;
}

export function tickInjuries(players) {
  return players.map(p => {
    if (!p.injuryDaysLeft) return p;
    const next = Math.max(0, p.injuryDaysLeft - 1);
    return { ...p, injuryDaysLeft: next, injury: next > 0 ? p.injury : null };
  });
}
