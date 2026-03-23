import { rng, rngf, clamp } from '../utils';
import { PITCH_NORM, PITCH_HARD_CAP, FATIGUE_WARNING, FATIGUE_LIMIT } from '../constants';

/* ================================================================
   SIMULATION ENGINE v4.0
   設計方針：
     Step A  NPB2024実績ベースのベースライン確率
     Step B  能力値が確率を動かす（打者・投手の平均で合成）
     Step C  球種・コースは演出レイヤー（結果に意味を乗せる）
     Step D  キャリブレーション対応（調整箇所を1か所に集約）
   ================================================================ */


// ═══════════════════════════════════════════════════════════════
//  SECTION 1: ベースライン確率（Step A）
//  2024 NPB実績から算出。ここが「正解」の基準値。
//  ※キャリブレーションでもここは変えない
// ═══════════════════════════════════════════════════════════════

const BASELINE = {
  bb:  0.0727,
  hbp: 0.0095,
  k:   0.1990,
  hr:  0.0175,
  d:   0.0369,
  t:   0.0042,
  s:   0.1656,
  out: 0.4946,
};


// ═══════════════════════════════════════════════════════════════
//  SECTION 2: 能力値→確率の変換（Step B）
//  ★キャリブレーションで調整する主な箇所★
// ═══════════════════════════════════════════════════════════════

const ABILITY_RANGE = {
  eye:       { lo: 0.030, mid: BASELINE.bb,  hi: 0.130 },
  contact:   { lo: 0.100, mid: BASELINE.s,   hi: 0.240 },
  power:     { lo: 0.003, mid: BASELINE.hr,  hi: 0.050 },
  speed:     { lo: 0.003, mid: BASELINE.t,   hi: 0.012 },
  p_control: { lo: 0.130, mid: BASELINE.bb,  hi: 0.030 },
  p_stuff:   { lo: 0.120, mid: BASELINE.k,   hi: 0.300 },
  p_power:   { lo: 0.030, mid: BASELINE.hr,  hi: 0.005 },
};

function abilityToProb(ability, range) {
  const t = clamp((ability - 1) / 98, 0, 1);
  const curved = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  return range.lo + (range.hi - range.lo) * curved;
}

// ★合成ルール（ここ1か所を変えれば全打席に反映）★
function mergeProb(batterProb, pitcherProb) {
  return (batterProb + pitcherProb) / 2;
}

// 投球方針による確率補正
function applyPitchingPolicy(probs, policy) {
  if (!policy || policy === 'normal') return probs;
  const m = { ...probs };
  if (policy === 'fastball') { m.hr *= 1.10; m.k   *= 1.15; m.bb  *= 1.12; }
  if (policy === 'breaking') { m.k  *= 1.20; m.out *= 1.10; m.hr  *= 0.85; }
  if (policy === 'control')  { m.bb *= 0.65; m.k   *= 0.88; m.s   *= 1.08; }
  const sum = Object.values(m).reduce((a, b) => a + b, 0);
  Object.keys(m).forEach(k => { m[k] /= sum; });
  return m;
}


// ═══════════════════════════════════════════════════════════════
//  SECTION 3: 環境レイヤー（球場・リーグ係数）
// ═══════════════════════════════════════════════════════════════

export const STADIUMS = {
  jingu:      { name: '神宮球場',           lf: 97,  cf: 120, rf: 97,  hrMod: 1.15, type: 'outdoor' },
  yokohama:   { name: '横浜スタジアム',     lf: 94,  cf: 117, rf: 94,  hrMod: 1.20, type: 'outdoor' },
  mazda:      { name: 'マツダスタジアム',   lf: 101, cf: 122, rf: 100, hrMod: 0.95, type: 'outdoor' },
  hanshin:    { name: '甲子園',             lf: 95,  cf: 118, rf: 95,  hrMod: 0.90, type: 'outdoor' },
  tokyo_dome: { name: '東京ドーム',         lf: 100, cf: 122, rf: 100, hrMod: 1.05, type: 'dome'    },
  nagoya:     { name: 'バンテリンドーム',   lf: 100, cf: 122, rf: 100, hrMod: 0.85, type: 'dome'    },
  paypaydome: { name: 'みずほペイペイドーム', lf: 100, cf: 122, rf: 100, hrMod: 1.00, type: 'dome'  },
  rakuten:    { name: '楽天モバイル',       lf: 100, cf: 122, rf: 100, hrMod: 1.00, type: 'outdoor' },
  seibu:      { name: 'ベルーナドーム',     lf: 98,  cf: 118, rf: 98,  hrMod: 1.05, type: 'dome'    },
  zozopark:   { name: 'ZOZOマリン',         lf: 99,  cf: 122, rf: 99,  hrMod: 0.95, type: 'outdoor' },
  escon:      { name: 'エスコンフィールド', lf: 96,  cf: 120, rf: 96,  hrMod: 1.10, type: 'dome'    },
  kyocera:    { name: '京セラドーム',       lf: 100, cf: 122, rf: 100, hrMod: 0.90, type: 'dome'    },
};

