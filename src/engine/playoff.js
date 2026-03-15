/* ═══════════════════════════════════════════════
   PLAYOFF SYSTEM
═══════════════════════════════════════════════ */

export function initPlayoff(teams) {
  const se = [...teams.filter((t) => t.league === "セ")].sort((a, b) => b.wins - a.wins || a.losses - b.losses);
  const pa = [...teams.filter((t) => t.league === "パ")].sort((a, b) => b.wins - a.wins || a.losses - b.losses);
  const mkSeries = (t0, t1, adv0, adv1, label) => ({
    label, teams: [t0, t1], wins: [adv0, adv1], adv: [adv0, adv1],
    games: [], done: false, winner: null,
  });
  return {
    phase: "cs1_se",
    cs1_se: mkSeries(se[1], se[2], 0, 0, "CSファーストステージ（セ）"),
    cs1_pa: mkSeries(pa[1], pa[2], 0, 0, "CSファーストステージ（パ）"),
    cs2_se: null, cs2_pa: null, jpSeries: null, champion: null,
    se1: se[0], pa1: pa[0],
  };
}

export function seriesWinner(series, need) {
  if (series.wins[0] >= need) return 0;
  if (series.wins[1] >= need) return 1;
  return null;
}
