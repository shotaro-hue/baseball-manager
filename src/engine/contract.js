import { clamp, rng } from '../utils';
import {
  ACCEPT_THRESHOLD, MIN_SALARY_SHIHAKA, MIN_SALARY_IKUSEI,
  ACTIVE_ROSTER_FA_DAYS_PER_YEAR, MAX_外国人_一軍,
  MAX_ROSTER, CPU_FA_BUDGET_RESERVE_RATIO, CPU_FA_MIN_SCORE,
  CPU_FA_REBUILD_YOUNG_BONUS, CPU_FA_REBUILD_OLD_PENALTY, CPU_FA_CONTEND_VET_BONUS,
  MAX_SALARY_CUT_RATIO, MIN_OFFER_RATIO, CPU_RENEWAL_ROUNDS,
  CPU_TEAM_OFFER_HIGH_TV_RAISE, CPU_TEAM_OFFER_MID_TV_RAISE, CPU_TEAM_OFFER_LOW_TV_RAISE,
  CPU_TEAM_ROUND2_GAP_CLOSE, CPU_TEAM_ROUND3_GAP_CLOSE,
  PLAYER_DEMAND_RAISE_ELITE, PLAYER_DEMAND_RAISE_GOOD, PLAYER_DEMAND_RAISE_OK,
  PLAYER_DEMAND_MONEY_EXTRA, PLAYER_RESISTANCE_HIGH_MORALE, PLAYER_RESISTANCE_LOW_MORALE,
  NEGOTIATION_MORALE_ACCEPT_BONUS, NEGOTIATION_MORALE_CUT_PENALTY,
  NEGOTIATION_MORALE_FORCE_PENALTY, NEGOTIATION_MORALE_ROUND_HIT,
  NEGOTIATION_TRUST_HAPPY, NEGOTIATION_TRUST_HOLDOUT, NEGOTIATION_TRUST_RELEASED,
} from '../constants';
import { tradeValue, analyzeTeamNeeds, getFrontOfficePlanPublic } from './trade';

/* ═══════════════════════════════════════════════
   FA 資格閾値 (NPB公式準拠・累積日数方式)
   高卒・外国人: 国内FA 960日 (8年×120) / 海外FA 1080日 (9年×120)
   大卒・社会人: 国内FA 840日 (7年×120) / 海外FA 1080日
   判定フィールド: daysOnActiveRoster（一軍在籍累積日数）
═══════════════════════════════════════════════ */
export function getFaThreshold(player) {
  const base = (player.entryType === '高卒' || player.entryType === '外国人') ? 8 : 7;
  return {
    domestic: base * ACTIVE_ROSTER_FA_DAYS_PER_YEAR,
    overseas: 9 * ACTIVE_ROSTER_FA_DAYS_PER_YEAR,
  };
}

/* ═══════════════════════════════════════════════
   PLAYER DEMAND CALCULATION
   選手が要求する年俸・抵抗係数を算出する
═══════════════════════════════════════════════ */

export function calcPlayerDemand(player) {
  const stats = player.stats || {};
  const p     = player.personality || {};

  // パフォーマンスティア判定
  let tier;
  if (player.isPitcher) {
    const ip  = stats.IP || 0;
    const era = (stats.BF || 0) > 0 ? (stats.ER || 0) / Math.max(ip, 0.1) * 9 : 9;
    if      (ip >= 120 && era <= 2.80) tier = 'elite';
    else if (ip >= 80  && era <= 4.00) tier = 'good';
    else if (ip >= 40)                 tier = 'ok';
    else                               tier = 'poor';
  } else {
    const pa  = stats.PA || 0;
    const obp = pa > 0
      ? ((stats.H || 0) + (stats.BB || 0) + (stats.HBP || 0))
        / Math.max(1, (stats.AB || 0) + (stats.BB || 0) + (stats.HBP || 0) + (stats.SF || 0))
      : 0.300;
    if      (pa >= 400 && obp >= 0.370) tier = 'elite';
    else if (pa >= 300 && obp >= 0.330) tier = 'good';
    else if (pa >= 200)                 tier = 'ok';
    else                                tier = 'poor';
  }

  // 基本要求増額率
  let raise = tier === 'elite' ? PLAYER_DEMAND_RAISE_ELITE + (p.money || 50) / 100 * 0.20
            : tier === 'good'  ? PLAYER_DEMAND_RAISE_GOOD
            : tier === 'ok'    ? PLAYER_DEMAND_RAISE_OK
            :                    0.00;

  if ((p.money || 50) > 70) raise += PLAYER_DEMAND_MONEY_EXTRA;

  const morale = player.morale ?? 70;
  if (morale >= 80) raise += 0.05;
  if (morale <= 40) raise -= 0.05;
  raise = clamp(raise, -0.10, 0.55);

  // 抵抗係数（高いほど強気: 1ラウンド目の受諾閾値が上がる）
  let resistance = 0.50;
  if ((p.money || 50) >= 70)                     resistance += 0.15;
  if (morale >= PLAYER_RESISTANCE_HIGH_MORALE)   resistance += 0.15;
  if (morale <= PLAYER_RESISTANCE_LOW_MORALE)    resistance -= 0.20;
  if ((player.serviceYears || 0) >= 8)           resistance += 0.10;
  resistance = clamp(resistance, 0.10, 0.95);

  const demandSalary    = Math.max(MIN_SALARY_SHIHAKA, Math.round(player.salary * (1 + raise) / 100) * 100);
  const minAcceptSalary = Math.max(MIN_SALARY_SHIHAKA, Math.round(player.salary * MIN_OFFER_RATIO / 100) * 100);

  return { demandSalary, minAcceptSalary, resistanceFactor: resistance };
}

