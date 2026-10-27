import { createSeasonContract, validateSeasonContract } from './seasonContract';
import { parseContractDate, registrationDateAllowed } from './contractCalendar';
import { salaryForPeriodManYen } from './monthlyPayroll';

// Unconnected GM-01 foundation. Persist only original terms and transaction
// boundaries; payer intervals, salary schedules and annual totals are derived.
const fail = message => { throw new Error(message || '契約負担台帳を確認してください。'); };
const id = value => (typeof value === 'string' && value.trim().length > 0) || (Number.isSafeInteger(value) && value >= 0);
const money = value => Number.isSafeInteger(value) && value >= 0;
const yearDate = (year, suffix) => `${String(year).padStart(4, '0')}-${suffix}`;
const add = (a, b) => { const n = a + b; if (!Number.isSafeInteger(n) || n < 0) fail('給与負担の合計が不正です。'); return n; };

function normalize(action) {
  if (!action || !id(action.id) || !id(action.teamId)) fail();
  const d = parseContractDate(action.effectiveDate);
  const base = { id: action.id, type: action.type, teamId: action.teamId, effectiveDate: action.effectiveDate };
  if (action.type === 'sign') {
    validateSeasonContract(action.contract);
    const contract = createSeasonContract(action.contract);
    if (d.year !== contract.startSeason || d.month >= 12) fail('契約開始日と効力年度が一致しません。');
    if (contract.purpose === 'renewal') {
      if (action.effectiveDate !== yearDate(contract.startSeason, '02-01')) fail('更改は対象年度の2月1日から有効です。');
    } else if (!registrationDateAllowed(contract.startSeason, action.effectiveDate)) fail('新規登録期限を過ぎています。');
    return { ...base, contract };
  }
  if (!id(action.contractId)) fail();
  const next = { ...base, contractId: action.contractId };
  if (action.type === 'transfer') {
    if (!id(action.toTeamId) || action.toTeamId === action.teamId) fail();
    return { ...next, toTeamId: action.toTeamId };
  }
  if (action.type === 'increase') {
    if (!money(action.annualSalaryManYen)) fail();
    return { ...next, annualSalaryManYen: action.annualSalaryManYen };
  }
  if (action.type === 'end') {
    if (!['release', 'retirement', 'posting'].includes(action.reason) || !['retain', 'waive'].includes(action.settlement)) fail('終了理由と残債の合意が未確認です。');
    return { ...next, reason: action.reason, settlement: action.settlement };
  }
  fail('取引の種類が無効です。');
}

const opening = record => normalize({ id: record.actionId, type: 'sign', teamId: record.initialTeamId,
  effectiveDate: record.effectiveDate, contract: record.contract });
const signature = action => JSON.stringify(normalize(action));

function projectRecord(record) {
  if (!record || !Array.isArray(record.changes)) fail();
  const first = opening(record), c = first.contract, endDate = yearDate(c.endSeason, '12-01');
  const view = { contract: c, effectiveDate: first.effectiveDate, employmentEndDate: endDate,
    liabilityEndDate: endDate, lastDate: first.effectiveDate, ended: false,
    payers: [{ teamId: first.teamId, startDate: first.effectiveDate, endDate }],
    rates: [{ startDate: first.effectiveDate, annualSalaryManYen: c.annualSalaryManYen }] };
  for (const raw of record.changes) {
    const action = normalize(raw), date = action.effectiveDate, current = view.payers.at(-1);
    if (action.type === 'sign' || action.contractId !== c.contractId || view.ended
      || date < view.lastDate || date >= endDate || current.teamId !== action.teamId) fail('取引日または給与負担者が変わっています。');
    if (action.type === 'transfer' || action.type === 'increase') {
      if (!registrationDateAllowed(parseContractDate(date).year, date)) fail('登録・移籍期限を過ぎています。');
    }
    if (action.type === 'transfer') {
      if (date === current.startDate) view.payers[view.payers.length - 1] = { ...current, teamId: action.toTeamId };
      else view.payers.splice(view.payers.length - 1, 1, { ...current, endDate: date }, { teamId: action.toTeamId, startDate: date, endDate });
    } else if (action.type === 'increase') {
      const rate = view.rates.at(-1);
      if (action.annualSalaryManYen <= rate.annualSalaryManYen) fail('期中の変更で既存年俸を引き下げることはできません。');
      const next = { startDate: date, annualSalaryManYen: action.annualSalaryManYen };
      if (date === rate.startDate) view.rates[view.rates.length - 1] = next;
      else view.rates.push(next);
    } else {
      if (action.reason === 'release' && c.guaranteed && action.settlement !== 'retain') fail('保証契約の残債を球団都合で取り消すことはできません。');
      view.employmentEndDate = date;
      view.liabilityEndDate = action.settlement === 'waive' ? date : endDate;
      view.ended = true;
    }
    view.lastDate = date;
  }
  return view;
}

