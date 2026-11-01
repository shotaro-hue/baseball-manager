import { acquisitionRequest, reduceAcquisitionRequest, validateAcquisitionDecisions, dueAcquisitionDecisions } from './acquisitionDecisions';
import { renewalRequest, reduceRenewalRequest, validateRenewalDecisions, dueRenewalDecisions } from './renewalDecisions';
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
    for (const [reduce, envelope] of [[reduceRenewalRequest, renewalRequest], [reduceAcquisitionRequest, acquisitionRequest]]) {
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
