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

  const needs = [];
  if (starters.length < 4) needs.push({ type: '先発投手が不足', score: 30 + (4 - starters.length) * 10 });
  if (closers.length === 0) needs.push({ type: '抑え不在', score: 25 });
  if (relievers.length < 3) needs.push({ type: '中継ぎ不足', score: 15 + (3 - relievers.length) * 5 });
  if (avgV < 60) needs.push({ type: '投手陣の球威強化', score: Math.round((60 - avgV) * 0.5) });
  if (catchers.length === 0) needs.push({ type: '捕手補強が急務', score: 28 });
  if (avgC < 60) needs.push({ type: 'ミート力の向上', score: Math.round((60 - avgC) * 0.5) });
  if (avgAge > 30) needs.push({ type: '若手の補充が急務', score: Math.round((avgAge - 30) * 5) });
  if (needs.length === 0) needs.push({ type: 'バランス型の補強', score: 10 });

  return needs.sort((a, b) => b.score - a.score).slice(0, 3);
}

export function evalTradeForCpu(cpuTeam, give, receive, cashDiff) {
  const gv = give.reduce((s, p) => s + tradeValue(p), 0);
  const rv = receive.reduce((s, p) => s + tradeValue(p), 0);
  let diff = gv - rv + (cashDiff || 0) / 100000;
  const needs = analyzeTeamNeeds(cpuTeam);
  const np = needs.some((n) => n.type.includes("投手"));
  give.forEach((p) => { if (np && p.isPitcher) diff += 8; if (!np && !p.isPitcher) diff += 5; if ((p.age || 25) <= 23) diff += 5; });
  receive.forEach((p) => { if ((p.age || 25) <= 26 && tradeValue(p) > 70) diff -= 8; });
  const reasons = [];
  if (diff < -5) reasons.push(`対価が不足（差: ${Math.abs(Math.round(diff))}点）`);
  if (np) reasons.push("投手補強を優先したい");
  else reasons.push("打線強化を優先したい");
  const hasYoungGive = give.some(p => (p.age || 25) <= 23);
  if (!hasYoungGive) reasons.push("若手選手が欲しい");
  return { diff, fair: diff >= -5, favorable: diff >= 8, reasons: reasons.slice(0, 2) };
}

export function generateCpuOffer(cpuTeam, myTeam) {
  const mp = myTeam.players.filter((p) => !p.injury);
  const cp = cpuTeam.players.filter((p) => !p.injury);
  if (!mp.length || !cp.length) return null;
  const needs = analyzeTeamNeeds(cpuTeam);
  const np = needs.some((n) => n.type.includes("投手"));
  const want = mp.filter((p) => np ? p.isPitcher : !p.isPitcher).sort((a, b) => tradeValue(b) - tradeValue(a))[0];
  if (!want) return null;
  const wv = tradeValue(want);
  const offer = cp.map((p) => ({ p, d: Math.abs(tradeValue(p) - wv) })).sort((a, b) => a.d - b.d)[0]?.p;
  if (!offer) return null;
  const vd = tradeValue(offer) - wv;
  return { from: cpuTeam, want: [want], offer: [offer], cash: vd < -10 ? Math.abs(vd) * 500000 : 0 };
}
