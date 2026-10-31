// Test-only real React DOM lifecycle. No production gates or storage are mocked.
import React, { useLayoutEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { useGameState } from '../../src/hooks/useGameState';

export function mountEconomyHook(world) {
  let committed, blocked = false, suspendedRender = false, release;
  const wait = new Promise(resolve => { release = resolve; });
  function Blocker({ revision }) {
    if (blocked && revision === 1) { suspendedRender = true; throw wait; }
    return <output data-economy-revision={revision}>{revision}</output>;
  }
  function Harness() {
    const gs = useGameState();
    useLayoutEffect(() => { committed = gs; });
    return <Blocker revision={gs.contractEconomy?.revision} />;
  }
  const target = document.createElement('div'); document.body.append(target);
  const root = createRoot(target);
  flushSync(() => root.render(<React.Suspense fallback={<span>adoption pending</span>}><Harness /></React.Suspense>));
  flushSync(() => {
    if (!committed.hydrateSavedWorld(world, { progressToken: committed.getProgressToken(),
      sessionToken: committed.getProgressSessionToken() })) throw new Error('hydration rejected');
  });
  return { current: () => committed, update: operation => flushSync(() => operation(committed)),
    block: () => { blocked = true; }, suspended: () => suspendedRender,
    resume: () => { blocked = false; release(); },
    unmount: () => { flushSync(() => root.unmount()); target.remove(); } };
}