export const TEAM_STADIUM = { 0:'jingu', 1:'yokohama', 2:'mazda', 3:'hanshin', 4:'tokyo_dome', 5:'nagoya', 6:'paypaydome', 7:'rakuten', 8:'seibu', 9:'zozopark', 10:'escon', 11:'kyocera' };

export const DEFAULT_LEAGUE_ENV = {
  hrMod: 1.00, bbMod: 1.00, kMod: 1.00, hitMod: 1.00, label: '通常',
};


// ═══════════════════════════════════════════════════════════════
//  SECTION 4: 打席結果の確率計算（Step A + B + 環境レイヤー）
// ═══════════════════════════════════════════════════════════════

function calcPAProbs(bat, pit, leagueEnv = DEFAULT_LEAGUE_ENV) {
  const batEye     = bat?.batting?.eye     || 50;
  const batContact = bat?.batting?.contact || 50;
  const batPower   = bat?.batting?.power   || 50;
  const batSpeed   = bat?.batting?.speed   || 50;
  const pitControl = pit?.pitching?.control  || 50;
  const pitStuff   = ((pit?.pitching?.velocity || 50) + (pit?.pitching?.breaking || 50)) / 2;
  const pitVel     = pit?.pitching?.velocity || 50;

  const batBB = abilityToProb(batEye,     ABILITY_RANGE.eye);
  const batS  = abilityToProb(batContact, ABILITY_RANGE.contact);
  const batHR = abilityToProb(batPower,   ABILITY_RANGE.power);
  const batT  = abilityToProb(batSpeed,   ABILITY_RANGE.speed);

  const pitBB = abilityToProb(pitControl, ABILITY_RANGE.p_control);
  const pitK  = abilityToProb(pitStuff,   ABILITY_RANGE.p_stuff);
  const pitHR = abilityToProb(pitVel,     ABILITY_RANGE.p_power);

  let bb  = mergeProb(batBB, pitBB) * leagueEnv.bbMod;
  let k   = mergeProb(BASELINE.k * (1 - (batContact - 50) / 200), pitK) * leagueEnv.kMod;
  let hr  = mergeProb(batHR, pitHR) * leagueEnv.hrMod;
  let s   = batS * (1 - (pitStuff - 50) / 300) * leagueEnv.hitMod;
  let d   = BASELINE.d * (batPower / 50) * 0.7 + BASELINE.d * 0.3 * leagueEnv.hitMod;
  let t   = batT;
  let hbp = BASELINE.hbp;

  // STEP1安全弁: k+bb+hbpの合計が1を超えた場合、比率を保ちながらスケールダウン
  const nonBatSum = k + bb + hbp;
  if (nonBatSum > 1) { const nbs = 1 / nonBatSum; k *= nbs; bb *= nbs; hbp *= nbs; }

  const raw   = { bb, hbp, k, hr, d, t, s };
  const total = Object.values(raw).reduce((a, b) => a + b, 0);
  const scale = total > 1 ? 1 / total : 1;
  const out   = Math.max(0, 1 - total * scale);

  return { bb: bb*scale, hbp: hbp*scale, k: k*scale, hr: hr*scale, d: d*scale, t: t*scale, s: s*scale, out };
}


// ═══════════════════════════════════════════════════════════════
//  SECTION 5: 結果サンプリング
// ═══════════════════════════════════════════════════════════════

function sampleResult(probs) {
  let r = Math.random(), cum = 0;
  for (const [key, p] of Object.entries(probs)) {
    cum += p;
    if (r < cum) return key;
  }
  return 'out';
}


// ═══════════════════════════════════════════════════════════════
//  SECTION 6: 演出レイヤー（Step C）
// ═══════════════════════════════════════════════════════════════

const PITCH_TYPES = {
  fastball: { name: '直球'           },
  slider:   { name: 'スライダー'     },
  curve:    { name: 'カーブ'         },
  fork:     { name: 'フォーク'       },
  changeup: { name: 'チェンジアップ' },
};

function selectPitchForResult(result, pit) {
  const variety = pit?.pitching?.variety || 50;
  const w = { fastball: 50 };
  if (variety > 40) w.slider   = 20;
  if (variety > 50) w.curve    = 15;
  if (variety > 60) w.fork     = 20;
  if (variety > 45) w.changeup = 15;
  if (result === 'k')  { if (w.fork) w.fork *= 2; if (w.slider) w.slider *= 1.5; }
  if (['hr','d','s'].includes(result)) w.fastball *= 1.5;
  return weightedRandom(w);
}

