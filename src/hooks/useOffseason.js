import { nextSeasonMatchHistory } from '../engine/matchHistory';
import { useCallback, useRef, useState } from "react";
import { uid, clamp, rng, rngf, fmtM } from '../utils';
import { calcSeasonAwards, updateRecords, checkHallOfFame } from '../engine/awards';
import { evalOffer, cpuRenewContracts, processCpuFaBids, getFaThreshold, getFaProgress, calcPlayerDemand } from '../engine/contract';
import { initDraftPool } from '../engine/draft';
import { calcPostingRequestProb, calcPostingBid, POSTING_FEE_RATE } from '../engine/posting';
import { calcOffseasonPopDelta, driftPopularity } from '../engine/fanSentiment';
import { SEASON_PARAMS, getDefaultParams } from '../data/scheduleParams.js';
import {
  TEAM_DEFS, OWNER_TRUST_BUDGET_LOW, OWNER_TRUST_BUDGET_HIGH,
  OWNER_TRUST_FACTOR_LOW, OWNER_TRUST_FACTOR_HIGH, POP_RELEASE_PENALTY, POP_RELEASE_SALARY_THRESHOLD,
  FOREIGN_FA_COUNT_MIN, FOREIGN_FA_COUNT_MAX, MIN_SALARY_SHIHAKA, MIN_SALARY_IKUSEI, ACCEPT_THRESHOLD,
  CAMP_COND_VARIATION, CAMP_BREAKOUT_COUNT, CAMP_BREAKOUT_COND_BOOST,
  CAMP_STRUGGLE_COUNT, CAMP_STRUGGLE_COND_HIT, CAMP_MIN_CONDITION,
} from '../constants';
import { createEmptyBattedBallProfile } from '../engine/battedBallProfile';
import { isTeamIdSet } from '../engine/teamId';
import { appendCareerEntryToPlayer, makeCareerEntry } from '../engine/careerStats';
import { prepareOffseasonFreeAgent, shouldArchiveFreeAgentSeason } from '../engine/offseasonMarket';
import { pruneRosterReferences, releaseWaiverPlayers, waiverEligible } from '../engine/offseasonReview';
import { resolveOffseasonFaDeclarations } from '../engine/faDeclaration';
import { renewalEligible, ownedPlayers, mapOwnedPlayers, remainingContractAfterSeason, validContractOffer, validContractTerms, applyAgreedContract } from '../engine/renewalRules';
import { contractSnapshot, isPendingContractReply } from '../engine/contractReplies';
import { planningPlayer, planningSummary } from '../engine/offseasonPlanning';
import { rankLeague, standingsContext } from '../engine/standings';
import { draftPicksForTeam } from '../engine/offseasonResume';
import { hasRecordedFirstTeamSeason } from '../engine/seasonParticipants';

let offseasonPlayerModulePromise = null;
let offseasonScheduleModulePromise = null;
let offseasonSaveModulePromise = null;

function loadOffseasonPlayerModule() {
  if (!offseasonPlayerModulePromise) offseasonPlayerModulePromise = import('../engine/player');
  return offseasonPlayerModulePromise;
}

function loadOffseasonScheduleModule() {
  if (!offseasonScheduleModulePromise) offseasonScheduleModulePromise = import('../engine/scheduleGen');
  return offseasonScheduleModulePromise;
}

function loadOffseasonSaveModule() {
  if (!offseasonSaveModulePromise) offseasonSaveModulePromise = import('../engine/saveload');
  return offseasonSaveModulePromise;
}

function createEmptyStats() {
  return {
    PA: 0, AB: 0, H: 0, D: 0, T: 0, HR: 0, RBI: 0, BB: 0, K: 0, HBP: 0, SF: 0, SH: 0, SB: 0, CS: 0, R: 0,
    evSum: 0, evN: 0, laSum: 0, laN: 0,
    pullBatted: 0, centerBatted: 0, oppositeBatted: 0, hardHit: 0,
    groundBatted: 0, lineBatted: 0, flyBatted: 0,
    sprayPoints: [], battedBallEvents: [], battedBallProfile: createEmptyBattedBallProfile(),
    IP: 0, ER: 0, BBp: 0, HBPp: 0, Kp: 0, HRp: 0, Hp: 0, BF: 0, W: 0, L: 0, SV: 0, HLD: 0, QS: 0, BS: 0,
  };
}

