import { MAX_SHIHAKA_TOTAL } from '../constants';
import { getFaProgress } from './contract';
import { contractSeasonsRemaining } from './seasonContract';
import { contractEmploymentAt } from './contractLedger';
import { commitContractReservation, cancelContractReservation, settleFaCashCompensation } from './annualSpending';
import { parseContractDate, registrationDateAllowed } from './contractCalendar';
import { normalizeMarketEntry, acquisitionOfferMetadata } from './acquisitionMarket';
import { evaluateRosterCapacity, isIkuseiPlayer } from './rosterCapacity';
import { marketRosterError, marketPlacement } from './marketRoster';
import { ownedPlayers, validContractTerms } from './renewalRules';
import { requiresFaCompensation } from './faCompensation';

// GM-01 opt-in lifecycle only. The live FA pool and saves remain unchanged.
const fail = message => { throw new Error(message); };
const sameEntry = (a, b) => JSON.stringify(normalizeMarketEntry(a)) === JSON.stringify(normalizeMarketEntry(b));
const yearStart = year => `${String(year).padStart(4, '0')}-02-01`;
const development = terms => terms.registrationType === 'development';
const offseasonOffer = p => p?.marketEntry && p.contract.agreementPhase === 'offseason';

export function validateMarketPlayer(player) {
  const entry = normalizeMarketEntry(player.marketEntry);
  if (player.isRetired || player._retireNow || player.isFA === false) fail('市場の選手は引退・加入済みです。');
  if (entry.kind !== 'released') {
    const progress = getFaProgress(player);
    if (isIkuseiPlayer(player) || !progress.recorded || !progress[entry.kind === 'domestic-fa' ? 'domestic' : 'overseas'].eligible
      || (entry.compensationRank === 'exempt') !== Boolean(player.isForeign) || player.isWaiverReleased)
      fail('FA宣言市場と資格・補償区分が一致しません。');
  }
  return entry;
}

// Return only unjoined snapshots. Joined records remain historical after trades,
// retirement and future releases; their original club is not current ownership.
export function inspectAnnualAcquisitions(state) {
  if (state.acquisitions !== undefined && !Array.isArray(state.acquisitions)) fail('加入履歴を確認してください。');
  // Receipts never permit rewinding the trusted calendar before a submission
  // or terminal reply. Legacy undated histories retain their prior behavior.
  for (const hold of state.spending.reservations) if (hold.proposal?.marketEntry
    && hold.proposal.offeredDate > state.date) fail('提示日前へ取引日を戻せません。');
  for (const resolved of state.spending.resolvedReservations) if (resolved.proposal?.marketEntry
    && (resolved.proposal.offeredDate > state.date || resolved.answeredDate > state.date))
    fail('回答履歴より前へ取引日を戻せません。');
  if (state.spending.faCompensations !== undefined && !Array.isArray(state.spending.faCompensations)) fail('FA補償の履歴を確認してください。');
  for (const compensation of state.spending.faCompensations ?? []) {
    if (compensation?.chosenDate > state.date) fail('FA補償選択日より前へ取引日を戻せません。');
    if (compensation?.resolution !== 'pending') continue;
    const p = state.spending.resolvedReservations.find(r => r.proposal?.id === compensation.proposalId)?.proposal;
    if (!p || state.season > p.contract.startSeason || (state.season === p.contract.startSeason && state.phase !== 'preseason'))
      fail('未精算のFA補償を残して年度・シーズンを進められません。');
  }
  const histories = state.acquisitions ?? [], ids = new Set(), pending = [];
  const accepted = state.spending.resolvedReservations.filter(r => r.kind === 'offer'
    && r.resolution === 'accepted' && offseasonOffer(r.proposal));
  for (const history of histories) {
    if (!history || Object.keys(history).some(k => !['proposalId', 'player', 'joinedDate'].includes(k))
      || ids.has(history.proposalId)) fail('加入履歴が重複または無効です。');
    ids.add(history.proposalId);
    const resolved = accepted.find(r => r.proposal.id === history.proposalId), p = resolved?.proposal;
    const player = history.player;
    if (!p || !player || player.id !== p.contract.playerId || !sameEntry(player.marketEntry, p.marketEntry)
      || development(p.contract) !== isIkuseiPlayer(player) || state.date < resolved.answeredDate)
      fail('加入履歴と受諾済み契約・市場情報が一致しません。');
    acquisitionOfferMetadata(p);
    if (Object.hasOwn(history, 'joinedDate')) {
      if (state.spending.faCompensations?.some(r => r.proposalId === p.id && r.resolution === 'pending'))
        fail('加入済みのFA選手に未精算の補償を付けることはできません。');
      const d = parseContractDate(history.joinedDate);
      if (d.year !== p.contract.startSeason || history.joinedDate < p.effectiveDate || history.joinedDate > state.date)
        fail('加入日の年度・順序を確認してください。');
      continue;
    }
    validateMarketPlayer(player);
    const record = state.spending.ledger.records.find(r => r.actionId === p.id);
    const employment = contractEmploymentAt(state.spending.ledger, p.effectiveDate)
      .find(e => e.contract.contractId === p.contract.contractId && e.teamId === p.teamId);
    if (!employment || record.changes.length || state.season > p.contract.startSeason
      || (state.season === p.contract.startSeason && state.phase !== 'preseason'))
      fail('加入待ち契約を変更・未加入のまま年度進行できません。');
    const elsewhere = [...state.faPool, ...state.teams.flatMap(ownedPlayers), ...state.draftContext.draftPool];
    if (elsewhere.some(x => String(x.id) === String(player.id))) fail('加入待ち選手の所属が重複しています。');
    if (pending.some(x => String(x.player.id) === String(player.id))) fail('加入待ち選手が重複しています。');
    pending.push({ ...history, proposal: p });
  }
  if (accepted.some(r => !ids.has(r.proposal.id))) fail('受諾済み獲得契約の加入履歴がありません。');
  return pending;
}

