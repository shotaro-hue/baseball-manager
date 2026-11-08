import { contractEmploymentAt } from './contractLedger';
import { employmentContractId } from './seasonContract';
import { isIkuseiPlayer } from './rosterCapacity';
import { inspectAnnualPostingMarketResults } from './annualPostingMarketResults';

const fail = () => { throw new Error('ポスティング申請・GM判断・元契約・市場未接続の状態を確認してください。'); };
const id = v => (typeof v === 'string' && v.trim()) || (Number.isSafeInteger(v) && v >= 0);
const stable = value => JSON.stringify(value, (_, v) => v && !Array.isArray(v) && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
const day = (year, suffix) => `${String(year).padStart(4, '0')}-${suffix}`;
const records = state => state.postingApplications === undefined ? [] : state.postingApplications;
export const isPostingApplicationCommand = c => ['request-posting', 'decide-posting'].includes(c?.type);

export function normalizePostingApplication(c) {
  if (!isPostingApplicationCommand(c)) fail();
  const fields = c.type === 'request-posting' ? ['id', 'type', 'teamId', 'playerId', 'contractId']
    : ['id', 'type', 'requestId', 'decision'];
  if (Object.keys(c).length !== fields.length || Object.keys(c).some(k => !fields.includes(k))
    || !(c.type === 'request-posting' ? [c.id, c.teamId, c.playerId, c.contractId].every(id)
      : [c.id, c.requestId].every(id) && ['approve', 'reject'].includes(c.decision))) fail();
  return Object.fromEntries(fields.map(k => [k, c[k]]));
}

// Read model only. The append-only events and their transaction receipts own
// the facts; approval is deliberately not a market outcome or a departure.
export function postingApplicationViews(state) {
  const list = records(state), decisions = new Map(list.filter(r => r.kind === 'decision').map(r => [r.requestId, r]));
  const results = new Map((state.postingMarketResults ?? []).map(r => [r.requestId, r]));
  return list.filter(r => r.kind === 'request').map(r => ({ ...r,
    status: results.get(r.id)?.outcome ?? (decisions.has(r.id) ? decisions.get(r.id).decision === 'approve' ? 'approved' : 'rejected' : 'pending') }));
}
function assertAvailable(state, r) {
  const t = state.teams.find(t => t.id === r.teamId), p = t && [...t.players, ...t.farm].find(p => p.id === r.playerId);
  if (!p || p.contractId !== r.sourceContractId || isIkuseiPlayer(p) || p.isRetired || p._retireNow
    || state.spending.reservations.some(h => h.proposal.contract.playerId === r.playerId)
    || (state.retirementReservations ?? []).some(h => h.playerId === r.playerId && h.season === r.season)
    || state.spending.ledger.records.some(h => h.contract.playerId === r.playerId && h.effectiveDate > state.date
      && contractEmploymentAt(state.spending.ledger, h.effectiveDate).some(e => employmentContractId(e.contract) === employmentContractId(h.contract)))) fail();
  return p;
}
export function canRequestPosting(state, teamId, playerId, contractId) {
  try { assertAvailable(state, { season: state.season, teamId, playerId, sourceContractId: contractId }); return true; }
  catch { return false; }
}
function requestRecord(c, season) {
  return { id: c.id, kind: 'request', season, teamId: c.teamId, playerId: c.playerId,
    sourceContractId: c.contractId, requestedDate: day(season, '12-01') };
}
function decisionRecord(c, r) {
  return { id: c.id, kind: 'decision', requestId: r.id, decision: c.decision, decidedDate: r.requestedDate };
}

export function inspectAnnualPostingApplications(state) {
  const list = records(state), ids = new Set(), sources = new Set(), requests = new Map(), answered = new Set(), employments = new Map();
  if (!Array.isArray(list) || (list.length && state.version !== 2)) fail();
  const results = new Map(inspectAnnualPostingMarketResults(state).map(r => [r.requestId, r]));
  const receipts = new Map(state.transactions.map(t => [t.id, t]));
  for (const r of list) {
    if (!r || !id(r.id) || ids.has(String(r.id))) fail();
    ids.add(String(r.id));
    const t = receipts.get(r.id);
    let c; try { c = normalizePostingApplication(JSON.parse(t?.signature)); } catch { fail(); }
    if (c.id !== r.id || t.signature !== stable(c) || stable(t.postingApplication) !== stable(r)) fail();
    if (c.type === 'request-posting') {
      if (!Number.isInteger(r.season) || r.season < 1 || r.season > state.season || r.season >= 9999
        || (r.season === state.season && (state.phase !== 'offseason' || r.requestedDate > state.date))
        || stable(r) !== stable(requestRecord(c, r.season))) fail();
      const source = JSON.stringify([r.season, r.playerId]);
      if (sources.has(source)) fail(); sources.add(source); requests.set(r.id, r);
      if (!employments.has(r.season)) employments.set(r.season, new Map(contractEmploymentAt(state.spending.ledger, day(r.season, '11-30'))
        .map(e => [employmentContractId(e.contract), e])));
      const e = employments.get(r.season).get(r.sourceContractId);
      if (!e || e.teamId !== r.teamId || e.contract.playerId !== r.playerId || e.registrationType !== 'controlled') fail();
    } else {
      const request = requests.get(c.requestId);
      if (!request || answered.has(request.id) || stable(r) !== stable(decisionRecord(c, request))) fail();
      answered.add(request.id);
    }
  }
  for (const t of state.transactions) {
    let c; try { c = JSON.parse(t.signature); } catch { /* opaque legacy receipt */ }
    if ((isPostingApplicationCommand(c) || t.postingApplication !== undefined) && !ids.has(String(t.id))) fail();
  }
  for (const r of postingApplicationViews(state)) {
    // No direct completion can masquerade as this new workflow's market step.
    const result = results.get(r.id), departures = (state.postingDepartures ?? []).filter(d => d.season === r.season && d.player.id === r.playerId);
    if (result?.outcome === 'signed') {
      if (departures.length !== 1 || departures[0].id !== JSON.stringify([result.completionId, 'posting-departure'])) fail();
    } else if (departures.length) fail();
    if (result || r.status === 'rejected') continue;
    if (r.season !== state.season || assertAvailable(state, r).postingRequested !== true) fail();
  }
  return list;
}

export function createPostingApplication(state, c, signature) {
  if (state.version !== 2 || state.phase !== 'offseason' || state.date !== day(state.season, '12-01') || state.season >= 9999) fail();
  const list = records(state);
  let record, teams = state.teams;
  if (c.type === 'request-posting') {
    if (postingApplicationViews(state).some(r => r.season === state.season && r.playerId === c.playerId)) fail();
    record = requestRecord(c, state.season); assertAvailable(state, record);
    teams = teams.map(t => t.id !== c.teamId ? t : { ...t, players: t.players.map(p => p.id === c.playerId ? { ...p, postingRequested: true } : p),
      farm: t.farm.map(p => p.id === c.playerId ? { ...p, postingRequested: true } : p) });
  } else {
    const r = postingApplicationViews(state).find(r => r.id === c.requestId);
    if (!r || r.season !== state.season || r.status !== 'pending') fail();
    assertAvailable(state, r); record = decisionRecord(c, r);
  }
  return { ...state, teams, postingApplications: [...list, record],
    transactions: [...state.transactions, { id: c.id, signature, postingApplication: structuredClone(record) }] };
}
