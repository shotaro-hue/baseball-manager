import { processAtBat, endHalfInning, checkStopCondition } from './simulation';

export function requiresPitcherReplacement(gs) {
  const attacking = gs.isMyHome ? !gs.isTop : gs.isTop;
  return !attacking && !!gs.myPitcherMustBeReplaced;
}

export function canUseStrategy(gs, strategy) {
  if (gs.gameOver || gs.outs >= 3 || requiresPitcherReplacement(gs)) return false;
  const attacking = gs.isMyHome ? !gs.isTop : gs.isTop;
  if (strategy === 'normal') return true;
  if (strategy === 'walk') return !attacking;
  if (!attacking) return false;
  if (strategy === 'bunt') return gs.outs < 2 && gs.bases.some(Boolean);
  if (strategy === 'hitrun') return !!gs.bases[0];
  if (strategy === 'steal') return (!!gs.bases[0] && !gs.bases[1]) || (!!gs.bases[1] && !gs.bases[2]);
  return false;
}

// A deliberate command may clear an advisory stop, but never a mandatory
// pitcher replacement. Execute once and return to manual control.
export function advanceTacticalAction(gs, strategy = 'normal') {
  if (gs.gameOver || requiresPitcherReplacement(gs)) return gs;
  if (gs.outs >= 3) return endHalfInning(gs);
  if (!canUseStrategy(gs, strategy)) return gs;
  const ready = { ...gs, stopped: false, stopReason: null, stopData: null };
  let next = processAtBat(ready, strategy);
  if (next.outs >= 3) next = endHalfInning(next);
  if (next.gameOver) return next;
  const stop = checkStopCondition(next);
  return stop ? { ...next, stopped: true, stopReason: stop.reason, stopData: stop } : next;
}
