// Real router/hooks/storage, with an annual fixture; no release gate override.
import React, { useLayoutEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { useGameState } from '../../src/hooks/useGameState';
import { useOffseason } from '../../src/hooks/useOffseason';
import AppScreenRouter from '../../src/components/AppScreenRouter';

export function mountRookieView(world, { legacy = false } = {}) {
  let committed;
  function Harness() {
    const gs = useGameState(), os = useOffseason(gs);
    useLayoutEffect(() => { committed = gs; });
    if (!gs.contractEconomy) return null;
    return <AppScreenRouter app={{ gs: legacy ? { ...gs, contractEconomy: undefined } : gs, os, sf: {} }} />;
  }
  const app = document.getElementById('root'); app.style.display = 'none';
  const target = document.createElement('div'); target.className = 'app calm-shell'; document.body.append(target);
  const root = createRoot(target);
  flushSync(() => root.render(<Harness />));
  flushSync(() => {
    if (!committed.hydrateSavedWorld(world, { progressToken: committed.getProgressToken(), sessionToken: committed.getProgressSessionToken() })) throw Error('hydration rejected');
    committed.setScreen('draft_review');
  });
  return { current: () => committed, unmount: () => { flushSync(() => root.unmount()); target.remove(); app.style.display = ''; } };
}
