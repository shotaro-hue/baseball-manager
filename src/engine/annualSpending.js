import { activeRenewalPlans } from './renewalPlanning';
import { employmentContractId } from './seasonContract';
import { createContractLedger, applyContractLedgerAction, contractLiabilityRows,
  isContractLedgerExtension } from './contractLedger';
import { parseContractDate } from './contractCalendar';
import { acquisitionOfferMetadata, acquisitionAnswerMetadata } from './acquisitionMarket';
import { requiresFaCompensation, faCashCompensationManYen, faCashCompensationCosts, prepareFaCompensations } from './faCompensation';

// GM-01 foundation only: permission is distinct from revenue/cash and team.budget.
const fail = message => { throw new Error(message || '年度別の支出許可・留保を確認してください。'); };
const id = value => (typeof value === 'string' && value.trim().length > 0) || (Number.isSafeInteger(value) && value >= 0);
const year = value => Number.isInteger(value) && value >= 1 && value <= 9999;
const money = value => Number.isSafeInteger(value) && value >= 0;
const keyFor = (teamId, season) => JSON.stringify([teamId, season]);
const numeric = value => {
  if (value < -BigInt(Number.MAX_SAFE_INTEGER) || value > BigInt(Number.MAX_SAFE_INTEGER)) fail('金額の合計が安全な範囲を超えています。');
  return Number(value);
};
const sorted = list => list.map(value => JSON.stringify(value)).sort().join('\n');
const isFaCompensationCostId = value => {
  try { const parts = JSON.parse(value); return Array.isArray(parts) && parts[0] === 'fa-compensation'; }
  catch { return false; }
};

function normalizedProposal(input) {
  if (input?.type !== 'sign') fail('留保する契約の種類を確認してください。');
  const record = applyContractLedgerAction(createContractLedger(), input).records[0];
  return { id: record.actionId, type: 'sign', teamId: record.initialTeamId,
    effectiveDate: record.effectiveDate, contract: record.contract, ...acquisitionOfferMetadata(input) };
}
const proposalSignature = proposal => JSON.stringify(normalizedProposal(proposal));
const matchingPurpose = (kind, proposal) => kind === 'renewal'
  ? proposal.contract.purpose === 'renewal' : ['offer', 'rookie'].includes(kind) && proposal.contract.purpose === 'acquisition';
const resolutionFor = (hold, resolution, acceptedProposal, answeredDate) => ({ kind: hold.kind,
  proposal: normalizedProposal(hold.proposal), resolution,
  ...(acceptedProposal ? { acceptedProposal } : {}),
  ...acquisitionAnswerMetadata(hold.proposal, resolution, answeredDate, acceptedProposal ?? hold.proposal) });
// Keep the submitted offer immutable. Only an FA acquisition's actual start
// date may advance; ledger normalization enforces its start year and deadline.
function delayedOfferProposal(hold, input) {
  const original = normalizedProposal(hold.proposal), accepted = normalizedProposal(input);
  if (hold.kind !== 'offer' || original.contract.purpose !== 'acquisition'
    || accepted.effectiveDate <= original.effectiveDate
    || proposalSignature({ ...original, effectiveDate: accepted.effectiveDate }) !== proposalSignature(accepted))
    fail('後日受諾ではFAの効力日だけを同一年度内で後ろへ進められます。');
  return accepted;
}
const overlaps = (a, b) => a.contract.playerId === b.contract.playerId
  && a.effectiveDate < `${String(b.contract.endSeason).padStart(4, '0')}-12-01`
  && b.effectiveDate < `${String(a.contract.endSeason).padStart(4, '0')}-12-01`;

