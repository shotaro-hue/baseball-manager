import { rng } from '../utils';

/* ═══════════════════════════════════════════════
   TRADE SYSTEM
═══════════════════════════════════════════════ */

export function tradeValue(p) {
  if (!p) return 0;
  const age = p.age || 25;
  const ageMod = age <= 24 ? 1.15 : age <= 28 ? 1.0 : age <= 31 ? 0.85 : 0.65;
  const pot = (p.potential || 60) / 100;
  let raw = 0;
  if (p.isPitcher) {
    const pi = p.pitching || {};
    raw = ((pi.velocity || 50) * 1.2 + (pi.control || 50) * 1.3 + (pi.breaking || 50) + (pi.stamina || 50) * 0.8 + (pi.clutchP || 50) * 0.5) / 4.8;
  } else {
    const ba = p.batting || {};
    raw = ((ba.contact || 50) * 1.2 + (ba.power || 50) + (ba.eye || 50) * 0.9 + (ba.speed || 50) * 0.7 + (ba.clutch || 50) * 0.5) / 4.3;
  }
  return Math.round(raw * ageMod * (0.7 + pot * 0.3));
}

const FRONT_OFFICE_MODES = ['contend', 'retool', 'rebuild', 'neutral'];
const MODE_WEIGHTS = {
  contend: { current: 0.55, future: 0.2, contract: 0.25 },
  retool: { current: 0.4, future: 0.35, contract: 0.25 },
  rebuild: { current: 0.2, future: 0.6, contract: 0.2 },
  neutral: { current: 0.4, future: 0.3, contract: 0.3 },
};

function getFrontOfficePlan(team) {
  const mode = FRONT_OFFICE_MODES.includes(team?.frontOfficePlan?.mode) ? team.frontOfficePlan.mode : 'neutral';
  return { mode, confidence: team?.frontOfficePlan?.confidence ?? 0.5, updatedAtDay: team?.frontOfficePlan?.updatedAtDay ?? 0, reasons: team?.frontOfficePlan?.reasons || [], rebuildYears: team?.frontOfficePlan?.rebuildYears ?? 0 };
}

export function getFrontOfficePlanPublic(team) {
  return getFrontOfficePlan(team);
}

function getPlayerCurrentValue(p) {
  const base = tradeValue(p);
  const age = p?.age || 25;
  const ageCurve = age <= 30 ? 1.05 : age <= 33 ? 0.9 : 0.75;
  return base * ageCurve;
}

function getPlayerFutureValue(p) {
  const base = tradeValue(p);
  const age = p?.age || 25;
  const potential = (p?.potential || 60) / 100;
  const ageGrowth = age <= 22 ? 1.25 : age <= 26 ? 1.05 : age <= 30 ? 0.8 : 0.55;
  return base * ageGrowth * (0.65 + potential * 0.45);
}

function getPlayerContractValue(p) {
  const salary = p?.salary ?? 12000;
  const yearsLeft = p?.contractYearsLeft ?? 1;
  const perf = tradeValue(p);
  const salaryPenalty = Math.max(0.7, 1.2 - salary / 90000);
  const stabilityBonus = 0.9 + Math.min(yearsLeft, 4) * 0.05;
  return perf * salaryPenalty * stabilityBonus;
}

function weightedPlayerValue(p, mode = 'neutral') {
  const w = MODE_WEIGHTS[mode] || MODE_WEIGHTS.neutral;
  return getPlayerCurrentValue(p) * w.current + getPlayerFutureValue(p) * w.future + getPlayerContractValue(p) * w.contract;
}

