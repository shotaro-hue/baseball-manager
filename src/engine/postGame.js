import { r2, clamp } from '../utils';
import { IS_HIT, IS_OUT } from '../constants';
import { emptyStats } from './player';

const getBattedBallType = (e) => {
  if (!e || !['out', 'sf'].includes(e.result)) return null;
  const la = e.la ?? 0;
  if (la >= 18) return 'fly';
  if (la >= 8) return 'line';
  return 'ground';
};

const getFieldZone = (e) => {
  const spray = e?.sprayAngle ?? 45;
  if (spray < 35) return 'LF';
  if (spray > 55) return 'RF';
  return 'CF';
};

const MAX_BATTED_BALL_EVENTS = 500;
const SPRAY_CHART_MAX_DISTANCE = 150;

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function normalizeBattedBallCoordinate(rawValue, fallbackValue = 0) {
  if (!Number.isFinite(rawValue)) return fallbackValue;
  // ⚠️ セキュリティ: ログ由来値は有限数を検証し、描画崩れ防止のため 0〜1 に正規化して保存する
  return clamp01(Number(rawValue));
}


function sanitizeMetaObject(value) {
  return value && typeof value === 'object' ? value : {};
}

function mapHitTypeFromResult(result) {
  if (result === 's') return 'single';
  if (result === 'd') return 'double';
  if (result === 't') return 'triple';
  if (result === 'hr') return 'homeRun';
  return 'out';
}

function buildBattedBallEvent(e, gameDay) {
  if (!e || !e.batId || !Number.isFinite(e.ev) || e.ev <= 0) return null;

  const safeSpray = Number.isFinite(e.sprayAngle) ? Math.max(0, Math.min(90, Number(e.sprayAngle))) : 45;
  const safeDist = Number.isFinite(e.dist) ? Math.max(0, Math.min(220, Number(e.dist))) : 0;
  const hrCheckFenceDistance = Number(e?.physicsMeta?.hrCheck?.fenceDistance);
  const rawFenceDistance = Number.isFinite(hrCheckFenceDistance)
    ? hrCheckFenceDistance
    : Number(e?.physicsMeta?.fenceDistance);
  const safeFenceDistance = Number.isFinite(rawFenceDistance)
    ? Math.max(85, Math.min(140, Number(rawFenceDistance)))
    : 100;
  const rawClearance = Number(e?.physicsMeta?.hrCheck?.clearance);
  const safeHrClearance = Number.isFinite(rawClearance) ? Math.max(-20, Math.min(60, rawClearance)) : null;

  const maxDisplayDistance = SPRAY_CHART_MAX_DISTANCE;

  const x = normalizeBattedBallCoordinate(safeSpray / 90, 0.5);
  const y = normalizeBattedBallCoordinate(safeDist / maxDisplayDistance, 0);
  const fenceRatio = normalizeBattedBallCoordinate(safeFenceDistance / maxDisplayDistance, 0.82);

  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  const isHomeRun = e.result === "hr" || Boolean(e?.physicsMeta?.isHrByTrajectory);
  const warningReasons = [];
  if (!Number.isFinite(rawFenceDistance)) warningReasons.push("fenceDistanceM が不正です");
  if (!Number.isFinite(y) || y < 0 || y > 1) warningReasons.push("distanceRatio が不正です");
  if (!Number.isFinite(fenceRatio) || fenceRatio < 0 || fenceRatio > 1) warningReasons.push("fenceRatio が不正です");
  if (isHomeRun && y + 0.02 < fenceRatio) warningReasons.push("HR打球がフェンス内側に表示されています");
  if (!isHomeRun && y - 0.02 > fenceRatio) warningReasons.push("非HR打球がフェンス外側に表示されています");

  return {
    playerId: e.batId,
    gameDay: Number.isFinite(gameDay) ? Number(gameDay) : 0,
    x,
    y,
    hitType: mapHitTypeFromResult(e.result),
    exitVelo: Number(e.ev),
    launchAngle: Number.isFinite(e.la) ? Number(e.la) : 0,
    distance: safeDist,
    sprayAngle: safeSpray,
    fenceDistance: safeFenceDistance,
    fenceRatio,
    isHrByTrajectory: Boolean(e?.physicsMeta?.isHrByTrajectory),
    hrClearance: safeHrClearance,
    isDisplayInconsistent: warningReasons.length > 0,
    warningReasons,
    physics: sanitizeMetaObject(e?.physicsMeta?.physics),
    park: sanitizeMetaObject(e?.physicsMeta?.park),
    environment: sanitizeMetaObject(e?.physicsMeta?.environment),
    crossPark: sanitizeMetaObject(e?.physicsMeta?.crossPark),
    evaluation: sanitizeMetaObject(e?.physicsMeta?.evaluation),
    commentary: sanitizeMetaObject(e?.physicsMeta?.commentary),
    displayWarnings: warningReasons,
  };
}