/* ═══════════════════════════════════════════════
   MULTI-ROUND NEGOTIATION SIMULATION
   CPU球団と選手間の交渉を最大3ラウンドでシミュレートする
═══════════════════════════════════════════════ */

export function simulateNegotiationRounds(player, team, allTeams, demandSalary, resistanceFactor) {
  const minAllowed = Math.max(
    MIN_SALARY_SHIHAKA,
    Math.round(player.salary * MIN_OFFER_RATIO / 100) * 100,
  );
  const threshold = getFaThreshold(player);
  const days      = player.daysOnActiveRoster ?? (player.serviceYears ?? 0) * ACTIVE_ROSTER_FA_DAYS_PER_YEAR;
  const isFA      = days >= threshold.domestic;

  let budget      = team.budget;
  let moraleDelta = 0;
  let trustDelta  = 0;

  const tv = tradeValue(player);
  const r1raise = tv >= 70 ? CPU_TEAM_OFFER_HIGH_TV_RAISE
                : tv >= 50 ? CPU_TEAM_OFFER_MID_TV_RAISE
                :            CPU_TEAM_OFFER_LOW_TV_RAISE;

  const initialOffer = Math.max(minAllowed, Math.round(player.salary * (1 + r1raise) / 100) * 100);
  const gap          = Math.max(0, demandSalary - initialOffer);

  for (let round = 1; round <= CPU_RENEWAL_ROUNDS; round++) {
    let offered;
    if      (round === 1) offered = initialOffer;
    else if (round === 2) offered = Math.min(demandSalary, Math.round((initialOffer + gap * CPU_TEAM_ROUND2_GAP_CLOSE) / 100) * 100);
    else                  offered = Math.min(demandSalary, Math.round((initialOffer + gap * CPU_TEAM_ROUND3_GAP_CLOSE) / 100) * 100);
    offered = clamp(offered, minAllowed, demandSalary);

    if (budget < offered) {
      return isFA
        ? { result: 'fa_declared', finalSalary: 0, years: 0, rounds: round, moraleDelta: -6, trustDelta: NEGOTIATION_TRUST_RELEASED }
        : { result: 'released',   finalSalary: 0, years: 0, rounds: round, moraleDelta: -10, trustDelta: NEGOTIATION_TRUST_RELEASED };
    }

    const score = evalOffer(player, { salary: offered, years: 1 }, team, allTeams).total;
    // 1ラウンド目は抵抗係数で閾値を引き上げる（強気な選手は簡単に折れない）
    const acceptScore = round === 1
      ? ACCEPT_THRESHOLD + Math.round(resistanceFactor * 20)
      : ACCEPT_THRESHOLD;

    if (score >= acceptScore) {
      if (offered >= demandSalary)        moraleDelta += NEGOTIATION_MORALE_ACCEPT_BONUS;
      if (offered < player.salary * 0.90) moraleDelta += NEGOTIATION_MORALE_CUT_PENALTY;
      if (round > 1)                      moraleDelta += NEGOTIATION_MORALE_ROUND_HIT * (round - 1);
      trustDelta = round === 1 ? NEGOTIATION_TRUST_HAPPY : NEGOTIATION_TRUST_HOLDOUT;
      const years = player.age <= 28 ? rng(1, 2) : 1;
      return { result: 'signed', finalSalary: offered, years, rounds: round, moraleDelta, trustDelta };
    }
  }

  // 3ラウンド決裂
  if (!isFA && budget >= minAllowed) {
    // 非FA: 球団保有権 → 最低提示額で強制更改
    return {
      result: 'signed',
      finalSalary: minAllowed,
      years: 1,
      rounds: CPU_RENEWAL_ROUNDS,
      moraleDelta: NEGOTIATION_MORALE_FORCE_PENALTY + NEGOTIATION_MORALE_ROUND_HIT * 2,
      trustDelta: NEGOTIATION_TRUST_HOLDOUT,
    };
  }
  return {
    result: isFA ? 'fa_declared' : 'released',
    finalSalary: 0,
    years: 0,
    rounds: CPU_RENEWAL_ROUNDS,
    moraleDelta: -6,
    trustDelta: NEGOTIATION_TRUST_RELEASED,
  };
}

