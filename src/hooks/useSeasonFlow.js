import { useState, useRef, useEffect } from "react";
import SeasonBatchWorker from "../workers/seasonBatchWorker?worker";
import { uid, rng, rngf, gameDayToDate } from '../utils';
import { checkForInjuries, tickInjuries, calcRetireWill, tickPositionTraining } from '../engine/player';
import { quickSimGame, runFarmSeason } from '../engine/simulation';
import { applyGameStatsFromLog, applyPostGameCondition, computeBoxScore } from '../engine/postGame';
import { calcRevenue } from '../engine/finance';
import { applyPopularityDelta } from '../engine/fanSentiment';
import { generateCpuOffer, generateCpuCpuTrade, classifyTeam, evaluateFrontOfficePlan } from '../engine/trade';
import { initPlayoff } from '../engine/playoff';
import { selectAllStars, runAllStarGame } from '../engine/allstar';
import { getMyMatchup, getCpuMatchups } from '../engine/scheduleGen';
import { enqueueSaveGame } from '../engine/saveload';
import { processCpuFaBids } from '../engine/contract';
import { cancelDeferredPostGameWork, scheduleDeferredPostGameWork } from '../engine/postGameProcessing';
import { SEASON_GAMES, BATCH, NEWS_TEMPLATES_WIN, NEWS_TEMPLATES_LOSE, INTERVIEW_QUESTIONS_WIN, INTERVIEW_QUESTIONS_LOSE, INTERVIEW_OPTIONS_WIN, INTERVIEW_OPTIONS_LOSE, INJURY_AUTO_DEMOTE_DAYS, REGISTRATION_COOLDOWN_DAYS, TRADE_DEADLINE_MONTH, TRADE_DEADLINE_PROB_EARLY, TRADE_DEADLINE_PROB_PEAK, TRADE_DEADLINE_CPU_CPU_PROB, INJURY_HISTORY_MAX, MAX_ROSTER, CPU_AUTO_MANAGE_INTERVAL, ROSTER_SWAP_SCORE_THRESHOLD, ROSTER_DEVREC_BONUS, ROSTER_DEVREC_POTENTIAL_MIN, ROSTER_DEVREC_DAYS_MAX, FIELDING_POSITIONS, OPTIMAL_PITCHER_COUNT, MIN_ACTIVE_CATCHERS } from '../constants';
import { saberBatter, saberPitcher } from '../engine/sabermetrics';

const MAX_FOREIGN_ACTIVE = 4;

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