function selectZoneForResult(result, bat) {
  const power = bat?.batting?.power || 50;
  if (result === 'hr') return power > 65 ? (Math.random() < 0.6 ? 'inner_mid' : 'mid_mid') : 'outer_mid';
  if (result === 'k')  return Math.random() < 0.5 ? 'outer_low' : 'mid_low';
  if (result === 'bb') return 'outer_low';
  return ['inner_mid','mid_mid','outer_mid','inner_low','mid_low','outer_low'][rng(0, 5)];
}


// ═══════════════════════════════════════════════════════════════
//  SECTION 7: 球場ファクター
// ═══════════════════════════════════════════════════════════════

function applyStadiumFactor(result, bat, stadium) {
  if (!stadium) return result;
  if (result === 'hr') return Math.random() > stadium.hrMod ? 'd' : 'hr';
  if (result === 'd'  && Math.random() < (stadium.hrMod - 1) * 0.3) return 'hr';
  return result;
}


// ═══════════════════════════════════════════════════════════════
//  SECTION 8: メイン打席シミュレーション
// ═══════════════════════════════════════════════════════════════

function simAtBat(bat, pit, strategy = 'normal', pitchCount = 0, situation = {}, leagueEnv = DEFAULT_LEAGUE_ENV) {
  if (strategy === 'walk') {
    return { result: 'bb', pitches: 1, isIntentional: true, pitchType: null, zone: null, pitchLog: [] };
  }

  const pitchingBonus = situation.coachBonuses?.pitching || 0;
  const fatigue       = calcEffectiveFatigue(pitchCount, pit);
  const fatiguedPit   = applyFatigue(pit, fatigue, pitchingBonus);
  const situatedBat   = applyBatterSituation(bat, situation);
  let   probs         = calcPAProbs(situatedBat, fatiguedPit, leagueEnv);
  probs               = applyPitchingPolicy(probs, situation.pitchingPolicy);
  const stadium       = situation.stadium ? STADIUMS[situation.stadium] : null;

  let result = sampleResult(probs);
  result = applyStadiumFactor(result, bat, stadium);

  if (strategy === 'bunt' && (result === 's' || result === 'out')) {
    result = Math.random() < 0.65 ? 'sac' : 'out';
  }

  const pitchType = selectPitchForResult(result, pit);
  const zone      = selectZoneForResult(result, bat);
  const pitches   = estimatePitchCount(result);

  return { result, pitches, pitchType, zone, pitchLog: [{ pitchType, zone, result }], ev: 0, la: 0, dist: 0, isIntentional: false };
}


// ═══════════════════════════════════════════════════════════════
//  SECTION 9: 補助関数
// ═══════════════════════════════════════════════════════════════

function applyFatigue(pit, fatigue, pitchingBonus = 0) {
  const moraleMod = ((pit?.morale || 70) - 70) / 250; // 個人モラルを投手能力に反映
  if (fatigue < (30 + pitchingBonus * 3) && Math.abs(moraleMod) < 0.001) return pit;
  const m = fatigue / 100;
  return { ...pit, pitching: { ...pit?.pitching,
    control:  Math.max(1, (pit?.pitching?.control||50)  - m*20 + moraleMod * 50),
    velocity: Math.max(1, (pit?.pitching?.velocity||50) - m*15 + moraleMod * 30),
    breaking: Math.max(1, (pit?.pitching?.breaking||50) - m*10 + moraleMod * 20),
  }};
}

function applyBatterSituation(bat, situation) {
  const clutch    = bat?.batting?.clutch || 50;
  const condition = (bat?.condition || 100) / 100;
  const morale    = bat?.morale || 70; // 個人モラルを使用
  const isClutch  = situation.runnersInScoring && situation.closeGame;
  const clutchMod = isClutch ? (clutch - 50) / 200 : 0;
  const moraleMod = (morale - 70) / 250; // 効果2倍, 基準値を70に変更
  // ① 対左投手補正: 左投手の場合、打者のvsLeft能力で打撃を補正
  const vsLeft    = bat?.batting?.vsLeft || 50;
  const vsLeftMod = (situation.pitcherHand === 'left') ? (vsLeft - 50) / 300 : 0;
  return { ...bat, batting: { ...bat?.batting,
    contact: clamp((bat?.batting?.contact||50) * condition + clutchMod * 50 + moraleMod * 50 + vsLeftMod * 50, 1, 99),
    power:   clamp((bat?.batting?.power  ||50) * condition + clutchMod * 30 + moraleMod * 30 + vsLeftMod * 30, 1, 99),
    eye:     clamp((bat?.batting?.eye    ||50) * condition + moraleMod * 20, 1, 99),
  }};
}

