import { applyContractLedgerAction, contractEmploymentAt } from './contractLedger';
import { employmentContractId } from './seasonContract';
import { parseContractDate } from './contractCalendar';
import { removeDepartingPlayers } from './tradeTransaction';
import { cancelContractReservation } from './annualSpending';
import { validateMarketPlayer } from './annualAcquisitions';
import { assessPostTransactionPlayability } from './postTransactionPlayability';
import { SEASON_GAMES } from '../constants';

const fail = () => { throw new Error('退団・元契約・確定履歴を確認してください。'); };
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

// Per-inspection only: the ledger remains the sole source, including its full
// validation. Histories in the same winter share one employment reconstruction.
function departureContracts(ledger) {
  const records = new Map(ledger.records.map(r => [employmentContractId(r.contract), r])), dates = new Map();
  return { records, at(season) {
    if (!dates.has(season)) dates.set(season, new Map(contractEmploymentAt(ledger, day(season, '11-30'))
      .map(e => [employmentContractId(e.contract), e])));
    return dates.get(season);
  } };
}

function recordFor(state, c, player, season, notifiedDate, lookup = departureContracts(state.spending.ledger)) {
  if (parseContractDate(notifiedDate).year !== season || notifiedDate < day(season, '11-30')) fail();
  const e = lookup.at(season).get(c.contractId);
  if (!e || e.teamId !== c.teamId || e.contract.playerId !== c.playerId
    || player?.id !== c.playerId || (c.reason === 'expiry' && e.contract.endSeason !== season)) fail();
  const natural = e.contract.endSeason === season;
  const effectiveDate = natural ? day(season, '12-01') : day(season + 1, '02-01');
  const endAction = natural ? null : { id: JSON.stringify([c.id, 'winter-end']), type: 'end', contractId: c.contractId,
    teamId: c.teamId, effectiveDate, reason: 'release', settlement: 'retain' };
  const source = lookup.records.get(c.contractId);
  const sourceRecord = structuredClone({ ...source, changes: source.changes.filter(a => a.id !== endAction?.id) });
  return { id: c.id, season, sourceRecord, teamId: c.teamId, player: structuredClone(player), sourceContractId: c.contractId,
    sourceAnnualSalaryManYen: e.annualSalaryManYen, reason: c.reason, notifiedDate, effectiveDate, endAction,
    marketEntry: { id: JSON.stringify([c.id, 'released-market']), kind: 'released', enteredDate: notifiedDate, originTeamId: c.teamId } };
}


function seasonRecordFor(state, c, player, season, notifiedDate, gameDay, lookup) {
  if (c.reason !== 'release' || parseContractDate(notifiedDate).year !== season
    || !Number.isSafeInteger(gameDay) || gameDay < 1 || gameDay > SEASON_GAMES) fail();
  const endAction = { id: JSON.stringify([c.id, 'season-end']), type: 'end', contractId: c.contractId,
    teamId: c.teamId, effectiveDate: notifiedDate, reason: 'release', settlement: 'retain' };
  const source = lookup.records.get(c.contractId);
  if (!source || player?.id !== c.playerId) fail();
  const sourceRecord = structuredClone({ ...source, changes: source.changes.filter(a => a.id !== endAction.id) });
  // Reconstruct this source only. Removing the end from the whole ledger would
  // create overlapping employment after a valid later re-acquisition.
  const e = contractEmploymentAt({ ...state.spending.ledger, records: [sourceRecord] }, notifiedDate)[0];
  if (!e || e.teamId !== c.teamId || e.contract.playerId !== c.playerId) fail();
  return { id: c.id, season, phase: 'season', gameDay, sourceRecord, teamId: c.teamId,
    player: structuredClone(player), sourceContractId: c.contractId, sourceAnnualSalaryManYen: e.annualSalaryManYen,
    reason: c.reason, notifiedDate, effectiveDate: notifiedDate, endAction,
    marketEntry: { id: JSON.stringify([c.id, 'released-market']), kind: 'released', enteredDate: notifiedDate, originTeamId: c.teamId } };
}

