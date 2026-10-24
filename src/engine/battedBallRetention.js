import { createSaveId } from './saveIdentity';
import { validateBattedBallReceipt, validateBattedBallVersionRef } from './battedBallRun';

export const BATTED_BALL_RETENTION_LOCK_PREFIX = 'baseball-manager-archive-retain:';
const realms = new WeakMap();
let currentStorage;
function realm() {
  const factory = globalThis.indexedDB || globalThis;
  // Keep the current host wrapper strongly reachable while this realm owns
  // native pins. A weak-only storage identity can disappear between operations.
  if (currentStorage?.factory !== factory) {
    if (!realms.has(factory)) realms.set(factory, { current: null, loaded: null });
    currentStorage = { factory, state: realms.get(factory) };
  }
  return currentStorage.state;
}

// A native held lock is a live reference. There is no timeout that could expire
// a suspended tab, and the browser releases it on process/tab exit.
export function createBattedBallRetentionPin(saveId, runId, anchor = null) {
  validateBattedBallReceipt(anchor, saveId);
  const locks = globalThis.navigator?.locks;
  if (typeof locks?.request !== 'function' || typeof locks?.query !== 'function') {
    // Collection is disabled on this same capability boundary.
    return { ready: Promise.resolve(), adopt() {}, settled() {}, release() {} };
  }
  const owner = realm();
  let unlock, readyResolve, readyReject, acquired = false, pending = true, released = false, slot = null;
  const held = new Promise(resolve => { unlock = resolve; });
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  // An unused/cancelled producer need not have awaited readiness yet.
  void ready.catch(() => {});
  const pin = {
    saveId,
    ready,
    adopt(nextSlot = 'current') {
      if (!acquired || released) return;
      const previous = owner[nextSlot]; owner[nextSlot] = pin; slot = nextSlot;
      if (previous && previous !== pin) previous.settledCurrent();
    },
    settled() { pending = false; if (slot == null || owner[slot] !== pin) pin.release(); },
    settledCurrent() { if (!pending) pin.release(); },
    release() {
      if (released) return;
      released = true;
      if (slot != null && owner[slot] === pin) owner[slot] = null;
      unlock();
    },
  };
  const name = BATTED_BALL_RETENTION_LOCK_PREFIX + JSON.stringify({ token: createSaveId(), saveId, runId, anchor });
  try {
    Promise.resolve(locks.request(name, () => { acquired = true; readyResolve(); return held; }))
      .catch(readyReject);
  } catch (error) { readyReject(error); }
  return pin;
}

export async function retainBattedBallReceipt(receipt) {
  if (!receipt?.head) return { adopt() { releaseSlot('loaded'); }, release() {} };
  const [saveId, runId] = validateBattedBallVersionRef(receipt.head, receipt.saveId, 'run');
  const pin = createBattedBallRetentionPin(saveId, runId, receipt);
  await pin.ready;
  // Load pins have no pending projection job; adoption retains the current one.
  return { adopt() { pin.adopt('loaded'); pin.settled(); }, release: pin.release };
}

function releaseSlot(slot, saveId) {
  const owner = realm(), current = owner[slot];
  if (!current || (saveId != null && current.saveId !== saveId)) return;
  owner[slot] = null;
  current.settledCurrent(); // Failed/in-flight projection still owns its pin.
}

export function releaseCurrentBattedBallReceipt(saveId) {
  releaseSlot('current', saveId); releaseSlot('loaded', saveId);
}
