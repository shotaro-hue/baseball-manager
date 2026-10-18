import { FIELDING_POSITIONS } from '../constants';
import { proficiencyAt } from './rosterAutomation';
import { assertFarmId, compareFarmIds } from './farmSchedule';
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
export const farmAbility = (value, fallback = 50) => Number.isFinite(Number(value)) && value != null
  ? clamp(Number(value), 0, 100) : fallback;
const condition = p => farmAbility(p.condition, 100);
const fit = (p, pos) => farmAbility(proficiencyAt(p, pos), 0);
const batScore = p => (farmAbility(p.batting?.contact)*1.2 + farmAbility(p.batting?.eye)
  + farmAbility(p.batting?.power) + farmAbility(p.batting?.stamina)*0.2) * condition(p)/100;

export function validateFarmTeams(teams) {
  if (!Array.isArray(teams)) throw new Error('invalid farm teams');
  const ids = new Set(), teamIds = new Set();
  for (const team of teams) {
    assertFarmId(team?.id);
    if (teamIds.has(String(team.id))) throw new Error('duplicate farm team ID');
    teamIds.add(String(team.id));
    if (!Array.isArray(team.farm) || !Array.isArray(team.players)) throw new Error('missing farm roster snapshot');
    for (const player of [...team.players, ...team.farm]) {
      assertFarmId(player?.id);
      if (ids.has(String(player.id))) throw new Error('duplicate farm player ID');
      ids.add(String(player.id));
      if (typeof player.isPitcher !== 'boolean') throw new Error('missing player role');
      if (player.injuryDaysLeft != null && (!Number.isFinite(Number(player.injuryDaysLeft)) || Number(player.injuryDaysLeft) < 0)) {
        throw new Error('invalid injury days');
      }
    }
  }
}

