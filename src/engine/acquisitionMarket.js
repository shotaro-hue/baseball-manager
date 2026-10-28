import { parseContractDate, registrationDateAllowed } from './contractCalendar';

// Explicit metadata is opt-in. Never infer a declaration from isFA/isForeign.
const fail = () => { throw new Error('市場区分・提示日・回答日を確認してください。'); };
const validId = id => (typeof id === 'string' && id.trim().length > 0) || (Number.isSafeInteger(id) && id >= 0);
const yearStart = season => `${String(season).padStart(4, '0')}-02-01`;
export function normalizeMarketEntry(input) {
  if (!input || !validId(input.id) || !['domestic-fa', 'overseas-fa', 'released'].includes(input.kind)
    || Object.keys(input).some(k => !['id', 'kind', 'enteredDate', 'originTeamId', 'compensationRank'].includes(k))) fail();
  parseContractDate(input.enteredDate);
  if (input.originTeamId !== undefined && !validId(input.originTeamId)) fail();
  if (input.kind === 'released' ? input.compensationRank !== undefined
    : !validId(input.originTeamId) || !['A', 'B', 'C', 'exempt'].includes(input.compensationRank)) fail();
  return { id: input.id, kind: input.kind, enteredDate: input.enteredDate,
    ...(input.originTeamId !== undefined ? { originTeamId: input.originTeamId } : {}),
    ...(input.compensationRank !== undefined ? { compensationRank: input.compensationRank } : {}) };
}

export function acquisitionOfferMetadata(proposal) {
  if (!Object.hasOwn(proposal, 'offeredDate') && !Object.hasOwn(proposal, 'marketEntry')) return {};
  const date = parseContractDate(proposal.offeredDate), entry = normalizeMarketEntry(proposal.marketEntry), c = proposal.contract;
  if (c?.purpose !== 'acquisition' || date.year !== c.signedSeason || entry.enteredDate > proposal.offeredDate
    || !['controlled', 'development'].includes(c.registrationType) || proposal.offeredDate > proposal.effectiveDate) fail();
  if (c.agreementPhase === 'offseason') {
    if (proposal.effectiveDate !== yearStart(c.startSeason)) fail();
  } else if (entry.kind !== 'released' || !registrationDateAllowed(c.signedSeason, proposal.offeredDate)) fail();
  return { offeredDate: proposal.offeredDate, marketEntry: entry };
}

export function acquisitionAnswerMetadata(proposal, resolution, answeredDate, actual = proposal) {
  const metadata = acquisitionOfferMetadata(proposal);
  if (!metadata.marketEntry) {
    if (answeredDate !== undefined) fail();
    return {};
  }
  const date = parseContractDate(answeredDate);
  if (answeredDate < metadata.offeredDate) fail();
  if (resolution === 'accepted' && (date.year !== proposal.contract.signedSeason
    || (proposal.contract.agreementPhase === 'offseason' ? answeredDate >= proposal.effectiveDate
      : actual.effectiveDate !== answeredDate || !registrationDateAllowed(date.year, answeredDate)))) fail();
  return { answeredDate };
}
