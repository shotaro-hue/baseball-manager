// Annual fixtures exercise the real hooks/routes/storage without enabling release.
import React, { useLayoutEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { useGameState } from '../../src/hooks/useGameState';
import { useOffseason } from '../../src/hooks/useOffseason';
import HubContentRouter from '../../src/components/hub/HubContentRouter';
import HubFaTab from '../../src/components/hub/HubFaTab';
import OffseasonFaPhaseScreen from '../../src/components/OffseasonFaPhaseScreen';

export function mountAcquisitionView(world, { legacy = false, offseason = false } = {}) {
  let committed;
  function Harness() {
    const gs = useGameState(), os = useOffseason(gs);
    useLayoutEffect(() => { committed = gs; });
    if (!gs.contractEconomy) return null;
    if (offseason) return <OffseasonFaPhaseScreen gs={gs} os={os} myTeam={gs.myTeam} myId={gs.myId} year={gs.year} />;
    return legacy ? <HubFaTab myTeam={gs.myTeam} teams={gs.teams} faPool={gs.faPool} faYears={gs.faYears}
      setFaYears={gs.setFaYears} gameDay={gs.gameDay} year={gs.year} myId={gs.myId} />
      : <HubContentRouter app={{ gs, os, sf: {} }} tab="fa" />;
  }
  const app = document.getElementById('root'); app.style.display = 'none';
  const target = document.createElement('div'); target.style.cssText = 'max-width:1200px;margin:auto;padding:16px;box-sizing:border-box';
  target.className = 'app calm-shell hub-entry-shell'; document.body.append(target);
  const root = createRoot(target);
  flushSync(() => root.render(<Harness />));
  flushSync(() => {
    if (!committed.hydrateSavedWorld(world, { progressToken: committed.getProgressToken(), sessionToken: committed.getProgressSessionToken() })) throw Error('hydration rejected');
  });
  return { current: () => committed, unmount: () => { flushSync(() => root.unmount()); target.remove(); app.style.display = ''; } };
}
