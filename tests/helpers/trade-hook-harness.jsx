// Real trade/mail routes, hook and save I/O. The public annual gate remains OFF.
import React, { useLayoutEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { useGameState } from '../../src/hooks/useGameState';
import { useOffseason } from '../../src/hooks/useOffseason';
import HubContentRouter from '../../src/components/hub/HubContentRouter';

export function mountTradeView(world, { legacy = false, mailbox = false } = {}) {
  let committed;
  function Harness() {
    const gs = useGameState(), os = useOffseason(gs), [tab, setTab] = useState(mailbox ? 'mailbox' : 'trade');
    const [focus, setFocus] = useState(null);
    useLayoutEffect(() => { committed = gs; });
    if (!gs.contractEconomy) return null;
    return <HubContentRouter app={{ gs: legacy ? { ...gs, contractEconomy: undefined } : gs, os, sf: {} }}
      tab={tab} focusRequest={focus} onOpen={setTab} onOpenCase={(target, id) => { setFocus({ id, token: 1 }); setTab(target); }} />;
  }
  const app = document.getElementById('root'); app.style.display = 'none';
  const target = document.createElement('div'); target.style.cssText = 'max-width:1200px;margin:auto;padding:16px;box-sizing:border-box';
  target.className = 'app calm-shell hub-entry-shell'; document.body.append(target);
  const root = createRoot(target);
  flushSync(() => root.render(<Harness />));
  flushSync(() => {
    if (!committed.hydrateSavedWorld(world, { progressToken: committed.getProgressToken(), sessionToken: committed.getProgressSessionToken() })) throw Error('hydration rejected');
    committed.setScreen('hub');
  });
  return { current: () => committed, unmount: () => { flushSync(() => root.unmount()); target.remove(); app.style.display = ''; } };
}
