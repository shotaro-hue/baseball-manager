import { MAX_FA_PROTECTED_PLAYERS } from '../constants';
import { parseContractDate } from './contractCalendar';
import { contractEmploymentAt } from './contractLedger';
import { ownedPlayers, isIkuseiPlayer } from './renewalRules';
import { draftPicksForTeam } from './offseasonResume';
import { requiresFaCompensation } from './faCompensation';

// Opt-in GM-01 foundation only. A candidate here is not yet a transfer approval.
const fail = () => { throw new Error('FA保護名簿の対象・提出・履歴を確認してください。'); };
const validId = x => (typeof x === 'string' && x.trim().length > 0) || (Number.isSafeInteger(x) && x >= 0);
const stable = x => JSON.stringify(x, (_, v) => v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
const orderedIds = ids => {
  if (!Array.isArray(ids) || ids.some(x => !validId(x)) || new Set(ids.map(String)).size !== ids.length) fail();
  return [...ids].sort((a, b) => JSON.stringify(a) < JSON.stringify(b) ? -1 : JSON.stringify(a) > JSON.stringify(b) ? 1 : 0);
};
export function normalizeFaProtectedIds(ids) {
  const result = orderedIds(ids); if (result.length > MAX_FA_PROTECTED_PLAYERS) fail(); return result;
}
const accepted = (state, proposalId) => state.spending.resolvedReservations.find(r => r.kind === 'offer'
  && r.resolution === 'accepted' && r.proposal.id === proposalId);
const claimFor = (state, proposalId, pending = false) => {
  const r = accepted(state, proposalId), p = r?.proposal;
  if (!p || !requiresFaCompensation(p) || p.contract.agreementPhase !== 'offseason') fail();
  if (pending && (!state.spending.faCompensations?.some(c => c.proposalId === proposalId && c.resolution === 'pending')
    || !((state.phase === 'offseason' && state.season === p.contract.signedSeason)
      || (state.phase === 'preseason' && state.season === p.contract.startSeason)))) fail();
  return r;
};
const proposalList = (state, p) => state.faProtectionLists?.find(r => r.proposalId === p.id);

function currentEligibleIds(state, p) {
  const team = state.teams.find(t => t.id === p.teamId); if (!team) fail();
  const date = state.phase === 'offseason' ? [state.date, `${state.season}-11-30`].sort()[0] : state.date;
  const employment = new Map(contractEmploymentAt(state.spending.ledger, date)
    .filter(e => e.teamId === team.id).map(e => [e.contract.playerId, e]));
  // Acquisition terms alone cannot distinguish recent rookies from FA/trade
  // arrivals. Accepted rookie reservations survive joining and draft-pool cleanup;
  // spending validation also checks them against the original ledger contract.
  const drafted = new Set(draftPicksForTeam(state.draftContext.draftPool, state.draftContext.drafted, team.id).map(x => x.id));
  for (const r of state.spending.resolvedReservations) if (r.kind === 'rookie' && r.resolution === 'accepted'
    && r.proposal.contract.startSeason === p.contract.startSeason) drafted.add(r.proposal.contract.playerId);
  return orderedIds(ownedPlayers(team).filter(player => {
    const e = employment.get(player.id);
    return e && !isIkuseiPlayer(player) && e.registrationType !== 'development'
      && !player.isForeign && !player.isRetired && !player._retireNow && !player.isFA && !player.isWaiverReleased
      && !drafted.has(player.id);
  }).map(p => p.id));
}

export function createFaProtectionList(state, command) {
  const { proposal: p } = claimFor(state, command.proposalId, true);
  if (command.teamId !== p.teamId || proposalList(state, p)) fail();
  const eligiblePlayerIds = currentEligibleIds(state, p), protectedPlayerIds = normalizeFaProtectedIds(command.protectedPlayerIds);
  if (protectedPlayerIds.some(id => !eligiblePlayerIds.includes(id))) fail();
  return { transactionId: command.id, proposalId: p.id, teamId: p.teamId, season: p.contract.startSeason,
    submittedDate: state.date, eligiblePlayerIds, protectedPlayerIds };
}

// Audit historical membership as a recorded snapshot. Today's roster may have
// changed; its current eligibility is used only for availability in the query.
export function inspectFaProtectionLists(state) {
  if (state.faProtectionLists !== undefined && !Array.isArray(state.faProtectionLists)) fail();
  const records = new Map(), proposals = new Set();
  for (const record of state.faProtectionLists ?? []) {
    if (!record || Object.keys(record).length !== 7 || Object.keys(record).some(k =>
      !['transactionId', 'proposalId', 'teamId', 'season', 'submittedDate', 'eligiblePlayerIds', 'protectedPlayerIds'].includes(k))
      || !validId(record.transactionId) || records.has(record.transactionId)) fail();
    const { proposal: p, answeredDate } = claimFor(state, record.proposalId);
    const date = parseContractDate(record.submittedDate);
    if (record.teamId !== p.teamId || record.season !== p.contract.startSeason || proposals.has(record.proposalId)
      || record.submittedDate < answeredDate || record.submittedDate > state.date
      || date.year < p.contract.signedSeason || date.year > p.contract.startSeason
      || stable(orderedIds(record.eligiblePlayerIds)) !== stable(record.eligiblePlayerIds)
      || stable(normalizeFaProtectedIds(record.protectedPlayerIds)) !== stable(record.protectedPlayerIds)
      || record.protectedPlayerIds.some(id => !record.eligiblePlayerIds.includes(id))) fail();
    const receipt = state.transactions.find(r => r.id === record.transactionId);
    if (!receipt || stable(receipt.faProtection) !== stable(record)) fail();
    records.set(record.transactionId, record); proposals.add(record.proposalId);
  }
  for (const receipt of state.transactions) {
    let command; try { command = JSON.parse(receipt.signature); } catch { /* Legacy opaque receipts have no protection payload. */ }
    if (command?.type !== 'submit-fa-protection' && !Object.hasOwn(receipt, 'faProtection')) continue;
    const record = records.get(receipt.id);
    if (!record || !command || Object.keys(command).length !== 5
      || command.type !== 'submit-fa-protection' || command.id !== receipt.id
      || command.proposalId !== record.proposalId || command.teamId !== record.teamId
      || stable(command) !== receipt.signature
      || stable(normalizeFaProtectedIds(command.protectedPlayerIds)) !== stable(command.protectedPlayerIds)
      || stable(normalizeFaProtectedIds(command.protectedPlayerIds)) !== stable(record.protectedPlayerIds)) fail();
  }
}

export function faProtectionView(state, selector) {
  if (!selector || Object.keys(selector).length !== 1 || !validId(selector.proposalId)) fail();
  const { proposal: p } = claimFor(state, selector.proposalId, true), list = proposalList(state, p);
  const current = currentEligibleIds(state, p), eligible = list?.eligiblePlayerIds ?? current, protectedIds = list?.protectedPlayerIds ?? [];
  const unprotected = eligible.filter(id => !protectedIds.includes(id));
  return { proposalId: p.id, teamId: p.teamId, season: p.contract.startSeason, submitted: Boolean(list),
    eligiblePlayerIds: [...eligible], protectedPlayerIds: [...protectedIds],
    candidatePlayerIds: unprotected.filter(id => current.includes(id)), unavailablePlayerIds: unprotected.filter(id => !current.includes(id)) };
}
