import { normalizePostingQualificationEvidence, assessPostingBonusPoolExemption } from './postingQualification';
import { parseContractDate } from './contractCalendar';
import { initializePlayerEligibility, assessGamePostingQualification } from './playerEligibility';

const fail = () => { throw new Error('認定プロシーズンの確認日・ルール・出典を確認してください。'); };
const fields = (o, names) => {
  if (!o || typeof o !== 'object' || Array.isArray(o) || Object.keys(o).length !== names.length
    || Object.keys(o).some(k => !names.includes(k))) fail();
};

// Confirmations are supplied attested facts, never inferred from league, age,
// serviceYears or history. This date is not a fabricated legal recognition day.
export function buildPostingQualificationSnapshot(input, assessmentDate) {
  if (input?.version === 2) return buildGameSnapshot(input, assessmentDate);
  const p = input?.professionalSeasons;
  let professionalSeasons = p;
  if (p !== null) {
    fields(p, ['asOfDate', 'coverage', 'ruleId', 'seasons']);
    if (typeof p.ruleId !== 'string' || !p.ruleId.trim() || p.ruleId !== p.ruleId.trim() || !Array.isArray(p.seasons)) fail();
    parseContractDate(p.asOfDate);
    professionalSeasons = { asOfDate: p.asOfDate, coverage: p.coverage,
      seasons: Array.from(p.seasons, row => {
        fields(row, ['season', 'confirmedDate', 'sourceIds']);
        const confirmed = parseContractDate(row.confirmedDate);
        if (row.season > confirmed.year || row.confirmedDate > p.asOfDate) fail();
        return { season: row.season, sourceIds: row.sourceIds };
      }) };
  }
  const evidence = normalizePostingQualificationEvidence({ ...input, professionalSeasons });
  const assessment = assessPostingBonusPoolExemption(evidence, assessmentDate);
  const confirmations = new Map((p?.seasons ?? []).map(row => [row.season, row.confirmedDate]));
  const facts = structuredClone({ ...evidence, professionalSeasons: p === null ? null : {
    ...evidence.professionalSeasons, ruleId: p.ruleId,
    seasons: evidence.professionalSeasons.seasons.map(row => ({ ...row, confirmedDate: confirmations.get(row.season) })) } });
  return { facts, assessment };
}

export function gamePostingQualificationFacts(player, completedSeasonYear) {
  const p = initializePlayerEligibility(player);
  return structuredClone({ version: 2, playerId: p.id, sourcePlayerId: p.realPlayerId ?? null,
    birthDate: { date: p.birthDate, basis: p.eligibility.birth },
    proStart: { year: p.proStartYear, basis: p.eligibility.proStart }, completedSeasonYear });
}

function buildGameSnapshot(input, assessmentDate) {
  fields(input, ['version', 'playerId', 'sourcePlayerId', 'birthDate', 'proStart', 'completedSeasonYear']);
  const validId = n => (typeof n === 'string' && n.trim()) || (Number.isSafeInteger(n) && n >= 0);
  if (!validId(input.playerId) || !(input.sourcePlayerId === null || validId(input.sourcePlayerId))) fail();
  fields(input.birthDate, ['date', 'basis']); fields(input.proStart, ['year', 'basis']);
  for (const b of [input.birthDate.basis, input.proStart.basis]) {
    const extras = ['knownBy', 'checkedOn'].filter(k => Object.hasOwn(b, k));
    fields(b, ['kind', 'method', 'sourceIds', ...extras]);
    for (const key of extras) parseContractDate(b[key]);
    if (b.knownBy && b.knownBy > assessmentDate) fail();
    if (!['official', 'reference', 'game-estimate', 'game-history'].includes(b.kind) || typeof b.method !== 'string' || !b.method.trim()
      || !Array.isArray(b.sourceIds) || b.sourceIds.some(s => typeof s !== 'string' || !s.trim())) fail();
  }
  const player = initializePlayerEligibility({ id: input.playerId, birthDate: input.birthDate.date,
    proStartYear: input.proStart.year, daysOnActiveRoster: 0 });
  const assessment = assessGamePostingQualification(player, { signingDate: assessmentDate, completedSeasonYear: input.completedSeasonYear });
  return { facts: structuredClone(input), assessment };
}
