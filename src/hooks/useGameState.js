import { draftCapacityContext, evaluateRosterCapacity, isIkuseiPlayer } from '../engine/rosterCapacity';
import { stadiumUpgradeCosts } from '../engine/clubFinance';
import { marketRosterError } from '../engine/marketRoster';
import {createFarmCompetition} from '../engine/farmRecords';
import {validateFarmSaveState} from '../engine/farmMigration';
import { contractEconomyMode, reduceEconomyCommand } from '../engine/contractEconomy';
import { validateEconomySave } from '../engine/economyPersistence';
import { saveFeedback } from '../engine/saveFeedback';
import { emptyBattedBallReceipt, validateBattedBallReceipt } from '../engine/battedBallRun';
import { useState, useReducer, useMemo, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { contractReplyIsDue, resolveContractReplies } from '../engine/contractReplies';
import { yieldToBrowser } from '../engine/yieldToBrowser';
import { gameStateReducer, G, interviewChoice, canApplyLegacyProgress } from './gameStateReducer';
import { MATCH_HISTORY_FIELDS, matchHistorySnapshot, mergeMatchResultPatch } from '../engine/matchHistory';
import { createSaveDirtyTracker } from '../state/saveDirtyTracker';
import { OFFSEASON_SAVE_SCREENS } from '../engine/offseasonResume';
import { uid, clamp, rng, pname, scoutedValue } from '../utils';
// Player helpers are loaded lazily to keep the initial title flow lighter.
import { SEASON_PARAMS, getDefaultParams } from '../data/scheduleParams.js';
import {
  TEAM_DEFS, POSITIONS, COACH_DEFS, COACH_GRADES, SCOUT_REGIONS,
  MAX_ROSTER, MAX_外国人_一軍, MIN_SALARY_SHIHAKA,
  MAX_SHIHAKA_TOTAL, REGISTRATION_COOLDOWN_DAYS, TALK_COOLDOWN_DAYS,
  PRESS_CONFERENCE_INTERVAL,
  FOREIGN_FA_COUNT_MIN, FOREIGN_FA_COUNT_MAX,
  MAX_BATTED_BALL_EVENTS, MAX_SPRAY_POINTS,
} from '../constants';
import { compactBattedBallEvent } from '../engine/postGame';
import { createSaveId, ensureSaveId } from '../engine/saveIdentity';
import { MANAGEMENT_POLICIES } from '../engine/managementPolicy';
import { ROSTER_AUTOMATION_MODES } from '../engine/rosterAutomation';
import { isTeamIdSet } from '../engine/teamId';
import {
  buildCareerLogSummary,
  collectCareerLogsForIndexedDb,
  getRecentCareerLog,
  normalizeCareerLogSummary,
} from '../engine/careerStats';

function slimPlayerForState(player) {
  if (!player || typeof player !== 'object') return player;
  const stats = player.stats && typeof player.stats === 'object' ? player.stats : {};
  const fullCareerLog = Array.isArray(player.careerLog) ? player.careerLog : [];
  const recentCareerLog = getRecentCareerLog(
    Array.isArray(player.recentCareerLog) ? player.recentCareerLog : fullCareerLog,
  );
  const careerLogSummary = normalizeCareerLogSummary(
    player.careerLogSummary ?? buildCareerLogSummary(fullCareerLog),
  );
  return {
    ...player,
    // React state軽量化: 全量履歴はIndexedDB側を参照する
    careerLog: [],
    recentCareerLog,
    careerLogSummary,
    trimmedCareerLogSummary: careerLogSummary,
    stats: {
      ...stats,
      sprayPoints: Array.isArray(stats.sprayPoints) ? stats.sprayPoints.slice(-MAX_SPRAY_POINTS) : [],
      battedBallEvents: Array.isArray(stats.battedBallEvents)
        ? stats.battedBallEvents
          .slice(-MAX_BATTED_BALL_EVENTS)
          .map(compactBattedBallEvent)
          .filter(Boolean)
        : [],
    },
  };
}

function slimTeamForState(team) {
  if (!team || typeof team !== 'object') return team;
  const nextPlayers = Array.isArray(team.players) ? team.players.map(slimPlayerForState) : [];
  const nextFarm = Array.isArray(team.farm) ? team.farm.map(slimPlayerForState) : [];
  const playersChanged = nextPlayers.length !== (team.players?.length || 0) || nextPlayers.some((player, index) => player !== team.players[index]);
  const farmChanged = nextFarm.length !== (team.farm?.length || 0) || nextFarm.some((player, index) => player !== team.farm[index]);
  return {
    ...team,
    players: playersChanged ? nextPlayers : (team.players || []),
    farm: farmChanged ? nextFarm : (team.farm || []),
  };
}

function slimTeamsForState(teams) {
  if (!Array.isArray(teams)) return [];
  return teams.map(slimTeamForState);
}

const EMPTY_PERSISTENT_SUMMARIES = {
  seasonHistory: null,
  news: null,
  mailbox: null,
  scheduleArchive: null,
  gameResultsMap: null,
};

let saveModulePromise = null;
let scheduleModulePromise = null;
let pressConferenceModulePromise = null;
let playerModulePromise = null;
let persistentDataStoreModulePromise = null;

function loadSaveModule() {
  if (!saveModulePromise) saveModulePromise = import('../engine/saveload');
  return saveModulePromise;
}

function loadScheduleModule() {
  if (!scheduleModulePromise) scheduleModulePromise = import('../engine/scheduleGen');
  return scheduleModulePromise;
}

function loadPressConferenceModule() {
  if (!pressConferenceModulePromise) pressConferenceModulePromise = import('../engine/pressConference');
  return pressConferenceModulePromise;
}

function loadPlayerModule() {
  if (!playerModulePromise) playerModulePromise = import('../engine/player');
  return playerModulePromise;
}

function loadPersistentDataStoreModule() {
  if (!persistentDataStoreModulePromise) persistentDataStoreModulePromise = import('../state/persistentDataStore');
  return persistentDataStoreModulePromise;
}

function sliceCollection(items, options = {}) {
  const safeItems = Array.isArray(items) ? items : [];
  const limit = Number.isFinite(Number(options?.limit)) ? Math.max(0, Number(options.limit)) : safeItems.length;
  const offset = Number.isFinite(Number(options?.offset)) ? Math.max(0, Number(options.offset)) : 0;
  return safeItems.slice(offset, offset + limit);
}

// Shared by ordinary saves and acknowledged annual commits. Archive failures
// never turn a published economic transaction into a purported rollback.
async function flushCommittedArchives(state) {
  try {
    const archive = await import('../engine/battedBallArchive');
    const receipts = await import('../engine/battedBallReceipts');
    const scope = { saveId: state.saveId };
    let receiptResult = await receipts.flushBattedBallReceipts(state.battedBallReceipt, scope);
    const status = archive.getBattedBallQueueStatus(scope);
    let archiveResult = status.failedRecords > 0
      ? await archive.retryFailedBattedBallWrites(scope)
      : await archive.flushBattedBallQueue(scope);
    let settled = archive.getBattedBallQueueStatus(scope);
    while (settled.isWriting || settled.queuedRecords > 0) {
      archiveResult = await archive.flushBattedBallQueue(scope);
      settled = archive.getBattedBallQueueStatus(scope);
    }
    if (!receiptResult.ok && archiveResult?.ok !== false && !settled.failedRecords)
      receiptResult = await receipts.flushBattedBallReceipts(state.battedBallReceipt, scope);
    return { ...archiveResult, ok: receiptResult.ok && archiveResult?.ok !== false && !(settled.failedRecords > 0) };
  } catch (error) {
    console.warn('打球アーカイブのフラッシュに失敗しました。試合セーブは完了しています。', error);
    return { ok: false };
  }
}

export function useGameState() {
  const [screen, setScreenState] = useState("title");
  const screenRef = useRef('title');
  const setScreen = useCallback(value => {
    if (economyCommitRef.current) return false;
    // Async title loads may retain an older callback across navigation.
    const next = typeof value === 'function' ? value(screenRef.current) : value;
    screenRef.current = next;
    setScreenState(next);
    return true;
  }, []);
  const [retireModal, setRetireModal] = useState(null);
  const [playerModal, setPlayerModal] = useState(null);
  const [viewingTeam, setViewingTeam] = useState(null);  // チーム詳細画面で表示中のチーム
  const [pregameError, setPregameError] = useState(null); // 試合開始バリデーションエラー { message }
  const [allTeamResultsMap, setAllTeamResultsMapState] = useState({}); // { [teamId]: { [gameDay]: boxScoreResult } }
  const [allTeamBoxScoresMap, setAllTeamBoxScoresMapState] = useState({});
  const [retireGamePlayer, setRetireGamePlayer] = useState(null);
  const [retireRole, setRetireRole] = useState(null);
  const [gameState, dispatch] = useReducer(
    gameStateReducer,
    undefined,
    () => ({ teams: [], news: [], gameDay: 1, year: 2026, myId: null, saveId: createSaveId(),
      faPool: [], faYears: {}, offseasonPlan: null, mailbox: [], schedule: null }),
  );
  const { teams, news, gameDay, year, myId, saveId, farmCompetition, battedBallReceipt,
    faPool, faYears, offseasonPlan, mailbox, schedule, contractEconomy } = gameState;
  const setFaPool = useCallback(value => {
    if (economyCommitRef.current) return false;
    dispatch({ type: G.SET_FA_POOL, value });
    return true;
  }, []);
  const setFaYearsState = useCallback(value => {
    if (economyCommitRef.current) return false;
    dispatch({ type: G.SET_FA_YEARS, value });
    return true;
  }, []);
  const setOffseasonPlanState = useCallback(value => {
    if (economyCommitRef.current) return false;
    dispatch({ type: G.SET_OFFSEASON_PLAN, value });
    return true;
  }, []);
  const setMailboxState = useCallback(value => {
    if (economyCommitRef.current) return false;
    dispatch({ type: G.SET_MAILBOX, value });
    return true;
  }, []);
  const setSchedule = useCallback(value => {
    if (economyCommitRef.current) return false;
    dispatch({ type: G.SET_SCHEDULE, value });
    return true;
  }, []);
  const rosterCommandRef = useRef(gameState);
  const economyCommitRef = useRef(null);
  const pendingEconomyAdoptionRef = useRef(null);
  const economySnapshotRef = useRef(null);
  const economyMountedRef = useRef(false);
  const setNewsState = useCallback(value => {
    if (economyCommitRef.current) return false;
    const current = rosterCommandRef.current;
    const nextNews = typeof value === 'function' ? value(current.news) : value;
    rosterCommandRef.current = { ...current, news: nextNews };
    dispatch({ type: G.SET_NEWS, news: nextNews });
  }, []);
  const farmFields = farmCompetition ? {farmCompetition,farmCompetitionVersion:1} : {};
  const progressTokenRef = useRef(0);
  const progressSessionRef = useRef(0);
  const getProgressSessionToken = useCallback(()=>progressSessionRef.current,[]);
  const progressDispatch = useCallback(action => {
    if (economyCommitRef.current && action.type !== G.APPLY_ECONOMY_WORLD) return false;
    progressTokenRef.current++;
    dispatch(action);
    return true;
  }, []);
  const getProgressToken = useCallback(()=>progressTokenRef.current,[]);
  const [saveDirty, setSaveDirty] = useState(false);
  const saveDirtyRef = useRef(saveDirty);
  saveDirtyRef.current = saveDirty;
  const [lastAutoSaveAt, setLastAutoSaveAt] = useState(0);
  const [saveRevision, setSaveRevision] = useState(0);
  const setPublicSaveDirty = useCallback(value => {
    if (economyCommitRef.current) return false;
    setSaveDirty(value);
  }, []);
  const setPublicSaveRevision = useCallback(value => {
    if (economyCommitRef.current) return false;
    setSaveRevision(value);
  }, []);
  const saveDirtyTrackerRef = useRef(null);
  // Count applied updates, not the latest requested version: concurrent React
  // can commit an urgent update while an earlier transition is still pending.
  const [committedMutationCount, setCommittedMutationCount] = useState(0);
  const pendingCareerEntriesRef = useRef([]);
  if (saveDirtyTrackerRef.current === null) {
    saveDirtyTrackerRef.current = createSaveDirtyTracker();
  }
  const markSaveDirty = useCallback((scopes = [])=>{
    if (economyCommitRef.current) return false;
    saveDirtyTrackerRef.current.mark(scopes);
    setCommittedMutationCount(count => count + 1);
    setSaveRevision(prev=>prev+1);
    setSaveDirty(true);
  },[]);
  const stageCareerEntries = useCallback(entries => {
    if (economyCommitRef.current) return false;
    pendingCareerEntriesRef.current.push(...structuredClone(entries));
    markSaveDirty();
  },[markSaveDirty]);
  const setFarmCompetition = useCallback(competition => {progressDispatch({type:G.SET_FARM_COMPETITION,competition});markSaveDirty();},[progressDispatch,markSaveDirty]);
  const applyProgressCandidate = useCallback((candidate,{baseToken}={}) => {
    if(baseToken!=null&&baseToken!==progressTokenRef.current)return false;
    if(!canApplyLegacyProgress(rosterCommandRef.current,candidate))return false;
    validateFarmSaveState(candidate);
    if ('battedBallReceipt' in candidate) validateBattedBallReceipt(candidate.battedBallReceipt, candidate.saveId ?? rosterCommandRef.current.saveId);
    progressDispatch({type:G.APPLY_PROGRESS,candidate:{...candidate,...('teams' in candidate?{teams:slimTeamsForState(candidate.teams)}:{})}});
    markSaveDirty();return true;
  },[progressDispatch,markSaveDirty]);
  const setTeams   = useCallback((n) => { if (economyCommitRef.current) return false; progressDispatch({ type: G.SET_TEAMS, teams: (prev) => slimTeamsForState(typeof n === 'function' ? n(prev) : n) }); markSaveDirty(); },    [markSaveDirty]);
  const setGameDay = useCallback((n) => { progressDispatch({ type: G.SET_GAME_DAY, day: n }); markSaveDirty(); }, [markSaveDirty]);
  const setYear    = useCallback((n) => { progressDispatch({ type: G.SET_YEAR, year: n }); markSaveDirty(); }, [markSaveDirty]);
  const setMyId    = useCallback((id) => { progressDispatch({ type: G.SET_MY_ID, myId: id }); markSaveDirty(); }, [markSaveDirty]);
  const setSaveId  = useCallback((id) => { if (economyCommitRef.current) return false; pendingCareerEntriesRef.current=[];progressSessionRef.current++;progressDispatch({ type: G.SET_SAVE_ID, saveId: ensureSaveId(id) }); }, []);
  const [tab, setTab] = useState("dashboard");
  const setFaYears = useCallback(value => { setFaYearsState(value); markSaveDirty(); }, [markSaveDirty]);
  const setOffseasonPlan = useCallback(value => { setOffseasonPlanState(value); markSaveDirty(); }, [markSaveDirty]);
  const [notif, setNotif] = useState(null);
  const [seasonHistory, setSeasonHistoryState] = useState({awards:[],records:{singleSeasonHR:null,singleSeasonAVG:null,singleSeasonK:null,careerHR:{},careerW:{}},hallOfFame:[],championships:[],standingsHistory:[],transfers:[]});
  const [saveExists, setSaveExists] = useState(false);
  const [recentResults, setRecentResultsState] = useState([]);
  const [gameResultsMap, setGameResultsMapState] = useState({});
  const [scheduleArchive, setScheduleArchiveState] = useState([]); // 過去シーズン: [{year, schedule, gameResultsMap, myTeamResultsMap}]
  const [cpuTradeOffers, setCpuTradeOffers] = useState([]);
  const [pressEvent, setPressEventState] = useState(null);  // 記者会見イベント
  const [lastPressDay, setLastPressDayState] = useState(0); // 最後に記者会見を行ったgameDay
  const [allStarDone, setAllStarDoneState] = useState(false);
  const [allStarResult, setAllStarResultState] = useState(null);
  const [allStarTriggerDay, setAllStarTriggerDay] = useState(72);
  const [isAutoSaveSuspended, setIsAutoSaveSuspendedState] = useState(false);
  const autoSaveSuspendedRef = useRef(false);
  const setIsAutoSaveSuspended = useCallback(value => {
    const next = typeof value === 'function' ? value(autoSaveSuspendedRef.current) : value;
    autoSaveSuspendedRef.current = next;
    setIsAutoSaveSuspendedState(next);
  }, []);
  const [saveQueueState, setSaveQueueState] = useState({ isSaving: false });
  // Display-only outcome from the actual save request; never persisted.
  const [saveResult, setSaveResult] = useState(null);
  const saveRequestRef = useRef(0);
  const pendingSaveRequestsRef = useRef(new Set());
  const [persistentEnabled, setPersistentEnabled] = useState(false);
  const [newGameInitializationError, setNewGameInitializationError] = useState(null);
  const [newGameInitializationStatus, setNewGameInitializationStatus] = useState('idle');
  const newGameInitializationRef = useRef(false);
  const newGameInitializationAttemptRef = useRef(0);
  const titleLoadPromiseRef = useRef(null);
  const titleLoadKeyRef = useRef(null);
  const isNewGameInitializing = useCallback(() => newGameInitializationRef.current, []);
  const getNewGameInitializationAttempt = useCallback(() => newGameInitializationAttemptRef.current, []);
  const runTitleLoad = useCallback(async (operation, key) => {
    const previous = titleLoadPromiseRef.current;
    if (previous && titleLoadKeyRef.current === key) return previous;
    // A retry after confirmed deletion must not join the invalidated request.
    // Still wait for that read, preserving new-game initialization's load barrier.
    const task = (previous ? previous.catch(() => {}) : Promise.resolve()).then(operation);
    titleLoadPromiseRef.current = task;
    titleLoadKeyRef.current = key;
    try { return await task; }
    finally { if (titleLoadPromiseRef.current === task) titleLoadPromiseRef.current = null; }
  }, []);

  const setAllTeamResultsMap = useCallback(value => { if (economyCommitRef.current) return false; setAllTeamResultsMapState(value); markSaveDirty(["matchHistory"]); }, [markSaveDirty]);
  const setAllTeamBoxScoresMap = useCallback(value => { if (economyCommitRef.current) return false; setAllTeamBoxScoresMapState(value); markSaveDirty(["matchHistory"]); }, [markSaveDirty]);
  const setRecentResults = useCallback(value => { if (economyCommitRef.current) return false; setRecentResultsState(value); markSaveDirty(["matchHistory"]); }, [markSaveDirty]);
  const setGameResultsMap = useCallback(value => { if (economyCommitRef.current) return false; setGameResultsMapState(value); markSaveDirty(["matchHistory"]); }, [markSaveDirty]);
  const setScheduleArchive = useCallback(value => { if (economyCommitRef.current) return false; setScheduleArchiveState(value); markSaveDirty(["matchHistory"]); }, [markSaveDirty]);
  const setPressEvent = useCallback(value => { if (economyCommitRef.current) return false; setPressEventState(value); markSaveDirty(["matchHistory"]); }, [markSaveDirty]);
  const setLastPressDay = useCallback(value => { if (economyCommitRef.current) return false; setLastPressDayState(value); markSaveDirty(["matchHistory"]); }, [markSaveDirty]);
  const setAllStarDone = useCallback(value => { if (economyCommitRef.current) return false; setAllStarDoneState(value); markSaveDirty(["matchHistory"]); }, [markSaveDirty]);
  const setAllStarResult = useCallback(value => { if (economyCommitRef.current) return false; setAllStarResultState(value); markSaveDirty(["matchHistory"]); }, [markSaveDirty]);
  const getMatchHistorySnapshot = useCallback(() => matchHistorySnapshot({
    gameResultsMap, allTeamResultsMap, allTeamBoxScoresMap, scheduleArchive, recentResults,
    allStarDone, allStarResult, lastPressDay, pressEvent,
  }), [gameResultsMap, allTeamResultsMap, allTeamBoxScoresMap, scheduleArchive, recentResults,
    allStarDone, allStarResult, lastPressDay, pressEvent]);
  const hydrateMatchHistory = useCallback(saved => {
    if (economyCommitRef.current) return false;
    const next = matchHistorySnapshot(saved);
    setAllTeamResultsMapState(next.allTeamResultsMap);
    setAllTeamBoxScoresMapState(next.allTeamBoxScoresMap);
    setRecentResultsState(next.recentResults);
    setGameResultsMapState(next.gameResultsMap);
    setScheduleArchiveState(next.scheduleArchive);
    setPressEventState(next.pressEvent);
    setLastPressDayState(next.lastPressDay);
    setAllStarDoneState(next.allStarDone);
    setAllStarResultState(next.allStarResult);
  }, []);
  const applyMatchResultPatch = useCallback(patch => {
    if (economyCommitRef.current) return false;
    const next = mergeMatchResultPatch(getMatchHistorySnapshot(), patch);
    hydrateMatchHistory(next);
    markSaveDirty(['matchHistory']);
    return next;
  }, [getMatchHistorySnapshot, hydrateMatchHistory, markSaveDirty]);

  const persistentStoreRef = useRef(null);
  const [persistentSummaries, setPersistentSummaries] = useState(EMPTY_PERSISTENT_SUMMARIES);
  const setSeasonHistory = useCallback((nextValue) => {
    if (economyCommitRef.current) return false;
    setSeasonHistoryState(nextValue);
    markSaveDirty(['seasonHistory']);
  }, [markSaveDirty]);
  const setNews = useCallback((nextValue) => {
    if (economyCommitRef.current) return false;
    setNewsState(nextValue);
    markSaveDirty(['news']);
  }, [markSaveDirty]);
  const setMailbox = useCallback((nextValue) => {
    if (economyCommitRef.current) return false;
    setMailboxState(nextValue);
    markSaveDirty(['mailbox']);
  }, [markSaveDirty]);
  const hydrateLargeSaveData = useCallback((nextValue = {}) => {
    if (economyCommitRef.current) return false;
    setSeasonHistoryState(nextValue.seasonHistory ?? {});
    setNewsState(Array.isArray(nextValue.news) ? nextValue.news : []);
    setMailboxState(Array.isArray(nextValue.mailbox) ? nextValue.mailbox : []);
  }, []);
  const resetSaveTracking = useCallback(() => {
    if (economyCommitRef.current) return false;
    saveRequestRef.current++;
    saveDirtyTrackerRef.current.reset();
    setCommittedMutationCount(count => count + 1);
    setSaveDirty(false);
    setSaveResult(null);
  }, []);

  // Load-only boundary. A transaction must use commitEconomyCandidate and its
  // published-root acknowledgement, never reset the session through this API.
  const hydrateSavedWorld = useCallback((saved, expected) => {
    if (economyCommitRef.current) return false;
    if (screenRef.current !== 'title' || !expected
      || expected.sessionToken !== progressSessionRef.current
      || expected.progressToken !== progressTokenRef.current
      || newGameInitializationRef.current || pendingSaveRequestsRef.current.size) return false;
    let world;
    try {
      world = structuredClone(saved);
      const mode = validateEconomySave(world);
      validateFarmSaveState(world);
      if ('battedBallReceipt' in world) validateBattedBallReceipt(world.battedBallReceipt, world.saveId);
      if (!Array.isArray(world.teams) || !Array.isArray(world.faPool)
        || !Array.isArray(world.news) || !Array.isArray(world.mailbox)
        || typeof world.saveId !== 'string' || !world.saveId
        || !Number.isInteger(world.year) || !Number.isInteger(world.gameDay)) return false;
      const isRecord = item => item !== null && typeof item === 'object' && !Array.isArray(item);
      // These rows are consumed immediately by badge/notification rendering.
      // Reject malformed elements before resetting the live session or dirty data.
      const rosterRows = rows => (mode === 'legacy' && rows == null) || (Array.isArray(rows) && rows.every(isRecord));
      if (!world.mailbox.every(isRecord) || !world.news.every(isRecord)
        || !world.faPool.every(isRecord) || !world.teams.every(team => isRecord(team)
          && rosterRows(team.players) && rosterRows(team.farm))) return false;
      // Preserve annual evidence exactly; legacy player history stays slim.
      if (mode === 'legacy') world.teams = slimTeamsForState(world.teams);
    } catch { return false; }
    progressSessionRef.current++;
    progressTokenRef.current++;
    pendingCareerEntriesRef.current = [];
    rosterCommandRef.current = { ...world, progressToken: progressTokenRef.current };
    dispatch({ type: G.HYDRATE_SAVED_WORLD, world });
    setSeasonHistoryState(world.seasonHistory ?? {});
    hydrateMatchHistory(world);
    setSaveRevision(Number(world.saveRevision) || 0);
    resetSaveTracking();
    setSaveExists(true);
    return true;
  }, [hydrateMatchHistory, resetSaveTracking]);

  useEffect(() => {
    let alive = true;
    loadSaveModule()
      .then((mod) => {
        if (!alive) return;
        setSaveExists(mod.hasSave());
        const queue = mod.getSaveQueueSnapshot();
        setSaveQueueState({ ...queue, isSaving: queue.isSaving || ['saving', 'recovering'].includes(economyCommitRef.current?.status) || pendingSaveRequestsRef.current.has(saveRequestRef.current) });
      })
      .catch((error) => {
        console.error('Failed to load save module:', error);
      });
    return () => {
      alive = false;
    };
  }, []);

  const getPersistentStore = useCallback(() => {
    return persistentStoreRef.current;
  }, []);

  const ensurePersistentStore = useCallback(async () => {
    if (persistentStoreRef.current) return persistentStoreRef.current;
    const mod = await loadPersistentDataStoreModule();
    persistentStoreRef.current = mod.createPersistentDataStore();
    return persistentStoreRef.current;
  }, []);

  const enablePersistentStore = useCallback(() => {
    if (persistentEnabled) return;
    ensurePersistentStore()
      .then((store) => {
        setPersistentSummaries(store.getSummaries());
        setPersistentEnabled(true);
      })
      .catch((error) => {
        console.error('Failed to enable persistent store:', error);
      });
  }, [ensurePersistentStore, persistentEnabled]);

  const syncPersistentSummary = useCallback((key, value) => {
    const store = getPersistentStore();
    if (!store) return;
    let nextPartial = null;
    if (key === 'seasonHistory') nextPartial = { seasonHistory: store.setSeasonHistory(value) };
    if (key === 'news') nextPartial = { news: store.setNews(value) };
    if (key === 'mailbox') nextPartial = { mailbox: store.setMailbox(value) };
    if (key === 'scheduleArchive') nextPartial = { scheduleArchive: store.setScheduleArchive(value) };
    if (key === 'gameResultsMap') nextPartial = { gameResultsMap: store.setGameResultsMap(value) };
    if (!nextPartial) return;
    setPersistentSummaries(prev => ({ ...prev, ...nextPartial }));
  }, [getPersistentStore]);

  const getNewsBySelector = useCallback((options = {}) => {
    const store = getPersistentStore();
    return store ? store.selectNewsList(options) : sliceCollection(news, options);
  }, [getPersistentStore, news]);
  const getMailboxBySelector = useCallback((options = {}) => {
    const store = getPersistentStore();
    return store ? store.selectMailboxList(options) : sliceCollection(mailbox, options);
  }, [getPersistentStore, mailbox]);
  const getMailboxItemById = useCallback((id) => {
    const store = getPersistentStore();
    return store ? store.getMailboxById(id) : mailbox.find(item => item.id === id);
  }, [getPersistentStore, mailbox]);
  const getSeasonHistory = useCallback(() => {
    const store = getPersistentStore();
    return store ? store.getSeasonHistory() : seasonHistory;
  }, [getPersistentStore, seasonHistory]);
  const getGameResultsMap = useCallback(() => {
    return gameResultsMap;
  }, [gameResultsMap]);
  const getScheduleArchive = useCallback(() => {
    return scheduleArchive;
  }, [scheduleArchive]);
  const getUnreadMailboxCount = useCallback((currentGameDay) => {
    const store = getPersistentStore();
    if (store) return store.selectUnreadMailboxCount(currentGameDay);
    return mailbox.reduce((count, item) => {
      const deliverOnDay = Number(item?.deliverOnDay ?? 0);
      return item?.read === false && deliverOnDay <= currentGameDay ? count + 1 : count;
    }, 0);
  }, [getPersistentStore, mailbox]);
  const getLatestNewsId = useCallback(() => {
    const store = getPersistentStore();
    return store ? store.selectLatestNewsId() : (news[0]?.id ?? null);
  }, [getPersistentStore, news]);
  const refreshSaveQueueState = useCallback(() => {
    loadSaveModule()
      .then((mod) => {
        const queue = mod.getSaveQueueSnapshot();
        setSaveQueueState({ ...queue, isSaving: queue.isSaving || ['saving', 'recovering'].includes(economyCommitRef.current?.status) || pendingSaveRequestsRef.current.has(saveRequestRef.current) });
      })
      .catch((error) => {
        console.error('Failed to refresh save queue state:', error);
      });
  }, []);
  const queueSave = useCallback((state, options = {}, snapshot) => {
    const { requestId, sessionToken } = snapshot;
    const isCurrent = () => requestId === saveRequestRef.current && sessionToken === progressSessionRef.current;
    pendingSaveRequestsRef.current.add(requestId);
    setSaveResult(null);
    setSaveQueueState(prev => ({ ...prev, isSaving: true }));
    const pending=[...pendingCareerEntriesRef.current];
    const saveOptions={...options,careerEntries:[...pending,...(options.careerEntries || [])]};
    return loadSaveModule()
      .then((mod) => {
        if (sessionToken !== progressSessionRef.current) return { ok: false, reason: 'session_changed' };
        const task = mod.enqueueSaveGame(state, saveOptions);
        setSaveQueueState({ ...mod.getSaveQueueSnapshot(), isSaving: true });
        return task;
      })
      .then(async (result) => {
        if (!result?.ok || sessionToken !== progressSessionRef.current) return result;
        const committed=new Set(pending);
        pendingCareerEntriesRef.current=pendingCareerEntriesRef.current.filter(entry=>!committed.has(entry));
        return { ...result, archive: await flushCommittedArchives(state) };
      })
      .then((result) => {
        if (result?.ok === false && result.diagnostics) {
          result = { ...result, diagnostics: { ...result.diagnostics, dirty: saveDirtyRef.current } };
          console.warn('[SaveStatusDiagnostic]', result.diagnostics);
        }
        if (isCurrent()) setSaveResult(result ?? { ok: false });
        return result;
      })
      .catch((error) => { if (isCurrent()) setSaveResult({ ok: false }); throw error; })
      .finally(() => {
        pendingSaveRequestsRef.current.delete(requestId);
        refreshSaveQueueState();
      });
  }, [refreshSaveQueueState]);
  const beginTrackedSave = useCallback((extraOptions = {}) => {
    const snapshot = saveDirtyTrackerRef.current.snapshot({ persistAll: !saveExists });
    snapshot.requestId = ++saveRequestRef.current;
    snapshot.sessionToken = progressSessionRef.current;
    const options = { ...extraOptions };
    if (Array.isArray(snapshot.dirtyScopes)) {
      options.dirtyScopes = snapshot.dirtyScopes;
    }
    return { snapshot, options };
  }, [saveExists]);
  const completeTrackedSave = useCallback((snapshot) => {
    if (snapshot?.requestId !== saveRequestRef.current || snapshot?.sessionToken !== progressSessionRef.current) return { isCurrent: false };
    const result = saveDirtyTrackerRef.current.complete(snapshot);
    if (result.isCurrent) setSaveDirty(false);
    return result;
  }, []);


  // Only a committed render is evidence for storage acknowledgement. A render
  // may suspend or be discarded, and must never leak a speculative world here.
  const renderedMutationVersion = committedMutationCount;
  const renderedProgressToken = progressTokenRef.current;
  useLayoutEffect(() => {
    const context = economyCommitRef.current;
    const adoption = context?.adoption;
    const adopted = adoption && gameState.saveId === adoption.committed.saveId
      && gameState.contractEconomy?.epoch === adoption.committed.epoch
      && gameState.contractEconomy?.revision === adoption.committed.revision
      && context.adoptionWorlds.some(world => gameState.teams === world.teams);
    if (adopted && !context.adoptionObserved) {
      context.adoptionObserved = true;
      progressTokenRef.current++;
    }
    economySnapshotRef.current = {
      world: { ...gameState, seasonHistory, saveRevision, ...getMatchHistorySnapshot() },
      mutationVersion: renderedMutationVersion, progressToken: adopted ? progressTokenRef.current : renderedProgressToken,
      sessionToken: progressSessionRef.current, isAutoSaveSuspended, saveExists,
    };
    if (adopted) pendingEconomyAdoptionRef.current?.resolve(true);
  });

  const economyCommitBindings = useCallback(() => ({
    readCurrent: () => economyMountedRef.current ? {
      world: economySnapshotRef.current?.world,
      sessionToken: progressSessionRef.current,
      progressToken: progressTokenRef.current,
    } : null,
    adopt: async (world, committed, canAdopt) => {
      if (!economyMountedRef.current || !canAdopt() || pendingEconomyAdoptionRef.current) return false;
      const before = economySnapshotRef.current.world;
      const expected = { saveId: before.saveId, epoch: before.contractEconomy?.epoch,
        baseRevision: before.contractEconomy?.revision };
      const action = { type: G.APPLY_ECONOMY_WORLD, world, expected };
      const next = gameStateReducer(before, action);
      if (next === before || next.contractEconomy?.revision !== committed.revision
        || next.saveId !== committed.saveId || next.contractEconomy?.epoch !== committed.epoch
        || JSON.stringify(next.contractEconomy.engine.transactions.map(row => row.id))
          !== JSON.stringify(committed.receiptIds) || !canAdopt()) return false;
      // Keep the adoption evidence after a deadline: a delayed React commit can
      // still be acknowledged by explicit recovery, without a second write.
      const context = economyCommitRef.current;
      context.adoption = { world, committed };
      (context.adoptionWorlds ??= []).push(world);
      return new Promise(resolve => {
        const finish = ok => {
          clearTimeout(expiration);
          if (pendingEconomyAdoptionRef.current?.resolve === finish) pendingEconomyAdoptionRef.current = null;
          resolve(ok);
        };
        const expiration = setTimeout(() => finish(false), 10000);
        pendingEconomyAdoptionRef.current = { world, committed, resolve: finish };
        // Increment the progress fence only once React commits the world.
        dispatch(action);
      });
    },
  }), []);

  useLayoutEffect(() => {
    economyMountedRef.current = true;
    return () => {
      economyMountedRef.current = false;
      pendingEconomyAdoptionRef.current?.resolve(false);
    };
  }, []);

  const finalizeEconomyCommit = useCallback(async (context, result) => {
    const ack = result?.committed, next = context.world.contractEconomy;
    if (!result?.ok || !ack || !/^[a-f0-9]{64}$/.test(ack.rootSignature)
      || ack.saveId !== context.expected.saveId || ack.epoch !== context.expected.epoch
      || ack.revision !== next.revision
      || JSON.stringify(ack.receiptIds) !== JSON.stringify(next.engine.transactions.map(row => row.id)))
      return { ok: false, reason: 'economy_ack_invalid' };
    const persisted = new Set(context.pendingCareerEntries);
    pendingCareerEntriesRef.current = pendingCareerEntriesRef.current.filter(entry => !persisted.has(entry));
    const completed = saveDirtyTrackerRef.current.complete(context.dirtySnapshot);
    if (completed.isCurrent) setSaveDirty(false);
    setSaveExists(true);
    const archive = await flushCommittedArchives(context.world);
    const confirmed = { ...result, archive };
    setSaveResult(confirmed);
    return confirmed;
  }, []);

  // Internal annual-fixture transaction route. UI/CPU/Worker remain gated OFF
  // until A1-2/A1-3 integrate all producers.
  const commitEconomyCommand = useCallback(async command => {
    if (economyCommitRef.current) return { ok: false, reason: 'economy_commit_pending' };
    const snapshot = economySnapshotRef.current;
    if (!economyMountedRef.current || !snapshot || newGameInitializationRef.current
      || pendingSaveRequestsRef.current.size || autoSaveSuspendedRef.current
      || snapshot.progressToken !== progressTokenRef.current
      || snapshot.mutationVersion !== saveDirtyTrackerRef.current.snapshot().mutationVersion)
      return { ok: false, reason: 'economy_operation_busy' };
    const base = snapshot.world;
    try { if (contractEconomyMode(base) !== 'annual') return { ok: false, reason: 'economy_not_active' }; }
    catch { return { ok: false, reason: 'economy_candidate_invalid' }; }
    const reduced = reduceEconomyCommand(base, command);
    if (!reduced.ok) return { ok: false, reason: 'economy_command_invalid', error: reduced.error };
    if (reduced.replayed) return { ok: true, replayed: true };
    const expected = { saveId: base.saveId, epoch: base.contractEconomy.epoch,
      baseRevision: base.contractEconomy.revision,
      sessionToken: progressSessionRef.current, progressToken: progressTokenRef.current };
    const dirtySnapshot = saveDirtyTrackerRef.current.snapshot({ persistAll: !snapshot.saveExists });
    const pendingCareerEntries = [...pendingCareerEntriesRef.current];
    const world = reduced.world;
    const context = { expected, dirtySnapshot, pendingCareerEntries, world, status: 'saving' };
    economyCommitRef.current = context;
    setSaveQueueState(prev => ({ ...prev, isSaving: true }));
    setSaveResult(null);
    let result;
    try {
      const mod = await loadSaveModule();
      const options = { careerEntries: structuredClone(pendingCareerEntries) };
      if (Array.isArray(dirtySnapshot.dirtyScopes)) options.dirtyScopes = dirtySnapshot.dirtyScopes;
      result = await mod.commitEconomyCandidate(world, expected, economyCommitBindings(), options);
      if (result.ok) result = await finalizeEconomyCommit(context, result);
      else if (result.reason === 'economy_adoption_required') context.status = 'recovery';
    } catch {
      result = { ok: false, reason: 'economy_commit_failed' };
    } finally {
      if (context.status !== 'recovery' && economyCommitRef.current === context) economyCommitRef.current = null;
      refreshSaveQueueState();
    }
    if (!result.ok) setSaveResult(result);
    return result;
  }, [economyCommitBindings, finalizeEconomyCommit, refreshSaveQueueState]);

  const recoverEconomyCommand = useCallback(async () => {
    if (!economyMountedRef.current) return { ok: false, reason: 'economy_recovery_unavailable' };
    let context = economyCommitRef.current;
    // A remounted hook can explicitly acknowledge a fully reloaded root. It
    // must not replay the previous hook's dirty/career completion bookkeeping.
    const reloaded = !context;
    if (reloaded) {
      const snapshot = economySnapshotRef.current;
      if (!snapshot || pendingSaveRequestsRef.current.size || newGameInitializationRef.current
        || snapshot.mutationVersion !== saveDirtyTrackerRef.current.snapshot().mutationVersion
        || snapshot.progressToken !== progressTokenRef.current)
        return { ok: false, reason: 'economy_recovery_unavailable' };
      context = { status: 'recovery', world: snapshot.world };
      economyCommitRef.current = context;
    }
    if (context.status !== 'recovery') return { ok: false, reason: 'economy_recovery_unavailable' };
    context.status = 'recovering';
    setSaveQueueState(prev => ({ ...prev, isSaving: true }));
    let result;
    try {
      const mod = await loadSaveModule();
      result = reloaded
        ? await mod.recoverLoadedEconomyCommit(economyCommitBindings())
        : await mod.recoverEconomyCommit({ ...context.expected, progressToken: progressTokenRef.current }, economyCommitBindings());
      if (result.ok) {
        if (reloaded) {
          result = { ...result, archive: await flushCommittedArchives(context.world) };
          setSaveResult(result);
        } else result = await finalizeEconomyCommit(context, result);
      }
    } catch { result = { ok: false, reason: 'economy_adoption_required' }; }
    finally {
      if (result?.ok || reloaded) economyCommitRef.current = null;
      else context.status = 'recovery';
      refreshSaveQueueState();
    }
    if (!result.ok) setSaveResult(result);
    return result;
  }, [economyCommitBindings, finalizeEconomyCommit, refreshSaveQueueState]);

  // gameDay が進んだとき、記者会見インターバルを超えていれば会見イベントをセット
  useEffect(()=>{
    if(!isTeamIdSet(myId) || gameDay <= 1 || gameDay > 143) return;
    if(pressEvent) return; // 既にイベント表示中
    if(gameDay - lastPressDay >= PRESS_CONFERENCE_INTERVAL){
      loadPressConferenceModule()
        .then((mod) => {
          setPressEvent(mod.pickQuestion(gameDay));
        })
        .catch((error) => {
          console.error('Failed to load press conference module:', error);
        });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[gameDay, myId]);

  // シーズン日程をyear変更時に再生成（チームID・リーグ構成は不変なのでteams.lengthで十分）
  useEffect(()=>{
    if(contractEconomyMode(gameState) === 'legacy' && teams.length===12){
      loadScheduleModule()
        .then((mod) => {
          const newSchedule = mod.generateSeasonSchedule(year,teams);
          setSchedule(newSchedule);
          const params = SEASON_PARAMS[year] || getDefaultParams(year);
          setAllStarTriggerDay(mod.calcAllStarTriggerDay(newSchedule, params.allStarSkipDates));
        })
        .catch((error) => {
          console.error('Failed to load schedule module:', error);
        });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[year,teams.length]);

  const myTeam = useMemo(()=>teams.find(t=>t.id===myId),[teams,myId]);
  // Command snapshot also advances synchronously to reject repeated clicks.
  rosterCommandRef.current = { ...gameState, progressToken: getProgressToken() };
  const commitRosterCommand = (current, nextTeam) => {
    if (economyCommitRef.current) return false;
    const nextTeams = current.teams.map(t => t.id === current.myId ? nextTeam : t);
    rosterCommandRef.current = { ...current, teams: nextTeams };
    setTeams(nextTeams);
  };
  const tabBadges = useMemo(()=>{
    if(!myTeam) return {};
    const expiringCount=myTeam.players.filter(p=>!p.isIkusei&&(p.contractYearsLeft??99)<=1).length;
    const visibleMails=mailbox.filter(m=>(m.deliverOnDay??0)<=gameDay);
    const pendingTrades=visibleMails.filter(m=>m.type==="trade"&&!m.resolved&&!m.read).length;
    const unreadMail=visibleMails.filter(m=>!m.read).length;
    const unreadInterviews=news.filter(n=>n.type==="interview"&&!n.answered).length;
    return {
      roster: myTeam.players.filter(p=>!p.isIkusei).length>MAX_ROSTER?{n:myTeam.players.filter(p=>!p.isIkusei).length-MAX_ROSTER,color:"#f87171"}:null,
      contract: expiringCount>0?{n:expiringCount,color:"#f5c842"}:null,
      trade: pendingTrades>0?{n:pendingTrades,color:"#f97316"}:null,
      mailbox: unreadMail>0?{n:unreadMail,color:pendingTrades>0?"#f97316":"#f5c842"}:null,
      fa: faPool.length>0?{n:faPool.length,color:"#94a3b8"}:null,
      news: unreadInterviews>0?{n:unreadInterviews,color:"#f5c842"}:null,
    };
  },[myTeam,mailbox,faPool,news,gameDay]);

  const notify = useCallback((msg,type="ok")=>{setNotif({msg,type});setTimeout(()=>setNotif(null),3500);},[]);
  const upd = useCallback((id, fn) => { if (economyCommitRef.current) return false; progressDispatch({ type: G.UPD_TEAM, id, fn: (team) => slimTeamForState(fn(team)) }); markSaveDirty(); }, [markSaveDirty]);

  const pushResult = useCallback((won,drew,oppName,myScore,oppScore,gameNo)=>{
    setRecentResults(prev=>[{won,drew,oppName,myScore,oppScore,gameNo},...prev.filter(r=>r.gameNo!==gameNo)].slice(0,5));
  },[setRecentResults]);

  const pushGameResult = useCallback((gameNo, result)=>{
    setGameResultsMap(prev=>({...prev,[gameNo]:result}));
  },[setGameResultsMap]);

  const addNews = useCallback((article)=>{
    setNews(prev=>{
      return [{id:uid(),timestamp:Date.now(),...article},...prev].slice(0,50);
    });
  },[setNews]);

  const addToHistory = useCallback((teamId,player,exitReason)=>{
    if(!player) return;
    setTeams(prev=>prev.map(function(t){
      if(t.id!==teamId) return t;
      const summary = player?.careerLogSummary && typeof player.careerLogSummary === 'object' ? player.careerLogSummary : {};
      const summaryFirstYear = Number(summary.firstYear || 0) || 0;
      const recentFirstYear = Array.isArray(player?.recentCareerLog) && player.recentCareerLog.length > 0
        ? Number(player.recentCareerLog[0]?.year || 0) || 0
        : 0;
      const joinYear = summaryFirstYear > 0 ? summaryFirstYear : recentFirstYear;
      const tenure=joinYear>0?year-joinYear+1:1;
      const record=Object.assign({},player,{exitYear:year,exitReason:exitReason,tenure:tenure});
      return Object.assign({},t,{history:[...(t.history||[]),record]});
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[year]);

  const addTransferLog = useCallback((entry)=>{
    if(!entry) return;
    setSeasonHistory(prev=>({
      ...(prev||{}),
      transfers:[...(prev?.transfers||[]),{id:uid(),timestamp:Date.now(),...entry}].slice(-400),
    }));
  },[]);

  useEffect(() => {
    if (contractEconomyMode(gameState) !== 'legacy') return;
    const dueMails = mailbox.filter(m => contractReplyIsDue(m, gameDay, year));
    if (!dueMails.length || !myTeam) return;
    const result = resolveContractReplies(myTeam, dueMails, gameDay, year);
    // Validate again against the current reducer state, not a captured roster.
    upd(myId, team => resolveContractReplies(team, dueMails, gameDay, year).team);
    const replies = new Map(result.replies.map(m => [m.id, m]));
    setMailbox(prev => prev.map(m => replies.has(m.id) ? replies.get(m.id) : m));
    result.replies.forEach(m => notify(m.resolution === 'signed'
      ? `${m.decision.playerName || '選手'}が契約を受諾しました`
      : m.resolution === 'rejected' ? '契約は辞退されました。所属と現契約を維持します'
        : '変更済みの契約回答を取り消しました', m.resolution === 'signed' ? 'ok' : 'warn'));
  }, [mailbox, gameDay, myTeam, myId, upd, notify, year]);

  useEffect(() => {
    if (!persistentEnabled) return;
    syncPersistentSummary('seasonHistory', seasonHistory);
  }, [persistentEnabled, seasonHistory, syncPersistentSummary]);

  useEffect(() => {
    if (!persistentEnabled) return;
    syncPersistentSummary('news', news);
  }, [news, persistentEnabled, syncPersistentSummary]);

  useEffect(() => {
    if (!persistentEnabled) return;
    syncPersistentSummary('mailbox', mailbox);
  }, [mailbox, persistentEnabled, syncPersistentSummary]);

  useEffect(() => {
    if (!persistentEnabled) return;
    syncPersistentSummary('scheduleArchive', scheduleArchive);
  }, [persistentEnabled, scheduleArchive, syncPersistentSummary]);

  useEffect(() => {
    if (screen === 'hub' && myId != null) {
      enablePersistentStore();
    }
  }, [enablePersistentStore, myId, screen]);

  useEffect(() => { if (persistentEnabled) syncPersistentSummary('gameResultsMap', gameResultsMap); },
    [persistentEnabled, gameResultsMap, syncPersistentSummary]);

  // オートセーブ（hubに戻った時）
  useEffect(()=>{
    if(screen!=='hub' || isAutoSaveSuspended || !saveDirty || saveQueueState.isSaving || economyCommitRef.current) return;
    const now = Date.now();
    loadSaveModule().then((mod)=>{
      if (economyCommitRef.current) return { result: { ok: false, skipped: true }, snapshot: null };
      const intervalMs = mod.getAutoSaveIntervalMs();
      if (lastAutoSaveAt > 0 && now - lastAutoSaveAt < intervalMs) {
        return { result: { ok: false, skipped: true }, snapshot: null };
      }
      const request = beginTrackedSave();
      return queueSave(
        {teams,myId,gameDay,year,saveId,battedBallReceipt,schedule,...farmFields,...(contractEconomy ? {contractEconomy} : {}),faPool,faYears,seasonHistory,news,mailbox,saveRevision,offseasonPlan,...getMatchHistorySnapshot()},
        request.options,
        request.snapshot,
      ).then((result) => ({ result, snapshot: request.snapshot }));
    }).then(({ result, snapshot })=>{
      if (snapshot && (snapshot.requestId !== saveRequestRef.current || snapshot.sessionToken !== progressSessionRef.current)) return;
      if(result.ok){
        setSaveExists(true);
        completeTrackedSave(snapshot);
        setLastAutoSaveAt(now);
        const feedback = saveFeedback(result, '💾 オートセーブ');
        notify(feedback.message, feedback.type);
      } else if (!result.skipped) {
        const feedback = saveFeedback(result); notify(feedback.message, feedback.type);
      }
    }).catch((error)=>{
      notify(saveFeedback({ok:false}).message, 'warn');
      console.error('Auto save failed:', error);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[screen,isAutoSaveSuspended,saveDirty,lastAutoSaveAt,saveRevision,saveQueueState.isSaving]);

  const handleSave = useCallback(async (options = {})=>{
    if (economyCommitRef.current) return { ok: false, reason: 'economy_commit_pending' };
    if (offseasonPlan && isAutoSaveSuspended && !options.payload) return { ok: false, reason: 'transition_in_progress' };
    const request = beginTrackedSave(options.saveOptions);
    if(options.careerEntries) request.options.careerEntries=options.careerEntries;
    if (options.payload && MATCH_HISTORY_FIELDS.some(key => key in options.payload)) {
      request.options.dirtyScopes = [...new Set([...(request.options.dirtyScopes ?? ['seasonHistory', 'news', 'mailbox']), 'matchHistory'])];
    }
    const result=await queueSave(
      {teams,myId,gameDay,year,saveId,battedBallReceipt,schedule,...farmFields,...(contractEconomy ? {contractEconomy} : {}),faPool,faYears,seasonHistory,news,mailbox,saveRevision,...getMatchHistorySnapshot(),
        offseasonPlan: contractEconomy?.mode === 'annual' ? offseasonPlan : offseasonPlan && { ...offseasonPlan, resumeScreen:
          offseasonPlan.stage === 'postseason' && screen === 'hub' ? offseasonPlan.resumeScreen : screen }, ...options.payload},
      request.options,
      request.snapshot,
    );
    if (request.snapshot.requestId !== saveRequestRef.current || request.snapshot.sessionToken !== progressSessionRef.current) return result;
    if(result.ok){
      setSaveExists(true);
      completeTrackedSave(request.snapshot);
    }
    if (!options.silent || !result.ok || result.warnings?.length || result.archive?.ok === false) {
      const feedback = saveFeedback(result); notify(feedback.message, feedback.type);
    }
    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[teams,myId,saveId,gameDay,year,battedBallReceipt,farmCompetition,contractEconomy,schedule,faPool,faYears,seasonHistory,news,mailbox,saveRevision,offseasonPlan,screen,isAutoSaveSuspended,notify,queueSave,beginTrackedSave,completeTrackedSave,getMatchHistorySnapshot]);

  useEffect(() => {
    if (!offseasonPlan || !OFFSEASON_SAVE_SCREENS.has(screen) || !saveDirty || isAutoSaveSuspended) return;
    const timer = setTimeout(() => { handleSave({ silent: true }).catch(() => notify('編成内容の保存に失敗しました。保存ボタンで再試行してください', 'warn')); }, 750);
    return () => clearTimeout(timer);
  }, [offseasonPlan, screen, saveDirty, isAutoSaveSuspended, handleSave, notify]);

  const ensureInitialTeams = useCallback(async (localMaster) => {
    if (!localMaster && teams.length === TEAM_DEFS.length) return teams;
    const { createInitialTeamsAsync } = await import('../engine/bootstrapTeams');
    return localMaster ? createInitialTeamsAsync(localMaster,{localImport:true}) : createInitialTeamsAsync();
  }, [teams]);

  const handleSelect = useCallback(async (id, localMaster)=>{
    if (newGameInitializationRef.current || economyCommitRef.current) return false;
    newGameInitializationRef.current = true;
    newGameInitializationAttemptRef.current += 1;
    setNewGameInitializationStatus('initializing');
    setNewGameInitializationError(null);
    try {
      // Finish an already-running legacy load/migration before creating new data.
      // Its App continuation is invalidated by the attempt counter above.
      await titleLoadPromiseRef.current?.catch(() => {});
      await yieldToBrowser();
      const nextTeams = await ensureInitialTeams(localMaster);
      const [playerMod, scheduleMod] = await Promise.all([
        loadPlayerModule(),
        loadScheduleModule(),
      ]);
      const nextFaPool = playerMod.generateForeignFaPool(rng(FOREIGN_FA_COUNT_MIN, FOREIGN_FA_COUNT_MAX));
      const nextSaveId = createSaveId();
      const newSchedule = scheduleMod.generateSeasonSchedule(year,nextTeams);
      const params = SEASON_PARAMS[year] || getDefaultParams(year);
      const nextAllStarTriggerDay = scheduleMod.calcAllStarTriggerDay(newSchedule, params.allStarSkipDates);
      // Prepare locally; only publish a complete game after required history writes succeed.
      const saveMod = await loadSaveModule();
      const initialHistory={awards:[],records:{singleSeasonHR:null,singleSeasonAVG:null,singleSeasonK:null,careerHR:{},careerW:{}},hallOfFame:[],championships:[],standingsHistory:[],transfers:[]};
      const initialFarm = createFarmCompetition({teams:nextTeams,saveId:nextSaveId,year});
      const initialReceipt = emptyBattedBallReceipt(nextSaveId);
      const initialized = await saveMod.enqueueSaveGame({schedule:newSchedule,farmCompetition:initialFarm,farmCompetitionVersion:1,teams:nextTeams,myId:id,saveId:nextSaveId,year,gameDay:1,
        battedBallReceipt:initialReceipt,faPool:nextFaPool,faYears:{},seasonHistory:initialHistory,news:[],mailbox:[],offseasonPlan:null,...matchHistorySnapshot({})},
        {initialCareerLogs:collectCareerLogsForIndexedDb(nextTeams)});
      if (!initialized?.ok) {
        const error=new Error('initial_career_log_persistence_failed');
        error.saveResult=initialized;throw error;
      }
      // The initial write already succeeded; avoid an immediate redundant autosave.
      setLastAutoSaveAt(Date.now());
      pendingCareerEntriesRef.current=[];
      applyProgressCandidate({teams:nextTeams,myId:id,saveId:nextSaveId,year,gameDay:1,farmCompetition:initialFarm,farmCompetitionVersion:1,seasonHistory:initialHistory,battedBallReceipt:initialReceipt});
      setFaPool(nextFaPool);
      setSaveId(nextSaveId);
      setOffseasonPlan(null);
      setSeasonHistoryState(initialHistory);setNewsState([]);setMailboxState([]);setFaYearsState({});setGameDay(1);
      hydrateMatchHistory(matchHistorySnapshot({}));
      setSaveExists(true);
      setMyId(id);
      setSchedule(newSchedule);
      setAllStarTriggerDay(nextAllStarTriggerDay);
      setTab("dashboard");
      setNewGameInitializationStatus('ready');
      setScreen("hub");
      if(initialized.warnings?.length) notify(saveFeedback(initialized).message,'warn');
    } catch (error) {
      console.error('新規ゲーム初期化に失敗しました:', error);
      setNewGameInitializationStatus('error');
      setNewGameInitializationError(error?.saveResult?.quota
        ? '保存容量が不足しています。新規ゲームは未保存です。既存の保存データは保持しています。球団を選択して再試行してください。'
        : error?.message === 'initial_career_log_persistence_failed'
        ? '過去成績を保存できませんでした。ブラウザのストレージ設定を確認し、球団を選択して再試行してください。'
        : '新規ゲームの初期化に失敗しました。球団を選択して再試行してください。');
      notify('新規ゲームを開始できませんでした','warn');
    } finally {
      newGameInitializationRef.current = false;
      // The mount-time read may have captured this direct initial save in flight.
      // Refresh the real queue after it settles; never infer a saved outcome.
      refreshSaveQueueState();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[ensureInitialTeams, notify, refreshSaveQueueState, setSaveId, year]);

  const handlePlayerClick = useCallback(
    (player, teamName, initialSection = 'profile') => setPlayerModal({
      player,
      teamName,
      initialSection,
    }),
    [],
  );
  const handleTeamClick = useCallback((team)=>{setViewingTeam(team);setScreen("team_detail");},[]);

  const setTrainingFocus = useCallback((pid,focus)=>upd(myId,t=>({...t,players:t.players.map(p=>p.id===pid?{...p,trainingFocus:focus}:p)})),[upd,myId]);

  const setDevGoal = useCallback((pid, goal) => {
    loadPlayerModule()
      .then((mod) => {
        upd(myId, t => {
          const updateP = p => {
            if (p.id !== pid) return p;
            const updated = { ...p, devGoal: goal || null };
            updated.trainingFocus = mod.resolveTrainingFocusFromGoal(updated);
            return updated;
          };
          return { ...t, players: t.players.map(updateP), farm: t.farm.map(updateP) };
        });
      })
      .catch((error) => {
        console.error('Failed to load player module for dev goal update:', error);
      });
  }, [upd, myId]);

  const handlePlayerTalk = useCallback((pid, talkType) => {
    if (economyCommitRef.current) return false;
    const p = myTeam?.players.find(x => x.id === pid);
    if (!p) return;
    if ((p.lastTalkGameDay ?? 0) > 0 && gameDay - p.lastTalkGameDay < TALK_COOLDOWN_DAYS) {
      notify(`${p.name}とは今月済みです`, "warn"); return;
    }
    const pa = p.stats?.PA ?? 0;
    const bf = p.stats?.BF ?? 0;
    let delta = 0;
    switch (talkType) {
      case "praise":       delta = rng(5, 15); break;
      case "playing_time": delta = (p.isPitcher ? bf < 80 : pa < 200) ? rng(8, 15) : rng(3, 8); break;
      case "contract":     delta = p.salary < 10000000 ? rng(5, 12) : rng(2, 6); break;
      case "trade_rumor":  delta = (p.personality?.overseas ?? 50) >= 60 ? rng(-5, 3) : rng(2, 8); break;
      default:             delta = rng(3, 10);
    }
    upd(myId, t => ({...t, players: t.players.map(x => x.id === pid
      ? {...x, morale: clamp((x.morale ?? 70) + delta, 0, 100), lastTalkGameDay: gameDay}
      : x)}));
    const TALK_LABELS = { praise:"激励", playing_time:"出場機会", contract:"契約", trade_rumor:"噂否定" };
    notify(`${p.name}「${TALK_LABELS[talkType]}」— モラル${delta >= 0 ? "+" : ""}${delta}`, delta >= 0 ? "ok" : "warn");
  }, [myTeam, gameDay, upd, myId, notify]);

  const interviewSession = getProgressSessionToken();
  const handleInterview = useCallback((newsId,opt)=>{
    if (economyCommitRef.current) return false;
    const current = rosterCommandRef.current;
    if (interviewSession !== getProgressSessionToken() || current.progressToken !== getProgressToken()) return false;
    const choice = interviewChoice(current.news.find(article => article.id === newsId), opt);
    if (!choice) return false;
    const action = { type: G.ANSWER_INTERVIEW, newsId, option: choice, myId: current.myId, saveId: current.saveId };
    const next = gameStateReducer(current, action);
    if (next === current) return false;
    progressDispatch(action);
    // Reuse the existing synchronous command snapshot; rejected calls have no side effects.
    rosterCommandRef.current = { ...next, progressToken: getProgressToken() };
    markSaveDirty(['news']);
    notify("回答しました！ 人気"+(choice.popMod>=0?"+":"")+choice.popMod+" モラル"+(choice.moraleMod>=0?"+":"")+choice.moraleMod,"ok");
    return true;
  },[interviewSession,getProgressSessionToken,getProgressToken,progressDispatch,markSaveDirty,notify]);

  const toggleLineup = useCallback((pid)=>{
    if (economyCommitRef.current) return false;
    if(!myTeam) return;
    const inL=myTeam.lineup.includes(pid);
    const p=myTeam.players.find(x=>x.id===pid);
    const dhMode = myTeam.rosterDhMode ?? myTeam.dhEnabled;
    const maxLineup = dhMode ? 9 : 8;
    if(p?.injury){notify("故障中は出場不可","warn");return;}
    if(!inL&&myTeam.lineup.length>=maxLineup){notify(`打線は最大${maxLineup}人です`,"warn");return;}
    upd(myId,t=>{
      const nextLineup = inL ? t.lineup.filter(id=>id!==pid) : [...t.lineup,pid];
      return dhMode
        ? { ...t, lineup: nextLineup, lineupDh: nextLineup.slice(0, 9) }
        : { ...t, lineup: nextLineup, lineupNoDh: nextLineup.slice(0, 8) };
    });
  },[myTeam,upd,myId,notify]);

  const replaceLineup = useCallback((entries) => {
    if (economyCommitRef.current) return false;
    // entries: [{id, pos}, ...] in batting order. 本職は変えず試合時の守備配置だけ保存する。
    upd(myId, t => {
      const dhMode = t.rosterDhMode ?? t.dhEnabled;
      const newLineup = entries.map(e => e.id);
      const fielding = Object.fromEntries(entries.map(e => [e.id, e.pos]));
      return {
        ...t,
        lineup: newLineup,
        ...(dhMode
          ? { lineupDh: newLineup, fieldingDh: fielding }
          : { lineupNoDh: newLineup, fieldingNoDh: fielding }),
      };
    });
  }, [upd, myId]);

  const setLineupOrder = useCallback((pid, order) => {
    if (economyCommitRef.current) return false;
    if (!myTeam) return;
    const p = myTeam.players.find(x => x.id === pid);
    if ((p?.injuryDaysLeft ?? 0) > 0) { notify("故障中は出場不可", "warn"); return; }
    const dhMode = myTeam.rosterDhMode ?? myTeam.dhEnabled;
    const maxLineup = dhMode ? 9 : 8;
    const targetIdx = order - 1;
    upd(myId, t => {
      if (order === 0) {
        const nextLineup = t.lineup.filter(id => id !== pid);
        return dhMode
          ? { ...t, lineup: nextLineup, lineupDh: nextLineup.slice(0, 9) }
          : { ...t, lineup: nextLineup, lineupNoDh: nextLineup.slice(0, 8) };
      }
      const lineup = [...t.lineup];
      const currentIdxInTeam = lineup.indexOf(pid);
      const inLineup = currentIdxInTeam !== -1;

      if (!inLineup) {
        if (lineup.length >= maxLineup) {
          // 打線満員: 対象スロットの選手を控えに落として入れ替え
          lineup[Math.min(targetIdx, lineup.length - 1)] = pid;
        } else {
          lineup.splice(Math.min(targetIdx, lineup.length), 0, pid);
        }
        const nextLineup = lineup.slice(0, maxLineup);
        return dhMode
          ? { ...t, lineup: nextLineup, lineupDh: nextLineup }
          : { ...t, lineup: nextLineup, lineupNoDh: nextLineup };
      }

      if (targetIdx === currentIdxInTeam) return t;
      if (targetIdx >= lineup.length) return t;
      const occupantId = lineup[targetIdx];
      lineup[currentIdxInTeam] = occupantId;
      lineup[targetIdx] = pid;
      return dhMode
        ? { ...t, lineup, lineupDh: lineup.slice(0, 9) }
        : { ...t, lineup, lineupNoDh: lineup.slice(0, 8) };
    });
  }, [myTeam, upd, myId, notify]);

  const setPlayerPosition = useCallback((pid, pos) => {
    if (economyCommitRef.current) return false;
    upd(myId, t => {
      const dhMode = t.rosterDhMode ?? t.dhEnabled;
      const key = dhMode ? 'fieldingDh' : 'fieldingNoDh';
      return {
        ...t,
        [key]: { ...(t[key] || {}), [pid]: pos },
      };
    });
  }, [upd, myId]);

  const setConvertTarget = useCallback((pid, target) => {
    if (economyCommitRef.current) return false;
    upd(myId, t => ({
      ...t,
      players: t.players.map(p => p.id === pid ? { ...p, convertTarget: target || null } : p),
    }));
  }, [upd, myId]);

  const setRosterDhMode = useCallback((dhMode) => {
    if (economyCommitRef.current) return false;
    upd(myId, t => {
      const nonPitcherIds = (t.players || []).filter(p => !p.isPitcher).map(p => p.id);
      const lineupNoDh = (t.lineupNoDh || t.lineup || []).filter(id => nonPitcherIds.includes(id)).slice(0, 8);
      const lineupDh = (t.lineupDh || t.lineup || []).filter(id => nonPitcherIds.includes(id)).slice(0, 9);
      return {
        ...t,
        rosterDhMode: dhMode,
        lineupNoDh,
        lineupDh,
        lineup: (dhMode ? lineupDh : lineupNoDh).slice(),
      };
    });
  }, [upd, myId]);

  const setManagementPolicy = useCallback((policyId) => {
    if (economyCommitRef.current) return false;
    if (!MANAGEMENT_POLICIES[policyId]) return;
    upd(myId, t => ({
      ...t,
      managementPolicyId: policyId,
      managementMeta: {
        ...(t.managementMeta || {}),
        lastDecision: `起用方針を${MANAGEMENT_POLICIES[policyId].label}へ変更`,
      },
    }));
    notify(`起用方針を「${MANAGEMENT_POLICIES[policyId].label}」に変更`, 'ok');
  }, [myId, notify, upd]);

  const setRosterAutomationMode = useCallback((mode) => {
    if (economyCommitRef.current) return false;
    if (!Object.values(ROSTER_AUTOMATION_MODES).includes(mode)) return;
    upd(myId, t => ({ ...t, rosterAutomationMode: mode }));
    const labels = {
      [ROSTER_AUTOMATION_MODES.MANUAL]: '手動',
      [ROSTER_AUTOMATION_MODES.EMERGENCY]: '緊急補充',
      [ROSTER_AUTOMATION_MODES.FULL]: 'フル自動',
    };
    notify(`編成モードを「${labels[mode]}」に変更`, 'ok');
  }, [myId, notify, upd]);

  const setStarter = useCallback((pid)=>{if (economyCommitRef.current) return false;upd(myId,t=>({...t,rotation:t.rotation.includes(pid)?t.rotation:[...t.rotation,pid]}));notify("先発ローテに追加","ok");},[upd,myId,notify]);
  const moveRotation = useCallback((pid,dir)=>upd(myId,t=>{const r=[...t.rotation];const i=r.indexOf(pid);if(i<0)return t;const j=i+dir;if(j<0||j>=r.length)return t;[r[i],r[j]]=[r[j],r[i]];return{...t,rotation:r};}),[upd,myId]);
  const removeFromRotation = useCallback((pid)=>upd(myId,t=>({...t,rotation:t.rotation.filter(id=>id!==pid)})),[upd,myId]);
  const setPitchingPattern = useCallback((patch)=>upd(myId,t=>({...t,pitchingPattern:{...(t.pitchingPattern??{}), ...patch}})),[upd,myId]);
  const replaceRotation = useCallback((rotationIds, patternPatch)=>upd(myId,t=>({...t,rotation:rotationIds,pitchingPattern:{...(t.pitchingPattern??{}),...patternPatch}})),[upd,myId]);
  const replaceFullRoster = useCallback((lineupEntries, rotationIds, patternPatch)=>upd(myId,t=>{
    const dhMode=t.rosterDhMode??t.dhEnabled;
    const newLineup=lineupEntries.map(e=>e.id);
    const fielding=Object.fromEntries(lineupEntries.map(e=>[e.id,e.pos]));
    return{...t,lineup:newLineup,...(dhMode?{lineupDh:newLineup,fieldingDh:fielding}:{lineupNoDh:newLineup,fieldingNoDh:fielding}),rotation:rotationIds,pitchingPattern:{...(t.pitchingPattern??{}),...patternPatch}};
  }),[upd,myId]);

  const applyRosterPlan = useCallback((plannedTeam) => {
    if (economyCommitRef.current) return false;
    if (!plannedTeam || plannedTeam.id !== myId) return;
    upd(myId, current => ({
      ...plannedTeam,
      id: current.id,
      rosterAutomationMode:
        plannedTeam.rosterAutomationMode
        ?? current.rosterAutomationMode
        ?? ROSTER_AUTOMATION_MODES.EMERGENCY,
    }));
    notify('編成プランを一括反映しました', 'ok');
  }, [myId, notify, upd]);

  const promote = useCallback((pid)=>{
    if (economyCommitRef.current) return false;
    if(!myTeam) return;
    const p=myTeam.farm.find(x=>x.id===pid);
    if(!p) return;
    if(isIkuseiPlayer(p)){notify("育成選手は一軍出場不可。先に支配下登録してください","warn");return;}
    if(myTeam.players.length>=MAX_ROSTER){notify("一軍枠満杯","warn");return;}
    if (p.isForeign) {
      const foreignPlayers = myTeam.players.filter(x => x.isForeign);
      if (foreignPlayers.length >= MAX_外国人_一軍) {
        notify(`外国人枠は${MAX_外国人_一軍}名まで`,"warn");
        return;
      }
      const foreignPitchers = foreignPlayers.filter(x => x.isPitcher).length;
      const foreignBatters = foreignPlayers.length - foreignPitchers;
      const wouldBeAllPitchers = p.isPitcher && foreignPlayers.length === MAX_外国人_一軍 - 1 && foreignPitchers === MAX_外国人_一軍 - 1;
      const wouldBeAllBatters = !p.isPitcher && foreignPlayers.length === MAX_外国人_一軍 - 1 && foreignBatters === MAX_外国人_一軍 - 1;
      if (wouldBeAllPitchers || wouldBeAllBatters) {
        notify("外国人登録は投手4名または野手4名のみにはできません", "warn");
        return;
      }
    }
    if((p.registrationCooldownDays??0)>0){notify(`登録抹消後10日ルール: あと${p.registrationCooldownDays}日は昇格不可`,"warn");return;}
    upd(myId,t=>({...t,players:[...t.players,p],farm:t.farm.filter(x=>x.id!==pid)}));
    notify(`${p.name}を一軍昇格！`,"ok");
  },[myTeam,upd,myId,notify]);

  const convertIkusei = useCallback((pid)=>{
    if (economyCommitRef.current) return false;
    const current=rosterCommandRef.current, team=current.teams.find(t=>t.id===current.myId);
    const p=team?.farm.find(x=>x.id===pid);
    if(!p||!isIkuseiPlayer(p)) return;
    const capacity=evaluateRosterCapacity(team,draftCapacityContext(current.offseasonPlan,current.year,current.teams));
    if(!capacity.ok){notify(`支配下人数が未確認です（${capacity.reason}）`,"warn");return;}
    if(capacity.remainingSlots<=0){notify(`支配下上限（${MAX_SHIHAKA_TOTAL}人）到達。支配下登録不可`,"warn");return;}
    const newSal=Math.max(p.salary,MIN_SALARY_SHIHAKA),diff=newSal-p.salary;
    if(!Number.isFinite(diff)||!Number.isFinite(team.budget)){notify("年俸・予算が未記録です","warn");return;}
    if(diff>0&&team.budget<diff){notify("予算不足（差額"+Math.round(diff/10000)+"万円必要）","warn");return;}
    commitRosterCommand(current,{...team,budget:team.budget-diff,farm:team.farm.map(x=>x.id===pid?{...x,育成:false,isIkusei:false,salary:newSal,contractYears:1,contractYearsLeft:1,ikuseiYears:0}:x)});
    notify(`${p.name}を支配下登録！`,"ok");
  },[setTeams,notify]);

  const demote = useCallback((pid)=>{
    if (economyCommitRef.current) return false;
    if(!myTeam) return;
    const p=myTeam.players.find(x=>x.id===pid);
    if(!p) return;
    // 降格は支配下数を変えないためファーム枠チェック不要
    // 手動降格: 登録抹消クールダウン10日をセット
    const demotedPlayer={...p,registrationCooldownDays:REGISTRATION_COOLDOWN_DAYS};
    upd(myId,t=>({...t,players:t.players.filter(x=>x.id!==pid),lineup:t.lineup.filter(id=>id!==pid),lineupNoDh:(t.lineupNoDh||[]).filter(id=>id!==pid),lineupDh:(t.lineupDh||[]).filter(id=>id!==pid),rotation:t.rotation.filter(id=>id!==pid),farm:[...t.farm,demotedPlayer]}));
    notify(`${p.name}を二軍降格（再登録まで${REGISTRATION_COOLDOWN_DAYS}日）`,"warn");
  },[myTeam,upd,myId,notify]);

  const hireCoach = useCallback((cd,cg)=>{
    if (economyCommitRef.current) return false;
    if(!myTeam||myTeam.budget<cg.salary*12){notify("予算不足","warn");return;}
    upd(myId,t=>({...t,budget:t.budget-cg.salary*12,coaches:[...t.coaches,{type:cd.type,typeName:cd.name,emoji:cd.emoji,name:pname(),grade:cg.g,label:cg.label,salary:cg.salary*12,bonus:cg.bonus}]}));
    notify(`${cd.name}(Lv${cg.g})を雇いました！`,"ok");
  },[myTeam,upd,myId,notify]);

  const fireCoach = useCallback((idx)=>{
    if (economyCommitRef.current) return false;
    upd(myId,t=>({...t,coaches:t.coaches.filter((_,i)=>i!==idx)}));
    notify("コーチを解雇","warn");
  },[upd,myId,notify]);

  const sendScout = useCallback((region)=>{
    if (economyCommitRef.current) return false;
    if(!myTeam||!Number.isFinite(myTeam.budget)||myTeam.budget<region.cost){notify("予算不足","warn");return false;}
    upd(myId,t=>({...t,budget:t.budget-region.cost,scoutMissions:[...t.scoutMissions,{id:uid(),name:region.name,weeksLeft:region.weeks,qMin:region.qMin,qMax:region.qMax,cost:region.cost,foreign:region.foreign,regionFactor:region.regionFactor||1.0}]}));
    notify(`${region.name}へスカウト派遣！`,"ok");
    setTimeout(()=>{
      loadPlayerModule().then((playerMod)=>{upd(myId,t=>{const mis=t.scoutMissions.find(m=>m.name===region.name);if(!mis) return t;const np=playerMod.makePlayer(Math.random()<0.4?"先発":POSITIONS[rng(0,7)],rng(mis.qMin,mis.qMax),Math.random()<0.4,undefined,mis.foreign&&Math.random()<0.7);return{...t,scoutMissions:t.scoutMissions.filter(m=>m!==mis),scoutResults:[...t.scoutResults,{...np,_scoutRegionFactor:mis.regionFactor||1.0,_scoutBudgetFactor:t.budget>300000?0.7:t.budget>150000?0.85:1.0}]};});}).catch((error)=>{console.error('Failed to resolve scout result:', error);notify("スカウト結果の生成に失敗しました","error");});
      notify("スカウト報告が届きました！","ok");
    },3000);
    return true;
  },[myTeam,upd,myId,notify]);

  const signPlayer = useCallback((idx)=>{
    if (economyCommitRef.current) return false;
    const current=rosterCommandRef.current, team=current.teams.find(t=>t.id===current.myId);
    const intendedId=myTeam?.scoutResults[idx]?.id;
    if(intendedId==null) return false;
    const p=team?.scoutResults.find(candidate=>candidate.id===intendedId);
    if(!p) return false;
    if(!Number.isFinite(p.salary)||!Number.isFinite(team.budget)||team.budget<p.salary){notify("予算不足","warn");return false;}
    const error=marketRosterError(team,p,current.teams,draftCapacityContext(current.offseasonPlan,current.year,current.teams));
    if(error){notify(error,"warn");return false;}
    commitRosterCommand(current,{...team,budget:team.budget-p.salary,farm:[...team.farm,{...p,contractYearsLeft:2}],scoutResults:team.scoutResults.filter(candidate=>candidate.id!==intendedId)});
    notify(`${p.name}を獲得！`,"ok");
    return true;
  },[myTeam,setTeams,notify]);

  const handlePressAnswer = useCallback((choiceIdx) => {
    if (economyCommitRef.current) return false;
    if (!pressEvent) return;
    const choice = pressEvent.choices[choiceIdx];
    loadPressConferenceModule().then((mod) => {
      const { popDelta, moraleDelta } = mod.calcPressDelta(choice);
    upd(myId, t => ({
      ...t,
      popularity: Math.min(100, Math.max(0, (t.popularity ?? 50) + popDelta)),
      players: t.players.map(p => ({
        ...p,
        morale: Math.min(100, Math.max(0, (p.morale ?? 70) + moraleDelta)),
      })),
    }));
    notify(
      `記者会見「${choice.label}」— 人気${popDelta >= 0 ? '+' : ''}${popDelta} チームモラル${moraleDelta >= 0 ? '+' : ''}${moraleDelta}`,
      popDelta + moraleDelta >= 0 ? 'ok' : 'warn',
    );
    setPressEvent(null);
    setLastPressDay(gameDay);
    }).catch((error) => {
      console.error('Failed to resolve press conference choice:', error);
    });
  }, [pressEvent, upd, myId, notify, gameDay]);

  const handleStadiumUpgrade = useCallback(()=>{
    if (economyCommitRef.current) return false;
    const current = rosterCommandRef.current;
    if (!current || current.myId !== myId) return;
    const team = current.teams.find(t => t.id === current.myId);
    if (!team) return;
    const lvl=team.stadiumLevel??0;
    if(lvl>=3){notify("球場はすでに最高レベルです","warn");return;}
    const cost=stadiumUpgradeCosts(team)[lvl];
    if(!Number.isFinite(cost) || !Number.isFinite(team.budget) || team.budget<cost){notify("予算不足","warn");return;}
    commitRosterCommand(current,{...team,budget:team.budget-cost,stadiumLevel:lvl+1});
    notify(`球場をLv${lvl+1}にアップグレード！チケット収入 UP`,"ok");
  },[myId,notify]);

  const handleSetTicketPrice = useCallback((nextPrice)=>{
    if (economyCommitRef.current) return false;
    if(!myTeam) return;
    const parsed=Math.round(Number(nextPrice));
    if(!Number.isFinite(parsed)){notify("チケット価格が不正です","warn");return;}
    const clamped=Math.min(5000,Math.max(500,parsed));
    upd(myId,t=>({...t,customAvgTicketPrice:clamped}));
    notify(`平均チケット価格を${clamped.toLocaleString()}円に設定`,"ok");
  },[myTeam,upd,myId,notify]);

  return {
    // state & setters
    screen, setScreen,
    retireModal, setRetireModal,
    playerModal, setPlayerModal,
    viewingTeam, setViewingTeam,
    pregameError, setPregameError,
    allTeamResultsMap, setAllTeamResultsMap,
    allTeamBoxScoresMap, setAllTeamBoxScoresMap,
    retireGamePlayer, setRetireGamePlayer,
    retireRole, setRetireRole,
    teams, setTeams,
    myId, setMyId,
    saveId, setSaveId, contractEconomy, battedBallReceipt, farmCompetition, farmCompetitionVersion: farmCompetition ? 1 : undefined, setFarmCompetition, applyProgressCandidate, getProgressToken, getProgressSessionToken,
    tab, setTab,
    gameDay, setGameDay,
    year, setYear,
    faPool, setFaPool,
    faYears, setFaYears,
    offseasonPlan, setOffseasonPlan,
    notif,
    seasonHistory, setSeasonHistory,
    saveExists, setSaveExists,
    schedule, setSchedule,
    news, setNews,
    mailbox, setMailbox,
    recentResults, setRecentResults,
    gameResultsMap, setGameResultsMap,
    scheduleArchive, setScheduleArchive,
    cpuTradeOffers, setCpuTradeOffers,
    pressEvent, setPressEvent,
    lastPressDay, setLastPressDay,
    allStarDone, setAllStarDone,
    allStarResult, setAllStarResult,
    allStarTriggerDay, setAllStarTriggerDay,
    isAutoSaveSuspended, setIsAutoSaveSuspended,
    saveDirty, setSaveDirty: setPublicSaveDirty,
    saveQueueState, saveResult,
    saveRevision, setSaveRevision: setPublicSaveRevision,
    persistentSummaries,
    newGameInitializationError,
    newGameInitializationStatus,
    isNewGameInitializing,
    getNewGameInitializationAttempt,
    runTitleLoad,
    getSeasonHistory,
    getNewsBySelector,
    getMailboxBySelector,
    getMailboxItemById,
    getGameResultsMap,
    getScheduleArchive,
    getUnreadMailboxCount,
    getLatestNewsId,
    markSaveDirty,
    hydrateSavedWorld, hydrateLargeSaveData, getMatchHistorySnapshot, hydrateMatchHistory, applyMatchResultPatch,
    commitEconomyCommand, recoverEconomyCommand,
    resetSaveTracking,
    // derived
    myTeam,
    tabBadges,
    // actions
    notify,
    upd,
    pushResult,
    pushGameResult,
    addNews,
    addToHistory,
    addTransferLog,
    handleSave,
    stageCareerEntries,
    handleSelect,
    handlePlayerClick,
    handleTeamClick,
    handlePlayerTalk,
    setTrainingFocus,
    setDevGoal,
    handleInterview,
    toggleLineup,
    replaceLineup,
    setLineupOrder,
    setRosterDhMode,
    setManagementPolicy,
    setRosterAutomationMode,
    setPlayerPosition,
    setConvertTarget,
    setStarter,
    moveRotation,
    removeFromRotation,
    setPitchingPattern,
    replaceRotation,
    replaceFullRoster,
    applyRosterPlan,
    promote,
    convertIkusei,
    demote,
    hireCoach,
    fireCoach,
    sendScout,
    signPlayer,
    handleStadiumUpgrade,
    handleSetTicketPrice,
    handlePressAnswer,
  };
}