function estimatePitchCount(result) {
  switch (result) {
    case 'bb':  return rng(4, 6);
    case 'k':   return rng(3, 6);
    case 'hr':  return rng(1, 4);
    case 'hbp': return 1;
    case 'sac': return rng(1, 3);
    default:    return rng(1, 5);
  }
}

function calcFatigue(pitchCount, stamina) {
  return clamp(Math.round(pitchCount / PITCH_NORM * 100 * (1 - (stamina - 50) / 200)), 0, 100);
}

function calcEffectiveFatigue(pitchCount, pitcher) {
  const stamina   = pitcher?.pitching?.stamina ?? 50;
  const condition = pitcher?.condition ?? 70;
  return calcFatigue(pitchCount, stamina * (condition / 100));
}

function weightedRandom(weights) {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (const [key, w] of Object.entries(weights)) { r -= w; if (r <= 0) return key; }
  return Object.keys(weights)[0];
}

function matchupScore(bat, pit) {
  if (!bat?.batting || !pit?.pitching) return 0;
  const off = (bat.batting.contact * 2 + bat.batting.power + bat.batting.eye) / 4;
  const def = (pit.pitching.velocity + pit.pitching.control * 2 + pit.pitching.breaking) / 4;
  return Math.round((off - def) / 100 * 100);
}


// ═══════════════════════════════════════════════════════════════
//  SECTION 10: ゲーム状態管理（既存コードと互換）
// ═══════════════════════════════════════════════════════════════

// ブルペンを役割順（中継ぎ→抑え→先発）に並べる
function sortBullpen(pitchers) {
  const ORDER = { '中継ぎ': 0, '抑え': 1, '先発': 2 };
  return [...pitchers].sort((a, b) => {
    const ao = ORDER[a.subtype] ?? 2;
    const bo = ORDER[b.subtype] ?? 2;
    if (ao !== bo) return ao - bo;
    return (b.pitching?.stamina ?? 50) - (a.pitching?.stamina ?? 50);
  });
}

function makePitcherState(inning, isTop) {
  return { enteredInning: inning, enteredIsTop: isTop, enteredOuts: 0, battersFaced: 0 };
}

function scoreBullpenArm(pitcher, targetRole) {
  const stuff = ((pitcher?.pitching?.velocity ?? 50) + (pitcher?.pitching?.control ?? 50) * 1.2 + (pitcher?.pitching?.breaking ?? 50)) / 3.2;
  const stamina = pitcher?.pitching?.stamina ?? 50;
  const condition = pitcher?.condition ?? 70;
  const subtype = pitcher?.subtype;
  const roleBonus = targetRole === 'closer'
    ? (subtype === '抑え' ? 14 : subtype === '中継ぎ' ? 7 : -8)
    : targetRole === 'setup'
      ? (subtype === '中継ぎ' ? 10 : subtype === '抑え' ? 6 : -4)
      : targetRole === 'long'
        ? (subtype === '先発' ? 12 : subtype === '中継ぎ' ? 4 : -6)
        : (subtype === '中継ぎ' ? 9 : subtype === '先発' ? 4 : 2);
  return stuff + stamina * 0.18 + condition * 0.22 + roleBonus;
}

function pickBullpenArm(bullpen, targetRole) {
  if (!bullpen?.length) return null;

  const roleGroups = {
    closer: ['抑え', '中継ぎ', '先発'],
    setup: ['中継ぎ', '抑え', '先発'],
    middle: ['中継ぎ', '先発', '抑え'],
    long: ['先発', '中継ぎ', '抑え'],
  };

  const groups = roleGroups[targetRole] || roleGroups.middle;
  const candidates = groups
    .map(subtype => bullpen.filter(p => p.subtype === subtype))
    .find(group => group.length > 0) || bullpen;

  return [...candidates].sort((a, b) => scoreBullpenArm(b, targetRole) - scoreBullpenArm(a, targetRole))[0] || bullpen[0];
}

