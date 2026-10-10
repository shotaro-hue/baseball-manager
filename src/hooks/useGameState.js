import { saveFeedback } from '../engine/saveFeedback';
import { useState, useReducer, useMemo, useCallback, useEffect, useRef } from "react";
import { contractReplyIsDue, resolveContractReplies } from '../engine/contractReplies';
import { yieldToBrowser } from '../engine/yieldToBrowser';
import { gameStateReducer, G } from './gameStateReducer';
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

export function useGameState() {
  const [screen, setScreen] = useState("title");
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
    () => ({ teams: [], gameDay: 1, year: 2026, myId: null, saveId: createSaveId() }),
  );
  const { teams, gameDay, year, myId, saveId } = gameState;
  const [saveDirty, setSaveDirty] = useState(false);
  const [lastAutoSaveAt, setLastAutoSaveAt] = useState(0);
  const [saveRevision, setSaveRevision] = useState(0);
  const saveDirtyTrackerRef = useRef(null);
  const pendingCareerEntriesRef = useRef([]);
  if (saveDirtyTrackerRef.current === null) {
    saveDirtyTrackerRef.current = createSaveDirtyTracker();
  }
  const markSaveDirty = useCallback((scopes = [])=>{
    saveDirtyTrackerRef.current.mark(scopes);
    setSaveRevision(prev=>prev+1);
    setSaveDirty(true);
  },[]);
  const stageCareerEntries = useCallback(entries => {
    pendingCareerEntriesRef.current.push(...structuredClone(entries));
    markSaveDirty();
  },[markSaveDirty]);
  const setTeams   = useCallback((n) => { dispatch({ type: G.SET_TEAMS, teams: (prev) => slimTeamsForState(typeof n === 'function' ? n(prev) : n) }); markSaveDirty(); },    [markSaveDirty]);
  const setGameDay = useCallback((n) => { dispatch({ type: G.SET_GAME_DAY, day: n }); markSaveDirty(); }, [markSaveDirty]);
  const setYear    = useCallback((n) => { dispatch({ type: G.SET_YEAR, year: n }); markSaveDirty(); }, [markSaveDirty]);
  const setMyId    = useCallback((id) => { dispatch({ type: G.SET_MY_ID, myId: id }); markSaveDirty(); }, [markSaveDirty]);
  const setSaveId  = useCallback((id) => { pendingCareerEntriesRef.current=[];dispatch({ type: G.SET_SAVE_ID, saveId: ensureSaveId(id) }); }, []);
  const [tab, setTab] = useState("dashboard");
  const [faPool, setFaPool] = useState([]);
  const [faYears, setFaYearsState] = useState({});
  const setFaYears = useCallback(value => { setFaYearsState(value); markSaveDirty(); }, [markSaveDirty]);
  const [offseasonPlan, setOffseasonPlanState] = useState(null);
  const setOffseasonPlan = useCallback(value => { setOffseasonPlanState(value); markSaveDirty(); }, [markSaveDirty]);
  const [notif, setNotif] = useState(null);
  const [seasonHistory, setSeasonHistoryState] = useState({awards:[],records:{singleSeasonHR:null,singleSeasonAVG:null,singleSeasonK:null,careerHR:{},careerW:{}},hallOfFame:[],championships:[],standingsHistory:[],transfers:[]});
  const [saveExists, setSaveExists] = useState(false);
  const [schedule, setSchedule] = useState(null);
  const [news, setNewsState] = useState([]);
  const [mailbox, setMailboxState] = useState([]);
  const [recentResults, setRecentResultsState] = useState([]);
  const [gameResultsMap, setGameResultsMapState] = useState({});
  const [scheduleArchive, setScheduleArchiveState] = useState([]); // 過去シーズン: [{year, schedule, gameResultsMap, myTeamResultsMap}]
  const [cpuTradeOffers, setCpuTradeOffers] = useState([]);
  const [pressEvent, setPressEventState] = useState(null);  // 記者会見イベント
  const [lastPressDay, setLastPressDayState] = useState(0); // 最後に記者会見を行ったgameDay
  const [allStarDone, setAllStarDoneState] = useState(false);
  const [allStarResult, setAllStarResultState] = useState(null);
  const [allStarTriggerDay, setAllStarTriggerDay] = useState(72);
  const [isAutoSaveSuspended, setIsAutoSaveSuspended] = useState(false);
  const [saveQueueState, setSaveQueueState] = useState({ isSaving: false });
  const [persistentEnabled, setPersistentEnabled] = useState(false);
  const [newGameInitializationError, setNewGameInitializationError] = useState(null);
  const [newGameInitializationStatus, setNewGameInitializationStatus] = useState('idle');
  const newGameInitializationRef = useRef(false);
  const newGameInitializationAttemptRef = useRef(0);
  const titleLoadPromiseRef = useRef(null);
  const isNewGameInitializing = useCallback(() => newGameInitializationRef.current, []);
  const getNewGameInitializationAttempt = useCallback(() => newGameInitializationAttemptRef.current, []);
  const runTitleLoad = useCallback(async operation => {
    if (titleLoadPromiseRef.current) return titleLoadPromiseRef.current;
    const task = Promise.resolve().then(operation);
    titleLoadPromiseRef.current = task;
    try { return await task; }
    finally { if (titleLoadPromiseRef.current === task) titleLoadPromiseRef.current = null; }
  }, []);

  const setAllTeamResultsMap = useCallback(value => { setAllTeamResultsMapState(value); markSaveDirty(["matchHistory"]); }, [markSaveDirty]);
  const setAllTeamBoxScoresMap = useCallback(value => { setAllTeamBoxScoresMapState(value); markSaveDirty(["matchHistory"]); }, [markSaveDirty]);
  const setRecentResults = useCallback(value => { setRecentResultsState(value); markSaveDirty(["matchHistory"]); }, [markSaveDirty]);
  const setGameResultsMap = useCallback(value => { setGameResultsMapState(value); markSaveDirty(["matchHistory"]); }, [markSaveDirty]);
  const setScheduleArchive = useCallback(value => { setScheduleArchiveState(value); markSaveDirty(["matchHistory"]); }, [markSaveDirty]);
  const setPressEvent = useCallback(value => { setPressEventState(value); markSaveDirty(["matchHistory"]); }, [markSaveDirty]);
  const setLastPressDay = useCallback(value => { setLastPressDayState(value); markSaveDirty(["matchHistory"]); }, [markSaveDirty]);
  const setAllStarDone = useCallback(value => { setAllStarDoneState(value); markSaveDirty(["matchHistory"]); }, [markSaveDirty]);
  const setAllStarResult = useCallback(value => { setAllStarResultState(value); markSaveDirty(["matchHistory"]); }, [markSaveDirty]);
  const getMatchHistorySnapshot = useCallback(() => matchHistorySnapshot({
    gameResultsMap, allTeamResultsMap, allTeamBoxScoresMap, scheduleArchive, recentResults,
    allStarDone, allStarResult, lastPressDay, pressEvent,
  }), [gameResultsMap, allTeamResultsMap, allTeamBoxScoresMap, scheduleArchive, recentResults,
    allStarDone, allStarResult, lastPressDay, pressEvent]);
  const hydrateMatchHistory = useCallback(saved => {
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
    const next = mergeMatchResultPatch(getMatchHistorySnapshot(), patch);
    hydrateMatchHistory(next);
    markSaveDirty(['matchHistory']);
    return next;
  }, [getMatchHistorySnapshot, hydrateMatchHistory, markSaveDirty]);

  const persistentStoreRef = useRef(null);
  const [persistentSummaries, setPersistentSummaries] = useState(EMPTY_PERSISTENT_SUMMARIES);
  const setSeasonHistory = useCallback((nextValue) => {
    setSeasonHistoryState(nextValue);
    markSaveDirty(['seasonHistory']);
  }, [markSaveDirty]);
  const setNews = useCallback((nextValue) => {
    setNewsState(nextValue);
    markSaveDirty(['news']);
  }, [markSaveDirty]);
  const setMailbox = useCallback((nextValue) => {
    setMailboxState(nextValue);
    markSaveDirty(['mailbox']);
  }, [markSaveDirty]);
  const hydrateLargeSaveData = useCallback((nextValue = {}) => {
    setSeasonHistoryState(nextValue.seasonHistory ?? {});
    setNewsState(Array.isArray(nextValue.news) ? nextValue.news : []);
    setMailboxState(Array.isArray(nextValue.mailbox) ? nextValue.mailbox : []);
  }, []);
  const resetSaveTracking = useCallback(() => {
    saveDirtyTrackerRef.current.reset();
    setSaveDirty(false);
  }, []);

  useEffect(() => {
    let alive = true;
    loadSaveModule()
      .then((mod) => {
        if (!alive) return;
        setSaveExists(mod.hasSave());
        setSaveQueueState(mod.getSaveQueueSnapshot());
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
        setSaveQueueState(mod.getSaveQueueSnapshot());
      })
      .catch((error) => {
        console.error('Failed to refresh save queue state:', error);
      });
  }, []);
  const queueSave = useCallback((state, options = {}) => {
    const pending=[...pendingCareerEntriesRef.current];
    const saveOptions={...options,careerEntries:[...pending,...(options.careerEntries || [])]};
    refreshSaveQueueState();
    return loadSaveModule()
      .then((mod) => mod.enqueueSaveGame(state, saveOptions))
      .then(async (result) => {
        if (!result?.ok) return result;
        const committed=new Set(pending);
        pendingCareerEntriesRef.current=pendingCareerEntriesRef.current.filter(entry=>!committed.has(entry));
        try {
          const archive = await import('../engine/battedBallArchive');
          const status = archive.getBattedBallQueueStatus();
          const archiveResult = status.failedRecords > 0
            ? await archive.retryFailedBattedBallWrites()
            : await archive.flushBattedBallQueue();
          return { ...result, archive: archiveResult };
        } catch (error) {
          console.warn('打球アーカイブのフラッシュに失敗しました。試合セーブは完了しています。', error);
          return { ...result, archive: { ok: false } };
        }
      })
      .finally(() => {
        refreshSaveQueueState();
      });
  }, [refreshSaveQueueState]);
  const beginTrackedSave = useCallback((extraOptions = {}) => {
    const snapshot = saveDirtyTrackerRef.current.snapshot({ persistAll: !saveExists });
    const options = { ...extraOptions };
    if (Array.isArray(snapshot.dirtyScopes)) {
      options.dirtyScopes = snapshot.dirtyScopes;
    }
    return { snapshot, options };
  }, [saveExists]);
  const completeTrackedSave = useCallback((snapshot) => {
    const result = saveDirtyTrackerRef.current.complete(snapshot);
    if (result.isCurrent) setSaveDirty(false);
    return result;
  }, []);

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
    if(teams.length===12){
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
  const upd = useCallback((id, fn) => { dispatch({ type: G.UPD_TEAM, id, fn: (team) => slimTeamForState(fn(team)) }); markSaveDirty(); }, [markSaveDirty]);

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
    if(screen!=='hub' || isAutoSaveSuspended || !saveDirty || saveQueueState.isSaving) return;
    const now = Date.now();
    loadSaveModule().then((mod)=>{
      const intervalMs = mod.getAutoSaveIntervalMs();
      if (lastAutoSaveAt > 0 && now - lastAutoSaveAt < intervalMs) {
        return { result: { ok: false, skipped: true }, snapshot: null };
      }
      const request = beginTrackedSave();
      return queueSave(
        {teams,myId,gameDay,year,saveId,faPool,faYears,seasonHistory,news,mailbox,saveRevision,offseasonPlan,...getMatchHistorySnapshot()},
        request.options,
      ).then((result) => ({ result, snapshot: request.snapshot }));
    }).then(({ result, snapshot })=>{
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
    if (offseasonPlan && isAutoSaveSuspended && !options.payload) return { ok: false, reason: 'transition_in_progress' };
    const request = beginTrackedSave();
    if(options.careerEntries) request.options.careerEntries=options.careerEntries;
    if (options.payload && MATCH_HISTORY_FIELDS.some(key => key in options.payload)) {
      request.options.dirtyScopes = [...new Set([...(request.options.dirtyScopes ?? ['seasonHistory', 'news', 'mailbox']), 'matchHistory'])];
    }
    const result=await queueSave(
      {teams,myId,gameDay,year,saveId,faPool,faYears,seasonHistory,news,mailbox,saveRevision,...getMatchHistorySnapshot(),
        offseasonPlan: offseasonPlan && { ...offseasonPlan, resumeScreen:
          offseasonPlan.stage === 'postseason' && screen === 'hub' ? offseasonPlan.resumeScreen : screen }, ...options.payload},
      request.options,
    );
    if(result.ok){
      setSaveExists(true);
      completeTrackedSave(request.snapshot);
    }
    if (!options.silent || !result.ok || result.warnings?.length || result.archive?.ok === false) {
      const feedback = saveFeedback(result); notify(feedback.message, feedback.type);
    }
    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[teams,myId,saveId,gameDay,year,faPool,faYears,seasonHistory,news,mailbox,saveRevision,offseasonPlan,screen,isAutoSaveSuspended,notify,queueSave,beginTrackedSave,completeTrackedSave,getMatchHistorySnapshot]);

  useEffect(() => {
    if (!offseasonPlan || !OFFSEASON_SAVE_SCREENS.has(screen) || !saveDirty || isAutoSaveSuspended) return;
    const timer = setTimeout(() => { handleSave({ silent: true }).catch(() => notify('編成内容の保存に失敗しました。保存ボタンで再試行してください', 'warn')); }, 750);
    return () => clearTimeout(timer);
  }, [offseasonPlan, screen, saveDirty, isAutoSaveSuspended, handleSave, notify]);

  const ensureInitialTeams = useCallback(async () => {
    if (teams.length === TEAM_DEFS.length) return teams;
    const { createInitialTeamsAsync } = await import('../engine/bootstrapTeams');
    return createInitialTeamsAsync();
  }, [teams]);

  const handleSelect = useCallback(async (id)=>{
    if (newGameInitializationRef.current) return;
    newGameInitializationRef.current = true;
    newGameInitializationAttemptRef.current += 1;
    setNewGameInitializationStatus('initializing');
    setNewGameInitializationError(null);
    try {
      // Finish an already-running legacy load/migration before creating new data.
      // Its App continuation is invalidated by the attempt counter above.
      await titleLoadPromiseRef.current?.catch(() => {});
      await yieldToBrowser();
      const nextTeams = await ensureInitialTeams();
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
      const initialized = await saveMod.enqueueSaveGame({teams:nextTeams,myId:id,saveId:nextSaveId,year,gameDay:1,
        faPool:nextFaPool,faYears:{},seasonHistory:initialHistory,news:[],mailbox:[],offseasonPlan:null,...matchHistorySnapshot({})},
        {initialCareerLogs:collectCareerLogsForIndexedDb(nextTeams)});
      if (!initialized?.ok) {
        const error=new Error('initial_career_log_persistence_failed');
        error.saveResult=initialized;throw error;
      }
      pendingCareerEntriesRef.current=[];
      setTeams(nextTeams);
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
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[ensureInitialTeams, notify, setSaveId, year]);

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

  const handleInterview = useCallback((newsId,opt)=>{
    upd(myId,t=>({...t,popularity:clamp((t.popularity||50)+opt.popMod,0,100),players:t.players.map(p=>({...p,morale:clamp((p.morale||60)+opt.moraleMod,0,100)}))}));
    setNews(prev=>prev.map(n=>n.id===newsId?{...n,answered:true}:n));
    notify("回答しました！ 人気"+(opt.popMod>=0?"+":"")+opt.popMod+" モラル"+(opt.moraleMod>=0?"+":"")+opt.moraleMod,"ok");
  },[upd,myId,notify,setNews]);

  const toggleLineup = useCallback((pid)=>{
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
    upd(myId, t => ({
      ...t,
      players: t.players.map(p => p.id === pid ? { ...p, convertTarget: target || null } : p),
    }));
  }, [upd, myId]);

  const setRosterDhMode = useCallback((dhMode) => {
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
    if (!Object.values(ROSTER_AUTOMATION_MODES).includes(mode)) return;
    upd(myId, t => ({ ...t, rosterAutomationMode: mode }));
    const labels = {
      [ROSTER_AUTOMATION_MODES.MANUAL]: '手動',
      [ROSTER_AUTOMATION_MODES.EMERGENCY]: '緊急補充',
      [ROSTER_AUTOMATION_MODES.FULL]: 'フル自動',
    };
    notify(`編成モードを「${labels[mode]}」に変更`, 'ok');
  }, [myId, notify, upd]);

  const setStarter = useCallback((pid)=>{upd(myId,t=>({...t,rotation:t.rotation.includes(pid)?t.rotation:[...t.rotation,pid]}));notify("先発ローテに追加","ok");},[upd,myId,notify]);
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
    if(!myTeam) return;
    const p=myTeam.farm.find(x=>x.id===pid);
    if(!p) return;
    if(p.育成){notify("育成選手は一軍出場不可。先に支配下登録してください","warn");return;}
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
    if(!myTeam) return;
    const p=myTeam.farm.find(x=>x.id===pid);
    if(!p||!p.育成) return;
    // 支配下70人枠チェック
    const shihakaNow=myTeam.players.filter(x=>!x.育成).length+myTeam.farm.filter(x=>!x.育成).length;
    if(shihakaNow>=MAX_SHIHAKA_TOTAL){notify(`支配下上限（${MAX_SHIHAKA_TOTAL}人）到達。支配下登録不可`,"warn");return;}
    if(myTeam.players.length>=MAX_ROSTER){notify("支配下枠満杯（最大"+MAX_ROSTER+"名）","warn");return;}
    const minSal=MIN_SALARY_SHIHAKA;
    const newSal=Math.max(p.salary,minSal);
    const diff=newSal-p.salary;
    if(diff>0&&myTeam.budget<diff){notify("予算不足（差額"+Math.round(diff/10000)+"万円必要）","warn");return;}
    upd(myId,t=>({...t,budget:t.budget-diff,farm:t.farm.map(x=>x.id===pid?{...x,育成:false,salary:newSal,contractYears:1,contractYearsLeft:1,ikuseiYears:0}:x)}));
    notify(`${p.name}を支配下登録！`,"ok");
  },[myTeam,upd,myId,notify]);

  const demote = useCallback((pid)=>{
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
    if(!myTeam||myTeam.budget<cg.salary*12){notify("予算不足","warn");return;}
    upd(myId,t=>({...t,budget:t.budget-cg.salary*12,coaches:[...t.coaches,{type:cd.type,typeName:cd.name,emoji:cd.emoji,name:pname(),grade:cg.g,label:cg.label,salary:cg.salary*12,bonus:cg.bonus}]}));
    notify(`${cd.name}(Lv${cg.g})を雇いました！`,"ok");
  },[myTeam,upd,myId,notify]);

  const fireCoach = useCallback((idx)=>{
    upd(myId,t=>({...t,coaches:t.coaches.filter((_,i)=>i!==idx)}));
    notify("コーチを解雇","warn");
  },[upd,myId,notify]);

  const sendScout = useCallback((region)=>{
    if(!myTeam||myTeam.budget<region.cost){notify("予算不足","warn");return;}
    upd(myId,t=>({...t,budget:t.budget-region.cost,scoutMissions:[...t.scoutMissions,{id:uid(),name:region.name,weeksLeft:region.weeks,qMin:region.qMin,qMax:region.qMax,cost:region.cost,foreign:region.foreign,regionFactor:region.regionFactor||1.0}]}));
    notify(`${region.name}へスカウト派遣！`,"ok");
    setTimeout(()=>{
      loadPlayerModule().then((playerMod)=>{upd(myId,t=>{const mis=t.scoutMissions.find(m=>m.name===region.name);if(!mis) return t;const np=playerMod.makePlayer(Math.random()<0.4?"先発":POSITIONS[rng(0,7)],rng(mis.qMin,mis.qMax),Math.random()<0.4,undefined,mis.foreign&&Math.random()<0.7);return{...t,scoutMissions:t.scoutMissions.filter(m=>m!==mis),scoutResults:[...t.scoutResults,{...np,_scoutRegionFactor:mis.regionFactor||1.0,_scoutBudgetFactor:t.budget>300000?0.7:t.budget>150000?0.85:1.0}]};});}).catch((error)=>{console.error('Failed to resolve scout result:', error);notify("スカウト結果の生成に失敗しました","error");});
      notify("スカウト報告が届きました！","ok");
    },3000);
  },[myTeam,upd,myId,notify]);

  const signPlayer = useCallback((idx)=>{
    if(!myTeam) return;
    const p=myTeam.scoutResults[idx];
    if(!p||myTeam.budget<p.salary){notify("予算不足","warn");return;}
    const shihakaNow=myTeam.players.filter(x=>!x.育成).length+myTeam.farm.filter(x=>!x.育成).length;
    if(shihakaNow>=MAX_SHIHAKA_TOTAL){notify(`支配下上限（${MAX_SHIHAKA_TOTAL}人）到達。獲得不可`,"warn");return;}
    upd(myId,t=>({...t,budget:t.budget-p.salary,farm:[...t.farm,{...p,contractYearsLeft:2}],scoutResults:t.scoutResults.filter((_,i)=>i!==idx)}));
    notify(`${p.name}を獲得！`,"ok");
  },[myTeam,upd,myId,notify]);

  const handlePressAnswer = useCallback((choiceIdx) => {
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
    if(!myTeam) return;
    const lvl=myTeam.stadiumLevel??0;
    const UPGRADE_COSTS=[5000000,10000000,20000000];
    if(lvl>=3){notify("球場はすでに最高レベルです","warn");return;}
    const cost=UPGRADE_COSTS[lvl];
    if(myTeam.budget<cost){notify("予算不足","warn");return;}
    upd(myId,t=>({...t,budget:t.budget-cost,stadiumLevel:(t.stadiumLevel??0)+1}));
    notify(`球場をLv${lvl+1}にアップグレード！チケット収入 UP`,"ok");
  },[myTeam,upd,myId,notify]);

  const handleSetTicketPrice = useCallback((nextPrice)=>{
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
    saveId, setSaveId,
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
    saveDirty, setSaveDirty,
    saveQueueState,
    saveRevision, setSaveRevision,
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
    hydrateLargeSaveData, getMatchHistorySnapshot, hydrateMatchHistory, applyMatchResultPatch,
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
