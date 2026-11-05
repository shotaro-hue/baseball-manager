import { normalizePostingQualificationEvidence, assessPostingBonusPoolExemption } from './postingQualification';
import { parseContractDate } from './contractCalendar';

const fail = () => { throw new Error('認定プロシーズンの確認日・ルール・出典を確認してください。'); };
const fields = (o, names) => {
  if (!o || typeof o !== 'object' || Array.isArray(o) || Object.keys(o).length !== names.length
    || Object.keys(o).some(k => !names.includes(k))) fail();
};

// Confirmations are supplied attested facts, never inferred from league, age,
// serviceYears or history. This date is not a fabricated legal recognition day.
export function buildPostingQualificationSnapshot(input, assessmentDate) {
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
