import { createContractLedger, applyContractLedgerAction, contractLiabilityRows,
  isContractLedgerExtension } from './contractLedger';
import { parseContractDate } from './contractCalendar';

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

function normalizedProposal(input) {
  if (input?.type !== 'sign') fail('留保する契約の種類を確認してください。');
  const record = applyContractLedgerAction(createContractLedger(), input).records[0];
  return { id: record.actionId, type: 'sign', teamId: record.initialTeamId,
    effectiveDate: record.effectiveDate, contract: record.contract };
}
const proposalSignature = proposal => JSON.stringify(normalizedProposal(proposal));
const matchingPurpose = (kind, proposal) => kind === 'renewal'
  ? proposal.contract.purpose === 'renewal' : ['offer', 'rookie'].includes(kind) && proposal.contract.purpose === 'acquisition';
const resolutionFor = (hold, resolution) => ({ kind: hold.kind, proposal: normalizedProposal(hold.proposal), resolution });
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
      salary: 0n, guarantee: 0n, oneOff: 0n, reserved: 0n, tokens: [] });
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
    if (!resolved || !['cancelled', 'replaced', 'accepted', 'lost'].includes(resolved.resolution)) fail('オファーの解決履歴を確認してください。');
    const proposal = normalizedProposal(resolved.proposal);
    if (!matchingPurpose(resolved.kind, proposal) || resolvedIds.has(proposal.id)) fail('オファーの解決履歴が重複または無効です。');
    resolvedIds.add(proposal.id);
    if (resolved.resolution === 'accepted') {
      const record = plan.ledger.records.find(r => r.actionId === proposal.id);
      if (!record || proposalSignature({ id: record.actionId, type: 'sign', teamId: record.initialTeamId,
        effectiveDate: record.effectiveDate, contract: record.contract }) !== proposalSignature(proposal)) fail('受諾履歴と確定契約が一致しません。');
    } else if (appliedIds.has(proposal.id)) fail('解決済みオファーの取引IDを再利用できません。');
    resolutions.push({ kind: resolved.kind, proposal, resolution: resolved.resolution });
  }
  const holdIds = new Set(), heldContracts = new Set(), reservations = [];
  for (const hold of plan.reservations) {
    if (!hold || !['renewal', 'offer', 'rookie'].includes(hold.kind)) fail();
    const proposal = normalizedProposal(hold.proposal);
    if (!matchingPurpose(hold.kind, proposal)) fail('留保と契約の目的が一致しません。');
    if (holdIds.has(proposal.id) || resolvedIds.has(proposal.id) || heldContracts.has(proposal.contract.contractId)) fail('契約の留保が重複または解決済みです。');
    holdIds.add(proposal.id); heldContracts.add(proposal.contract.contractId);
    if (parseContractDate(proposal.effectiveDate).year < plan.budgetSeason) fail('過去年度のオファーを留保できません。');
    if (plan.ledger.records.some(r => r.contract.contractId === proposal.contract.contractId)) fail('確定済み契約を再び留保できません。');
    // Validate current ownership/overlap and closed years without committing it.
    applyContractLedgerAction(plan.ledger, proposal);
    const projected = applyContractLedgerAction(createContractLedger(), proposal);
    for (const cost of contractLiabilityRows(projected)) {
      const row = target(cost.teamId, cost.season); if (!row) continue;
      row.reserved += BigInt(cost.amountManYen);
      row.tokens.push(['hold', hold.kind, proposal.id, cost.contractId, cost.amountManYen]);
    }
    reservations.push([hold.kind, proposal]);
  }
  const expenseIds = new Set(), expenses = [];
  for (const expense of plan.oneOffCosts) {
    if (!expense || !id(expense.id) || !id(expense.teamId) || !year(expense.season)
      || !['coach', 'scouting', 'stadium', 'trade'].includes(expense.kind)
      || !Number.isSafeInteger(expense.amountManYen) || (expense.kind !== 'trade' && expense.amountManYen < 0)
      || expenseIds.has(expense.id)) fail('一時費用が未記録・不正・重複しています。');
    expenseIds.add(expense.id);
    const token = [expense.id, expense.teamId, expense.season, expense.kind, expense.amountManYen];
    expenses.push(token);
    const row = target(expense.teamId, expense.season); if (!row) continue;
    row.oneOff += BigInt(expense.amountManYen); row.tokens.push(['expense', ...token]);
  }
  const fingerprints = new Map(), tokenSets = new Map(), rows = [];
  for (const [key, row] of byYear) {
    if (row.season < plan.budgetSeason) continue;
    const tokens = [...row.tokens, ['minimum-roster', row.minimumRosterReserveManYen]];
    fingerprints.set(key, sorted(tokens)); tokenSets.set(key, new Set(tokens.map(token => JSON.stringify(token))));
    rows.push({ teamId: row.teamId, season: row.season, approvedManYen: row.approvedManYen,
      salaryManYen: numeric(row.salary), guaranteeManYen: numeric(row.guarantee), oneOffManYen: numeric(row.oneOff),
      reservedManYen: numeric(row.reserved), minimumRosterReserveManYen: row.minimumRosterReserveManYen,
      remainingManYen: numeric(BigInt(row.approvedManYen) - row.salary - row.guarantee - row.oneOff - row.reserved - BigInt(row.minimumRosterReserveManYen)) });
  }
  const historicalFloors = sorted(plan.authorizations.filter(a => a.season < plan.budgetSeason)
    .map(a => [a.teamId, a.season, a.minimumRosterReserveManYen]));
  return { rows, fingerprints, tokenSets, authorizations: sorted(authorizations), historicalFloors,
    reservations: sorted(reservations), resolutions, expenses };
}