function prepare(plan) {
  if (!plan || plan.version !== 1 || !year(plan.budgetSeason) || !Array.isArray(plan.authorizations)
    || !Array.isArray(plan.reservations) || !Array.isArray(plan.resolvedReservations) || !Array.isArray(plan.oneOffCosts)) fail();
  const liabilities = contractLiabilityRows(plan.ledger);
  if (plan.budgetSeason <= plan.ledger.closedThroughSeason) fail('閉じた年度の予算では取引できません。');
  const byYear = new Map(), authorizations = [];
  for (const authorization of plan.authorizations) {
    if (!authorization || !id(authorization.teamId) || !year(authorization.season)
      || !money(authorization.approvedManYen) || !money(authorization.minimumRosterReserveManYen)) fail();
    const key = keyFor(authorization.teamId, authorization.season);
    if (byYear.has(key)) fail('同じ球団・年度の許可額が重複しています。');
    byYear.set(key, { teamId: authorization.teamId, season: authorization.season,
      approvedManYen: authorization.approvedManYen, minimumRosterReserveManYen: authorization.minimumRosterReserveManYen,
      salary: 0n, guarantee: 0n, oneOff: 0n, reserved: 0n, staff: 0n, planned: 0n, tokens: [] });
    authorizations.push([authorization.teamId, authorization.season, authorization.approvedManYen]);
  }
  const target = (teamId, season) => {
    if (season < plan.budgetSeason) return null;
    const row = byYear.get(keyFor(teamId, season));
    if (!row) fail('契約の全対象年度に支出許可額が必要です。');
    return row;
  };
  for (const cost of liabilities) {
    const row = target(cost.teamId, cost.season); if (!row) continue;
    row[cost.kind] += BigInt(cost.amountManYen);
    row.tokens.push(['contract', cost.contractId, cost.playerId, cost.kind, cost.amountManYen]);
  }
  const resolvedIds = new Set(), resolutions = [];
  const appliedIds = new Set(plan.ledger.records.flatMap(r => [r.actionId, ...r.changes.map(a => a.id)]));
  for (const resolved of plan.resolvedReservations) {
    if (!resolved || !['cancelled', 'replaced', 'accepted', 'lost', 'rejected'].includes(resolved.resolution)) fail('オファーの解決履歴を確認してください。');
    const proposal = normalizedProposal(resolved.proposal);
    if (!matchingPurpose(resolved.kind, proposal) || resolvedIds.has(proposal.id)
      || (proposal.marketEntry && resolved.kind !== 'offer') || (resolved.resolution === 'rejected' && resolved.kind !== 'offer')) fail('オファーの解決履歴が重複または無効です。');
    resolvedIds.add(proposal.id);
    const hasAccepted = Object.hasOwn(resolved, 'acceptedProposal');
    if (hasAccepted && resolved.resolution !== 'accepted') fail('未受諾の履歴に受諾条件を記録できません。');
    const accepted = hasAccepted ? delayedOfferProposal(resolved, resolved.acceptedProposal) : proposal;
    if (resolved.resolution === 'accepted') {
      const record = plan.ledger.records.find(r => r.actionId === proposal.id);
      if (!record || proposalSignature({ id: record.actionId, type: 'sign', teamId: record.initialTeamId,
        effectiveDate: record.effectiveDate, contract: record.contract, ...acquisitionOfferMetadata(accepted) }) !== proposalSignature(accepted)) fail('受諾履歴と確定契約が一致しません。');
    } else if (appliedIds.has(proposal.id)) fail('解決済みオファーの取引IDを再利用できません。');
    resolutions.push(resolutionFor({ kind: resolved.kind, proposal }, resolved.resolution, hasAccepted ? accepted : undefined, resolved.answeredDate));
  }
  const compensation = prepareFaCompensations(plan, resolutions);
  for (const obligation of compensation.obligations) {
    const p = obligation.proposal, row = target(p.teamId, p.contract.startSeason);
    target(p.marketEntry.originTeamId, p.contract.startSeason);
    if (row) {
      if (obligation.record.resolution === 'pending') row.reserved += BigInt(obligation.amountManYen);
      // Pending→paid is the same accepted obligation, not fresh spending.
      row.tokens.push(['fa-obligation', p.id, obligation.amountManYen]);
    }
  }
  const holdIds = new Set(), heldContracts = new Set(), reservations = [];
  for (const hold of plan.reservations) {
    if (!hold || !['renewal', 'offer', 'rookie'].includes(hold.kind)) fail();
    const proposal = normalizedProposal(hold.proposal);
    if (!matchingPurpose(hold.kind, proposal) || (proposal.marketEntry && hold.kind !== 'offer')) fail('留保と契約の目的が一致しません。');
    if (holdIds.has(proposal.id) || resolvedIds.has(proposal.id) || heldContracts.has(proposal.contract.contractId)) fail('契約の留保が重複または解決済みです。');
    holdIds.add(proposal.id); heldContracts.add(proposal.contract.contractId);
    if (parseContractDate(proposal.effectiveDate).year < plan.budgetSeason) fail('過去年度のオファーを留保できません。');
    if (plan.ledger.records.some(r => employmentContractId(r.contract) === proposal.contract.contractId)) fail('確定済み契約を再び留保できません。');
    // Validate current ownership/overlap and closed years without committing it.
    applyContractLedgerAction(plan.ledger, proposal);
    const projected = applyContractLedgerAction(createContractLedger(), proposal);
    for (const cost of contractLiabilityRows(projected)) {
      const row = target(cost.teamId, cost.season); if (!row) continue;
      row.reserved += BigInt(cost.amountManYen);
      row.tokens.push(['hold', hold.kind, proposal.id, cost.contractId, cost.amountManYen]);
    }
    if (requiresFaCompensation(proposal) && proposal.marketEntry.compensationBasis) {
      const amount = faCashCompensationManYen(proposal), row = target(proposal.teamId, proposal.contract.startSeason);
      target(proposal.marketEntry.originTeamId, proposal.contract.startSeason);
      if (row) { row.reserved += BigInt(amount); row.tokens.push(['fa-bid-compensation', proposal.id, amount]); }
    }
    reservations.push([hold.kind, proposal]);
  }
  for (const p of activeRenewalPlans(plan)) {
    const row = target(p.teamId, p.season); if (!row) continue;
    row.planned += BigInt(p.amountManYen);
    row.tokens.push(['renewal-plan', p.playerId, p.sourceContractId, p.amountManYen]);
  }
  const staffIds = new Set(), staffRoles = new Set(), staffCosts = [];
  if (plan.staffContracts !== undefined && !Array.isArray(plan.staffContracts)) fail('スタッフ年度契約を確認してください。');
  for (const c of plan.staffContracts ?? []) {
    if (!c || !id(c.id) || !id(c.teamId) || !id(c.role) || !year(c.season) || !money(c.annualSalaryManYen)) fail('スタッフ年度費用が不正です。');
    const identity = JSON.stringify([String(c.id), c.season]), role = JSON.stringify([c.teamId, c.season, c.role]);
    if (staffIds.has(identity) || staffRoles.has(role)) fail('スタッフの年度担当・費用が重複しています。');
    staffIds.add(identity); staffRoles.add(role);
    const token = ['staff', c.id, c.teamId, c.season, c.role, c.annualSalaryManYen]; staffCosts.push(token);
    const row = target(c.teamId, c.season); if (!row) continue;
    row.staff += BigInt(c.annualSalaryManYen); row.tokens.push(token);
  }
  const expenseIds = new Set(), faExpenseIds = new Set(), expenses = [];
  for (const expense of plan.oneOffCosts) {
    if (!expense || !id(expense.id) || !id(expense.teamId) || !year(expense.season)
      || !['coach', 'scouting', 'stadium', 'trade', 'fa-compensation'].includes(expense.kind)
      || !Number.isSafeInteger(expense.amountManYen) || (!['trade', 'fa-compensation'].includes(expense.kind) && expense.amountManYen < 0)
      || expenseIds.has(expense.id)) fail('一時費用が未記録・不正・重複しています。');
    if (expense.kind === 'coach' && (plan.staffContracts ?? []).some(c => c.teamId === expense.teamId && c.season === expense.season)) fail('年度スタッフ費と旧一時コーチ費を二重計上できません。');
    expenseIds.add(expense.id);
    const faCost = expense.kind === 'fa-compensation';
    if (!faCost && (Object.hasOwn(expense, 'proposalId') || isFaCompensationCostId(expense.id)))
      fail('FA補償の識別情報を別の費目に使うことはできません。');
    if (faCost) {
      const expected = compensation.costs.find(c => c.id === expense.id);
      if (!expected || Object.keys(expense).length !== Object.keys(expected).length
        || Object.entries(expected).some(([k, v]) => expense[k] !== v)) fail('FA補償の受諾履歴と両側精算が一致しません。');
      faExpenseIds.add(expense.id);
    }
    const token = [expense.id, expense.teamId, expense.season, expense.kind, expense.amountManYen,
      ...(faCost ? [expense.proposalId] : [])];
    expenses.push(token);
    const row = target(expense.teamId, expense.season); if (!row) continue;
    row.oneOff += BigInt(expense.amountManYen);
    if (!faCost || expense.amountManYen < 0) row.tokens.push(['expense', ...token]);
  }
  if (compensation.costs.some(cost => !faExpenseIds.has(cost.id))) fail('FA補償の支払・受取の両行が必要です。');
  const fingerprints = new Map(), tokenSets = new Map(), contractTotals = new Map(), rows = [];
  for (const [key, row] of byYear) {
    if (row.season < plan.budgetSeason) continue;
    const tokens = [...row.tokens, ['minimum-roster', row.minimumRosterReserveManYen]];
    fingerprints.set(key, sorted(tokens));
    tokenSets.set(key, new Set(tokens.filter(token => token[0] !== 'contract' && token[0] !== 'renewal-plan'
      && !(token[0] === 'expense' && token[4] === 'fa-compensation' && token[5] < 0)).map(token => JSON.stringify(token))));
    // Approval follows each existing obligation, independent of salary/guarantee
    // classification. Keep the detailed tokens above for quoting and change detection.
    const totals = new Map();
    for (const token of row.tokens) if (token[0] === 'contract') {
      const contractId = token[1];
      totals.set(contractId, (totals.get(contractId) ?? 0n) + BigInt(token[4]));
    }
    contractTotals.set(key, totals);
    rows.push({ teamId: row.teamId, season: row.season, approvedManYen: row.approvedManYen,
      salaryManYen: numeric(row.salary), guaranteeManYen: numeric(row.guarantee), oneOffManYen: numeric(row.oneOff),
      reservedManYen: numeric(row.reserved), staffManYen: numeric(row.staff), renewalPlanReserveManYen: numeric(row.planned), minimumRosterReserveManYen: row.minimumRosterReserveManYen,
      remainingManYen: numeric(BigInt(row.approvedManYen) - row.salary - row.guarantee - row.oneOff - row.reserved - row.staff - row.planned - BigInt(row.minimumRosterReserveManYen)) });
  }
  const historicalFloors = sorted(plan.authorizations.filter(a => a.season < plan.budgetSeason)
    .map(a => [a.teamId, a.season, a.minimumRosterReserveManYen]));
  return { rows, fingerprints, tokenSets, contractTotals, staffCosts, authorizations: sorted(authorizations), historicalFloors,
    reservations: sorted(reservations), resolutions, expenses, faCompensations: compensation.records };
}

