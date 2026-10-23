// Proposed coordination, used only by the isolated probe. Existing game writers
// do NOT acquire ARCHIVE_PROBE_LOCK. Passing this probe is not production safety.
export const ARCHIVE_PROBE_LOCK = 'baseball-manager-backup-archive-probe';
let tail = Promise.resolve();
export function withProbeSnapshot(task) {
  const run = async () => {
    const locks = globalThis.navigator?.locks;
    if (!locks) {
      if (typeof window !== 'undefined') throw new Error('probe_locks_unavailable');
      return task(); // single-process unit harness only
    }
    return locks.request('baseball-manager-save', () => locks.request(ARCHIVE_PROBE_LOCK, task));
  };
  const current = tail.then(run, run); tail = current.catch(() => {});
  return current;
}
