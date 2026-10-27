import { MIN_SALARY_SHIHAKA, MAX_SHIHAKA_TOTAL } from '../constants';
import { createSeasonContract, contractSeasonsRemaining } from './seasonContract';
import { contractEmploymentAt, applyContractLedgerAction } from './contractLedger';
import { quoteAnnualSpendingPlan, assessAnnualSpendingChange, reserveContractProposal,
  commitContractReservation, cancelContractReservation } from './annualSpending';
import { parseContractDate, registrationDateAllowed } from './contractCalendar';
import { ownedPlayers } from './renewalRules';
import { evaluateRosterCapacity, isIkuseiPlayer } from './rosterCapacity';
import { marketRosterError, marketPlacement } from './marketRoster';
import { projectTradeRosters } from './tradeTransaction';

// GM-01C-1: explicit, opt-in engine state. Live hooks/save adoption are C-2/D.
const fail = message => { throw new Error(message); };
const validId = id => (typeof id === 'string' && id.trim()) || (Number.isSafeInteger(id) && id >= 0);
const key = (team, season) => JSON.stringify([team, season]);
const stable = value => JSON.stringify(value, (_, v) => v && !Array.isArray(v) && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
const yearStart = year => `${String(year).padStart(4, '0')}-02-01`;
const kinds = {
  'offer-fa': ['proposal'], 'accept-fa': ['proposalId'], 'cancel-fa': ['proposalId'],
  trade: ['fromId', 'toId', 'outgoingIds', 'incomingIds', 'cashManYen', 'mode'],
};
function commandFor(input) {
  if (!input || !validId(input.id) || !Object.hasOwn(kinds, input.type)
    || Object.keys(input).some(k => !['id', 'type', ...kinds[input.type]].includes(k))) fail('取引の種類・ID・入力項目を確認してください。');
  const c = { id: input.id, type: input.type };
  for (const field of kinds[c.type]) {
    if (!Object.hasOwn(input, field)) fail('取引の条件が未記録です。');
    c[field] = input[field];
  }
  if (c.type === 'offer-fa') {
    const p = c.proposal;
    if (!p || p.type !== 'sign' || !validId(p.id) || !validId(p.teamId)) fail('FAオファーを確認してください。');
    c.proposal = { id: p.id, type: 'sign', teamId: p.teamId, effectiveDate: p.effectiveDate, contract: createSeasonContract(p.contract) };
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
  if (date.year !== state.season || state.spending?.budgetSeason !== state.season
    || !['preseason', 'season'].includes(state.phase)) fail('取引年度・フェーズを確認してください。');
  const teams = new Map(), players = new Map(), owners = new Map(), receipts = new Set();
  const teamKeys = new Set(), playerKeys = new Set();
  for (const team of state.teams) {
    if (!validId(team.id) || teamKeys.has(String(team.id)) || !Array.isArray(team.players) || !Array.isArray(team.farm)) fail('球団名簿を確認してください。');
    teamKeys.add(String(team.id)); teams.set(team.id, team);
    for (const p of ownedPlayers(team)) {
      if (!validId(p?.id) || playerKeys.has(String(p.id))) fail('選手の所属が重複または無効です。');
      playerKeys.add(String(p.id)); players.set(p.id, p); owners.set(p.id, team.id);
    }
    const capacity = evaluateRosterCapacity(team, { ...state.draftContext, teams: state.teams });
    if (!capacity.ok || capacity.overBy) fail('支配下登録枠を確認してください。');
  }
  for (const p of state.faPool) {
    if (!validId(p?.id) || playerKeys.has(String(p.id))) fail('市場選手の所属が重複または無効です。');
    playerKeys.add(String(p.id)); players.set(p.id, p);
  }
  for (const p of state.draftContext.draftPool) {
    if (!validId(p?.id)) fail('新人選手IDを確認してください。');
    if (!players.has(p.id)) {
      if (playerKeys.has(String(p.id))) fail('新人選手IDの型が衝突しています。');
      playerKeys.add(String(p.id)); players.set(p.id, p);
    }
  }
  const employed = contractEmploymentAt(state.spending.ledger, state.date);
  if (employed.length !== owners.size || employed.some(e => owners.get(e.contract.playerId) !== e.teamId)) fail('名簿と有効な契約の所属が一致しません。');
  for (const record of state.spending.ledger.records) if (record.changes.some(c => c.effectiveDate > state.date)) fail('未来の取引を現在の名簿へ反映できません。');
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
  const authorizations = state.spending.authorizations.map(a => {
    if (a.season < state.season) return a;
    const required = requirements.get(key(a.teamId, a.season));
    if (required === undefined || !teams.has(a.teamId)) fail('全対象年度に球団の必要人数が必要です。');
    const date = a.season === state.season ? state.date : yearStart(a.season);
    const funded = new Set();
    const count = playerId => {
      const p = players.get(playerId); if (!p) fail('契約対象選手の名簿情報がありません。');
      if (!isIkuseiPlayer(p)) funded.add(playerId);
    };
    for (const e of contractEmploymentAt(state.spending.ledger, date)) if (e.teamId === a.teamId) count(e.contract.playerId);
    for (const h of state.spending.reservations) {
      const p = h.proposal;
      if (p.teamId === a.teamId && p.contract.startSeason <= a.season && p.contract.endSeason >= a.season) count(p.contract.playerId);
    }
    const capacity = evaluateRosterCapacity(teams.get(a.teamId), { ...state.draftContext, teams: state.teams });
    const unfundedPicks = a.season === state.season ? capacity.acceptedPicks.filter(p => !funded.has(p.id)).length : 0;
    return { ...a, minimumRosterReserveManYen: Math.max(unfundedPicks, required - funded.size, 0) * MIN_SALARY_SHIHAKA };
  });
  return { ...state, spending: { ...state.spending, authorizations } };
}

function faCandidate(state, c) {
  let p = c.proposal;
  if (c.type !== 'offer-fa') p = state.spending.reservations.find(h => h.proposal.id === c.proposalId && h.kind === 'offer')?.proposal;
  if (!p) fail('有効なFAオファーが見つかりません。');
  if (c.type === 'cancel-fa') return { ...state, spending: cancelContractReservation(state.spending, p.id) };
  if (state.spending.resolvedReservations.some(h => h.proposal.id === p.id)) fail('解決済みのFAオファーです。');
  if (c.type === 'offer-fa' && state.spending.reservations.some(h => h.proposal.id === p.id)) fail('提示済みのオファーIDです。');
  const team = state.teams.find(t => t.id === p.teamId), player = state.faPool.find(x => x.id === p.contract.playerId);
  if (!team || !player || isIkuseiPlayer(player) || player.isRetired || player._retireNow) fail('FA市場の対象選手を確認してください。');
  if (p.effectiveDate !== state.date || p.contract.signedSeason !== state.season || p.contract.agreementPhase !== state.phase
    || p.contract.purpose !== 'acquisition' || p.contract.termYears > 3 || p.contract.annualSalaryManYen < MIN_SALARY_SHIHAKA
    || !registrationDateAllowed(state.season, state.date)) fail('FAの効力日・年俸・契約期間・登録期限を確認してください。');
  const error = marketRosterError(team, player, state.teams, state.draftContext); if (error) fail(error);
  if (c.type === 'offer-fa') {
    // Derive the final vacancy floor before the ledger's admission check.
    const projected = withFloors({ ...state, spending: { ...state.spending, reservations: [...state.spending.reservations, { kind: 'offer', proposal: p }] } });
    return { ...state, spending: reserveContractProposal({ ...state.spending, authorizations: projected.spending.authorizations }, { kind: 'offer', proposal: p }) };
  }
  const spending = commitContractReservation(state.spending, p);
  const acquired = { ...player, isFA: false, salary: p.contract.annualSalaryManYen, contractId: p.contract.contractId,
    contractYears: p.contract.termYears, contractYearsLeft: contractSeasonsRemaining(p.contract, state.season), contractSignedYear: p.contract.signedSeason };
  const farm = acquired.injuryDaysLeft > 0 || acquired.registrationCooldownDays > 0 || marketPlacement(team, acquired).farm;
  const nextTeam = { ...team, players: [...team.players, ...(!farm ? [acquired] : [])], farm: [...team.farm, ...(farm ? [acquired] : [])] };
  return { ...state, spending, faPool: state.faPool.filter(x => x.id !== player.id), teams: state.teams.map(t => t.id === team.id ? nextTeam : t) };
}

function tradeCandidate(state, c) {
  if (!registrationDateAllowed(state.season, state.date) || (c.mode === 'cashless-trade' && c.cashManYen !== 0)) fail('移籍期限または無金銭例外の条件を確認してください。');
  const projected = projectTradeRosters(state.teams, { fromId: c.fromId, toId: c.toId,
    outgoing: c.outgoingIds.map(id => ({ id })), incoming: c.incomingIds.map(id => ({ id })) }, state.draftContext);
  if (!projected.ok) fail(projected.error);
  const employment = contractEmploymentAt(state.spending.ledger, state.date);
  let ledger = state.spending.ledger;
  for (const [ids, from, to] of [[c.outgoingIds, c.fromId, c.toId], [c.incomingIds, c.toId, c.fromId]]) for (const playerId of ids) {
    const e = employment.find(e => e.contract.playerId === playerId && e.teamId === from);
    if (!e) fail('移籍する選手の有効な契約が見つかりません。');
    ledger = applyContractLedgerAction(ledger, { id: key(c.id, ['transfer', playerId]), type: 'transfer', contractId: e.contract.contractId,
      teamId: from, toTeamId: to, effectiveDate: state.date });
  }
  const costs = c.cashManYen === 0 ? [] : [[c.fromId, c.cashManYen], [c.toId, -c.cashManYen]].map(([teamId, amountManYen]) => ({
    id: key(c.id, ['cash', teamId]), transactionId: c.id, teamId, season: state.season, kind: 'trade', amountManYen,
  }));
  const transferred = new Set([...c.outgoingIds, ...c.incomingIds]);
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
  return { ...state, teams, spending: { ...state.spending, ledger, oneOffCosts: [...state.spending.oneOffCosts, ...costs] } };
}

function candidate(input, command) {
  const c = commandFor(command), before = withFloors(input), signature = stable(c);
  const receipt = input.transactions.find(r => r.id === c.id);
  if (receipt) {
    if (receipt.signature !== signature) fail('同じ取引IDの条件が変わっています。');
    return { state: input, rows: quoteAnnualSpendingPlan(before.spending), replayed: true };
  }
  const after = withFloors(c.type === 'trade' ? tradeCandidate(before, c) : faCandidate(before, c));
  const mode = c.type === 'trade' ? c.mode : 'spend';
  // A derived floor restored by a losing/cancelled bid is not new spending.
  // Use final floors for admission; independently check actual headroom changes.
  const comparison = mode === 'cashless-trade' ? before.spending
    : { ...before.spending, authorizations: after.spending.authorizations };
  const assessment = assessAnnualSpendingChange(comparison, after.spending, { mode });
  if (!assessment.ok) fail('対象年度の追加余力が不足または悪化しています。');
  const oldRows = new Map(quoteAnnualSpendingPlan(before.spending).map(r => [key(r.teamId, r.season), r]));
  const rows = quoteAnnualSpendingPlan(after.spending);
  if (rows.some(r => r.remainingManYen < 0 && r.remainingManYen < oldRows.get(key(r.teamId, r.season)).remainingManYen)) fail('赤字年度の追加余力を悪化させる取引です。');
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
