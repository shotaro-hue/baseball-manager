import { rngf } from '../utils';
import { economyRandomContext } from './economyRandom';
import { postingPreference } from './postingPreference';
import { calcPostingRequestProb } from './posting';
import { canRequestPosting, createPostingApplication, postingApplicationViews } from './annualPostingApplications';
import { initializePlayerEligibility, assessGamePostingQualification } from './playerEligibility';
import { contractEmploymentAt } from './contractLedger';
import { employmentContractId } from './seasonContract';

const stable = v => JSON.stringify(v, (_, x) => x && !Array.isArray(x) && typeof x === 'object'
  ? Object.fromEntries(Object.keys(x).sort().map(k => [k, x[k]])) : x);
const id = v => typeof v === 'string' && v.trim().length > 0 || Number.isSafeInteger(v) && v >= 0;
const fail = () => { throw Error('海外挑戦希望の年度・球団・年一度の判定記録を確認してください。'); };
const day = y => `${String(y).padStart(4, '0')}-12-01`;
export const postingGenerationId = (season, teamId) => JSON.stringify(['posting-request-generation', season, teamId]);
const requestId = (season, teamId, playerId) => JSON.stringify(['posting-request', season, teamId, playerId]);
export const isGeneratedPostingRequestsCommand = c => c?.type === 'generate-posting-requests';
export function normalizeGeneratedPostingRequests(c) {
  if (!isGeneratedPostingRequestsCommand(c) || ![c.id, c.teamId].every(id) || Object.keys(c).length !== 3
    || Object.keys(c).some(k => !['id', 'type', 'teamId'].includes(k))) fail();
  return { id: c.id, type: c.type, teamId: c.teamId };
}
function evaluate(inputs, state, season) {
  const f = inputs;
  if (!f || Object.keys(f).length !== 7 || ![f.playerId, f.sourceContractId].every(id)
    || !Number.isInteger(f.ageYears) || f.ageYears < 0 || typeof f.isPitcher !== 'boolean'
    || ![f.overseas, f.morale].every(v => v === null || Number.isFinite(v) && v >= 0 && v <= 100)
    || !(f.workload === null || Number.isFinite(f.workload) && f.workload >= 0)) fail();
  const scope = { saveId: state.economyIdentity.saveId, epoch: state.economyIdentity.epoch,
    season, subjectId: f.playerId, operationId: 'posting-request' };
  const preference = postingPreference(f.overseas, state.economyRandomRoot, scope);
  const probability = calcPostingRequestProb({ age: f.ageYears, morale: f.morale ?? 70,
    isPitcher: f.isPitcher, stats: { [f.isPitcher ? 'BF' : 'PA']: f.workload }, personality: { overseas: preference.value } });
  const draw = rngf(0, 1, economyRandomContext(state.economyRandomRoot, scope, 'posting:request:v1'));
  return { preference, probability, draw, requested: draw < probability };
}
function childCommand(g, row) {
  return { id: row.requestId, type: 'request-posting', teamId: g.teamId,
    playerId: row.inputs.playerId, contractId: row.inputs.sourceContractId };
}

export function createGeneratedPostingRequests(state, c, signature) {
  if (state.version !== 2 || state.phase !== 'offseason' || state.date !== day(state.season)
    || state.season >= 9999 || c.id !== postingGenerationId(state.season, c.teamId)) fail();
  const team = state.teams.find(t => t.id === c.teamId); if (!team) fail();
  const existing = new Set(postingApplicationViews(state).filter(r => r.season === state.season).map(r => r.playerId));
  const candidates = [...team.players, ...team.farm]
    .filter(p => !p.postingRequested && !existing.has(p.id) && canRequestPosting(state, c.teamId, p.id, p.contractId))
    .sort((a, b) => { const x = JSON.stringify(a.id), y = JSON.stringify(b.id); return x < y ? -1 : x > y ? 1 : 0; })
    .map(p => {
      const ageYears = assessGamePostingQualification(initializePlayerEligibility(p, { year: state.season }),
        { signingDate: state.date, completedSeasonYear: state.season }).ageYears;
      const inputs = { playerId: p.id, sourceContractId: p.contractId, ageYears, isPitcher: Boolean(p.isPitcher),
        overseas: p.personality?.overseas ?? null, morale: p.morale ?? null, workload: p.stats?.[p.isPitcher ? 'BF' : 'PA'] ?? null };
      const evaluation = evaluate(inputs, state, state.season);
      return { inputs, evaluation, requestId: evaluation.requested ? requestId(state.season, c.teamId, p.id) : null };
    });
  const g = { version: 1, policyVersion: 'posting-requests-v1', season: state.season, date: state.date, teamId: c.teamId, candidates };
  let next = state;
  for (const row of candidates) if (row.requestId !== null) {
    const child = childCommand(g, row);
    if (next.transactions.some(t => String(t.id) === String(child.id))) fail();
    next = createPostingApplication(next, child, stable(child));
  }
  return { ...next, transactions: [...next.transactions, { id: c.id, signature, generatedPostingRequests: g }] };
}

// Snapshot inputs survive later development, transfers and annual transitions.
// Source contracts and generated children still have to match saved evidence.
export function inspectGeneratedPostingRequests(state) {
  const receipts = new Map(state.transactions.map(t => [t.id, t])), employment = new Map(), children = new Set();
  for (const t of state.transactions) {
    let command; try { command = JSON.parse(t.signature); } catch { /* opaque historical receipt */ }
    if (!isGeneratedPostingRequestsCommand(command) && t.generatedPostingRequests === undefined) continue;
    const c = normalizeGeneratedPostingRequests(command), g = t.generatedPostingRequests;
    if (!g || g.version !== 1 || g.policyVersion !== 'posting-requests-v1' || Object.keys(g).length !== 6
      || !Number.isInteger(g.season) || g.season < 1 || g.season > state.season || g.season >= 9999
      || g.date !== day(g.season) || g.date > state.date || g.teamId !== c.teamId
      || !state.teams.some(team => team.id === c.teamId) || !Array.isArray(g.candidates)
      || c.id !== t.id || c.id !== postingGenerationId(g.season, g.teamId) || t.signature !== stable(c)) fail();
    if (!employment.has(g.season)) employment.set(g.season, new Map(contractEmploymentAt(state.spending.ledger,
      `${String(g.season).padStart(4, '0')}-11-30`).map(e => [employmentContractId(e.contract), e])));
    let previous = null;
    for (const row of g.candidates) {
      const f = row?.inputs, key = JSON.stringify(f?.playerId), e = employment.get(g.season).get(f?.sourceContractId);
      if (!row || Object.keys(row).length !== 3 || previous !== null && key <= previous || !e
        || e.teamId !== g.teamId || e.contract.playerId !== f.playerId || e.registrationType !== 'controlled') fail();
      previous = key;
      const evaluation = evaluate(f, state, g.season);
      if (stable(row.evaluation) !== stable(evaluation)
        || row.requestId !== (evaluation.requested ? requestId(g.season, g.teamId, f.playerId) : null)) fail();
      if (row.requestId !== null) {
        const child = receipts.get(row.requestId), expected = childCommand(g, row);
        if (!child || children.has(row.requestId) || child.signature !== stable(expected)
          || child.postingApplication?.season !== g.season) fail();
        children.add(row.requestId);
      }
    }
  }
}
