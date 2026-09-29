import { describe, it, expect, vi, beforeEach } from 'vitest';
import { advanceTacticalAction, canUseStrategy, requiresPitcherReplacement } from '../src/engine/tacticalActions';
import { processAtBat, endHalfInning, checkStopCondition } from '../src/engine/simulation';

vi.mock('../src/engine/simulation', () => ({
  processAtBat: vi.fn((gs, strategy) => ({ ...gs, executed: strategy })),
  endHalfInning: vi.fn(gs => ({ ...gs, outs: 0, isTop: !gs.isTop })),
  checkStopCondition: vi.fn(() => null),
}));
const state = (extra = {}) => ({ isMyHome: true, isTop: true, outs: 1, bases: [null, {}, null], stopped: true, stopReason: 'scoring_position_crisis', stopData: {}, ...extra });
beforeEach(() => vi.clearAllMocks());

describe('manual tactical commands', () => {
  it('executes an intentional walk once from an advisory stop and clears its metadata', () => {
    const gs = state();
    const next = advanceTacticalAction(gs, 'walk');
    expect(processAtBat).toHaveBeenCalledTimes(1);
    expect(processAtBat).toHaveBeenCalledWith({ ...gs, stopped: false, stopReason: null, stopData: null }, 'walk');
    expect(next.executed).toBe('walk');
    expect(gs.stopped).toBe(true);
  });
  it('permits commands during an ordinary manual pause', () => {
    expect(advanceTacticalAction(state({ stopped: false }), 'walk').executed).toBe('walk');
  });
  it('retains a newly triggered advisory stop', () => {
    const stop = { reason: 'scoring_position_crisis' };
    checkStopCondition.mockReturnValueOnce(stop);
    expect(advanceTacticalAction(state(), 'walk')).toMatchObject({ stopped: true, stopReason: stop.reason, stopData: stop });
  });
  it('never bypasses mandatory pitcher replacement on defense', () => {
    const gs = state({ myPitcherMustBeReplaced: true });
    expect(advanceTacticalAction(gs, 'walk')).toBe(gs);
    expect(processAtBat).not.toHaveBeenCalled();
  });
  it('allows the pinch hitter to finish the offensive half', () => {
    const gs = state({ isTop: false, myPitcherMustBeReplaced: true });
    expect(requiresPitcherReplacement(gs)).toBe(false);
    expect(advanceTacticalAction(gs).executed).toBe('normal');
  });
  it('does not advance a completed game', () => {
    const gs = state({ gameOver: true });
    expect(advanceTacticalAction(gs)).toBe(gs);
  });
  it('changes halves instead of processing a fourth out', () => {
    advanceTacticalAction(state({ outs: 3 }));
    expect(endHalfInning).toHaveBeenCalledTimes(1);
    expect(processAtBat).not.toHaveBeenCalled();
  });
  it.each(['bunt', 'hitrun', 'steal'])('rejects offensive %s while defending', strategy => {
    const gs = state();
    expect(canUseStrategy(gs, strategy)).toBe(false);
    expect(advanceTacticalAction(gs, strategy)).toBe(gs);
  });
  it('rejects intentional walks while attacking', () => expect(canUseStrategy(state({ isTop: false }), 'walk')).toBe(false));
  it('requires appropriate runners and outs for offensive commands', () => {
    const gs = state({ isTop: false, bases: [{}, null, null] });
    for (const strategy of ['bunt', 'hitrun', 'steal']) expect(canUseStrategy(gs, strategy)).toBe(true);
    for (const strategy of ['bunt', 'hitrun', 'steal']) expect(canUseStrategy({ ...gs, bases: [null, null, null] }, strategy)).toBe(false);
    expect(canUseStrategy({ ...gs, outs: 2 }, 'bunt')).toBe(false);
    expect(canUseStrategy({ ...gs, bases: [{}, {}, {}] }, 'steal')).toBe(false);
  });
});
