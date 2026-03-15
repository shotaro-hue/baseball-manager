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

  if (won !== undefined) {
    const starters = Object.entries(pitcherMap).sort((a, b) => b[1].outs - a[1].outs);
    if (starters.length > 0) {
      const starterId = starters[0][0];
      return updated.map((p) => {
        if (p.id !== starterId) return p;
        return { ...p, stats: { ...p.stats, W: p.stats.W + (won ? 1 : 0), L: p.stats.L + (won ? 0 : 1) } };
      });
    }
  }
  return updated;
}

// 試合後コンディション更新
export function applyPostGameCondition(players, log, isMyTeam) {
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
      if (thrown === 0) return p;
      const recoveryBonus = ((p.pitching?.recovery || 50) - 50) / 200;
      const fatigueDrop = clamp(Math.round(thrown / 3 - recoveryBonus * 15), 5, 40);
      const newCond = clamp(p.condition - fatigueDrop, 30, 100);
      return { ...p, condition: newCond, lastPitched: true };
    } else {
      const played = log.some((e) => e.batId === p.id && !e.isStolenBase);
      if (!played) return p;
      const recoveryBonus = ((p.batting?.recovery || 50) - 50) / 300;
      const delta = clamp(Math.round(-3 + recoveryBonus * 5), -5, 2);
      const newCond = clamp(p.condition + delta, 50, 100);
      return { ...p, condition: newCond };
    }
  });
}