export function quoteAnnualSpendingPlan(plan) { return prepare(plan).rows; }

function newLedgerActions(before, after) {
  const result = [];
  for (const record of after.records) {
    const old = before.records.find(r => employmentContractId(r.contract) === employmentContractId(record.contract));
    if (!old) result.push({ type: 'sign', effectiveDate: record.effectiveDate });
    result.push(...record.changes.slice(old?.changes.length ?? 0));
  }
  return result;
}

export function assessAnnualSpendingChange(before, after, { mode = 'spend' } = {}) {
  const a = prepare(before), b = prepare(after);
  if (!['spend', 'cashless-trade'].includes(mode) || before.budgetSeason !== after.budgetSeason
    || a.authorizations !== b.authorizations || a.historicalFloors !== b.historicalFloors
    || !isContractLedgerExtension(before.ledger, after.ledger)) fail('支出審査で既存の許可額や契約履歴を書き換えることはできません。');
  if (sorted(before.renewalPlans ?? []) !== sorted(after.renewalPlans ?? [])) fail('通常取引で未更改計画の根拠を変更できません。');
  if (sorted(a.staffCosts) !== sorted(b.staffCosts)) fail('スタッフ年度契約の変更は専用処理が必要です。');
  const actions = newLedgerActions(before.ledger, after.ledger);
  if (actions.some(action => parseContractDate(action.effectiveDate).year < before.budgetSeason)) fail('過去年度の取引を追加できません。');
  const nextResolved = new Map(b.resolutions.map(r => [r.proposal.id, r]));
  for (const old of a.resolutions) if (JSON.stringify(nextResolved.get(old.proposal.id)) !== JSON.stringify(old)) fail('解決済みオファーの履歴を消去・変更できません。');
  for (const old of before.reservations) {
    const next = after.reservations.find(r => r.proposal.id === old.proposal.id) ?? nextResolved.get(old.proposal.id);
    if (!next || next.kind !== old.kind || proposalSignature(next.proposal) !== proposalSignature(old.proposal)) fail('既存オファーの識別情報を消去・変更できません。');
  }
  const nextCompensations = new Map(b.faCompensations.map(r => [r.proposalId, r]));
  for (const old of a.faCompensations) {
    const next = nextCompensations.get(old.proposalId);
    if (!next || (old.resolution !== 'pending' && JSON.stringify(old) !== JSON.stringify(next)))
      fail('受諾済みFA補償の履歴を消去・変更できません。');
  }
  const oldExpenses = new Map(a.expenses.map(expense => [expense[0], expense]));
  const nextExpenses = new Map(b.expenses.map(expense => [expense[0], expense]));
  for (const [id, old] of oldExpenses) if (JSON.stringify(nextExpenses.get(id)) !== JSON.stringify(old)) fail('確定した費用を取り消すことはできません。');
  const cashBySeason = new Map();
  for (const [id, next] of nextExpenses) if (!oldExpenses.has(id)) {
    if (next[2] < before.budgetSeason) fail('過去年度の費用を追加できません。');
    if (next[3] === 'trade') cashBySeason.set(next[2], (cashBySeason.get(next[2]) ?? 0n) + BigInt(next[4]));
  }
  if ([...cashBySeason.values()].some(amount => amount !== 0n)) fail('金銭トレードは同じ年度に両球団の支払・受取を記録してください。');
  if (mode === 'cashless-trade' && (actions.some(action => action.type !== 'transfer')
    || sorted(a.faCompensations) !== sorted(b.faCompensations)
    || a.reservations !== b.reservations || sorted(a.resolutions) !== sorted(b.resolutions) || sorted(a.expenses) !== sorted(b.expenses)
    || before.ledger.closedThroughSeason !== after.ledger.closedThroughSeason)) fail('赤字時の例外は無金銭の契約移管だけに使えます。');
  if (mode === 'cashless-trade') {
    const senders = new Set(actions.map(action => action.teamId));
    const receivers = new Set(actions.map(action => action.toTeamId));
    if (senders.size !== receivers.size || [...senders].some(teamId => !receivers.has(teamId))) {
      fail('赤字時の例外は各球団が既存契約を出し合う無金銭交換だけに使えます。');
    }
  }
  // Attribute new raises to the actual payer/year, even when a simultaneous
  // termination hides the increase in the net annual amount. Removing only
  // new raise boundaries leaves ownership, earned periods and settlements intact.
  const increaseIds = new Set(actions.filter(action => ['increase', 'convert-to-controlled'].includes(action.type)).map(action => action.id));
  const withoutRaises = increaseIds.size ? prepare({ ...after, ledger: { ...after.ledger,
    records: after.ledger.records.map(record => ({ ...record,
      changes: record.changes.filter(action => !increaseIds.has(action.id)) })) } }) : b;
  // Restore only the estimate that a cancelled hold previously displaced.
  // Use the OLD ledger: conversion/other changes cannot borrow this exception
  // to introduce a higher future planning floor while already over budget.
  const cancelled = new Set(before.reservations.filter(h => h.kind === 'renewal'
    && nextResolved.get(h.proposal.id)?.resolution === 'cancelled').map(h => h.proposal.id));
  const restoredPlans = new Map();
  if (cancelled.size) for (const p of activeRenewalPlans({ ...before,
    reservations: before.reservations.filter(h => !cancelled.has(h.proposal.id)) })) {
    const key = keyFor(p.teamId, p.season);
    restoredPlans.set(key, (restoredPlans.get(key) ?? 0n) + BigInt(p.amountManYen));
  }
  const oldRows = new Map(a.rows.map(row => [keyFor(row.teamId, row.season), row]));
  const rows = b.rows.map(row => {
    const key = keyFor(row.teamId, row.season), old = oldRows.get(key);
    const newRaiseSpending = [...b.contractTotals.get(key)].some(([contractId, amount]) =>
      amount > (withoutRaises.contractTotals.get(key).get(contractId) ?? 0n));
    const affected = newRaiseSpending || a.fingerprints.get(key) !== b.fingerprints.get(key);
    const oldContracts = a.contractTotals.get(key);
    // Never net a new contract/raise against an existing obligation's reduction.
    const onlyRemovals = !newRaiseSpending && [...b.tokenSets.get(key)].every(token => a.tokenSets.get(key).has(token))
      && [...b.contractTotals.get(key)].every(([contractId, amount]) => oldContracts.has(contractId)
        && amount <= oldContracts.get(contractId));
    return { ...row, beforeRemainingManYen: old.remainingManYen, affected,
      onlyRemovals,
      planRestoredManYen: Math.max(0, numeric(restoredPlans.get(key) ?? 0n) - old.renewalPlanReserveManYen),
      changeManYen: numeric(BigInt(row.remainingManYen) - BigInt(old.remainingManYen)) };
  });
  const violations = rows.filter(row => row.affected
    && (mode === 'cashless-trade' ? row.changeManYen < 0
      : row.remainingManYen < 0 && (!row.onlyRemovals || row.changeManYen + row.planRestoredManYen < 0)));
  return { ok: violations.length === 0, violations, rows };
}