function initGameState(myTeam, oppTeam) {
  const myL = myTeam.lineup.map(id => myTeam.players.find(p => p.id === id)).filter(Boolean);
  const opL = oppTeam.lineup.map(id => oppTeam.players.find(p => p.id === id)).filter(Boolean);
  const myStarter = myTeam.players.find(p => p.id === myTeam.rotation[myTeam.rotIdx % Math.max(myTeam.rotation.length,1)]) || myTeam.players.find(p => p.isPitcher && p.subtype === '先発');
  const opStarter = oppTeam.players.find(p => p.id === oppTeam.rotation[oppTeam.rotIdx % Math.max(oppTeam.rotation.length,1)]) || oppTeam.players.find(p => p.isPitcher);
  const stadiumKey = TEAM_STADIUM[oppTeam.id] || 'tokyo_dome';

  return {
    inning: 1, isTop: true, score: { my: 0, opp: 0 },
    outs: 0, bases: [null,null,null], log: [], inningSummary: [],
    myLineup: [...myL], opLineup: [...opL],
    myBatIdx: 0, opBatIdx: 0,
    myPitcher: myStarter, opPitcher: opStarter,
    myPitchCount: 0, opPitchCount: 0,
    myPitcherState: makePitcherState(1, true),
    opPitcherState: makePitcherState(1, false),
    myBullpen: sortBullpen(myTeam.players.filter(p => p.isPitcher && p.id !== myStarter?.id)),
    opBullpen: sortBullpen(oppTeam.players.filter(p => p.isPitcher && p.id !== opStarter?.id)),
    myBench:   myTeam.players.filter(p => !p.isPitcher && !myTeam.lineup.includes(p.id)),
    usedBullpen: [], usedPH: {}, usedPR: {},
    momentum: 50, stopped: false, stopReason: null, stopData: null,
    pendingStrategy: 'normal', gameOver: false,
    myInningRuns: 0, opInningRuns: 0,
    teamMorale: myTeam.morale || 60,
    stadium: stadiumKey,
    leagueEnv: myTeam.leagueEnv || DEFAULT_LEAGUE_ENV,
    coachBonuses: (()=>{ const c=myTeam.coaches||[]; return { running:c.filter(x=>x.type==='running').reduce((s,x)=>s+(x.bonus||0),0), pitching:c.filter(x=>x.type==='pitching').reduce((s,x)=>s+(x.bonus||0),0) }; })(),
    pitchingPolicy: myTeam.pitchingPolicy || 'normal',
  };
}

