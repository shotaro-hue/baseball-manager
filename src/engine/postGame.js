import { r2, clamp } from '../utils';
import { IS_HIT, IS_OUT } from '../constants';
import { emptyStats } from './player';


/* ═══════════════════════════════════════════════
   POST-GAME PROCESSING
═══════════════════════════════════════════════ */

// 試合ログから選手成績を反映
export function applyGameStatsFromLog(players, log, isMyTeam, won) {
  const myAtBats = log.filter((e) => e.scorer === isMyTeam && e.batId && e.result && e.result !== "change");
  const myPitchABs = log.filter((e) => e.scorer === !isMyTeam && e.pitcherId && e.result && e.result !== "change");

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

    allMyEvents.forEach((e) => {
      if (e.isStolenBase) {
        if (e.result === "sb") s.SB++;
        if (e.result === "cs") s.CS++;
        return;
      }
      s.PA++;
      const isBB = e.result === "bb";
      const isHBP = e.result === "hbp";
      if (!isBB && !isHBP) s.AB++;
      if (IS_HIT(e.result)) s.H++;
      if (e.result === "d") s.D++;
      if (e.result === "t") s.T++;
      if (e.result === "hr") s.HR++;
      if (isBB) s.BB++;
      if (isHBP) s.HBP++;
      if (e.result === "k") s.K++;
      s.RBI += (e.rbi || 0);
      if (e.ev > 0) { s.evSum += e.ev; s.evN++; }
      if (e.ev > 0 && e.la !== undefined) { s.laSum += e.la; s.laN++; }
    });

    if (pm) {
      const ip = pm.outs / 3;
      s.IP = r2(s.IP + ip);
      s.BF += pm.BF; s.Kp += pm.Kp; s.BBp += pm.BBp;
      s.HBPp += pm.HBPp; s.HRp += pm.HRp; s.Hp += pm.Hp;
      s.ER += Math.round(pm.ER);
    }
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

    return updated.map((p) => {
      const s = { ...p.stats };

      // 勝利投手・敗戦投手（先発をベースに）
      if (p.id === starterId) {
        s.W += won ? 1 : 0;
        s.L += (!won && finalLead < 0) ? 1 : 0; // 引き分けは敗戦なし
        // QS: 先発が6回以上投げ自責点3以下
        const sm = pitcherMap[starterId];
        if (sm && sm.outs >= 18 && sm.ER <= 3) s.QS++;
      }

      // SV: リリーフが勝利チームのクローズを務めた（セーブ状況）
      if (isMulti && p.id === closerId && p.id !== starterId) {
        if (saveSit) s.SV++;
        // BS: セーブ状況で登板したが守れなかった（チームが負けた）
        else if (!won && finalLead < 0 && Math.abs(finalLead) <= 3) s.BS++; // 引き分けはBS対象外
      }

      // HLD: 中継ぎ投手（先発でも抑えでもない）がセーブ状況を保持
      if (isMulti && p.id !== starterId && p.id !== closerId) {
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
        return { ...p, recentPitchingDays: recentBase };
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