export function reserveContractProposal(plan, { kind, proposal: input, replaceId } = {}) {
  prepare(plan);
  const proposal = normalizedProposal(input), old = plan.reservations.find(r => r.proposal.id === proposal.id);
  const resolved = plan.resolvedReservations.find(r => r.proposal.id === proposal.id);
  if (resolved) {
    if (resolved.kind !== kind || proposalSignature(resolved.proposal) !== proposalSignature(proposal)) fail('解決済みIDの条件が変わっています。');
    return plan;
  }
  if (old) {
    if (old.kind !== kind || proposalSignature(old.proposal) !== proposalSignature(proposal)) fail('同じオファーIDの条件が変わっています。');
    return plan;
  }
  if (replaceId !== undefined && (!id(replaceId) || !plan.reservations.some(r => r.proposal.id === replaceId))) fail('置き換える留保が見つかりません。');
  const replaced = plan.reservations.find(r => r.proposal.id === replaceId);
  const reservations = [...plan.reservations.filter(r => replaceId === undefined || r.proposal.id !== replaceId), { kind, proposal }];
  const next = { ...plan, reservations, resolvedReservations: replaced
    ? [...plan.resolvedReservations, resolutionFor(replaced, 'replaced')] : plan.resolvedReservations };
  if (!assessAnnualSpendingChange(plan, next).ok) fail('全対象年度の追加余力が不足しています。');
  return next;
}

