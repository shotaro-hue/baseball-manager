import { describe, it, expect } from 'vitest';
import { selectAllStars, runAllStarGame } from '../allstar';

function mkPlayer(id, league, teamId, isPitcher, pos, stats = {}, subtype) {
  return {
    id: `${league}-${teamId}-${id}`,
    name: `P${id}`,
    isPitcher,
    pos,
    subtype,
    stats: {
      PA: 0, AB: 0, H: 0, D: 0, T: 0, HR: 0, BB: 0, HBP: 0, SF: 0, K: 0,
      IP: 0, ER: 0, BBp: 0, HBPp: 0, Kp: 0, HRp: 0, BF: 0, SV: 0, HLD: 0,
      ...stats,
    },
  };
}

function buildLeagueTeams(league, startId) {
  const positions = ['捕手','一塁手','二塁手','三塁手','遊撃手','左翼手','中堅手','右翼手'];
  const teams = [];
  for (let t = 0; t < 6; t++) {
    const players = [];
    positions.forEach((pos, i) => {
      players.push(mkPlayer(`${t}-${pos}-a`, league, startId + t, false, pos, { AB: 100, H: 35 + i, HR: 3 + i, BB: 10, PA: 120 }));
      players.push(mkPlayer(`${t}-${pos}-b`, league, startId + t, false, pos, { AB: 90, H: 22 + i, HR: 1 + i, BB: 6, PA: 100 }));
    });
    for (let i = 0; i < 6; i++) players.push(mkPlayer(`${t}-sp-${i}`, league, startId + t, true, '先発', { IP: 60, HRp: 2 + i, BBp: 8, HBPp: 1, Kp: 45 - i, BF: 200 }, '先発'));
    for (let i = 0; i < 5; i++) players.push(mkPlayer(`${t}-rp-${i}`, league, startId + t, true, '中継ぎ', { IP: 25, HLD: 10 - i, Kp: 20, BBp: 6, HRp: 1, BF: 90 }, '中継ぎ'));
    for (let i = 0; i < 3; i++) players.push(mkPlayer(`${t}-cp-${i}`, league, startId + t, true, '抑え', { IP: 15, SV: 12 - i, Kp: 14, BBp: 3, HRp: 1, BF: 55 }, '抑え'));
    teams.push({ id: startId + t, league, short: `${league}${t}`, players });
  }
  return teams;
}

describe('selectAllStars', () => {
  it('セ・パともに29名選出される', () => {
    const teams = [...buildLeagueTeams('セ', 0), ...buildLeagueTeams('パ', 6)];
    const rosters = selectAllStars(teams);
    expect(rosters.ce.length).toBe(29);
    expect(rosters.pa.length).toBe(29);
  });

  it('ファン投票人数（セ13/パ14）とパDHを満たす', () => {
    const teams = [...buildLeagueTeams('セ', 0), ...buildLeagueTeams('パ', 6)];
    const rosters = selectAllStars(teams);
    expect(rosters.ce.filter(p => p.allStarSource === 'fan').length).toBe(13);
    expect(rosters.pa.filter(p => p.allStarSource === 'fan').length).toBe(14);
    expect(rosters.pa.some(p => p.allStarRole === 'DH')).toBe(true);
  });

  it('IP条件を満たす先発が不足してもフォールバック選出する', () => {
    const teams = [...buildLeagueTeams('セ', 0), ...buildLeagueTeams('パ', 6)];
    teams.forEach(t => t.players.forEach(p => { if (p.isPitcher && p.subtype === '先発') p.stats.IP = 5; }));
    const rosters = selectAllStars(teams);
    const ceFanStarters = rosters.ce.filter(p => p.allStarSource === 'fan' && p.allStarRole === '先発');
    expect(ceFanStarters.length).toBe(3);
  });
});

describe('runAllStarGame', () => {
  it('試合結果のスコアとMVPを返す', () => {
    const teams = [...buildLeagueTeams('セ', 0), ...buildLeagueTeams('パ', 6)];
    const rosters = selectAllStars(teams);
    const result = runAllStarGame(rosters);
    expect(result.score.ce).toBeGreaterThanOrEqual(0);
    expect(result.score.pa).toBeGreaterThanOrEqual(0);
    expect(result.mvp).toBeTruthy();
  });
});