export function analyzeTeamNeeds(team) {
  const pitchers = team.players.filter((p) => p.isPitcher);
  const starters = pitchers.filter((p) => p.subtype === '先発');
  const relievers = pitchers.filter((p) => p.subtype === '中継ぎ');
  const closers = pitchers.filter((p) => p.subtype === '抑え');
  const batters = team.players.filter((p) => !p.isPitcher);
  const catchers = batters.filter((p) => p.pos === '捕手');

  const avgV = pitchers.length
    ? pitchers.reduce((sum, p) => sum + (p.pitching?.velocity || 50), 0) / pitchers.length
    : 50;
  const avgC = batters.length
    ? batters.reduce((sum, p) => sum + (p.batting?.contact || 50), 0) / batters.length
    : 50;
  const avgAge = team.players.reduce((sum, p) => sum + (p.age || 25), 0) / Math.max(team.players.length, 1);

  const primeStarters = starters.filter((p) => (p.age || 25) <= 30).length;
  const youngStarters = starters.filter((p) => (p.age || 25) <= 24).length;
  const veteranShare = team.players.length
    ? team.players.filter((p) => (p.age || 25) >= 31).length / team.players.length
    : 0;

  const needs = [];
  if (starters.length < 4) needs.push({ type: '先発投手が不足', score: 30 + (4 - starters.length) * 10, horizon: 'short' });
  if (primeStarters < 3) needs.push({ type: '先発ローテの主力層が薄い', score: 24 + (3 - primeStarters) * 8, horizon: 'mid' });
  if (youngStarters < 2) needs.push({ type: '将来の先発候補を育成したい', score: 20 + (2 - youngStarters) * 8, horizon: 'long' });
  if (closers.length === 0) needs.push({ type: '抑え不在', score: 25, horizon: 'short' });
  if (relievers.length < 3) needs.push({ type: '中継ぎ不足', score: 15 + (3 - relievers.length) * 5, horizon: 'short' });
  if (avgV < 60) needs.push({ type: '投手陣の球威強化', score: Math.round((60 - avgV) * 0.5), horizon: 'mid' });
  if (catchers.length === 0) needs.push({ type: '捕手補強が急務', score: 28, horizon: 'short' });
  if (avgC < 60) needs.push({ type: 'ミート力の向上', score: Math.round((60 - avgC) * 0.5), horizon: 'mid' });
  if (avgAge > 30 || veteranShare > 0.35) needs.push({ type: '若手の補充が急務', score: Math.round((avgAge - 30) * 5) + Math.round(veteranShare * 10), horizon: 'long' });
  if (needs.length === 0) needs.push({ type: 'バランス型の補強', score: 10, horizon: 'mid' });

  return needs.sort((a, b) => b.score - a.score).slice(0, 3);
}

function calcNeedFitScore(player, needs) {
  return needs.reduce((sum, n) => {
    let gain = 0;
    const isShort = n.horizon === 'short';
    const isMid = n.horizon === 'mid';
    const isLong = n.horizon === 'long';

    if (n.type.includes('先発') && player.isPitcher && player.subtype === '先発') {
      gain += n.score * (isLong ? 0.8 : 1.0);
      if (isLong && (player.age || 25) <= 23) gain += 6;
    } else if (n.type.includes('抑え') && player.isPitcher && player.subtype === '抑え') {
      gain += n.score;
    } else if (n.type.includes('中継ぎ') && player.isPitcher && player.subtype === '中継ぎ') {
      gain += n.score;
    } else if (n.type.includes('球威') && player.isPitcher) {
      gain += (player.pitching?.velocity || 50) >= 65 ? n.score * 0.6 : n.score * 0.2;
    } else if (n.type.includes('捕手') && !player.isPitcher && player.pos === '捕手') {
      gain += n.score;
    } else if (n.type.includes('ミート') && !player.isPitcher) {
      gain += (player.batting?.contact || 50) >= 62 ? n.score * 0.6 : n.score * 0.2;
    } else if (n.type.includes('若手') && (player.age || 25) <= 24) {
      gain += n.score;
    } else if (n.type.includes('バランス')) {
      gain += 5;
    }

    if (isShort && (player.age || 25) >= 29) gain += 2;
    if (isMid && (player.age || 25) >= 25 && (player.age || 25) <= 29) gain += 2;
    if (isLong && (player.age || 25) <= 23) gain += 3;
    return sum + gain;
  }, 0);
}

export function evalTradeForCpu(cpuTeam, give, receive, cashDiff) {
  const plan = getFrontOfficePlan(cpuTeam);
  const mode = plan.mode;
  const gv = give.reduce((s, p) => s + weightedPlayerValue(p, mode), 0);
  const rv = receive.reduce((s, p) => s + weightedPlayerValue(p, mode), 0);
  let diff = gv - rv + (cashDiff || 0) / 100000;
  const needs = analyzeTeamNeeds(cpuTeam);
  give.forEach((p) => {
    diff += calcNeedFitScore(p, needs) * 0.15;
    if ((p.age || 25) <= 23) diff += 5;
    if (mode === 'rebuild' && (p.age || 25) <= 26) diff += 7;
  });
  receive.forEach((p) => {
    if ((p.age || 25) <= 26 && tradeValue(p) > 70) diff -= 8;
    if (mode === 'rebuild' && (p.age || 25) >= 30 && (p.contractYearsLeft || 1) <= 1) diff += 7;
  });
  const threshold = mode === 'contend' ? -7 : mode === 'rebuild' ? -2 : -5;
  const reasons = [];
  if (diff < -5) reasons.push(`対価が不足（差: ${Math.abs(Math.round(diff))}点）`);
  if (mode === 'rebuild') reasons.push('再建方針で若手資産を重視');
  if (mode === 'contend') reasons.push('優勝争いのため即戦力を重視');
  if (needs[0]?.type) reasons.push(`${needs[0].type}を優先したい`);
  else reasons.push("戦力バランスを改善したい");
  const hasYoungGive = give.some(p => (p.age || 25) <= 23);
  if (!hasYoungGive) reasons.push("若手選手が欲しい");
  return { diff, fair: diff >= threshold, favorable: diff >= 8, reasons: reasons.slice(0, 2), mode };
}

