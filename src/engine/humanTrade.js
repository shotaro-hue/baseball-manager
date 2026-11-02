import { reduceEconomyCommand, toAnnualState } from './contractEconomy';
import { contractLiabilityRows, contractEmploymentAt } from './contractLedger';
import { quoteAnnualSpendingPlan } from './annualSpending';
import { ownedPlayers } from './renewalRules';

const fail = message => { throw new Error(message); };
const validId = id => (typeof id === 'string' && id.trim().length > 0) || (Number.isSafeInteger(id) && id >= 0);
const stable = value => JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);

export function tradeRequest(world, action) {
  return { saveId: world.saveId, epoch: world.contractEconomy?.epoch, baseRevision: world.contractEconomy?.revision,
    season: world.year, date: world.contractEconomy?.clock.date, teamId: world.myId, action: structuredClone(action) };
}

export function reduceTradeRequest(world, request) {
  try {
    const r = request, a = r?.action, e = world.contractEconomy;
    if (!r || Object.keys(r).some(k => !['saveId', 'epoch', 'baseRevision', 'season', 'date', 'teamId', 'action'].includes(k))
      || !Number.isSafeInteger(r.baseRevision) || r.baseRevision < 0 || !Number.isInteger(r.season) || r.season < 1
      || typeof r.date !== 'string' || !validId(r.teamId) || !a || !validId(a.toId)
      || Object.keys(a).some(k => !['toId', 'outgoingIds', 'incomingIds', 'cashManYen', 'mailId', 'decline'].includes(k))
      || (a.decline !== undefined && (a.decline !== true || a.mailId === undefined))
      || ![a.outgoingIds, a.incomingIds].every(ids => Array.isArray(ids) && ids.every(validId))
      || !Number.isSafeInteger(a.cashManYen) || (a.mailId !== undefined && !validId(a.mailId)))
      fail('トレードの操作・入力項目を確認してください。');
    const state = toAnnualState(world);
    if (r.saveId !== world.saveId || r.epoch !== e.epoch || r.teamId !== world.myId || r.baseRevision > e.revision)
      fail('トレードのセーブ・世代・球団が変更されています。');
    const id = stable(['human-trade', r]);
    const command = { id, type: 'trade', fromId: r.teamId, toId: a.toId,
      outgoingIds: a.outgoingIds, incomingIds: a.incomingIds, cashManYen: a.cashManYen,
      mode: a.cashManYen === 0 && a.outgoingIds.length && a.incomingIds.length ? 'cashless-trade' : 'spend' };
    const envelope = { saveId: r.saveId, epoch: r.epoch, baseRevision: r.baseRevision, transaction: command };
    // Replay before ownership/date checks: the same players have already moved.
    const receipt = state.transactions.find(t => t.id === id);
    const declineSignature = stable({ id, type: 'decline-trade', request: r });
    if (receipt) {
      if (!a.decline) return reduceEconomyCommand(world, envelope);
      if (receipt.signature !== declineSignature) fail('トレード辞退の確定履歴が一致しません。');
      return { ok: true, world, replayed: true };
    }
    if (r.baseRevision !== e.revision || r.season !== world.year || r.date !== state.date)
      fail('トレードの状態が変更されています。条件を確認し直してください。');
    if (a.mailId !== undefined) {
      const mails = world.mailbox.filter(m => m.id === a.mailId), m = mails[0], o = m?.offer;
      if (mails.length !== 1 || m.resolved || m.type !== 'trade' || !o || o.from?.id !== a.toId
        || stable(o.want?.map(p => p.id)) !== stable(a.outgoingIds) || stable(o.offer?.map(p => p.id)) !== stable(a.incomingIds)
        || -(o.cash ?? 0) / 10000 !== a.cashManYen) fail('受信したトレードの選手・金銭条件が変更されています。');
    }
    if (a.decline) {
      if (!Number.isSafeInteger(e.revision + 1)) fail('契約revisionが安全な範囲を超えています。');
      // A refusal has no financial transaction. Record only its immutable
      // notification decision under the same atomic world/save boundary.
      return { ok: true, replayed: false, world: { ...world,
        mailbox: world.mailbox.map(m => m.id === a.mailId ? { ...m, read: true, resolved: true } : m),
        contractEconomy: { ...e, revision: e.revision + 1, engine: { ...e.engine,
          transactions: [...e.engine.transactions, { id, signature: declineSignature }] } } } };
    }
    if (!['preseason', 'season'].includes(state.phase)) fail('トレードは開幕前またはシーズン中に行ってください。');
    const ids = new Set([...a.outgoingIds, ...a.incomingIds]);
    // A human reply has its own immutable cancellation evidence. Do not let
    // native trade cancellation silently orphan that decision or release funds.
    if (state.spending.reservations.some(h => h.kind === 'renewal' && ids.has(h.proposal.contract.playerId)))
      fail('移籍対象選手の未回答の更改提示を取り消してから、条件を確認してください。');
    const result = reduceEconomyCommand(world, envelope);
    if (!result.ok) return result;
    const mine = world.teams.find(t => t.id === r.teamId), other = world.teams.find(t => t.id === a.toId);
    const outgoing = ownedPlayers(mine).filter(p => a.outgoingIds.includes(p.id)), incoming = ownedPlayers(other).filter(p => a.incomingIds.includes(p.id));
    const names = list => list.map(p => p.name).join('、') || 'なし';
    const detail = `${mine.name}が${names(incoming)}を獲得 / ${names(outgoing)}を放出`;
    const history = player => {
      const joinYear = Number(player.careerLogSummary?.firstYear || 0) || Number(player.recentCareerLog?.[0]?.year || 0);
      return { ...player, exitYear: world.year, exitReason: 'トレード', tenure: joinYear > 0 ? world.year - joinYear + 1 : 1 };
    };
    const timestamp = Date.parse(`${r.date}T00:00:00Z`);
    return { ...result, world: { ...result.world,
      teams: result.world.teams.map(t => t.id === mine.id || t.id === other.id
        ? { ...t, history: [...(t.history ?? []), ...(t.id === mine.id ? outgoing : incoming).map(history)] } : t),
      mailbox: result.world.mailbox.map(m => m.id === a.mailId ? { ...m, read: true, resolved: true } : m),
      news: [{ id, timestamp, type: 'trade', headline: `【移籍】${names(incoming)}が${mine.name}へ`, source: 'Baseball Times',
        dateLabel: r.date, body: detail }, ...world.news].slice(0, 50),
      seasonHistory: { ...world.seasonHistory, transfers: [...(world.seasonHistory?.transfers ?? []), { id, timestamp,
        year: world.year, day: world.gameDay, type: 'trade', headline: `【トレード成立】${mine.name} ↔ ${other.name}`,
        fromTeam: other.name, toTeam: mine.name, playersIn: incoming.map(p => p.name), playersOut: outgoing.map(p => p.name), cash: a.cashManYen, detail }].slice(-400) } } };
  } catch (error) { return { ok: false, world, replayed: false, error: error.message }; }
}

