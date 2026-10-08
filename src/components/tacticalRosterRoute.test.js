import React from 'react';
import { act, create } from 'react-test-renderer';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { afterEach, expect, it, vi } from 'vitest';
import AppScreenRouter from './AppScreenRouter';
import { useSeasonFlow } from '../hooks/useSeasonFlow';
import { initGameState } from '../engine/simulation';

const capture = vi.hoisted(() => ({ props: null }));
// Observe the router boundary; initialize with the real simulation engine below.
vi.mock('./TacticalGame', () => ({
  TacticalGameScreen: props => { capture.props = props; return null; },
}));
let hookView, routeView;
afterEach(() => {
  act(() => { hookView?.unmount(); routeView?.unmount(); });
  capture.props = null;
});
const fixture = () => JSON.parse(gunzipSync(readFileSync(new URL('../../e2e/fixtures/new-game.json.gz', import.meta.url))));
async function route(gs, sf) {
  await act(async () => {
    routeView = create(React.createElement(AppScreenRouter, { app: { gs, sf, os: {} } }));
  });
  return capture.props;
}

for (const useDh of [false, true]) for (const isHome of [false, true]) {
  it(`passes the confirmed game roster to tactical initialization (DH=${useDh}, home=${isHome})`, async () => {
    const teams = fixture().teams.slice(0, 2);
    // Saved lineup deliberately uses the opposite DH mode; rotIdx is not zero.
    teams.forEach(t => {
      t.dhEnabled = useDh;
      t.rosterDhMode = !useDh;
      t.lineup = [...(useDh ? t.lineupNoDh : t.lineupDh)];
      t.rotIdx = 1;
    });
    const original = structuredClone(teams);
    const gs = { teams, myId: teams[0].id, myTeam: teams[0], gameDay: 1, year: 2026,
      screen: 'tactical_game', allStarDone: true, allStarTriggerDay: 72, cpuTradeOffers: [],
      schedule: [null, { gameNo: 1, matchups: [{
        homeId: teams[isHome ? 0 : 1].id, awayId: teams[isHome ? 1 : 0].id,
      }] }], getGameResultsMap: () => ({}), setScreen: vi.fn(), setPregameError: vi.fn(), notify: vi.fn(),
    };
    let sf;
    function Harness() { sf = useSeasonFlow(gs); return null; }
    act(() => { hookView = create(React.createElement(Harness)); });
    await act(async () => { await sf.handleStartGame(); });
    expect(gs.setPregameError).toHaveBeenLastCalledWith(null);
    const props = await route(gs, sf);
    expect(props.myTeam).toBe(sf.currentGameTeams.my);
    expect(props.oppTeam).toBe(sf.currentGameTeams.opp);
    expect(props.isHome).toBe(isHome);
    expect(props.onGameEnd).toBe(sf.handleTacticalGameEnd);
    const game = initGameState(props.myTeam, props.oppTeam, { isMyHome: props.isHome });
    for (const [team, lineup, pitcher] of [
      [props.myTeam, game.myLineup, game.myPitcher],
      [props.oppTeam, game.opLineup, game.opPitcher],
    ]) {
      const starter = team.rotation[team.rotIdx % team.rotation.length];
      expect(pitcher.id).toBe(starter);
      expect(lineup.map(p => p.id)).toEqual([
        ...(useDh ? team.lineupDh : team.lineupNoDh), ...(!useDh ? [starter] : []),
      ]);
      for (const p of lineup.filter(p => !p.isPitcher)) expect(p.pos).toBe(team.activeFielding[p.id]);
      expect(lineup.filter(p => p.isPitcher)).toHaveLength(useDh ? 0 : 1);
    }
    expect(game.isMyHome).toBe(isHome);
    expect(teams).toEqual(original);
  });
}

it('accepts a complete confirmed snapshot even if ordinary route teams are absent', async () => {
  const teams = fixture().teams;
  const sf = { currentGameTeams: { my: teams[0], opp: teams[1], isHome: false } };
  const props = await route({ screen: 'tactical_game', setScreen: vi.fn() }, sf);
  expect(props.myTeam).toBe(teams[0]);
  expect(props.oppTeam).toBe(teams[1]);
});

it('retains the legacy fallback and missing-team recovery', async () => {
  const teams = fixture().teams;
  const props = await route({ screen: 'tactical_game', myTeam: teams[0], setScreen: vi.fn() }, { currentOpp: teams[1] });
  expect(props.myTeam).toBe(teams[0]);
  expect(props.oppTeam).toBe(teams[1]);
  act(() => routeView.unmount());
  capture.props = null;
  await route({ screen: 'tactical_game', myTeam: teams[0], setScreen: vi.fn() }, {});
  expect(capture.props).toBeNull();
  expect(JSON.stringify(routeView.toJSON())).toContain('試合情報を準備できません');
});