function processAtBat(gs, strategy = 'normal') {
  if (!gs.myLineup.length || !gs.opLineup.length) return gs; // STEP2安全弁: 空lineup guard
  const isMyAtBat  = !gs.isTop;
  const batter     = isMyAtBat ? gs.myLineup[gs.myBatIdx % gs.myLineup.length] : gs.opLineup[gs.opBatIdx % gs.opLineup.length];
  const pitcher    = isMyAtBat ? gs.opPitcher : gs.myPitcher;
  const pitchCount = isMyAtBat ? gs.opPitchCount : gs.myPitchCount;

  if (strategy === 'steal') {
    const newBases  = [...gs.bases];
    const stealBase = newBases[0] ? 0 : newBases[1] ? 1 : -1;
    if (stealBase >= 0) {
      const lineup      = isMyAtBat ? gs.myLineup : gs.opLineup;
      const runner       = lineup.find(p => p.id === newBases[stealBase]) || batter;
      const runningBonus = gs.coachBonuses?.running || 0;
      const successRate  = clamp(0.65 + (runner?.batting?.speed||50)/500 + (runner?.batting?.stealSkill||50)/600 - (pitcher?.pitching?.control||60)/600 + runningBonus * 0.025, 0.35, 0.92);
      const success     = Math.random() < successRate;
      if (success) { newBases[stealBase+1] = newBases[stealBase]; newBases[stealBase] = null; }
      else          { newBases[stealBase] = null; }
      const result      = success ? 'sb' : 'cs';
      const newOuts     = success ? gs.outs : gs.outs+1;
      const newMomentum = clamp(gs.momentum + (success ? (isMyAtBat?6:-6) : (isMyAtBat?-5:5)), 0, 100);
      const stealLog    = { inning:gs.inning, isTop:gs.isTop, batter:runner?.name||'?', batId:runner?.id, pitcherId:pitcher?.id, result, ev:0, la:0, dist:0, rbi:0, outs:newOuts, bases:[...newBases], pitches:0, strategy:'steal', scorer:isMyAtBat, isStolenBase:true };
      const newGs = { ...gs, outs:newOuts, bases:newBases, momentum:newMomentum, log:[...gs.log, stealLog] };
      if (newOuts >= 3) return endHalfInning(newGs);
      return processAtBat(newGs, 'normal');
    }
  }

  const ftl           = (isMyAtBat ? gs.opLineup : gs.myLineup).filter(p => !p.isPitcher);
  const fieldingLevel = ftl.length > 0 ? ftl.reduce((s,p) => s+(p.batting?.defense||50),0)/ftl.length : 50;
  const situation     = { runnersOnBase: gs.bases.some(Boolean), runnersInScoring: gs.bases[1]||gs.bases[2], lateGame: gs.inning>=7, closeGame: Math.abs((gs.score?.my||0)-(gs.score?.opp||0))<=2, fieldingLevel, pitchCount, teamMorale: gs.teamMorale||60, stadium: gs.stadium, pitcherHand: pitcher?.hand || 'right', pitchingPolicy: isMyAtBat ? 'normal' : (gs.pitchingPolicy || 'normal'), coachBonuses: isMyAtBat ? {} : (gs.coachBonuses || {}) };

  const { result, pitches, pitchType, zone, isIntentional, pitchLog } = simAtBat(batter, pitcher, strategy, pitchCount, situation, gs.leagueEnv);

  let newBases = [...gs.bases];
  let runs = 0, rbi = 0, outs = gs.outs, momentumDelta = 0;
  const isOut = ['k','go','fo','out','sac'].includes(result);
  const runnerOf    = i => { const rid = newBases[i]; if (!rid) return null; return (isMyAtBat?gs.myLineup:gs.opLineup).find(p=>p.id===rid)||null; };
  const advanceProb = (runner, base=0.5) => !runner ? base : clamp(base + ((runner.batting?.speed||50)-50)/400 + ((runner.batting?.baseRunning||50)-50)/600, base-0.15, base+0.20);

  if (isOut) {
    outs++; momentumDelta = isMyAtBat ? -3 : 3;
    if (result === 'sac' && newBases[0]) newBases = [null, newBases[0], null];
  } else if (result === 'bb' || result === 'hbp') {
    if (newBases[0]&&newBases[1]&&newBases[2]) {
      runs++; rbi=1;
      newBases=[batter?.id||'r', newBases[0], newBases[1]]; // r3得点, r2→3塁, r1→2塁, 打者→1塁
    } else {
      if (newBases[0]&&newBases[1]) { newBases[2]=newBases[1]; newBases[1]=newBases[0]; } // r2→3塁, r1→2塁
      else if (newBases[0]) newBases[1]=newBases[0]; // r1→2塁
      newBases[0]=batter?.id||'r';
    }
    momentumDelta=isMyAtBat?2:-2;
  } else if (result === 'hr') {
    rbi=1+newBases.filter(Boolean).length; runs=rbi; newBases=[null,null,null]; momentumDelta=isMyAtBat?18:-18;
  } else if (result === 't') {
    rbi=newBases.filter(Boolean).length; runs=rbi; newBases=[null,null,batter?.id||'r']; momentumDelta=isMyAtBat?12:-12;
  } else if (result === 'd') {
    const r3=newBases[2]?1:0, r2=newBases[1]?1:0, r1=newBases[0]&&Math.random()<advanceProb(runnerOf(0),0.40)?1:0;
    runs=r3+r2+r1; rbi=runs; newBases=[null,batter?.id||'r',r1?null:newBases[0]]; momentumDelta=isMyAtBat?8:-8;
  } else if (result === 's') {
    const r3=newBases[2]?1:0, r2=newBases[1]&&Math.random()<advanceProb(runnerOf(1),0.55)?1:0;
    runs=r3+r2; rbi=runs; newBases=[batter?.id||'r',newBases[0],r2?null:newBases[1]]; momentumDelta=isMyAtBat?5:-5;
  }

  // エンドラン: 一塁走者の追加進塁処理
  if (strategy === 'hitrun' && gs.bases[0]) {
    const r1id = gs.bases[0];
    if (result === 's' && newBases[1] === r1id && !newBases[2]) {
      // 単打: 1塁走者が3塁へ（2塁に止まらずさらに進塁）
      newBases[2] = r1id; newBases[1] = null;
    } else if (result === 'd' && newBases[2] === r1id) {
      // 2塁打: 1塁走者が生還（3塁で止まらず生還）
      runs++; rbi++; newBases[2] = null;
    } else if (result === 'k') {
      // 三振: 走者が走っているため50%でCS
      if (Math.random() < 0.50) { outs++; newBases[0] = null; }
    } else if (result === 'out' && newBases[0] === r1id) {
      // ゴロ/フライ判定（50/50）
      if (Math.random() < 0.50) {
        // ゴロ想定: 走者が2塁へ進塁
        if (!newBases[1]) { newBases[1] = r1id; newBases[0] = null; }
      } else {
        // フライ想定: タッグアップ 70%でCS
        if (Math.random() < 0.70) { outs++; newBases[0] = null; }
      }
    }
  }

  const newMomentum = clamp(gs.momentum+momentumDelta, 0, 100);
  const newScore    = { ...gs.score };
  if (isMyAtBat) newScore.my+=runs; else newScore.opp+=runs;
  let newMyPC=gs.myPitchCount, newOpPC=gs.opPitchCount;
  if (isMyAtBat) newOpPC+=pitches; else newMyPC+=pitches;

  const logEntry = { inning:gs.inning, isTop:gs.isTop, batter:batter?.name||'?', batId:batter?.id, pitcherId:pitcher?.id, result, ev:0, la:0, dist:0, rbi, outs:isOut?outs:gs.outs, bases:[...newBases], pitches, isIntentional, strategy:strategy!=='normal'?strategy:undefined, scorer:isMyAtBat, pitchLog, pitchType, zone };
  const nextMyPitcherState = isMyAtBat
    ? gs.myPitcherState
    : { ...(gs.myPitcherState || makePitcherState(gs.inning, gs.isTop)), battersFaced: (gs.myPitcherState?.battersFaced || 0) + 1 };
  const nextOpPitcherState = isMyAtBat
    ? { ...(gs.opPitcherState || makePitcherState(gs.inning, gs.isTop)), battersFaced: (gs.opPitcherState?.battersFaced || 0) + 1 }
    : gs.opPitcherState;

  return { ...gs, outs, bases:newBases, score:newScore, log:[...gs.log,logEntry], myBatIdx:isMyAtBat?gs.myBatIdx+1:gs.myBatIdx, opBatIdx:!isMyAtBat?gs.opBatIdx+1:gs.opBatIdx, myPitchCount:newMyPC, opPitchCount:newOpPC, myPitcherState:nextMyPitcherState, opPitcherState:nextOpPitcherState, momentum:newMomentum, myInningRuns:!gs.isTop?gs.myInningRuns+runs:gs.myInningRuns, opInningRuns:gs.isTop?gs.opInningRuns+runs:gs.opInningRuns, stopped:false, stopReason:null, pendingStrategy:'normal' };
}

