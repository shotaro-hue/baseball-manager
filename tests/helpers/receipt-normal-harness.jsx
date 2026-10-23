// Real React DOM/effect lifecycle for browser regressions; never production-imported.
import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { useSeasonFlow } from '../../src/hooks/useSeasonFlow';
import { gameStateReducer, G } from '../../src/hooks/gameStateReducer';
import { TEAM_DEFS } from '../../src/constants';
import { buildTeam } from '../../src/engine/player';
import { emptyBattedBallReceipt } from '../../src/engine/battedBallRun';

export function mountNormalHarness({ strict = true } = {}) {
  const teams = TEAM_DEFS.slice(0, 2).map(buildTeam), saveId = 'normal-harness';
  let state = { teams, saveId, myId: teams[0].id, year: 2026, gameDay: 1, battedBallReceipt: emptyBattedBallReceipt(saveId) };
  let api, token = 1, adopted = 0;
  const effects = [], noop = () => {};
  const gs = { ...state, myTeam: teams[0], allStarDone: true,
    schedule: [null, { date: { month: 4, day: 1 }, matchups: [{ homeId: teams[0].id, awayId: teams[1].id }] }],
    getGameResultsMap: () => ({}), getSeasonHistory: () => ({}), getNewsBySelector: () => [], getMailboxBySelector: () => [], getScheduleArchive: () => [],
    getProgressSessionToken: () => 1, getProgressToken: () => token,
    applyProgressCandidate: candidate => { state = gameStateReducer(state, { type: G.APPLY_PROGRESS, candidate }); adopted++; token++; return true; },
    setAllTeamResultsMap: () => effects.push('boxscores'), addNews: () => effects.push('news'), addTransferLog: () => effects.push('transfer'),
    pushResult: () => effects.push('result'), pushGameResult: () => effects.push('game-history'), setMailbox: () => effects.push('mail'),
    setScreen: noop, notify: noop, cpuTradeOffers: [],
  };
  function Harness() {
    api = useSeasonFlow(gs);
    useEffect(() => { api.setCurrentOpp(teams[1]); api.setCurrentGameTeams({ isHome: true }); }, []);
    return null;
  }
  const target = document.createElement('div'); document.body.append(target);
  const root = createRoot(target), component = React.createElement(Harness);
  root.render(strict ? React.createElement(React.StrictMode, null, component) : component);
  return { ready: () => Boolean(api?.currentOpp), bump: () => { token++; },
    run: mode => (mode === 'auto' ? api.handleAutoSimEnd : api.handleTacticalGameEnd)({ score: { my: 1, opp: 0 }, inningSummary: [],
      log: [{ batId: teams[0].players.find(p => !p.isPitcher).id, result: 's', evKmh: 140, laDeg: 15 }] }),
    result: () => ({ day: state.gameDay, adopted, effects: [...effects], gameResult: api?.gameResult, receipt: state.battedBallReceipt }),
    unmount: () => { root.unmount(); target.remove(); } };
}
