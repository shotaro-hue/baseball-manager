import { saberBatter } from './sabermetrics';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const rate = (value, denominator) => denominator > 0 ? Number(value || 0) / denominator : 0;

const DEFAULT_LEAGUE_RATES = {
  hardHitRate: 0.35,
  barrelRate: 0.06,
  lineRate: 0.22,
  groundRate: 0.43,
  flyRate: 0.35,
};

function profileRates(profile) {
  const bip = Math.max(0, Number(profile?.bip) || 0);
  return {
    bip,
    hardHitRate: rate(profile?.hardHit, bip),
    barrelRate: rate(profile?.barrel, bip),
    lineRate: rate(profile?.line, bip),
    groundRate: rate(profile?.ground, bip),
    flyRate: rate(profile?.fly, bip),
    laAvg: Number(profile?.laN) > 0 ? Number(profile.laSum || 0) / Number(profile.laN) : null,
  };
}

function resolveLeagueRates(leagueContext) {
  if (leagueContext?.rates) return { ...DEFAULT_LEAGUE_RATES, ...leagueContext.rates };
  const profiles = Array.isArray(leagueContext?.players)
    ? leagueContext.players.map((player) => player?.stats?.battedBallProfile).filter(Boolean)
    : [];
  const total = profiles.reduce((acc, profile) => ({
    bip: acc.bip + (Number(profile.bip) || 0),
    hardHit: acc.hardHit + (Number(profile.hardHit) || 0),
    barrel: acc.barrel + (Number(profile.barrel) || 0),
    line: acc.line + (Number(profile.line) || 0),
    ground: acc.ground + (Number(profile.ground) || 0),
    fly: acc.fly + (Number(profile.fly) || 0),
  }), { bip: 0, hardHit: 0, barrel: 0, line: 0, ground: 0, fly: 0 });
  if (total.bip < 30) return DEFAULT_LEAGUE_RATES;
  return {
    hardHitRate: rate(total.hardHit, total.bip),
    barrelRate: rate(total.barrel, total.bip),
    lineRate: rate(total.line, total.bip),
    groundRate: rate(total.ground, total.bip),
    flyRate: rate(total.fly, total.bip),
  };
}

export function createBattedBallLeagueContext(players) {
  return { rates: resolveLeagueRates({ players: Array.isArray(players) ? players : [] }) };
}

function qualityIndex(profile, leagueRates) {
  const current = profileRates(profile);
  if (current.bip <= 0) return 0;
  const hard = (current.hardHitRate - leagueRates.hardHitRate) / 0.18;
  const barrel = (current.barrelRate - leagueRates.barrelRate) / 0.08;
  const line = (current.lineRate - leagueRates.lineRate) / 0.12;
  const groundExtreme = Math.max(0, current.groundRate - 0.62) / 0.2;
  const flyExtreme = Math.max(0, current.flyRate - 0.55) / 0.2;
  const angleExtreme = current.laAvg == null
    ? 0
    : Math.max(0, -current.laAvg / 12, (current.laAvg - 32) / 18);
  return clamp(
    hard * 0.42 + barrel * 0.38 + line * 0.2
      - groundExtreme * 0.2 - flyExtreme * 0.15 - angleExtreme * 0.2,
    -1,
    1,
  );
}

function currentReliability(bip) {
  const reliability = clamp(bip / 120, 0, 1);
  return { reliability, maxRate: reliability * 0.08 };
}

/**
 * 方針評価でも使う打球品質。50をリーグ平均とする0〜100スコア。
 */
export function calcBattedBallQuality(player, leagueContext = {}) {
  const profile = player?.stats?.battedBallProfile;
  const recent = profile?.recent;
  const leagueRates = resolveLeagueRates(leagueContext);
  const bip = Math.max(0, Number(profile?.bip) || 0);
  const recentBip = Math.max(0, Number(recent?.bip) || 0);
  const reliability = clamp(bip / 120, 0, 1);
  const recentReliability = clamp(recentBip / 30, 0, 1);
  const currentIndex = qualityIndex(profile, leagueRates);
  const recentIndex = qualityIndex(recent, leagueRates);
  return {
    score: clamp(50 + currentIndex * reliability * 35, 0, 100),
    recentScore: clamp(50 + recentIndex * recentReliability * 30, 0, 100),
    reliability,
    recentReliability,
    currentIndex,
    recentIndex,
    bip,
    recentBip,
  };
}

/**
 * 互換CPU打者評価。打球補正は今季±8%、直近±3%、合計±10%以内。
 */
export function calcCpuBatterEvaluation(player, leagueContext = {}, options = {}) {
  const stats = saberBatter(player?.stats ?? {});
  const resultScore = (stats.OPS || 0) * 1000;
  const abilityScore = (player?.batting?.contact ?? 50) * 1.6
    + (player?.batting?.eye ?? 50) * 1.1
    + (player?.batting?.power ?? 50) * 1.2
    + (player?.batting?.speed ?? 50) * 0.7;
  const base = resultScore + abilityScore;
  const profile = player?.stats?.battedBallProfile;
  const leagueRates = resolveLeagueRates(leagueContext);
  const bip = Math.max(0, Number(profile?.bip) || 0);
  const current = currentReliability(bip);
  const currentQuality = qualityIndex(profile, leagueRates);
  const currentRate = clamp(currentQuality * current.maxRate, -current.maxRate, current.maxRate);
  const battedBallAdjustment = base * currentRate;

  const recent = profile?.recent;
  const recentBip = Math.max(0, Number(recent?.bip) || 0);
  const recentReliability = clamp(recentBip / 30, 0, 1);
  const recentQuality = qualityIndex(recent, leagueRates);
  const rawRecentRate = clamp(recentQuality * recentReliability * 0.03, -0.03, 0.03);
  const recentRate = options.includeRecent === false
    ? 0
    : clamp(rawRecentRate, -0.1 - currentRate, 0.1 - currentRate);
  const recentAdjustment = base * recentRate;
  const total = base + battedBallAdjustment + recentAdjustment;
  const reasons = [];
  if (bip < 30) reasons.push({ code: 'BIP_SMALL_SAMPLE', bip });
  if (currentQuality >= 0.25) reasons.push({ code: 'BATTED_BALL_QUALITY_PLUS', value: currentQuality });
  if (currentQuality <= -0.25) reasons.push({ code: 'BATTED_BALL_QUALITY_MINUS', value: currentQuality });
  if (recentRate >= 0.015) reasons.push({ code: 'RECENT_CONTACT_PLUS', value: recentRate });
  if (recentRate <= -0.015) reasons.push({ code: 'RECENT_CONTACT_MINUS', value: recentRate });

  return {
    total,
    base,
    resultScore,
    abilityScore,
    battedBallAdjustment,
    recentAdjustment,
    reliability: current.reliability,
    recentReliability,
    reasons,
  };
}
