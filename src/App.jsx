import { useRef, useState } from 'react';
import { ANNUAL_ECONOMY_RELEASE_ENABLED, contractEconomyMode } from './engine/contractEconomy';
import {migrateFarmCompetition} from './engine/farmMigration';
import './styles.css';
import { SEASON_PARAMS, getDefaultParams } from './data/scheduleParams.js';
import { FOREIGN_FA_COUNT_MIN, FOREIGN_FA_COUNT_MAX } from './constants';
import { rng } from './utils';
import { useGameState } from './hooks/useGameState';
import { useSeasonFlow } from './hooks/useSeasonFlow';
import { useOffseason } from './hooks/useOffseason';
import AppScreenRouter from './components/AppScreenRouter';
import HubShell from './components/hub/HubShell';
import { planningResumeScreen } from './engine/offseasonPlanning';

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
  // A failed resume must outlive the general notification's 3.5-second timer.
  const [loadError, setLoadError] = useState(null);
  const titleLoadEpoch = useRef(0);
  const titleDeletionInProgress = useRef(false);
  const clearLoadError = () => {
    titleLoadEpoch.current += 1;
    setLoadError(null);
  };
  const handleSaveDeletionStart = () => {
    titleDeletionInProgress.current = true;
    titleLoadEpoch.current += 1;
  };
  const handleSaveDeletionEnd = () => { titleDeletionInProgress.current = false; };

  const handleLoad = async () => {
    if (titleDeletionInProgress.current || gs.isNewGameInitializing()) return;
    const loadTokens = { sessionToken: gs.getProgressSessionToken(), progressToken: gs.getProgressToken() };
    const attempt = gs.getNewGameInitializationAttempt();
    const epoch = titleLoadEpoch.current;
    const loadIsStale = () => epoch !== titleLoadEpoch.current || gs.isNewGameInitializing() || attempt !== gs.getNewGameInitializationAttempt();
    return gs.runTitleLoad(async () => {
      try {
        const [{ loadGame, getLastLoadResult }, scheduleMod, playerMod] = await Promise.all([
          loadAppSaveModule(),
          loadAppScheduleModule(),
          loadAppPlayerModule(),
        ]);
        if (loadIsStale()) return;
        const saved = await loadGame();
        if (loadIsStale()) return;
        if (!saved) {
          const status = getLastLoadResult?.().status;
          setLoadError(status === 'conflict'
            ? '読込中にセーブが更新されたため、再開を止めました。別タブの保存完了を確認し、「続きから」で最新の保存を読み込んでください。'
            : status === 'unrecoverable' ? 'セーブとバックアップを復旧できませんでした。必要な履歴が欠損・破損しています。' : 'セーブデータが見つかりません');
          return;
        }

        if (contractEconomyMode(saved) === 'annual' && !ANNUAL_ECONOMY_RELEASE_ENABLED) {
          setLoadError('このバージョンでは新契約制度のセーブを再開できません。保存データは変更していません。');
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

        const loadedSchedule = saved.schedule ?? scheduleMod.generateSeasonSchedule(saved.year, normalizedTeams);
        const migrated = migrateFarmCompetition({...saved,teams:normalizedTeams,schedule:loadedSchedule});

        const loadedParams = SEASON_PARAMS[saved.year] || getDefaultParams(saved.year);
        const loadedAllStarTriggerDay = scheduleMod.calcAllStarTriggerDay(loadedSchedule, loadedParams.allStarSkipDates);

        const openingForeignPool = playerMod.generateForeignFaPool(
          rng(FOREIGN_FA_COUNT_MIN, FOREIGN_FA_COUNT_MAX),
        );
        const shouldBackfillForeignFa =
          (saved.faPool?.length ?? 0) === 0 && saved.gameDay === 1;
        const hydrated = gs.hydrateSavedWorld({
          ...migrated,
          battedBallReceipt: saved.battedBallReceipt ?? null,
          offseasonPlan: planningResumeScreen(saved.offseasonPlan, saved.year, saved.myId) === 'hub' ? null : saved.offseasonPlan,
          faPool: shouldBackfillForeignFa ? openingForeignPool : saved.faPool || [],
          faYears: saved.faYears || {},
          seasonHistory: saved.seasonHistory || {
            awards: [], records: { singleSeasonHR: null, singleSeasonAVG: null, singleSeasonK: null, careerHR: {}, careerW: {} },
            hallOfFame: [], championships: [], standingsHistory: [], transfers: [],
          },
          news: saved.news || [], mailbox: saved.mailbox || [],
        }, loadTokens);
        if (!hydrated) throw new Error('save_hydration_rejected');
        gs.setAllStarTriggerDay(loadedAllStarTriggerDay);
        gs.setCpuTradeOffers([]);

        sf.setPlayoff(null);
        os.resetTransientOffseason();

        setLoadError(null);
        gs.setTab('dashboard');
        gs.setScreen(planningResumeScreen(saved.offseasonPlan, saved.year, saved.myId));
        if (getLastLoadResult?.().status === 'recovered') gs.notify('バックアップから復旧しました。その後の未保存の変更は含まれません。', 'warn');
      } catch (error) {
        if (!loadIsStale()) {
          console.error('セーブデータの読み込みに失敗しました:', error);
          setLoadError('セーブデータを読み込めませんでした。再試行してください');
        }
      }
    }, epoch);
  };

  const app = { gs, sf, os, handleLoad, loadError, clearLoadError, handleSaveDeletionStart, handleSaveDeletionEnd };
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
