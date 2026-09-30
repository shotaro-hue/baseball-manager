import { describe, it, expect, vi } from 'vitest';
import { initGameState, autoSwapPitcher, quickSimGame } from '../src/engine/simulation';
import { createInitialTeams } from '../src/engine/bootstrapTeams';
import { prepareTeamForGame } from '../src/engine/rosterAutomation';

const pitcher = (id, subtype) => ({ id, name: String(id), isPitcher: true, subtype, condition: 100,
  pitching: { stamina: 70, velocity: 60, control: 60, breaking: 60 } });
function makeState(subtype = '中継ぎ') {
  const team = (id, starterId, reliefId) => ({ id, players: [pitcher(starterId, subtype), pitcher(reliefId, '先発')],
    lineup: [], rotation: [starterId], rotIdx: 0 });
  return { ...initGameState(team(0, 0, 2), team(1, 1, 3)), inning: 2,
    myPitchCount: 12, opPitchCount: 12,
    myPitcherState: { enteredInning: 1, battersFaced: 3 },
    opPitcherState: { enteredInning: 1, battersFaced: 3 } };
}
describe('game starting-pitcher roles', () => {
  it.each(['中継ぎ', '抑え'])('retains %s-registered starters on both sides after one inning', subtype => {
    const gs = makeState(subtype);
    expect(gs.myStartingPitcherId).toBe(0);
    expect(gs.opStartingPitcherId).toBe(1);
    expect(autoSwapPitcher(gs, 'my')).toBe(gs);
    expect(autoSwapPitcher(gs, 'opp')).toBe(gs);
  });
  it.each(['my', 'opp'])('still replaces an exhausted starter on %s side', side => {
    const gs = { ...makeState(), myPitchCount: 130, opPitchCount: 130 };
    const next = autoSwapPitcher(gs, side);
    expect(side === 'my' ? next.myPitcher.id : next.opPitcher.id).toBe(side === 'my' ? 2 : 3);
    expect(side === 'my' ? next.myPitchCount : next.opPitchCount).toBe(0);
    expect(next.myStartingPitcherId).toBe(0);
    expect(next.opStartingPitcherId).toBe(1);
  });
  it.each(['my', 'opp'])('uses relief rules for starter-registered bullpen arms on %s side', side => {
    const gs = makeState();
    const key = side === 'my' ? 'my' : 'op';
    const next = autoSwapPitcher({ ...gs, [`${key}Pitcher`]: pitcher(10, '先発') }, side);
    expect(next[`${key}Pitcher`].id).toBe(side === 'my' ? 2 : 3);
  });
  it('retains a pitcher when no replacement is available', () => {
    const gs = { ...makeState(), myPitchCount: 130, myBullpen: [] };
    expect(autoSwapPitcher(gs, 'my')).toBe(gs);
  });
  it('quick simulation lets both relief-registered starters pitch beyond inning one', () => {
    let seed = 42;
    const random = vi.spyOn(Math, 'random').mockImplementation(() => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    });
    const logging = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const teams = createInitialTeams().slice(0, 2).map(t => prepareTeamForGame(t, true));
      const ids = teams.map(t => t.rotation[t.rotIdx % t.rotation.length]);
      const inputs = teams.map((t, i) => ({ ...t, players: t.players.map(p => p.id === ids[i] ? { ...p, subtype: '中継ぎ' } : p) }));
      seed = 123;
      const result = quickSimGame(inputs[0], inputs[1], { compactLogs: true });
      for (const id of ids) {
        const events = result.log.filter(e => e.pitcherId === id);
        expect(Math.max(...events.map(e => e.inning))).toBeGreaterThan(1);
      }
      expect(result.inningSummary.length).toBeGreaterThanOrEqual(17);
    } finally { random.mockRestore(); logging.mockRestore(); }
  });
});
