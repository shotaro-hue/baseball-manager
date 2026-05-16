export function scheduleDeferredPostGameWork(task, options = {}) {
  const requestIdleCallbackImpl = options.requestIdleCallbackImpl
    ?? globalThis.requestIdleCallback
    ?? null;
  const setTimeoutImpl = options.setTimeoutImpl
    ?? ((callback) => globalThis.setTimeout(callback, 0));

  if (typeof requestIdleCallbackImpl === 'function') {
    const id = requestIdleCallbackImpl(() => {
      task();
    });
    return { kind: 'idle', id };
  }

  const id = setTimeoutImpl(() => {
    task();
  }, 0);
  return { kind: 'timeout', id };
}

export function cancelDeferredPostGameWork(handle, options = {}) {
  if (!handle) return;

  if (handle.kind === 'idle') {
    const cancelIdleCallbackImpl = options.cancelIdleCallbackImpl
      ?? globalThis.cancelIdleCallback
      ?? null;
    if (typeof cancelIdleCallbackImpl === 'function') {
      cancelIdleCallbackImpl(handle.id);
    }
    return;
  }

  const clearTimeoutImpl = options.clearTimeoutImpl ?? globalThis.clearTimeout;
  if (typeof clearTimeoutImpl === 'function') {
    clearTimeoutImpl(handle.id);
  }
}
