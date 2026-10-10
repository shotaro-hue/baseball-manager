import { saveFeedback } from '../engine/saveFeedback';
import { regularSeasonRequest } from '../engine/seasonProgress';
import { useState, useRef, useEffect } from "react";
import SeasonBatchWorker from "../workers/seasonBatchWorker?worker";
import { uid, rng, rngf, gameDayToDate } from '../utils';
import { quickSimGame, runFarmSeason } from '../engine/simulation';
import { computeBoxScore } from '../engine/postGame';
import { applyRegularSeasonTeamUpdate } from '../engine/regularGameUpdates';
import { generateCpuOffer, generateCpuCpuTrade, classifyTeam, evaluateFrontOfficePlan } from '../engine/trade';
import { executeCpuTrade } from '../engine/cpuTradeExecution';
import { encodePlayoff, initPlayoff } from '../engine/playoff';
import { standingsContext } from '../engine/standings';
import { processCpuFaBids } from '../engine/contract';
import { SEASON_GAMES, BATCH, NEWS_TEMPLATES_WIN, NEWS_TEMPLATES_LOSE, INTERVIEW_QUESTIONS_WIN, INTERVIEW_QUESTIONS_LOSE, INTERVIEW_OPTIONS_WIN, INTERVIEW_OPTIONS_LOSE, TRADE_DEADLINE_MONTH, TRADE_DEADLINE_PROB_EARLY, TRADE_DEADLINE_PROB_PEAK, TRADE_DEADLINE_CPU_CPU_PROB, MAX_ROSTER } from '../constants';
import { createBattedBallBatchRecords } from '../engine/battedBallProfile';
import {
  applyEmergencyRosterMaintenance,
  applyManagementPolicy,
  ROSTER_AUTOMATION_MODES,
  prepareTeamForGame,
} from '../engine/rosterAutomation';
import { isTeamIdSet } from '../engine/teamId';

const MAX_FOREIGN_ACTIVE = 4;
let seasonPlayerModulePromise = null;
let seasonScheduleModulePromise = null;
let seasonSaveModulePromise = null;
let seasonAllStarModulePromise = null;
let seasonBattedBallArchiveModulePromise = null;

function loadSeasonPlayerModule() {
  if (!seasonPlayerModulePromise) seasonPlayerModulePromise = import('../engine/player');
  return seasonPlayerModulePromise;
}

function loadSeasonScheduleModule() {
  if (!seasonScheduleModulePromise) seasonScheduleModulePromise = import('../engine/scheduleGen');
  return seasonScheduleModulePromise;
}

function loadSeasonSaveModule() {
  if (!seasonSaveModulePromise) seasonSaveModulePromise = import('../engine/saveload');
  return seasonSaveModulePromise;
}

function loadSeasonAllStarModule() {
  if (!seasonAllStarModulePromise) seasonAllStarModulePromise = import('../engine/allstar');
  return seasonAllStarModulePromise;
}

function loadSeasonBattedBallArchiveModule() {
  if (!seasonBattedBallArchiveModulePromise) {
    seasonBattedBallArchiveModulePromise = import('../engine/battedBallArchive');
  }
  return seasonBattedBallArchiveModulePromise;
}

export function buildSafeGameResult(rawResult, { oppTeam = null, gameNo = null, source } = {}) {
  const score = {
    my: Number(rawResult?.score?.my) || 0,
    opp: Number(rawResult?.score?.opp) || 0,
  };
  const won = score.my > score.opp;
  const drew = score.my === score.opp;
  const nextResult = {
    ...(rawResult || {}),
    score,
    log: Array.isArray(rawResult?.log) ? rawResult.log : [],
    inningSummary: Array.isArray(rawResult?.inningSummary) ? rawResult.inningSummary : [],
    oppTeam,
    won,
    drew,
    gameNo,
  };
  if (source) nextResult._source = source;
  return nextResult;
}

function applyScheduledCpuManagement(teams, gameDay, myId) {
  return teams.map((team) => (
    team.id === myId
      ? team
      : applyManagementPolicy(team, {
          teams,
          gameDay: gameDay + 1,
          includeRosterChanges: true,
        })
  ));
}

