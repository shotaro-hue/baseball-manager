import { rng, clamp, uid, pname, CITIES } from '../utils';
import {
  FIELDING_POSITIONS, PLAYER_TYPES_B, PLAYER_TYPES_P, PLAYER_COMMENTS_B, PLAYER_COMMENTS_P, MIN_SALARY_IKUSEI,
  SECONDARY_POSITION_RULES,
} from '../constants';

export const emptyStats = () => ({
  PA: 0, AB: 0, H: 0, D: 0, T: 0, HR: 0, RBI: 0, BB: 0, K: 0, HBP: 0,
  SB: 0, CS: 0, R: 0, SF: 0, evSum: 0, evN: 0, laSum: 0, laN: 0,
  pullBatted: 0, centerBatted: 0, oppositeBatted: 0, hardHit: 0,
  groundBatted: 0, lineBatted: 0, flyBatted: 0,
  sprayPoints: [],
  battedBallEvents: [],
  FO_LF: 0, FO_CF: 0, FO_RF: 0, GO: 0, LO: 0,
  IP: 0, ER: 0, BBp: 0, HBPp: 0, Kp: 0, HRp: 0, Hp: 0, BF: 0, W: 0, L: 0, SV: 0, HLD: 0, QS: 0, BS: 0,
});

const makePers = (age) => ({
  money: rng(20, 90), winning: rng(20, 90), playing: rng(30, 95),
  hometown: rng(0, 80), loyalty: rng(10, 85),
  stability: rng(age > 28 ? 50 : 20, age > 28 ? 90 : 70),
  future: rng(age < 27 ? 50 : 10, age < 27 ? 90 : 60),
  overseas: rng(0, 100),
});

function assignSecondaryPositions(player) {
  const rules = SECONDARY_POSITION_RULES[player.pos];
  if (!rules) return;
  for (const [secPos, minProf, maxProf] of rules) {
    if (rng(0, 99) < 75) {
      player.positions[secPos] = rng(minProf, maxProf);
    }
  }
}

export function makePlayer(pos, q, isPitch, ageOverride, isForeign = false) {
  const s = (b = 0) => clamp(rng(q - 18 + b, q + 15 + b), 25, 99);
  const age = ageOverride ?? rng(18, 36);
  const player = {
    id: uid(), name: pname(), pos, age, potential: rng(55, 99),
    isPitcher: isPitch, isForeign, salary: 0,
    contractYears: rng(1, 3), contractYearsLeft: rng(1, 3),
    育成: false, isFA: false, condition: rng(80, 100),
    injury: null, injuryDaysLeft: 0, injuryPart: null, injuryHistory: [],
    trainingFocus: null,
    devGoal: null,
    lastTalkGameDay: 0,
    postingRequested: false,
    morale: rng(60, 100), trust: 50,
    hometown: CITIES[rng(0, CITIES.length - 1)],
    personality: makePers(age), skills: [],
    growthPhase: age <= 24 ? 'growth' : age <= 29 ? 'peak' : age <= 33 ? 'earlyDecline' : 'decline',
    stats: emptyStats(),
    stats2: { PA: 0, H: 0, HR: 0, W: 0, IP: 0, ER: 0, K: 0 },
    serviceYears: 0, entryAge: age, recentPitchingDays: [],
    entryType: isForeign ? '外国人' : age <= 19 ? '高校生' : age <= 22 ? '大卒' : '社会人',
    daysOnActiveRoster: 0,
    allStarSelections: 0,
    positions: isPitch ? {} : { [pos]: 100 },
    convertTarget: null,
  };

  if (isPitch) {
    player.hand = Math.random() < 0.30 ? 'left' : 'right';
    player.pitching = {
      velocity: s(5), control: s(), stamina: s(-3), breaking: s(),
      variety: s(-5), sharpness: s(-2), tempo: s(-8), clutchP: s(-5),
      recovery: s(-5), durability: s(-3),
    };
    player.subtype = pos === '抑え' ? '抑え' : pos === '中継ぎ' ? '中継ぎ' : '先発';
    const ov = (player.pitching.velocity + player.pitching.control * 1.2 + player.pitching.stamina + player.pitching.breaking + player.pitching.clutchP * 0.3) / 4.5;
    player.salary = Math.max(MIN_SALARY_IKUSEI, clamp(Math.round((ov * 60 - 2800) / 500) * 500, 0, 50000));
  } else {
    player.batting = {
      contact: s(), power: s(), eye: s(-5), speed: s(), arm: s(-5),
      defense: s(-5), catching: s(-3), stealSkill: s(-8), baseRunning: s(-5),
      clutch: s(-8), vsLeft: s(-5), breakingBall: s(-8), stamina: s(-3), recovery: s(-5),
    };
    const ov = (player.batting.contact * 1.2 + player.batting.power + player.batting.eye + player.batting.speed * 0.7 + player.batting.clutch * 0.3) / 4.2;
    player.salary = Math.max(MIN_SALARY_IKUSEI, clamp(Math.round((ov * 55 - 2500) / 500) * 500, 0, 60000));
  }

  const types = isPitch ? PLAYER_TYPES_P : PLAYER_TYPES_B;
  const comments = isPitch ? PLAYER_COMMENTS_P : PLAYER_COMMENTS_B;
  player.playerType = types[rng(0, types.length - 1)];
  player.playerComment = comments[rng(0, comments.length - 1)];
  if (!isPitch) assignSecondaryPositions(player);
  return player;
}

