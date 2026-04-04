import { saberBatter, saberPitcher } from './sabermetrics';
import { quickSimGame } from './simulation';
import { rng } from '../utils';
import { TEAM_DEFS } from '../constants';

const FAN_POSITIONS = ['捕手', '一塁手', '二塁手', '三塁手', '遊撃手', '左翼手', '中堅手', '右翼手'];

const byWobaDesc = (a, b) => (b._woba - a._woba) || ((b.stats?.PA || 0) - (a.stats?.PA || 0));
const byFipAsc = (a, b) => (a._fip - b._fip) || ((b.stats?.IP || 0) - (a.stats?.IP || 0));
const byHldDesc = (a, b) => ((b.stats?.HLD || 0) - (a.stats?.HLD || 0)) || ((b.stats?.IP || 0) - (a.stats?.IP || 0));
const bySvDesc = (a, b) => ((b.stats?.SV || 0) - (a.stats?.SV || 0)) || ((b.stats?.IP || 0) - (a.stats?.IP || 0));

function enrichPlayer(player, team, league) {
  const woba = saberBatter(player.stats || {}).wOBA;
  const fip = saberPitcher(player.stats || {}).FIP;
  return {
    ...player,
    _woba: Number.isFinite(woba) ? woba : 0,
    _fip: Number.isFinite(fip) ? fip : 99,
    allStarLeague: league,
    allStarTeamId: team.id,
    allStarTeamName: team.short || team.name,
  };
}

function pickTop(candidates, count, selectedIds, decorate) {
  const picked = [];
  for (const p of candidates) {
    if (picked.length >= count) break;
    if (selectedIds.has(p.id)) continue;
    const selected = decorate ? decorate(p) : p;
    picked.push(selected);
    selectedIds.add(p.id);
  }
  return picked;
}

function selectLeagueAllStars(leaguePlayers, league) {
  const selectedIds = new Set();
  const fanVote = [];

  const batters = leaguePlayers.filter(p => !p.isPitcher);
  const pitchers = leaguePlayers.filter(p => p.isPitcher);

  for (const pos of FAN_POSITIONS) {
    const top = batters
      .filter(p => p.pos === pos && !selectedIds.has(p.id))
      .sort(byWobaDesc)[0];
    if (top) {
      fanVote.push({ ...top, allStarSource: 'fan', allStarRole: pos });
      selectedIds.add(top.id);
    }
  }

  if (league === 'パ') {
    const dh = batters
      .filter(p => !selectedIds.has(p.id))
      .sort(byWobaDesc)[0];
    if (dh) {
      fanVote.push({ ...dh, allStarSource: 'fan', allStarRole: 'DH', pos: 'DH' });
      selectedIds.add(dh.id);
    }
  }

  const starterBase = pitchers.filter(p => (p.subtype === '先発' || p.pos === '先発'));
  const starterPool = starterBase.filter(p => (p.stats?.IP || 0) >= 30);
  const starterCandidates = (starterPool.length >= 3 ? starterPool : starterBase).sort(byFipAsc);
  fanVote.push(...pickTop(starterCandidates, 3, selectedIds, (p) => ({ ...p, allStarSource: 'fan', allStarRole: '先発' })));

  const relieverBase = pitchers.filter(p => (p.subtype === '中継ぎ' || p.pos === '中継ぎ' || (p.stats?.HLD || 0) > 0));
  const relieverPool = relieverBase.filter(p => (p.stats?.IP || 0) >= 10);
  const relieverCandidates = (relieverPool.length ? relieverPool : relieverBase).sort(byHldDesc);
  fanVote.push(...pickTop(relieverCandidates, 1, selectedIds, (p) => ({ ...p, allStarSource: 'fan', allStarRole: '中継ぎ' })));

  const closerBase = pitchers.filter(p => (p.subtype === '抑え' || p.pos === '抑え' || (p.stats?.SV || 0) > 0));
  const closerPool = closerBase.filter(p => (p.stats?.IP || 0) >= 5);
  const closerCandidates = (closerPool.length ? closerPool : closerBase).sort(bySvDesc);
  fanVote.push(...pickTop(closerCandidates, 1, selectedIds, (p) => ({ ...p, allStarSource: 'fan', allStarRole: '抑え' })));

  const managerPitcherCount = 9;
  const managerBatterCount = league === 'セ' ? 7 : 6;

  const managerPitchers = pickTop(
    pitchers.filter(p => !selectedIds.has(p.id)).sort(byFipAsc),
    managerPitcherCount,
    selectedIds,
    (p) => ({ ...p, allStarSource: 'manager', allStarRole: p.subtype || p.pos || '投手' }),
  );

  const managerBatters = pickTop(
    batters.filter(p => !selectedIds.has(p.id)).sort(byWobaDesc),
    managerBatterCount,
    selectedIds,
    (p) => ({ ...p, allStarSource: 'manager', allStarRole: p.pos || '野手' }),
  );

  let roster = [...fanVote, ...managerPitchers, ...managerBatters];

  if (roster.length < 29) {
    const fill = pickTop(
      leaguePlayers.filter(p => !selectedIds.has(p.id)).sort((a, b) => ((b.stats?.PA || b.stats?.IP || 0) - (a.stats?.PA || a.stats?.IP || 0))),
      29 - roster.length,
      selectedIds,
      (p) => ({ ...p, allStarSource: 'manager', allStarRole: p.isPitcher ? (p.subtype || p.pos || '投手') : (p.pos || '野手') }),
    );
    roster = [...roster, ...fill];
  }

  return roster.slice(0, 29);
}