/**
 * 試合ログからボックススコアデータを計算する。
 * quickSimGame(homeTeam, awayTeam) の log を受け取り、
 * ホーム・アウェイ両チームの打撃・投手成績を返す。
 * @param {Object[]} log           - quickSimGame が返す log 配列
 * @param {Object[]} inningSummary - quickSimGame が返す inningSummary 配列
 * @param {Object[]} homeTeamPlayers - ホームチームの players 配列（名前解決用）
 * @param {Object[]} awayTeamPlayers - アウェイチームの players 配列（名前解決用）
 * @param {number}   homeScore     - 最終ホームチーム得点
 * @param {number}   awayScore     - 最終アウェイチーム得点
 * @returns {{ homeBatting, awayBatting, homePitching, awayPitching, inningScores }}
 */
export function computeBoxScore(log, inningSummary, homeTeamPlayers, awayTeamPlayers, homeScore, awayScore) {
  if (!log || !log.length) return null;

  // scorer=true → home team at bat (bottom of inning in sim)
  // scorer=false → away team at bat (top of inning in sim)
  function computeBatting(players, isHomeBatting) {
    const scorer = isHomeBatting; // home bats → scorer=true
    const map = {};
    const order = [];
    log.forEach(e => {
      if (e.scorer !== scorer || !e.batId || e.isStolenBase || !e.result || e.result === 'change') return;
      if (!map[e.batId]) { map[e.batId] = { AB: 0, H: 0, HR: 0, RBI: 0, BB: 0, K: 0, FO_LF: 0, FO_CF: 0, FO_RF: 0, GO: 0, LO: 0 }; order.push(e.batId); }
      const m = map[e.batId];
      const isBB  = e.result === 'bb';
      const isHBP = e.result === 'hbp';
      const isSF  = e.result === 'sf';
      if (!isBB && !isHBP && !isSF) m.AB++;
      if (IS_HIT(e.result)) m.H++;
      if (e.result === 'hr') m.HR++;
      m.RBI += (e.rbi || 0);
      if (isBB || isHBP) m.BB++;
      if (e.result === 'k') m.K++;
      const battedType = getBattedBallType(e);
      if (battedType === 'fly') m[`FO_${getFieldZone(e)}`]++;
      else if (battedType === 'ground') m.GO++;
      else if (battedType === 'line') m.LO++;
    });
    return order.map(id => {
      const p = players.find(pl => pl.id === id);
      return { id, name: p?.name || '不明', pos: p?.pos || '-', ...map[id] };
    });
  }

  function computePitching(players, isHomePitching, homeWon, drew) {
    // home pitcher faces away batters → away bats → scorer=false
    const batterScorer = !isHomePitching;
    const events = log.filter(e =>
      e.scorer === batterScorer && e.pitcherId && !e.isStolenBase && e.result && e.result !== 'change'
    );
    const map = {};
    const order = [];
    events.forEach(e => {
      if (!map[e.pitcherId]) { map[e.pitcherId] = { outs: 0, H: 0, ER: 0, BB: 0, K: 0 }; order.push(e.pitcherId); }
      const m = map[e.pitcherId];
      if (IS_HIT(e.result)) m.H++;
      if (e.result === 'bb' || e.result === 'hbp') m.BB++;
      if (e.result === 'k') m.K++;
      if (IS_OUT(e.result)) m.outs++;
      if (e.rbi > 0) m.ER += e.rbi;
    });
    const teamWon = isHomePitching ? homeWon : (!homeWon && !drew);
    const finalLead = isHomePitching ? (homeScore - awayScore) : (awayScore - homeScore);
    const saveSit = teamWon && finalLead >= 1 && finalLead <= 3;
    const starterId = order[0];
    const closerId  = order[order.length - 1];
    const isMulti   = order.length >= 2;
    const starterQualifies = teamWon && (map[starterId]?.outs ?? 0) >= 15;
    const winnerId = teamWon ? (starterQualifies ? starterId : (order[1] ?? starterId)) : null;
    // 敗戦投手: 相手チームが最終的にリードを奪ったプレイの投手
    const losingPitcherId = (() => {
      if (teamWon || drew) return null;
      let myScore = 0, oppScore = 0, losingId = null;
      for (const e of log) {
        if (!e.rbi || e.rbi <= 0 || e.isStolenBase) continue;
        if (e.scorer !== batterScorer) {
          // 自チーム得点 → リード回復でリセット
          myScore += e.rbi;
          if (myScore >= oppScore) losingId = null;
        } else {
          // 相手得点 → 勝ち越しなら記録
          const prev = oppScore;
          oppScore += e.rbi;
          if (oppScore > myScore && prev <= myScore) losingId = e.pitcherId ?? null;
        }
      }
      return losingId ?? starterId;
    })();
    return order.map(id => {
      const p = players.find(pl => pl.id === id);
      const m = map[id];
      let result = null;
      if (id === winnerId) result = 'W';
      else if (losingPitcherId && id === losingPitcherId) result = 'L';
      else if (isMulti && id === closerId && id !== starterId && id !== winnerId && saveSit) result = 'S';
      return { id, name: p?.name || '不明', ip: r2(m.outs / 3), H: m.H, ER: m.ER, BB: m.BB, K: m.K, result };
    });
  }

  // イニング別得点を集計
  const inningScores = (() => {
    if (!inningSummary || !inningSummary.length) return [];
    const maxInning = Math.max(...inningSummary.map(s => s.inning));
    const scores = [];
    for (let i = 1; i <= maxInning; i++) {
      const top    = inningSummary.find(s => s.inning === i && s.isTop);
      const bottom = inningSummary.find(s => s.inning === i && !s.isTop);
      scores.push({ inning: i, away: top?.runs ?? 0, home: bottom?.runs ?? 0 });
    }
    return scores;
  })();

  const homeWon = homeScore > awayScore;
  const drew    = homeScore === awayScore;

  return {
    homeBatting:  computeBatting(homeTeamPlayers, true),
    awayBatting:  computeBatting(awayTeamPlayers, false),
    homePitching: computePitching(homeTeamPlayers, true,  homeWon, drew),
    awayPitching: computePitching(awayTeamPlayers, false, homeWon, drew),
    inningScores,
  };
}


