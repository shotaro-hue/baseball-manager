// Shared civil calendar for GM-01. No Date/timezone or game-round inference.
export function parseContractDate(value) {
  const fail = () => { throw new Error('契約の年月日を確認してください。'); };
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail();
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || year > 9999 || month < 1 || month > 12) fail();
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  if (day < 1 || day > days) fail();
  return { year, month, day, days };
}

export function registrationDateAllowed(season, date) {
  if (!Number.isInteger(season) || season < 1 || season > 9999) throw new Error('登録年度を確認してください。');
  const d = parseContractDate(date);
  return d.year === season && d.month <= TRADE_DEADLINE_MONTH;
}
import { TRADE_DEADLINE_MONTH } from '../constants';
