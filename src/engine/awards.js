import { saberBatter, saberPitcher } from './sabermetrics';

/* ═══════════════════════════════════════════════
   AWARDS & RECORDS ENGINE
   シーズン表彰・歴代記録・殿堂システム
═══════════════════════════════════════════════ */

export function calcSeasonAwards(teams, year) {
  const allPlayers = teams.flatMap(t => t.players.map(p => ({ ...p, _teamId: t.id, _teamName: t.name, _teamWins: t.wins || 0 })));
  const batters  = allPlayers.filter(p => !p.isPitcher && (p.stats?.PA  || 0) >= 80);
  const pitchers = allPlayers.filter(p =>  p.isPitcher && (p.stats?.IP  || 0) >= 40);

  return {
    year,
    mvp:      pickMVP(batters, allPlayers),
    sawamura: pickSawamura(pitchers),
    rookie:   pickRookie(allPlayers),
    bestNine: pickBestNine(batters, pitchers),
  };
}

function pickMVP(batters, allPlayers) {
  if (!batters.length) return null;
  const scored = batters.map(p => {
    const sb = saberBatter(p.stats ?? {});
    const teamBonus = Math.min((p._teamWins || 0) / 12, 4);
    const score = sb.WAR * 0.6 + sb.OPS * 18 + (p.stats?.RBI || 0) * 0.04 + teamBonus;
    return { name: p.name, teamName: p._teamName, age: p.age, pos: p.pos, score, WAR: sb.WAR, OPS: sb.OPS, RBI: p.stats?.RBI || 0 };
  });
  return scored.sort((a, b) => b.score - a.score)[0] ?? null;
}

function pickSawamura(pitchers) {
  if (!pitchers.length) return null;
  // NPB沢村賞基準（緩和版）
  const eligible = pitchers.filter(p => {
    const sp = saberPitcher(p.stats ?? {});
    return (p.stats?.IP || 0) >= 130 && sp.ERA <= 3.50 && (p.stats?.W || 0) >= 10;
  });
  const pool = eligible.length ? eligible : pitchers;
  const best = pool.map(p => {
    const sp = saberPitcher(p.stats ?? {});
    return { name: p.name, teamName: p._teamName, age: p.age, ERA: sp.ERA, FIP: sp.FIP, W: p.stats?.W || 0, IP: p.stats?.IP || 0 };
  }).sort((a, b) => a.FIP - b.FIP);
  return best[0] ?? null;
}

function pickRookie(allPlayers) {
  const rookies = allPlayers.filter(p => {
    const careerAB = (p.careerLog || []).reduce((s, y) => s + (y.stats?.AB || 0) + (y.stats?.BF || 0), 0);
    return p.age <= 27 && careerAB < 60;
  });
  const scored = rookies.map(p => {
    let score;
    if (p.isPitcher) {
      const ip = p.stats?.IP || 0;
      score = ip > 0 ? Math.max(0, 4 - (saberPitcher(p.stats ?? {}).ERA || 4)) * 3 + ip * 0.05 : 0;
    } else {
      score = saberBatter(p.stats ?? {}).WAR * 2;
    }
    return { name: p.name, teamName: p._teamName, age: p.age, pos: p.isPitcher ? '投手' : p.pos, score };
  });
  return scored.sort((a, b) => b.score - a.score)[0] ?? null;
}

function pickBestNine(batters, pitchers) {
  const result = {};
  const posConfig = [
    { label: '捕手',   pats: ['捕手'],           count: 1 },
    { label: '一塁手', pats: ['一塁'],            count: 1 },
    { label: '二塁手', pats: ['二塁'],            count: 1 },
    { label: '三塁手', pats: ['三塁'],            count: 1 },
    { label: '遊撃手', pats: ['遊撃'],            count: 1 },
    { label: '外野手', pats: ['左翼','中堅','右翼','外野'], count: 3 },
  ];
  for (const { label, pats, count } of posConfig) {
    const cands = batters.filter(p => pats.some(pat => (p.pos || '').includes(pat)));
    result[label] = cands
      .sort((a, b) => saberBatter(b.stats ?? {}).WAR - saberBatter(a.stats ?? {}).WAR)
      .slice(0, count)
      .map(p => ({ name: p.name, teamName: p._teamName, pos: p.pos }));
  }
  if (pitchers.length) {
    const bp = pitchers.map(p => ({ ...p, _war: saberPitcher(p.stats ?? {}).WAR }))
      .sort((a, b) => b._war - a._war)[0];
    result['投手'] = bp ? [{ name: bp.name, teamName: bp._teamName, pos: '投手' }] : [];
  }
  return result;
}

/* ─── 歴代記録の更新 ─────────────────────────── */

export function updateRecords(records, teams) {
  const newRec = {
    singleSeasonHR:  records.singleSeasonHR  ?? null,
    singleSeasonAVG: records.singleSeasonAVG ?? null,
    singleSeasonK:   records.singleSeasonK   ?? null,
    careerHR: { ...(records.careerHR ?? {}) },
    careerW:  { ...(records.careerW  ?? {}) },
  };

  for (const t of teams) {
    for (const p of t.players) {
      const s = p.stats;
      if (!s) continue;

      if ((s.HR || 0) > (newRec.singleSeasonHR?.value || 0))
        newRec.singleSeasonHR = { value: s.HR, playerName: p.name };

      if ((s.AB || 0) >= 100) {
        const avg = s.H / s.AB;
        if (avg > (newRec.singleSeasonAVG?.value || 0))
          newRec.singleSeasonAVG = { value: avg, playerName: p.name };
      }

      if ((s.Kp || 0) > (newRec.singleSeasonK?.value || 0))
        newRec.singleSeasonK = { value: s.Kp, playerName: p.name };

      // 通算本塁打
      const careerHR = (p.careerLog || []).reduce((sum, y) => sum + (y.stats?.HR || 0), s.HR || 0);
      if (careerHR > (newRec.careerHR[p.id]?.value || 0))
        newRec.careerHR[p.id] = { value: careerHR, playerName: p.name };

      // 通算勝利数
      const careerW = (p.careerLog || []).reduce((sum, y) => sum + (y.stats?.W || 0), s.W || 0);
      if (careerW > (newRec.careerW[p.id]?.value || 0))
        newRec.careerW[p.id] = { value: careerW, playerName: p.name };
    }
  }
  return newRec;
}

/* ─── 殿堂チェック ───────────────────────────── */

export function checkHallOfFame(hallOfFame, allAlumni, year) {
  const existing = new Set(hallOfFame.map(h => h.playerId));
  const candidates = allAlumni.filter(p => {
    if (existing.has(p.id)) return false;
    const retireYear = p.exitYear || (year - 3);
    if (year - retireYear < 2) return false;
    const careerHR = (p.careerLog || []).reduce((s, y) => s + (y.stats?.HR || 0), 0);
    const careerW  = (p.careerLog || []).reduce((s, y) => s + (y.stats?.W  || 0), 0);
    const careerPA = (p.careerLog || []).reduce((s, y) => s + (y.stats?.PA || 0), 0);
    return careerHR >= 200 || careerW >= 100 || careerPA >= 3000;
  });
  return candidates.slice(0, 3).map(p => {
    const careerHR = (p.careerLog || []).reduce((s, y) => s + (y.stats?.HR || 0), 0);
    const careerW  = (p.careerLog || []).reduce((s, y) => s + (y.stats?.W  || 0), 0);
    const careerPA = (p.careerLog || []).reduce((s, y) => s + (y.stats?.PA || 0), 0);
    return { playerId: p.id, playerName: p.name, inductYear: year, careerHR, careerW, careerPA };
  });
}
