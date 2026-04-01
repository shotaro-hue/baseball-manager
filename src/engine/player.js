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

/**
 * 選手オブジェクトを生成する。
 * @param {string} pos - ポジション（例: "先発" / "捕手"）
 * @param {number} q   - 能力値ベースライン（25〜99 相当の平均値）
 * @param {boolean} isPitch - 投手なら true
 * @param {number|undefined} ageOverride - 指定時は年齢を固定
 * @param {boolean} isForeign - 外国人選手なら true
 * @returns {Object} 初期化済み選手オブジェクト
 */
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
    devGoal: null,
    lastTalkGameDay: 0,
    postingRequested: false,
    morale: rng(60, 100), trust: 50,
    hometown: CITIES[rng(0, CITIES.length - 1)],
    personality: makePers(age), skills: [],
    growthPhase: age <= 24 ? "growth" : age <= 29 ? "peak" : age <= 33 ? "earlyDecline" : "decline",
    stats: emptyStats(),
    stats2: { PA:0, H:0, HR:0, W:0, IP:0, ER:0, K:0 },
    serviceYears: 0, entryAge: age, recentPitchingDays: [],
    entryType: isForeign ? '外国人' : age <= 19 ? '高卒' : age <= 22 ? '大卒' : '社会人',
    daysOnActiveRoster: 0,
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

/**
 * チーム定義から初期チームオブジェクトを構築する（procedural生成）。
 * @param {{ id:number, name:string, budget:number, league:string }} def - TEAM_DEFS の1エントリ
 * @returns {Object} 初期化済みチームオブジェクト（players / farm / lineup / rotation / budget 等を含む）
 */
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
    stadiumLevel: 0,
    revenueThisSeason: 0,
    ownerGoal: "cs",
    ownerTrust: 50,
  };
}
/* ═══════════════════════════════════════════════
   RETIRE SYSTEM
═══════════════════════════════════════════════ */

// 引退意欲スコア計算（0〜100）
/**
 * 選手の引退意欲スコア（0〜100）を計算する。
 * 35歳未満は常に 0。年齢・出場機会・モラル・契約残年・怪我・引退スタイルが影響する。
 * @param {Object} p - 選手オブジェクト
 * @returns {number} 引退意欲スコア（0〜100。30以上で引退候補としてUI表示）
 */
export function calcRetireWill(p) {
  if (p.age < 35) return 0;
  let score = 0;

  // 年齢（精緻化テーブル）
  if      (p.age >= 42) score += 80;
  else if (p.age >= 41) score += 65;
  else if (p.age >= 40) score += 50;
  else if (p.age >= 38) score += 28;
  else if (p.age >= 36) score += 12;
  else                  score += 3; // 35歳

  // 出場機会
  const pa = p.stats?.PA || 0;
  const bf = p.stats?.BF || 0;
  if (p.isPitcher) {
    if (bf < 15)  score += 20;  // ほぼ投げていない
    else if (bf < 40) score += 15;
  } else {
    if (pa < 30)  score += 20;
    else if (pa < 80) score += 15;
  }

  // モラル
  if ((p.morale || 60) < 40) score += 10;

  // 契約残年
  if ((p.contractYearsLeft || 0) === 0) score += 20;

  // 長期負傷（シーズンエンド相当）
  if ((p.injuryDaysLeft || 0) >= 100) score += 25;

  // 引退に関する価値観
  const rs = p.retireStyle || 50;
  if (rs >= 70) {
    score = Math.round(score * 1.4);
  } else if (rs <= 30) {
    score = Math.round(score * 0.6);
  }

  return Math.min(100, score);
}

/**
 * 引退意欲スコアを使ってモンテカルロ方式で引退を判定する。
 * CPU チームのオフシーズン処理でのみ使用。自チームは UI での手動決定が優先。
 * @param {Object} p - 選手オブジェクト
 * @returns {boolean} 引退する場合 true
 */
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

/**
 * 育成目標 (devGoal) から trainingFocus を解決する純粋関数。
 * devGoal 未設定時は null を返す（バランス成長）。
 * @param {Object} player
 * @returns {string|null}
 */
