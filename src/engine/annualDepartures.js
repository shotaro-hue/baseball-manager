import { applyContractLedgerAction, contractEmploymentAt } from './contractLedger';
import { employmentContractId } from './seasonContract';
import { parseContractDate } from './contractCalendar';
import { removeDepartingPlayers } from './tradeTransaction';
import { cancelContractReservation } from './annualSpending';

const fail = () => { throw new Error('冬の退団・元契約・確定履歴を確認してください。'); };
const validId = id => (typeof id === 'string' && id.trim()) || (Number.isSafeInteger(id) && id >= 0);
const stable = value => JSON.stringify(value, (_, v) => v && !Array.isArray(v) && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
const day = (year, suffix) => `${String(year).padStart(4, '0')}-${suffix}`;
export const isWinterDepartureCommand = c => c?.type === 'enter-market';
export function normalizeWinterDeparture(c) {
  if (!c || c.type !== 'enter-market' || ![c.id, c.teamId, c.playerId, c.contractId].every(validId)
    || !['expiry', 'release'].includes(c.reason)
    || Object.keys(c).some(k => !['id', 'type', 'teamId', 'playerId', 'contractId', 'reason'].includes(k))) fail();
  return { id: c.id, type: c.type, teamId: c.teamId, playerId: c.playerId, contractId: c.contractId, reason: c.reason };
}

function recordFor(state, c, player, season, notifiedDate) {
  if (parseContractDate(notifiedDate).year !== season || notifiedDate < day(season, '11-30')) fail();
  const e = contractEmploymentAt(state.spending.ledger, day(season, '11-30'))
    .find(e => e.teamId === c.teamId && e.contract.playerId === c.playerId && employmentContractId(e.contract) === c.contractId);
  if (!e || player?.id !== c.playerId || (c.reason === 'expiry' && e.contract.endSeason !== season)) fail();
  const natural = e.contract.endSeason === season;
  const effectiveDate = natural ? day(season, '12-01') : day(season + 1, '02-01');
  const endAction = natural ? null : { id: JSON.stringify([c.id, 'winter-end']), type: 'end', contractId: c.contractId,
    teamId: c.teamId, effectiveDate, reason: 'release', settlement: 'retain' };
  const source = state.spending.ledger.records.find(r => employmentContractId(r.contract) === c.contractId);
  const sourceRecord = structuredClone({ ...source, changes: source.changes.filter(a => a.id !== endAction?.id) });
  return { id: c.id, season, sourceRecord, teamId: c.teamId, player: structuredClone(player), sourceContractId: c.contractId,
    sourceAnnualSalaryManYen: e.annualSalaryManYen, reason: c.reason, notifiedDate, effectiveDate, endAction,
    marketEntry: { id: JSON.stringify([c.id, 'released-market']), kind: 'released', enteredDate: notifiedDate, originTeamId: c.teamId } };
}

// Records and receipts are checked in both directions. Only a proven departure
// can exempt a November employment from the winter roster reconciliation.
export function inspectAnnualDepartures(state) {
  const departures = state.offseasonDepartures ?? [];
  if (!Array.isArray(departures)) fail();
  const seen = new Set(), contracts = new Set();
  for (const d of departures) {
    if (!d || !validId(d.id) || seen.has(String(d.id)) || contracts.has(String(d.sourceContractId))
      || !Number.isInteger(d.season) || d.season > state.season || d.season < 1
      || (d.season === state.season && (state.phase !== 'offseason' || d.notifiedDate > state.date))) fail();
    seen.add(String(d.id)); contracts.add(String(d.sourceContractId));
    const receipts = state.transactions.filter(r => r.id === d.id);
    if (receipts.length !== 1) fail();
    const receipt = receipts[0];
    let c; try { c = normalizeWinterDeparture(JSON.parse(receipt.signature)); } catch { fail(); }
    if (c.id !== d.id || stable(c) !== receipt.signature || stable(receipt.departure) !== stable(d)
      || stable(recordFor(state, c, d.player, d.season, d.notifiedDate)) !== stable(d)) fail();
    const team = state.teams.find(t => t.id === d.teamId);
    if (!team?.history?.some(p => stable(p) === stable(departureHistory(d)))) fail();
    const acquired = state.spending.resolvedReservations.some(r => r.kind === 'offer' && r.resolution === 'accepted'
      && r.proposal.contract.playerId === d.player.id && stable(r.proposal.marketEntry) === stable(d.marketEntry));
    if (!acquired && !state.faPool.some(p => p.id === d.player.id && stable(p.marketEntry) === stable(d.marketEntry))) fail();
    if (d.endAction) {
      const record = state.spending.ledger.records.find(r => employmentContractId(r.contract) === d.sourceContractId);
      if (!record?.changes.some(a => stable(a) === stable(d.endAction))) fail();
    }
  }
  for (const receipt of state.transactions) {
    let c; try { c = JSON.parse(receipt.signature); } catch { /* v1 opaque receipts */ }
    if ((isWinterDepartureCommand(c) || receipt.departure !== undefined)
      && !departures.some(d => d.id === receipt.id)) fail();
  }
  return departures;
}

const departureHistory = d => ({ ...d.player, exitYear: d.season, exitReason: d.reason === 'expiry' ? '契約満了' : '戦力外' });

export function createWinterDeparture(state, command, signature) {
  const c = normalizeWinterDeparture(command);
  if (state.version !== 2 || state.phase !== 'offseason') fail();
  const team = state.teams.find(t => t.id === c.teamId);
  const player = team && [...team.players, ...team.farm].find(p => p.id === c.playerId);
  if (!player || player.isRetired || player._retireNow || state.offseasonDepartures.some(d => d.sourceContractId === c.contractId)) fail();
  // An accepted future promise must be settled separately, never silently erased.
  if (state.spending.ledger.records.some(r => r.contract.playerId === c.playerId
    && r.effectiveDate > state.date && contractEmploymentAt(state.spending.ledger, r.effectiveDate)
      .some(e => employmentContractId(e.contract) === employmentContractId(r.contract)))) fail();
  const departure = recordFor(state, c, player, state.season, state.date);
  let spending = state.spending;
  for (const hold of state.spending.reservations.filter(h => h.proposal.contract.playerId === c.playerId)) {
    if (hold.kind !== 'renewal' || hold.proposal.teamId !== c.teamId) fail();
    spending = cancelContractReservation(spending, hold.proposal.id);
  }
  if (departure.endAction) spending = { ...spending, ledger: applyContractLedgerAction(spending.ledger, departure.endAction) };
  const marketPlayer = { ...player, isFA: true, isWaiverReleased: true, contractYearsLeft: 0,
    marketEntry: departure.marketEntry, departureReason: c.reason, marketEntryReason: '自由契約',
    marketLastStats: player.stats, faEnteredYear: state.season, faOriginTeamId: team.id, faOriginTeamName: team.name,
    faOriginRoster: team.farm.some(p => p.id === c.playerId) ? 'farm' : 'active' };
  return { ...state, spending, faPool: [...state.faPool, marketPlayer],
    teams: state.teams.map(t => t.id === team.id ? { ...removeDepartingPlayers(t, new Set([c.playerId])),
      history: [...(t.history ?? []), departureHistory(departure)] } : t),
    offseasonDepartures: [...state.offseasonDepartures, departure],
    transactions: [...state.transactions, { id: c.id, signature, departure: structuredClone(departure) }] };
}