/**
 * 全チームの全選手からリーグ別にオールスターロスターを選出する。
 * @param {Object[]} teams
 * @returns {{ ce: Object[], pa: Object[] }}
 */
export function selectAllStars(teams) {
  const playersByLeague = { 'セ': [], 'パ': [] };
  for (const team of teams) {
    for (const player of (team.players || [])) {
      const lg = team.league;
      if (!playersByLeague[lg]) continue;
      playersByLeague[lg].push(enrichPlayer(player, team, lg));
    }
  }
  return {
    ce: selectLeagueAllStars(playersByLeague['セ'], 'セ'),
    pa: selectLeagueAllStars(playersByLeague['パ'], 'パ'),
  };
}

function buildAllStarTeam(id, name, league, roster) {
  const batters = roster.filter(p => !p.isPitcher);
  const pitchers = roster.filter(p => p.isPitcher);
  const lineup = batters.slice(0, 9).map(p => p.id);
  const rotation = pitchers
    .filter(p => p.allStarRole === '先発' || p.subtype === '先発' || p.pos === '先発')
    .sort(byFipAsc)
    .map(p => p.id);

  return {
    id,
    name,
    short: league,
    league,
    players: roster,
    lineup: lineup.length ? lineup : roster.slice(0, 9).map(p => p.id),
    rotation: rotation.length ? rotation : pitchers.slice(0, 1).map(p => p.id),
    rotIdx: 0,
  };
}

/**
 * selectAllStars の結果を受け取り簡易試合をシミュする。
 * @param {{ ce: Object[], pa: Object[] }} rosters
 * @returns {{ score: {ce:number, pa:number}, mvp: Object }}
 */
function simulateAllStarGame(rosters, ceHome = true) {
  const ceTeam = buildAllStarTeam('allstar_ce', 'セ・リーグ選抜', 'セ', rosters.ce || []);
  const paTeam = buildAllStarTeam('allstar_pa', 'パ・リーグ選抜', 'パ', rosters.pa || []);
  const result = ceHome ? quickSimGame(ceTeam, paTeam) : quickSimGame(paTeam, ceTeam);
  const pool = [...(rosters.ce || []), ...(rosters.pa || [])].filter(p => !p.isPitcher);
  const mvp = pool.length ? pool[rng(0, pool.length - 1)] : (rosters.ce?.[0] || rosters.pa?.[0] || null);

  const ceScore = ceHome ? result.score.my : result.score.opp;
  const paScore = ceHome ? result.score.opp : result.score.my;

  return {
    score: { ce: ceScore, pa: paScore },
    mvp,
  };
}

/**
 * 12球団本拠地の持ち回りで当年のオールスター開催地（2試合分）を返す
 */
export function getAllStarVenues(year) {
  const teams = TEAM_DEFS || [];
  const n = teams.length || 12;
  const base = ((year - 2025) * 2) % n;
  const start = (base + n) % n;
  const v1 = teams[start];
  const v2 = teams[(start + 1) % n];
  return [v1, v2].map(v => ({
    teamId: v?.id,
    teamName: v?.name || '未設定球場',
    stadiumLabel: v?.short || v?.name || '未設定球場',
  }));
}

/**
 * 後方互換: 単発実行API
 */
export function runAllStarGame(rosters) {
  return simulateAllStarGame(rosters, true);
}

/**
 * オールスター2試合を実行して返す
 */
export function runAllStarGames(rosters, year) {
  const venues = getAllStarVenues(year);
  const game1 = { ...simulateAllStarGame(rosters, true), gameNo: 1, venue: venues[0] };
  const game2 = { ...simulateAllStarGame(rosters, false), gameNo: 2, venue: venues[1] };
  return [game1, game2];
}
