import { remainingContractAfterSeason } from './renewalRules';
import { MIN_SALARY_SHIHAKA, MIN_SALARY_IKUSEI } from '../constants';

// GM-01 foundation only: not connected to live contracts or save migration yet.
// Salary is a fixed annual rate in whole 万円, never the prorated club cost.
const validId = id => (typeof id === 'string' && id.trim().length > 0)
  || (Number.isSafeInteger(id) && id >= 0);
const validSeason = season => Number.isInteger(season) && season >= 1 && season <= 9999;
const fail = () => { throw new Error('契約の年度・年俸・識別情報を確認してください。'); };

function startSeasonFor({ signedSeason, agreementPhase, purpose }) {
  if (!validSeason(signedSeason) || !['preseason', 'season', 'offseason'].includes(agreementPhase)
    || !['acquisition', 'renewal'].includes(purpose)) fail();
  return signedSeason + Number(agreementPhase === 'offseason'
    || (agreementPhase === 'season' && purpose === 'renewal'));
}

export function validateSeasonContract(contract) {
  if (!contract || contract.version !== 1 || !validId(contract.contractId) || !validId(contract.playerId)
    || !validSeason(contract.startSeason) || !validSeason(contract.endSeason)
    || !Number.isInteger(contract.termYears) || contract.termYears < 1 || contract.termYears > 7
    || !Number.isSafeInteger(contract.annualSalaryManYen) || contract.annualSalaryManYen < 0
    || !Number.isSafeInteger(contract.annualSalaryManYen * contract.termYears)
    || (contract.registrationType !== undefined && !['controlled', 'development'].includes(contract.registrationType))
    // Explicit classes describe player terms. Untyped C-1 ledger records retain
    // their generic zero-money compatibility; never infer a class for them.
    || (contract.registrationType === 'controlled' && contract.annualSalaryManYen < MIN_SALARY_SHIHAKA)
    || (contract.registrationType === 'development' && contract.annualSalaryManYen < MIN_SALARY_IKUSEI)
    || typeof contract.guaranteed !== 'boolean') fail();
  if (contract.startSeason !== startSeasonFor(contract)
    || contract.endSeason !== contract.startSeason + contract.termYears - 1) fail();
  return true;
}

export function createSeasonContract({ contractId, playerId, signedSeason, agreementPhase, purpose,
  termYears, annualSalaryManYen, guaranteed, registrationType }) {
  const startSeason = startSeasonFor({ signedSeason, agreementPhase, purpose });
  const contract = { version: 1, contractId, playerId, signedSeason, agreementPhase, purpose,
    startSeason, endSeason: startSeason + termYears - 1, termYears, annualSalaryManYen, guaranteed,
    ...(registrationType !== undefined ? { registrationType } : {}) };
  validateSeasonContract(contract);
  return contract;
}

export function contractSeasonsRemaining(contract, targetSeason) {
  validateSeasonContract(contract);
  if (!validSeason(targetSeason)) fail();
  // Upcoming contracts keep their termYears, but are not current-season years.
  return targetSeason < contract.startSeason ? 0 : Math.max(0, contract.endSeason - targetSeason + 1);
}

// Observed legacy balances are not newly signed contracts. Keep their original
// evidence separate from native signature/term/guarantee facts.
export const isLegacyOpening = c => c?.kind === 'legacy-opening';
export const employmentContractId = c => isLegacyOpening(c) ? c.openingId : c.contractId;
export function projectLegacyCarryForward(player, season) {
  const issue = (field, code) => { const e = new Error(`旧契約の${field}を確認してください。`); e.field = field; e.code = code; throw e; };
  if (!validSeason(season)) issue('season', 'invalid');
  for (const field of ['salary', 'contractYearsLeft']) {
    const n = player?.[field];
    if (n === undefined || n === null) issue(field, 'missing');
    if (!Number.isSafeInteger(n)) issue(field, 'invalid');
  }
  if (player.salary < 0) issue('salary', 'invalid');
  for (const field of ['育成', 'isIkusei']) {
    if (Object.hasOwn(player, field) && typeof player[field] !== 'boolean') issue(field, 'invalid');
  }
  const development = Boolean(player.育成 || player.isIkusei);
  if (player.salary < (development ? MIN_SALARY_IKUSEI : MIN_SALARY_SHIHAKA)) issue('salary', 'minimum');
  const left = player.contractYearsLeft;
  if (left < 1 || left > 7) issue('contractYearsLeft', 'range');
  if (Object.hasOwn(player, 'contractSignedYear') && (!validSeason(player.contractSignedYear) || player.contractSignedYear > season))
    issue('contractSignedYear', 'invalid');
  if (Object.hasOwn(player, 'contractYears') && (!Number.isInteger(player.contractYears) || player.contractYears < 1 || player.contractYears > 7))
    issue('contractYears', 'invalid');
  const carriedFutureYears = remainingContractAfterSeason(player, season), endSeason = season + carriedFutureYears;
  if (!validSeason(endSeason) || !Number.isSafeInteger(player.salary * carriedFutureYears)) issue('contractYearsLeft', 'invalid');
  return { carriedFutureYears, endSeason, registrationType: development ? 'development' : 'controlled' };
}

export function validateLegacyOpening(c) {
  if (!isLegacyOpening(c) || ![c.openingId, c.playerId, c.teamId, c.migrationId].every(validId)
    || !validSeason(c.observedSeason) || c.observedDate !== `${String(c.observedSeason).padStart(4, '0')}-11-30`
    || !c.sourceFields || typeof c.sourceFields !== 'object' || Array.isArray(c.sourceFields)
    || ['contractId', 'signedSeason', 'startSeason', 'termYears', 'annualSalaryManYen', 'guaranteed', 'agreementPhase', 'purpose'].some(k => Object.hasOwn(c, k))) fail();
  const projected = projectLegacyCarryForward(c.sourceFields, c.observedSeason);
  if (c.observedAnnualSalaryManYen !== c.sourceFields.salary || c.observedYearsLeft !== c.sourceFields.contractYearsLeft
    || c.carriedFutureYears !== projected.carriedFutureYears || c.endSeason !== projected.endSeason
    || c.registrationType !== projected.registrationType || c.guaranteeStatus !== 'unknown') fail();
  // Legacy saves have no authoritative guarantee field. Known terms are native;
  // a later mutual termination is a new ledger event, never a rewrite here.
  return true;
}
export function normalizeEmploymentContract(c) {
  if (!isLegacyOpening(c)) return createSeasonContract(c);
  validateLegacyOpening(c);
  return structuredClone(c);
}
export function remainingEmploymentSeasons(c, season) {
  if (!isLegacyOpening(c)) return contractSeasonsRemaining(c, season);
  validateLegacyOpening(c); if (!validSeason(season)) fail();
  if (season === c.observedSeason) return c.observedYearsLeft;
  return season < c.observedSeason ? 0 : Math.max(0, c.endSeason - season + 1);
}
export function employmentPlayerFields(employment, season) {
  const c = employment.contract;
  return { salary: employment.annualSalaryManYen, contractId: employmentContractId(c),
    contractYearsLeft: remainingEmploymentSeasons(c, season),
    ...(!isLegacyOpening(c) ? { contractYears: c.termYears, contractSignedYear: c.signedSeason } : {}) };
}
export function validateAnnualEmploymentContract(c) {
  if (isLegacyOpening(c)) return validateLegacyOpening(c);
  validateSeasonContract(c);
  if (c.guaranteed !== true || !['controlled', 'development'].includes(c.registrationType)) fail();
  return true;
}
