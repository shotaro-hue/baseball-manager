import { acquisitionRequest, reduceAcquisitionRequest, validateAcquisitionDecisions, dueAcquisitionDecisions } from './acquisitionDecisions';
import { renewalRequest, reduceRenewalRequest, validateRenewalDecisions, dueRenewalDecisions } from './renewalDecisions';
import { validateEconomyClock } from './economyCalendar';
import { contractEconomyMode, toAnnualState } from './contractEconomy';

// Explicit saved-clock boundary for human UI now, day/Worker producers later.
// Both reducers run in one unpublished candidate; a failure returns the original.
export function advanceEconomyDecisions(world, request) {
  try {
    const e = world.contractEconomy;
    if (contractEconomyMode(world) !== 'annual' || request?.saveId !== world.saveId || request.epoch !== e?.epoch
      || !Number.isSafeInteger(request.baseRevision) || request.baseRevision < 0 || request.baseRevision > e.revision
      || Object.keys(request).some(k => !['saveId', 'epoch', 'baseRevision', 'action'].includes(k))
      || request.action?.type !== 'resolve-due' || Object.keys(request.action).length !== 1)
      throw new Error('回答処理のセーブ・世代・revisionを確認してください。');
    validateRenewalDecisions(world); validateAcquisitionDecisions(world); toAnnualState(world);
    // A retry after the entire due batch completed is a read-only acknowledgement.
    // A stale callback must never resolve newly due promises in a newer world.
    if (!dueRenewalDecisions(world).length && !dueAcquisitionDecisions(world).length) return { ok: true, world, replayed: true };
    if (request.baseRevision !== e.revision) throw new Error('回答処理のrevisionが古くなっています。');
    let next = world;
    for (const [reduce, envelope, due] of [[reduceRenewalRequest, renewalRequest, dueRenewalDecisions], [reduceAcquisitionRequest, acquisitionRequest, dueAcquisitionDecisions]]) {
      if (!due(next).length) continue;
      const r = reduce(next, envelope(next, { type: 'resolve-due' }));
      if (!r.ok) throw new Error(r.error);
      next = r.world;
    }
    if (next === world) return { ok: true, world, replayed: true };
    next = { ...next, contractEconomy: { ...next.contractEconomy, revision: e.revision + 1 } };
    validateRenewalDecisions(next); validateAcquisitionDecisions(next);
    return { ok: true, world: next, replayed: false };
  } catch (error) { return { ok: false, world, replayed: false, error: error.message }; }
}

// The clock is the receipt for a turn. Exact revision matching makes a second
// click/stale callback a rejection, never another turn or another random draw.
export function offseasonTurnRequest(world) {
  return { saveId: world.saveId, epoch: world.contractEconomy?.epoch,
    baseRevision: world.contractEconomy?.revision, action: { type: 'advance-offseason-turn' } };
}

export function advanceOffseasonTurn(world, request) {
  try {
    const e = world.contractEconomy;
    if (e?.mode !== 'annual' || request?.saveId !== world.saveId || request.epoch !== e?.epoch
      || !Number.isSafeInteger(request.baseRevision) || request.baseRevision !== e.revision || !Number.isSafeInteger(e.revision + 1)
      || Object.keys(request).some(k => !['saveId', 'epoch', 'baseRevision', 'action'].includes(k))
      || request.action?.type !== 'advance-offseason-turn' || Object.keys(request.action).length !== 1)
      throw new Error('ターン進行のセーブ・世代・revisionを確認してください。');
    toAnnualState(world); validateRenewalDecisions(world); validateAcquisitionDecisions(world);
    if (e.clock.phase !== 'offseason' || e.clock.offseasonTurn >= 37)
      throw new Error('オフのターン進行は第37ターンまでです。届いた回答・未解決案件を確認してください。');
    const resolve = source => {
      if (!dueRenewalDecisions(source).length && !dueAcquisitionDecisions(source).length) return source;
      const r = advanceEconomyDecisions(source, acquisitionRequest(source, { type: 'resolve-due' }));
      if (!r.ok) throw new Error(r.error);
      return r.world;
    };
    // Honour already-due replies at their current clock (also old dueDate
    // promises). Then resolve the newly due batch before publishing anything.
    let next = resolve(world);
    next = resolve({ ...next, contractEconomy: { ...next.contractEconomy,
      clock: { ...e.clock, offseasonTurn: e.clock.offseasonTurn + 1 } } });
    next = { ...next, contractEconomy: { ...next.contractEconomy, revision: e.revision + 1 } };
    validateEconomyClock(next, world); validateRenewalDecisions(next); validateAcquisitionDecisions(next);
    return { ok: true, world: next, replayed: false };
  } catch (error) { return { ok: false, world, replayed: false, error: error.message }; }
}