/* ═══════════════════════════════════════════════
   CONTRACT EVALUATION
═══════════════════════════════════════════════ */

export function evalOffer(player, offer, myTeam, allTeams) {
  const p = player.personality || { money:50, winning:50, playing:50, hometown:30, loyalty:50, stability:50, future:50 };
  const g = myTeam.wins + myTeam.losses;
  const winPct = g > 0 ? myTeam.wins / g : 0.5;
  const rank = [...allTeams]
    .filter((t) => t.league === myTeam.league)
    .sort((a, b) => b.wins - a.wins)
    .findIndex((t) => t.id === myTeam.id) + 1;

  const moneyScore = clamp((offer.salary / Math.max(player.salary, MIN_SALARY_SHIHAKA)) * 60 + 20, 0, 100);
  const winScore = clamp(winPct * 100 * 1.2, 0, 100);
  const rankScore = clamp((7 - rank) / 6 * 100, 0, 100);
  const playScore = myTeam.lineup.includes(player.id) ? 85 : 40;
  const homeScore = myTeam.city === player.hometown ? 80 : 30;
  const trustScore = clamp(player.trust, 0, 100);
  const avgAge = myTeam.players.reduce((s, x) => s + x.age, 0) / Math.max(myTeam.players.length, 1);
  const futureScore = clamp((32 - avgAge) / 14 * 100, 0, 100);
  const stabilityScore = offer.years >= 3 ? 85 : offer.years === 2 ? 65 : 40;
  const incentives = offer.incentives || {};
  const performanceBonusRate = clamp(Number(incentives.performanceBonusRate) || 0, 0, 30);
  const titleBonus = clamp(Number(incentives.titleBonus) || 0, 0, 3000);
  const optOut = Boolean(incentives.optOut);
  const incentiveScore = clamp(
    performanceBonusRate * 3 + Math.min(35, titleBonus / 35) + (optOut ? 22 : 0),
    0,
    100,
  );
  const incentiveWeight = Math.max(15, Math.round((p.money + p.future) / 4));

  const total = (
    p.money * moneyScore +
    p.winning * Math.max(winScore, rankScore) +
    p.playing * playScore +
    p.hometown * homeScore +
    p.loyalty * trustScore +
    p.stability * stabilityScore +
    p.future * futureScore +
    incentiveWeight * incentiveScore
  ) / (p.money + p.winning + p.playing + p.hometown + p.loyalty + p.stability + p.future + incentiveWeight);

  return {
    total: Math.round(total),
    breakdown: {
      money:     { score: Math.round(moneyScore), weight: p.money },
      winning:   { score: Math.round(Math.max(winScore, rankScore)), weight: p.winning },
      playing:   { score: Math.round(playScore), weight: p.playing },
      hometown:  { score: Math.round(homeScore), weight: p.hometown },
      loyalty:   { score: Math.round(trustScore), weight: p.loyalty },
      stability: { score: Math.round(stabilityScore), weight: p.stability },
      future:    { score: Math.round(futureScore), weight: p.future },
      incentive: { score: Math.round(incentiveScore), weight: incentiveWeight },
    },
  };
}

/* ═══════════════════════════════════════════════
   CPU CONTRACT RENEWAL
   オフシーズンに CPU 球団が満了選手と再契約する
═══════════════════════════════════════════════ */

