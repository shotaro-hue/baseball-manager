import { applyContractLedgerAction, contractEmploymentAt } from './contractLedger';
import { employmentContractId } from './seasonContract';
import { isIkuseiPlayer } from './rosterCapacity';
import { removeDepartingPlayers } from './tradeTransaction';

const fail = () => { throw new Error('ポスティングの申請・元契約・解除合意・確定証跡を確認してください。'); };
const id = value => (typeof value === 'string' && value.trim()) || (Number.isSafeInteger(value) && value >= 0);
const stable = value => JSON.stringify(value, (_, v) => v && !Array.isArray(v) && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
const day = (year, suffix) => `${String(year).padStart(4, '0')}-${suffix}`;
const records = state => state.postingDepartures === undefined ? [] : state.postingDepartures;
export const isPostingDepartureCommand = c => c?.type === 'end-contract';
export function normalizePostingDeparture(c) {
  if (!isPostingDepartureCommand(c) || c.reason !== 'posting' || ![c.id, c.teamId, c.playerId, c.contractId].every(id)
    || !['retain', 'waive'].includes(c.settlement)
    || Object.keys(c).some(k => !['id', 'type', 'reason', 'teamId', 'playerId', 'contractId', 'settlement', 'terminationAgreementId'].includes(k))
    || (c.settlement === 'waive' ? !id(c.terminationAgreementId) : Object.hasOwn(c, 'terminationAgreementId'))) fail();
  return { id: c.id, type: c.type, reason: c.reason, teamId: c.teamId, playerId: c.playerId, contractId: c.contractId,
    settlement: c.settlement, ...(c.settlement === 'waive' ? { terminationAgreementId: c.terminationAgreementId } : {}) };
}
function lookupFor(state) {
  const records = new Map(state.spending.ledger.records.map(r => [employmentContractId(r.contract), r])), dates = new Map();
  return { records, at(season) {
    if (!dates.has(season)) dates.set(season, new Map(contractEmploymentAt(state.spending.ledger, day(season, '11-30'))
      .map(e => [employmentContractId(e.contract), e])));
    return dates.get(season);
  } };
}
function recordFor(state, c, player, season, lookup) {
  const source = lookup.records.get(c.contractId), e = lookup.at(season).get(c.contractId);
  if (!source || !e || e.teamId !== c.teamId || e.contract.playerId !== c.playerId || e.registrationType !== 'controlled'
    || player?.id !== c.playerId || player.contractId !== c.contractId || player.postingRequested !== true
    || player.isRetired || player._retireNow || isIkuseiPlayer(player)) fail();
  const natural = e.contract.endSeason === season;
  if (natural && c.settlement !== 'retain') fail();
  const notifiedDate = day(season, '12-01'), effectiveDate = natural ? notifiedDate : day(season + 1, '02-01');
  const terminationAgreement = c.settlement === 'waive' ? { id: c.terminationAgreementId, agreedDate: notifiedDate } : null;
  const endAction = natural ? null : { id: JSON.stringify([c.id, 'posting-end']), type: 'end', contractId: c.contractId,
    teamId: c.teamId, effectiveDate, reason: 'posting', settlement: c.settlement,
    ...(terminationAgreement ? { terminationAgreement } : {}) };
  const sourceRecord = structuredClone({ ...source, changes: source.changes.filter(a => a.id !== endAction?.id) });
  return { id: c.id, season, teamId: c.teamId, player: structuredClone(player), sourceContractId: c.contractId,
    sourceRecord, sourceAnnualSalaryManYen: e.annualSalaryManYen, reason: 'posting', settlement: c.settlement,
    notifiedDate, effectiveDate, terminationAgreement, endAction };
}
function historyFor(d) {
  // This new club-history row describes posting; the earlier FA row remains
  // the owner of its declaration marker after a legitimate re-signing.
  const { faDeclarationId, ...player } = d.player;
  return { ...player, exitYear: d.season, exitReason: 'ポスティング', postingDepartureId: d.id };
}

export function inspectAnnualPostingDepartures(state) {
  const list = records(state), seen = new Set();
  if (!Array.isArray(list) || (list.length && state.version !== 2)) fail();
  const lookup = list.length ? lookupFor(state) : null;
  for (const d of list) {
    if (!d || !id(d.id) || seen.has(String(d.id)) || !Number.isInteger(d.season) || d.season < 1 || d.season > state.season
      || (d.season === state.season && (state.phase !== 'offseason' || d.notifiedDate > state.date))) fail();
    seen.add(String(d.id));
    const receipts = state.transactions.filter(r => r.id === d.id), receipt = receipts[0];
    let c; try { c = normalizePostingDeparture(JSON.parse(receipt?.signature)); } catch { fail(); }
    if (receipts.length !== 1 || c.id !== d.id || receipt.signature !== stable(c)
      || stable(d) !== stable(recordFor(state, c, d.player, d.season, lookup)) || stable(receipt.postingDeparture) !== stable(d)) fail();
    const history = state.teams.find(t => t.id === d.teamId)?.history?.filter(p => p.postingDepartureId === d.id) ?? [];
    if (history.length !== 1 || stable(history[0]) !== stable(historyFor(d))) fail();
    if (d.endAction && !lookup.records.get(d.sourceContractId).changes.some(a => stable(a) === stable(d.endAction))) fail();
  }
  for (const r of state.transactions) {
    let c; try { c = JSON.parse(r.signature); } catch { /* opaque v1 receipts */ }
    if ((isPostingDepartureCommand(c) || r.postingDeparture !== undefined) && !seen.has(String(r.id))) fail();
  }
  if (state.version === 2) {
    const ends = new Set(list.filter(d => d.endAction).map(d => stable(d.endAction)));
    for (const r of state.spending.ledger.records) for (const a of r.changes)
      if (a.type === 'end' && a.reason === 'posting' && !ends.has(stable(a))) fail();
  }
  for (const t of state.teams) for (const p of t.history ?? [])
    if (p.postingDepartureId !== undefined && !list.some(d => d.id === p.postingDepartureId && d.teamId === t.id)) fail();
  return list;
}

export function createPostingDeparture(state, c, signature) {
  if (state.version !== 2 || state.phase !== 'offseason' || state.date !== day(state.season, '12-01')) fail();
  const team = state.teams.find(t => t.id === c.teamId), p = team && [...team.players, ...team.farm].find(p => p.id === c.playerId);
  if (!p || state.spending.reservations.some(h => h.proposal.contract.playerId === c.playerId)
    || state.spending.ledger.records.some(r => r.contract.playerId === c.playerId && r.effectiveDate > state.date
      && contractEmploymentAt(state.spending.ledger, r.effectiveDate).some(e => employmentContractId(e.contract) === employmentContractId(r.contract)))) fail();
  const d = recordFor(state, c, p, state.season, lookupFor(state));
  const spending = d.endAction ? { ...state.spending, ledger: applyContractLedgerAction(state.spending.ledger, d.endAction) } : state.spending;
  return { ...state, spending, postingDepartures: [...records(state), d],
    teams: state.teams.map(t => t === team ? { ...removeDepartingPlayers(t, new Set([p.id])), history: [...(t.history ?? []), historyFor(d)] } : t),
    transactions: [...state.transactions, { id: c.id, signature, postingDeparture: structuredClone(d) }] };
}
