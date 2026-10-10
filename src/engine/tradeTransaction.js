import { MAX_SHIHAKA_TOTAL } from '../constants';
import { ownedPlayers } from './renewalRules';
import { marketPlacement } from './marketRoster';
import { isIkuseiPlayer } from './rosterAutomation';
import { pruneRosterReferences } from './offseasonReview';

// cash is signed 万円: positive means fromId pays toId. No state or effects
// are committed until both clubs pass. Offer copies are only ID selectors.
export function applyTradeTransaction(teams, { fromId, toId, outgoing, incoming, cash = 0 }) {
  const fail = error => ({ ok: false, error });
  if (fromId == null || toId == null || fromId === toId) return fail('取引球団が無効です');
  const from = teams.find(t => t.id === fromId), to = teams.find(t => t.id === toId);
  if (!from || !to || teams.filter(t => t.id === fromId || t.id === toId).length !== 2) return fail('取引球団が見つかりません');
  if (!Number.isFinite(cash)) return fail('金額が無効です');
  if (!Array.isArray(outgoing) || !Array.isArray(incoming) || outgoing.length + incoming.length === 0) return fail('取引選手を指定してください');
  const selections = [...outgoing, ...incoming];
  const ids = selections.map(p => p?.id);
  if (ids.some(id => id == null) || new Set(ids).size !== ids.length) return fail('選手IDが未記録または重複しています');
  const currentOwned = teams.flatMap(t => ownedPlayers(t).map(p => ({ teamId: t.id, player: p })));
  const resolve = (list, owner) => list.map(p => {
    const matches = currentOwned.filter(entry => entry.player.id === p.id);
    return matches.length === 1 && matches[0].teamId === owner ? matches[0].player : null;
  });
  const sent = resolve(outgoing, fromId), received = resolve(incoming, toId);
  if ([...sent, ...received].some(p => !p)) return fail('選手の所属が変わっています。条件を選び直してください');
  if (![from.budget, to.budget].every(Number.isFinite)) return fail('球団予算が未記録または無効です');
  const fromBudget = from.budget - cash, toBudget = to.budget + cash;
  if (![fromBudget, toBudget].every(v => Number.isFinite(v) && v >= 0)) return fail('支払う球団の予算が不足しています');
  const exchange = (team, removed, added, budget) => {
    const removedIds = new Set(removed.map(p => p.id));
    const next = { ...team, budget, players: (team.players || []).filter(p => !removedIds.has(p.id)),
      farm: (team.farm || []).filter(p => !removedIds.has(p.id)), ...pruneRosterReferences(team, removedIds) };
    const removedKeys = new Set([...removedIds].map(String));
    for (const key of ['fieldingNoDh', 'fieldingDh']) {
      if (team[key]) next[key] = Object.fromEntries(Object.entries(team[key]).filter(([id]) => !removedKeys.has(id)));
    }
    if (team.pitchingPattern) {
      const pattern = team.pitchingPattern;
      const retain = id => removedIds.has(id) ? null : id;
      next.pitchingPattern = { ...pattern, closerId: retain(pattern.closerId), setupId: retain(pattern.setupId),
        seventhId: retain(pattern.seventhId), middleOrder: (pattern.middleOrder || []).filter(id => !removedIds.has(id)) };
    }
    for (const player of added) {
      const farm = isIkuseiPlayer(player) || (player.injuryDaysLeft ?? 0) > 0 || (player.registrationCooldownDays ?? 0) > 0 || marketPlacement(next, player).farm;
      if (farm) next.farm.push(player);
      else next.players.push(player);
    }
    return next;
  };
  const nextFrom = exchange(from, sent, received, fromBudget), nextTo = exchange(to, received, sent, toBudget);
  for (const team of [nextFrom, nextTo]) {
    if (ownedPlayers(team).filter(p => !isIkuseiPlayer(p)).length > MAX_SHIHAKA_TOTAL) return fail(`支配下登録枠（${MAX_SHIHAKA_TOTAL}人）を超えます`);
  }
  return { ok: true, teams: teams.map(t => t.id === fromId ? nextFrom : t.id === toId ? nextTo : t), outgoing: sent, incoming: received };
}