export function cpuRenewContracts(teams, myId, allTeams) {
  const updatedTeams = [];
  const newFaPlayers = [];
  const news = [];

  for (const t of teams) {
    if (t.id === myId) { updatedTeams.push(t); continue; }

    const expiring = t.players.filter(p => p.contractYearsLeft === 0);
    let players = [...t.players];
    let budget = t.budget;

    for (const p of expiring) {
      const threshold = getFaThreshold(p);
      const days = p.daysOnActiveRoster ?? (p.serviceYears ?? 0) * ACTIVE_ROSTER_FA_DAYS_PER_YEAR;
      const overseas = p.personality?.overseas || 0;

      // 海外志向かつ海外FA資格あり: NPB離脱（変更なし）
      if (overseas >= 70 && days >= threshold.overseas) {
        players = players.filter(x => x.id !== p.id);
        news.push({
          type: 'season',
          headline: `【海外FA】${p.name}（${t.name}）が海外移籍を宣言`,
          source: '野球速報',
          dateLabel: '',
          body: `${p.name}選手（${p.age}歳）が海外FA権を行使し、NPBを離脱した。`,
        });
        continue;
      }

      // 海外志向かつ国内FA資格はあるが海外FA資格なし: 国内FAをスキップして待機（変更なし）
      if (overseas >= 70 && days < threshold.overseas) {
        const salary = Math.max(MIN_SALARY_SHIHAKA, Math.round(p.salary * 1.03));
        if (budget >= salary) {
          players = players.map(x => x.id === p.id
            ? { ...x, salary, contractYears: 1, contractYearsLeft: 1 }
            : x
          );
          budget -= salary;
        } else {
          players = players.filter(x => x.id !== p.id);
          newFaPlayers.push({ ...p, isFA: true });
        }
        continue;
      }

      // 非FA / FA資格あり: マルチラウンド交渉シミュレーション
      const { demandSalary, resistanceFactor } = calcPlayerDemand(p);
      const neg = simulateNegotiationRounds(p, { ...t, budget }, allTeams, demandSalary, resistanceFactor);

      if (neg.result === 'signed') {
        players = players.map(x => x.id === p.id ? {
          ...x,
          salary: neg.finalSalary,
          contractYears: neg.years,
          contractYearsLeft: neg.years,
          morale: clamp((x.morale ?? 70) + neg.moraleDelta, 20, 100),
          trust:  clamp((x.trust  ?? 50) + neg.trustDelta,  0, 100),
        } : x);
        budget -= neg.finalSalary;
      } else {
        players = players.filter(x => x.id !== p.id);
        newFaPlayers.push({ ...p, isFA: true });
        if (neg.result === 'fa_declared') {
          news.push({
            type: 'season',
            headline: `【FA】${p.name}（${t.name}）が国内FA宣言`,
            source: '野球速報',
            dateLabel: '',
            body: `${p.name}選手（${p.age}歳）が国内FA権を行使した。`,
          });
        } else {
          news.push({
            type: 'season',
            headline: `【戦力外】${p.name}（${t.name}）が自由契約`,
            source: '野球速報',
            dateLabel: '',
            body: `${p.name}選手（${p.age}歳）が${t.name}を自由契約となった。`,
          });
        }
      }
    }

    updatedTeams.push({ ...t, players, budget });
  }

  return { updatedTeams, newFaPlayers, news };
}

/* ═══════════════════════════════════════════════
   CPU FA BIDDING
   ウェーバー後に CPU 球団が FA 市場で獲得する
═══════════════════════════════════════════════ */

/**
 * 選手がチームの補強ニーズにどれだけ合致するかをスコア化する。
 * @param {object} player
 * @param {Array<{type: string, score: number}>} needs
 * @returns {number}
 */
function calcNeedMatch(player, needs) {
  let bonus = 0;
  for (const n of needs) {
    if (n.type.includes('先発') && player.isPitcher && player.subtype === '先発') bonus += n.score;
    else if (n.type.includes('抑え') && player.isPitcher && player.subtype === '抑え') bonus += n.score;
    else if (n.type.includes('中継ぎ') && player.isPitcher && player.subtype === '中継ぎ') bonus += n.score;
    else if (n.type.includes('球威') && player.isPitcher) bonus += n.score * 0.5;
    else if (n.type.includes('捕手') && !player.isPitcher && player.pos === '捕手') bonus += n.score;
    else if (n.type.includes('ミート') && !player.isPitcher) bonus += n.score * 0.5;
    else if (n.type.includes('若手') && (player.age || 25) <= 26) bonus += n.score * 0.5;
    else if (n.type.includes('バランス')) bonus += 5;
  }
  return bonus;
}

