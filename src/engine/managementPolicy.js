import { saberBatter } from './sabermetrics';
import {
  calcBattedBallQuality,
  createBattedBallLeagueContext,
} from './cpuBatterEvaluation';

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));

export const MANAGEMENT_POLICY_ORDER = [
  'form',
  'results',
  'balanced',
  'data',
  'development',
];

export const MANAGEMENT_POLICIES = {
  form: {
    id: 'form',
    label: '調子重視',
    short: '直近の勢いを優先。入替は早めです。',
    patiencePa: 25,
    lineupInterval: 3,
    swapThreshold: 5,
    weights: { season: 15, recent: 30, battedBall: 10, ability: 15, defense: 20, future: 10 },
  },
  results: {
    id: 'results',
    label: '実績重視',
    short: 'シーズン成績と経験を重視します。',
    patiencePa: 60,
    lineupInterval: 7,
    swapThreshold: 7,
    weights: { season: 40, recent: 15, battedBall: 5, ability: 20, defense: 15, future: 5 },
  },
  balanced: {
    id: 'balanced',
    label: 'バランス',
    short: '成績・内容・能力を均等に見ます。',
    patiencePa: 90,
    lineupInterval: 7,
    swapThreshold: 6,
    weights: { season: 25, recent: 10, battedBall: 20, ability: 20, defense: 15, future: 10 },
  },
  data: {
    id: 'data',
    label: 'データ重視',
    short: '結果が出なくても打球内容の良さを長めに評価します。',
    patiencePa: 120,
    lineupInterval: 7,
    swapThreshold: 6,
    weights: { season: 15, recent: 5, battedBall: 35, ability: 20, defense: 15, future: 10 },
  },
  development: {
    id: 'development',
    label: '育成重視',
    short: '若手の将来性を優先し、長い目で起用します。',
    patiencePa: 180,
    lineupInterval: 7,
    swapThreshold: 8,
    weights: { season: 10, recent: 5, battedBall: 25, ability: 15, defense: 15, future: 30 },
  },
};

export const MANAGEMENT_TRAITS = {
  defense: { id: 'defense', label: '守備優先' },
  power: { id: 'power', label: '長打優先' },
  speed: { id: 'speed', label: '機動力' },
  veteran: { id: 'veteran', label: 'ベテラン信頼' },
  youth: { id: 'youth', label: '若手抜擢' },
};

const TRAIT_ORDER = Object.keys(MANAGEMENT_TRAITS);

function stableHash(value) {
  return String(value || '').split('').reduce((total, char) => ((total * 31) + char.charCodeAt(0)) >>> 0, 7);
}

export function getManagementPolicy(team) {
  const id = MANAGEMENT_POLICIES[team?.managementPolicyId]
    ? team.managementPolicyId
    : MANAGEMENT_POLICY_ORDER[stableHash(team?.id || team?.name) % MANAGEMENT_POLICY_ORDER.length];
  return MANAGEMENT_POLICIES[id];
}

export function getManagementTrait(team) {
  const id = MANAGEMENT_TRAITS[team?.managementTraitId]
    ? team.managementTraitId
    : TRAIT_ORDER[stableHash(`${team?.id || team?.name}-trait`) % TRAIT_ORDER.length];
  return MANAGEMENT_TRAITS[id];
}

export function ensureManagementIdentity(team) {
  const policy = getManagementPolicy(team);
  const trait = getManagementTrait(team);
  if (team?.managementPolicyId === policy.id && team?.managementTraitId === trait.id) return team;
  return { ...team, managementPolicyId: policy.id, managementTraitId: trait.id };
}

export function createManagementLeagueContext(teams, team) {
  const sameLeague = (Array.isArray(teams) ? teams : [])
    .filter((candidate) => !team?.league || candidate?.league === team.league)
    .flatMap((candidate) => [...(candidate.players || []), ...(candidate.farm || [])])
    .filter((player) => !player.isPitcher);
  const fallback = [...(team?.players || []), ...(team?.farm || [])].filter((player) => !player.isPitcher);
  return createBattedBallLeagueContext(sameLeague.length ? sameLeague : fallback);
}

function defenseScore(player) {
  const base = Number(player?.batting?.defense ?? player?.defense ?? 50);
  const arm = Number(player?.batting?.arm ?? player?.arm ?? 50);
  const catching = player?.pos === '捕手' ? Number(player?.batting?.catching ?? 50) : base;
  return clamp(base * 0.55 + arm * 0.25 + catching * 0.2);
}