export function useOffseason(gs) {
  const {
    teams, setTeams, myId, myTeam,
    year, setYear, gameDay, setGameDay,
    faPool, setFaPool, setFaYears,
    setSeasonHistory,
    setMailbox, setScreen,
    notify, upd, addNews, addToHistory, addTransferLog,
    setRetireModal, setRetireGamePlayer, retireRole,
    setAllStarDone,
    setAllStarResult,
    setSchedule,
    schedule,
    allTeamResultsMap,
    setGameResultsMap,
    setScheduleArchive,
    setAllTeamResultsMap,
    setAllStarTriggerDay,
    getMailboxItemById,
    getSeasonHistory,
    getGameResultsMap,
  } = gs;

  const [developmentSummaryState, setDevelopmentSummary] = useState(null);
  const developmentSummary = developmentSummaryState ?? gs.offseasonPlan?.growth;
  const [newSeasonInfoState, setNewSeasonInfo] = useState(null);
  const newSeasonInfo = newSeasonInfoState ?? gs.offseasonPlan?.seasonInfo;
  const [springTrainingState, setSpringTrainingData] = useState(null);
  const springTrainingData = springTrainingState ?? gs.offseasonPlan?.spring;
  const [draftPoolState, setDraftPoolState] = useState(null);
  const draftPool = draftPoolState ?? gs.offseasonPlan?.draftPool;
  const setDraftPool = value => { const next = typeof value === 'function' ? value(draftPool) : value;
    setDraftPoolState(next); gs.setOffseasonPlan?.(prev => prev && ({ ...prev, draftPool: next })); };
  const [draftResultState, setDraftResultState] = useState(null);
  const draftResult = draftResultState ?? gs.offseasonPlan?.draftResult;
  const setDraftResult = value => { setDraftResultState(value); gs.setOffseasonPlan?.(prev => prev && ({ ...prev, draftResult: value })); };
  const [draftAllocationState, setDraftAllocationState] = useState(null);
  const draftAllocation = draftAllocationState ?? gs.offseasonPlan?.draftAllocation ?? {pitcher:50,batter:50};
  const setDraftAllocation = value => { setDraftAllocationState(value); gs.setOffseasonPlan?.(prev => prev && ({ ...prev, draftAllocation: value })); };
  const saveDraftView = useCallback((key, value) => gs.setOffseasonPlan?.(prev => prev && ({ ...prev,
    draftViews: { ...prev.draftViews, [key]: value } })), [gs.setOffseasonPlan]);
  const [waiverClaimResultsState, setWaiverClaimResults] = useState(null);
  const waiverClaimResults = waiverClaimResultsState ?? gs.offseasonPlan?.results;
  const [contractRenewalDemandsState, setContractRenewalDemands] = useState(null);
  const contractRenewalDemands = contractRenewalDemandsState ?? gs.offseasonPlan?.demands;
  const [careerPersistenceError, setCareerPersistenceError] = useState(null);
  const nextYearTransitionRef = useRef(false);
  const retireTransitionRef = useRef(false);
  const faPhaseCompletedYear = useRef(null);
  const waiverCompletedYear = useRef(null);
  const planningActionIds = useRef(new Set());
  const draftAppliedRef = useRef(null);
  const handledPostingRequests = useRef(new Set());
  const resetTransientOffseason = () => {
    setDevelopmentSummary(null); setNewSeasonInfo(null); setSpringTrainingData(null);
    setDraftPoolState(null); setDraftResultState(null); setDraftAllocationState(null);
    setWaiverClaimResults(null); setContractRenewalDemands(null); setCareerPersistenceError(null);
    draftAppliedRef.current = null; nextYearTransitionRef.current = false;
    retireTransitionRef.current = false; faPhaseCompletedYear.current = null; waiverCompletedYear.current = null;
    planningActionIds.current.clear();
    handledPostingRequests.current.clear();
  };
  // { [playerId]: { demandSalary, minAcceptSalary, resistanceFactor } }

  // careerLogをコンパクト形式で保存（打球詳細などの不要フィールドを除外）
  const mkCareerEntry = (s, ps, yr, teamId, teamName) => makeCareerEntry(
    s,
    ps || createEmptyStats(),
    yr,
    teamId,
    teamName,
  );

  const appendCareerEntryWithSummary = (player, entry) => appendCareerEntryToPlayer(player, entry);

  const handleNextYear = async (sourceTeams = teams) => {
    if (nextYearTransitionRef.current) return false;
    if (gs.offseasonPlan && gs.screen !== 'spring_training') return false;
    nextYearTransitionRef.current = true;
    gs.setIsAutoSaveSuspended?.(true);
    setCareerPersistenceError(null);
    try {
    const [playerMod, scheduleMod, saveMod] = await Promise.all([
      loadOffseasonPlayerModule(),
      loadOffseasonScheduleModule(),
      loadOffseasonSaveModule(),
    ]);
    const currentGameResultsMap = getGameResultsMap();
    const foreignPool = playerMod.generateForeignFaPool(rng(FOREIGN_FA_COUNT_MIN, FOREIGN_FA_COUNT_MAX));
    const indexedDbEntries = [];
    const archiveSeason = (p, t) => {
      const transferredThisWinter = p.faArchivedYear === year && p.contractSignedYear === year
        && isTeamIdSet(p.faOriginTeamId) && p.faOriginTeamId !== t.id;
      if (transferredThisWinter) return p;
      const entry = mkCareerEntry(p.stats, p.playoffStats, year, t.id, t.name);
      indexedDbEntries.push({ playerId: String(p.id ?? ''), careerEntry: entry });
      return appendCareerEntryWithSummary(p, entry);
    };
    const nextTeams = (Array.isArray(sourceTeams) ? sourceTeams : teams).map(t=>{
      const nextPlayers=t.players.filter(p=>!p._retireNow).map(p=>{
        const compactPlayer = archiveSeason(p, t);
        return {...compactPlayer,age:p.age+1,stats:createEmptyStats(),playoffStats:createEmptyStats(),injury:null,injuryDaysLeft:0,condition:clamp(p.condition+20,60,100),contractYearsLeft:remainingContractAfterSeason(p, year),postingRequested:false,growthPhase:p.age+1<=24?"growth":p.age+1<=29?"peak":p.age+1<=33?"earlyDecline":"decline",retireStyle:p.retireStyle!==undefined?p.retireStyle:(p.age+1>=35?rng(0,100):undefined),serviceYears:p.育成?(p.serviceYears||0):(p.serviceYears||0)+1,ikuseiYears:p.育成?(p.ikuseiYears||0)+1:0};
      });
      const nextIds=new Set(nextPlayers.map(p=>p.id));
      const baseBudget=TEAM_DEFS.find(d=>d.id===t.id)?.budget??t.budget;
      const seasonalPayroll=nextPlayers.reduce((s,p)=>s+(p.salary||0),0)+(t.farm||[]).reduce((s,p)=>s+(p.salary||0),0);
      const rawBudget=baseBudget+Math.round((t.revenueThisSeason||0)*0.6)-seasonalPayroll;
      const trust=t.ownerTrust??50;
      const trustFactor=t.id===myId?(trust<OWNER_TRUST_BUDGET_LOW?OWNER_TRUST_FACTOR_LOW:trust>OWNER_TRUST_BUDGET_HIGH?OWNER_TRUST_FACTOR_HIGH:1.0):1.0;
      const newBudget=Math.max(Math.round(baseBudget*0.5),Math.round(rawBudget*trustFactor));
      const nextFarm = (t.farm || []).map(p => {
        const played = hasRecordedFirstTeamSeason(p) || hasRecordedFirstTeamSeason({ stats: p.playoffStats });
        const archived = played ? archiveSeason(p, t) : p;
        return { ...archived, age: p.age + 1, stats: createEmptyStats(), playoffStats: createEmptyStats(),
          injury: null, injuryDaysLeft: 0, contractYearsLeft: remainingContractAfterSeason(p, year),
          serviceYears: p.育成 ? (p.serviceYears || 0) : (p.serviceYears || 0) + 1,
          ikuseiYears: p.育成 ? (p.ikuseiYears || 0) + 1 : 0 };
      });
      return{...t,wins:0,losses:0,draws:0,rf:0,ra:0,rotIdx:0,revenueThisSeason:0,winStreak:0,loseStreak:0,stadiumLevel:t.stadiumLevel??0,budget:newBudget,players:nextPlayers,lineup:(t.lineup||[]).filter(id=>nextIds.has(id)),lineupNoDh:(t.lineupNoDh||[]).filter(id=>nextIds.has(id)),lineupDh:(t.lineupDh||[]).filter(id=>nextIds.has(id)),rotation:(t.rotation||[]).filter(id=>nextIds.has(id)),farm:nextFarm};
    });
    const unsignedDomestic = faPool.filter(p => !p.isForeign).map(p => {
      if (shouldArchiveFreeAgentSeason(p, year) && p.faArchivedYear !== year) indexedDbEntries.push({ playerId: String(p.id), careerEntry: mkCareerEntry(p.stats, p.playoffStats, year, p.faOriginTeamId, p.faOriginTeamName) });
      return { ...prepareOffseasonFreeAgent(p, year), age: Number.isFinite(p.age) ? p.age + 1 : p.age };
    });
    const persisted = await saveMod.appendCareerEntriesToIndexedDb(indexedDbEntries);
    if (!persisted?.ok) {
      const message = '年度成績の保存に失敗しました。次年度へは進んでいません。再試行してください。';
      setCareerPersistenceError(message);
      notify(message,'warn');
      return false;
    }

    const nextYear=year+1;
    const newSchedule=scheduleMod.generateSeasonSchedule(nextYear, nextTeams);
    const params=SEASON_PARAMS[nextYear]||getDefaultParams(nextYear);
    const allStarTrigger=scheduleMod.calcAllStarTriggerDay(newSchedule, params.allStarSkipDates);
    const nextPool = [...unsignedDomestic, ...foreignPool];
    const nextPlan = gs.offseasonPlan ? { version: 1, year: nextYear, myId,
      stage: 'new_season', resumeScreen: 'new_season', completedYear: year,
      seasonInfo: newSeasonInfo, growth: developmentSummary } : null;
    const nextMatchHistory = nextSeasonMatchHistory({ ...gs, gameResultsMap: currentGameResultsMap }, year, schedule, myId);
    if (gs.handleSave && nextPlan) {
      const saved = await gs.handleSave({ silent: true, payload: { teams: nextTeams, year: nextYear,
        gameDay: 1, faPool: nextPool, faYears: {}, offseasonPlan: nextPlan, ...nextMatchHistory } });
      if (!saved?.ok) { setCareerPersistenceError('新年度の保存に失敗しました。年度は進めていません。再試行してください。'); return false; }
    }
    setTeams(nextTeams);
    // Unsigned domestic players remain available. Archive their saved season before
    // resetting current stats, just as for rostered players; do not invent a team.
    setYear(nextYear);setGameDay(1);setFaPool(nextPool);setDraftAllocationState(null);
    gs.setOffseasonPlan?.(nextPlan);
    gs.hydrateMatchHistory?.(nextMatchHistory);
    gs.markSaveDirty?.(["matchHistory"]);
    // Compatibility for hook-only callers; the application always uses hydration.
    if (!gs.hydrateMatchHistory) {
      setAllStarDone(false); setAllStarResult(null);
      if (schedule) setScheduleArchive(nextMatchHistory.scheduleArchive);
      setGameResultsMap({}); setAllTeamResultsMap({});
    }
    setSchedule(newSchedule);
    setAllStarTriggerDay(allStarTrigger);
    setScreen("new_season");
    return true;
    } catch (error) {
      console.error('年度更新処理に失敗しました:', error);
      const message = '年度成績の保存に失敗しました。次年度へは進んでいません。再試行してください。';
      setCareerPersistenceError(message);
      notify(message,'warn');
      return false;
    } finally {
      nextYearTransitionRef.current = false;
      gs.setIsAutoSaveSuspended?.(gs.isAutoSaveSuspended ?? false);
    }
  };

  const generateSpringTraining = (currentTeams) => {
    const myT = currentTeams.find(t => t.id === myId);
    if (!myT) return null;
    const conditionDeltas = {};
    currentTeams.forEach(t => {
      [...t.players, ...(t.farm || [])].forEach(p => {
        if (p.育成) return;
        conditionDeltas[p.id] = rng(-CAMP_COND_VARIATION, CAMP_COND_VARIATION);
      });
    });
    // 台頭選手: ファームの若手・高potential
    const breakoutCandidates = (myT.farm || [])
      .filter(p => !p.育成 && p.age <= 26 && (p.potential || 50) >= 60)
      .sort((a, b) => (b.potential || 0) - (a.potential || 0));
    const breakoutPlayers = breakoutCandidates.slice(0, CAMP_BREAKOUT_COUNT);
    breakoutPlayers.forEach(p => {
      conditionDeltas[p.id] = (conditionDeltas[p.id] || 0) + CAMP_BREAKOUT_COND_BOOST;
    });
    // 不調選手: 一軍の高齢選手
    const struggleCandidates = myT.players
      .filter(p => p.age >= 30)
      .sort((a, b) => b.age - a.age);
    const strugglePlayers = struggleCandidates.slice(0, CAMP_STRUGGLE_COUNT);
    strugglePlayers.forEach(p => {
      conditionDeltas[p.id] = (conditionDeltas[p.id] || 0) + CAMP_STRUGGLE_COND_HIT;
    });
    // 一軍選手のコンディション変動リスト（表示用）
    const conditionChanges = myT.players.map(p => ({
      id: p.id, name: p.name, pos: p.pos, isPitcher: p.isPitcher, age: p.age,
      oldCond: p.condition ?? 100,
      delta: conditionDeltas[p.id] || 0,
      newCond: clamp((p.condition ?? 100) + (conditionDeltas[p.id] || 0), CAMP_MIN_CONDITION, 100),
      stats: p.stats,
      pitching: p.pitching,
      batting: p.batting,
    }));
    // キャンプイベント
    const campEvents = [];
    breakoutPlayers.forEach(p => {
      campEvents.push({ type: "breakout", playerName: p.name, pos: p.pos, age: p.age, delta: conditionDeltas[p.id] || 0 });
    });
    strugglePlayers.forEach(p => {
      campEvents.push({ type: "struggle", playerName: p.name, pos: p.pos, age: p.age, delta: conditionDeltas[p.id] || 0 });
    });
    // ポジション争い（同一ポジションに複数選手）
    const posGroups = {};
    myT.players.forEach(p => {
      if (!posGroups[p.pos]) posGroups[p.pos] = [];
      posGroups[p.pos].push({
        ...p,
        condChange: conditionDeltas[p.id] || 0,
        newCond: clamp((p.condition ?? 100) + (conditionDeltas[p.id] || 0), CAMP_MIN_CONDITION, 100),
      });
    });
    const rosterBattles = Object.entries(posGroups)
      .filter(([, ps]) => ps.length >= 2)
      .map(([pos, competitors]) => ({ pos, competitors }));
    rosterBattles.slice(0, 2).forEach(({ pos, competitors }) => {
      const sorted = [...competitors].sort((a, b) => b.condChange - a.condChange);
      campEvents.push({ type: "battle", pos, winner: sorted[0].name, loser: sorted[1].name, delta: sorted[0].condChange });
    });
    return { conditionDeltas, conditionChanges, campEvents, rosterBattles };
  };

  const handleDraftComplete = (pl, dr) => {
    if (draftAppliedRef.current === year || gs.offseasonPlan?.draftApplied || (gs.offseasonPlan && gs.screen !== 'draft_review')) return false;
    const ownedIds = new Set(teams.flatMap(t => [...t.players, ...(t.farm || [])].map(p => p.id)));
    const picksFor=teamId=>draftPicksForTeam(pl, dr, teamId).filter(p => !ownedIds.has(p.id));
    const myPicks=picksFor(myId);
    const updatedTeams = teams.map(t => {
      const picks=picksFor(t.id);
      if(!picks.length) return t;
      const owned = new Set([...t.players, ...t.farm].map(p => p.id));
      return{...t,farm:[...t.farm,...picks.filter(p => !owned.has(p.id)).map(p=>({...p,育成:false,salary:Math.max(MIN_SALARY_SHIHAKA,p.salary),contractYears:1,contractYearsLeft:1,contractSignedYear:year,ikuseiYears:0}))]};
    });
    const stData = generateSpringTraining(updatedTeams);
    draftAppliedRef.current = year;
    setTeams(updatedTeams);
    setNewSeasonInfo(prev=>({...(prev||{}),draftCount:myPicks.length,draftNames:myPicks.slice(0,3).map(p=>p.name)}));
    setSpringTrainingData(stData);
    gs.setOffseasonPlan?.(prev => prev && ({ ...prev, draftApplied: true, spring: stData,
      seasonInfo: { ...(newSeasonInfo || {}), draftCount: myPicks.length, draftNames: myPicks.slice(0,3).map(p=>p.name) } }));
    setScreen("spring_training");
    return true;
  };

  const handleSpringTrainingComplete = async () => {
    if (gs.offseasonPlan && gs.screen !== 'spring_training') return false;
    let preparedTeams = teams;
    if (springTrainingData?.conditionDeltas) {
      const deltas = springTrainingData.conditionDeltas;
      preparedTeams = teams.map(t => ({
        ...t,
        players: t.players.map(p => ({
          ...p,
          condition: clamp((p.condition ?? 100) + (deltas[p.id] || 0), CAMP_MIN_CONDITION, 100),
        })),
        farm: (t.farm || []).map(p => ({
          ...p,
          condition: p.育成 ? (p.condition ?? 100) : clamp((p.condition ?? 100) + (deltas[p.id] || 0), CAMP_MIN_CONDITION, 100),
        })),
      }));
    }
    const completed = await handleNextYear(preparedTeams);
    if (completed) setSpringTrainingData(null);
    return completed;
  };

  const handleContractOffer = (pid, sal, yrs, meta = {}) => {
    const p=ownedPlayers(myTeam).find(x=>x.id===pid);
    if (!p || !renewalEligible(p, year) || !validContractOffer(p, sal, yrs)) { notify('選手の契約状況・提示金額・年数を確認してください', 'warn'); return false; }
    const incentives = meta.incentives || {};
    const r=evalOffer(p,{salary:sal,years:yrs,incentives},myTeam,teams);
    const waitDays=Math.max(1, Math.min(7, Number(meta.responseAfterDays)||rng(2,4)));
    const willAccept=r.total>=ACCEPT_THRESHOLD && validContractTerms(p, sal, yrs);
    const deliveryDay=gameDay+waitDays;
    const incentiveParts = [];
    if ((Number(incentives.performanceBonusRate) || 0) > 0) incentiveParts.push(`出来高+${incentives.performanceBonusRate}%`);
    if ((Number(incentives.titleBonus) || 0) > 0) incentiveParts.push(`タイトル${fmtM(incentives.titleBonus)}`);
    if (incentives.optOut) incentiveParts.push("オプトアウト");
    const incentiveLabel = incentiveParts.length ? incentiveParts.join(" / ") : "なし";
    setMailbox(prev=>[...prev.map(m => isPendingContractReply(m) && m.decision?.playerId === pid
      ? { ...m, type: "contract_reply", resolved: true, resolution: "superseded", body: "新しい提示を受け付けたため、この契約回答予定は取り消しました。" } : m),{
      id:uid(),
      type:"contract_decision_pending",
      read:false,
      resolved:false,
      deliverOnDay:deliveryDay,
      title:`【契約回答予定】${p.name}`,
      from:`${p.name} / 代理人`,
      dateLabel:`${year}年 ${deliveryDay}日目`,
      timestamp:Date.now(),
      body:`${p.name}の最終回答は ${waitDays} 日後に届く予定です。\n\n最終提示: ${yrs}年 / ${fmtM(sal)}\nインセンティブ: ${incentiveLabel}\n評価スコア: ${r.total}`,
      decision:{
        playerId:pid,
        playerName:p.name,
        teamId:myId,
        offeredYear:year,
        contractSnapshot:contractSnapshot(p),
        salary:sal,
        years:yrs,
        incentives,
        score:r.total,
        accepted:willAccept,
      },
    }]);
    notify(`📨 ${p.name}の最終回答は${waitDays}日後に受信箱へ届きます`,"ok");
    return true;
  };

  const handleTrade = (myOut, theirIn, tgtTeam, cash) => {
    myOut.forEach(function(p){addToHistory(myId,p,"トレード");});
    setTeams(prev=>prev.map(t=>{
      if(t.id===myId){
        const np=[...t.players.filter(p=>!myOut.find(x=>x.id===p.id)),...theirIn];
        let nl=t.lineup.filter(id=>!myOut.find(x=>x.id===id));
        let nr=t.rotation.filter(id=>!myOut.find(x=>x.id===id));
        theirIn.filter(p=>!p.isPitcher).forEach(p=>{if(nl.length<9)nl=[...nl,p.id];});
        theirIn.filter(p=>p.isPitcher&&p.subtype==="先発").forEach(p=>{if(nr.length<6)nr=[...nr,p.id];});
        return{...t,players:np,lineup:nl,lineupNoDh:nl.slice(0,8),lineupDh:nl.slice(0,9),rotation:nr,budget:t.budget-(cash||0)*10000};
      }
      if(t.id===tgtTeam.id) return{...t,players:[...t.players.filter(p=>!theirIn.find(x=>x.id===p.id)),...myOut],budget:t.budget+(cash||0)*10000};
      return t;
    }));
    gs.setCpuTradeOffers([]);
    notify("🔄 トレード成立！","ok");
    addNews({type:"trade",headline:"【移籍】"+(theirIn.map(p=>p.name).join("、")||"選手")+"が"+(myTeam?.name||"")+"へ",source:"Baseball Times",dateLabel:year+"年 "+gameDay+"日目",body:(myTeam?.name||"自チーム")+"と"+(tgtTeam?.name||"相手")+"の間でトレードが成立。"+(myTeam?.name||"")+"は"+(theirIn.map(p=>p.name).join("、")||"選手")+"を獲得し、"+(myOut.map(p=>p.name).join("、")||"選手")+"を放出した。"+(cash&&cash>0?"\nなお"+Math.abs(cash).toLocaleString()+"万円の金銭も含まれる。":"")});
    addTransferLog({
      year,
      day: gameDay,
      type: "trade",
      headline: `【トレード成立】${myTeam?.name||"自チーム"} ↔ ${tgtTeam?.name||"相手"}`,
      fromTeam: tgtTeam?.name||"相手",
      toTeam: myTeam?.name||"自チーム",
      playersIn: theirIn.map(p=>p.name),
      playersOut: myOut.map(p=>p.name),
      cash,
      detail: `${myTeam?.name||"自チーム"}が${theirIn.map(p=>p.name).join("、")||"なし"}を獲得 / ${myOut.map(p=>p.name).join("、")||"なし"}を放出`,
    });
  };

  const acceptCpuOffer = (idx) => {
    const o=gs.cpuTradeOffers[idx];if(!o)return;
    handleTrade(o.want,o.offer,o.from,-(o.cash||0)/10000);
  };
  const declineCpuOffer = (idx) => {
    gs.setCpuTradeOffers(prev=>prev.filter((_,i)=>i!==idx));
    notify("オファーを断りました","warn");
  };

  const handleMailRead = (id) => {
    setMailbox(prev=>prev.map(m=>m.id===id?{...m,read:true}:m));
  };
  const handleMailAction = (id, action) => {
    const mail = getMailboxItemById(id);
    if(!mail) return;

    // ポスティング申請の承諾/拒否
    if(mail.type==="posting_request"){
      // resolved protects loaded saves; IDs also protect stale callbacks after a mail-read update.
      if(mail.resolved || handledPostingRequests.current.has(mail.id)) return;
      handledPostingRequests.current.add(mail.id);
      const player=myTeam?.players.find(p=>p.id===mail.playerId);
      if(player){
        if(action==="accept"){
          const bidYen=calcPostingBid(player);
          const feeYen=Math.round(bidYen*POSTING_FEE_RATE);
          // 入札・移籍金は円、球団予算は万円。予算への加算境界で一度だけ換算する。
          const feeManYen=feeYen/10000;
          upd(myId,t=>({...t,
            budget:t.budget+feeManYen,
            players:t.players.filter(p=>p.id!==mail.playerId),
            lineup:(t.lineup||[]).filter(pid=>pid!==mail.playerId),
            lineupNoDh:(t.lineupNoDh||[]).filter(pid=>pid!==mail.playerId),
            lineupDh:(t.lineupDh||[]).filter(pid=>pid!==mail.playerId),
            rotation:(t.rotation||[]).filter(pid=>pid!==mail.playerId),
          }));
          setMailbox(prev=>[...prev,{id:uid(),type:"posting_result",read:false,
            title:`【ポスティング成立】${player.name} 入札額${fmtM(bidYen)}`,
            from:"MLB事務局",dateLabel:`${year}年`,timestamp:Date.now(),
            body:`${player.name}のポスティングが成立しました。\n入札額: ${fmtM(bidYen)}\n球団受取移籍金: ${fmtM(feeYen)}（落札額の20%）`,
          }]);
          addNews({type:"season",headline:`【MLB移籍】${player.name}（${myTeam?.name}）がポスティングで渡米`,source:"野球速報",dateLabel:`${year}年`,body:`${player.name}選手がポスティングを通じてMLBへ移籍。入札額${fmtM(bidYen)}、球団移籍金収入${fmtM(feeYen)}。`});
          notify(`${player.name} MLB移籍承認 — 移籍金+${fmtM(feeYen)}`,"ok");
        } else {
          upd(myId,t=>({...t,players:t.players.map(p=>p.id===mail.playerId
            ?{...p,morale:Math.max(0,(p.morale??70)-10)}:p)}));
          notify(`${player.name}のポスティングを拒否（モラル-10）`,"warn");
        }
      }
      setMailbox(prev=>prev.map(m=>m.id===id?{...m,resolved:true,read:true}:m));
      return;
    }

    if(!mail.offer) return;
    if(action==="accept"){
      handleTrade(mail.offer.want,mail.offer.offer,mail.offer.from,-(mail.offer.cash||0)/10000);
    } else {
      notify('オファーを断りました','warn');
    }
    setMailbox(prev=>prev.map(m=>m.id===id?{...m,resolved:true,read:true}:m));
  };

  // 引退モーダル：引き留め
  const handleRetain = (p) => {
    const success=Math.random()*100>(p.retireStyle??50);
    if(success){
      notify(p.name+"の引き留めに成功！","ok");
      upd(myId,t=>({...t,players:t.players.map(x=>x.id===p.id?{...x,morale:Math.min(100,(x.morale||60)+10)}:x)}));
      addNews({type:"season",headline:"【慰留成功】"+p.name+"選手が引退撤回",source:"スポーツ報知",dateLabel:year+"年 "+gameDay+"日目",body:p.name+"選手が引退を撤回し、来季も続投することが決まった。"});
    } else {
      notify(p.name+"の引き留めに失敗…","warn");
      addNews({type:"season",headline:"【引退】"+p.name+"選手が引退を決意",source:"スポーツ報知",dateLabel:year+"年 "+gameDay+"日目",body:p.name+"選手は引退の意志を固め、今季限りで現役を退くことになった。"});
      setRetireModal({player:p,type:"retire_game"});
      return;
    }
    setRetireModal(null);
  };

  // 引退受け入れ→引退試合画面へ
  const handleAcceptRetire = (p) => {
    setRetireModal({player:p,type:"retire_game"});
  };

  // 引退試合実施
  const handleStartRetireGame = (p) => {
    upd(myId,t=>({...t,budget:t.budget+50000,players:t.players.map(x=>x.id===p.id?{...x,_retireRole:retireRole}:x)}));
    setRetireGamePlayer(p);
    setRetireModal(null);
    notify(p.name+"の引退試合！観客収入2倍","ok");
    addNews({type:"season",headline:"【引退試合】"+p.name+"選手の引退試合が開催",source:"野球速報",dateLabel:year+"年 "+gameDay+"日目",body:"満員の観衆が見守る中、"+p.name+"選手の引退試合が行われた。"});
  };

  // 引退試合なし
  const handleSkipRetireGame = (p) => {
    upd(myId,t=>({...t,players:t.players.map(x=>x.id===p.id?{...x,isRetired:true,_retireNow:true}:x)}));
    setRetireModal(null);
    notify(p.name+"が引退しました","warn");
  };

  // 引退フェーズ処理（退場選手確定→成長/衰退→CPU契約→表彰）
  const handleRetirePhaseNext = async (decisions) => {
    if (retireTransitionRef.current) return false;
    retireTransitionRef.current = true;
    setCareerPersistenceError(null);
    try {
    const [playerMod, saveMod] = await Promise.all([
      loadOffseasonPlayerModule(),
      loadOffseasonSaveModule(),
    ]);
    const safeDecisions = decisions && typeof decisions === 'object' ? decisions : {};
    const userRetiredIds = new Set(
      Object.entries(safeDecisions)
        .filter(([, decision]) => decision === 'accepted' || decision === 'retain_failed')
        .map(([playerId]) => playerId),
    );
    Object.entries(safeDecisions).forEach(([playerId, decision]) => {
      if (decision !== 'retained') return;
      const player = myTeam?.players.find((candidate) => String(candidate.id) === playerId);
      if (player) notify(player.name+"の引き留め成功！","ok");
    });

    const retirementByTeam = new Map();
    const retirementCareerEntries = [];
    for (const team of teams) {
      const retiringPlayers = team.id === myId
        ? team.players.filter((player) => userRetiredIds.has(String(player.id)) || player._retireNow)
        : team.players.filter((player) => player.age >= 35 && playerMod.rollRetire(player));
      const alumni = retiringPlayers.map((player) => {
        const careerEntry = mkCareerEntry(player.stats, player.playoffStats, year, team.id, team.name);
        retirementCareerEntries.push({ playerId: String(player.id ?? ''), careerEntry });
        const archivedPlayer = appendCareerEntryWithSummary(player, careerEntry);
        return {
          ...archivedPlayer,
          isRetired: true,
          _retireNow: true,
          exitYear: year,
          exitReason: '引退',
          tenure: player.serviceYears || 1,
        };
      });
      retirementByTeam.set(team.id, {
        ids: new Set(retiringPlayers.map((player) => player.id)),
        alumni,
      });
    }

    const persisted = await saveMod.appendCareerEntriesToIndexedDb(retirementCareerEntries);
    if (!persisted?.ok) {
      const message = '引退選手の最終年成績を保存できませんでした。処理を中断しました。再試行してください。';
      setCareerPersistenceError(message);
      notify(message,'warn');
      return false;
    }

    for (const team of teams) {
      for (const player of retirementByTeam.get(team.id)?.alumni || []) {
        addNews({
          type:"season",
          headline: team.id === myId ? "【引退】"+player.name+"選手が現役引退" : "【引退】"+player.name+"（"+team.name+"）が引退",
          source:"野球速報",
          dateLabel:year+"年",
          body:player.name+"選手（"+player.age+"歳）が"+year+"年シーズンをもって現役を引退した。",
        });
      }
    }
    let mySummary=null;
    const ikuseiExpired = [];
    const developedTeams=teams.map(t=>{
      const retirement = retirementByTeam.get(t.id) || { ids: new Set(), alumni: [] };
      const retiredIds=retirement.ids;
      const activePlayers=t.players.filter(p=>!retiredIds.has(p.id));
      const res=playerMod.developPlayers(activePlayers, t.coaches||[]);
      const farmRes=playerMod.developPlayers(t.farm, t.coaches||[]);
      if(t.id===myId)mySummary=res.summary;
      let finalPlayers=res.players;
      let finalFarm=farmRes.players;
      if(t.id!==myId&&retiredIds.size>0){
        const promoted=finalFarm.filter(p=>p.age<=26).sort((a,b)=>{
          const oa=a.isPitcher?(a.pitching?.velocity||0)+(a.pitching?.control||0)*1.2:(a.batting?.contact||0)+(a.batting?.power||0);
          const ob=b.isPitcher?(b.pitching?.velocity||0)+(b.pitching?.control||0)*1.2:(b.batting?.contact||0)+(b.batting?.power||0);
          return ob-oa;
        }).slice(0,retiredIds.size);
        const pIds=new Set(promoted.map(p=>p.id));
        finalPlayers=[...res.players,...promoted];
        finalFarm=finalFarm.filter(p=>!pIds.has(p.id));
      }
      const winPct=(t.wins||0)/Math.max(1,(t.wins||0)+(t.losses||0));
      const updatedPlayers=finalPlayers.filter(p=>!p._retireNow).map(p=>{
        const pers=p.personality||{};
        const pa=p.stats?.PA||0; const bf=p.stats?.BF||0;
        let delta=0;
        if(pa>=400||bf>=200) delta+=3;
        if(pa>=300||bf>=150) delta+=5; else if(pa<200&&bf<80) delta+=pers.playing>65?-12:-8;
        if(winPct>=0.6) delta+=5; else if(winPct<0.4) delta+=(pers.winning>65?-8:-5);
        if(p.salary>0){const marketBase=p.salary;if(p.salary>=marketBase*1.1) delta+=3;else if(p.salary<marketBase*0.9) delta+=(pers.money>70?-8:-5);}
        if((p.serviceYears||0)>=5) delta+=3;
        const current=p.morale||70; delta+=current<70?3:current>70?-3:0;
        const mentalBonus=(t.coaches||[]).filter(c=>c.type==='mental').reduce((s,c)=>s+Math.floor((c.bonus||0)/2),0);
        delta+=mentalBonus;
        const newMorale=clamp((current)+delta,20,100);
        return{...p,morale:newMorale};
      });
      const ikuseiDismissed=new Set();
      const farmAfterIkusei=finalFarm.filter(fp=>{
        if(fp.育成&&(fp.ikuseiYears||0)>=3){
          ikuseiDismissed.add(fp.id);
          ikuseiExpired.push({ ...fp, isFA: true, contractYearsLeft: 0, departureReason: 'ikusei_expiry',
            marketEntryReason: '育成契約満了', marketLastStats: fp.stats, faEnteredYear: year,
            faOriginTeamId: t.id, faOriginTeamName: t.name, faOriginRoster: 'farm' });
          addNews({type:"season",headline:"【育成契約満了】"+fp.name+"（"+t.name+"）が契約満了",source:"野球速報",dateLabel:year+"年",body:fp.name+"選手（"+fp.age+"歳）は育成3年を満了し、自由契約となった。"});
          return false;
        }
        return true;
      });
      if(t.id===myId){updatedPlayers.filter(p=>(p.morale||70)<45).forEach(p=>{setMailbox(prev=>[...prev,{id:uid(),type:"morale_warning",read:false,title:"【モラル低下】"+p.name+"のモラルが低下しています",from:"チーム管理部",dateLabel:year+"年",timestamp:Date.now(),body:p.name+"選手（"+p.pos+"）のモラルが"+Math.round(p.morale||70)+"まで低下しています。出場機会や年俸条件を確認してください。",player:p}]);});}
      const overseasDeparted=new Set();
      const playersAfterOverseas=updatedPlayers.filter(p=>{
        const thresh=getFaThreshold(p);
        const overseas=p.personality?.overseas||0;
        if(overseas>=70&&(p.daysOnActiveRoster??(p.serviceYears??0)*120)>=thresh.overseas){
          overseasDeparted.add(p.id);
          addNews({type:"season",headline:"【海外FA】"+p.name+"（"+t.name+"）が海外移籍を宣言",source:"野球速報",dateLabel:year+"年",body:p.name+"選手（"+p.age+"歳）が海外FA権を行使し、NPBを離脱した。"});
          if(t.id===myId) setMailbox(prev=>[...prev,{id:uid(),type:"overseas_fa",read:false,title:"【海外FA】"+p.name+"が海外移籍を宣言",from:p.name,dateLabel:year+"年",timestamp:Date.now(),body:p.name+"選手（"+p.age+"歳）が海外FA権を行使しました。チームを離れます。",player:p}]);
          return false;
        }
        return true;
      });

      // ポスティング申請チェック（自チームのみ・オフシーズン一回判定）
      let postingPlayers=playersAfterOverseas;
      if(t.id===myId){
        postingPlayers=playersAfterOverseas.map(p=>{
          if(rngf(0,1)<calcPostingRequestProb(p)){
            setMailbox(prev=>[...prev,{id:uid(),type:"posting_request",read:false,resolved:false,
              title:`【ポスティング申請】${p.name}がMLB挑戦を希望`,
              from:p.name,dateLabel:`${year}年`,timestamp:Date.now(),
              body:`${p.name}（${p.pos}/${p.age}歳、海外志向${p.personality?.overseas??0}）がMLB挑戦を希望しています。ポスティングを承認しますか？\n\n承認すると選手はMLBへ移籍し、球団に移籍金が入ります。拒否すると選手のモラルが低下します。`,
              playerId:p.id,
            }]);
            return{...p,postingRequested:true};
          }
          return p;
        });
      }

      return{...t,players:postingPlayers,...pruneRosterReferences(t, new Set(t.players.filter(p => !postingPlayers.some(entry => entry.id === p.id)).map(p => p.id))),farm:farmAfterIkusei,history:[...(t.history||[]),...retirement.alumni,
        ...finalFarm.filter(p => ikuseiDismissed.has(p.id)).map(p => ({ ...p, exitYear: year, exitReason: '育成契約満了', tenure: p.ikuseiYears ?? 3 }))]};
    });
    // Other clubs settle renewals before the user's market phase so candidates
    // are available before the user's own renewals. Never renew CPU clubs twice.
    // 自チーム満了選手の要求額を事前計算して state に保持
    const awards=calcSeasonAwards(teams,year);
    const currentSeasonHistory = getSeasonHistory();
    const sharedSalaryContext = { year, awards, championship: currentSeasonHistory.championships?.find(c => c.year === year) };
    const declarations = resolveOffseasonFaDeclarations(developedTeams, year, sharedSalaryContext);
    const myDeveloped=declarations.updatedTeams.find(t=>t.id===myId);
    const expiringMine=ownedPlayers(myDeveloped).filter(p=>renewalEligible(p, year));
    const renewResult = cpuRenewContracts(declarations.updatedTeams, myId, developedTeams, sharedSalaryContext);
    const salaryContext = { year, awards, championship: currentSeasonHistory.championships?.find(c => c.year === year), teams: developedTeams, team: myDeveloped };
    const demands={};
    for(const p of expiringMine) demands[p.id]=calcPlayerDemand(p, salaryContext);
    setContractRenewalDemands(demands);
    setTeams(renewResult.updatedTeams);
    const marketEntries = [...ikuseiExpired, ...declarations.newFaPlayers, ...renewResult.newFaPlayers.map(p => {
      const origin = developedTeams.find(t => ownedPlayers(t).some(entry => entry.id === p.id));
      return { ...p, marketLastStats: p.stats, faEnteredYear: year, faOriginTeamId: origin?.id, faOriginTeamName: origin?.name,
        faOriginRoster: origin?.farm?.some(entry => entry.id === p.id) ? 'farm' : 'active' };
    })];
    setFaPool(prev => [...prev.filter(p => !marketEntries.some(entry => entry.id === p.id)), ...marketEntries]);
    declarations.news.forEach(n => addNews(n));
    renewResult.news.forEach(n => addNews(n));
    setDevelopmentSummary(mySummary);
    const {records:newRec,broken:brokenRecs}=updateRecords(currentSeasonHistory.records,teams);
    if(brokenRecs.length>0){const recLabel={singleSeasonHR:"シーズン本塁打",singleSeasonAVG:"シーズン打率",singleSeasonK:"シーズン奪三振"};const fmtVal=r=>r.type==="singleSeasonAVG"?`.${String(Math.round(r.value*1000)).padStart(3,"0")}`:r.type==="singleSeasonK"?`${r.value}奪三振`:`${r.value}本塁打`;const fmtOld=r=>r.type==="singleSeasonAVG"?`.${String(Math.round(r.oldValue*1000)).padStart(3,"0")}`:r.type==="singleSeasonK"?`${r.oldValue}奪三振`:`${r.oldValue}本塁打`;brokenRecs.forEach(r=>addNews({type:"record",headline:`🏅 ${r.playerName}（${r.teamName}）が${recLabel[r.type]}記録を更新！`,source:"NPB記録部",dateLabel:`${year}年`,body:`${r.playerName}（${r.teamName}）が${year}年シーズンに${fmtVal(r)}を記録し、従来の${recLabel[r.type]}記録（${fmtOld(r)}）を塗り替えた。`}));}
    const allAlumni=developedTeams.flatMap(t=>t.history||[]);
    const newInductees=checkHallOfFame(currentSeasonHistory.hallOfFame,allAlumni,year);
    const newHoF=[...currentSeasonHistory.hallOfFame,...newInductees];
    if(newInductees.length>0){newInductees.forEach(h=>{setMailbox(prev=>[...prev,{id:uid(),type:"hof",read:false,title:"🏛 殿堂入り: "+h.playerName,from:"球団殿堂委員会",dateLabel:year+"年",timestamp:Date.now(),body:h.playerName+"選手が"+year+"年度の球団殿堂入りを果たした。"+[h.careerHR>0?"通算"+h.careerHR+"本塁打":"",h.careerW>0?"通算"+h.careerW+"勝":"",h.careerPA>0?"通算"+h.careerPA+"打席":""].filter(Boolean).join(" / ")}]);});}
    const makeRanking=(lg)=>rankLeague(developedTeams, lg, standingsContext(currentSeasonHistory, getGameResultsMap(), year))
      .teams.map(t=>({id:t.id,name:t.name,emoji:t.emoji,wins:t.wins,losses:t.losses,draws:t.draws,rf:t.rf,ra:t.ra}));
    const standingsSnap={year,central:makeRanking("セ"),pacific:makeRanking("パ"),titles:awards.titles,playerAwards:{mvpCentral:awards.mvp?.central,mvpPacific:awards.mvp?.pacific,sawamura:awards.sawamura,rookie:awards.rookie}};
    setSeasonHistory(prev=>({...prev,awards:[...prev.awards,awards],records:newRec,hallOfFame:newHoF,standingsHistory:[...(prev.standingsHistory||[]),standingsSnap]}));
    const retiredMyNames=Object.entries(safeDecisions).filter(([,d])=>d==="accepted"||d==="retain_failed").map(([pid])=>myTeam?.players.find(x=>String(x.id)===pid)?.name).filter(Boolean);
    setNewSeasonInfo({retiredNames:retiredMyNames,year:year+1,draftCount:0,draftNames:[]});
    faPhaseCompletedYear.current = null;
    waiverCompletedYear.current = null;
    if (gs.setOffseasonPlan) {
      gs.setOffseasonPlan({ version: 1, year, myId, stage: 'planning', tab: 'roster', intents: [], demands,
        growth: mySummary && Object.fromEntries(Object.entries(mySummary).map(([key, rows]) => [key, Array.isArray(rows) ? rows.map(row => ({ ...row, p: row.p ? planningPlayer(row.p) : row.p })) : rows])),
        seasonInfo: { retiredNames: retiredMyNames, year: year + 1, draftCount: 0, draftNames: [] }, releasedIds: [] });
      setScreen('offseason_planning');
    } else setScreen("offseason_fa_phase");
    return true;
    } catch (error) {
      console.error('引退フェーズ処理に失敗しました:', error);
      const message = '引退選手の最終年成績を保存できませんでした。処理を中断しました。再試行してください。';
      setCareerPersistenceError(message);
      notify(message,'warn');
      return false;
    } finally {
      retireTransitionRef.current = false;
    }
  };

  const handleFaPhaseNext = () => {
    if (gs.screen !== 'offseason_fa_phase' || faPhaseCompletedYear.current === year) return false;
    faPhaseCompletedYear.current = year;
    setScreen('contract_renewal_phase');
    return true;
  };

  // 契約更改フェーズ: 合意確定（ダイアログUI側から呼ばれる）
  const handleContractRenewalSign = (pid, finalSalary, years, moraleDelta, trustDelta) => {
    const p = ownedPlayers(myTeam).find(x => x.id === pid);
    const actionKey = `sign:${JSON.stringify([year, typeof pid, pid])}`;
    if (!p || planningActionIds.current.has(actionKey) || !renewalEligible(p, year) || !validContractTerms(p, finalSalary, years)) return false;
    planningActionIds.current.add(actionKey);
    upd(myId, t => mapOwnedPlayers(t, x => x.id === pid ? applyAgreedContract(x, finalSalary, years, year, {
        morale: clamp((x.morale ?? 70) + (moraleDelta || 0), 20, 100),
        trust:  clamp((x.trust  ?? 50) + (trustDelta  || 0), 0, 100),
      }) : x));
    if (p) {
      addNews({ type: 'season', headline: `【契約更改】${p.name}（${myTeam?.name}）が${years}年契約`, source: '野球速報', dateLabel: `${year}年`, body: `${p.name}選手（${p.age}歳）が${myTeam?.name}と${years}年契約（${finalSalary}万円）を結んだ。` });
    }
  };

  // 契約更改フェーズ完了: CPU球団の更改シミュ + 人気計算 → development_phase へ
  const handleContractRenewalPhaseNext = (faDeclaredPlayerIds = [], options = {}) => {
    const safeDeclaredIds = Array.isArray(faDeclaredPlayerIds)
      ? [...new Set(faDeclaredPlayerIds.filter(id => (typeof id === "string" && id.trim().length > 0) || (typeof id === "number" && Number.isFinite(id))))]
      : [];

    const declaredIdSet = new Set(safeDeclaredIds);
    if (ownedPlayers(myTeam).some(p => declaredIdSet.has(p.id) && p.育成)) return false;
    const declaredPlayers = ownedPlayers(myTeam).filter(p => declaredIdSet.has(p.id) && !p.育成);

    if (declaredPlayers.length > 0) {
      upd(myId, t => ({
        ...t,
        players: t.players.filter(p => !declaredIdSet.has(p.id)),
        farm: (t.farm || []).filter(p => !declaredIdSet.has(p.id)),
      }));
      setFaPool(prev => [
        ...prev,
        ...declaredPlayers.map(p => ({ ...p, isFA: true, contractYearsLeft: 0, marketLastStats: p.stats, faEnteredYear: year, faOriginTeamId: myId, faOriginTeamName: myTeam?.name,
          faOriginRoster: myTeam?.farm?.some(x => x.id === p.id) ? 'farm' : 'active' })),
      ]);
      declaredPlayers.forEach(p => {
        addToHistory(myId, p, "FA宣言");
        addNews({
          type: 'season',
          headline: `【FA】${p.name}（${myTeam?.name}）が国内FA宣言`,
          source: '野球速報',
          dateLabel: `${year}年`,
          body: `${p.name}選手（${p.age}歳）が国内FA権を行使し、FA市場へ移行した。`,
        });
      });
    }

    const baseTeams = declaredIdSet.size > 0
      ? teams.map(t => (t.id === myId ? { ...t, players: t.players.filter(p => !declaredIdSet.has(p.id)), farm: (t.farm || []).filter(p => !declaredIdSet.has(p.id)) } : t))
      : teams;
    const postCpuTeams = baseTeams;
    // オフシーズン人気変動（handleRetirePhaseNextから移動）
    const makeLeagueRanking = (lg) => [...postCpuTeams.filter(t => t.league === lg)].sort((a, b) => {
      const pa = a.wins / Math.max(1, a.wins + a.losses);
      const pb = b.wins / Math.max(1, b.wins + b.losses);
      return pb - pa || (b.rf - b.ra) - (a.rf - a.ra);
    });
    const seRanks = makeLeagueRanking("セ");
    const paRanks = makeLeagueRanking("パ");
    const championId = getSeasonHistory().championships?.at(-1)?.championId ?? null;
    const csIds = new Set([...seRanks.slice(0, 3).map(t => t.id), ...paRanks.slice(0, 3).map(t => t.id)]);
    const teamsWithPop = postCpuTeams.map(t => {
      const leagueRanks = t.league === "セ" ? seRanks : paRanks;
      const rank = leagueRanks.findIndex(r => r.id === t.id) + 1;
      const isPennant = rank === 1;
      const delta = calcOffseasonPopDelta(rank, leagueRanks.length, t.id === championId, isPennant, csIds.has(t.id));
      return { ...t, popularity: driftPopularity(Math.min(100, Math.max(0, (t.popularity ?? 50) + delta))), winStreak: 0, loseStreak: 0 };
    });
    setTeams(teamsWithPop);
    setContractRenewalDemands(null);
    if (options.planning) return { teams: teamsWithPop, declaredPlayers };
    setScreen("development_phase");
  };

  // ウェーバーフェーズ処理（戦力外確定→CPU FA獲得→ドラフトへ）
  const handleWaiverPhaseNext = (markedIds, options = {}) => {
    if ((!options.planning && gs.screen !== 'waiver_phase') || waiverCompletedYear.current === year || gs.offseasonPlan?.stage === 'results') return false;
    const sourceTeams = options.teams || teams;
    const sourceTeam = sourceTeams.find(t => t.id === myId);
    const ids = Array.isArray(markedIds) ? [...new Set(markedIds)] : [];
    if (!Array.isArray(markedIds) || ids.some(id => !ownedPlayers(sourceTeam).some(p => p.id === id && waiverEligible(p) && p.contractSignedYear !== year))) {
      notify('放出対象が変更されています。選手を確認してください', 'warn'); return false;
    }
    waiverCompletedYear.current = year;
    const waiverReleased=[];
    ids.forEach(pid => { const p = ownedPlayers(sourceTeam).find(x => x.id === pid); waiverReleased.push({ ...p, isFA: true, isWaiverReleased: true });
      addNews({ type: 'season', headline: `【戦力外】${p.name}選手に戦力外通告`, source: '野球速報', dateLabel: `${year}年`, body: `${p.name}選手（${p.age}歳）が戦力外通告を受けた。` }); });
    const baseTeams = sourceTeams.map(t => t.id === myId ? releaseWaiverPlayers(t, ids, year, POP_RELEASE_PENALTY, POP_RELEASE_SALARY_THRESHOLD) : t);
    const releasedIds=new Set([...waiverReleased.map(p=>p.id), ...(options.planning ? gs.offseasonPlan?.releasedIds || [] : [])]);
    const combinedPool=[...(options.pool || faPool),...waiverReleased.map(p => ({ ...p, marketLastStats: p.stats, faEnteredYear: year, faOriginTeamId: myId, faOriginTeamName: myTeam?.name,
      faOriginRoster: sourceTeam?.farm?.some(x => x.id === p.id) ? 'farm' : 'active' }))];
    const faResult=processCpuFaBids(baseTeams,myId,combinedPool,baseTeams,year,'offseason');
    setTeams(faResult.updatedTeams);
    setFaPool(faResult.remainingFaPool);
    faResult.news.forEach(n=>addNews(n));

    // CPU球団の補強サマリーメール
    const byTeam=new Map();
    for(const c of (faResult.claimed||[])){
      if(!byTeam.has(c.teamId)) byTeam.set(c.teamId,{teamId:c.teamId,teamName:c.teamName,teamEmoji:c.teamEmoji,players:[]});
      byTeam.get(c.teamId).players.push(`${c.player.name}（${c.player.pos}）`);
    }
    if(byTeam.size>0){
      const signings=Array.from(byTeam.values());
      setMailbox(prev=>[...prev,{
        id:uid(),
        type:'cpu_fa_summary',
        read:false,
        title:`【オフシーズン補強情報】${signings.length}球団が補強を完了`,
        subject:`【オフシーズン補強情報】${signings.length}球団が補強を完了`,
        from:'スカウト部',
        dateLabel:`${year}年`,
        timestamp:Date.now(),
        body:'各球団がFA市場での補強を完了しました。球団名をクリックして詳細ロスターを確認できます。',
        signings,
      }]);
    }
    // 今回の戦力外通告分のみ結果表示（既存FAプールとは分離）
    const claimedNew=(faResult.claimed||[]).filter(c=>releasedIds.has(c.player.id));
    const unclaimedNew=faResult.remainingFaPool.filter(p=>releasedIds.has(p.id));
    setWaiverClaimResults({claimed:claimedNew,unclaimed:unclaimedNew,allClaimed:faResult.claimed || []});
    setFaYears({});
    const nextDraftPool = initDraftPool(faResult.updatedTeams.find(t => t.id === myId));
    setDraftPool(nextDraftPool);
    if (options.planning) gs.setOffseasonPlan(prev => ({ ...prev, stage: 'results',
      results: { claimed: claimedNew.map(c => ({ ...c, player: planningPlayer(c.player) })), unclaimed: unclaimedNew.map(planningPlayer),
        allClaimed: (faResult.claimed || []).map(c => ({ ...c, player: planningPlayer(c.player) })) }, draftPool: nextDraftPool }));
    setScreen("waiver_result");
    return true;
  };

  const handlePlanningRelease = (pid, reason = 'release') => {
    if (gs.screen !== 'offseason_planning' || gs.offseasonPlan?.stage !== 'open' || gs.offseasonPlan.year !== year || gs.offseasonPlan.myId !== myId) return false;
    const key = JSON.stringify([year, typeof pid, pid]);
    const p = ownedPlayers(myTeam).find(x => x.id === pid);
    if (planningActionIds.current.has(key) || !p || !renewalEligible(p, year)) return false;
    if (reason === 'fa' && (p.育成 || !getFaProgress(p).domestic?.eligible)) return false;
    planningActionIds.current.add(key);
    const declared = reason === 'fa';
    upd(myId, t => {
      if (!ownedPlayers(t).some(x => x.id === pid && renewalEligible(x, year))) return t;
      if (!declared) {
        const released = releaseWaiverPlayers(t, [pid], year, POP_RELEASE_PENALTY, POP_RELEASE_SALARY_THRESHOLD);
        return reason === 'salary_cut' ? { ...released, history: released.history.map(h => h.id === pid && h.exitYear === year ? { ...h, exitReason: '自由契約（減額制限超過）' } : h) } : released;
      }
      return { ...t, players: t.players.filter(x => x.id !== pid), farm: (t.farm || []).filter(x => x.id !== pid), ...pruneRosterReferences(t, new Set([pid])),
        history: [...(t.history || []), { ...p, exitYear: year, exitReason: 'FA宣言', tenure: p.serviceYears ?? 1 }] };
    });
    setFaPool(prev => prev.some(x => x.id === pid) ? prev : [...prev, { ...p, isFA: true, contractYearsLeft: 0,
      salary: declared ? gs.offseasonPlan.demands?.[pid]?.demandSalary
        ?? gs.offseasonPlan.session?.entries.find(e => e.player.id === pid)?.demand?.demandSalary
        ?? calcPlayerDemand(p, { year, team: myTeam, teams }).demandSalary : p.salary,
      ...(declared ? { faPreviousSalary: p.salary, faNegotiationReason: '契約更改で合意できなかったため' } : {}),
      isWaiverReleased: !declared && reason !== 'salary_cut', marketEntryReason: declared ? '国内FA宣言' : '自由契約', departureReason: reason,
      marketLastStats: p.stats, faEnteredYear: year, faOriginTeamId: myId, faOriginTeamName: myTeam?.name,
      faOriginRoster: myTeam?.farm?.some(x => x.id === pid) ? 'farm' : 'active' }]);
    gs.setOffseasonPlan(prev => ({ ...prev, releasedIds: declared ? prev.releasedIds : [...new Set([...(prev.releasedIds || []), pid])],
      intents: (prev.intents || []).filter(i => i.id !== pid),
      session: prev.session && { ...prev.session, entries: prev.session.entries.map(e => e.player.id === pid
        ? { ...e, status: declared ? 'fa' : reason === 'salary_cut' ? 'free' : 'released' } : e) } }));
    addNews({ type: 'season', headline: `${p.name}が${declared ? 'FA宣言' : '自由契約'}`, source: '球団発表', dateLabel: `${year}年`,
      body: declared ? `${p.name}が国内FA権を行使。市場で宣言残留も可能です。`
        : reason === 'salary_cut' ? `${p.name}が減額制限超過に同意せず自由契約となりました。FA権の行使ではありません。` : `${p.name}を戦力外として放出しました。` });
    return true;
  };

  const handlePlanningFinish = () => {
    const plan = gs.offseasonPlan;
    if (gs.screen !== 'offseason_planning' || plan?.year !== year || plan.myId !== gs.myId || plan.stage !== 'open' || waiverCompletedYear.current === year) return false;
    const overview = planningSummary(myTeam, plan, year);
    if (overview.pending.some(p => !overview.releaseCandidates.some(x => x.id === p.id))) {
      notify('未合意・対応待ちの選手を確認してください', 'warn'); return false;
    }
    // Use the returned teams directly: do not read a stale React snapshot after
    // the renewal completion updates state. CPU market processing runs once.
    const completed = handleContractRenewalPhaseNext([], { planning: true });
    return handleWaiverPhaseNext(overview.releaseCandidates.map(p => p.id), { planning: true, teams: completed.teams, pool: faPool });
  };

  return {
    saveDraftView, resetTransientOffseason,
    developmentSummary, setDevelopmentSummary,
    newSeasonInfo, setNewSeasonInfo,
    springTrainingData,
    draftPool, setDraftPool,
    draftResult, setDraftResult,
    draftAllocation, setDraftAllocation,
    waiverClaimResults,
    contractRenewalDemands,
    careerPersistenceError,
    handleNextYear,
    handleDraftComplete,
    handleSpringTrainingComplete,
    handleContractOffer,
    handleContractRenewalSign,
    handleFaPhaseNext,
    handleContractRenewalPhaseNext,
    handleTrade,
    acceptCpuOffer,
    declineCpuOffer,
    handleMailRead,
    handleMailAction,
    handleRetain,
    handleAcceptRetire,
    handleStartRetireGame,
    handleSkipRetireGame,
    handleRetirePhaseNext,
    handleWaiverPhaseNext,
    handlePlanningRelease,
    handlePlanningFinish,
  };
}
