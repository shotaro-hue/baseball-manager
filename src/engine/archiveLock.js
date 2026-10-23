// All updated archive writers and snapshot readers coordinate on this origin-wide
// lock. Old tabs/raw IndexedDB callers do not participate: this is not a fence.
export const BATTED_BALL_ARCHIVE_LOCK = 'baseball-manager-archive';

// If both locks are needed, acquire save -> archive. Never call this helper
// while holding the archive lock: Web Locks are neither reentrant nor cycle-aware.
// Do not drain the mutation queue inside a snapshot's archive lock either.
export async function withBattedBallArchiveLock(task) {
  const locks = globalThis.navigator?.locks;
  if (typeof locks?.request === 'function') {
    return locks.request(BATTED_BALL_ARCHIVE_LOCK, { mode: 'exclusive' }, task);
  }
  if (typeof window !== 'undefined') throw new Error('archive_lock_unavailable');
  return task(); // Single-process Node unit harness; never a browser fallback.
}