export function applyPositionFields(player) {
  if (!player.isPitcher) {
    player.positions = { [player.pos]: 100 };
    assignSecondaryPositions(player);
  } else {
    player.positions = {};
  }
  player.convertTarget = null;
  return player;
}

export function buildTeam(def) {
  const q = rng(56, 76);
  const dhEnabled = def.league === 'パ';
  const players = [];
  FIELDING_POSITIONS.forEach((pos) => players.push(makePlayer(pos, q + (pos === '捕手' ? 3 : 0), false)));
  for (let i = 0; i < 6; i++) players.push(makePlayer(FIELDING_POSITIONS[rng(0, FIELDING_POSITIONS.length - 1)], q - 14, false));
  for (let i = 0; i < 5; i++) players.push(makePlayer('先発', q + 5 - i * 3, true, rng(21, 33)));
  for (let i = 0; i < 4; i++) players.push(makePlayer('中継ぎ', q - 4, true, rng(23, 31)));
  players.push(makePlayer('抑え', q + 4, true, rng(24, 32)));

  const farm = [];
  for (let i = 0; i < 15; i++) farm.push(makePlayer(FIELDING_POSITIONS[rng(0, FIELDING_POSITIONS.length - 1)], q - 20, false, rng(18, 25)));
  for (let i = 0; i < 8; i++) farm.push(makePlayer('先発', q - 15, true, rng(18, 24)));

  const nonPitchers = players.filter((p) => !p.isPitcher);
  if (nonPitchers[8]) nonPitchers[8].pos = 'DH';
  const lineupNoDh = nonPitchers.slice(0, 8).map((p) => p.id);
  const lineupDh = nonPitchers.slice(0, 9).map((p) => p.id);

  return {
    ...def, players, farm, 育成players: [],
    dhEnabled,
    rosterDhMode: dhEnabled,
    lineup: dhEnabled ? lineupDh : lineupNoDh,
    lineupNoDh,
    lineupDh,
    rotation: players.filter((p) => p.isPitcher && p.subtype === '先発').map((p) => p.id),
    rotIdx: 0, wins: 0, losses: 0, draws: 0, rf: 0, ra: 0,
    coaches: [], budget: def.budget,
    scoutMissions: [], scoutResults: [],
    popularity: rng(40, 70),
    winStreak: 0, loseStreak: 0,
    stadiumLevel: 0,
    revenueThisSeason: 0,
    ownerGoal: 'cs',
    ownerTrust: 50,
  };
}

export function calcRetireWill(player) {
  if (player.age < 35) return 0;
  let score = 0;

  if      (player.age >= 42) score += 80;
  else if (player.age >= 41) score += 65;
  else if (player.age >= 40) score += 50;
  else if (player.age >= 38) score += 28;
  else if (player.age >= 36) score += 12;
  else                       score += 3;

  const pa = player.stats?.PA || 0;
  const bf = player.stats?.BF || 0;
  if (player.isPitcher) {
    if (bf < 15) score += 20;
    else if (bf < 40) score += 15;
  } else {
    if (pa < 30) score += 20;
    else if (pa < 80) score += 15;
  }

  if ((player.morale || 60) < 40) score += 10;
  if ((player.contractYearsLeft || 0) === 0) score += 20;
  if ((player.injuryDaysLeft || 0) >= 100) score += 25;

  const retireStyle = player.retireStyle || 50;
  if (retireStyle >= 70) score = Math.round(score * 1.4);
  else if (retireStyle <= 30) score = Math.round(score * 0.6);

  return Math.min(100, score);
}
