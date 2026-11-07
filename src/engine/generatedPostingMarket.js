import { createPostingQualification, normalizePostingQualificationCommand } from './annualPostingQualifications';
import { createPostingMarketResult, normalizePostingMarketResult } from './annualPostingMarketResults';
import { gamePostingQualificationFacts } from './postingQualificationSnapshot';
import { initializePlayerEligibility } from './playerEligibility';
import { postingMarketInputs } from './postingMarketInputs';
import { evaluatePostingMarket } from './postingMarketModel';

const stable = value => JSON.stringify(value, (_, v) => v && !Array.isArray(v) && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
const id = v => typeof v === 'string' && v.trim().length > 0 || Number.isSafeInteger(v) && v >= 0;
const fail = () => { throw Error('海外交渉の評価資料・生成結果・保存証跡を確認してください。'); };
export const isGeneratedPostingMarketCommand = c => c?.type === 'run-posting-market';
export function normalizeGeneratedPostingMarket(c) {
  if (!isGeneratedPostingMarketCommand(c) || ![c.id, c.requestId].every(id)
    || Object.keys(c).length !== 3 || Object.keys(c).some(k => !['id', 'type', 'requestId'].includes(k))) fail();
  return { id: c.id, type: c.type, requestId: c.requestId };
}
const childId = (c, kind) => JSON.stringify([c.id, kind]);
const scopeFor = (state, f) => ({ saveId: state.economyIdentity.saveId, epoch: state.economyIdentity.epoch,
  season: f.season, subjectId: f.playerId, operationId: f.requestId });
function resultCommand(c, qualificationId, evaluation) {
  const offer = evaluation.offer;
  return normalizePostingMarketResult({ id: childId(c, 'market-result'), type: 'resolve-posting', requestId: c.requestId,
    qualificationId, outcome: evaluation.outcome, ...(evaluation.outcome === 'signed' ? { settlement: 'retain',
      overseasContract: offer.kind === 'major' ? { kind: 'major', guaranteedUsdCents: offer.guaranteedUsdCents }
        : { kind: 'minor', signingBonusUsdCents: offer.signingBonusUsdCents } } : {}) });
}

export function createGeneratedPostingMarket(state, c, signature) {
  const request = state.postingApplications?.find(r => r.kind === 'request' && r.id === c.requestId);
  const team = state.teams.find(t => t.id === request?.teamId);
  const p = team && [...team.players, ...team.farm].find(p => p.id === request.playerId);
  if (!p || state.phase !== 'offseason' || request.season !== state.season
    || request.requestedDate !== state.date || state.postingMarketResults?.some(r => r.requestId === c.requestId)) fail();
  let next = state;
  const qualificationCreated = !state.postingQualifications?.some(q => q.requestId === c.requestId);
  if (qualificationCreated) {
    const q = normalizePostingQualificationCommand({ id: childId(c, 'qualification'), type: 'record-posting-qualification',
      requestId: c.requestId, facts: gamePostingQualificationFacts(initializePlayerEligibility(p, { year: state.season }), state.season) });
    if (state.transactions.some(t => String(t.id) === String(q.id))) fail();
    next = createPostingQualification(next, q, stable(q));
  }
  const inputs = postingMarketInputs(next, c.requestId);
  const evaluation = evaluatePostingMarket(inputs, state.economyRandomRoot, scopeFor(state, inputs));
  const result = resultCommand(c, inputs.qualificationId, evaluation);
  if (next.transactions.some(t => String(t.id) === String(result.id) || String(t.id) === String(c.id))) fail();
  next = createPostingMarketResult(next, result, stable(result));
  return { ...next, transactions: [...next.transactions, { id: c.id, signature,
    generatedPostingMarket: { version: 1, requestId: c.requestId, qualificationId: inputs.qualificationId,
      resultId: result.id, qualificationCreated, inputs, evaluation } }] };
}

// Historical players may develop or change clubs. Replay saved inputs against
// the immutable root instead of reading their present-day ratings.
export function inspectGeneratedPostingMarkets(state) {
  const qualifications = new Map((state.postingQualifications ?? []).map(q => [q.id, q]));
  const results = new Map((state.postingMarketResults ?? []).map(r => [r.id, r]));
  const receipts = new Map(state.transactions.map(t => [t.id, t])), ownedResults = new Set();
  for (const t of state.transactions) {
    let command; try { command = JSON.parse(t.signature); } catch { /* opaque old receipt */ }
    if (!isGeneratedPostingMarketCommand(command) && t.generatedPostingMarket === undefined) continue;
    const c = normalizeGeneratedPostingMarket(command), g = t.generatedPostingMarket, f = g?.inputs;
    if (c.id !== t.id || t.signature !== stable(c) || g?.version !== 1 || g.requestId !== c.requestId
      || !f || typeof g.qualificationCreated !== 'boolean' || g.resultId !== childId(c, 'market-result')
      || ownedResults.has(g.resultId)) fail();
    const q = qualifications.get(g.qualificationId), r = results.get(g.resultId);
    if (!q || !r || q.facts.version !== 2 || q.requestId !== c.requestId || r.requestId !== c.requestId
      || r.qualificationId !== q.id || f.requestId !== c.requestId || f.qualificationId !== q.id
      || f.playerId !== q.playerId || f.teamId !== q.teamId || f.sourceContractId !== q.sourceContractId
      || f.sourcePlayerId !== q.facts.sourcePlayerId || f.season !== q.season || f.date !== q.recordedDate
      || f.ageYears !== q.assessment.ageYears || f.exemption !== q.assessment.exemption
      || g.qualificationCreated && q.id !== childId(c, 'qualification')) fail();
    const evaluation = evaluatePostingMarket(f, state.economyRandomRoot, scopeFor(state, f));
    const result = resultCommand(c, q.id, evaluation);
    if (stable(g.evaluation) !== stable(evaluation) || receipts.get(result.id)?.signature !== stable(result)
      || r.outcome !== evaluation.outcome) fail();
    ownedResults.add(g.resultId);
  }
}