export function processCpuFaBids(teams, myId, faPool, allTeams, currentYear = null) {
  if (!faPool.length) return { updatedTeams: teams, remainingFaPool: faPool, news: [] };

  const news = [];
  let remainingPool = [...faPool];
  const teamMap = new Map(
    teams.map((t) => [t.id, { ...t, players: [...t.players], farm: [...(t.farm || [])] }]),
  );
  const claimed = [];
  const signedPlayers = new Set();

  const cpuTeams = teams
    .filter((t) => t.id !== myId)
    .sort((a, b) => b.budget - a.budget);

  let changed = true;
  while (changed && remainingPool.length > 0) {
    changed = false;

    for (const origTeam of cpuTeams) {
      const team = teamMap.get(origTeam.id);
      if (!team) continue;
      if (team.players.length >= MAX_ROSTER) continue;

      const reserve = team.budget * CPU_FA_BUDGET_RESERVE_RATIO;
      if (team.budget - reserve < MIN_SALARY_SHIHAKA) continue;

      const needs = analyzeTeamNeeds(team);
      const plan = getFrontOfficePlanPublic(team);
      const foMode = plan.mode;
      const candidates = remainingPool
        .filter((p) => !signedPlayers.has(p.id))
        .map((p) => {
          const salary = Math.max(MIN_SALARY_SHIHAKA, p.salary);
          if (team.budget - reserve < salary) return null;
          const r = evalOffer(p, { salary, years: 1 }, team, allTeams);
          const needBonus = calcNeedMatch(p, needs);
          let modeBonus = 0;
          if (foMode === 'rebuild') {
            if ((p.age || 25) <= 25) modeBonus += CPU_FA_REBUILD_YOUNG_BONUS;
            if ((p.age || 25) >= 32) modeBonus -= CPU_FA_REBUILD_OLD_PENALTY;
          } else if (foMode === 'contend') {
            if ((p.age || 25) >= 29) modeBonus += CPU_FA_CONTEND_VET_BONUS;
          }
          return { pid: p.id, score: r.total + needBonus * 0.3 + modeBonus, salary };
        })
        .filter((c) => c && c.score >= CPU_FA_MIN_SCORE)
        .sort((a, b) => b.score - a.score);

      if (!candidates.length) continue;

      const best = candidates[0];
      const player = remainingPool.find((p) => p.id === best.pid);
      if (!player) continue;

      const foreignPlayers = team.players.filter((p) => p.isForeign);
      const foreignActiveOnTeam = foreignPlayers.length;
      const foreignPitchers = foreignPlayers.filter((p) => p.isPitcher).length;
      const foreignBatters = foreignPlayers.length - foreignPitchers;
      const wouldBeAllPitchers = player.isPitcher && foreignPitchers === MAX_外国人_一軍 - 1;
      const wouldBeAllBatters = !player.isPitcher && foreignBatters === MAX_外国人_一軍 - 1;
      const balanceViolation =
        foreignActiveOnTeam === MAX_外国人_一軍 - 1 && (wouldBeAllPitchers || wouldBeAllBatters);
      const goToFarm = player.isForeign && (foreignActiveOnTeam >= MAX_外国人_一軍 || balanceViolation);

      const newPlayerEntry = { ...player, isFA: false, contractYearsLeft: 1, salary: best.salary };
      const acquireReason = player.isForeign ? '外国人獲得' : (player.isWaiverReleased ? '戦力外獲得' : 'FA獲得');
      const historyRecord = { ...newPlayerEntry, exitYear: currentYear ?? 0, exitReason: acquireReason, tenure: 0 };

      if (goToFarm) {
        teamMap.set(team.id, {
          ...team,
          farm: [...(team.farm || []), newPlayerEntry],
          budget: team.budget - best.salary,
          history: [...(team.history || []), historyRecord],
        });
      } else {
        teamMap.set(team.id, {
          ...team,
          players: [...team.players, newPlayerEntry],
          budget: team.budget - best.salary,
          history: [...(team.history || []), historyRecord],
        });
      }

      remainingPool = remainingPool.filter((p) => p.id !== best.pid);
      signedPlayers.add(best.pid);
      claimed.push({ player, teamName: team.name, teamEmoji: team.emoji, teamId: team.id });
      changed = true;

      news.push({
        type: 'season',
        headline: `【入団】${player.name}が${team.name}と契約`,
        source: '野球速報',
        dateLabel: '',
        body: `${player.name}選手（${player.age}歳）が${team.name}と契約した。`,
      });
    }
  }

  return {
    updatedTeams: teams.map((t) => teamMap.get(t.id) || t),
    remainingFaPool: remainingPool,
    news,
    claimed,
  };
}
