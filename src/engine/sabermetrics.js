import { r2, r3 } from '../utils';

/* ═══════════════════════════════════════════════
   SABERMETRICS
═══════════════════════════════════════════════ */

const LG_WOBA = 0.315;
const WOBA_SCALE = 1.15;
const FIP_C = 3.20;

const WW = { BB: 0.69, HBP: 0.72, s1b: 0.88, d2b: 1.24, t3b: 1.56, HR: 2.01 };

export function saberBatter(s) {
  const singles = Math.max(0, s.H - s.D - s.T - s.HR);
  const AVG = s.AB > 0 ? s.H / s.AB : 0;
  const OBP = (s.AB + s.BB + s.HBP + s.SF) > 0
    ? (s.H + s.BB + s.HBP) / (s.AB + s.BB + s.HBP + s.SF) : 0;
  const SLG = s.AB > 0 ? (singles + s.D * 2 + s.T * 3 + s.HR * 4) / s.AB : 0;
  const OPS = OBP + SLG;
  const ISO = SLG - AVG;
  const BBpct = s.PA > 0 ? s.BB / s.PA : 0;
  const Kpct = s.PA > 0 ? s.K / s.PA : 0;
  const BABIP_d = s.AB - s.K - s.HR + s.SF;
  const BABIP = BABIP_d > 0 ? (s.H - s.HR) / BABIP_d : 0;
  const wOBA_n = WW.BB * s.BB + WW.HBP * s.HBP + WW.s1b * singles + WW.d2b * s.D + WW.t3b * s.T + WW.HR * s.HR;
  const wOBA_d = s.AB - s.H + s.BB + s.HBP + s.SF + s.K;
  const wOBA = wOBA_d > 0 ? wOBA_n / wOBA_d : 0;
  const wRCp = Math.round(((wOBA - LG_WOBA) / WOBA_SCALE + 1) * 100);
  const WAR = r2(((wOBA - LG_WOBA) / WOBA_SCALE) * s.PA / 10);
  const battedBallTotal = (s.groundBatted || 0) + (s.lineBatted || 0) + (s.flyBatted || 0);
  const sprayTotal = (s.pullBatted || 0) + (s.centerBatted || 0) + (s.oppositeBatted || 0);

  return {
    AVG: r3(AVG), OBP: r3(OBP), SLG: r3(SLG), OPS: r2(OPS), ISO: r2(ISO),
    BBpct: r3(BBpct), Kpct: r3(Kpct), BABIP: r3(BABIP),
    wOBA: r3(wOBA), wRCp, WAR,
    EVavg: s.evN > 0 ? r2(s.evSum / s.evN) : 0,
    LAavg: s.laN > 0 ? r2(s.laSum / s.laN) : 0,
    hardHitPct: s.evN > 0 ? r3((s.hardHit || 0) / s.evN) : 0,
    pullPct: sprayTotal > 0 ? r3((s.pullBatted || 0) / sprayTotal) : 0,
    centerPct: sprayTotal > 0 ? r3((s.centerBatted || 0) / sprayTotal) : 0,
    oppositePct: sprayTotal > 0 ? r3((s.oppositeBatted || 0) / sprayTotal) : 0,
    gbPct: battedBallTotal > 0 ? r3((s.groundBatted || 0) / battedBallTotal) : 0,
    ldPct: battedBallTotal > 0 ? r3((s.lineBatted || 0) / battedBallTotal) : 0,
    fbPct: battedBallTotal > 0 ? r3((s.flyBatted || 0) / battedBallTotal) : 0,
  };
}

export function saberPitcher(s) {
  const totalBB = s.BBp + s.HBPp;
  const ERA = s.IP > 0 ? r2(s.ER / s.IP * 9) : 0;
  const BBpct = s.BF > 0 ? s.BBp / s.BF : 0;
  const Kpct = s.BF > 0 ? s.Kp / s.BF : 0;
  const BABIP_d = s.BF - totalBB - s.Kp - s.HRp;
  const BABIP = BABIP_d > 0 ? (s.Hp - s.HRp) / BABIP_d : 0;
  const FIP = s.IP > 0 ? r2((13 * s.HRp + 3 * totalBB - 2 * s.Kp) / s.IP + FIP_C) : 0;
  const xFIP = s.IP > 0 ? r2((13 * (s.BF - totalBB - s.Kp) * 0.030 + 3 * totalBB - 2 * s.Kp) / s.IP + FIP_C) : 0;
  const WAR = s.IP > 0 ? r2((FIP_C - FIP) * s.IP / 9 * 0.3) : 0;
  const WHIP = s.IP > 0 ? r2((s.BBp + s.Hp) / s.IP) : 0;

  return { ERA, BBpct: r3(BBpct), Kpct: r3(Kpct), BABIP: r3(BABIP), FIP, xFIP, WAR, WHIP };
}