export function generateCpuOffer(cpuTeam, myTeam) {
  const plan = getFrontOfficePlan(cpuTeam);
  const mode = plan.mode;
  const mp = myTeam.players.filter((p) => !p.injury);
  const cp = cpuTeam.players.filter((p) => !p.injury);
  if (!mp.length || !cp.length) return null;
  const needs = analyzeTeamNeeds(cpuTeam);
  // モード別の重み付き価値で狙う選手を選定
  const want = mp
    .map((p) => ({ p, score: weightedPlayerValue(p, mode) + calcNeedFitScore(p, needs) * 0.25 }))
    .sort((a, b) => b.score - a.score)[0]?.p;
  if (!want) return null;
  const wv = weightedPlayerValue(want, mode);
  const offer = cp
    .map((p) => ({ p, d: Math.abs(weightedPlayerValue(p, mode) - wv) }))
    .sort((a, b) => a.d - b.d)[0]?.p;
  if (!offer) return null;
  const vd = weightedPlayerValue(offer, mode) - wv;
  return { from: cpuTeam, want: [want], offer: [offer], cash: vd < -10 ? Math.abs(vd) * 500000 : 0 };
}

/**
 * 球団をトレードデッドラインでの立場に分類する。
 * @param {object} team - 対象球団
 * @param {object[]} allTeams - 全球団
 * @returns {"buyer" | "seller" | "neutral"}
 */
export function classifyTeam(team, allTeams) {
  const mode = team?.frontOfficePlan?.mode;
  if (mode === 'contend') return "buyer";
  if (mode === 'rebuild') return "seller";
  const leagueTeams = allTeams
    .filter((t) => t.league === team.league)
    .sort((a, b) => b.wins - a.wins);
  const rank = leagueTeams.findIndex((t) => t.id === team.id) + 1;
  const g = (team.wins || 0) + (team.losses || 0);
  const winPct = g > 0 ? team.wins / g : 0.5;

  if (rank <= 2 || winPct >= 0.56) return "buyer";
  if (rank >= 5 || winPct <= 0.44) return "seller";
  return "neutral";
}