/* ═══════════════════════════════════════════════
   POST-GAME PROCESSING
═══════════════════════════════════════════════ */

// 試合ログから選手成績を反映
export function applyGameStatsFromLog(players, log, isMyTeam, won, gameDay = 0) {
  const myAtBats = log.filter((e) => e.scorer === isMyTeam && e.batId && e.result && e.result !== "change");
  const myPitchABs = log.filter((e) => e.scorer === !isMyTeam && e.pitcherId && e.result && e.result !== "change" && !e.isStolenBase);

  const pitcherMap = {};
  myPitchABs.forEach((e) => {
    if (!pitcherMap[e.pitcherId]) pitcherMap[e.pitcherId] = { BF: 0, Kp: 0, BBp: 0, HBPp: 0, HRp: 0, Hp: 0, ER: 0, pitches: 0, outs: 0 };
    const m = pitcherMap[e.pitcherId];
    m.BF++;
    m.pitches += (e.pitches || 4);
    if (e.result === "k") m.Kp++;
    if (e.result === "bb") m.BBp++;
    if (e.result === "hbp") m.HBPp++;
    if (e.result === "hr") { m.HRp++; m.ER += e.rbi || 1; }
    if (IS_HIT(e.result) && e.result !== "hr") m.Hp++;
    if (IS_OUT(e.result)) m.outs++;
    if (e.rbi > 0 && e.result !== "hr") m.ER += e.rbi;
  });

  // ② 投手登板順序を記録（最初に登板したのが先発）
  const pitcherOrder = [];
  const seenP = new Set();
  for (const e of myPitchABs) {
    if (e.pitcherId && !seenP.has(e.pitcherId)) {
      seenP.add(e.pitcherId);
      pitcherOrder.push(e.pitcherId);
    }
  }

  const updated = players.map((p) => {
    const pm = pitcherMap[p.id];
    const allMyEvents = log.filter((e) => e.scorer === isMyTeam && e.batId === p.id && e.result && e.result !== "change");
    if (!allMyEvents.length && !pm) return p;
    const s = { ...emptyStats(), ...p.stats }; // STEP3安全弁: stats未初期化対策
    const baseSprayPoints = Array.isArray(s.sprayPoints) ? s.sprayPoints : [];
    const baseBattedBallEvents = Array.isArray(s.battedBallEvents) ? s.battedBallEvents : [];
    const newSprayPoints = [];
    const newBattedBallEvents = [];

    allMyEvents.forEach((e) => {
      if (e.isStolenBase) {
        if (e.result === "sb") s.SB++;
        if (e.result === "cs") s.CS++;
        return;
      }
      s.PA++;
      const isBB = e.result === "bb";
      const isHBP = e.result === "hbp";
      const isSF = e.result === "sf";
      if (!isBB && !isHBP && !isSF) s.AB++;
      if (IS_HIT(e.result)) s.H++;
      if (e.result === "d") s.D++;
      if (e.result === "t") s.T++;
      if (e.result === "hr") s.HR++;
      if (isBB) s.BB++;
      if (isHBP) s.HBP++;
      if (isSF) s.SF++;
      if (e.result === "k") s.K++;
      const battedType = getBattedBallType(e);
      if (battedType === 'fly') s[`FO_${getFieldZone(e)}`]++;
      else if (battedType === 'ground') s.GO++;
      else if (battedType === 'line') s.LO++;
      if (e.ev > 0) {
        const sprayAngle = Number.isFinite(e.sprayAngle) ? e.sprayAngle : 45;
        if (sprayAngle < 30) s.pullBatted++;
        else if (sprayAngle > 60) s.oppositeBatted++;
        else s.centerBatted++;

        if (e.ev >= 145) s.hardHit++;
        if (battedType === 'ground') s.groundBatted++;
        else if (battedType === 'line') s.lineBatted++;
        else if (battedType === 'fly') s.flyBatted++;
        // ⚠️ セキュリティ: ログ由来値は有限数に検証し、安全な範囲へ丸めて保持する
        const safeDist = Number.isFinite(e.dist) ? Math.max(0, Math.min(220, Number(e.dist))) : 0;
        const safeSpray = Number.isFinite(e.sprayAngle) ? Math.max(0, Math.min(90, Number(e.sprayAngle))) : 45;
        const safeFenceDistance = Number.isFinite(e?.physicsMeta?.fenceDistance)
          ? Math.max(85, Math.min(140, Number(e.physicsMeta.fenceDistance)))
          : null;
        
        const safeIsHrByTrajectory = Boolean(e?.physicsMeta?.isHrByTrajectory);
        
        newSprayPoints.push({
          dist: safeDist,
          sprayAngle: safeSpray,
          result: String(e.result || 'out'),
          fenceDistance: safeFenceDistance,
          isHrByTrajectory: safeIsHrByTrajectory,
        });
        const event = buildBattedBallEvent(e, gameDay);
        if (event) newBattedBallEvents.push(event);
      }
      s.RBI += (e.rbi || 0);
      if (e.ev > 0) { s.evSum += e.ev; s.evN++; }
      if (e.ev > 0 && e.la !== undefined) { s.laSum += e.la; s.laN++; }
    });

    // 得点（R）: scorersに自分のIDが含まれるイベントをカウント
    log.forEach((e) => {
      if (e.scorer === isMyTeam && e.scorers?.includes(p.id)) s.R++;
    });

    if (pm) {
      const ip = pm.outs / 3;
      s.IP = r2(s.IP + ip);
      s.BF += pm.BF; s.Kp += pm.Kp; s.BBp += pm.BBp;
      s.HBPp += pm.HBPp; s.HRp += pm.HRp; s.Hp += pm.Hp;
      s.ER += Math.round(pm.ER);
    }
    const MAX_SPRAY_POINTS = 120;
    s.sprayPoints = [...baseSprayPoints, ...newSprayPoints].slice(-MAX_SPRAY_POINTS);
    s.battedBallEvents = [...baseBattedBallEvents, ...newBattedBallEvents].slice(-MAX_BATTED_BALL_EVENTS);
    return { ...p, stats: s };
  });

  // ② QS/SV/HLD/W/L の付与
  if (won !== undefined && pitcherOrder.length > 0) {
    const starterId = pitcherOrder[0];
    const closerId  = pitcherOrder[pitcherOrder.length - 1];
    const isMulti   = pitcherOrder.length >= 2;

    // 総得点を集計してセーブ状況を判定
    const myRuns  = log.filter(e => !e.isStolenBase && e.scorer === isMyTeam).reduce((s,e) => s+(e.rbi||0), 0);
    const oppRuns = log.filter(e => !e.isStolenBase && e.scorer !== isMyTeam).reduce((s,e) => s+(e.rbi||0), 0);
    const finalLead = myRuns - oppRuns; // 正: 自チームがリード
    const saveSit   = won && finalLead >= 1 && finalLead <= 3; // セーブ状況

    // 勝利投手の決定: 先発が5回以上(outs>=15)投げていれば先発、そうでなければ最初の中継ぎ
    const starterQualifies = won && (pitcherMap[starterId]?.outs ?? 0) >= 15;
    const winnerId = won ? (starterQualifies ? starterId : (pitcherOrder[1] ?? starterId)) : null;

    // 敗戦投手: 相手チームが最終的にリードを奪ったプレイの投手
    const losingPitcherId = (() => {
      if (won || finalLead >= 0) return null; // 勝利or引き分けは敗戦なし
      let myScore = 0, oppScore = 0, losingId = null;
      for (const e of log) {
        if (!e.rbi || e.rbi <= 0 || e.isStolenBase) continue;
        if (e.scorer === isMyTeam) {
          // 自チーム得点 → 同点or逆転でリセット
          myScore += e.rbi;
          if (myScore >= oppScore) losingId = null;
        } else {
          // 相手得点 → 勝ち越しなら記録
          const prev = oppScore;
          oppScore += e.rbi;
          if (oppScore > myScore && prev <= myScore) losingId = e.pitcherId ?? null;
        }
      }
      return losingId ?? starterId; // 特定できなければ先発
    })();

    return updated.map((p) => {
      const s = { ...p.stats };

      if (p.id === starterId) {
        if (p.id === winnerId) s.W++;
        // QS: 先発が6回以上投げ自責点3以下
        const sm = pitcherMap[starterId];
        if (sm && sm.outs >= 18 && sm.ER <= 3) s.QS++;
      }

      // 敗戦投手（先発・救援問わず）: 引き分けは除外
      if (losingPitcherId && p.id === losingPitcherId) s.L++;

      // 先発が資格なし(5回未満): 最初の中継ぎが勝利投手
      if (winnerId && p.id === winnerId && p.id !== starterId) s.W++;

      // SV: 勝利投手でないクローザーがセーブ状況を締めた
      if (isMulti && p.id === closerId && p.id !== starterId && p.id !== winnerId) {
        if (saveSit) s.SV++;
        // BS: セーブ状況で登板したが守れなかった（引き分けはBS対象外）
        else if (!won && finalLead < 0 && Math.abs(finalLead) <= 3) s.BS++;
      }

      // HLD: 先発・クローザー・勝利投手でない中継ぎがセーブ状況を保持
      if (isMulti && p.id !== starterId && p.id !== closerId && p.id !== winnerId) {
        if (pitcherMap[p.id] && saveSit) s.HLD++;
      }

      return { ...p, stats: s };
    });
  }
  return updated;
}