export function useSeasonFlow(gs) {
  const {
    teams, setTeams, myId, myTeam, saveId,
    gameDay, setGameDay, year,
    schedule, setScreen,
    notify, addNews, addTransferLog, pushResult,
    setMailbox, setNews, setRetireModal,
    faPool, setFaPool, faYears, setSeasonHistory,
    saveRevision, setSaveRevision,
    setSaveExists, cpuTradeOffers,
    allStarDone, setAllStarDone, allStarResult, setAllStarResult,
    allStarTriggerDay,
    setAllTeamResultsMap, setPregameError,
    getSeasonHistory,
    getNewsBySelector,
    getMailboxBySelector,
    getGameResultsMap,
    getScheduleArchive,
  } = gs;

  const [gameResult, setGameResult] = useState(null);
  const [currentOpp, setCurrentOpp] = useState(null);
  const [gameMode, setGameMode] = useState(null);
  const [batchResults, setBatchResults] = useState([]);
  const [batchMeta, setBatchMeta] = useState(null);
  const [playoffState, setPlayoffState] = useState(null);
  const savedPostseason = gs.offseasonPlan?.stage === 'postseason'
    && gs.offseasonPlan.year === year && gs.offseasonPlan.myId === myId ? gs.offseasonPlan.playoff : null;
  const playoff = playoffState ?? savedPostseason;
  const setPlayoff = value => {
    const next = typeof value === 'function' ? value(playoff) : value;
    setPlayoffState(next);
    if (next) gs.setOffseasonPlan?.({ version: 1, year, myId, stage: 'postseason',
      resumeScreen: 'playoff', playoff: encodePlayoff(next) });
  };
  const startPlayoff = teamList => initPlayoff(teamList, { year,
    ...standingsContext(getSeasonHistory?.(), getGameResultsMap?.(), year) });
  const [currentGameTeams, setCurrentGameTeams] = useState(null);
  const [batchProgress, setBatchProgress] = useState(null);
  const pendingPlayoffRef = useRef(false);
  const startingRef = useRef(false);
  const appliedGameRef = useRef(null);
  const requestRegularGames = count => regularSeasonRequest({ teams, myId, gameDay, year, schedule, offseasonPlan: gs.offseasonPlan, gameResultsMap: getGameResultsMap() }, count);
  const allowRegularGames = count => {
    const request = requestRegularGames(count);
    if (!request.count) notify(request.reason, 'warn');
    return request.count;
  };
  const isBatchCancelledRef = useRef(false);
  const seasonProgressWorkerRef = useRef(null);
  const seasonProgressTaskIdRef = useRef(null);
  const archiveNormalGame = (log, firstTeam, secondTeam, archiveGameDay = gameDay) => {
    const records = createBattedBallBatchRecords(log, {
      saveId,
      year,
      gameDay: archiveGameDay,
      gameId: `${archiveGameDay}:${firstTeam?.id ?? 'team1'}:${secondTeam?.id ?? 'team2'}`,
      teams: [firstTeam, secondTeam],
      source: 'normal',
    });
    if (records.length === 0) return;
    loadSeasonBattedBallArchiveModule()
      .then((mod) => mod.enqueueBattedBallBatches(records))
      .catch((error) => console.warn("打球アーカイブのキュー投入に失敗しました", error));
  };

  const prevMyPlayersRef = useRef(null);
  const prevMyFarmRef = useRef(null);

  useEffect(()=>{
    if(pendingPlayoffRef.current){
      pendingPlayoffRef.current=false;
      const withFarm=runFarmSeason(teams);
      setTeams(withFarm);
      setPlayoff(startPlayoff(withFarm));
      setScreen('playoff');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[teams]);

  useEffect(() => () => {
    isBatchCancelledRef.current = true;
  }, []);
  useEffect(()=>{
    if(!myTeam) return;
    const prevPlayers=prevMyPlayersRef.current;
    const prevFarm=prevMyFarmRef.current;
    if(prevPlayers!==null){
      const prevPlayerIds=new Set(prevPlayers.map(p=>p.id));
      const newlyDemotedInj=myTeam.farm.filter(p=>prevPlayerIds.has(p.id)&&!myTeam.players.find(x=>x.id===p.id)&&(p.injuryDaysLeft??0)>0);
      if(newlyDemotedInj.length>0){
        const names=newlyDemotedInj.map(p=>`${p.name}（${p.injuryDaysLeft}日）`).join('、');
        notify(`${names}を負傷のため自動降格しました`, 'warn');
      }
    }
    if(prevFarm!==null){
      const prevIneligibleIds=new Set(prevFarm.filter(p=>!p.isIkusei&&((p.injuryDaysLeft??0)>0||(p.registrationCooldownDays??0)>0)).map(p=>p.id));
      const newlyEligible=myTeam.farm.filter(p=>!p.isIkusei&&prevIneligibleIds.has(p.id)&&(p.injuryDaysLeft??0)===0&&(p.registrationCooldownDays??0)===0);
      if(newlyEligible.length>0){
        const names=newlyEligible.map(p=>p.name).join('、');
        notify(`${names}が回復し、再登録可能です`, 'ok');
      }
    }
    prevMyPlayersRef.current=myTeam.players;
    prevMyFarmRef.current=myTeam.farm;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[myTeam]);

  const tryGenerateCpuOffer = (teamsArr = teams) => {
    const offerMyTeam = teamsArr.find(t => t.id === myId);
    if (!offerMyTeam) return;
    const currentDate = gameDayToDate(gameDay, schedule);
    if (currentDate && currentDate.month > TRADE_DEADLINE_MONTH) return;
    let prob = 0.15;
    if (currentDate && currentDate.month === TRADE_DEADLINE_MONTH) {
      prob = currentDate.day > 15 ? TRADE_DEADLINE_PROB_PEAK : TRADE_DEADLINE_PROB_EARLY;
    }
    if (rngf(0, 1) > prob || cpuTradeOffers.length >= 2) return;
    const others=teamsArr.filter(t=>t.id!==myId);
    others.forEach((t) => { t.frontOfficePlan = evaluateFrontOfficePlan(t, teamsArr, gameDay); });
    if(!others.length) return;
    let cpuTeam;
    if (currentDate && currentDate.month === TRADE_DEADLINE_MONTH) {
      const buyers = others.filter((t) => classifyTeam(t, teamsArr) === "buyer");
      cpuTeam = buyers.length ? buyers[rng(0, buyers.length - 1)] : others[rng(0, others.length - 1)];
    } else {
      cpuTeam = others[rng(0, others.length - 1)];
    }
    const offer=generateCpuOffer(cpuTeam,offerMyTeam);
    if(offer){
      const mail={
        id:uid(),
        type:"trade",
        title:`${offer.from.name}からトレードオファー`,
        from:offer.from.name,
        dateLabel:`${year}年 ${gameDay}日目`,
        timestamp:Date.now(),
        read:false,
        resolved:false,
      body:`${offer.from.name}よりトレードの打診がありました。\n\n・獲得したい選手: ${offer.want.map(p=>p.name).join('、')}\n・放出候補: ${offer.offer.length>0?offer.offer.map(p=>p.name).join('、'):'なし'}${offer.cash>0?'\n・金銭: +'+(offer.cash/10000).toLocaleString()+'万円':''}\n\nメール画面から返答してください。`,
        offer
      };
      setMailbox(prev=>[...prev,mail]);
      notify(`${offer.from.name}からトレードオファーが届きました`,'ok');
    }
  };

  /**
   * バッチシミュレーション中に CPU vs CPU のトレードを試みる。
   * @param {object[]} teamsArr
   * @param {number} currentGameDay
   * @returns {{ headline: string, body: string } | null}
   */
  const tryCpuCpuDeadlineTrade = (teamsArr, currentGameDay) => {
    const currentDate = gameDayToDate(currentGameDay, schedule);
    if (!currentDate || currentDate.month !== TRADE_DEADLINE_MONTH) return null;
    if (rngf(0, 1) > TRADE_DEADLINE_CPU_CPU_PROB) return null;

    teamsArr.forEach((t) => { t.frontOfficePlan = evaluateFrontOfficePlan(t, teamsArr, currentGameDay); });
    const cpuTeams = teamsArr.filter((team) => team.id !== myId);
    const result = generateCpuCpuTrade(cpuTeams);
    if (!result) return null;

    const { buyerId, sellerId, buyerGets, sellerGets, buyerName, sellerName } = result;
    const buyer = teamsArr.find((t) => t.id === buyerId);
    const seller = teamsArr.find((t) => t.id === sellerId);
    if (!buyer || !seller) return null;

    if (!executeCpuTrade(teamsArr, result, currentGameDay)) return null;

    return {
      headline: `移籍情報 ${buyerGets.name} が ${buyerName} へ`,
      body: `${sellerName} と ${buyerName} の間でトレードが成立。${buyerName} は ${buyerGets.name} を獲得し、${sellerGets.name} を放出した。`,
      buyerName,
      sellerName,
      buyerGetsName: buyerGets.name,
      sellerGetsName: sellerGets.name,
    };
  };

  const tryGenerateCpuOfferInBatch = (teamsArr, currentGameDay, existingOfferCount) => {
    if (!myTeam) return null;
    const currentDate = gameDayToDate(currentGameDay, schedule);
    if (currentDate && currentDate.month > TRADE_DEADLINE_MONTH) return null;
    let prob = 0.15;
    if (currentDate && currentDate.month === TRADE_DEADLINE_MONTH) {
      prob = currentDate.day > 15 ? TRADE_DEADLINE_PROB_PEAK : TRADE_DEADLINE_PROB_EARLY;
    }
    if (rngf(0, 1) > prob || existingOfferCount >= 2) return null;

    const liveMyTeam = teamsArr.find((t) => t.id === myId);
    if (!liveMyTeam) return null;
    const others = teamsArr.filter((t) => t.id !== myId);
    others.forEach((t) => { t.frontOfficePlan = evaluateFrontOfficePlan(t, teamsArr, currentGameDay); });
    if (!others.length) return null;

    let cpuTeam;
    if (currentDate && currentDate.month === TRADE_DEADLINE_MONTH) {
      const buyers = others.filter((t) => classifyTeam(t, teamsArr) === 'buyer');
      cpuTeam = buyers.length ? buyers[rng(0, buyers.length - 1)] : others[rng(0, others.length - 1)];
    } else {
      cpuTeam = others[rng(0, others.length - 1)];
    }

    const offer = generateCpuOffer(cpuTeam, liveMyTeam);
    if (!offer) return null;
    return {
      id: uid(),
      type: 'trade',
      title: `${offer.from.name}からトレードオファー`,
      from: offer.from.name,
      dateLabel: `${year}年 ${currentGameDay}日目`,
      timestamp: Date.now(),
      read: false,
      resolved: false,
      body: `${offer.from.name}よりトレードの打診がありました。\n\n・獲得したい選手: ${offer.want.map(p => p.name).join('、')}\n・放出候補: ${offer.offer.length > 0 ? offer.offer.map(p => p.name).join('、') : 'なし'}${offer.cash > 0 ? '\n・金銭: +' + (offer.cash / 10000).toLocaleString() + '万円' : ''}\n\nメール画面から返答してください。`,
      offer,
    };
  };

  const tryCpuForeignFaInBatch = (teamsArr, currentGameDay, pool) => {
    if (!pool.length) return { updatedTeams: teamsArr, remainingFaPool: pool, news: null, claimed: [] };
    const foreignPool = pool.filter((p) => p.isForeign);
    if (!foreignPool.length) return { updatedTeams: teamsArr, remainingFaPool: pool, news: null, claimed: [] };

    const res = processCpuFaBids(teamsArr, myId, foreignPool, teamsArr, year);
    if (res.remainingFaPool.length === foreignPool.length) {
      return { updatedTeams: teamsArr, remainingFaPool: pool, news: null, claimed: [] };
    }

    const signedIdSet = new Set(foreignPool.filter((p) => !res.remainingFaPool.some((r) => r.id === p.id)).map((p) => p.id));
    const mergedPool = pool.filter((p) => !signedIdSet.has(p.id));
    const dayNews = (res.news || []).map((item) => ({ ...item, dateLabel: `${year}年 ${currentGameDay}日目` }));
    return { updatedTeams: res.updatedTeams, remainingFaPool: mergedPool, news: dayNews, claimed: res.claimed || [] };
  };

  const applyAllStarSelections = (baseTeams, rosters) => {
    const pickedIds = new Set([...(rosters?.ce || []), ...(rosters?.pa || [])].map(p => p.id));
    return baseTeams.map(t => ({
      ...t,
      players: (t.players || []).map(p => pickedIds.has(p.id)
        ? { ...p, allStarSelections: (p.allStarSelections || 0) + 1 }
        : p),
    }));
  };

  const buildAllStarNewsItems = (asResult, dayLabel) => {
    if (!asResult) return [];
    return [{
      type: 'allstar',
      headline: `オールスター第1戦 セ${asResult.game1.score.ce} - パ${asResult.game1.score.pa}`,
      source: 'NPB公式',
      dateLabel: `${year}年 ${dayLabel}日目`,
      body: `会場: ${asResult.venue}\nセ・リーグ ${asResult.game1.score.ce} - ${asResult.game1.score.pa} パ・リーグ\nMVP: ${asResult.game1.mvp?.name || '選出なし'}`,
    },{
      type: 'allstar',
      headline: `オールスター第2戦 セ${asResult.game2.score.ce} - パ${asResult.game2.score.pa}`,
      source: 'NPB公式',
      dateLabel: `${year}年 ${dayLabel + 1}日目`,
      body: `セ・リーグ ${asResult.game2.score.ce} - ${asResult.game2.score.pa} パ・リーグ\nMVP: ${asResult.game2.mvp?.name || '選出なし'}`,
    }];
  };

  const publishAllStarNews = (asResult, dayLabel) => {
    buildAllStarNewsItems(asResult, dayLabel).forEach((item) => addNews(item));
  };

  const applyDhToTeam = (team, useDh) => prepareTeamForGame(team, useDh);

  const pickOpponentFromSchedule = async (day) => {
    const scheduleMod = await loadSeasonScheduleModule();
    const matchup=scheduleMod.getMyMatchup(schedule,day,myId);
    if(matchup){
      return {opp:teams.find(t=>t.id===matchup.oppId)||null, isHome:matchup.isHome, venueNote:matchup.venueNote};
    }
    return { opp: null, isHome: true, venueNote: null };
  };

  const runSingleDaySimulation = async ({ oppId, useDh, isHome, simulationMode = "detailed" }) => {
    if (!myTeam || !isTeamIdSet(oppId) || seasonProgressTaskIdRef.current || !allowRegularGames(1)) return;

    const startedAt = Date.now();
    const taskId = uid();
    const snapshot = {
      teams,
      saveId,
      schedule,
      faPool,
      seasonHistory: getSeasonHistory(),
      news: getNewsBySelector({ limit: 1000 }),
      mailbox: getMailboxBySelector({ limit: 1000 }),
      gameResultsMap: getGameResultsMap(),
      scheduleArchive: getScheduleArchive(),
      myId,
      gameDay,
      year,
      allStarDone,
      allStarResult,
      allStarTriggerDay,
      saveRevision,
      offseasonPlan: gs.offseasonPlan,
    };

    const cleanupWorker = () => {
      if (seasonProgressWorkerRef.current) {
        seasonProgressWorkerRef.current.terminate();
        seasonProgressWorkerRef.current = null;
      }
      seasonProgressTaskIdRef.current = null;
      setBatchProgress(null);
    };

    isBatchCancelledRef.current = false;
    seasonProgressTaskIdRef.current = taskId;
    setBatchProgress({
      current: 0,
      total: 1,
      startedAt,
      avgMsPerGame: 0,
      etaSec: 0,
      phase: "試合シム",
    });

    try {
      if (seasonProgressWorkerRef.current) {
        seasonProgressWorkerRef.current.terminate();
      }

      const worker = new SeasonBatchWorker();
      seasonProgressWorkerRef.current = worker;

      const result = await new Promise((resolve, reject) => {
        worker.onerror = () => reject(new Error("Single-day worker crashed"));
        worker.onmessage = (event) => {
          const message = event?.data;
          if (!message || typeof message !== "object") return;
          const payload = message.payload || {};
          if (payload.taskId !== seasonProgressTaskIdRef.current) return;

          if (message.type === "ARCHIVE_CHUNK") {
            loadSeasonBattedBallArchiveModule()
              .then((mod) => mod.enqueueBattedBallBatches(payload.chunk?.records))
              .catch((error) => console.warn("打球アーカイブのキュー投入に失敗しました", error));
            return;
          }

          if (message.type === "PROGRESS") {
            setBatchProgress({
              current: Math.max(0, Number(payload.current ?? 0) || 0),
              total: Math.max(1, Number(payload.total ?? 1) || 1),
              startedAt,
              avgMsPerGame: Math.max(0, Number(payload.avgMsPerGame) || 0),
              etaSec: Math.max(0, Number(payload.etaSec) || 0),
              phase: typeof payload.phase === "string" && payload.phase.trim() ? payload.phase : "試合シム",
            });
            return;
          }

          if (message.type === "DONE") {
            resolve(payload.result || null);
            return;
          }

          if (message.type === "CANCEL") {
            resolve(null);
            return;
          }

          if (message.type === "ERROR") {
            reject(new Error(payload.message || "Single-day worker error"));
          }
        };

        worker.postMessage({
          type: "START",
          payload: {
            taskId,
            mode: "singleDay",
            snapshot,
            gameContext: {
              myId,
              gameDay,
              selectedOpponentId: oppId,
              useDh,
              isHome,
              simulationMode,
            },
          },
        });
      });

      if (!result) {
        notify("シミュレーションを中断しました", "warn");
        return;
      }

      const {
        nextState,
        userGameResult,
        summaryCounts,
        screenDirective,
        retireAnnouncement,
      } = result;

      setNews(nextState.news);
      setMailbox(nextState.mailbox);
      setSeasonHistory(nextState.seasonHistory);
      setTeams(nextState.teams);
      setGameDay(nextState.gameDay);
      setGameResult(userGameResult);
      gs.applyMatchResultPatch(result);

      if (retireAnnouncement) {
        setRetireModal(retireAnnouncement);
      }
      if ((summaryCounts?.tradeMailCount || 0) > 0) {
        notify(`トレードオファーが${summaryCounts.tradeMailCount}件届きました`, "ok");
      }

      if (screenDirective === "playoff") {
        const withFarm = runFarmSeason(nextState.teams);
        setTeams(withFarm);
        setPlayoff(startPlayoff(withFarm));
        setScreen("playoff");
        return;
      }
      if (screenDirective === "allstar") {
        setScreen("allstar");
        return;
      }
      setScreen("result");
    } catch (error) {
      console.error("runSingleDaySimulation failed", error);
      notify("試合進行中にエラーが発生しました", "error");
    } finally {
      cleanupWorker();
    }
  };

  // Pick opponent and go to mode select
  const handleStartGame = async () => {
    if (savedPostseason) { setScreen(gs.offseasonPlan.resumeScreen === 'retire_phase' ? 'retire_phase' : 'playoff'); return; }
    if (startingRef.current || seasonProgressTaskIdRef.current || batchProgress || !allowRegularGames(1)) return;
    startingRef.current = true;
    try {
      const {opp,isHome}=await pickOpponentFromSchedule(gameDay);
      if(!opp) return;
  
      const useDh = isHome ? !!myTeam.dhEnabled : !!opp.dhEnabled;
      const neededBatters = useDh ? 9 : 8;
      const activeCount = myTeam.players.filter(p => !p.isIkusei).length;
      if (activeCount > MAX_ROSTER) {
        setPregameError({ message: `一軍登録人数が ${MAX_ROSTER} 人を超えています。現在 ${activeCount} 人です。` });
        return;
      }
      const myNonPitchers = myTeam.players.filter(p => !p.isPitcher && !p.isIkusei);
      const myNonPitcherIds = new Set(myNonPitchers.map(p => p.id));
      const lineupSrc = useDh ? (myTeam.lineupDh || myTeam.lineup || []) : (myTeam.lineupNoDh || myTeam.lineup || []);
      const myLineup = lineupSrc.filter(id => myNonPitcherIds.has(id));
      if (myLineup.length < neededBatters) {
        setPregameError({ message: `先発メンバーが不足しています。必要 ${neededBatters} 人 / 現在 ${myLineup.length} 人です。` });
        return;
      }
      const foreignInLineup = myLineup.filter(id => myNonPitchers.find(p => p.id === id)?.isForeign).length;
      if (foreignInLineup > MAX_FOREIGN_ACTIVE) {
        setPregameError({ message: `先発メンバーの外国人枠は ${MAX_FOREIGN_ACTIVE} 人までです。現在 ${foreignInLineup} 人います。` });
        return;
      }
  
      let preparedMyTeam;
      let preparedOpponent;
      let managedOpponent;
      try {
        preparedMyTeam = applyDhToTeam(myTeam, useDh);
        managedOpponent = applyManagementPolicy(opp, { teams, gameDay, includeRosterChanges: true, automationMode: ROSTER_AUTOMATION_MODES.FULL });
        preparedOpponent = applyDhToTeam(managedOpponent, useDh);
      } catch (error) {
        setPregameError({
          message: error?.validation?.errors?.[0] || error?.message || '編成が成立していません。',
        });
        return;
      }
  
      setCurrentOpp(managedOpponent);
      setCurrentGameTeams({
        my: preparedMyTeam,
        opp: preparedOpponent,
        useDh,
        isHome,
      });
      setPregameError(null);
      setScreen("mode_select");
    } finally { startingRef.current = false; }
  };

  // Mode selected ↁEstart appropriate game type
  const handleModeSelect = mode => {
    if(batchProgress) return;
    setGameMode(mode);
    if(mode==="tactical"){
      const hasCurrentGameTeams = Boolean(currentGameTeams?.my && currentGameTeams?.opp);
      const fallbackMyTeam = teams.find(t=>t.id===myId);
      const hasFallbackOpp = Boolean(currentOpp);
      if (!hasCurrentGameTeams && (!fallbackMyTeam || !hasFallbackOpp)) {
        notify("試合データの読み込みに失敗しました。画面を戻して再度お試しください。", "warn");
        setScreen("hub");
        return;
      }
      setScreen("tactical_game");
    } else {
      const useDh = currentGameTeams?.useDh ?? !!currentOpp?.dhEnabled;
      const isHome = currentGameTeams?.isHome ?? true;
      runSingleDaySimulation({
        oppId: currentOpp?.id,
        useDh,
        isHome,
        simulationMode: "detailed",
      });
    }
  };

  // Auto sim result handler
  const handleAutoSimEnd = async (r) => {
    if (appliedGameRef.current === `${year}:${gameDay}` || !allowRegularGames(1)) return;
    appliedGameRef.current = `${year}:${gameDay}`;
    const myT=teams.find(t=>t.id===myId);
    if(!myT) return;
    const isHome = currentGameTeams?.isHome ?? true;
    const [playerMod, scheduleMod, allStarMod] = await Promise.all([
      loadSeasonPlayerModule(),
      loadSeasonScheduleModule(),
      loadSeasonAllStarModule(),
    ]);
    const won=r.score.my>r.score.opp;
    archiveNormalGame(r.log || [], myT, currentOpp);
    const myUpdate = applyRegularSeasonTeamUpdate(myT, r, { isFirstTeam: true, isHomeTeam: isHome, gameDay, year }, playerMod);
    myUpdate.injuries.filter(i => i.days >= 7).forEach(i => {
      const p = myUpdate.team.players.find(p => p.id === i.id);
      if (p) addNews({type:"season",headline:`${p.name} injured`,source:"Team News",dateLabel:`${year} Year Day ${gameDay}`,body:`${p.name} is expected to miss ${i.days} days due to ${i.type}. The roster will be adjusted.`});
    });
    let updatedTeams = teams.map(t => t.id === myId
      ? applyEmergencyRosterMaintenance(myUpdate.team)
      : t.id === currentOpp.id
        ? applyRegularSeasonTeamUpdate(t, r, { isFirstTeam: false, isHomeTeam: !isHome, gameDay, year }, playerMod).team
        : { ...t });
    // Simulate remaining CPU vs CPU games for this day (schedule-based matchups)
    const _oppId=currentOpp.id;
    const _cpuMatchups=scheduleMod.getCpuMatchups(schedule,gameDay,myId,_oppId);
    const matchupList = _cpuMatchups;

    const cpuSimResults=[];
    for(const matchup of matchupList){
      const a=teams.find(t=>t.id===matchup.homeId);
      const b=teams.find(t=>t.id===matchup.awayId);
      if(!a||!b) continue;
      const useDh=!!a.dhEnabled;
      const cr=quickSimGame(applyDhToTeam(a,useDh),applyDhToTeam(b,useDh));
      archiveNormalGame(cr.log || [], a, b);
      cpuSimResults.push({matchup,cr,homeTeam:a,awayTeam:b,useDh});
    }
    for (const { matchup, cr } of cpuSimResults) {
      const a = updatedTeams.find(t => t.id === matchup.homeId);
      const b = updatedTeams.find(t => t.id === matchup.awayId);
      if (!a || !b) continue;
      Object.assign(a, applyRegularSeasonTeamUpdate(a, cr, { isFirstTeam: true, isHomeTeam: true, gameDay, year }, playerMod).team);
      Object.assign(b, applyRegularSeasonTeamUpdate(b, cr, { isFirstTeam: false, isHomeTeam: false, gameDay, year }, playerMod).team);
    }
    updatedTeams = applyScheduledCpuManagement(updatedTeams, gameDay, myId);
    setAllTeamResultsMap(prev=>{
      const next={...prev};
      const recordGame=(homeId,awayId,cr,hPlayers,aPlayers,oppHName,oppAName)=>{
        const bs=computeBoxScore(cr.log||[],cr.inningSummary||[],hPlayers,aPlayers,cr.score.my,cr.score.opp);
        const hWon=cr.won; const drew=cr.score.my===cr.score.opp;
        next[homeId]={...(next[homeId]||{}),[gameDay]:{won:hWon,drew,myScore:cr.score.my,oppScore:cr.score.opp,oppName:oppAName,oppId:awayId,homeId,awayId,...(bs||{})}};
        next[awayId]={...(next[awayId]||{}),[gameDay]:{won:!hWon&&!drew,drew,myScore:cr.score.opp,oppScore:cr.score.my,oppName:oppHName,oppId:homeId,homeId,awayId,inningScores:bs?.inningScores,myBatting:bs?.awayBatting,oppBatting:bs?.homeBatting,myPitching:bs?.awayPitching,oppPitching:bs?.homePitching}};
      };
      for(const{matchup,cr,homeTeam,awayTeam}of cpuSimResults){
        recordGame(matchup.homeId,matchup.awayId,cr,homeTeam.players,awayTeam.players,homeTeam.name,awayTeam.name);
      }
      return next;
    });
    setGameResult({score:r.score,won,log:r.log||[],inningSummary:r.inningSummary||[],oppTeam:currentOpp,gameNo:gameDay,isHome});
    const autoDate = gameDayToDate(gameDay, schedule);
    if (autoDate && autoDate.month === TRADE_DEADLINE_MONTH) {
      const liveTeams = updatedTeams.map((t) => ({ ...t, players: [...(t.players || [])] }));
      const newsItem = tryCpuCpuDeadlineTrade(liveTeams, gameDay);
      if (newsItem) {
        updatedTeams = liveTeams;
        addNews({ type: 'trade', headline: newsItem.headline, source: 'Baseball Times', dateLabel: `${year}年 ${gameDay}日目`, body: newsItem.body });
        addTransferLog({
          year,
          day: gameDay,
          type: "trade",
          headline: `CPU間トレード ${newsItem.sellerName} -> ${newsItem.buyerName}`,
          fromTeam: newsItem.sellerName,
          toTeam: newsItem.buyerName,
          playersIn: [newsItem.buyerGetsName],
          playersOut: [newsItem.sellerGetsName],
          detail: newsItem.body,
        });
      }
    }
    tryGenerateCpuOffer(updatedTeams);
    setTeams(updatedTeams);
    if(Math.random()<0.04&&myTeam){
      const cands=myTeam.players.filter(p=>p.age>=35&&!p._retireNow&&playerMod.calcRetireWill(p)>=40);
      if(cands.length>0){
        const rp=cands[rng(0,cands.length-1)];
        setRetireModal({player:rp,type:"announce"});
        addNews({type:"season",headline:`引退示唆 ${rp.name}`,source:"球界報道",dateLabel:`${year}年 ${gameDay}日目`,body:`${rp.name}（${rp.age}歳）が引退を示唆した。球団は今後の意向を確認する見込み。`});
      }
    }
    const _tmpl=won?NEWS_TEMPLATES_WIN:NEWS_TEMPLATES_LOSE;
    const _scoreStr=r.score.my+"-"+r.score.opp;
    const _hl=_tmpl[rng(0,_tmpl.length-1)].replace("{team}",myTeam?.name||"自チーム").replace("{opp}",currentOpp?.name||"相手").replace("{score}",_scoreStr);
    addNews({type:"game",headline:_hl,source:"スポーツ報知",dateLabel:`${year}年 ${gameDay}日目`,body:(won?`${myTeam?.name}が${currentOpp?.name}に${_scoreStr}で勝利しました。`:`${myTeam?.name}は${currentOpp?.name}に${_scoreStr}で敗れました。`)});
    if(Math.random()<0.35){
      const _qs=won?INTERVIEW_QUESTIONS_WIN:INTERVIEW_QUESTIONS_LOSE;
      const _opts=won?INTERVIEW_OPTIONS_WIN:INTERVIEW_OPTIONS_LOSE;
      addNews({type:"interview",headline:`インタビュー ${myTeam?.name||""}戦後会見`,source:"球団広報",dateLabel:`${year}年 ${gameDay}日目`,body:"試合後、監督にコメントを求められた。",question:_qs[rng(0,_qs.length-1)],options:_opts});
    }
    const _adrew=r.score.my===r.score.opp;
    pushResult(won,_adrew,currentOpp?.name||"",r.score.my,r.score.opp,gameDay);
    gs.pushGameResult(gameDay,{won,drew:_adrew,isHome,oppName:currentOpp?.name||"",myScore:r.score.my,oppScore:r.score.opp,log:r.log||[],inningSummary:r.inningSummary||[],oppTeam:currentOpp});
    setGameDay(d=>d+1);
    if(!allStarDone && gameDay+1===allStarTriggerDay){
      const rosters=allStarMod.selectAllStars(updatedTeams);
      const asResult=allStarMod.runAllStarGame(rosters, year);
      setTeams(prev=>applyAllStarSelections(prev, rosters));
      setAllStarDone(true);
      setAllStarResult({ rosters, gameResult: asResult });
      publishAllStarNews(asResult, gameDay+1);
      setScreen("allstar");
      return;
    }
    if(gameDay>=SEASON_GAMES){
      pendingPlayoffRef.current=true;
    }
    else setScreen("result");
  };

  const handleBatchSim = (count, autoManageMyTeam=false) => {
    if (savedPostseason) { setScreen(gs.offseasonPlan.resumeScreen === 'retire_phase' ? 'retire_phase' : 'playoff'); return; }
    if (startingRef.current || seasonProgressTaskIdRef.current) return;
    const actual = allowRegularGames(count);
    if (actual) runBatchGames(actual, autoManageMyTeam);
  };



  useEffect(()=>{
    return () => {
      if (seasonProgressWorkerRef.current) {
        seasonProgressWorkerRef.current.terminate();
        seasonProgressWorkerRef.current = null;
      }
    };
  },[]);

  const handleSeasonSim = (autoManageMyTeam=false) => {
    handleBatchSim(SEASON_GAMES, autoManageMyTeam);
  };

  const calcLeagueRank = (teamId, allTeams, league) => {
    const same = [...allTeams.filter(t => t.league === league)]
      .sort((a, b) => {
        const pa = a.wins / Math.max(1, a.wins + a.losses);
        const pb = b.wins / Math.max(1, b.wins + b.losses);
        return pb - pa || (b.rf - b.ra) - (a.rf - a.ra);
      });
    return same.findIndex(t => t.id === teamId) + 1;
  };

  const runBatchGames = async (count, autoManageMyTeam=false) => {
    if (seasonProgressTaskIdRef.current || startingRef.current) return;
    const safeCount = allowRegularGames(count);
    if (safeCount <= 0) {
      notify("Failed to start batch processing", "warn");
      return;
    }

    const startedAt = Date.now();
    const taskId = uid();
    const currentSeasonHistory = getSeasonHistory();
    const currentNews = getNewsBySelector({ limit: 1000 });
    const currentMailbox = getMailboxBySelector({ limit: 1000 });
    const currentGameResultsMap = getGameResultsMap();
    const currentScheduleArchive = getScheduleArchive();
    const snapshot = {
      teams,
      saveId,
      schedule,
      faPool,
      seasonHistory: currentSeasonHistory,
      news: currentNews,
      mailbox: currentMailbox,
      gameResultsMap: currentGameResultsMap,
      scheduleArchive: currentScheduleArchive,
      myId,
      gameDay,
      year,
      allStarDone,
      allStarResult,
      allStarTriggerDay,
      saveRevision,
      offseasonPlan: gs.offseasonPlan,
    };

    const cleanupWorker = () => {
      if (seasonProgressWorkerRef.current) {
        seasonProgressWorkerRef.current.terminate();
        seasonProgressWorkerRef.current = null;
      }
      seasonProgressTaskIdRef.current = null;
      gs.setIsAutoSaveSuspended(false);
      setBatchProgress(null);
    };

    isBatchCancelledRef.current = false;
    gs.setIsAutoSaveSuspended(true);
    seasonProgressTaskIdRef.current = taskId;
    setBatchProgress({
      current: 0,
      total: safeCount,
      startedAt,
      avgMsPerGame: 0,
      etaSec: 0,
      phase: "試合シム",
    });

    try {
      if (seasonProgressWorkerRef.current) {
        seasonProgressWorkerRef.current.terminate();
      }

      const worker = new SeasonBatchWorker();
      seasonProgressWorkerRef.current = worker;

      const result = await new Promise((resolve, reject) => {
        worker.onerror = () => {
          reject(new Error("Season batch worker crashed"));
        };
        worker.onmessage = (event) => {
          const message = event?.data;
          if (!message || typeof message !== "object") return;
          const payload = message.payload || {};
          if (payload.taskId !== seasonProgressTaskIdRef.current) return;

          if (message.type === "ARCHIVE_CHUNK") {
            loadSeasonBattedBallArchiveModule()
              .then((mod) => mod.enqueueBattedBallBatches(payload.chunk?.records))
              .catch((error) => console.warn("打球アーカイブのキュー投入に失敗しました", error));
            return;
          }

          if (message.type === "PROGRESS") {
            setBatchProgress({
              current: Math.max(0, Number(payload.current ?? payload.completedGames) || 0),
              total: Math.max(1, Number(payload.total ?? payload.totalGames) || safeCount),
              startedAt,
              avgMsPerGame: Math.max(0, Number(payload.avgMsPerGame) || 0),
              etaSec: Math.max(0, Number(payload.etaSec) || 0),
              phase: typeof payload.phase === "string" && payload.phase.trim() ? payload.phase : "試合シム",
            });
            return;
          }

          if (message.type === "DONE") {
            resolve(payload.result || null);
            return;
          }

          if (message.type === "CANCEL") {
            resolve(null);
            return;
          }

          if (message.type === "ERROR") {
            reject(new Error(payload.message || "Season batch worker error"));
          }
        };

        worker.postMessage({
          type: "START",
          payload: {
            taskId,
            snapshot,
            count: safeCount,
            autoManageMyTeam,
          },
        });
      });

      if (!result) {
        notify("Batch processing was cancelled", "warn");
        return;
      }

      const {
        nextState,
        batchResults,
        batchMeta,
        summaryCounts,
        shouldEnterPlayoff,
      } = result;

      setNews(nextState.news);
      setMailbox(nextState.mailbox);
      setSeasonHistory(nextState.seasonHistory);
      setFaPool(nextState.faPool);
      setTeams(nextState.teams);
      setGameDay(nextState.gameDay);
      setBatchMeta(batchMeta);
      setBatchResults(batchResults);
      const nextMatchHistory = gs.applyMatchResultPatch(result);

      if ((summaryCounts?.tradeMailCount || 0) > 0) {
        notify(`Batch trade offers: ${summaryCounts.tradeMailCount}`, "ok");
      }
      if ((summaryCounts?.foreignSigningCount || 0) > 0) {
        notify(`Batch foreign signings: ${summaryCounts.foreignSigningCount}`, "ok");
      }

      if (shouldEnterPlayoff) {
        const withFarm = runFarmSeason(nextState.teams);
        setTeams(withFarm);
        setPlayoff(startPlayoff(withFarm));
        setScreen("playoff");
      } else {
        setScreen("batch_result");
      }

      loadSeasonSaveModule()
        .then((saveMod) => saveMod.enqueueSaveGame({ ...nextState, ...nextMatchHistory }, { skipBackupRotation: true, preferMainSave: true }))
        .then((saveResult) => {
          if (!saveResult?.ok) {
            console.warn("[BatchSave] saveGame failed after batch", saveResult);
            const feedback = saveFeedback(saveResult); notify(feedback.message, feedback.type);
            return;
          }
          setSaveRevision((prev) => Math.max(prev, Number(nextState.saveRevision) || prev));
          setSaveExists(true);
          if (saveResult.warnings?.length) { const feedback = saveFeedback(saveResult); notify(feedback.message, feedback.type); }
        })
        .catch((error) => {
          console.warn("[BatchSave] saveGame failed after batch", error);
          notify(saveFeedback({ok:false}).message, "warn");
        });
    } catch (error) {
      console.error("runBatchGames failed", error);
      notify("An error occurred during batch processing", "error");
    } finally {
      cleanupWorker();
    }
  };

  // Game over callback from TacticalGameScreen
  const handleTacticalGameEnd = async rawGameResult => {
    if (appliedGameRef.current === `${year}:${gameDay}` || !allowRegularGames(1)) return;
    appliedGameRef.current = `${year}:${gameDay}`;
    if (!myTeam || !currentOpp) {
      notify("試合結果を保存できませんでした。対戦データを再読み込みしてください。", "error");
      setScreen("hub");
      return;
    }
    let gsResult = null;
    try {
      gsResult = buildSafeGameResult(rawGameResult, {
        oppTeam: currentOpp,
        gameNo: gameDay,
        source: "tactical",
      });
      const [playerMod, scheduleMod, allStarMod] = await Promise.all([
        loadSeasonPlayerModule(),
        loadSeasonScheduleModule(),
        loadSeasonAllStarModule(),
      ]);
    const won=gsResult.won;
    const drew=gsResult.drew;
    const isHome = currentGameTeams?.isHome ?? true;
    // Reuse the roster that actually played the tactical game. Other CPU
    // clubs need the same pregame maintenance as the single-day Worker;
    // post-game management is too late for strict lineup validation.
    const gameTeams = teams.map(team => team.id === myId ? team
      : team.id === currentOpp.id ? currentOpp
      : applyManagementPolicy(team, {
          teams, gameDay, includeRosterChanges: true,
          automationMode: ROSTER_AUTOMATION_MODES.FULL,
        }));
    const playedOpponent = gameTeams.find(team => team.id === currentOpp.id);
    archiveNormalGame(gsResult.log || [], myTeam, playedOpponent);
    const myUpdate = applyRegularSeasonTeamUpdate(myTeam, gsResult, { isFirstTeam: true, isHomeTeam: isHome, gameDay, year }, playerMod);
    let updatedTeams = gameTeams.map(t => t.id === myId
      ? applyEmergencyRosterMaintenance(myUpdate.team)
      : t.id === currentOpp.id
        ? applyRegularSeasonTeamUpdate(t, gsResult, { isFirstTeam: false, isHomeTeam: !isHome, gameDay, year }, playerMod).team
        : { ...t });
    const _tOppId=currentOpp.id;
    const _tCpuMatchups=scheduleMod.getCpuMatchups(schedule,gameDay,myId,_tOppId);
    const tMatchupList = _tCpuMatchups;
    const tCpuSimResults=[];
    for(const matchup of tMatchupList){
      const a=gameTeams.find(t=>t.id===matchup.homeId);
      const b=gameTeams.find(t=>t.id===matchup.awayId);
      if(!a||!b) continue;
      const useDh=!!a.dhEnabled;
      const cr=buildSafeGameResult(
        quickSimGame(applyDhToTeam(a,useDh),applyDhToTeam(b,useDh)),
        { oppTeam: b, gameNo: gameDay },
      );
      archiveNormalGame(cr.log || [], a, b);
      tCpuSimResults.push({matchup,cr,homeTeam:a,awayTeam:b});
    }
    for (const { matchup, cr } of tCpuSimResults) {
      const a = updatedTeams.find(t => t.id === matchup.homeId);
      const b = updatedTeams.find(t => t.id === matchup.awayId);
      if (!a || !b) continue;
      Object.assign(a, applyRegularSeasonTeamUpdate(a, cr, { isFirstTeam: true, isHomeTeam: true, gameDay, year }, playerMod).team);
      Object.assign(b, applyRegularSeasonTeamUpdate(b, cr, { isFirstTeam: false, isHomeTeam: false, gameDay, year }, playerMod).team);
    }
    updatedTeams = applyScheduledCpuManagement(updatedTeams, gameDay, myId);
    setAllTeamResultsMap(prev=>{
      try {
        const next={...prev};
        const recordGame=(homeId,awayId,cr,hPlayers,aPlayers,oppHName,oppAName)=>{
          const bs=computeBoxScore(cr.log,cr.inningSummary,hPlayers,aPlayers,cr.score.my,cr.score.opp);
          const hWon=cr.won;
          const gameDrew=cr.drew;
          next[homeId]={...(next[homeId]||{}),[gameDay]:{won:hWon,drew:gameDrew,myScore:cr.score.my,oppScore:cr.score.opp,oppName:oppAName,oppId:awayId,homeId,awayId,...(bs||{})}};
          next[awayId]={...(next[awayId]||{}),[gameDay]:{won:!hWon&&!gameDrew,drew:gameDrew,myScore:cr.score.opp,oppScore:cr.score.my,oppName:oppHName,oppId:homeId,homeId,awayId,inningScores:bs?.inningScores,myBatting:bs?.awayBatting,oppBatting:bs?.homeBatting,myPitching:bs?.awayPitching,oppPitching:bs?.homePitching}};
        };
        for(const{matchup,cr,homeTeam,awayTeam}of tCpuSimResults){
          recordGame(matchup.homeId,matchup.awayId,cr,homeTeam.players,awayTeam.players,homeTeam.name,awayTeam.name);
        }
        const homePerspectiveGameResult = isHome
          ? gsResult
          : {
              ...gsResult,
              won: gsResult.score.opp > gsResult.score.my,
              score: { my: gsResult.score.opp, opp: gsResult.score.my },
            };
        recordGame(
          isHome ? myId : _tOppId,
          isHome ? _tOppId : myId,
          homePerspectiveGameResult,
          isHome ? myTeam.players : playedOpponent.players,
          isHome ? playedOpponent.players : myTeam.players,
          isHome ? myTeam.name : currentOpp.name,
          isHome ? currentOpp.name : myTeam.name,
        );
        return next;
      } catch (error) {
        console.error("[TacticalPostGame] failed to build all-team results", error);
        return prev;
      }
    });
    setGameResult({ ...gsResult, isHome });
    const _tmpl=won?NEWS_TEMPLATES_WIN:NEWS_TEMPLATES_LOSE;
    const _scoreStr=gsResult.score.my+"-"+gsResult.score.opp;
    const _hl=_tmpl[rng(0,_tmpl.length-1)].replace("{team}",myTeam?.name||"自チーム").replace("{opp}",currentOpp?.name||"相手").replace("{score}",_scoreStr);
    addNews({type:"game",headline:_hl,source:"スポーツ報知",dateLabel:`${year}年 ${gameDay}日目`,body:(won?`${myTeam?.name}が${currentOpp?.name}に${_scoreStr}で勝利しました。`:`${myTeam?.name}は${currentOpp?.name}に${_scoreStr}で敗れました。`)});
    if(Math.random()<0.35){
      const _qs=won?INTERVIEW_QUESTIONS_WIN:INTERVIEW_QUESTIONS_LOSE;
      const _opts=won?INTERVIEW_OPTIONS_WIN:INTERVIEW_OPTIONS_LOSE;
      addNews({type:"interview",headline:`インタビュー ${myTeam?.name||""}戦後会見`,source:"球団広報",dateLabel:`${year}年 ${gameDay}日目`,body:"試合後、監督にコメントを求められた。",question:_qs[rng(0,_qs.length-1)],options:_opts});
    }
    const tacticalDate = gameDayToDate(gameDay, schedule);
    if (tacticalDate && tacticalDate.month === TRADE_DEADLINE_MONTH) {
      const liveTeams = updatedTeams.map((t) => ({ ...t, players: [...(t.players || [])] }));
      const newsItem = tryCpuCpuDeadlineTrade(liveTeams, gameDay);
      if (newsItem) {
        updatedTeams = liveTeams;
        addNews({ type: 'trade', headline: newsItem.headline, source: 'Baseball Times', dateLabel: `${year}年 ${gameDay}日目`, body: newsItem.body });
        addTransferLog({
          year,
          day: gameDay,
          type: "trade",
          headline: `CPU間トレード ${newsItem.sellerName} -> ${newsItem.buyerName}`,
          fromTeam: newsItem.sellerName,
          toTeam: newsItem.buyerName,
          playersIn: [newsItem.buyerGetsName],
          playersOut: [newsItem.sellerGetsName],
          detail: newsItem.body,
        });
      }
    }
    tryGenerateCpuOffer(updatedTeams);
    setTeams(updatedTeams);
    pushResult(won,drew,currentOpp?.name||"",gsResult.score.my,gsResult.score.opp,gameDay);
    gs.pushGameResult(gameDay,{won,drew,isHome,oppName:currentOpp?.name||"",myScore:gsResult.score.my,oppScore:gsResult.score.opp,log:gsResult.log,inningSummary:gsResult.inningSummary,oppTeam:currentOpp});
    setGameDay(d=>d+1);
    if(!allStarDone && gameDay+1===allStarTriggerDay){
      const rosters=allStarMod.selectAllStars(updatedTeams);
      const asResult=allStarMod.runAllStarGame(rosters, year);
      setTeams(prev=>applyAllStarSelections(prev, rosters));
      setAllStarDone(true);
      setAllStarResult({ rosters, gameResult: asResult });
      publishAllStarNews(asResult, gameDay+1);
      setScreen("allstar");
      return;
    }
      if(gameDay>=SEASON_GAMES){
        pendingPlayoffRef.current=true;
      }
      else setScreen("result");
    } catch (error) {
      console.error("[TacticalPostGame] failed to finalize tactical game", error);
      // ⚠️ セキュリティ: 画面表示用にエラーメッセージをそのまま表示せず、固定文言で通知する
      if (!gsResult) {
        gsResult = buildSafeGameResult(rawGameResult, {
          oppTeam: currentOpp,
          gameNo: gameDay,
          source: "tactical_fallback",
        });
      }
      setGameResult({ ...gsResult, isHome: currentGameTeams?.isHome ?? true });
      setScreen("result");
      notify("試合後処理でエラーが発生したため、一部の集計をスキップして結果画面へ遷移しました。", "warn");
    }
  };

  return {
    gameResult, setGameResult,
    currentOpp, setCurrentOpp,
    currentGameTeams, setCurrentGameTeams,
    gameMode, setGameMode,
    batchResults, setBatchResults,
    batchMeta, setBatchMeta,
    playoff, setPlayoff,
    batchProgress,
    handleStartGame,
    handleModeSelect,
    handleAutoSimEnd,
    handleBatchSim,
    handleSeasonSim,
    handleTacticalGameEnd,
    tryGenerateCpuOffer,
  };
}
