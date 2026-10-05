import { saberBatter, saberPitcher } from './sabermetrics';
import { normalizeCareerLogSummary } from './careerStats';

function getCareerSummary(player) {
  const summary = normalizeCareerLogSummary(player?.careerLogSummary);
  return {
    totalHomeRuns: summary.totalHomeRuns,
    totalGames: summary.totalGames,
    totalPlateAppearances: summary.totalPlateAppearances,
    totalInningsPitched: summary.totalInningsPitched,
    totalWins: summary.totalWins,
  };
}

/* ═══════════════════════════════════════════════
   AWARDS & RECORDS ENGINE
   シーズン表彰・歴代記録・殿堂システム
═══════════════════════════════════════════════ */

export function calcSeasonAwards(teams, year) {
  const allPlayers = teams.flatMap(t => t.players.map(p => ({ ...p, _teamId: t.id, _teamName: t.name, _teamWins: t.wins || 0, _league: t.league })));
  const batters  = allPlayers.filter(p => !p.isPitcher && (p.stats?.PA  || 0) >= 80);
  const pitchers = allPlayers.filter(p =>  p.isPitcher && (p.stats?.IP  || 0) >= 40);

  const seTeams = teams.filter(t => t.league === 'セ');
  const paTeams = teams.filter(t => t.league === 'パ');
  const seBatters  = batters.filter(p => p._league === 'セ');
  const paBatters  = batters.filter(p => p._league === 'パ');
  const sePitchers = pitchers.filter(p => p._league === 'セ');
  const paPitchers = pitchers.filter(p => p._league === 'パ');

  return {
    version: 2,
    year,
    mvp:        { central: pickMVP(seBatters, sePitchers, seTeams), pacific: pickMVP(paBatters, paPitchers, paTeams) },
    sawamura:   pickSawamura(pitchers),
    rookie:     { central: pickRookie(allPlayers.filter(p => p._league === 'セ')), pacific: pickRookie(allPlayers.filter(p => p._league === 'パ')) },
    bestNine:   { central: pickBestNine(seBatters, sePitchers), pacific: pickBestNine(paBatters, paPitchers) },
    titles:     { central: calcTitles(seTeams), pacific: calcTitles(paTeams) },
    farmAwards: calcFarmAwards(teams),
  };
}

// リーグ内タイトル計算（首位打者・本塁打王・打点王・盗塁王・最優秀防御率・最多勝・最多奪三振・最多セーブ）
function calcTitles(leagueTeams) {
  const lgGames = Math.max(...leagueTeams.map(t => (t.wins||0)+(t.losses||0)+(t.draws||0)), 80);
  const minPA = Math.round(lgGames * 3.1);
  const minIP = lgGames;

  const lp = leagueTeams.flatMap(t => t.players.map(p => ({...p, _teamName: t.name, _teamId: t.id})));
  const batters  = lp.filter(p => !p.isPitcher);
  const pitchers = lp.filter(p =>  p.isPitcher);

  const top = (arr, fn, ascending = false) => {
    const scored = arr.map(p => ({ p, value: fn(p) })).filter(x => Number.isFinite(x.value));
    if (!scored.length) return null;
    const best = (ascending ? Math.min : Math.max)(...scored.map(x => x.value));
    const winners = scored.filter(x => Math.abs(x.value - best) < 1e-12).map(({p, value}) => ({
      playerId: p.id, teamId: p._teamId, name: p.name, teamName: p._teamName, value,
    }));
    // Keep the first winner's legacy fields for existing saves/consumers.
    return { ...winners[0], winners };
  };

  const qBatters  = batters.filter(p => (p.stats?.PA||0) >= minPA);
  const qPitchers = pitchers.filter(p => (p.stats?.IP||0) >= minIP);

  const era = top(qPitchers, p => p.stats.IP > 0 && Number.isFinite(p.stats.ER) ? p.stats.ER / p.stats.IP * 9 : NaN, true);

  return {
    version: 2,
    avg: top(qBatters,  p => p.stats.AB>0?p.stats.H/p.stats.AB:NaN),
    obp: top(qBatters, p => {
      const s = p.stats;
      if (!['H','AB','BB','HBP','SF'].every(k => Number.isFinite(s[k]))) return NaN;
      const denominator = s.AB + s.BB + s.HBP + s.SF;
      return denominator > 0 ? (s.H + s.BB + s.HBP) / denominator : NaN;
    }),
    hr:  top(batters,   p => p.stats?.HR),
    rbi: top(batters,   p => p.stats?.RBI),
    sb:  top(batters,   p => p.stats?.SB),
    era,
    win: top(pitchers,  p => p.stats?.W),
    winPct: top(pitchers.filter(p => p.stats?.W >= 13), p => Number.isFinite(p.stats.L) ? p.stats.W / (p.stats.W + p.stats.L) : NaN),
    so:  top(pitchers,  p => p.stats?.Kp),
    sv:  top(pitchers,  p => p.stats?.SV),
    hld: top(pitchers,  p => p.stats?.HLD),
  };
}

