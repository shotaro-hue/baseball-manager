import { postingApplicationViews } from './annualPostingApplications';
import { contractEmploymentAt, contractLiabilityRows } from './contractLedger';
import { employmentContractId, isLegacyOpening } from './seasonContract';
import { assessSalaryPerformance } from './salaryDemand';

const fail = () => { throw Error('海外市場の承認・資格・能力資料・元契約を確認してください。'); };
const rating = value => Number.isFinite(value) && value >= 0 && value <= 100;
const optional = value => {
  if (value === undefined || value === null) return { recorded: false, value: null };
  if (!rating(value)) fail();
  return { recorded: true, value };
};
const battingCounters = ['PA', 'AB', 'H', 'BB', 'HBP', 'SF', 'D', 'T', 'HR'];
const pitchingCounters = ['IP', 'ER', 'Kp', 'BBp', 'G', 'GS', 'SV', 'HLD'];
function performance(player, season) {
  const keys = player.isPitcher ? pitchingCounters : battingCounters;
  const merge = rows => Object.fromEntries(keys.map(key => {
    const values = rows.map(r => r?.[key]);
    if (values.some(v => v !== undefined && v !== null && (!Number.isFinite(v) || v < 0))) fail();
    return [key, values.every(v => Number.isFinite(v)) ? values.reduce((n, v) => n + v, 0) : null];
  }));
  const logs = player.recentCareerLog?.length ? player.recentCareerLog : player.careerLog ?? [];
  if (!Array.isArray(logs)) fail();
  const records = [{ season, source: 'current-season', stats: merge([player.stats]) }];
  for (let year = season - 1; year >= season - 2; year--) {
    const rows = logs.filter(r => r.year === year).map(r => r.stats);
    if (rows.length) records.push({ season: year, source: 'saved-career', stats: merge(rows) });
  }
  return records.map(r => ({ ...r, assessment: assessSalaryPerformance(player, r.stats) }));
}

// Immutable evaluation inputs, not a price or an acceptance policy. The native
// source contract owns salary and retained liabilities; display fields do not.
export function postingMarketInputs(state, requestId) {
  const r = postingApplicationViews(state).find(r => r.id === requestId);
  const qualifications = (state.postingQualifications ?? []).filter(q => q.requestId === requestId);
  const q = qualifications[0], team = state.teams.find(t => t.id === r?.teamId);
  const p = team && [...team.players, ...team.farm].find(p => p.id === r?.playerId);
  if (!r || r.status !== 'approved' || r.season !== state.season || state.phase !== 'offseason'
    || state.date !== r.requestedDate || qualifications.length !== 1 || q.facts?.version !== 2
    || q.teamId !== r.teamId || q.playerId !== r.playerId || q.sourceContractId !== r.sourceContractId
    || !p || p.contractId !== r.sourceContractId || (p.realPlayerId ?? null) !== q.facts.sourcePlayerId) fail();
  const employment = contractEmploymentAt(state.spending.ledger, `${String(state.season).padStart(4, '0')}-11-30`)
    .find(e => employmentContractId(e.contract) === r.sourceContractId);
  if (!employment || employment.teamId !== r.teamId || employment.contract.playerId !== r.playerId
    || employment.registrationType !== 'controlled' || !Number.isInteger(q.assessment.ageYears)) fail();
  const source = p.isPitcher ? p.pitching : p.batting;
  const fields = p.isPitcher ? ['velocity', 'control', 'breaking', 'stamina'] : ['contact', 'power', 'eye'];
  if (!fields.every(k => rating(source?.[k]))) fail();
  const costs = new Map();
  for (const row of contractLiabilityRows(state.spending.ledger)) {
    if (row.contractId === r.sourceContractId && row.season > state.season)
      costs.set(row.season, (costs.get(row.season) ?? 0) + row.amountManYen);
  }
  const c = employment.contract;
  return { version: 1, requestId, qualificationId: q.id, season: state.season, date: state.date,
    teamId: r.teamId, playerId: r.playerId, sourcePlayerId: p.realPlayerId ?? null, sourceContractId: r.sourceContractId,
    ageYears: q.assessment.ageYears, exemption: q.assessment.exemption,
    role: p.isPitcher ? /抑え|中継ぎ|救援/.test(p.subtype || p.pos || '') ? 'relief' : 'starter' : 'batter',
    position: p.pos ?? null, subtype: p.subtype ?? null, abilities: Object.fromEntries(fields.map(k => [k, source[k]])),
    potential: optional(p.potential),
    personality: Object.fromEntries(['overseas', 'money', 'loyalty', 'stability', 'future', 'playing'].map(k => [k, optional(p.personality?.[k])])),
    performance: performance(p, state.season),
    npb: { annualSalaryManYen: employment.annualSalaryManYen, endSeason: c.endSeason,
      guaranteeStatus: isLegacyOpening(c) ? c.guaranteeStatus : c.guaranteed ? 'guaranteed' : 'not-guaranteed',
      retainedCostsBySeason: [...costs].sort((a, b) => a[0] - b[0]).map(([season, amountManYen]) => ({ season, amountManYen })) } };
}