function endHalfInning(gs) {
  const isTop      = gs.isTop;
  const newInn     = isTop ? gs.inning : gs.inning+1;
  const newSummary = [...gs.inningSummary, { inning:gs.inning, isTop, runs:isTop?gs.opInningRuns:gs.myInningRuns }];
  if (!isTop && gs.inning===9 && gs.score.my>gs.score.opp) return { ...gs, inningSummary:newSummary, gameOver:true, outs:0, bases:[null,null,null] };
  if (newInn>9  && gs.score.my!==gs.score.opp)             return { ...gs, inningSummary:newSummary, gameOver:true, outs:0, bases:[null,null,null] };
  if (newInn>12)                                            return { ...gs, inningSummary:newSummary, gameOver:true, outs:0, bases:[null,null,null] };
  return { ...gs, inning:newInn, isTop:!isTop, outs:0, bases:[null,null,null], inningSummary:newSummary, myInningRuns:0, opInningRuns:0 };
}

function checkStopCondition(gs) {
  const myEffFatigue = calcEffectiveFatigue(gs.myPitchCount, gs.myPitcher);
  if (gs.isTop && (myEffFatigue >= FATIGUE_LIMIT || gs.myPitchCount >= PITCH_HARD_CAP))
    return { reason:'pitcher_limit',           label:'🚨 投手交代必須',             priority:5, data:{ pitchCount:gs.myPitchCount, fatigue:myEffFatigue, pitcher:gs.myPitcher } };
  if (gs.isTop && myEffFatigue >= FATIGUE_WARNING && gs.myBullpen.length>0)
    return { reason:'pitcher_tired',           label:'⚠️ 投手疲労警告',           priority:2, data:{ pitchCount:gs.myPitchCount, fatigue:myEffFatigue, pitcher:gs.myPitcher } };
  if (gs.isTop && gs.outs===2 && (gs.bases[1]||gs.bases[2]) && gs.myBullpen.length>0)
    return { reason:'scoring_position_crisis', label:'🔴 得点圏ピンチ！',           priority:3, data:null };
  const myBehind = gs.score.opp-gs.score.my;
  if (!gs.isTop && myBehind>=0 && myBehind<=2 && gs.bases.some(Boolean))
    return { reason:'scoring_chance',          label:'🟡 チャンス！采配を指示',     priority:2, data:{ gap:myBehind } };
  if (!gs.isTop && gs.inning>=7) {
    const nextBatter = gs.myLineup.length > 0 ? gs.myLineup[gs.myBatIdx % gs.myLineup.length] : null; // STEP2安全弁
    if (nextBatter?.batting?.contact<60 && gs.myBench.length>0)
      return { reason:'pinch_hit_chance',      label:'💡 代打のチャンス',           priority:1, data:{ batter:nextBatter } };
  }
  if (gs.isTop && gs.inning>=8) {
    const diff=gs.score.my-gs.score.opp;
    // 本物の抑えがいる場合のみクローザー投入タイミングを通知する
    const closers=gs.myBullpen.filter(p=>p.subtype==='抑え');
    if (diff>=1 && diff<=2 && closers.length>0 && gs.myPitcher?.subtype==='先発')
      return { reason:'closer_time',           label:'🔒 クローザー投入タイミング', priority:2, data:{ closers } };
  }
  return null;
}