function pickMVP(batters, pitchers, teams) {
  const measured = teams.flatMap(t => t.players).filter(p => p.isPitcher && p.stats?.IP > 0 && Number.isFinite(p.stats.ER));
  const ip = measured.reduce((sum, p) => sum + p.stats.IP, 0);
  const leagueERA = ip > 0 ? measured.reduce((sum, p) => sum + p.stats.ER, 0) / ip * 9 : null;
  const scored = batters.map(p => {
    const sb = saberBatter(p.stats ?? {});
    const teamBonus = Math.min((p._teamWins || 0) / 12, 4);
    // Both roles use a run-contribution proxy / 10, plus the same team bonus.
    const score = sb.WAR + teamBonus;
    return { playerId: p.id, teamId: p._teamId, name: p.name, teamName: p._teamName, age: p.age, pos: p.pos, score, WAR: sb.WAR, OPS: sb.OPS, RBI: p.stats?.RBI || 0 };
  });
  if (leagueERA != null) for (const p of pitchers) {
    if (!Number.isFinite(p.stats?.ER)) continue;
    const ERA = p.stats.ER / p.stats.IP * 9;
    scored.push({ playerId: p.id, teamId: p._teamId, name: p.name, teamName: p._teamName, age: p.age, pos: '投手', ERA,
      score: (leagueERA - ERA) * p.stats.IP / 90 + Math.min((p._teamWins || 0) / 12, 4) });
  }
  return scored.filter(p => Number.isFinite(p.score)).sort((a, b) => b.score - a.score)[0] ?? null;
}

function pickSawamura(pitchers) {
  if (!pitchers.length) return null;
  // NPB沢村賞基準（緩和版）
  const eligible = pitchers.filter(p => {
    const sp = saberPitcher(p.stats ?? {});
    return (p.stats?.IP || 0) >= 130 && sp.ERA <= 3.50 && (p.stats?.W || 0) >= 10;
  });
  const pool = eligible;
  const best = pool.map(p => {
    const sp = saberPitcher(p.stats ?? {});
    return { playerId: p.id, teamId: p._teamId, name: p.name, teamName: p._teamName, age: p.age, ERA: sp.ERA, FIP: sp.FIP, W: p.stats?.W || 0, IP: p.stats?.IP || 0 };
  }).filter(p => Number.isFinite(p.FIP)).sort((a, b) => a.FIP - b.FIP);
  return best[0] ?? null;
}

function pickRookie(allPlayers) {
  const rookies = allPlayers.filter(p => {
    const careerSummary = getCareerSummary(p);
    const belowCareerLimit = p.isPitcher
      ? careerSummary.totalInningsPitched < 30
      : careerSummary.totalPlateAppearances < 60;
    return p.age <= 27 && belowCareerLimit && (p.isPitcher ? p.stats?.IP > 0 : p.stats?.PA > 0);
  });
  const scored = rookies.map(p => {
    let score;
    if (p.isPitcher) {
      const ip = p.stats?.IP || 0;
      score = ip > 0 ? Math.max(0, 4 - saberPitcher(p.stats ?? {}).ERA) * 3 + ip * 0.05 : 0;
    } else {
      score = saberBatter(p.stats ?? {}).WAR * 2;
    }
    return { playerId: p.id, teamId: p._teamId, name: p.name, teamName: p._teamName, age: p.age, pos: p.isPitcher ? '投手' : p.pos, score };
  });
  return scored.filter(p => Number.isFinite(p.score)).sort((a, b) => b.score - a.score)[0] ?? null;
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
      .map(p => ({ playerId: p.id, teamId: p._teamId, name: p.name, teamName: p._teamName, pos: p.pos }));
  }
  if (pitchers.length) {
    const bp = pitchers.map(p => ({ ...p, _war: saberPitcher(p.stats ?? {}).WAR }))
      .sort((a, b) => b._war - a._war)[0];
    result['投手'] = bp ? [{ playerId: bp.id, teamId: bp._teamId, name: bp.name, teamName: bp._teamName, pos: '投手' }] : [];
  }
  return result;
}