// 連投ゲーム数をカウント（gameDay から遡って連続している日数）
function countConsecutiveGames(days, currentDay) {
  if (!currentDay || !days || !days.length) return 0;
  let count = 0, d = currentDay;
  while (days.includes(d)) { count++; d--; }
  return count;
}

// 試合後コンディション更新（③ 連投疲労を含む）
export function applyPostGameCondition(players, log, isMyTeam, gameDay) {
  const pitchCountMap = {};
  log.forEach((e) => {
    if (!e.pitcherId || e.isStolenBase) return;
    const isPitcherOfMyTeam = isMyTeam ? (e.isTop === true) : (e.isTop === false);
    if (!isPitcherOfMyTeam) return;
    pitchCountMap[e.pitcherId] = (pitchCountMap[e.pitcherId] || 0) + (e.pitches || 0);
  });

  return players.map((p) => {
    if (p.isPitcher) {
      const thrown = pitchCountMap[p.id] || 0;
      // 直近7試合の記録を保持
      const recentBase = (p.recentPitchingDays || []).filter(d => !gameDay || d > gameDay - 7);
      if (thrown === 0) {
        // 登板なし: 日次コンディション回復（休養効果）
        const recoveryRate = (p.pitching?.recovery ?? 50);
        const dailyRecovery = Math.round(8 + (recoveryRate - 50) / 10);
        return { ...p, condition: Math.min((p.condition ?? 100) + dailyRecovery, 100), recentPitchingDays: recentBase };
      }
      const recoveryBonus = ((p.pitching?.recovery || 50) - 50) / 200;
      const fatigueDrop   = clamp(Math.round(thrown / 3 - recoveryBonus * 15), 5, 40);
      // ③ 連投ペナルティ
      const newRecentDays = gameDay ? [...recentBase, gameDay] : recentBase;
      const consec        = countConsecutiveGames(newRecentDays, gameDay);
      const consecPenalty = consec >= 3 ? 15 : consec >= 2 ? 5 : 0;
      const newCond = clamp(p.condition - fatigueDrop - consecPenalty, 20, 100);
      return { ...p, condition: newCond, lastPitched: true, recentPitchingDays: newRecentDays };
    } else {
      const played = log.some((e) => e.batId === p.id && !e.isStolenBase);
      if (!played) return p;
      const recoveryBonus = ((p.batting?.recovery || 50) - 50) / 300;
      const delta = clamp(Math.round(-3 + recoveryBonus * 5), -5, 2);
      const newCond = clamp(p.condition + delta, 60, 100);
      return { ...p, condition: newCond };
    }
  });
}