// バッチシム用: 先発→中継ぎ→セットアッパー→抑えの流れを意識して自動継投
function autoSwapPitcher(gs, side) {
  const pitcher = side === 'my' ? gs.myPitcher : gs.opPitcher;
  const pitchCount = side === 'my' ? gs.myPitchCount : gs.opPitchCount;
  const pitcherState = side === 'my' ? gs.myPitcherState : gs.opPitcherState;
  const bullpen = side === 'my' ? gs.myBullpen : gs.opBullpen;

  if (!bullpen || bullpen.length === 0) return gs;

  const myLead = gs.score.my - gs.score.opp;
  const lead = side === 'my' ? myLead : -myLead;
  const isStarter = pitcher?.subtype === '先発';
  const isReliever = !isStarter;
  const isLate = gs.inning >= 7;
  const isExtra = gs.inning >= 10;
  const isCloseGame = Math.abs(lead) <= 3;
  const runnersInScoringPosition = Boolean(gs.bases[1] || gs.bases[2]);
  const effectiveFatigue = calcEffectiveFatigue(pitchCount, pitcher);
  const fatigueWarning = effectiveFatigue >= FATIGUE_WARNING || pitchCount >= PITCH_HARD_CAP;
  const fatigueLimit   = effectiveFatigue >= FATIGUE_LIMIT   || pitchCount >= PITCH_HARD_CAP;
  const battersFaced = pitcherState?.battersFaced || 0;
  const startedPreviousDefensiveFrame = Boolean(pitcherState) && pitcherState.enteredInning !== gs.inning;

  const saveSituation = gs.inning >= 9 && lead >= 1 && lead <= 3;
  const setupSituation = gs.inning === 8 && lead >= 0 && lead <= 3;
  const bridgeSituation = gs.inning >= 6 && gs.inning <= 7 && lead >= -2 && lead <= 4;
  const leverageCrisis = isLate && isCloseGame && runnersInScoringPosition && gs.outs >= 1;

  const starterShouldYield = isStarter && (
    fatigueLimit
    || (gs.inning >= 6 && fatigueWarning)
    || (gs.inning >= 7 && lead > 0)  // 同点(lead=0)では先発続投を許容
    || (leverageCrisis && effectiveFatigue >= Math.max(FATIGUE_WARNING - 10, 50))
  );

  const hasCloserInBullpen = bullpen.some(p => p.subtype === '抑え');
  const relieverShouldYield = isReliever && (
    fatigueLimit
    || (fatigueWarning && battersFaced >= 4)
    || (startedPreviousDefensiveFrame && battersFaced >= 3)
    || (saveSituation && pitcher?.subtype !== '抑え' && hasCloserInBullpen)  // ブルペンに抑えがいる場合のみ交代
    || (setupSituation && effectiveFatigue >= Math.max(FATIGUE_WARNING - 15, 30))
  );

  if (!starterShouldYield && !relieverShouldYield) return gs;

  const targetRole = saveSituation
    ? 'closer'
    : (setupSituation || leverageCrisis)
      ? 'setup'
      : (isExtra || lead <= -2)
        ? 'long'
        : 'middle';

  const nextPitcher = pickBullpenArm(bullpen, targetRole);
  if (!nextPitcher) return gs;

  const newBullpen = bullpen.filter(p => p.id !== nextPitcher.id);
  const resetState = makePitcherState(gs.inning, gs.isTop);

  if (side === 'my') {
    return { ...gs, myPitcher: nextPitcher, myBullpen: newBullpen, myPitchCount: 0, myPitcherState: resetState };
  }
  return { ...gs, opPitcher: nextPitcher, opBullpen: newBullpen, opPitchCount: 0, opPitcherState: resetState };
}

function quickSimGame(myTeam, oppTeam) {
  let gs = initGameState(myTeam, oppTeam);
  while (!gs.gameOver) {
    // 守備側チームの自動継投（球数・終盤・ピンチを両チーム対称に処理）
    if (gs.isTop)  gs = autoSwapPitcher(gs, 'my');
    if (!gs.isTop) gs = autoSwapPitcher(gs, 'op');
    let autoStrategy='normal';
    if (gs.bases[0]&&!gs.bases[1]&&gs.outs<2) {
      const lineup=(!gs.isTop?gs.myLineup:gs.opLineup);
      const runner=lineup.find(p=>p.id===gs.bases[0]);
      const sp=runner?.batting?.speed||50, sk=runner?.batting?.stealSkill||50;
      const prob=sp>=80&&sk>=70?0.28:sp>=70&&sk>=60?0.18:sp>=60&&sk>=50?0.08:0;
      if (Math.random()<prob) autoStrategy='steal';
    }
    gs=processAtBat(gs, autoStrategy);
    if (gs.outs>=3) gs=endHalfInning(gs);
  }
  return { score:gs.score, won:gs.score.my>gs.score.opp, log:gs.log, inningSummary:gs.inningSummary };
}

export { simAtBat, initGameState, processAtBat, endHalfInning, checkStopCondition, quickSimGame, matchupScore, calcFatigue, calcEffectiveFatigue, PITCH_TYPES, BASELINE, ABILITY_RANGE };
