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
    || typeof contract.guaranteed !== 'boolean') fail();
  if (contract.startSeason !== startSeasonFor(contract)
    || contract.endSeason !== contract.startSeason + contract.termYears - 1) fail();
  return true;
}

export function createSeasonContract({ contractId, playerId, signedSeason, agreementPhase, purpose,
  termYears, annualSalaryManYen, guaranteed }) {
  const startSeason = startSeasonFor({ signedSeason, agreementPhase, purpose });
  const contract = { version: 1, contractId, playerId, signedSeason, agreementPhase, purpose,
    startSeason, endSeason: startSeason + termYears - 1, termYears, annualSalaryManYen, guaranteed };
  validateSeasonContract(contract);
  return contract;
}

export function contractSeasonsRemaining(contract, targetSeason) {
  validateSeasonContract(contract);
  if (!validSeason(targetSeason)) fail();
  // Upcoming contracts keep their termYears, but are not current-season years.
  return targetSeason < contract.startSeason ? 0 : Math.max(0, contract.endSeason - targetSeason + 1);
}