export function cancelContractReservation(plan, reservationId, { resolution = 'cancelled', answeredDate } = {}) {
  prepare(plan);
  if (!id(reservationId) || !['cancelled', 'rejected'].includes(resolution)) fail();
  const held = plan.reservations.find(r => r.proposal.id === reservationId);
  const reservations = plan.reservations.filter(r => r.proposal.id !== reservationId);
  if (!held) {
    const resolved = plan.resolvedReservations.find(r => r.proposal.id === reservationId);
    if (resolved?.proposal.marketEntry && (resolved.resolution !== resolution || resolved.answeredDate !== answeredDate))
      fail('確定済みの回答を変更できません。');
    return plan;
  }
  const next = { ...plan, reservations, resolvedReservations: [...plan.resolvedReservations,
    resolutionFor(held, resolution, undefined, answeredDate)] };
  prepare(next);
  return next;
}

export function commitContractReservation(plan, input, { effectiveDate, answeredDate } = {}) {
  prepare(plan);
  const proposal = normalizedProposal(input), held = plan.reservations.find(r => r.proposal.id === proposal.id);
  if (!held) {
    const resolved = plan.resolvedReservations.find(r => r.proposal.id === proposal.id);
    if (resolved && (resolved.resolution !== 'accepted' || proposalSignature(resolved.proposal) !== proposalSignature(proposal))) fail('解決済みオファーを受諾できません。');
    const accepted = resolved?.acceptedProposal ?? proposal;
    if (proposal.marketEntry && (!resolved || resolved.answeredDate !== answeredDate)) fail('確定済みの回答日を変更できません。');
    if (effectiveDate !== undefined && effectiveDate !== accepted.effectiveDate) fail('確定済みの受諾日を変更できません。');
    if (applyContractLedgerAction(plan.ledger, accepted) === plan.ledger) return plan;
    fail('受諾対象の留保が見つかりません。');
  }
  if (proposalSignature(held.proposal) !== proposalSignature(proposal)) fail('留保時の契約条件が変わっています。');
  const accepted = effectiveDate !== undefined && effectiveDate !== proposal.effectiveDate
    ? delayedOfferProposal(held, { ...proposal, effectiveDate }) : proposal;
  const compensationAmount = faCashCompensationManYen(proposal);
  const losing = plan.reservations.filter(r => r.proposal.id !== proposal.id && overlaps(accepted, r.proposal));
  const resolvedIds = new Set([proposal.id, ...losing.map(r => r.proposal.id)]);
  const next = { ...plan, ledger: applyContractLedgerAction(plan.ledger, accepted),
    ...(compensationAmount > 0 ? { faCompensations: [...(plan.faCompensations ?? []), { proposalId: proposal.id, resolution: 'pending' }] } : {}),
    reservations: plan.reservations.filter(r => !resolvedIds.has(r.proposal.id)),
    resolvedReservations: [...plan.resolvedReservations,
      resolutionFor(held, 'accepted', accepted === proposal ? undefined : accepted, answeredDate),
      ...losing.map(r => resolutionFor(r, 'lost', undefined, r.proposal.marketEntry ? answeredDate : undefined))] };
  if (!assessAnnualSpendingChange(plan, next).ok) fail('受諾時点の年度別追加余力が不足しています。');
  return next;
}


