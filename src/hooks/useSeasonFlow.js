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
import { SEASON_GAMES, BATCH, NEWS_TEMPLATES_WIN, NEWS_TEMPLATES_LOSE, INTERVIEW_QUESTIONS_WIN, INTERVIEW_QUESTIONS_LOSE, INTERVIEW_OPTIONS_WIN, INTERVIEW_OPTIONS_LOSE, INJURY_AUTO_DEMOTE_DAYS, REGISTRATION_COOLDOWN_DAYS, TRADE_DEADLINE_MONTH, TRADE_DEADLINE_PROB_EARLY, TRADE_DEADLINE_PROB_PEAK, TRADE_DEADLINE_CPU_CPU_PROB, INJURY_HISTORY_MAX, MAX_ROSTER, CPU_AUTO_MANAGE_INTERVAL, ROSTER_SWAP_SCORE_THRESHOLD, ROSTER_DEVREC_BONUS, ROSTER_DEVREC_POTENTIAL_MIN, ROSTER_DEVREC_DAYS_MAX, FIELDING_POSITIONS, OPTIMAL_PITCHER_COUNT, MIN_ACTIVE_CATCHERS } from '../constants';
import { saberBatter, saberPitcher } from '../engine/sabermetrics';

const MAX_FOREIGN_ACTIVE = 4;
let seasonPlayerModulePromise = null;
let seasonScheduleModulePromise = null;
let seasonSaveModulePromise = null;
let seasonAllStarModulePromise = null;

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

function autoInjuryDemote(team) {
  const farm=team.farm??[];
  const demoted=[];const kept=[];
  for(const p of team.players){
    if((p.injuryDaysLeft??0)>INJURY_AUTO_DEMOTE_DAYS){
      demoted.push({...p,registrationCooldownDays:REGISTRATION_COOLDOWN_DAYS});
    }else{kept.push(p);}
  }
  if(demoted.length===0)return team;
  const demotedIds=new Set(demoted.map(p=>p.id));
  return{...team,players:kept,lineup:(team.lineup??[]).filter(id=>!demotedIds.has(id)),lineupNoDh:(team.lineupNoDh??[]).filter(id=>!demotedIds.has(id)),lineupDh:(team.lineupDh??[]).filter(id=>!demotedIds.has(id)),rotation:(team.rotation??[]).filter(id=>!demotedIds.has(id)),farm:[...farm,...demoted]};
}

function _cpuBatterScore(p) {
  const sb = saberBatter(p.stats ?? {});
  return (sb.OPS || 0) * 1000 + (p.batting?.contact ?? 50) * 1.6 + (p.batting?.eye ?? 50) * 1.1 + (p.batting?.power ?? 50) * 1.2 + (p.batting?.speed ?? 50) * 0.7;
}
function _cpuStarterScore(p) {
  const sp = saberPitcher(p.stats ?? {});
  const eraBonus = sp.ERA > 0 ? Math.max(0, (4 - sp.ERA) * 15) : 0;
  return (p.pitching?.velocity ?? 50) * 1.2 + (p.pitching?.control ?? 50) * 1.5 + (p.pitching?.breaking ?? 50) * 1.0 + (p.pitching?.stamina ?? 50) * 2.0 + eraBonus;
}
function _cpuRelieverScore(p) {
  const sp = saberPitcher(p.stats ?? {});
  const eraBonus = sp.ERA > 0 ? Math.max(0, (4 - sp.ERA) * 15) : 0;
  return (p.pitching?.velocity ?? 50) * 2.0 + (p.pitching?.control ?? 50) * 1.5 + (p.pitching?.breaking ?? 50) * 1.2 + (p.pitching?.stamina ?? 50) * 0.5 + eraBonus;
}
function _cpuRosterRecScore(p) {
  if (p.isPitcher) {
    const sp = saberPitcher(p.stats ?? {});
    const ability = (p.pitching?.velocity ?? 50) * 1.2 + (p.pitching?.control ?? 50) * 1.5 + (p.pitching?.breaking ?? 50) * 1.0 + (p.pitching?.stamina ?? 50) * 0.8;
    if (!sp.ERA && !sp.WHIP) return ability;
    return ability * 0.55 + Math.max(0, (5.0 - sp.ERA) * 35) + Math.max(0, (1.5 - sp.WHIP) * 50);
  }
  const sb = saberBatter(p.stats ?? {});
  return (sb.OPS || 0) * 1000 + (p.batting?.contact ?? 50) * 1.6 + (p.batting?.eye ?? 50) * 1.1 + (p.batting?.power ?? 50) * 1.2 + (p.batting?.speed ?? 50) * 0.7;
}

