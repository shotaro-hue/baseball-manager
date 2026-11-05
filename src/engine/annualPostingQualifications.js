import { postingApplicationViews } from './annualPostingApplications';
import { buildPostingQualificationSnapshot } from './postingQualificationSnapshot';

const fail = () => { throw new Error('ポスティング資格snapshotの申請・選手ID・認定根拠・保存証跡を確認してください。'); };
const id = v => (typeof v === 'string' && v.trim()) || (Number.isSafeInteger(v) && v >= 0);
const stable = value => JSON.stringify(value, (_, v) => v && !Array.isArray(v) && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
const records = state => state.postingQualifications === undefined ? [] : state.postingQualifications;
export const isPostingQualificationCommand = c => c?.type === 'record-posting-qualification';

export function normalizePostingQualificationCommand(c) {
  const fields = ['id', 'type', 'requestId', 'facts'];
  if (!isPostingQualificationCommand(c) || !id(c.id) || !id(c.requestId) || Object.keys(c).length !== fields.length
    || Object.keys(c).some(k => !fields.includes(k))) fail();
  // Canonicalize without a world clock. Creation/restore assess at recordedDate.
  const { facts } = buildPostingQualificationSnapshot(c.facts, '9999-12-31');
  return { id: c.id, type: c.type, requestId: c.requestId, facts };
}

function recordFor(state, c, request, recordedDate) {
  const team = state.teams.find(t => t.id === request?.teamId);
  const player = team && [...team.players, ...team.farm].find(p => p.id === request.playerId);
  const i = state.economyIdentity;
  if (state.version !== 2 || !i || !id(i.saveId) || !id(i.epoch) || !request || request.status !== 'approved'
    || !player || player.contractId !== request.sourceContractId || c.facts.playerId !== request.playerId
    || c.facts.sourcePlayerId !== (player.realPlayerId ?? null) || recordedDate !== request.requestedDate
    || recordedDate > state.date) fail();
  return { id: c.id, version: 1, requestId: request.id, season: request.season, teamId: request.teamId,
    playerId: request.playerId, sourceContractId: request.sourceContractId,
    sourceKey: JSON.stringify([i.saveId, i.epoch, 'posting-qualification', request.id]), recordedDate,
    ...buildPostingQualificationSnapshot(c.facts, recordedDate) };
}

export function inspectAnnualPostingQualifications(state) {
  const list = records(state), ids = new Set(), requests = new Set();
  if (!Array.isArray(list)) fail();
  const applications = new Map(postingApplicationViews(state).map(r => [r.id, r]));
  const receipts = new Map(state.transactions.map(t => [t.id, t]));
  for (const r of list) {
    if (!r || !id(r.id) || ids.has(String(r.id)) || requests.has(r.requestId)) fail();
    const receipt = receipts.get(r.id);
    let c; try { c = normalizePostingQualificationCommand(JSON.parse(receipt?.signature)); } catch { fail(); }
    if (c.id !== r.id || receipt.signature !== stable(c) || stable(receipt.postingQualification) !== stable(r)
      || stable(r) !== stable(recordFor(state, c, applications.get(c.requestId), r.recordedDate))) fail();
    ids.add(String(r.id)); requests.add(r.requestId);
  }
  for (const t of state.transactions) {
    let c; try { c = JSON.parse(t.signature); } catch { /* opaque legacy receipt */ }
    if ((isPostingQualificationCommand(c) || t.postingQualification !== undefined) && !ids.has(String(t.id))) fail();
  }
  return list;
}

export function createPostingQualification(state, c, signature) {
  const request = postingApplicationViews(state).find(r => r.id === c.requestId);
  if (state.phase !== 'offseason' || request?.season !== state.season
    || records(state).some(r => r.requestId === c.requestId)) fail();
  const record = recordFor(state, c, request, state.date);
  return { ...state, postingQualifications: [...records(state), record],
    transactions: [...state.transactions, { id: c.id, signature, postingQualification: structuredClone(record) }] };
}