export function settleFaCashCompensation(plan, { proposalId, teamId, chosenDate } = {}) {
  const prepared = prepare(plan);
  const record = prepared.faCompensations.find(r => r.proposalId === proposalId);
  if (!record) fail('精算する受諾済みFA補償が見つかりません。');
  const resolved = prepared.resolutions.find(r => r.proposal.id === proposalId);
  const p = resolved.proposal;
  if (teamId !== p.marketEntry.originTeamId) fail('FA補償の方式は旧球団が選択します。');
  if (record.resolution === 'cash-only') {
    if (record.teamId !== teamId || record.chosenDate !== chosenDate) fail('精算済みのFA補償を変更できません。');
    return plan;
  }
  if (record.resolution !== 'pending') fail('精算済みのFA補償を変更できません。');
  const next = { ...plan, faCompensations: prepared.faCompensations.map(r => r.proposalId === proposalId
    ? { proposalId, resolution: 'cash-only', teamId, chosenDate } : r),
    oneOffCosts: [...plan.oneOffCosts, ...faCashCompensationCosts(p)] };
  if (!assessAnnualSpendingChange(plan, next).ok) fail('FA補償の精算で新たな支出を生じさせることはできません。');
  return next;
}

// Salary/ownership are composed by the common personnel transaction. This
// function owns only the accepted obligation and both sides of reduced cash.
export function settleFaPersonnelCompensation(plan, { proposalId, teamId, chosenDate, playerId, transactionId } = {}) {
  const prepared = prepare(plan), record = prepared.faCompensations.find(r => r.proposalId === proposalId);
  const p = prepared.resolutions.find(r => r.proposal.id === proposalId)?.proposal;
  if (!p || record?.resolution !== 'pending' || teamId !== p.marketEntry.originTeamId)
    fail('旧球団が選ぶ未精算の人的補償を確認してください。');
  const next = { ...plan, faCompensations: prepared.faCompensations.map(r => r.proposalId === proposalId
    ? { proposalId, resolution: 'player-and-cash', teamId, chosenDate, playerId, transactionId } : r),
    oneOffCosts: [...plan.oneOffCosts, ...faCashCompensationCosts(p, 'player-and-cash')] };
  prepare(next);
  return next;
}