function rowsFor(view) {
  const c = view.contract, totals = new Map();
  for (let season = c.startSeason; season <= c.endSeason; season++) {
    for (const payer of view.payers) for (let i = 0; i < view.rates.length; i++) {
      const rate = view.rates[i], rateEnd = view.rates[i + 1]?.startDate ?? yearDate(c.endSeason, '12-01');
      for (const [kind, kindStart, kindEnd] of [
        ['salary', view.effectiveDate, view.employmentEndDate],
        ['guarantee', view.employmentEndDate, view.liabilityEndDate],
      ]) {
        const start = [payer.startDate, rate.startDate, kindStart, yearDate(season, '02-01')].sort().at(-1);
        const end = [payer.endDate, rateEnd, kindEnd, view.liabilityEndDate, yearDate(season, '12-01')].sort()[0];
        if (start >= end) continue;
        const amount = salaryForPeriodManYen(rate.annualSalaryManYen, season, start, end);
        const key = JSON.stringify([payer.teamId, season, kind]);
        const row = totals.get(key) ?? { contractId: c.contractId, playerId: c.playerId, teamId: payer.teamId, season, kind, amountManYen: 0 };
        totals.set(key, { ...row, amountManYen: add(row.amountManYen, amount) });
      }
    }
  }
  const rows = [...totals.values()];
  rows.reduce((total, row) => add(total, row.amountManYen), 0);
  return rows;
}

function viewsFor(ledger) {
  if (!ledger || ledger.version !== 1 || !Array.isArray(ledger.records)
    || !Number.isInteger(ledger.closedThroughSeason) || ledger.closedThroughSeason < 0 || ledger.closedThroughSeason > 9999) fail();
  const contractIds = new Set(), actionIds = new Set(), byPlayer = new Map(), views = [];
  for (const record of ledger.records) {
    const view = projectRecord(record);
    if (contractIds.has(view.contract.contractId)) fail('契約IDが重複しています。');
    contractIds.add(view.contract.contractId);
    for (const action of [opening(record), ...record.changes.map(normalize)]) {
      if (actionIds.has(action.id)) fail('取引IDが重複しています。');
      actionIds.add(action.id);
    }
    const list = byPlayer.get(view.contract.playerId) ?? [];
    if (view.effectiveDate < view.employmentEndDate) list.push(view);
    byPlayer.set(view.contract.playerId, list);
    views.push({ ...view, rows: rowsFor(view) });
  }
  for (const list of byPlayer.values()) {
    list.sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
    for (let i = 1; i < list.length; i++) if (list[i].effectiveDate < list[i - 1].employmentEndDate) fail('同一選手の契約期間が重複しています。');
  }
  return views;
}

export const createContractLedger = () => ({ version: 1, closedThroughSeason: 0, records: [] });
export function validateContractLedger(ledger) { viewsFor(ledger); return true; }
export function contractLiabilityRows(ledger) { return viewsFor(ledger).flatMap(view => view.rows); }

export function applyContractLedgerAction(ledger, input) {
  validateContractLedger(ledger);
  const action = normalize(input);
  for (const record of ledger.records) {
    const previous = [opening(record), ...record.changes].find(a => a.id === action.id);
    if (previous) {
      if (signature(previous) !== signature(action)) fail('同じ取引IDの条件が変わっています。');
      return ledger;
    }
  }
  if (parseContractDate(action.effectiveDate).year <= ledger.closedThroughSeason) fail('閉じた年度へ取引を追加できません。');
  let records;
  if (action.type === 'sign') records = [...ledger.records, { contract: action.contract, actionId: action.id,
    initialTeamId: action.teamId, effectiveDate: action.effectiveDate, changes: [] }];
  else {
    if (!ledger.records.some(r => r.contract.contractId === action.contractId)) fail('対象契約が見つかりません。');
    records = ledger.records.map(r => r.contract.contractId === action.contractId ? { ...r, changes: [...r.changes, action] } : r);
  }
  const next = { ...ledger, records };
  validateContractLedger(next);
  return next;
}

export function closeContractLedgerThrough(ledger, season) {
  validateContractLedger(ledger);
  if (!Number.isInteger(season) || season < ledger.closedThroughSeason || season < 1 || season > 9999) fail('締め年度を確認してください。');
  return season === ledger.closedThroughSeason ? ledger : { ...ledger, closedThroughSeason: season };
}

export function isContractLedgerExtension(before, after) {
  validateContractLedger(before); validateContractLedger(after);
  if (after.closedThroughSeason < before.closedThroughSeason) return false;
  for (const record of after.records) {
    const old = before.records.find(r => r.contract.contractId === record.contract.contractId);
    if (!old && parseContractDate(record.effectiveDate).year <= before.closedThroughSeason) return false;
    if (record.changes.slice(old?.changes.length ?? 0).some(action => parseContractDate(action.effectiveDate).year <= before.closedThroughSeason)) return false;
  }
  return before.records.every(old => {
    const next = after.records.find(r => r.contract.contractId === old.contract.contractId);
    return next && signature(opening(old)) === signature(opening(next)) && next.changes.length >= old.changes.length
      && old.changes.every((action, i) => signature(action) === signature(next.changes[i]));
  });
}

/** Current employment, independent of retained guarantee liability. */
export function contractEmploymentAt(ledger, date) {
  parseContractDate(date);
  return viewsFor(ledger).filter(view => view.effectiveDate <= date && date < view.employmentEndDate).map(view => {
    const payer = view.payers.find(p => p.startDate <= date && date < p.endDate);
    const rate = view.rates.filter(r => r.startDate <= date).at(-1);
    return { contract: view.contract, teamId: payer.teamId, annualSalaryManYen: rate.annualSalaryManYen };
  });
}