export function acquisitionRosterError(state, team, player) {
  const error = marketRosterError(team, player, state.teams, state.draftContext);
  if (error) return error;
  const capacity = evaluateRosterCapacity(team, { ...state.draftContext, teams: state.teams });
  const pending = inspectAnnualAcquisitions(state).filter(h => h.proposal.teamId === team.id && !isIkuseiPlayer(h.player)).length;
  if (!isIkuseiPlayer(player) && capacity.remainingSlots <= pending) return `加入待ちを含む支配下登録枠（${MAX_SHIHAKA_TOTAL}人）が満員です。`;
  return null;
}

const acquiredPlayer = (player, terms, season) => ({ ...player, isFA: false,
  salary: terms.annualSalaryManYen, contractId: terms.contractId, contractYears: terms.termYears,
  contractYearsLeft: contractSeasonsRemaining(terms, season), contractSignedYear: terms.signedSeason,
  育成: development(terms), isIkusei: development(terms), ikuseiYears: 0 });

export function explicitAcquisitionCandidate(state, c, reserveProposal) {
  if (c.type === 'settle-fa-compensation') {
    const compensation = state.spending.faCompensations?.find(r => r.proposalId === c.proposalId);
    const resolved = state.spending.resolvedReservations.find(r => r.kind === 'offer' && r.resolution === 'accepted' && r.proposal.id === c.proposalId);
    const p = resolved?.proposal;
    if (!p || compensation?.resolution !== 'pending' || c.method !== 'cash-only'
      || !state.teams.some(t => t.id === c.teamId)
      || !((state.phase === 'offseason' && state.season === p.contract.signedSeason)
        || (state.phase === 'preseason' && state.season === p.contract.startSeason)))
      fail('旧球団が選択する未精算FA補償と時期を確認してください。');
    return { ...state, spending: settleFaCashCompensation(state.spending,
      { proposalId: c.proposalId, teamId: c.teamId, chosenDate: state.date }) };
  }
  if (c.type === 'join-fa') {
    const pending = inspectAnnualAcquisitions(state).find(h => h.proposalId === c.proposalId);
    if (!pending) fail('加入待ちの受諾済み契約が見つかりません。');
    const p = pending.proposal, team = state.teams.find(t => t.id === p.teamId);
    if (state.spending.faCompensations?.some(r => r.proposalId === p.id && r.resolution === 'pending'))
      fail('FA補償の選択・精算を完了してから加入してください。');
    if (!team || state.phase !== 'preseason' || state.season !== p.contract.startSeason || state.date < p.effectiveDate)
      fail('市場獲得選手の翌春加入日を確認してください。');
    const acquired = acquiredPlayer(pending.player, p.contract, state.season);
    return { ...state, teams: state.teams.map(t => t.id === team.id ? { ...t, farm: [...t.farm, acquired] } : t),
      acquisitions: state.acquisitions.map(h => h.proposalId === p.id ? { ...h, joinedDate: state.date } : h) };
  }
  const proposing = c.type === 'offer-fa';
  const p = proposing ? c.proposal : state.spending.reservations.find(h => h.kind === 'offer' && h.proposal.id === c.proposalId)?.proposal;
  if (!p?.marketEntry || !p.offeredDate) fail('明示した市場情報と元の提示日が必要です。');
  acquisitionOfferMetadata(p);
  if (['cancel-fa', 'reject-fa'].includes(c.type)) return { ...state, spending: cancelContractReservation(state.spending, p.id,
    { resolution: c.type === 'reject-fa' ? 'rejected' : 'cancelled', answeredDate: state.date }) };
  const team = state.teams.find(t => t.id === p.teamId), player = state.faPool.find(x => x.id === p.contract.playerId), terms = p.contract;
  if (!team || !player) fail('市場選手の現在の所属を確認してください。');
  const entry = validateMarketPlayer(player);
  if (!sameEntry(entry, p.marketEntry) || development(terms) !== isIkuseiPlayer(player)
    || !['controlled', 'development'].includes(terms.registrationType) || terms.termYears > 3
    || (development(terms) && terms.termYears !== 1) || !validContractTerms(player, terms.annualSalaryManYen, terms.termYears))
    fail('市場・区分・年俸・契約年数と提示条件が一致しません。');
  const off = terms.agreementPhase === 'offseason';
  const phaseAllowed = terms.agreementPhase === state.phase
    || (!proposing && terms.agreementPhase === 'preseason' && state.phase === 'season');
  if (terms.signedSeason !== state.season || terms.purpose !== 'acquisition' || !phaseAllowed
    || (proposing ? p.offeredDate !== state.date : p.offeredDate > state.date)
    || (off ? p.effectiveDate !== yearStart(state.season + 1)
      : entry.kind !== 'released' || p.effectiveDate !== p.offeredDate || !registrationDateAllowed(state.season, state.date)))
    fail('提示・回答・契約効力の年度またはフェーズを確認してください。');
  if (requiresFaCompensation(p) && entry.compensationBasis && !state.teams.some(t => t.id === entry.originTeamId))
    fail('FA補償を受け取る旧球団が見つかりません。');
  const error = acquisitionRosterError(state, team, player); if (error) fail(error);
  if (proposing) {
    if (state.spending.reservations.some(h => h.proposal.id === p.id)
      || state.spending.resolvedReservations.some(h => h.proposal.id === p.id)) fail('提示済み・解決済みのオファーIDです。');
    return { ...state, spending: reserveProposal(state, 'offer', p) };
  }
  if (requiresFaCompensation(p) && !entry.compensationBasis)
    fail('FA補償の旧年俸・初回/反復の根拠を確認してから受諾してください。');
  const spending = commitContractReservation(state.spending, p,
    { answeredDate: state.date, ...(off ? {} : { effectiveDate: state.date }) });
  const common = { ...state, spending, faPool: state.faPool.filter(x => x.id !== player.id) };
  if (off) return { ...common, acquisitions: [...(state.acquisitions ?? []), { proposalId: p.id, player }] };
  const acquired = acquiredPlayer(player, terms, state.season);
  const farm = acquired.injuryDaysLeft > 0 || acquired.registrationCooldownDays > 0 || marketPlacement(team, acquired).farm;
  return { ...common, teams: state.teams.map(t => t.id === team.id ? { ...t,
    players: [...t.players, ...(!farm ? [acquired] : [])], farm: [...t.farm, ...(farm ? [acquired] : [])] } : t) };
}