export function quoteAnnualSpendingPlan(plan) { return prepare(plan).rows; }

function newLedgerActions(before, after) {
  const result = [];
  for (const record of after.records) {
    const old = before.records.find(r => r.contract.contractId === record.contract.contractId);
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
  const actions = newLedgerActions(before.ledger, after.ledger);
  if (actions.some(action => parseContractDate(action.effectiveDate).year < before.budgetSeason)) fail('過去年度の取引を追加できません。');
  const nextResolved = new Map(b.resolutions.map(r => [r.proposal.id, r]));
  for (const old of a.resolutions) if (JSON.stringify(nextResolved.get(old.proposal.id)) !== JSON.stringify(old)) fail('解決済みオファーの履歴を消去・変更できません。');
  for (const old of before.reservations) {
    const next = after.reservations.find(r => r.proposal.id === old.proposal.id) ?? nextResolved.get(old.proposal.id);
    if (!next || next.kind !== old.kind || proposalSignature(next.proposal) !== proposalSignature(old.proposal)) fail('既存オファーの識別情報を消去・変更できません。');
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
    || a.reservations !== b.reservations || sorted(a.resolutions) !== sorted(b.resolutions) || sorted(a.expenses) !== sorted(b.expenses)
    || before.ledger.closedThroughSeason !== after.ledger.closedThroughSeason)) fail('赤字時の例外は無金銭の契約移管だけに使えます。');
  const oldRows = new Map(a.rows.map(row => [keyFor(row.teamId, row.season), row]));
  const rows = b.rows.map(row => {
    const key = keyFor(row.teamId, row.season), old = oldRows.get(key);
    const affected = a.fingerprints.get(key) !== b.fingerprints.get(key);
    const onlyRemovals = [...b.tokenSets.get(key)].every(token => a.tokenSets.get(key).has(token));
    return { ...row, beforeRemainingManYen: old.remainingManYen, affected,
      onlyRemovals,
      changeManYen: numeric(BigInt(row.remainingManYen) - BigInt(old.remainingManYen)) };
  });
  const violations = rows.filter(row => row.affected && row.remainingManYen < 0
    && (mode === 'cashless-trade' ? row.remainingManYen < row.beforeRemainingManYen
      : !row.onlyRemovals || row.remainingManYen < row.beforeRemainingManYen));
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

export function cancelContractReservation(plan, reservationId) {
  prepare(plan);
  if (!id(reservationId)) fail();
  const held = plan.reservations.find(r => r.proposal.id === reservationId);
  const reservations = plan.reservations.filter(r => r.proposal.id !== reservationId);
  if (!held) return plan;
  const next = { ...plan, reservations, resolvedReservations: [...plan.resolvedReservations, resolutionFor(held, 'cancelled')] };
  prepare(next);
  return next;
}

export function commitContractReservation(plan, input) {
  prepare(plan);
  const proposal = normalizedProposal(input), held = plan.reservations.find(r => r.proposal.id === proposal.id);
  if (!held) {
    const resolved = plan.resolvedReservations.find(r => r.proposal.id === proposal.id);
    if (resolved && (resolved.resolution !== 'accepted' || proposalSignature(resolved.proposal) !== proposalSignature(proposal))) fail('解決済みオファーを受諾できません。');
    if (applyContractLedgerAction(plan.ledger, proposal) === plan.ledger) return plan;
    fail('受諾対象の留保が見つかりません。');
  }
  if (proposalSignature(held.proposal) !== proposalSignature(proposal)) fail('留保時の契約条件が変わっています。');
  const losing = plan.reservations.filter(r => r.proposal.id !== proposal.id && overlaps(proposal, r.proposal));
  const resolvedIds = new Set([proposal.id, ...losing.map(r => r.proposal.id)]);
  const next = { ...plan, ledger: applyContractLedgerAction(plan.ledger, proposal),
    reservations: plan.reservations.filter(r => !resolvedIds.has(r.proposal.id)),
    resolvedReservations: [...plan.resolvedReservations, resolutionFor(held, 'accepted'), ...losing.map(r => resolutionFor(r, 'lost'))] };
  if (!assessAnnualSpendingChange(plan, next).ok) fail('受諾時点の年度別追加余力が不足しています。');
  return next;
}
