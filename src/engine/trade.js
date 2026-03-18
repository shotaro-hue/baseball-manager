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
  const starters = pitchers.filter((p) => p.subtype === "先発");
  const avgV = pitchers.length ? pitchers.reduce((s, p) => s + p.pitching.velocity, 0) / pitchers.length : 50;
  const batters = team.players.filter((p) => !p.isPitcher);
  const avgC = batters.length ? batters.reduce((s, p) => s + p.batting.contact, 0) / batters.length : 50;
  const avgAge = team.players.reduce((s, p) => s + p.age, 0) / Math.max(team.players.length, 1);
  const needs = [];
  if (starters.length < 4) needs.push("先発投手が不足");
  if (avgV < 60) needs.push("投手陣の球威強化");
  if (avgC < 60) needs.push("ミート力の向上");
  if (avgAge > 30) needs.push("若手の補充が急務");
  if (needs.length === 0) needs.push("バランス型の補強");
  return needs.slice(0, 2);
}

export function evalTradeForCpu(cpuTeam, give, receive, cashDiff) {
  const gv = give.reduce((s, p) => s + tradeValue(p), 0);
  const rv = receive.reduce((s, p) => s + tradeValue(p), 0);
  let diff = gv - rv + (cashDiff || 0) / 100000;
  const needs = analyzeTeamNeeds(cpuTeam);
  const np = needs.some((n) => n.includes("投手"));
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
  const np = needs.some((n) => n.includes("投手"));
  const want = mp.filter((p) => np ? p.isPitcher : !p.isPitcher).sort((a, b) => tradeValue(b) - tradeValue(a))[0];
  if (!want) return null;
  const wv = tradeValue(want);
  const offer = cp.map((p) => ({ p, d: Math.abs(tradeValue(p) - wv) })).sort((a, b) => a.d - b.d)[0]?.p;
  if (!offer) return null;
  const vd = tradeValue(offer) - wv;
  return { from: cpuTeam, want: [want], offer: [offer], cash: vd < -10 ? Math.abs(vd) * 500000 : 0 };
}
