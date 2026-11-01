// Real DOM and storage integration for the annual fixture; the public gate stays OFF.
import React, { useLayoutEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { useGameState } from '../../src/hooks/useGameState';
import { useOffseason } from '../../src/hooks/useOffseason';
import HubContentRouter from '../../src/components/hub/HubContentRouter';
import { ContractTab } from '../../src/components/tabs/ContractTab';
import ContractRenewalRoute from '../../src/components/screenRoutes/ContractRenewalRoute';

export function mountRenewalView(world, { legacy = false, offseason = false } = {}) {
  let committed;
  function Harness() {
    const gs = useGameState(), os = useOffseason(gs);
    useLayoutEffect(() => { committed = gs; });
    if (!gs.contractEconomy) return null;
    if (offseason) return <ContractRenewalRoute gs={{ ...gs, screen: 'contract_renewal_phase' }} os={os} myTeam={gs.myTeam} myId={gs.myId} year={gs.year} />;
    return legacy ? <ContractTab team={gs.myTeam} allTeams={gs.teams} year={gs.year} gameDay={gs.gameDay} mailbox={[]} />
      : <HubContentRouter app={{ gs, os, sf: {} }} tab="contract" />;
  }
  const app = document.getElementById('root'); app.style.display = 'none';
  const target = document.createElement('div');
  target.style.cssText = 'max-width:1200px;margin:auto;padding:16px;box-sizing:border-box';
  target.className = 'app calm-shell hub-entry-shell';
  document.body.append(target);
  const root = createRoot(target);
  flushSync(() => root.render(<Harness />));
  flushSync(() => {
    if (!committed.hydrateSavedWorld(world, { progressToken: committed.getProgressToken(),
      sessionToken: committed.getProgressSessionToken() })) throw new Error('hydration rejected');
  });
  return { current: () => committed, unmount: () => { flushSync(() => root.unmount()); target.remove(); app.style.display = ''; } };
}