function cpuAutoManageTeam(team) {
  const farm = team.farm ?? [];
  const foreignInActive = team.players.filter((p) => p.isForeign).length;
  const canPromote = (p) =>
    !p.isIkusei &&
    (p.injuryDaysLeft ?? 0) === 0 &&
    (p.registrationCooldownDays ?? 0) === 0 &&
    !(p.isForeign && foreignInActive >= MAX_FOREIGN_ACTIVE);

  let players = [...team.players];
  let newFarm = [...farm];

  const effScore = (p, isFarm) => {
    const base = _cpuRosterRecScore(p);
    const devBonus =
      isFarm &&
      (p.potential ?? 0) >= ROSTER_DEVREC_POTENTIAL_MIN &&
      (p.daysOnActiveRoster ?? 0) < ROSTER_DEVREC_DAYS_MAX
        ? ROSTER_DEVREC_BONUS
        : 0;
    return base + devBonus;
  };

  const TARGET_BATTERS = MAX_ROSTER - OPTIMAL_PITCHER_COUNT;
  const openSlots = MAX_ROSTER - players.length;

  if (openSlots < 0) {
    const excess = -openSlots;
    const pitcherOver = Math.max(0, players.filter((p) => p.isPitcher).length - OPTIMAL_PITCHER_COUNT);
    const batterOver = Math.max(0, players.filter((p) => !p.isPitcher).length - TARGET_BATTERS);
    const demoted = new Set();

    const activeCatcherCount = () =>
      players.filter((p) => !p.isPitcher && p.pos === '捕手' && !demoted.has(p.id)).length;

    const applyDemote = (candidates, limit) => {
      [...candidates]
        .sort((a, b) => effScore(a, false) - effScore(b, false))
        .slice(0, limit)
        .forEach((p) => {
          if (!p.isPitcher && p.pos === '捕手' && activeCatcherCount() <= MIN_ACTIVE_CATCHERS) return;
          players = players.filter((q) => q.id !== p.id);
          newFarm = [...newFarm, { ...p, registrationCooldownDays: REGISTRATION_COOLDOWN_DAYS }];
          demoted.add(p.id);
        });
    };

    applyDemote(players.filter((p) => p.isPitcher), Math.min(pitcherOver, excess));
    applyDemote(players.filter((p) => !p.isPitcher), Math.min(batterOver, excess - demoted.size));
    if (demoted.size < excess) {
      applyDemote(players.filter((p) => !demoted.has(p.id)), excess - demoted.size);
    }
  } else {
    const usedFarmIds = new Set();
    const usedActiveIds = new Set();
    const eligibleFarm = newFarm.filter(canPromote);
    const eligP = [...eligibleFarm]
      .filter((p) => p.isPitcher)
      .sort((a, b) => effScore(b, true) - effScore(a, true));
    const eligB = [...eligibleFarm]
      .filter((p) => !p.isPitcher)
      .sort((a, b) => effScore(b, true) - effScore(a, true));
    let slotsLeft = Math.min(openSlots, 3);

    const pitcherNeed = Math.max(0, OPTIMAL_PITCHER_COUNT - players.filter((p) => p.isPitcher).length);
    eligP.slice(0, Math.min(pitcherNeed, slotsLeft)).forEach((p) => {
      players.push(p);
      usedFarmIds.add(p.id);
      slotsLeft--;
    });

    const batterNeed = Math.max(0, TARGET_BATTERS - players.filter((p) => !p.isPitcher).length);
    eligB.slice(0, Math.min(batterNeed, slotsLeft)).forEach((p) => {
      players.push(p);
      usedFarmIds.add(p.id);
      slotsLeft--;
    });

    if (slotsLeft > 0) {
      eligibleFarm
        .filter((p) => !usedFarmIds.has(p.id))
        .sort((a, b) => effScore(b, true) - effScore(a, true))
        .slice(0, slotsLeft)
        .forEach((p) => {
          players.push(p);
          usedFarmIds.add(p.id);
        });
    }

    let curP = players.filter((p) => p.isPitcher).length;
    let curB = players.filter((p) => !p.isPitcher).length;

    while (curP < OPTIMAL_PITCHER_COUNT && curB > TARGET_BATTERS) {
      const fp = newFarm
        .filter((p) => p.isPitcher && canPromote(p) && !usedFarmIds.has(p.id))
        .sort((a, b) => effScore(b, true) - effScore(a, true))[0];
      const ap = players
        .filter((p) => !p.isPitcher && !usedActiveIds.has(p.id))
        .sort((a, b) => effScore(a, false) - effScore(b, false))[0];
      if (!fp || !ap) break;
      players = [...players.filter((p) => p.id !== ap.id), fp];
      newFarm = [...newFarm.filter((p) => p.id !== fp.id), { ...ap, registrationCooldownDays: REGISTRATION_COOLDOWN_DAYS }];
      usedFarmIds.add(fp.id);
      usedActiveIds.add(ap.id);
      curP = players.filter((p) => p.isPitcher).length;
      curB = players.filter((p) => !p.isPitcher).length;
    }

    while (curB < TARGET_BATTERS && curP > OPTIMAL_PITCHER_COUNT) {
      const fp = newFarm
        .filter((p) => !p.isPitcher && canPromote(p) && !usedFarmIds.has(p.id))
        .sort((a, b) => effScore(b, true) - effScore(a, true))[0];
      const ap = players
        .filter((p) => p.isPitcher && !usedActiveIds.has(p.id))
        .sort((a, b) => effScore(a, false) - effScore(b, false))[0];
      if (!fp || !ap) break;
      players = [...players.filter((p) => p.id !== ap.id), fp];
      newFarm = [...newFarm.filter((p) => p.id !== fp.id), { ...ap, registrationCooldownDays: REGISTRATION_COOLDOWN_DAYS }];
      usedFarmIds.add(fp.id);
      usedActiveIds.add(ap.id);
      curP = players.filter((p) => p.isPitcher).length;
      curB = players.filter((p) => !p.isPitcher).length;
    }

    const remainFarm = newFarm.filter((fp) => canPromote(fp) && !usedFarmIds.has(fp.id));
    if (remainFarm.length > 0) {
      [...players]
        .sort((a, b) => effScore(a, false) - effScore(b, false))
        .forEach((ap) => {
          if (usedActiveIds.has(ap.id)) return;
          const best = remainFarm.find((fp) => !usedFarmIds.has(fp.id) && fp.isPitcher === ap.isPitcher);
          if (!best) return;
          if (effScore(best, true) - effScore(ap, false) >= ROSTER_SWAP_SCORE_THRESHOLD) {
            players = players.filter((p) => p.id !== ap.id);
            players.push(best);
            newFarm = newFarm.filter((p) => p.id !== best.id);
            newFarm.push({ ...ap, registrationCooldownDays: REGISTRATION_COOLDOWN_DAYS });
            usedFarmIds.add(best.id);
            usedActiveIds.add(ap.id);
          }
        });
    }

    [...usedFarmIds].forEach((id) => {
      newFarm = newFarm.filter((fp) => fp.id !== id);
    });
  }

  const TARGET_ROT = 6;
  const farmSP = newFarm
    .filter((p) => p.isPitcher && p.subtype === '先発' && canPromote(p))
    .sort((a, b) => effScore(b, true) - effScore(a, true));

  for (const sp of farmSP) {
    const curSP = players.filter(
      (p) => p.isPitcher && p.subtype === '先発' && !p.isIkusei && (p.injuryDaysLeft ?? 0) === 0,
    ).length;
    if (curSP >= TARGET_ROT) break;
    if (players.length < MAX_ROSTER) {
      players = [...players, sp];
      newFarm = newFarm.filter((p) => p.id !== sp.id);
    } else {
      const weakRP = players
        .filter((p) => p.isPitcher && p.subtype !== '先発' && !p.isIkusei)
        .sort((a, b) => effScore(a, false) - effScore(b, false))[0];
      if (!weakRP) break;
      players = [...players.filter((p) => p.id !== weakRP.id), sp];
      newFarm = [...newFarm.filter((p) => p.id !== sp.id), { ...weakRP, registrationCooldownDays: REGISTRATION_COOLDOWN_DAYS }];
    }
  }

  const activeCatchers = () => players.filter((p) => !p.isPitcher && p.pos === '捕手' && (p.injuryDaysLeft ?? 0) === 0);
  const farmCatchers = () =>
    newFarm
      .filter((p) => !p.isPitcher && p.pos === '捕手' && canPromote(p))
      .sort((a, b) => effScore(b, true) - effScore(a, true));

  while (activeCatchers().length < MIN_ACTIVE_CATCHERS) {
    const fc = farmCatchers()[0];
    if (!fc) break;
    if (players.length < MAX_ROSTER) {
      players = [...players, fc];
      newFarm = newFarm.filter((p) => p.id !== fc.id);
    } else {
      const weakBatter = players
        .filter((p) => !p.isPitcher && p.pos !== '捕手')
        .sort((a, b) => effScore(a, false) - effScore(b, false))[0];
      if (!weakBatter) break;
      players = [...players.filter((p) => p.id !== weakBatter.id), fc];
      newFarm = [...newFarm.filter((p) => p.id !== fc.id), { ...weakBatter, registrationCooldownDays: REGISTRATION_COOLDOWN_DAYS }];
    }
  }

  const batters = players.filter((p) => !p.isPitcher && !p.isIkusei && (p.injuryDaysLeft ?? 0) === 0);
  const useDh = !!team.dhEnabled;
  const required = [...FIELDING_POSITIONS, ...(useDh ? ['DH'] : [])];
  const profAt = (p, pos) => (pos === 'DH' ? 50 : p.pos === pos ? 100 : (p.positions?.[pos] ?? 0));
  const sortedB = [...batters].sort((a, b) => _cpuBatterScore(b) - _cpuBatterScore(a));
  const posEligible = Object.fromEntries(required.map((pos) => [pos, sortedB.filter((p) => profAt(p, pos) > 0)]));
  const posOrder = [...required].sort((a, b) => posEligible[a].length - posEligible[b].length);
  const assignment = new Map();
  const playerUsed = new Set();

  for (const pos of posOrder) {
    const best = posEligible[pos].find((p) => !playerUsed.has(p.id));
    if (best) {
      assignment.set(pos, best);
      playerUsed.add(best.id);
    }
  }

  for (const pos of posOrder) {
    if (assignment.has(pos)) continue;
    const fallback = sortedB.find((p) => !playerUsed.has(p.id));
    if (fallback) {
      assignment.set(pos, fallback);
      playerUsed.add(fallback.id);
    }
  }

  const newLineup = [...assignment.entries()]
    .sort((a, b) => _cpuBatterScore(b[1]) - _cpuBatterScore(a[1]))
    .map(([, player]) => player.id);

  const pitchers = players.filter((p) => p.isPitcher && !p.isIkusei && (p.injuryDaysLeft ?? 0) === 0);
  const starters = pitchers.filter((p) => p.subtype === '先発').sort((a, b) => _cpuStarterScore(b) - _cpuStarterScore(a));
  const relievers = pitchers.filter((p) => p.subtype !== '先発').sort((a, b) => _cpuRelieverScore(b) - _cpuRelieverScore(a));
  const MIN_ROT = 5;
  const newRotation = starters.slice(0, 6).map((p) => p.id);

  if (newRotation.length < MIN_ROT) {
    const need = MIN_ROT - newRotation.length;
    const fallbackRelievers = [...relievers]
      .sort((a, b) => (b.pitching?.stamina ?? 50) - (a.pitching?.stamina ?? 50))
      .slice(0, need)
      .map((p) => p.id);
    newRotation.push(...fallbackRelievers);
  }

  const rotSet = new Set(newRotation);
  const remaining = pitchers.filter((p) => !rotSet.has(p.id)).sort((a, b) => _cpuRelieverScore(b) - _cpuRelieverScore(a));
  const newPattern = {
    closerId: remaining[0]?.id ?? null,
    setupId: remaining[1]?.id ?? null,
    seventhId: remaining[2]?.id ?? null,
    middleOrder: remaining.slice(3).map((p) => p.id),
  };

  return {
    ...team,
    players,
    farm: newFarm,
    lineup: newLineup,
    lineupDh: newLineup,
    lineupNoDh: newLineup,
    rotation: newRotation,
    pitchingPattern: { ...(team.pitchingPattern ?? {}), ...newPattern },
  };
}

