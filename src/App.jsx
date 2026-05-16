import './styles.css';
import { SEASON_PARAMS, getDefaultParams } from './data/scheduleParams.js';
import { FOREIGN_FA_COUNT_MIN, FOREIGN_FA_COUNT_MAX } from './constants';
import { rng } from './utils';
import { useGameState } from './hooks/useGameState';
import { useSeasonFlow } from './hooks/useSeasonFlow';
import { useOffseason } from './hooks/useOffseason';
import AppScreenRouter from './components/AppScreenRouter';
import HubShell from './components/hub/HubShell';

let appSaveModulePromise = null;
let appScheduleModulePromise = null;
let appPlayerModulePromise = null;

function loadAppSaveModule() {
  if (!appSaveModulePromise) appSaveModulePromise = import('./engine/saveload');
  return appSaveModulePromise;
}

function loadAppScheduleModule() {
  if (!appScheduleModulePromise) appScheduleModulePromise = import('./engine/scheduleGen');
  return appScheduleModulePromise;
}

function loadAppPlayerModule() {
  if (!appPlayerModulePromise) appPlayerModulePromise = import('./engine/player');
  return appPlayerModulePromise;
}

export default function App() {
  const gs = useGameState();
  const sf = useSeasonFlow(gs);
  const os = useOffseason(gs);

  const handleLoad = async () => {
    const [{ loadGame }, scheduleMod, playerMod] = await Promise.all([
      loadAppSaveModule(),
      loadAppScheduleModule(),
      loadAppPlayerModule(),
    ]);
    const saved = await loadGame();
    if (!saved) {
      gs.notify('セーブデータが見つかりません', 'warn');
      return;
    }

    const normalizedTeams = (saved.teams || []).map((team) => {
      const nonPitcherIds = (team.players || [])
        .filter((player) => !player.isPitcher)
        .map((player) => player.id);
      const fallback = (team.lineup || []).filter((id) =>
        nonPitcherIds.includes(id),
      );
      const lineupNoDh = (team.lineupNoDh || fallback)
        .filter((id) => nonPitcherIds.includes(id))
        .slice(0, 8);
      const lineupDh = (team.lineupDh || fallback)
        .filter((id) => nonPitcherIds.includes(id))
        .slice(0, 9);
      const rosterDhMode = team.rosterDhMode ?? team.dhEnabled ?? false;
      return {
        ...team,
        lineupNoDh,
        lineupDh,
        rosterDhMode,
        lineup: (rosterDhMode ? lineupDh : lineupNoDh).slice(),
      };
    });

    gs.setTeams(normalizedTeams);
    gs.setMyId(saved.myId);
    gs.setGameDay(saved.gameDay);
    gs.setYear(saved.year);

    const loadedSchedule = scheduleMod.generateSeasonSchedule(saved.year, normalizedTeams);
    gs.setSchedule(loadedSchedule);

    const loadedParams = SEASON_PARAMS[saved.year] || getDefaultParams(saved.year);
    gs.setAllStarTriggerDay(
      scheduleMod.calcAllStarTriggerDay(loadedSchedule, loadedParams.allStarSkipDates),
    );

    const openingForeignPool = playerMod.generateForeignFaPool(
      rng(FOREIGN_FA_COUNT_MIN, FOREIGN_FA_COUNT_MAX),
    );
    const shouldBackfillForeignFa =
      (saved.faPool?.length ?? 0) === 0 && saved.gameDay === 1;
    gs.setFaPool(shouldBackfillForeignFa ? openingForeignPool : saved.faPool || []);
    gs.setFaYears(saved.faYears || {});
    gs.setSeasonHistory(
      saved.seasonHistory || {
        awards: [],
        records: {
          singleSeasonHR: null,
          singleSeasonAVG: null,
          singleSeasonK: null,
          careerHR: {},
          careerW: {},
        },
        hallOfFame: [],
        championships: [],
        standingsHistory: [],
        transfers: [],
      },
    );
    gs.setNews(saved.news || []);
    gs.setMailbox(saved.mailbox || []);
    gs.setSaveRevision(Number(saved.saveRevision) || 0);
    gs.setCpuTradeOffers([]);

    sf.setPlayoff(null);
    os.setDraftPool(null);
    os.setDraftResult(null);
    os.setDevelopmentSummary(null);

    gs.setTab('dashboard');
    gs.setScreen('hub');
  };

  const app = { gs, sf, os, handleLoad };
  const hubProps = {
    state: { gs },
    flows: { sf, os },
    app,
  };

  if (gs.screen === 'hub') {
    return <HubShell {...hubProps} />;
  }

  return <AppScreenRouter app={app} />;
}