export function evaluateFrontOfficePlan(team, allTeams, gameDay = 0) {
  const prev = getFrontOfficePlan(team);
  const freezeDays = 30;
  // 新シーズン検出: updatedAtDay がcurrent gameDayより大きい場合はシーズンリセット
  const isNewSeason = prev.updatedAtDay > 0 && gameDay < prev.updatedAtDay;
  const effectiveUpdatedAt = isNewSeason ? 0 : prev.updatedAtDay;
  if (gameDay - effectiveUpdatedAt < freezeDays) return { ...prev, updatedAtDay: effectiveUpdatedAt };
  const leagueTeams = allTeams.filter((t) => t.league === team.league).sort((a, b) => b.wins - a.wins);
  const rank = Math.max(1, leagueTeams.findIndex((t) => t.id === team.id) + 1);
  const totalGames = (team.wins || 0) + (team.losses || 0);
  const winPct = totalGames > 0 ? team.wins / totalGames : 0.5;
  const runDiff = team.runDiff || 0;
  const players = team.players || [];
  const youngRatio = players.length ? players.filter((p) => (p.age || 25) <= 25).length / players.length : 0;
  const oldRatio = players.length ? players.filter((p) => (p.age || 25) >= 30).length / players.length : 0;
  const expiringCore = players.filter((p) => (p.core || tradeValue(p) >= 70) && (p.contractYearsLeft || 1) <= 1).length;
  // ファームの将来価値スコア（prospect depth）
  const farm = team.farm || [];
  const prospectDepth = farm.length ? farm.reduce((s, p) => s + (p.potential || 50), 0) / farm.length / 100 : 0;
  const rankScore = Math.max(0, 1 - (rank - 1) / 5);
  const trendScore = Math.max(0, Math.min(1, (winPct - 0.35) / 0.35));
  const runDiffScore = Math.max(0, Math.min(1, (runDiff + 80) / 160));
  const contractSecurity = Math.max(0, 1 - expiringCore / 5);
  const primeAgeBalance = Math.max(0, 1 - Math.abs(youngRatio - 0.4) - Math.max(0, oldRatio - 0.35));
  const contendIndex = 0.3 * rankScore + 0.25 * trendScore + 0.2 * runDiffScore + 0.15 * contractSecurity + 0.1 * primeAgeBalance;
  const rebuildIndex = 0.3 * oldRatio + 0.2 * Math.min(1, expiringCore / 4) + 0.25 * (1 - trendScore) + 0.15 * youngRatio + 0.1 * prospectDepth;
  let mode = 'neutral';
  if (contendIndex >= 0.62) mode = 'contend';
  else if (rebuildIndex >= 0.6 && contendIndex < 0.5) mode = 'rebuild';
  else if (contendIndex >= 0.5 || rebuildIndex >= 0.5) mode = 'retool';
  // 再建継続年数: 前回も rebuild だった場合のみインクリメント（シーズン跨ぎ検出）
  const prevRebuildYears = prev.rebuildYears || 0;
  const rebuildYears = isNewSeason
    ? (prev.mode === 'rebuild' && mode === 'rebuild' ? prevRebuildYears + 1 : mode === 'rebuild' ? 1 : 0)
    : prevRebuildYears;
  const reasons = [];
  if (mode === 'contend') reasons.push('高勝率・順位優位');
  if (mode === 'rebuild') reasons.push('高齢化と成績低迷');
  if (mode === 'retool') reasons.push('短期再編の必要性');
  if (mode === 'rebuild' && rebuildYears >= 2) reasons.push(`再建${rebuildYears}年目・勝負年へ準備中`);
  if (!reasons.length) reasons.push('戦力評価を継続');
  return { mode, confidence: Math.max(contendIndex, rebuildIndex), updatedAtDay: gameDay, reasons, rebuildYears };
}

/**
 * CPU vs CPU のトレードを1件生成する。
 * 買い手チームが売り手チームからベテランを獲得し、若手を対価として提示する。
 * @param {object[]} allTeams - 全球団（myTeam含む）
 * @returns {{ buyerId: string, sellerId: string, buyerGets: object, sellerGets: object, buyerName: string, sellerName: string } | null}
 */
export function generateCpuCpuTrade(allTeams) {
  const buyers = allTeams.filter((t) => classifyTeam(t, allTeams) === "buyer");
  const sellers = allTeams.filter((t) => classifyTeam(t, allTeams) === "seller");
  if (!buyers.length || !sellers.length) return null;

  const buyer = buyers[rng(0, buyers.length - 1)];
  const sellerCandidates = sellers.filter((t) => t.id !== buyer.id);
  if (!sellerCandidates.length) return null;
  const seller = sellerCandidates[rng(0, sellerCandidates.length - 1)];

  const sellerMode = getFrontOfficePlan(seller).mode;
  const buyerMode = getFrontOfficePlan(buyer).mode;

  // 売り手: 一軍ベテラン + ファームも候補に含める（再建チームはファームprospectを出さない）
  const sellerPool = [
    ...seller.players.filter((p) => !p.injury && (p.age || 25) >= 27),
    ...(sellerMode === 'rebuild' ? [] : (seller.farm || []).filter((p) => !p.injury && (p.age || 25) >= 28)),
  ].sort((a, b) => weightedPlayerValue(b, sellerMode) - weightedPlayerValue(a, sellerMode));

  // 買い手: 若手prospect（将来価値重視）
  const buyerProspects = buyer.players
    .filter((p) => !p.injury && (p.age || 25) <= 27)
    .sort((a, b) => weightedPlayerValue(b, buyerMode) - weightedPlayerValue(a, buyerMode));

  if (!sellerPool.length || !buyerProspects.length) return null;

  const buyerGets = sellerPool[0];
  const sellerGets = buyerProspects[0];
  const valueDiff = Math.abs(weightedPlayerValue(buyerGets, buyerMode) - weightedPlayerValue(sellerGets, sellerMode));
  if (valueDiff > 35) return null;

  return {
    buyerId: buyer.id,
    sellerId: seller.id,
    buyerGets,
    sellerGets,
    buyerName: buyer.name,
    sellerName: seller.name,
  };
}
