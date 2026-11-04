import { parseContractDate } from './contractCalendar';

const fail = () => { throw new Error('ポスティング資格の出生日・認定シーズン・出典を確認してください。'); };
const id = v => (typeof v === 'string' && v.trim()) || (Number.isSafeInteger(v) && v >= 0);
const fields = (o, names) => {
  if (!o || typeof o !== 'object' || Array.isArray(o) || Object.keys(o).length !== names.length
    || Object.keys(o).some(k => !names.includes(k))) fail();
};
function sources(list) {
  if (!Array.isArray(list) || !list.length || [...list].some(s => typeof s !== 'string' || !s.trim() || s !== s.trim())
    || new Set(list).size !== list.length) fail();
  return [...list].sort();
}

// These are supplied documented facts. Shape validation does not certify their
// external truth; the future market producer must own and bind its provenance.
export function normalizePostingQualificationEvidence(input) {
  fields(input, ['version', 'playerId', 'sourcePlayerId', 'birthDate', 'professionalSeasons']);
  if (input.version !== 1 || !id(input.playerId) || !(input.sourcePlayerId === null || id(input.sourcePlayerId))) fail();
  let birthDate = null, professionalSeasons = null;
  if (input.birthDate !== null) {
    fields(input.birthDate, ['date', 'sourceIds']); parseContractDate(input.birthDate.date);
    birthDate = { date: input.birthDate.date, sourceIds: sources(input.birthDate.sourceIds) };
  }
  if (input.professionalSeasons !== null) {
    const p = input.professionalSeasons;
    fields(p, ['asOfDate', 'coverage', 'seasons']); const asOf = parseContractDate(p.asOfDate);
    if (!['partial', 'complete'].includes(p.coverage) || !Array.isArray(p.seasons)
      || (birthDate && p.asOfDate < birthDate.date)) fail();
    const seen = new Set(), birthYear = birthDate && parseContractDate(birthDate.date).year;
    const seasons = Array.from(p.seasons, r => {
      fields(r, ['season', 'sourceIds']);
      if (!Number.isInteger(r.season) || r.season < 1 || r.season > asOf.year || seen.has(r.season)
        || (birthYear && r.season < birthYear)) fail();
      seen.add(r.season); return { season: r.season, sourceIds: sources(r.sourceIds) };
    }).sort((a, b) => a.season - b.season);
    professionalSeasons = { asOfDate: p.asOfDate, coverage: p.coverage, seasons };
  }
  return { version: 1, playerId: input.playerId, sourcePlayerId: input.sourcePlayerId, birthDate, professionalSeasons };
}

// Assess only the age/pro-season exception, not posting permission, MLB signing
// eligibility, contract form, bonus-pool capacity or an overseas market outcome.
export function assessPostingBonusPoolExemption(input, signingDate) {
  const e = normalizePostingQualificationEvidence(input), date = parseContractDate(signingDate), p = e.professionalSeasons;
  if ((e.birthDate && e.birthDate.date > signingDate) || (p && p.asOfDate > signingDate)) fail();
  const ageYears = e.birthDate ? date.year - parseContractDate(e.birthDate.date).year
    - Number(signingDate.slice(5) < e.birthDate.date.slice(5)) : null;
  const knownRecognizedSeasons = p ? p.seasons.length : null;
  const agePass = ageYears === null ? null : ageYears >= 25;
  const seasonsPass = !p ? null : knownRecognizedSeasons >= 6 ? true
    : p.coverage === 'complete' && p.asOfDate === signingDate ? false : null;
  const exemption = agePass === false || seasonsPass === false ? 'restricted'
    : agePass === true && seasonsPass === true ? 'exempt' : 'unknown';
  const reasons = [];
  if (ageYears === null) reasons.push('birth-date-unrecorded');
  else if (!agePass) reasons.push('age-below-25');
  if (!p) reasons.push('professional-seasons-unrecorded');
  else if (seasonsPass !== true) reasons.push(p.coverage === 'partial' ? 'professional-seasons-incomplete'
    : p.asOfDate !== signingDate ? 'professional-seasons-stale' : 'recognized-seasons-below-6');
  return { ruleVersion: 1, playerId: e.playerId, signingDate, exemption, ageYears, knownRecognizedSeasons, reasons, evidence: e };
}