export function resolveTrainingFocusFromGoal(player) {
  const goal = player.devGoal || null;
  if (!goal) return null;
  if (player.isPitcher) {
    const pit = player.pitching ?? {};
    switch (goal) {
      case 'velocity': return 'velocity';
      case 'control':  return 'control';
      case 'breaking': return 'breaking';
      case 'stamina':  return 'stamina';
      case 'rotation':
      case 'promotion': {
        const keys = ['velocity','control','stamina','breaking','variety','sharpness'];
        return keys.reduce((min, k) => (pit[k] ?? 50) < (pit[min] ?? 50) ? k : min, keys[0]);
      }
      default: return null;
    }
  } else {
    const bat = player.batting ?? {};
    switch (goal) {
      case 'batting':   return (bat.contact ?? 50) <= (bat.power ?? 50) ? 'contact' : 'power';
      case 'defense':   return 'defense';
      case 'speed':     return 'speed';
      case 'top_team':
      case 'promotion': {
        const keys = ['contact','power','eye','speed','arm','defense'];
        return keys.reduce((min, k) => (bat[k] ?? 50) < (bat[min] ?? 50) ? k : min, keys[0]);
      }
      default: return null;
    }
  }
}

// 投手の能力別衰退ウェイト（速球は早く衰え、変化球・制球は長持ち）
const PITCHER_DECLINE_WEIGHTS = {
  velocity: 1.4, stamina: 1.2, sharpness: 0.9, control: 0.8, breaking: 0.7, variety: 0.6,
};

function calcGrowthBudget(p) {
  const age = p.age;
  const pot = p.potential ?? 65;
  let base;
  if      (age <= 20) base = rng(8, 13)  + Math.round((pot - 65) * 0.5);
  else if (age <= 24) base = rng(12, 18) + Math.round((pot - 65) * 0.7);
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

  // 晩年ブレイクスルー（28〜34歳: 2%確率で改善ボーナス）
  if (age >= 28 && age <= 34 && base < 0) {
    if (Math.random() < 0.02) return Math.abs(base) * 1.5;
  }

  return base;
}

function applyGrowthToAbilities(abilities, keys, budget, trainingFocus, potential, isPitcher = false) {
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
    if (isGrowth) shuffled.unshift(trainingFocus);
    else          shuffled.push(trainingFocus);
  }

  for (const key of shuffled) {
    if (remaining <= 0 || !(key in result)) break;
    const isFocus = key === trainingFocus;
    // 投手衰退時: 速球は優先的に、制球・変化球は緩やかに衰退
    const declineWeight = (!isGrowth && isPitcher) ? (PITCHER_DECLINE_WEIGHTS[key] ?? 1.0) : 1.0;
    if (isGrowth) {
      const gain = isFocus ? Math.min(remaining, rng(4, 10)) : Math.min(remaining, rng(2, 6));
      result[key] = Math.min(cap, (result[key] || 50) + gain);
      remaining -= gain;
    } else {
      const rawLoss = isFocus ? rng(0, 2) : rng(2, 5);
      const loss = Math.min(remaining, Math.round(rawLoss * declineWeight));
      result[key] = Math.max(1, (result[key] || 50) - loss);
      remaining -= Math.max(1, loss);
    }
  }
  return result;
}

/**
 * シーズン終了後の選手成長・衰退処理。年齢・潜在・trainingFocus・コーチボーナスに基づいて能力値を更新する。
 * @param {Object[]} players  - 対象選手リスト（一軍 or 二軍）
 * @param {Object[]} coaches  - チームコーチリスト（batting/pitching コーチのボーナスを加算）
 * @returns {{ players: Object[], summary: { breakout: Object[], growth: Object[], decline: Object[] } }}
 */
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
      newP.pitching = applyGrowthToAbilities(p.pitching, PITCHER_KEYS, budget, focus, pot, true);
      const diff = PITCHER_KEYS.reduce((s, k) => s + (newP.pitching[k] || 0) - (before[k] || 0), 0);
      if (budget > 0 && diff >= 8) summary.breakout.push({ p, diff, type: 'pitcher' });
      else if (diff > 1)  summary.growth.push({ p, diff });
      else if (diff < -4) summary.decline.push({ p, diff });
    } else if (!p.isPitcher && p.batting) {
      const before = { ...p.batting };
      newP.batting = applyGrowthToAbilities(p.batting, BATTER_KEYS, budget, focus, pot, false);
      const diff = BATTER_KEYS.reduce((s, k) => s + (newP.batting[k] || 0) - (before[k] || 0), 0);
      if (budget > 0 && diff >= 10) summary.breakout.push({ p, diff, type: 'batter' });
      else if (diff > 1)  summary.growth.push({ p, diff });
      else if (diff < -5) summary.decline.push({ p, diff });
    }

    const newPhase = p.age <= 24 ? 'growth' : p.age <= 29 ? 'peak' : p.age <= 33 ? 'earlyDecline' : 'decline';
    newP.growthPhase = newPhase;

    // peakAbilities スナップショット: peak→earlyDecline 遷移時に保存
    if (p.growthPhase === 'peak' && newPhase === 'earlyDecline' && !p.peakAbilities) {
      newP.peakAbilities = p.isPitcher ? { ...p.pitching } : { ...p.batting };
    }

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
