import { MAX_ROSTER, FOREIGN_DEADLINE_DAY, MIN_ACTIVE_CATCHERS, MIN_TOTAL_BY_POS } from '../../constants';
import { fmtIP } from '../../utils';
import { prepareOffseasonFreeAgent } from '../../engine/offseasonMarket';

export function marketMetrics(player) {
  const s = (player.isFA && player.marketLastStats) || player.stats || {};
  const measured = keys => keys.every(key => Number.isFinite(s[key]));
  const value = n => Number.isFinite(n) ? n : '未記録';
  if (player.isPitcher) return [['投球回', Number.isFinite(s.IP) ? fmtIP(s.IP) : '未記録'], ['防御率', measured(['IP', 'ER']) && s.IP > 0 ? (s.ER / s.IP * 9).toFixed(2) : '—'], ['勝利', value(s.W)], ['奪三振', value(s.Kp)], ['セーブ', value(s.SV)], ['ホールド', value(s.HLD)]];
  const denominator = s.AB + s.BB + s.HBP + s.SF;
  const ops = measured(['AB', 'H', 'BB', 'HBP', 'SF', 'D', 'T', 'HR']) && s.AB > 0 && denominator > 0 ? ((s.H + s.BB + s.HBP) / denominator + (s.H + s.D + 2 * s.T + 3 * s.HR) / s.AB).toFixed(3) : '—';
  return [['打席', value(s.PA)], ['打率', measured(['AB', 'H']) && s.AB > 0 ? (s.H / s.AB).toFixed(3) : '—'], ['本塁打', value(s.HR)], ['打点', value(s.RBI)], ['OPS', ops]];
}

// Structural hints from saved roster counts, without inventing ability or performance.
export function marketNeeds(team) {
  const players = team?.players || [];
  const all = [...players, ...(team?.farm || [])];
  const hints = [];
  for (const [label, count, target] of [
    ['先発', players.filter(p => p.isPitcher && (p.subtype || p.pos) === '先発').length, 4],
    ['中継ぎ', players.filter(p => p.isPitcher && (p.subtype || p.pos) === '中継ぎ').length, 3],
    ['抑え', players.filter(p => p.isPitcher && (p.subtype || p.pos) === '抑え').length, 1],
    ['捕手（登録）', players.filter(p => !p.isPitcher && p.pos === '捕手').length, MIN_ACTIVE_CATCHERS],
    ['捕手（登録＋ファーム）', all.filter(p => !p.isPitcher && p.pos === '捕手').length, MIN_TOTAL_BY_POS['捕手']],
  ]) if (count < target) hints.push(`${label} ${count}/${target}人`);
  return hints;
}

export function marketPlacement(team, player) {
  if (player.育成) return { farm: true, reason: '育成契約のためファーム所属' };
  const active = team?.players || [];
  if (active.length >= MAX_ROSTER) return { farm: true, reason: '登録枠が満員' };
  if (player.isForeign) {
    const foreigners = active.filter(p => p.isForeign);
    if (foreigners.length >= 4) return { farm: true, reason: '外国人枠が満員' };
    if (foreigners.length === 3 && foreigners.every(p => Boolean(p.isPitcher) === Boolean(player.isPitcher))) return { farm: true, reason: '外国人4人が全員投手／全員野手になるため' };
  }
  return { farm: false, reason: '登録枠に空きあり' };
}

export function validateMarketContract({ team, pool, player, salary, years, gameDay }) {
  if (!pool.some(p => p.id === player.id)) return 'この選手は現在の市場にいません';
  if (player.isForeign && (!Number.isFinite(gameDay) || gameDay > FOREIGN_DEADLINE_DAY)) return '外国人補強の期限を過ぎているか、日程が未記録です';
  if (!Number.isFinite(salary) || salary <= 0 || !Number.isInteger(years) || years < 1 || years > 3) return '契約金額または年数を確認してください';
  if (player.育成 && player.departureReason !== 'ikusei_expiry' && years > Math.max(1, 3 - (player.ikuseiYears || 0))) return '育成3年満了までに収まる契約年数を選んでください';
  if (!Number.isFinite(team?.budget)) return '予算が未記録のため契約できません';
  if (team.budget < salary * years) return '予算が不足しています';
  return null;
}

export function addMarketSigning(team, player, salary, years, year, marketMode = 'season') {
  const placement = marketPlacement(team, player);
  const prepared = marketMode === 'offseason' ? prepareOffseasonFreeAgent(player, year, team.id) : player;
  const signed = { ...prepared, isFA: false, salary, contractYears: years, contractYearsLeft: years, contractSignedYear: year,
    ...(player.育成 && player.departureReason === 'ikusei_expiry' ? { ikuseiYears: 0 } : {}) };
  return { ...team, budget: team.budget - salary * years,
    players: placement.farm ? team.players : [...team.players, signed],
    farm: placement.farm ? [...(team.farm || []), signed] : team.farm || [],
    history: [...(team.history || []), { ...signed, exitYear: year, exitReason: player.isForeign ? 'foreign_fa' : player.isWaiverReleased ? 'waiver_fa' : 'fa', tenure: 0 }],
  };
}