/* ─── 二軍タイトル（イースタン/ウエスタン） ─────── */

function calcFarmAwards(teams) {
  const leagueAwards = (leagueTeams, leagueName) => {
    const all = leagueTeams.flatMap(t => (t.farm||[]).map(p => ({ ...p, _teamName: t.name, _teamId: t.id })));
    const batters  = all.filter(p => !p.isPitcher && (p.stats2?.PA||0) >= 50);
    const pitchers = all.filter(p =>  p.isPitcher && (p.stats2?.IP||0) >= 30);
    const top = (arr, fn) => {
      const scored = arr.map(p => ({ p, value: fn(p) })).filter(x => Number.isFinite(x.value));
      if (!scored.length) return null;
      const best = Math.max(...scored.map(x => x.value));
      const winners = scored.filter(x => Math.abs(x.value - best) < 1e-12).map(({p, value}) => ({ playerId: p.id, teamId: p._teamId, name: p.name, teamName: p._teamName, value }));
      return { ...winners[0], winners };
    };
    return {
      league:  leagueName,
      batting: top(batters.filter(p => p.stats2.AB > 0 && Number.isFinite(p.stats2.H)), p => p.stats2.H / p.stats2.AB),
      hr:      top(all.filter(p=>!p.isPitcher), p => p.stats2?.HR),
      wins:    top(pitchers, p => p.stats2?.W),
    };
  };
  const seTeams = teams.filter(t => t.league === 'セ');
  const paTeams = teams.filter(t => t.league === 'パ');
  return {
    eastern: leagueAwards(seTeams, 'イースタン'),
    western: leagueAwards(paTeams, 'ウエスタン'),
  };
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
  const broken = [];

  for (const t of teams) {
    for (const p of t.players) {
      const s = p.stats;
      if (!s) continue;

      if ((s.HR || 0) > (newRec.singleSeasonHR?.value || 0)) {
        if (newRec.singleSeasonHR)
          broken.push({ type:"singleSeasonHR", playerName:p.name, teamName:t.name, value:s.HR, oldValue:newRec.singleSeasonHR.value });
        newRec.singleSeasonHR = { value: s.HR, playerName: p.name };
      }

      if ((s.AB || 0) >= 100) {
        const avg = s.H / s.AB;
        if (avg > (newRec.singleSeasonAVG?.value || 0)) {
          if (newRec.singleSeasonAVG)
            broken.push({ type:"singleSeasonAVG", playerName:p.name, teamName:t.name, value:avg, oldValue:newRec.singleSeasonAVG.value });
          newRec.singleSeasonAVG = { value: avg, playerName: p.name };
        }
      }

      if ((s.Kp || 0) > (newRec.singleSeasonK?.value || 0)) {
        if (newRec.singleSeasonK)
          broken.push({ type:"singleSeasonK", playerName:p.name, teamName:t.name, value:s.Kp, oldValue:newRec.singleSeasonK.value });
        newRec.singleSeasonK = { value: s.Kp, playerName: p.name };
      }

      // 通算本塁打
      const careerHR = getCareerSummary(p).totalHomeRuns + (s.HR || 0);
      if (careerHR > (newRec.careerHR[p.id]?.value || 0))
        newRec.careerHR[p.id] = { value: careerHR, playerName: p.name };

      // 通算勝利数
      const careerW = getCareerSummary(p).totalWins + (s.W || 0);
      if (careerW > (newRec.careerW[p.id]?.value || 0))
        newRec.careerW[p.id] = { value: careerW, playerName: p.name };
    }
  }
  return { records: newRec, broken };
}

/* ─── 殿堂チェック ───────────────────────────── */

export function checkHallOfFame(hallOfFame, allAlumni, year) {
  const existing = new Set(hallOfFame.map(h => h.playerId));
  const candidates = allAlumni.filter(p => {
    if (existing.has(p.id)) return false;
    const retireYear = p.exitYear || (year - 3);
    if (year - retireYear < 2) return false;
    const summary = getCareerSummary(p);
    const careerHR = summary.totalHomeRuns;
    const careerW  = summary.totalWins;
    const careerPA = summary.totalPlateAppearances;
    return careerHR >= 200 || careerW >= 100 || careerPA >= 3000;
  });
  return candidates.slice(0, 3).map(p => {
    const summary = getCareerSummary(p);
    const careerHR = summary.totalHomeRuns;
    const careerW  = summary.totalWins;
    const careerPA = summary.totalPlateAppearances;
    return { playerId: p.id, playerName: p.name, inductYear: year, careerHR, careerW, careerPA };
  });
}