function abilityScore(player) {
  return clamp(
    (Number(player?.batting?.contact ?? 50) * 0.3)
      + (Number(player?.batting?.power ?? 50) * 0.27)
      + (Number(player?.batting?.eye ?? 50) * 0.23)
      + (Number(player?.batting?.speed ?? 50) * 0.2),
  );
}

function futureScore(player) {
  const potential = Number(player?.potential ?? 50);
  const age = Number(player?.age ?? 28);
  const ageBonus = age <= 22 ? 18 : age <= 25 ? 10 : age <= 28 ? 3 : age >= 34 ? -10 : 0;
  return clamp(potential + ageBonus);
}

function traitAdjustment(player, traitId) {
  if (traitId === 'defense') return (defenseScore(player) - 50) * 0.08;
  if (traitId === 'power') return (Number(player?.batting?.power ?? 50) - 50) * 0.08;
  if (traitId === 'speed') return (Number(player?.batting?.speed ?? 50) - 50) * 0.08;
  if (traitId === 'veteran') return clamp((Number(player?.age ?? 28) - 28) * 0.3, -4, 4);
  if (traitId === 'youth') return clamp((28 - Number(player?.age ?? 28)) * 0.3, -4, 4);
  return 0;
}

function seasonScore(player, policy) {
  const stats = saberBatter(player?.stats ?? {});
  const pa = Math.max(0, Number(player?.stats?.PA) || 0);
  const observed = clamp(50 + ((stats.OPS || 0.7) - 0.7) * 100);
  const reliability = clamp(pa / Math.max(policy.patiencePa, 1), 0, 1);
  return {
    value: 50 + (observed - 50) * reliability,
    pa,
    reliability,
  };
}

export function evaluateBatterForPolicy(player, team, options = {}) {
  const policy = MANAGEMENT_POLICIES[options.policyId] || getManagementPolicy(team);
  const trait = MANAGEMENT_TRAITS[options.traitId] || getManagementTrait(team);
  const leagueContext = options.leagueContext || createManagementLeagueContext(options.teams, team);
  const season = seasonScore(player, policy);
  const battedBall = calcBattedBallQuality(player, leagueContext);
  const components = {
    season: season.value,
    recent: clamp(Number(player?.form ?? 50) * 0.75 + battedBall.recentScore * 0.25),
    battedBall: battedBall.score,
    ability: abilityScore(player),
    defense: defenseScore(player),
    future: futureScore(player),
  };
  const weighted = Object.entries(policy.weights)
    .reduce((sum, [key, weight]) => sum + components[key] * weight, 0) / 100;
  const fatiguePenalty = Math.max(0, 75 - Number(player?.condition ?? 100)) * 0.24;
  const injuryPenalty = (player?.injuryDaysLeft ?? 0) > 0 ? 100 : 0;
  const traitBonus = traitAdjustment(player, trait.id);
  const total = clamp(weighted + traitBonus - fatiguePenalty - injuryPenalty);
  const ranked = Object.entries(components)
    .map(([key, value]) => ({ key, value, impact: (value - 50) * policy.weights[key] / 100 }))
    .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));
  const labels = {
    season: '今季成績',
    recent: '直近状態',
    battedBall: '打球内容',
    ability: '基礎能力',
    defense: '守備',
    future: '将来性',
  };
  const reasons = ranked.slice(0, 2).map(({ key, value }) => `${labels[key]}${value >= 50 ? '○' : '△'}`);
  if (fatiguePenalty >= 3) reasons.push('疲労');
  return {
    total,
    components,
    reasons,
    policy,
    trait,
    seasonReliability: season.reliability,
    battedBallReliability: battedBall.reliability,
  };
}

export function shouldRunLineupManagement(team, gameDay) {
  const policy = getManagementPolicy(team);
  const lastDay = Number(team?.managementMeta?.lastLineupDay || 0);
  return gameDay > 0 && gameDay - lastDay >= policy.lineupInterval;
}

export function shouldRunRosterManagement(team, gameDay) {
  const lastDay = Number(team?.managementMeta?.lastRosterDay || 0);
  return gameDay > 0 && gameDay - lastDay >= 14;
}