export function previewHumanTrade(world, request) {
  const result = reduceTradeRequest(world, request);
  if (!result.ok) return { ok: false, error: result.error };
  const a = request.action, state = toAnnualState(result.world), ids = new Set([...a.outgoingIds, ...a.incomingIds]);
  const players = world.teams.flatMap(ownedPlayers), contracts = state.spending.ledger.records
    .filter(r => ids.has(r.contract.playerId) && r.contract.endSeason >= world.year).flatMap(r => {
      const date = r.effectiveDate > state.date ? r.effectiveDate : state.date;
      const current = contractEmploymentAt(state.spending.ledger, date).find(e => e.contract.contractId === r.contract.contractId);
      return current ? [{ ...r.contract, annualSalaryManYen: current.annualSalaryManYen, effectiveDate: r.effectiveDate }] : [];
    });
  const end = Math.max(world.year, ...contracts.map(c => c.endSeason));
  return { ok: true, teams: result.world.teams,
    outgoing: a.outgoingIds.map(id => players.find(p => p.id === id)), incoming: a.incomingIds.map(id => players.find(p => p.id === id)), contracts,
    costs: contractLiabilityRows(state.spending.ledger).filter(r => ids.has(r.playerId) && r.season >= world.year),
    rows: quoteAnnualSpendingPlan(state.spending).filter(r => [request.teamId, a.toId].includes(r.teamId) && r.season >= world.year && r.season <= end) };
}
