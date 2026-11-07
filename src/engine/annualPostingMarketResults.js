import { createPostingCompletion, normalizePostingCompletion } from './postingIncome';
import { buildPostingQualificationSnapshot } from './postingQualificationSnapshot';

const fail = () => { throw new Error('ポスティング市場結果の承認・資格・元契約・成立証跡を確認してください。'); };
const id = v => (typeof v === 'string' && v.trim()) || (Number.isSafeInteger(v) && v >= 0);
const stable = value => JSON.stringify(value, (_, v) => v && !Array.isArray(v) && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
const records = state => state.postingMarketResults === undefined ? [] : state.postingMarketResults;
export const isPostingMarketResultCommand = c => c?.type === 'resolve-posting';

export function normalizePostingMarketResult(c) {
  const signed = c?.outcome === 'signed';
  const fields = ['id', 'type', 'requestId', 'qualificationId', 'outcome',
    ...(signed ? ['overseasContract', 'settlement', ...(c.settlement === 'waive' ? ['terminationAgreementId'] : [])] : [])];
  if (!isPostingMarketResultCommand(c) || ![c.id, c.requestId, c.qualificationId].every(id)
    || !['signed', 'no-offer', 'declined'].includes(c.outcome)
    || Object.keys(c).length !== fields.length || Object.keys(c).some(k => !fields.includes(k))) fail();
  if (!signed) return Object.fromEntries(fields.map(k => [k, c[k]]));
  // The existing boundary owns final contract/settlement terms, not pricing.
  const terms = normalizePostingCompletion({ id: c.id, type: 'complete-posting', teamId: 0, playerId: 0, contractId: 0,
    overseasContract: c.overseasContract, settlement: c.settlement,
    ...(c.settlement === 'waive' ? { terminationAgreementId: c.terminationAgreementId } : {}) });
  return { id: c.id, type: c.type, requestId: c.requestId, qualificationId: c.qualificationId, outcome: c.outcome,
    overseasContract: terms.overseasContract, settlement: terms.settlement,
    ...(c.settlement === 'waive' ? { terminationAgreementId: terms.terminationAgreementId } : {}) };
}
function completionFor(c, request) {
  return normalizePostingCompletion({ id: JSON.stringify([c.id, 'posting-completion']), type: 'complete-posting',
    teamId: request.teamId, playerId: request.playerId, contractId: request.sourceContractId,
    overseasContract: c.overseasContract, settlement: c.settlement,
    ...(c.settlement === 'waive' ? { terminationAgreementId: c.terminationAgreementId } : {}) });
}
function recordFor(state, c) {
  const request = (state.postingApplications ?? []).find(r => r.kind === 'request' && r.id === c.requestId);
  const approved = (state.postingApplications ?? []).some(r => r.kind === 'decision' && r.requestId === c.requestId && r.decision === 'approve');
  const qualification = (state.postingQualifications ?? []).find(r => r.id === c.qualificationId);
  const i = state.economyIdentity;
  if (state.version !== 2 || !i || !request || !approved || !qualification
    || qualification.requestId !== request.id || qualification.season !== request.season
    || qualification.teamId !== request.teamId || qualification.playerId !== request.playerId
    || qualification.sourceContractId !== request.sourceContractId || qualification.facts?.version !== 2
    || request.requestedDate !== qualification.recordedDate || request.requestedDate > state.date) fail();
  const { assessment } = buildPostingQualificationSnapshot(qualification.facts, request.requestedDate);
  if (assessment.ruleVersion !== 2 || (c.outcome === 'signed' && c.overseasContract.kind === 'major' && assessment.exemption !== 'exempt')) fail();
  return { id: c.id, version: 1, requestId: request.id, qualificationId: qualification.id, outcome: c.outcome,
    season: request.season, teamId: request.teamId, playerId: request.playerId, sourceContractId: request.sourceContractId,
    sourceKey: JSON.stringify([i.saveId, i.epoch, 'posting-market', request.id]), resolvedDate: request.requestedDate, assessment,
    ...(c.outcome === 'signed' ? { overseasContract: structuredClone(c.overseasContract), settlement: c.settlement,
      ...(c.settlement === 'waive' ? { terminationAgreementId: c.terminationAgreementId } : {}),
      completionId: completionFor(c, request).id } : {}) };
}

export function inspectAnnualPostingMarketResults(state) {
  const list = records(state), ids = new Set(), requests = new Set();
  if (!Array.isArray(list)) fail();
  const receipts = new Map(state.transactions.map(t => [t.id, t]));
  for (const r of list) {
    if (!r || !id(r.id) || ids.has(String(r.id)) || requests.has(r.requestId)) fail();
    const receipt = receipts.get(r.id);
    let c; try { c = normalizePostingMarketResult(JSON.parse(receipt?.signature)); } catch { fail(); }
    if (c.id !== r.id || receipt.signature !== stable(c) || stable(receipt.postingMarketResult) !== stable(r)
      || stable(r) !== stable(recordFor(state, c))) fail();
    if (c.outcome === 'signed') {
      const completion = completionFor(c, r), child = receipts.get(completion.id);
      if (!child || child.signature !== stable(completion)) fail();
    }
    ids.add(String(r.id)); requests.add(r.requestId);
  }
  for (const t of state.transactions) {
    let c; try { c = JSON.parse(t.signature); } catch { /* opaque old receipt */ }
    if ((isPostingMarketResultCommand(c) || t.postingMarketResult !== undefined) && !ids.has(String(t.id))) fail();
  }
  return list;
}

export function createPostingMarketResult(state, c, signature) {
  const r = recordFor(state, c);
  if (state.phase !== 'offseason' || r.season !== state.season || r.resolvedDate !== state.date
    || records(state).some(old => old.requestId === r.requestId)) fail();
  let next = state;
  if (c.outcome === 'signed') {
    const completion = completionFor(c, r), departureId = JSON.stringify([completion.id, 'posting-departure']);
    const keys = new Set([c.id, completion.id, departureId].map(String));
    if (keys.size !== 3 || state.transactions.some(t => keys.has(String(t.id)))) fail();
    next = createPostingCompletion(state, completion, stable(completion));
  }
  return { ...next, postingMarketResults: [...records(state), r],
    transactions: [...next.transactions, { id: c.id, signature, postingMarketResult: structuredClone(r) }] };
}
