import { inspectPostingIncome } from './postingIncome';
import { parseContractDate } from './contractCalendar';
import { economyClockFor } from './economyCalendar';
import { SEASON_GAMES } from '../constants';

const fail = () => { throw new Error('臨時収入の引退予約・金額・日程・確定証跡を確認してください。'); };
const id = n => (typeof n === 'string' && n.trim()) || (Number.isSafeInteger(n) && n >= 0);
const money = n => Number.isSafeInteger(n) && n >= 0;
const stable = value => JSON.stringify(value, (_, v) => v && !Array.isArray(v) && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
export const isExtraordinaryIncomeCommand = c => c?.type === 'record-extraordinary-income';

export function normalizeExtraordinaryIncome(c) {
  const fields = ['id', 'type', 'kind', 'reservationId', 'amountManYen'];
  if (!isExtraordinaryIncomeCommand(c) || c.kind !== 'retirement-game' || !id(c.id) || !id(c.reservationId)
    || !money(c.amountManYen) || Object.keys(c).some(k => !fields.includes(k))) fail();
  return Object.fromEntries(fields.map(k => [k, c[k]]));
}

function incomeFor(state, c, r, recordedDate, gameDay) {
  const i = state.economyIdentity;
  return { id: JSON.stringify([c.id, 'retirement-game-income']), version: 1, kind: 'retirement-game',
    transactionId: c.id, retirementReservationId: r.id, season: r.season, teamId: r.teamId,
    playerId: r.playerId, sourceContractId: r.sourceContractId,
    sourceKey: JSON.stringify([i.saveId, i.epoch, 'retirement-game', r.season, r.teamId, r.playerId, r.sourceContractId]),
    phase: 'season', recordedDate, gameDay, amountManYen: c.amountManYen };
}

// Only proven posting receipts grant supplements. Other income is evidence for
// later budget review, never a negative cost or an immediate spending allowance.
export function inspectAnnualIncome(state) {
  const list = state.incomeReceipts === undefined ? [] : state.incomeReceipts;
  if (!Array.isArray(list) || list.some(r => !r || !['posting', 'retirement-game'].includes(r.kind))) fail();
  const ids = new Set(), sources = new Set(), parents = new Set();
  for (const r of list) {
    if (ids.has(String(r.id)) || sources.has(r.sourceKey) || parents.has(String(r.transactionId))) fail();
    ids.add(String(r.id)); sources.add(r.sourceKey); parents.add(String(r.transactionId));
  }
  const supplements = inspectPostingIncome({ ...state, incomeReceipts: list.filter(r => r.kind === 'posting') });
  const events = list.filter(r => r.kind === 'retirement-game'), proven = new Set();
  const reservations = new Map((state.retirementReservations ?? []).map(r => [r.id, r]));
  for (const row of events) {
    const receipts = state.transactions.filter(t => t.id === row.transactionId), t = receipts[0];
    let c; try { c = normalizeExtraordinaryIncome(JSON.parse(t?.signature)); } catch { fail(); }
    const r = reservations.get(c.reservationId);
    if (state.version !== 2 || !state.economyIdentity || !r || receipts.length !== 1
      || c.id !== row.transactionId || t.signature !== stable(c) || t.extraordinaryIncomeId !== row.id
      || proven.has(String(r.id)) || !Number.isInteger(r.season) || r.season < 1 || r.season > state.season
      || parseContractDate(row.recordedDate).year !== r.season || row.recordedDate < r.notifiedDate
      || row.recordedDate >= r.effectiveDate || !Number.isSafeInteger(row.gameDay)
      || row.gameDay < r.gameDay || row.gameDay > SEASON_GAMES
      || (r.season === state.season && (row.recordedDate > state.date
        || (state.phase === 'season' && row.gameDay > state.gameDay)))
      || stable(row) !== stable(incomeFor(state, c, r, row.recordedDate, row.gameDay))) fail();
    proven.add(String(r.id));
  }
  const eventTransactions = new Set(events.map(r => r.transactionId));
  for (const t of state.transactions) {
    let c; try { c = JSON.parse(t.signature); } catch { /* opaque old receipts */ }
    if ((isExtraordinaryIncomeCommand(c) || t.extraordinaryIncomeId !== undefined) && !eventTransactions.has(t.id)) fail();
  }
  return supplements;
}

export function inspectAnnualIncomeCalendar(world) {
  for (const r of world.contractEconomy.incomeReceipts) if (r?.kind === 'retirement-game') {
    const schedules = r.season === world.year ? [world.schedule]
      : (world.scheduleArchive ?? []).filter(a => a?.year === r.season && a.schedule != null).map(a => a.schedule);
    for (const schedule of schedules) if (economyClockFor({ season: r.season, phase: 'season', schedule, gameDay: r.gameDay }).date !== r.recordedDate) fail();
  }
}

export function createExtraordinaryIncome(state, c, signature) {
  const r = (state.retirementReservations ?? []).find(r => r.id === c.reservationId);
  if (state.version !== 2 || state.phase !== 'season' || !Array.isArray(state.incomeReceipts)
    || !r || r.finalization || r.season !== state.season) fail();
  const income = incomeFor(state, c, r, state.date, state.gameDay);
  const next = { ...state, incomeReceipts: [...state.incomeReceipts, income],
    transactions: [...state.transactions, { id: c.id, signature, extraordinaryIncomeId: income.id }] };
  inspectAnnualIncome(next);
  return next;
}
