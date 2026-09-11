import { useState, useRef, useEffect } from "react";
import SeasonBatchWorker from "../workers/seasonBatchWorker?worker";
import { uid, rng, rngf, gameDayToDate } from '../utils';
import { quickSimGame, runFarmSeason } from '../engine/simulation';
import { applyGameStatsFromLog, applyPostGameCondition, computeBoxScore } from '../engine/postGame';
import { calcRevenue } from '../engine/finance';
import { applyPopularityDelta } from '../engine/fanSentiment';
import { generateCpuOffer, generateCpuCpuTrade, classifyTeam, evaluateFrontOfficePlan } from '../engine/trade';
import { initPlayoff } from '../engine/playoff';
import { processCpuFaBids } from '../engine/contract';
import { cancelDeferredPostGameWork, scheduleDeferredPostGameWork } from '../engine/postGameProcessing';
import { SEASON_GAMES, BATCH, NEWS_TEMPLATES_WIN, NEWS_TEMPLATES_LOSE, INTERVIEW_QUESTIONS_WIN, INTERVIEW_QUESTIONS_LOSE, INTERVIEW_OPTIONS_WIN, INTERVIEW_OPTIONS_LOSE, TRADE_DEADLINE_MONTH, TRADE_DEADLINE_PROB_EARLY, TRADE_DEADLINE_PROB_PEAK, TRADE_DEADLINE_CPU_CPU_PROB, INJURY_HISTORY_MAX, MAX_ROSTER } from '../constants';
import { createBattedBallBatchRecords } from '../engine/battedBallProfile';
import {
  applyEmergencyRosterMaintenance,
  applyManagementPolicy,
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

function applyDefenseCoachRecovery(players, coaches) {
  const defBonus=(coaches||[]).filter(c=>c.type==='defense').reduce((s,c)=>s+(c.bonus||0),0);
  if(!defBonus) return players;
  return players.map(p=>{if(!p.injuryDaysLeft) return p;const extra=rngf(0,1)<(defBonus*0.1)?1:0;if(!extra) return p;const next=Math.max(0,p.injuryDaysLeft-extra);return{...p,injuryDaysLeft:next,injury:next>0?p.injury:null,injuryPart:next>0?p.injuryPart:null};});
}


function applyInjuriesToPlayers(players, injuries, year) {
  if (!injuries.length) return players;
  return players.map((p) => {
    const inj = injuries.find((i) => i.id === p.id);
    if (!inj) return p;
    const history = [
      ...(p.injuryHistory ?? []),
      { part: inj.part, year },
    ].slice(-INJURY_HISTORY_MAX);
    return {
      ...p,
      injury: inj.type,
      injuryDaysLeft: inj.days,
      injuryPart: inj.part,
      injuryHistory: history,
    };
  });
}

function tickCooldowns(players) {
  return players.map(p=>{const cd=p.registrationCooldownDays??0;if(!cd)return p;return{...p,registrationCooldownDays:Math.max(0,cd-1)};});
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
    notify, upd, addNews, addTransferLog, pushResult,
    setMailbox, setNews, setRetireModal,
    faPool, setFaPool, faYears, setSeasonHistory,
    saveRevision, setSaveRevision,
    setSaveExists, cpuTradeOffers,
    allStarDone, setAllStarDone, allStarResult, setAllStarResult,
    allStarTriggerDay,
    setAllTeamResultsMap, setAllTeamBoxScoresMap, setPregameError,
    getSeasonHistory,
    getNewsBySelector,
    getMailboxBySelector,
    getGameResultsMap,
    getScheduleArchive,
    resetSaveTracking,
  } = gs;

  const [gameResult, setGameResult] = useState(null);
  const [currentOpp, setCurrentOpp] = useState(null);
  const [gameMode, setGameMode] = useState(null);
  const [batchResults, setBatchResults] = useState([]);
  const [batchMeta, setBatchMeta] = useState(null);
  const [playoff, setPlayoff] = useState(null);
  const [currentGameTeams, setCurrentGameTeams] = useState(null);
  const [batchProgress, setBatchProgress] = useState(null);
  const pendingPlayoffRef = useRef(false);
  const isBatchCancelledRef = useRef(false);
  const seasonProgressWorkerRef = useRef(null);
  const seasonProgressTaskIdRef = useRef(null);
  const deferredBatchPatchRef = useRef(null);
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
      setPlayoff(initPlayoff(withFarm));
      setScreen('playoff');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[teams]);

  useEffect(() => () => {
    isBatchCancelledRef.current = true;
    if (deferredBatchPatchRef.current) {
      cancelDeferredPostGameWork(deferredBatchPatchRef.current);
      deferredBatchPatchRef.current = null;
    }
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

  const tryGenerateCpuOffer = () => {
    if (!myTeam) return;
    const currentDate = gameDayToDate(gameDay, schedule);
    if (currentDate && currentDate.month > TRADE_DEADLINE_MONTH) return;
    let prob = 0.15;
    if (currentDate && currentDate.month === TRADE_DEADLINE_MONTH) {
      prob = currentDate.day > 15 ? TRADE_DEADLINE_PROB_PEAK : TRADE_DEADLINE_PROB_EARLY;
    }
    if (rngf(0, 1) > prob || cpuTradeOffers.length >= 2) return;
    const others=teams.filter(t=>t.id!==myId);
    others.forEach((t) => { t.frontOfficePlan = evaluateFrontOfficePlan(t, teams, gameDay); });
    if(!others.length) return;
    let cpuTeam;
    if (currentDate && currentDate.month === TRADE_DEADLINE_MONTH) {
      const buyers = others.filter((t) => classifyTeam(t, teams) === "buyer");
      cpuTeam = buyers.length ? buyers[rng(0, buyers.length - 1)] : others[rng(0, others.length - 1)];
    } else {
      cpuTeam = others[rng(0, others.length - 1)];
    }
    const offer=generateCpuOffer(cpuTeam,myTeam);
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

    buyer.players = [...buyer.players.filter((p) => p.id !== sellerGets.id), buyerGets];
    seller.players = [...seller.players.filter((p) => p.id !== buyerGets.id), sellerGets];

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
    const myLeague=myTeam?.league;
    const pool=teams.filter(t=>t.id!==myId&&t.league===myLeague);
    return {opp:pool[rng(0,pool.length-1)]||teams.find(t=>t.id!==myId),isHome:true,venueNote:null};
  };

  const mergeAllTeamResultsPatch = (patch) => {
    if (!patch || typeof patch !== "object") return;
    setAllTeamResultsMap((prev) => {
      let next = prev;
      for (const [teamId, days] of Object.entries(patch)) {
        const currentTeamMap = prev[teamId] || {};
        let hasDiff = false;
        for (const [dayKey, dayValue] of Object.entries(days || {})) {
          if (currentTeamMap[dayKey] !== dayValue) {
            hasDiff = true;
            break;
          }
        }
        if (!hasDiff) continue;
        next = {
          ...next,
          [teamId]: { ...currentTeamMap, ...days },
        };
      }
      return next;
    });
  };

  const mergeAllTeamBoxScoresPatch = (patch) => {
    if (!patch || typeof patch !== "object") return;
    setAllTeamBoxScoresMap((prev) => {
      let next = prev;
      for (const [teamId, days] of Object.entries(patch)) {
        const currentTeamMap = prev[teamId] || {};
        let hasDiff = false;
        for (const [dayKey, dayValue] of Object.entries(days || {})) {
          if (currentTeamMap[dayKey] !== dayValue) {
            hasDiff = true;
            break;
          }
        }
        if (!hasDiff) continue;
        next = {
          ...next,
          [teamId]: { ...currentTeamMap, ...days },
        };
      }
      return next;
    });
  };

  const runSingleDaySimulation = async ({ oppId, useDh, isHome, simulationMode = "detailed" }) => {
    if (!myTeam || !isTeamIdSet(oppId)) return;

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
        recentResultsPatch,
        gameResultsMapPatch,
        allTeamResultsPatch,
        summaryCounts,
        screenDirective,
        nextAllStarDone,
        allStarPayload,
        retireAnnouncement,
      } = result;

      setNews(nextState.news);
      setMailbox(nextState.mailbox);
      setSeasonHistory(nextState.seasonHistory);
      setTeams(nextState.teams);
      setGameDay(nextState.gameDay);
      setGameResult(userGameResult);
      mergeAllTeamResultsPatch(allTeamResultsPatch);
      gs.setGameResultsMap((prev) => ({ ...prev, ...gameResultsMapPatch }));
      (recentResultsPatch || []).slice().reverse().forEach((entry) => {
        pushResult(entry.won, entry.drew, entry.oppName, entry.myScore, entry.oppScore, entry.gameNo);
      });

      if (retireAnnouncement) {
        setRetireModal(retireAnnouncement);
      }
      if (nextAllStarDone) {
        setAllStarDone(true);
      }
      if (allStarPayload) {
        setAllStarResult(allStarPayload);
      }
      if ((summaryCounts?.tradeMailCount || 0) > 0) {
        notify(`トレードオファーが${summaryCounts.tradeMailCount}件届きました`, "ok");
      }

      if (screenDirective === "playoff") {
        const withFarm = runFarmSeason(nextState.teams);
        setTeams(withFarm);
        setPlayoff(initPlayoff(withFarm));
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
    if(batchProgress) return;
    if(!myTeam) return;
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
    try {
      preparedMyTeam = applyDhToTeam(myTeam, useDh);
      preparedOpponent = applyDhToTeam(opp, useDh);
    } catch (error) {
      setPregameError({
        message: error?.validation?.errors?.[0] || error?.message || '編成が成立していません。',
      });
      return;
    }

    setCurrentOpp(opp);
    setCurrentGameTeams({
      my: preparedMyTeam,
      opp: preparedOpponent,
      useDh,
      isHome,
    });
    setScreen("mode_select");
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
    const myT=teams.find(t=>t.id===myId);
    if(!myT) return;
    const isHome = currentGameTeams?.isHome ?? true;
    const [playerMod, scheduleMod, allStarMod] = await Promise.all([
      loadSeasonPlayerModule(),
      loadSeasonScheduleModule(),
      loadSeasonAllStarModule(),
    ]);
    const won=r.score.my>r.score.opp;
    const drew=r.score.my===r.score.opp;
    archiveNormalGame(r.log || [], myT, currentOpp);
    upd(myId,t=>{
      let updated={...t,
        wins:t.wins+(won?1:0),losses:t.losses+(!won&&!drew?1:0),draws:t.draws+(drew?1:0),
        rf:t.rf+r.score.my,ra:t.ra+r.score.opp,
        rotIdx:t.rotIdx+1,
      };
      updated.players=applyGameStatsFromLog(updated.players, r.log||[], true, won, gameDay);
      updated.players=applyPostGameCondition(updated.players, r.log||[], true, gameDay, isHome);
      updated.players=playerMod.tickInjuries(updated.players);
      updated.players=playerMod.tickPositionTraining(updated.players);
      updated.players=updated.players.map(p=>({...p,daysOnActiveRoster:(p.daysOnActiveRoster??0)+1}));
      updated.players=applyDefenseCoachRecovery(updated.players,t.coaches);
      const newInj=playerMod.checkForInjuries(updated.players, year);
      if(newInj.length>0){
        const injNames=newInj.reduce((acc,i)=>{const p=updated.players.find(x=>x.id===i.id);if(p)acc.push({name:p.name,...i});return acc;},[]);
        updated.players=applyInjuriesToPlayers(updated.players, newInj, year);
        injNames.filter(i=>i.days>=7).forEach(i=>{addNews({type:"season",headline:`${i.name} injured`,source:"Team News",dateLabel:`${year} Year Day ${gameDay}`,body:`${i.name} is expected to miss ${i.days} days due to ${i.type}. The roster will be adjusted.`});});
      }
      updated.farm=tickCooldowns(updated.farm??[]);
      updated=applyEmergencyRosterMaintenance(updated);
      const popFields=applyPopularityDelta(t,won,drew);updated={...updated,...popFields};
      const rev=calcRevenue(updated);
      const revTotal=rev.ticket+rev.sponsor+rev.merch;
      updated.budget+=revTotal;
      updated.revenueThisSeason=(updated.revenueThisSeason??0)+revTotal;
      return updated;
    });
    // Update opponent's team record and individual player stats
    upd(currentOpp.id,t=>{
      let updated={...t,
        wins:t.wins+(!won&&!drew?1:0),
        losses:t.losses+(won?1:0),
        draws:t.draws+(drew?1:0),
        rf:t.rf+r.score.opp,
        ra:t.ra+r.score.my,
      };
      updated.players=applyGameStatsFromLog(updated.players,r.log||[],false,!won&&!drew, gameDay);
      updated.players=applyPostGameCondition(updated.players,r.log||[],false,gameDay, !isHome);
      updated.players=playerMod.tickInjuries(updated.players);
      const newInj=playerMod.checkForInjuries(updated.players, year);
      updated.players=applyInjuriesToPlayers(updated.players, newInj, year);
      Object.assign(updated,applyPopularityDelta(t,!won&&!drew,drew));
      return updated;
    });
    // Simulate remaining CPU vs CPU games for this day (schedule-based matchups)
    const _oppId=currentOpp.id;
    const _cpuMatchups=scheduleMod.getCpuMatchups(schedule,gameDay,myId,_oppId);
    const _fallbackOthers=teams.filter(t=>t.id!==myId&&t.id!==_oppId);
    const matchupList=_cpuMatchups.length>0
      ?_cpuMatchups
      :(()=>{const pairs=[];for(let i=0;i<_fallbackOthers.length-1;i+=2)pairs.push({homeId:_fallbackOthers[i].id,awayId:_fallbackOthers[i+1].id});return pairs;})();

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
    setTeams(prev=>{
      let newTeams=prev.map(t=>({...t,players:t.players.map(p=>({...p,stats:{...p.stats}}))}));
      for(const{matchup,cr}of cpuSimResults){
        const a=newTeams.find(t=>t.id===matchup.homeId);
        const b=newTeams.find(t=>t.id===matchup.awayId);
        if(!a||!b) continue;
        const cdrew=cr.score.my===cr.score.opp;
        const aWon=cr.won;
        if(aWon){a.wins++;a.rf+=cr.score.my;a.ra+=cr.score.opp;b.losses++;b.rf+=cr.score.opp;b.ra+=cr.score.my;}
        else if(cdrew){a.draws++;a.rf+=cr.score.my;a.ra+=cr.score.opp;b.draws++;b.rf+=cr.score.opp;b.ra+=cr.score.my;}
        else{b.wins++;b.rf+=cr.score.opp;b.ra+=cr.score.my;a.losses++;a.rf+=cr.score.my;a.ra+=cr.score.opp;}
        Object.assign(a,applyPopularityDelta(a,aWon,cdrew));Object.assign(b,applyPopularityDelta(b,!aWon&&!cdrew,cdrew));
        const aRev=calcRevenue(a);a.budget=(a.budget??0)+aRev.ticket+aRev.sponsor+aRev.merch;a.revenueThisSeason=(a.revenueThisSeason??0)+aRev.ticket+aRev.sponsor+aRev.merch;
        const bRev=calcRevenue(b);b.budget=(b.budget??0)+bRev.ticket+bRev.sponsor+bRev.merch;b.revenueThisSeason=(b.revenueThisSeason??0)+bRev.ticket+bRev.sponsor+bRev.merch;
        a.players=applyGameStatsFromLog(a.players,cr.log||[],true,aWon, gameDay);
        a.players=applyPostGameCondition(a.players,cr.log||[],true,gameDay);
        a.players=playerMod.tickInjuries(a.players);
        const aInj=playerMod.checkForInjuries(a.players,year);
        a.players=applyInjuriesToPlayers(a.players,aInj,year);
        b.players=applyGameStatsFromLog(b.players,cr.log||[],false,!aWon&&!cdrew, gameDay);
        b.players=applyPostGameCondition(b.players,cr.log||[],false,gameDay);
        b.players=playerMod.tickInjuries(b.players);
        const bInj=playerMod.checkForInjuries(b.players,year);
        b.players=applyInjuriesToPlayers(b.players,bInj,year);
      }
      return applyScheduledCpuManagement(newTeams, gameDay, myId);
    });
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
    tryGenerateCpuOffer();
    const autoDate = gameDayToDate(gameDay, schedule);
    if (autoDate && autoDate.month === TRADE_DEADLINE_MONTH) {
      const liveTeams = teams.map((t) => ({ ...t, players: [...(t.players || [])] }));
      const newsItem = tryCpuCpuDeadlineTrade(liveTeams, gameDay);
      if (newsItem) {
        setTeams(liveTeams);
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
      const rosters=allStarMod.selectAllStars(teams);
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
    if(!myTeam) return;
    const requestedCount = Number.isFinite(count) ? Math.floor(count) : BATCH;
    const safeRequestedCount = Math.max(0, requestedCount);
    const actual=Math.min(safeRequestedCount, SEASON_GAMES-(gameDay-1));
    if(actual<=0) return;
    runBatchGames(actual, autoManageMyTeam);
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
    if(!myTeam) return;
    const count=SEASON_GAMES-(gameDay-1);
    if(count<=0) return;
    runBatchGames(count, autoManageMyTeam);
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
    if(!myTeam) return;
    const safeCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
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
    };

    const mergeAllTeamResultsPatch = (patch) => {
      if (!patch || typeof patch !== "object") return;
      setAllTeamResultsMap((prev) => {
        let next = prev;
        for (const [teamId, days] of Object.entries(patch)) {
          const currentTeamMap = prev[teamId] || {};
          let hasDiff = false;
          for (const [dayKey, dayValue] of Object.entries(days || {})) {
            if (currentTeamMap[dayKey] !== dayValue) {
              hasDiff = true;
              break;
            }
          }
          if (!hasDiff) continue;
          next = {
            ...next,
            [teamId]: { ...currentTeamMap, ...days },
          };
        }
        return next;
      });
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
        recentResults: nextRecentResults,
        gameResultsMapPatch,
        allTeamResultsPatch,
        allTeamBoxScoresPatch,
        nextAllStarDone,
        allStarPayload,
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
      mergeAllTeamResultsPatch(allTeamResultsPatch);
      gs.setRecentResults((prev) => [...nextRecentResults, ...prev].slice(0, 5));
      gs.setGameResultsMap((prev) => ({ ...prev, ...gameResultsMapPatch }));
      if (deferredBatchPatchRef.current) {
        cancelDeferredPostGameWork(deferredBatchPatchRef.current);
      }
      deferredBatchPatchRef.current = scheduleDeferredPostGameWork(() => {
        mergeAllTeamBoxScoresPatch(allTeamBoxScoresPatch);
        deferredBatchPatchRef.current = null;
      });

      if (nextAllStarDone) {
        setAllStarDone(true);
      }
      if (allStarPayload) {
        setAllStarResult(allStarPayload);
      }

      if ((summaryCounts?.tradeMailCount || 0) > 0) {
        notify(`Batch trade offers: ${summaryCounts.tradeMailCount}`, "ok");
      }
      if ((summaryCounts?.foreignSigningCount || 0) > 0) {
        notify(`Batch foreign signings: ${summaryCounts.foreignSigningCount}`, "ok");
      }

      if (shouldEnterPlayoff) {
        const withFarm = runFarmSeason(nextState.teams);
        setTeams(withFarm);
        setPlayoff(initPlayoff(withFarm));
        setScreen("playoff");
      } else {
        setScreen("batch_result");
      }

      loadSeasonSaveModule()
        .then((saveMod) => saveMod.enqueueSaveGame(nextState, { skipBackupRotation: true, preferMainSave: true }))
        .then((saveResult) => {
          if (!saveResult?.ok) {
            console.warn("[BatchSave] saveGame failed after batch", saveResult);
            return;
          }
          setSaveRevision((prev) => Math.max(prev, Number(nextState.saveRevision) || prev));
          setSaveExists(true);
          resetSaveTracking();
        })
        .catch((error) => {
          console.warn("[BatchSave] saveGame failed after batch", error);
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
    archiveNormalGame(gsResult.log || [], myTeam, currentOpp);
    upd(myId,t=>{
      try {
        let updated={...t,
        wins:t.wins+(won?1:0),losses:t.losses+(!won&&!drew?1:0),draws:t.draws+(drew?1:0),
        rf:t.rf+gsResult.score.my,ra:t.ra+gsResult.score.opp,
        rotIdx:t.rotIdx+1,
        };
        updated.players=applyGameStatsFromLog(updated.players, gsResult.log, true, won, gameDay);
        updated.players=applyPostGameCondition(updated.players, gsResult.log, true, gameDay, isHome);
        updated.players=playerMod.tickInjuries(updated.players);
        updated.players=playerMod.tickPositionTraining(updated.players);
        updated.players=updated.players.map(p=>({...p,daysOnActiveRoster:(p.daysOnActiveRoster??0)+1}));
        updated.players=applyDefenseCoachRecovery(updated.players,t.coaches);
        const newInj=playerMod.checkForInjuries(updated.players, year);
        updated.players=applyInjuriesToPlayers(updated.players, newInj, year);
        updated.farm=tickCooldowns(updated.farm??[]);
        updated=applyEmergencyRosterMaintenance(updated);
        const popFieldsT=applyPopularityDelta(t,won,drew);updated={...updated,...popFieldsT};
        const rev=calcRevenue(updated);
        const revTotal=rev.ticket+rev.sponsor+rev.merch;
        updated.budget+=revTotal;
        updated.revenueThisSeason=(updated.revenueThisSeason??0)+revTotal;
        return updated;
      } catch (error) {
        console.error("[TacticalPostGame] failed to update my team", error);
        return t;
      }
    });
    upd(currentOpp.id,t=>{
      try {
        let updated={...t,
        wins:t.wins+(!won&&!drew?1:0),
        losses:t.losses+(won?1:0),
        draws:t.draws+(drew?1:0),
        rf:t.rf+gsResult.score.opp,
        ra:t.ra+gsResult.score.my,
        };
        updated.players=applyGameStatsFromLog(updated.players,gsResult.log,false,!won&&!drew, gameDay);
        updated.players=applyPostGameCondition(updated.players,gsResult.log,false,gameDay, !isHome);
        updated.players=playerMod.tickInjuries(updated.players);
        const newInj=playerMod.checkForInjuries(updated.players, year);
        updated.players=applyInjuriesToPlayers(updated.players, newInj, year);
        Object.assign(updated,applyPopularityDelta(t,!won&&!drew,drew));
        return updated;
      } catch (error) {
        console.error("[TacticalPostGame] failed to update opponent team", error);
        return t;
      }
    });
    const _tOppId=currentOpp.id;
    const _tCpuMatchups=scheduleMod.getCpuMatchups(schedule,gameDay,myId,_tOppId);
    const _tFallbackOthers=teams.filter(t=>t.id!==myId&&t.id!==_tOppId);
    const tMatchupList=_tCpuMatchups.length>0
      ?_tCpuMatchups
      :(()=>{const pairs=[];for(let i=0;i<_tFallbackOthers.length-1;i+=2)pairs.push({homeId:_tFallbackOthers[i].id,awayId:_tFallbackOthers[i+1].id});return pairs;})();
    const tCpuSimResults=[];
    for(const matchup of tMatchupList){
      const a=teams.find(t=>t.id===matchup.homeId);
      const b=teams.find(t=>t.id===matchup.awayId);
      if(!a||!b) continue;
      const useDh=!!a.dhEnabled;
      const cr=buildSafeGameResult(
        quickSimGame(applyDhToTeam(a,useDh),applyDhToTeam(b,useDh)),
        { oppTeam: b, gameNo: gameDay },
      );
      archiveNormalGame(cr.log || [], a, b);
      tCpuSimResults.push({matchup,cr,homeTeam:a,awayTeam:b});
    }
    setTeams(prev=>{
      try {
        let newTeams=prev.map(t=>({...t,players:t.players.map(p=>({...p,stats:{...p.stats}}))}));
        for(const{matchup,cr}of tCpuSimResults){
          const a=newTeams.find(t=>t.id===matchup.homeId);
          const b=newTeams.find(t=>t.id===matchup.awayId);
          if(!a||!b) continue;
          const cdrew=cr.drew;
          const aWon=cr.won;
          if(aWon){a.wins++;a.rf+=cr.score.my;a.ra+=cr.score.opp;b.losses++;b.rf+=cr.score.opp;b.ra+=cr.score.my;}
          else if(cdrew){a.draws++;a.rf+=cr.score.my;a.ra+=cr.score.opp;b.draws++;b.rf+=cr.score.opp;b.ra+=cr.score.my;}
          else{b.wins++;b.rf+=cr.score.opp;b.ra+=cr.score.my;a.losses++;a.rf+=cr.score.my;a.ra+=cr.score.opp;}
          Object.assign(a,applyPopularityDelta(a,aWon,cdrew));Object.assign(b,applyPopularityDelta(b,!aWon&&!cdrew,cdrew));
          const aRevT=calcRevenue(a);a.budget=(a.budget??0)+aRevT.ticket+aRevT.sponsor+aRevT.merch;a.revenueThisSeason=(a.revenueThisSeason??0)+aRevT.ticket+aRevT.sponsor+aRevT.merch;
          const bRevT=calcRevenue(b);b.budget=(b.budget??0)+bRevT.ticket+bRevT.sponsor+bRevT.merch;b.revenueThisSeason=(b.revenueThisSeason??0)+bRevT.ticket+bRevT.sponsor+bRevT.merch;
          a.players=applyGameStatsFromLog(a.players,cr.log,true,aWon, gameDay);
          a.players=applyPostGameCondition(a.players,cr.log,true,gameDay);
          a.players=playerMod.tickInjuries(a.players);
          const aInj=playerMod.checkForInjuries(a.players,year);
          a.players=applyInjuriesToPlayers(a.players,aInj,year);
          b.players=applyGameStatsFromLog(b.players,cr.log,false,!aWon&&!cdrew, gameDay);
          b.players=applyPostGameCondition(b.players,cr.log,false,gameDay);
          b.players=playerMod.tickInjuries(b.players);
          const bInj=playerMod.checkForInjuries(b.players,year);
          b.players=applyInjuriesToPlayers(b.players,bInj,year);
        }
        return applyScheduledCpuManagement(newTeams, gameDay, myId);
      } catch (error) {
        console.error("[TacticalPostGame] failed to update cpu matchups", error);
        return prev;
      }
    });
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
          isHome ? myTeam.players : currentOpp.players,
          isHome ? currentOpp.players : myTeam.players,
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
    tryGenerateCpuOffer();
    const tacticalDate = gameDayToDate(gameDay, schedule);
    if (tacticalDate && tacticalDate.month === TRADE_DEADLINE_MONTH) {
      const liveTeams = teams.map((t) => ({ ...t, players: [...(t.players || [])] }));
      const newsItem = tryCpuCpuDeadlineTrade(liveTeams, gameDay);
      if (newsItem) {
        setTeams(liveTeams);
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
    pushResult(won,drew,currentOpp?.name||"",gsResult.score.my,gsResult.score.opp,gameDay);
    gs.pushGameResult(gameDay,{won,drew,isHome,oppName:currentOpp?.name||"",myScore:gsResult.score.my,oppScore:gsResult.score.opp,log:gsResult.log,inningSummary:gsResult.inningSummary,oppTeam:currentOpp});
    setGameDay(d=>d+1);
    if(!allStarDone && gameDay+1===allStarTriggerDay){
      const rosters=allStarMod.selectAllStars(teams);
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
