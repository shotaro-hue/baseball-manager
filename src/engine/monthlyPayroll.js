import { validateSeasonContract } from './seasonContract';

// GM-01 foundation only. No roster, budget, save, or RNG side effects.
// Civil dates are strict YYYY-MM-DD strings; interval ends are exclusive.
const fail = () => { throw new Error('給与の年俸・年度・在籍期間を確認してください。'); };
const validSeason = year => Number.isInteger(year) && year >= 1 && year <= 9999;
const seasonDate = (year, suffix) => `${String(year).padStart(4, '0')}-${suffix}`;

function civilDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail();
  const [year, month, day] = value.split('-').map(Number);
  if (!validSeason(year) || month < 1 || month > 12) fail();
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  if (day < 1 || day > days) fail();
  return { year, month, day, days };
}

export function accruedSalaryManYen(annualSalaryManYen, season, date) {
  if (!Number.isSafeInteger(annualSalaryManYen) || annualSalaryManYen < 0 || !validSeason(season)) fail();
  const d = civilDate(date);
  if (date <= seasonDate(season, '02-01')) return 0;
  if (date >= seasonDate(season, '12-01')) return annualSalaryManYen;
  // Exact nonnegative half-up rounding of a * M(d) / 10. Integer arithmetic
  // avoids creating/destroying a 万円 at half ties or near MAX_SAFE_INTEGER.
  const numerator = BigInt((d.month - 2) * d.days + d.day - 1);
  const denominator = BigInt(10 * d.days);
  return Number((BigInt(annualSalaryManYen) * numerator + denominator / 2n) / denominator);
}

export function salaryForPeriodManYen(annualSalaryManYen, season, startDate, endDate) {
  const start = accruedSalaryManYen(annualSalaryManYen, season, startDate);
  const end = accruedSalaryManYen(annualSalaryManYen, season, endDate);
  if (endDate < startDate) fail();
  return end - start;
}

/**
 * Quote the whole fixed contract, including all 4th–7th years. Tenures are
 * ordered payer intervals, independent of active roster membership: a later
 * guaranteed release must retain its payer record. Transfers never edit the
 * contract's signing metadata or endSeason. Termination settlements and live
 * atomic transactions will be connected in later GM-01 work.
 */
export function quoteContractPayroll(contract, effectiveDate, tenures) {
  validateSeasonContract(contract);
  const effective = civilDate(effectiveDate);
  if (effective.year !== contract.startSeason || effective.month >= 12
    || !Array.isArray(tenures) || tenures.length === 0) fail();
  const finalDate = seasonDate(contract.endSeason, '12-01');
  let cursor = effectiveDate;
  for (const tenure of tenures) {
    if (!tenure || !((typeof tenure.teamId === 'string' && tenure.teamId.trim().length > 0)
      || (Number.isSafeInteger(tenure.teamId) && tenure.teamId >= 0))) fail();
    civilDate(tenure.startDate); civilDate(tenure.endDate);
    if (tenure.startDate !== cursor || tenure.endDate <= tenure.startDate || tenure.endDate > finalDate) fail();
    cursor = tenure.endDate;
  }
  if (cursor !== finalDate) fail();

  const seasons = [];
  for (let season = contract.startSeason; season <= contract.endSeason; season++) {
    const teams = new Map();
    const startDate = seasonDate(season, '02-01'), endDate = seasonDate(season, '12-01');
    for (const tenure of tenures) {
      const from = tenure.startDate > startDate ? tenure.startDate : startDate;
      const to = tenure.endDate < endDate ? tenure.endDate : endDate;
      if (from >= to) continue;
      const amount = salaryForPeriodManYen(contract.annualSalaryManYen, season, from, to);
      teams.set(tenure.teamId, (teams.get(tenure.teamId) ?? 0) + amount);
    }
    const entries = [...teams].map(([teamId, amountManYen]) => ({ teamId, amountManYen }));
    seasons.push({ season, annualSalaryManYen: contract.annualSalaryManYen,
      amountManYen: entries.reduce((sum, entry) => sum + entry.amountManYen, 0), teams: entries });
  }
  return { contractId: contract.contractId, annualSalaryManYen: contract.annualSalaryManYen,
    nominalTotalManYen: contract.annualSalaryManYen * contract.termYears,
    totalLiabilityManYen: seasons.reduce((sum, row) => sum + row.amountManYen, 0), seasons };
}