export function useSeasonFlow(gs) {
  const {
    teams, setTeams, myId, myTeam,
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
    if(!myTeam||!myId) return;
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
    const result = generateCpuCpuTrade(teamsArr);
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

  const POSITION_FILL_ORDER = ['C','SS','2B','3B','1B','LF','CF','RF','DH'];

  const buildSimLineup = (team, useDh) => {
    const limit = useDh ? 9 : 8;
    const nonPitchers = (team.players || []).filter(p => !p.isPitcher && !p.isIkusei);
    const nonPitcherIds = new Set(nonPitchers.map(p => p.id));
    const source = useDh ? (team.lineupDh || team.lineup || []) : (team.lineupNoDh || team.lineup || []);

    let lineup = source.filter(id => nonPitcherIds.has(id));

    let foreignCount = 0;
    lineup = lineup.filter(id => {
      const p = nonPitchers.find(x => x.id === id);
      if (p?.isForeign) { if (foreignCount < MAX_FOREIGN_ACTIVE) { foreignCount++; return true; } return false; }
      return true;
    });

    if (lineup.length < limit) {
      const inLineup = new Set(lineup);
      const available = nonPitchers
        .filter(p => !inLineup.has(p.id))
        .sort((a, b) => {
          const ai = POSITION_FILL_ORDER.indexOf(a.pos);
          const bi = POSITION_FILL_ORDER.indexOf(b.pos);
          return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
        });
      for (const p of available) {
        if (lineup.length >= limit) break;
        if (p.isForeign && foreignCount >= MAX_FOREIGN_ACTIVE) continue;
        if (p.isForeign) foreignCount++;
        lineup.push(p.id);
      }
    }

    const fixedLineup = lineup.slice(0, limit);

    if (!useDh) {
      const starterId = team.rotation?.[team.rotIdx % Math.max(team.rotation?.length || 0, 1)];
      const starter = (team.players || []).find(p => p.id === starterId && p.isPitcher && !p.isIkusei)
        || (team.players || []).find(p => p.isPitcher && !p.isIkusei)
        || null;
      if (starter) return [...fixedLineup, starter.id];
    }

    return fixedLineup;
  };

  const applyDhToTeam = (team, useDh) => ({ ...team, lineup: buildSimLineup(team, useDh) });

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
    if (!myTeam || !oppId) return;

    const startedAt = Date.now();
    const taskId = uid();
    const snapshot = {
      teams,
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

    setCurrentOpp(opp);
    setCurrentGameTeams({
      my: applyDhToTeam(myTeam, useDh),
      opp: applyDhToTeam(opp, useDh),
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
    const [playerMod, scheduleMod, allStarMod] = await Promise.all([
      loadSeasonPlayerModule(),
      loadSeasonScheduleModule(),
      loadSeasonAllStarModule(),
    ]);
    const won=r.score.my>r.score.opp;
    const drew=r.score.my===r.score.opp;
    upd(myId,t=>{
      let updated={...t,
        wins:t.wins+(won?1:0),losses:t.losses+(!won&&!drew?1:0),draws:t.draws+(drew?1:0),
        rf:t.rf+r.score.my,ra:t.ra+r.score.opp,
        rotIdx:t.rotIdx+1,
      };
      updated.players=applyGameStatsFromLog(updated.players, r.log||[], true, won, gameDay);
      updated.players=applyPostGameCondition(updated.players, r.log||[], true, gameDay);
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
      updated=autoInjuryDemote(updated);
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
      updated.players=applyPostGameCondition(updated.players,r.log||[],false,gameDay);
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
      return newTeams;
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
    setGameResult({score:r.score,won,log:r.log||[],inningSummary:r.inningSummary||[],oppTeam:currentOpp,gameNo:gameDay});
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
    gs.pushGameResult(gameDay,{won,drew:_adrew,oppName:currentOpp?.name||"",myScore:r.score.my,oppScore:r.score.opp,log:r.log||[],inningSummary:r.inningSummary||[],oppTeam:currentOpp});
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
          gs.setSaveDirty(false);
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
    if(!myTeam||!currentOpp) return;
    const [playerMod, scheduleMod, allStarMod] = await Promise.all([
      loadSeasonPlayerModule(),
      loadSeasonScheduleModule(),
      loadSeasonAllStarModule(),
    ]);
    const gsResult = buildSafeGameResult(rawGameResult, {
      oppTeam: currentOpp,
      gameNo: gameDay,
      source: "tactical",
    });
    const won=gsResult.won;
    const drew=gsResult.drew;
    upd(myId,t=>{
      try {
        let updated={...t,
        wins:t.wins+(won?1:0),losses:t.losses+(!won&&!drew?1:0),draws:t.draws+(drew?1:0),
        rf:t.rf+gsResult.score.my,ra:t.ra+gsResult.score.opp,
        rotIdx:t.rotIdx+1,
        };
        updated.players=applyGameStatsFromLog(updated.players, gsResult.log, true, won, gameDay);
        updated.players=applyPostGameCondition(updated.players, gsResult.log, true, gameDay);
        updated.players=playerMod.tickInjuries(updated.players);
        updated.players=playerMod.tickPositionTraining(updated.players);
        updated.players=updated.players.map(p=>({...p,daysOnActiveRoster:(p.daysOnActiveRoster??0)+1}));
        updated.players=applyDefenseCoachRecovery(updated.players,t.coaches);
        const newInj=playerMod.checkForInjuries(updated.players, year);
        updated.players=applyInjuriesToPlayers(updated.players, newInj, year);
        updated.farm=tickCooldowns(updated.farm??[]);
        updated=autoInjuryDemote(updated);
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
        updated.players=applyPostGameCondition(updated.players,gsResult.log,false,gameDay);
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
        return newTeams;
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
        recordGame(myId,_tOppId,gsResult,myTeam.players,currentOpp.players,myTeam.name,currentOpp.name);
        return next;
      } catch (error) {
        console.error("[TacticalPostGame] failed to build all-team results", error);
        return prev;
      }
    });
    setGameResult(gsResult);
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
    gs.pushGameResult(gameDay,{won,drew,oppName:currentOpp?.name||"",myScore:gsResult.score.my,oppScore:gsResult.score.opp,log:gsResult.log,inningSummary:gsResult.inningSummary,oppTeam:currentOpp});
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


