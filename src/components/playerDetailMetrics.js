import { fmtAvg, fmtIP, fmtSal } from '../utils';
import { saberBatter, saberPitcher } from '../engine/sabermetrics';
import { contractSalaryStatus } from '../engine/contractPayroll';

export const detailMissing = reason => `— ${reason}`;
export function detailNumber(value, { allowNegative = false } = {}) {
  if (!Number.isFinite(value)) return detailMissing('未記録');
  return value < 0 && !allowNegative ? detailMissing('不正値') : value;
}
export function detailSalary(value) {
  const status = contractSalaryStatus(value);
  return status === 'recorded' ? fmtSal(value) : detailMissing(status === 'missing' ? '未記録' : '不正値');
}
const requiredFor = {
  AVG: ['AB', 'H'], OPS: ['AB', 'H', 'D', 'T', 'HR', 'BB', 'HBP', 'SF'],
  OBP: ['AB', 'H', 'BB', 'HBP', 'SF'], ERA: ['IP', 'ER'], WHIP: ['IP', 'Hp', 'BBp'],
  hardHitPct: ['evN', 'hardHit'],
};
function recordIssue(s, keys) {
  if (keys.some(k => !Number.isFinite(s?.[k]))) return detailMissing('未記録');
  if (keys.some(k => s[k] < 0)) return detailMissing('不正値');
  return null;
}
// Display-only guards. Calculations, precision, saved records and game rules stay unchanged.
export function detailRate(stats, metric) {
  const s = stats || {}, issue = recordIssue(s, requiredFor[metric]);
  if (issue) return issue;
  const denominator = metric === 'ERA' || metric === 'WHIP' ? s.IP
    : metric === 'hardHitPct' ? s.evN
      : metric === 'OBP' ? s.AB + s.BB + s.HBP + s.SF : s.AB;
  if (!(denominator > 0)) return detailMissing('算出不可');
  if (metric === 'AVG') return (Number(fmtAvg(s.H, s.AB).slice(1)) / 1000).toFixed(3);
  const value = (metric === 'ERA' || metric === 'WHIP' ? saberPitcher(s) : saberBatter(s))[metric];
  if (!Number.isFinite(value)) return detailMissing('未記録');
  return metric === 'hardHitPct' ? `${(value * 100).toFixed(1)}%` : value.toFixed(metric === 'ERA' || metric === 'WHIP' ? 2 : 3);
}
export function detailInnings(value) {
  return Number.isFinite(value) && value >= 0 ? fmtIP(value) : detailNumber(value);
}
export function detailProfileRate(profile, numerator, denominator, percentage = false) {
  const issue = recordIssue(profile, [numerator, denominator]);
  if (issue) return issue;
  if (!(profile[denominator] > 0)) return detailMissing('算出不可');
  return `${(profile[numerator] / profile[denominator] * (percentage ? 100 : 1)).toFixed(1)}${percentage ? '%' : ' km/h'}`;
}
export function detailWar(player) {
  const s = player.stats || {}, keys = player.isPitcher ? ['IP', 'HRp', 'BBp', 'HBPp', 'Kp'] : ['PA', 'AB', 'H', 'D', 'T', 'HR', 'BB', 'HBP', 'SF'];
  const issue = recordIssue(s, keys);
  if (issue) return issue;
  if (!((player.isPitcher ? s.IP : s.PA) > 0)) return detailMissing('算出不可');
  return detailNumber((player.isPitcher ? saberPitcher(s) : saberBatter(s)).WAR, { allowNegative: true });
}
export const firstTeamScope = year => Number.isInteger(year) && year > 0 ? `一軍・${year}年` : '一軍・今季（年度未指定）';
export function playerMembership(player, teams) {
  for (const team of teams || []) {
    if (team.players?.some(p => p.id === player.id)) return '一軍所属';
    if (team.farm?.some(p => p.id === player.id)) return '二軍所属';
  }
  return player.isFA ? 'FA中' : '所属区分未確認';
}

// Selection stays transient; resolve current records without updating the saved game.
export function currentComparisonPlayers(players, teams, faPool) {
  if (!Array.isArray(teams) && !Array.isArray(faPool)) return players;
  return players.map(selected => {
    for (const team of teams || []) {
      const player = [...(team.players || []), ...(team.farm || [])].find(p => p.id === selected.id);
      if (player) return { ...player, _teamName: team.name };
    }
    const freeAgent = faPool?.find(p => p.id === selected.id);
    return freeAgent ? { ...freeAgent, _teamName: selected._teamName } : { ...selected, _comparisonSnapshot: true };
  });
}