// Records and receipts are checked in both directions. Only a proven departure
// can exempt a November employment from the winter roster reconciliation.
export function inspectAnnualDepartures(state) {
  const departures = state.offseasonDepartures ?? [];
  if (!Array.isArray(departures)) fail();
  const seen = new Set(), contracts = new Set();
  const lookup = departures.length ? departureContracts(state.spending.ledger) : null;
  for (const d of departures) {
    if (!d || !validId(d.id) || seen.has(String(d.id)) || contracts.has(String(d.sourceContractId))
      || !Number.isInteger(d.season) || d.season > state.season || d.season < 1
      || (d.phase !== undefined && d.phase !== 'season')
      || (d.season === state.season && (d.notifiedDate > state.date
        || (d.phase === 'season' ? !['season', 'offseason'].includes(state.phase)
          || (state.phase === 'season' && (!Number.isSafeInteger(state.gameDay) || state.gameDay < 1
            || state.gameDay > SEASON_GAMES || d.gameDay > state.gameDay)) : state.phase !== 'offseason')))) fail();
    seen.add(String(d.id)); contracts.add(String(d.sourceContractId));
    const receipts = state.transactions.filter(r => r.id === d.id);
    if (receipts.length !== 1) fail();
    const receipt = receipts[0];
    let c; try { c = normalizeWinterDeparture(JSON.parse(receipt.signature)); } catch { fail(); }
    const expected = d.phase === 'season'
      ? seasonRecordFor(state, c, d.player, d.season, d.notifiedDate, d.gameDay, lookup)
      : recordFor(state, c, d.player, d.season, d.notifiedDate, lookup);
    if (c.id !== d.id || stable(c) !== receipt.signature || stable(receipt.departure) !== stable(d)
      || stable(expected) !== stable(d)) fail();
    const team = state.teams.find(t => t.id === d.teamId);
    if (!team?.history?.some(p => stable(p) === stable(departureHistory(d)))) fail();
    const acquired = state.spending.resolvedReservations.some(r => r.kind === 'offer' && r.resolution === 'accepted'
      && r.proposal.contract.playerId === d.player.id && stable(r.proposal.marketEntry) === stable(d.marketEntry));
    if (!acquired) {
      const listing = state.faPool.find(p => p.id === d.player.id && stable(p.marketEntry) === stable(d.marketEntry));
      if (!listing) fail();
      validateMarketPlayer(listing);
      // Listing provenance is immutable; current ability, age and statistics
      // are not the historical departure snapshot. Acquired entries are history.
      if (listing.contractId !== d.sourceContractId || listing.departureReason !== d.reason
        || listing.isWaiverReleased !== true || listing.marketEntryReason !== '自由契約'
        || listing.faEnteredYear !== d.season || listing.faOriginTeamId !== d.teamId) fail();
    }
    if (d.endAction) {
      const record = lookup.records.get(d.sourceContractId);
      if (!record?.changes.some(a => stable(a) === stable(d.endAction))) fail();
    }
  }
  for (const receipt of state.transactions) {
    let c; try { c = JSON.parse(receipt.signature); } catch { /* v1 opaque receipts */ }
    if ((isWinterDepartureCommand(c) || receipt.departure !== undefined)
      && !departures.some(d => d.id === receipt.id)) fail();
  }
  // Every v2 release action must retain its departure and receipt, including
  // after its effective date. Forward-only checks miss paired history removal.
  if (state.version === 2) {
    const provenEnds = new Set(departures.filter(d => d.endAction).map(d => stable(d.endAction)));
    for (const record of state.spending.ledger.records) for (const action of record.changes) {
      if (action.type === 'end' && action.reason === 'release' && !provenEnds.has(stable(action))) fail();
    }
  }
  return departures;
}

const departureHistory = d => ({ ...d.player, exitYear: d.season, exitReason: d.reason === 'expiry' ? '契約満了' : '戦力外' });

export function createWinterDeparture(state, command, signature) {
  const c = normalizeWinterDeparture(command);
  const inSeason = state.phase === 'season';
  if (state.version !== 2 || (!inSeason && state.phase !== 'offseason')) fail();
  const team = state.teams.find(t => t.id === c.teamId);
  const player = team && [...team.players, ...team.farm].find(p => p.id === c.playerId);
  if (!player || player.isRetired || player._retireNow || state.offseasonDepartures.some(d => d.sourceContractId === c.contractId)) fail();
  // An accepted future promise must be settled separately, never silently erased.
  if (state.spending.ledger.records.some(r => r.contract.playerId === c.playerId
    && r.effectiveDate > state.date && contractEmploymentAt(state.spending.ledger, r.effectiveDate)
      .some(e => employmentContractId(e.contract) === employmentContractId(r.contract)))) fail();
  const departure = inSeason
    ? seasonRecordFor(state, c, player, state.season, state.date, state.gameDay, departureContracts(state.spending.ledger))
    : recordFor(state, c, player, state.season, state.date);
  const remainingTeam = removeDepartingPlayers(team, new Set([c.playerId]));
  if (inSeason && !assessPostTransactionPlayability(remainingTeam, { round: state.gameDay }).ok)
    throw new Error('退団後の一軍・二軍の試合成立を確認できません。');
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
    teams: state.teams.map(t => t.id === team.id ? { ...remainingTeam,
      history: [...(t.history ?? []), departureHistory(departure)] } : t),
    offseasonDepartures: [...state.offseasonDepartures, departure],
    transactions: [...state.transactions, { id: c.id, signature, departure: structuredClone(departure) }] };
}
