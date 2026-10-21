// Local, bounded metadata only. Never include payloads, IDs, exception messages,
// stacks or player/club data; diagnostics are not sent to a server.
const exceptionNames = new Set(['Error', 'TypeError', 'RangeError', 'DataCloneError',
  'QuotaExceededError', 'SecurityError', 'AbortError', 'UnknownError', 'InvalidStateError',
  'TransactionInactiveError', 'ConstraintError', 'NotFoundError', 'VersionError', 'NotAllowedError']);

export function saveFailure(reason, { step, api, error, queue, quota = false } = {}) {
  let storage = { rootBytes: null, backupBytes: null };
  try {
    const size = key => (localStorage.getItem(key)?.length ?? 0) * 2;
    storage = { rootBytes: size('baseball_manager_v1'),
      backupBytes: size('baseball_manager_v1_bk1') + size('baseball_manager_v1_bk2') };
  } catch { /* Storage access itself may be the failure. */ }
  const diagnostics = { version: 1, reason, quota: quota || error?.name === 'QuotaExceededError', step, api,
    exceptionName: exceptionNames.has(error?.name) ? error.name : error ? 'Error' : null,
    queue: { isSaving: Boolean(queue?.isSaving), hasQueuedSave: Boolean(queue?.hasQueuedSave) }, storage };
  console.warn('[SaveDiagnostic]', diagnostics);
  return { ok: false, quota: quota || error?.name === 'QuotaExceededError', reason, diagnostics };
}
