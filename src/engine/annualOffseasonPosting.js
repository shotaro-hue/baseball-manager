import { postingPhaseId } from './annualPostingPhase';

const stable = v => JSON.stringify(v, (_, x) => x && !Array.isArray(x) && typeof x === 'object'
  ? Object.fromEntries(Object.keys(x).sort().map(k => [k, x[k]])) : x);
const id = v => typeof v === 'string' && v.trim().length > 0 || Number.isSafeInteger(v) && v >= 0;
const fail = () => { throw Error('12/1の引退予約確定とポスティングの順序・保存証跡を確認してください。'); };
const day = y => `${String(y).padStart(4, '0')}-12-01`;
export const offseasonPostingId = season => JSON.stringify(['offseason-posting', season]);
export const isOffseasonPostingCommand = c => c?.type === 'prepare-offseason-posting';
export function normalizeOffseasonPosting(c) {
  if (!isOffseasonPostingCommand(c) || ![c.id, c.humanTeamId].every(id) || Object.keys(c).length !== 3
    || Object.keys(c).some(k => !['id', 'type', 'humanTeamId'].includes(k))) fail();
  return { id: c.id, type: c.type, humanTeamId: c.humanTeamId };
}
const finalizationId = reservationId => JSON.stringify(['offseason-retirement', reservationId]);

// Every child passes the existing common admission in the same candidate.
// Retirement admission may expose a deficit; posting then uses that state as
// its baseline and must still pass its own unchanged spending review.
export function* createOffseasonPostingSteps(state, c, signature, applySteps) {
  if (state.version !== 2 || state.phase !== 'offseason' || state.date !== day(state.season)
    || c.id !== offseasonPostingId(state.season) || !state.teams.some(t => t.id === c.humanTeamId)) fail();
  const pending = (state.retirementReservations ?? []).filter(r => r.season === state.season && !r.finalization)
    .sort((a, b) => stable(a.id) < stable(b.id) ? -1 : stable(a.id) > stable(b.id) ? 1 : 0);
  // Never change the roster retrospectively for a published wish/CPU policy.
  if (pending.length && state.transactions.some(t => t.generatedPostingRequests?.season === state.season
    || t.annualPostingPhase?.season === state.season)) fail();
  const g = { version: 1, season: state.season, date: state.date, humanTeamId: c.humanTeamId,
    finalizedReservationIds: pending.map(r => r.id), finalizationIds: pending.map(r => finalizationId(r.id)),
    postingPhaseId: postingPhaseId(state.season), createdPostingPhase: !state.transactions.some(t => t.id === postingPhaseId(state.season)) };
  let result = { state };
  for (const r of pending) result = yield* applySteps(result.state,
    { id: finalizationId(r.id), type: 'finalize-retirement', reservationId: r.id });
  result = yield* applySteps(result.state, { id: g.postingPhaseId, type: 'advance-posting-phase', humanTeamId: c.humanTeamId });
  return { ...result, replayed: false, state: { ...result.state,
    transactions: [...result.state.transactions, { id: c.id, signature, annualOffseasonPosting: g }] } };
}

// Optional in older saves. Check saved facts and child order, never today's AI.
export function inspectOffseasonPosting(state) {
  const receipts = new Map(state.transactions.map((t, i) => [t.id, { ...t, index: i }]));
  for (const t of state.transactions) {
    let command; try { command = JSON.parse(t.signature); } catch { /* old opaque signature */ }
    if (!isOffseasonPostingCommand(command) && t.annualOffseasonPosting === undefined) continue;
    const c = normalizeOffseasonPosting(command), g = t.annualOffseasonPosting, parent = receipts.get(t.id);
    const phase = receipts.get(g?.postingPhaseId);
    if (!g || Object.keys(g).length !== 8 || g.version !== 1 || !Number.isInteger(g.season)
      || g.season < 1 || g.season > state.season || g.date !== day(g.season) || g.date > state.date
      || g.humanTeamId !== c.humanTeamId || c.id !== t.id || c.id !== offseasonPostingId(g.season)
      || t.signature !== stable(c) || typeof g.createdPostingPhase !== 'boolean'
      || !Array.isArray(g.finalizedReservationIds) || !Array.isArray(g.finalizationIds)
      || g.finalizedReservationIds.length !== g.finalizationIds.length
      || new Set(g.finalizedReservationIds).size !== g.finalizedReservationIds.length
      || g.postingPhaseId !== postingPhaseId(g.season) || !phase?.annualPostingPhase
      || phase.annualPostingPhase.humanTeamId !== c.humanTeamId || phase.index >= parent.index
      || !g.createdPostingPhase && g.finalizationIds.length) fail();
    let previous = -1;
    for (let i = 0; i < g.finalizedReservationIds.length; i++) {
      const reservationId = g.finalizedReservationIds[i], f = receipts.get(g.finalizationIds[i]);
      const r = (state.retirementReservations ?? []).find(r => r.id === reservationId);
      if (!r || !f || r.season !== g.season || r.finalization?.id !== f.id || f.id !== finalizationId(reservationId)
        || f.signature !== stable({ id: f.id, type: 'finalize-retirement', reservationId })
        || f.index <= previous || f.index >= phase.index) fail();
      previous = f.index;
    }
    if ((state.retirementReservations ?? []).some(r => r.season === g.season
      && (!r.finalization || (receipts.get(r.finalization.id)?.index ?? Infinity) >= phase.index))) fail();
  }
}
