import { MIN_SALARY_SHIHAKA, MAX_SHIHAKA_TOTAL } from '../constants';
import { createSeasonContract, contractSeasonsRemaining } from './seasonContract';
import { contractEmploymentAt, applyContractLedgerAction } from './contractLedger';
import { quoteAnnualSpendingPlan, assessAnnualSpendingChange, reserveContractProposal,
  commitContractReservation, cancelContractReservation } from './annualSpending';
import { parseContractDate, registrationDateAllowed } from './contractCalendar';
import { ownedPlayers, validContractTerms } from './renewalRules';
import { evaluateRosterCapacity, isIkuseiPlayer } from './rosterCapacity';
import { marketPlacement } from './marketRoster';
import { projectTradeRosters } from './tradeTransaction';
import { acquisitionOfferMetadata, normalizeMarketEntry } from './acquisitionMarket';
import { inspectAnnualAcquisitions, acquisitionRosterError, explicitAcquisitionCandidate } from './annualAcquisitions';

// GM-01C: explicit, opt-in engine state. Live hooks/save adoption remain gated.
const fail = message => { throw new Error(message); };
const validId = id => (typeof id === 'string' && id.trim()) || (Number.isSafeInteger(id) && id >= 0);
const key = (team, season) => JSON.stringify([team, season]);
const stable = value => JSON.stringify(value, (_, v) => v && !Array.isArray(v) && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
const yearStart = year => `${String(year).padStart(4, '0')}-02-01`;
// Expiring players remain on the offseason roster; no current salary is paid
// after November. Inspect their existing employment without rolling the year.
const rosterDate = state => state.phase === 'offseason'
  ? [state.date, `${String(state.season).padStart(4, '0')}-11-30`].sort()[0] : state.date;

function futureEmployments(state) {
  const dates = new Map(), result = [];
  for (const record of state.spending.ledger.records) {
    if (record.effectiveDate <= state.date) continue;
    if (!dates.has(record.effectiveDate)) dates.set(record.effectiveDate, new Map(
      contractEmploymentAt(state.spending.ledger, record.effectiveDate).map(e => [e.contract.contractId, e])));
    const employment = dates.get(record.effectiveDate).get(record.contract.contractId);
    if (employment) result.push({ ...employment, effectiveDate: record.effectiveDate });
  }
  return result;
}
const kinds = {
  'offer-fa': ['proposal'], 'accept-fa': ['proposalId'], 'cancel-fa': ['proposalId'],
  'reject-fa': ['proposalId'], 'join-fa': ['proposalId'],
  'offer-renewal': ['proposal', 'contractId'], 'replace-renewal': ['proposalId', 'proposal', 'contractId'],
  'accept-renewal': ['proposalId', 'contractId'], 'cancel-renewal': ['proposalId'],
  'reserve-rookie': ['proposal'], 'decline-rookie': ['teamId', 'playerId'], 'join-rookie': ['proposalId'],
  trade: ['fromId', 'toId', 'outgoingIds', 'incomingIds', 'cashManYen', 'mode'],
  'convert-to-controlled': ['teamId', 'playerId', 'contractId', 'annualSalaryManYen'],
};
function commandFor(input) {
  if (!input || !validId(input.id) || !Object.hasOwn(kinds, input.type)
    || Object.keys(input).some(k => !['id', 'type', ...kinds[input.type]].includes(k))) fail('取引の種類・ID・入力項目を確認してください。');
  const c = { id: input.id, type: input.type };
  for (const field of kinds[c.type]) {
    if (!Object.hasOwn(input, field)) fail('取引の条件が未記録です。');
    c[field] = input[field];
  }
  if (['offer-fa', 'offer-renewal', 'replace-renewal', 'reserve-rookie'].includes(c.type)) {
    const p = c.proposal;
    if (!p || p.type !== 'sign' || !validId(p.id) || !validId(p.teamId)) fail('契約オファーを確認してください。');
    c.proposal = { id: p.id, type: 'sign', teamId: p.teamId, effectiveDate: p.effectiveDate, contract: createSeasonContract(p.contract), ...acquisitionOfferMetadata(p) };
    if (c.type.endsWith('renewal') && !validId(c.contractId)) fail('更改対象の契約IDを確認してください。');
    if (c.type === 'replace-renewal' && !validId(c.proposalId)) fail('差し替える更改オファーを確認してください。');
  } else if (c.type === 'accept-renewal') {
    if (![c.proposalId, c.contractId].every(validId)) fail('受諾する更改と現在契約を確認してください。');
  } else if (c.type === 'decline-rookie') {
    if (![c.teamId, c.playerId].every(validId)) fail('辞退する新人と受諾球団を確認してください。');
  } else if (c.type === 'convert-to-controlled') {
    if (![c.teamId, c.playerId, c.contractId].every(validId) || !Number.isSafeInteger(c.annualSalaryManYen)) fail('支配下転換の選手・契約・年俸を確認してください。');
  } else if (c.type === 'trade') {
    if (![c.fromId, c.toId].every(validId) || ![c.outgoingIds, c.incomingIds].every(Array.isArray)
      || !Number.isSafeInteger(c.cashManYen) || !['spend', 'cashless-trade'].includes(c.mode)) fail('移籍の条件を確認してください。');
    c.outgoingIds = [...c.outgoingIds]; c.incomingIds = [...c.incomingIds];
    if (![...c.outgoingIds, ...c.incomingIds].every(validId)) fail('移籍選手IDを確認してください。');
  } else if (!validId(c.proposalId)) fail('オファーIDを確認してください。');
  return c;
}

function inspect(state) {
  if (!state || state.version !== 1 || !Array.isArray(state.teams) || !Array.isArray(state.faPool)
    || !Array.isArray(state.transactions) || !Array.isArray(state.rosterRequirements)
    || !state.draftContext || !Array.isArray(state.draftContext.draftPool)) fail('新制度の取引状態が未確認です。');
  const date = parseContractDate(state.date);
  if (date.year !== state.season || state.spending?.budgetSeason !== state.season + Number(state.phase === 'offseason')
    || !['preseason', 'season', 'offseason'].includes(state.phase)) fail('取引年度・フェーズを確認してください。');
  const pendingAcquisitions = inspectAnnualAcquisitions(state);
  const teams = new Map(), players = new Map(), owners = new Map(), receipts = new Set(), acceptedRookies = new Map();
  const teamKeys = new Set(), playerKeys = new Set();
  for (const team of state.teams) {
    if (!validId(team.id) || teamKeys.has(String(team.id)) || !Array.isArray(team.players) || !Array.isArray(team.farm)) fail('球団名簿を確認してください。');
    teamKeys.add(String(team.id)); teams.set(team.id, team);
    for (const p of ownedPlayers(team)) {
      if (!validId(p?.id) || playerKeys.has(String(p.id))) fail('選手の所属が重複または無効です。');
      playerKeys.add(String(p.id)); players.set(p.id, p); owners.set(p.id, team.id);
    }
    const capacity = evaluateRosterCapacity(team, { ...state.draftContext, teams: state.teams });
    const pendingCount = pendingAcquisitions.filter(h => h.proposal.teamId === team.id && !isIkuseiPlayer(h.player)).length;
    if (!capacity.ok || capacity.overBy || capacity.controlledCount + capacity.acceptedPickCount + pendingCount > MAX_SHIHAKA_TOTAL)
      fail('加入待ちを含む支配下登録枠を確認してください。');
    for (const p of [...capacity.acceptedPicks, ...capacity.acceptedDevelopmentPicks]) {
      if (acceptedRookies.has(p.id)) fail('同じ新人が複数球団で受諾済みになっています。');
      acceptedRookies.set(p.id, { player: p, teamId: team.id });
    }
  }
  for (const p of state.faPool) {
    if (p?.marketEntry !== undefined) normalizeMarketEntry(p.marketEntry);
    if (!validId(p?.id) || playerKeys.has(String(p.id))) fail('市場選手の所属が重複または無効です。');
    playerKeys.add(String(p.id)); players.set(p.id, p);
  }
  for (const { player: p } of pendingAcquisitions) {
    if (!validId(p.id) || playerKeys.has(String(p.id))) fail('加入待ち選手のID・所属が重複しています。');
    playerKeys.add(String(p.id)); players.set(p.id, p);
  }
  for (const p of state.draftContext.draftPool) {
    if (!validId(p?.id)) fail('新人選手IDを確認してください。');
    if (!players.has(p.id)) {
      if (playerKeys.has(String(p.id))) fail('新人選手IDの型が衝突しています。');
      // Use the assignment-validated duplicate, not a stale first pool record.
      // Current owned/market metadata above remains authoritative.
      playerKeys.add(String(p.id)); players.set(p.id, acceptedRookies.get(p.id)?.player ?? p);
    }
  }
  const employed = contractEmploymentAt(state.spending.ledger, rosterDate(state)).filter(e =>
    !pendingAcquisitions.some(h => h.proposal.contract.contractId === e.contract.contractId));
  if (employed.length !== owners.size || employed.some(e => owners.get(e.contract.playerId) !== e.teamId)) fail('名簿と有効な契約の所属が一致しません。');
  if (employed.some(e => e.registrationType !== undefined
    && (e.registrationType === 'development') !== isIkuseiPlayer(players.get(e.contract.playerId)))) fail('名簿と有効な契約の支配下・育成区分が一致しません。');
  const conflictsWithControlled = (playerId, registrationType) => registrationType === 'development'
    && owners.has(playerId) && !isIkuseiPlayer(players.get(playerId));
  // Capacity reserves the assignment-validated draft class. A recorded rookie
  // hold must use that same club/class, otherwise funding could claim a controlled
  // place that capacity still treats as development. Future renewal class
  // changes are independent of these accepted-but-unowned rookie assignments.
  for (const hold of state.spending.reservations) {
    const proposal = hold?.proposal, contract = proposal?.contract, rookie = acceptedRookies.get(contract?.playerId);
    if (hold?.kind !== 'rookie' || !rookie) continue;
    if (proposal.teamId !== rookie.teamId) fail('受諾済み新人と契約留保の球団が一致しません。');
    if (contract.registrationType !== undefined
      && (contract.registrationType === 'development') !== isIkuseiPlayer(rookie.player)) fail('受諾済み新人と契約留保の支配下・育成区分が一致しません。');
  }
  for (const hold of state.spending.reservations) if (hold?.kind === 'renewal') {
    const terms = hold.proposal?.contract;
    if (owners.get(terms?.playerId) !== hold.proposal?.teamId) fail('更改留保と現在の所属球団が一致しません。');
    if (conflictsWithControlled(terms?.playerId, terms?.registrationType))
      fail('未回答の育成更改オファーを取り消してから支配下転換してください。');
  }
  for (const record of state.spending.ledger.records) if (record.effectiveDate <= state.date
    && record.changes.some(c => c.effectiveDate > state.date)) fail('未来の取引を現在の名簿へ反映できません。');
  for (const future of futureEmployments(state)) {
    if (future.contract.purpose === 'acquisition' && !owners.has(future.contract.playerId)
      && !pendingAcquisitions.some(h => h.proposal.contract.contractId === future.contract.contractId))
      fail('将来の獲得契約に加入待ち選手の情報がありません。');
    if (future.contract.purpose === 'renewal'
      && owners.get(future.contract.playerId) !== future.teamId) fail('更改済み将来契約と現在の所属球団が一致しません。');
    if (conflictsWithControlled(future.contract.playerId, future.registrationType))
      fail('受諾済みの将来育成契約があるため、支配下転換できません。');
  }
  for (const receipt of state.transactions) {
    if (!validId(receipt?.id) || typeof receipt.signature !== 'string' || receipts.has(receipt.id)) fail('取引の確定履歴を確認してください。');
    receipts.add(receipt.id);
  }
  quoteAnnualSpendingPlan(state.spending);
  return { teams, players, employed };
}

// Planner counts belong to the trusted snapshot, never the incoming command.
// An unowned accepted rookie still needs funding; a funded hold counts once.
function withFloors(state) {
  const { teams, players } = inspect(state), requirements = new Map();
  for (const r of state.rosterRequirements) {
    const k = key(r.teamId, r.season);
    if (!teams.has(r.teamId) || !Number.isInteger(r.season) || !Number.isInteger(r.requiredControlledCount)
      || r.requiredControlledCount < 0 || r.requiredControlledCount > MAX_SHIHAKA_TOTAL || requirements.has(k)) fail('年度別の必要人数を確認してください。');
    requirements.set(k, r.requiredControlledCount);
  }
  const employmentByDate = new Map();
  const authorizations = state.spending.authorizations.map(a => {
    if (a.season < state.spending.budgetSeason) return a;
    const required = requirements.get(key(a.teamId, a.season));
    if (required === undefined || !teams.has(a.teamId)) fail('全対象年度に球団の必要人数が必要です。');
    const date = a.season === state.season ? state.date : yearStart(a.season);
    const funded = new Set();
    const count = (playerId, registrationType, reservation = false) => {
      const p = players.get(playerId);
      if (!p && (!reservation || registrationType === undefined)) fail('契約対象選手の名簿情報がありません。');
      // Recorded terms/boundaries are authoritative for their own date. Only
      // untyped C-1 inputs use current metadata; do not invent ledger history.
      if (registrationType === 'controlled' || (registrationType === undefined && !isIkuseiPlayer(p))) funded.add(playerId);
    };
    if (!employmentByDate.has(date)) employmentByDate.set(date, contractEmploymentAt(state.spending.ledger, date));
    for (const e of employmentByDate.get(date)) if (e.teamId === a.teamId) count(e.contract.playerId, e.registrationType);
    for (const h of state.spending.reservations) {
      const p = h.proposal;
      if (p.teamId === a.teamId && p.contract.startSeason <= a.season && p.contract.endSeason >= a.season) count(p.contract.playerId, p.contract.registrationType, true);
    }
    const capacity = evaluateRosterCapacity(teams.get(a.teamId), { ...state.draftContext, teams: state.teams });
    const unfundedPicks = a.season === state.spending.budgetSeason ? capacity.acceptedPicks.filter(p => !funded.has(p.id)).length : 0;
    return { ...a, minimumRosterReserveManYen: Math.max(unfundedPicks, required - funded.size, 0) * MIN_SALARY_SHIHAKA };
  });
  return { ...state, spending: { ...state.spending, authorizations } };
}

// A proposal replaces vacancies with its actual liability before admission.
// Share this projection for FA and renewals; the spending module owns histories.
function reserveAnnualProposal(state, kind, proposal, replaceId) {
  const projected = withFloors({ ...state, spending: { ...state.spending,
    reservations: [...state.spending.reservations.filter(h => h.proposal.id !== replaceId), { kind, proposal }] } });
  return reserveContractProposal({ ...state.spending, authorizations: projected.spending.authorizations },
    { kind, proposal, ...(replaceId !== undefined ? { replaceId } : {}) });
}

function faCandidate(state, c) {
  const proposal = c.proposal ?? state.spending.reservations.find(h => h.kind === 'offer' && h.proposal.id === c.proposalId)?.proposal;
  const marketPlayer = state.faPool.find(p => p.id === proposal?.contract.playerId);
  if (c.type === 'join-fa' || proposal?.marketEntry || marketPlayer?.marketEntry || state.phase === 'offseason')
    return explicitAcquisitionCandidate(state, c, reserveAnnualProposal);
  const proposing = c.type === 'offer-fa';
  let p = c.proposal;
  if (!proposing) p = state.spending.reservations.find(h => h.proposal.id === c.proposalId && h.kind === 'offer')?.proposal;
  if (!p) fail('有効なFAオファーが見つかりません。');
  if (c.type === 'cancel-fa' || c.type === 'reject-fa') return { ...state, spending: cancelContractReservation(state.spending, p.id,
    { resolution: c.type === 'reject-fa' ? 'rejected' : 'cancelled' }) };
  if (state.spending.resolvedReservations.some(h => h.proposal.id === p.id)) fail('解決済みのFAオファーです。');
  if (c.type === 'offer-fa' && state.spending.reservations.some(h => h.proposal.id === p.id)) fail('提示済みのオファーIDです。');
  const team = state.teams.find(t => t.id === p.teamId), player = state.faPool.find(x => x.id === p.contract.playerId);
  if (!team || !player || isIkuseiPlayer(player) || p.contract.registrationType === 'development' || player.isRetired || player._retireNow) fail('FA市場の対象選手を確認してください。');
  const phaseAllowed = p.contract.agreementPhase === state.phase
    || (!proposing && p.contract.agreementPhase === 'preseason' && state.phase === 'season');
  if ((proposing ? p.effectiveDate !== state.date : p.effectiveDate > state.date)
    || p.contract.signedSeason !== state.season || !phaseAllowed
    || p.contract.purpose !== 'acquisition' || p.contract.termYears > 3 || p.contract.annualSalaryManYen < MIN_SALARY_SHIHAKA
    || !registrationDateAllowed(state.season, state.date)) fail('FAの効力日・年俸・契約期間・登録期限を確認してください。');
  const error = acquisitionRosterError(state, team, player); if (error) fail(error);
  if (c.type === 'offer-fa') {
    return { ...state, spending: reserveAnnualProposal(state, 'offer', p) };
  }
  const spending = commitContractReservation(state.spending, p, { effectiveDate: state.date });
  const acquired = { ...player, isFA: false, salary: p.contract.annualSalaryManYen, contractId: p.contract.contractId,
    contractYears: p.contract.termYears, contractYearsLeft: contractSeasonsRemaining(p.contract, state.season), contractSignedYear: p.contract.signedSeason };
  const farm = acquired.injuryDaysLeft > 0 || acquired.registrationCooldownDays > 0 || marketPlacement(team, acquired).farm;
  const nextTeam = { ...team, players: [...team.players, ...(!farm ? [acquired] : [])], farm: [...team.farm, ...(farm ? [acquired] : [])] };
  return { ...state, spending, faPool: state.faPool.filter(x => x.id !== player.id), teams: state.teams.map(t => t.id === team.id ? nextTeam : t) };
}

function renewalCandidate(state, c) {
  const proposing = ['offer-renewal', 'replace-renewal'].includes(c.type);
  const previous = c.type !== 'offer-renewal'
    ? state.spending.reservations.find(h => h.kind === 'renewal' && h.proposal.id === c.proposalId) : null;
  const p = proposing ? c.proposal : previous?.proposal;
  if (!p || (c.type === 'replace-renewal' && (!previous || previous.proposal.id === p.id
    || previous.proposal.teamId !== p.teamId || previous.proposal.contract.playerId !== p.contract.playerId))) fail('有効な更改オファーが見つかりません。');
  if (c.type === 'cancel-renewal') return { ...state, spending: cancelContractReservation(state.spending, p.id) };
  if (!['season', 'offseason'].includes(state.phase)) fail('翌年度更改のフェーズを確認してください。');
  const team = state.teams.find(t => t.id === p.teamId), terms = p.contract;
  const player = team && ownedPlayers(team).find(p => p.id === terms.playerId);
  const current = contractEmploymentAt(state.spending.ledger, rosterDate(state))
    .find(e => e.teamId === p.teamId && e.contract.playerId === terms.playerId && e.contract.contractId === c.contractId);
  if (!player || player.isRetired || player._retireNow || !current || current.contract.endSeason !== state.season)
    fail('更改対象の現在契約・所属・満了年度を確認してください。');
  const registrationType = isIkuseiPlayer(player) ? 'development' : 'controlled';
  if (terms.purpose !== 'renewal' || terms.signedSeason !== state.season || terms.startSeason !== state.season + 1
    || p.effectiveDate !== yearStart(state.season + 1) || !['season', 'offseason'].includes(terms.agreementPhase)
    || terms.registrationType !== registrationType || !validContractTerms(player, terms.annualSalaryManYen, terms.termYears))
    fail('翌年度更改の区分・年俸・期間・効力日を確認してください。');
  if (proposing ? terms.agreementPhase !== state.phase
    : terms.agreementPhase === 'offseason' && state.phase !== 'offseason') fail('更改の合意フェーズが現在状態と一致しません。');
  if (proposing) {
    if (state.spending.resolvedReservations.some(h => h.proposal.id === p.id)
      || state.spending.reservations.some(h => h.proposal.id === p.id)
      || state.spending.reservations.some(h => h.kind === 'renewal' && h.proposal.contract.playerId === terms.playerId
        && h.proposal.id !== previous?.proposal.id)) fail('更改オファーは既存の留保を明示して差し替えてください。');
    return { ...state, spending: reserveAnnualProposal(state, 'renewal', p, previous?.proposal.id) };
  }
  // Future employment goes into the ledger. Current roster salary/term/placement
  // stay unchanged until the separately implemented annual rollover.
  return { ...state, spending: commitContractReservation(state.spending, p) };
}

// Compare everything a rookie carries into the roster, including nested/future
// player fields. Only assignment history and values replaced at join are exempt.
const rookieJoinReplacedFields = new Set(['_drafted', '_r1winner', 'salary', 'contractId',
  'contractYears', 'contractYearsLeft', 'contractSignedYear', '育成', 'isIkusei', 'ikuseiYears', 'isFA']);
const rookieAttributes = player => stable(Object.fromEntries(Object.entries(player)
  .filter(([field]) => !rookieJoinReplacedFields.has(field))));

function acceptedRookie(state, teamId, playerId) {
  const team = state.teams.find(t => t.id === teamId);
  const capacity = team && evaluateRosterCapacity(team, { ...state.draftContext, teams: state.teams });
  const player = capacity?.ok && [...capacity.acceptedPicks, ...capacity.acceptedDevelopmentPicks].find(p => p.id === playerId);
  if (!player || player.isRetired || player._retireNow || state.faPool.some(p => p.id === playerId))
    fail('受諾済み未加入の新人と獲得球団を確認してください。');
  const attributes = rookieAttributes(player);
  for (const duplicate of state.draftContext.draftPool.filter(p => p.id === playerId && p !== player)) {
    // Reuse capacity's exact per-record assignment rules: a conflicting-owner
    // record or stale lottery snapshot must not veto the legitimate final pick.
    const single = evaluateRosterCapacity(team, { ...state.draftContext, teams: state.teams, draftPool: [duplicate] });
    const accepted = single.ok && [...single.acceptedPicks, ...single.acceptedDevelopmentPicks].length > 0;
    if (accepted && rookieAttributes(duplicate) !== attributes)
      fail('受諾済み新人の重複候補で選手属性が一致しません。');
  }
  return { team, player };
}

function rookieCandidate(state, c) {
  if (c.type === 'join-rookie') {
    const p = state.spending.reservations.find(h => h.kind === 'rookie' && h.proposal.id === c.proposalId)?.proposal;
    if (!p) fail('入団する新人の有効な契約留保が見つかりません。');
    const terms = p.contract, { team, player } = acceptedRookie(state, p.teamId, terms.playerId);
    if (state.phase !== 'preseason' || terms.purpose !== 'acquisition' || terms.agreementPhase !== 'offseason'
      || terms.signedSeason !== state.season - 1 || terms.startSeason !== state.season
      || p.effectiveDate !== yearStart(state.season) || state.date < p.effectiveDate || terms.termYears !== 1
      || terms.registrationType !== (isIkuseiPlayer(player) ? 'development' : 'controlled')
      || !validContractTerms(player, terms.annualSalaryManYen, terms.termYears))
      fail('新人の入団年度・区分・年俸・合意済み効力日を確認してください。');
    const spending = commitContractReservation(state.spending, p);
    const acquired = { ...player, salary: terms.annualSalaryManYen, contractId: terms.contractId,
      contractYears: terms.termYears, contractYearsLeft: contractSeasonsRemaining(terms, state.season),
      contractSignedYear: terms.signedSeason, 育成: terms.registrationType === 'development',
      isIkusei: terms.registrationType === 'development', ikuseiYears: 0, isFA: false };
    return { ...state, spending, teams: state.teams.map(t => t.id === team.id ? { ...t, farm: [...t.farm, acquired] } : t) };
  }
  if (c.type === 'reserve-rookie') {
    const p = c.proposal, terms = p.contract;
    const { player } = acceptedRookie(state, p.teamId, terms.playerId);
    const registrationType = isIkuseiPlayer(player) ? 'development' : 'controlled';
    if (state.phase !== 'offseason' || terms.purpose !== 'acquisition' || terms.agreementPhase !== 'offseason'
      || terms.signedSeason !== state.season || terms.startSeason !== state.season + 1
      || p.effectiveDate !== yearStart(terms.startSeason) || terms.termYears !== 1
      || terms.registrationType !== registrationType || !validContractTerms(player, terms.annualSalaryManYen, terms.termYears))
      fail('新人の翌年度契約・区分・年俸・効力日を確認してください。');
    if (state.spending.resolvedReservations.some(h => h.proposal.id === p.id)
      || state.spending.reservations.some(h => h.proposal.id === p.id || h.proposal.contract.playerId === terms.playerId))
      fail('提示済みまたは解決済みの新人契約を重複留保できません。');
    return { ...state, spending: reserveAnnualProposal(state, 'rookie', p) };
  }
  if (!['offseason', 'preseason'].includes(state.phase)) fail('新人の辞退はオフまたは開幕前に確定してください。');
  const { player } = acceptedRookie(state, c.teamId, c.playerId);
  const holds = state.spending.reservations.filter(h => h.proposal.contract.playerId === c.playerId);
  let spending = state.spending;
  for (const hold of holds) {
    if (hold.kind !== 'rookie' || hold.proposal.teamId !== c.teamId
      || hold.proposal.contract.registrationType !== (isIkuseiPlayer(player) ? 'development' : 'controlled'))
      fail('新人の受諾球団・区分と契約留保が一致しません。');
    spending = cancelContractReservation(spending, hold.proposal.id);
  }
  return { ...state, spending, draftContext: { ...state.draftContext,
    drafted: { ...state.draftContext.drafted, [c.playerId]: 'refused' } } };
}

function tradeCandidate(state, c) {
  if (!registrationDateAllowed(state.season, state.date) || (c.mode === 'cashless-trade' && c.cashManYen !== 0)) fail('移籍期限または無金銭例外の条件を確認してください。');
  const projected = projectTradeRosters(state.teams, { fromId: c.fromId, toId: c.toId,
    outgoing: c.outgoingIds.map(id => ({ id })), incoming: c.incomingIds.map(id => ({ id })) }, state.draftContext);
  if (!projected.ok) fail(projected.error);
  const employment = contractEmploymentAt(state.spending.ledger, state.date), future = futureEmployments(state);
  const transferred = new Set([...c.outgoingIds, ...c.incomingIds]);
  const pending = state.spending.reservations.filter(h => h.kind === 'renewal' && transferred.has(h.proposal.contract.playerId));
  if (c.mode === 'cashless-trade' && pending.length) fail('無金銭例外の前に未回答の更改オファーを取り消してください。');
  let spending = state.spending;
  for (const hold of pending) spending = cancelContractReservation(spending, hold.proposal.id);
  let ledger = spending.ledger;
  for (const [ids, from, to] of [[c.outgoingIds, c.fromId, c.toId], [c.incomingIds, c.toId, c.fromId]]) for (const playerId of ids) {
    const e = employment.find(e => e.contract.playerId === playerId && e.teamId === from);
    if (!e) fail('移籍する選手の有効な契約が見つかりません。');
    ledger = applyContractLedgerAction(ledger, { id: key(c.id, ['transfer', playerId]), type: 'transfer', contractId: e.contract.contractId,
      teamId: from, toTeamId: to, effectiveDate: state.date });
    for (const upcoming of future.filter(e => e.contract.playerId === playerId)) {
      if (upcoming.teamId !== from) fail('移籍する選手の将来契約の所属が一致しません。');
      ledger = applyContractLedgerAction(ledger, { id: key(c.id, ['future-transfer', playerId, upcoming.contract.contractId]),
        type: 'transfer', contractId: upcoming.contract.contractId, teamId: from, toTeamId: to, effectiveDate: upcoming.effectiveDate });
    }
  }
  const costs = c.cashManYen === 0 ? [] : [[c.fromId, c.cashManYen], [c.toId, -c.cashManYen]].map(([teamId, amountManYen]) => ({
    id: key(c.id, ['cash', teamId]), transactionId: c.id, teamId, season: state.season, kind: 'trade', amountManYen,
  }));
  const current = new Map(contractEmploymentAt(ledger, state.date).map(e => [e.contract.playerId, e]));
  const project = player => {
    if (!transferred.has(player.id)) return player;
    const e = current.get(player.id);
    return { ...player, salary: e.annualSalaryManYen, contractId: e.contract.contractId,
      contractYears: e.contract.termYears, contractYearsLeft: contractSeasonsRemaining(e.contract, state.season),
      contractSignedYear: e.contract.signedSeason };
  };
  const teams = projected.teams.map(t => t.id === c.fromId || t.id === c.toId
    ? { ...t, players: t.players.map(project), farm: t.farm.map(project) } : t);
  return { ...state, teams, spending: { ...spending, ledger, oneOffCosts: [...spending.oneOffCosts, ...costs] } };
}

function conversionCandidate(state, c) {
  const team = state.teams.find(t => t.id === c.teamId);
  const player = team?.farm.find(p => p.id === c.playerId);
  const employment = contractEmploymentAt(state.spending.ledger, state.date)
    .find(e => e.contract.playerId === c.playerId && e.teamId === c.teamId && e.contract.contractId === c.contractId);
  if (!player || !isIkuseiPlayer(player) || player.isRetired || player._retireNow
    || employment?.registrationType !== 'development') fail('現在の所属と育成契約を確認してください。');
  const ledger = applyContractLedgerAction(state.spending.ledger, { id: key(c.id, ['conversion', c.playerId]),
    type: 'convert-to-controlled', teamId: c.teamId, contractId: c.contractId,
    effectiveDate: state.date, annualSalaryManYen: c.annualSalaryManYen });
  const converted = { ...player, 育成: false, isIkusei: false, ikuseiYears: 0,
    salary: c.annualSalaryManYen, contractId: c.contractId,
    contractYears: employment.contract.termYears,
    contractYearsLeft: contractSeasonsRemaining(employment.contract, state.season),
    contractSignedYear: employment.contract.signedSeason };
  // Classification changes; placement stays farm. Shared inspection checks
  // accepted rookies against the 70-place cap and rejects conflicting future
  // terms before commit, without rewriting their contracts or reservations.
  const teams = state.teams.map(t => t.id === c.teamId ? { ...t, farm: t.farm.map(p => p.id === c.playerId ? converted : p) } : t);
  return { ...state, teams, spending: { ...state.spending, ledger } };
}

function candidate(input, command) {
  const c = commandFor(command), before = withFloors(input), signature = stable(c);
  const receipt = input.transactions.find(r => r.id === c.id);
  if (receipt) {
    if (receipt.signature !== signature) fail('同じ取引IDの条件が変わっています。');
    return { state: input, rows: quoteAnnualSpendingPlan(before.spending), replayed: true };
  }
  if (input.phase === 'offseason' && !c.type.endsWith('renewal') && !c.type.endsWith('rookie') && !c.type.endsWith('fa')) fail('オフの新制度取引は翌年度契約だけが接続済みです。');
  const after = withFloors(c.type === 'trade' ? tradeCandidate(before, c)
    : c.type === 'convert-to-controlled' ? conversionCandidate(before, c)
    : c.type.endsWith('renewal') ? renewalCandidate(before, c)
    : c.type.endsWith('rookie') ? rookieCandidate(before, c) : faCandidate(before, c));
  const mode = c.type === 'trade' ? c.mode : 'spend';
  // A derived floor restored by a losing/cancelled bid is not new spending.
  // Use final floors for admission; independently check actual headroom changes.
  const comparison = mode === 'cashless-trade' ? before.spending
    : { ...before.spending, authorizations: after.spending.authorizations };
  const assessment = assessAnnualSpendingChange(comparison, after.spending, { mode });
  if (!assessment.ok) fail('対象年度の追加余力が不足または悪化しています。');
  const oldRows = new Map(quoteAnnualSpendingPlan(before.spending).map(r => [key(r.teamId, r.season), r]));
  const rows = quoteAnnualSpendingPlan(after.spending);
  // Releasing a prorated bid may restore a larger conservative annual floor.
  // Cancellation/losing bids create no obligation; winner admission is above.
  // Trades must still account for real vacancies created by outgoing players.
  if (c.type === 'trade' && rows.some(r => r.remainingManYen < 0 && r.remainingManYen < oldRows.get(key(r.teamId, r.season)).remainingManYen)) fail('赤字年度の追加余力を悪化させる取引です。');
  return { state: { ...after, transactions: [...after.transactions, { id: c.id, signature }] }, rows, replayed: false };
}

export function quoteAnnualTransaction(state, command) {
  try { const r = candidate(state, command); return { ok: true, rows: r.rows, replayed: r.replayed }; }
  catch (error) { return { ok: false, error: error.message }; }
}
export function applyAnnualTransaction(state, command) {
  try { return { ok: true, ...candidate(state, command) }; }
  catch (error) { return { ok: false, state, error: error.message }; }
}