// Rectangular Hungarian assignment: real field/DH positions and real batters.
// Stable column order resolves ties; catcher-ineligible edges are forbidden.
function assignPositions(batters, positions, score) {
  const n = positions.length, m = batters.length;
  const u = Array(n+1).fill(0), v = Array(m+1).fill(0), p = Array(m+1).fill(0), way = Array(m+1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const min = Array(m+1).fill(Infinity), used = Array(m+1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity, j1 = 0;
      for (let j = 1; j <= m; j++) {
        if (used[j]) continue;
        const cur = -score(batters[j-1], positions[i0-1]) - u[i0] - v[j];
        if (cur < min[j]) { min[j] = cur; way[j] = j0; }
        if (min[j] < delta) { delta = min[j]; j1 = j; }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else min[j] -= delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0 !== 0);
  }
  return p.slice(1).flatMap((row, col) => row ? [{ player: batters[col], position: positions[row-1], proficiency: fit(batters[col], positions[row-1]) }] : []);
}

export function selectFarmTeam(team, { round, usage = {} } = {}) {
  validateFarmTeams([team]);
  if (!Number.isInteger(round) || round < 1 || round > 143) throw new Error('invalid farm round');
  const healthy = team.farm.filter(p => Number(p.injuryDaysLeft || 0) === 0);
  const batters = healthy.filter(p => !p.isPitcher).sort((a,b) => compareFarmIds(a.id,b.id));
  const pitchers = healthy.filter(p => p.isPitcher);
  const reasons = [];
  if (batters.length < 9) reasons.push({ code: 'insufficient-batters', available: batters.length, required: 9 });
  if (!pitchers.length) reasons.push({ code: 'insufficient-pitchers', available: 0, required: 1 });
  if (!batters.some(p => fit(p, '捕手') > 0)) reasons.push({ code: 'insufficient-catcher', available: 0, required: 1 });
  if (reasons.length) return { teamId: team.id, status: 'unplayed', reasons, warnings: [] };
  const playerUsage = p => Object.hasOwn(usage, String(p.id)) ? usage[String(p.id)] : {};
  const battingScore = (p,pos) => {
    if (pos === '捕手' && fit(p,pos) <= 0) return -1e6;
    return batScore(p) + (pos === 'DH' ? 0 : fit(p,pos)*2)
      - (playerUsage(p)?.lastBattedRound === round-1 ? 5 : 0);
  };
  let lineup = assignPositions(batters, [...FIELDING_POSITIONS, 'DH'], battingScore);
  const games = p => playerUsage(p).battingGames || 0;
  const selectedIds = new Set(lineup.map(x => x.player.id));
  const developmentBatter = batters.filter(p => !selectedIds.has(p.id)).sort((a,b) => games(a) - games(b)
    || (playerUsage(a).battingPA || 0) - (playerUsage(b).battingPA || 0)
    || batScore(b) - batScore(a) || compareFarmIds(a.id,b.id))[0];
  // One actual DH start, only when every normally selected batter has played
  // more games. Keep the other eight positions optimized for defensive fit.
  if (developmentBatter && games(developmentBatter) < Math.min(...lineup.map(x => games(x.player)))) {
    lineup = [...assignPositions(batters.filter(p => p.id !== developmentBatter.id), FIELDING_POSITIONS, battingScore),
      { player: developmentBatter, position: 'DH', proficiency: 0 }];
  }
  lineup.sort((a,b) => batScore(b.player) - batScore(a.player) || compareFarmIds(a.player.id,b.player.id));
  const warnings = lineup.filter(x => x.position !== 'DH' && x.proficiency === 0)
    .map(x => ({ code: 'alternative-defense', playerId: x.player.id, position: x.position }));
  const rest = p => {
    const history = (p.recentPitchingDays || []).filter(d => Number.isInteger(d) && d < round);
    const last = Math.max(0, playerUsage(p)?.lastPitchedRound || 0, ...history);
    return last === 0 ? Infinity : round - last;
  };
  const normal = p => condition(p) >= 40 && rest(p) >= 2;
  const pitchScore = p => farmAbility(p.pitching?.stamina)*2 + farmAbility(p.pitching?.control)
    + farmAbility(p.pitching?.velocity) + farmAbility(p.pitching?.breaking) + condition(p);
  const ordered = [...pitchers].sort((a,b) => Number(normal(b)) - Number(normal(a))
    || Number(rest(b) >= 5) - Number(rest(a) >= 5) || pitchScore(b) - pitchScore(a)
    || rest(b) - rest(a) || compareFarmIds(a.id,b.id));
  // Share starts among fully rested normal candidates; never trade the
  // existing condition/rest safeguards for a development appearance.
  const developmentPitcher = ordered.filter(p => normal(p) && rest(p) >= 5).sort((a,b) =>
    (playerUsage(a).pitchingBF || 0) - (playerUsage(b).pitchingBF || 0)
    || pitchScore(b) - pitchScore(a) || compareFarmIds(a.id,b.id))[0];
  if (developmentPitcher && (playerUsage(developmentPitcher).pitchingBF || 0) < (playerUsage(ordered[0]).pitchingBF || 0)) {
    ordered.splice(ordered.indexOf(developmentPitcher), 1);
    ordered.unshift(developmentPitcher);
  }
  // Relievers favor a rested next candidate too; used pitchers are never reused in a game.
  const plan = ordered.map((player, index) => ({
    player, rescue: !normal(player) || (index === 0 && rest(player) < 5) || pitchers.length === 1,
    maxOuts: index === 0 ? 12 + Math.floor(farmAbility(player.pitching?.stamina)*0.12) : 6,
    maxBF: index === 0 ? 24 + Math.floor(farmAbility(player.pitching?.stamina)*0.2) : 12,
  }));
  if (plan[0].rescue) warnings.push({ code: 'pitcher-rescue', playerId: plan[0].player.id });
  return { teamId: team.id, status: 'ready', reasons: [], lineup, pitchers: plan, warnings,
    defensePenalty: lineup.filter(x => x.position !== 'DH').reduce((sum,x) => sum + (100-x.proficiency),0)/800 };
}
