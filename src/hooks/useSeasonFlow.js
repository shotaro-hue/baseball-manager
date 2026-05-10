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
import { scheduleDeferredPostGameWork } from '../engine/postGameProcessing';
import { processCpuFaBids } from '../engine/contract';
import { SEASON_GAMES, BATCH, NEWS_TEMPLATES_WIN, NEWS_TEMPLATES_LOSE, INTERVIEW_QUESTIONS_WIN, INTERVIEW_QUESTIONS_LOSE, INTERVIEW_OPTIONS_WIN, INTERVIEW_OPTIONS_LOSE, INJURY_AUTO_DEMOTE_DAYS, REGISTRATION_COOLDOWN_DAYS, TRADE_DEADLINE_MONTH, TRADE_DEADLINE_PROB_EARLY, TRADE_DEADLINE_PROB_PEAK, TRADE_DEADLINE_CPU_CPU_PROB, INJURY_HISTORY_MAX, MAX_ROSTER, CPU_AUTO_MANAGE_INTERVAL, ROSTER_SWAP_SCORE_THRESHOLD, ROSTER_DEVREC_BONUS, ROSTER_DEVREC_POTENTIAL_MIN, ROSTER_DEVREC_DAYS_MAX, FIELDING_POSITIONS, OPTIMAL_PITCHER_COUNT, MIN_ACTIVE_CATCHERS } from '../constants';
import { saberBatter, saberPitcher } from '../engine/sabermetrics';

const MAX_FOREIGN_ACTIVE = 4;

// 陞ｳ莠･・咏ｹｧ・ｳ郢晢ｽｼ郢昶・繝ｻ郢晢ｽｼ郢晉ｿｫ縺・ 隲､・ｪ隰悟､ｧ螻楢包ｽｩ鬨ｾ貅ｷ・ｺ・ｦ UP
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

// 隲､・ｪ隰檎ｬｬ蠕玖ｬｨ・ｰ > INJURY_AUTO_DEMOTE_DAYS 邵ｺ・ｮ闕ｳﾂ髴・涵竏郁ｬ・ｹ晢ｽ帝明・ｪ陷咲ｩゑｽｺ迹夲ｽｻ蝓ｼ蜑・ｭｬ・ｼ邵ｺ蜉ｱﾂ竏壹￠郢晢ｽｼ郢晢ｽｫ郢敖郢ｧ・ｦ郢晢ｽｳ郢ｧ蛛ｵ縺晉ｹ昴・繝ｨ
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

// 隨渉隨渉隨渉 CPU 郢昶・繝ｻ郢晢｣ｰ髢ｾ・ｪ陷肴・・ｷ・ｨ隰後・隨渉隨渉隨渉隨渉隨渉隨渉隨渉隨渉隨渉隨渉隨渉隨渉隨渉隨渉隨渉隨渉隨渉隨渉隨渉隨渉隨渉隨渉隨渉隨渉隨渉隨渉隨渉隨渉隨渉隨渉隨渉隨渉隨渉隨渉隨渉隨渉隨渉隨渉隨渉隨渉隨渉隨渉隨渉隨渉隨渉隨渉隨渉隨渉隨渉隨渉隨渉隨渉隨渉隨渉隨渉
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

// CPU 郢昶・繝ｻ郢晢｣ｰ邵ｺ・ｮ郢晢ｽｭ郢ｧ・ｹ郢ｧ・ｿ郢晢ｽｼ陷茨ｽｨ闖ｴ阮呻ｽ帝明・ｪ陷榊｢捺咎ｩ包ｽｩ陋ｹ謔ｶ・邵ｺ・ｦ隴厄ｽｴ隴・ｽｰ邵ｺ蜉ｱ笳・ｹ昶・繝ｻ郢晢｣ｰ郢ｧ・ｪ郢晄じ縺夂ｹｧ・ｧ郢ｧ・ｯ郢晏現・帝恆譁絶・
function cpuAutoManageTeam(team) {
  const farm = team.farm ?? [];
  const foreignInActive = team.players.filter(p => p.isForeign).length;
  const canPromote = (p) => !p.isIkusei && (p.injuryDaysLeft ?? 0) === 0 && (p.registrationCooldownDays ?? 0) === 0 && !(p.isForeign && foreignInActive >= MAX_FOREIGN_ACTIVE);
  let players = [...team.players];
  let newFarm = [...farm];

  const effScore = (p, isFarm) => {
    const base = _cpuRosterRecScore(p);
    const devBonus = isFarm && (p.potential ?? 0) >= ROSTER_DEVREC_POTENTIAL_MIN && (p.daysOnActiveRoster ?? 0) < ROSTER_DEVREC_DAYS_MAX ? ROSTER_DEVREC_BONUS : 0;
    return base + devBonus;
  };

  // 隨渉隨渉 1. 郢晢ｽｭ郢ｧ・ｹ郢ｧ・ｿ郢晢ｽｼ陷茨ｽ･郢ｧ譴ｧ蟠帷ｸｺ闌ｨ・ｼ逎ｯ蜑・ｭｬ・ｼ郢晢ｽｻ隴上・・ｰ・ｼ郢晢ｽｻ郢ｧ・ｹ郢晢ｽｯ郢昴・繝ｻ繝ｻ繝ｻ隨渉隨渉
  const TARGET_BATTERS = MAX_ROSTER - OPTIMAL_PITCHER_COUNT;
  const openSlots = MAX_ROSTER - players.length;
  if (openSlots < 0) {
    // 髮懊・邃・崕繝ｻ 髮懊・邃・◇・ｮ陋ｻ・･繝ｻ蝓溷・隰・・13 or 鬩･蜿也・>15繝ｻ蟲ｨﾂｰ郢ｧ迚吮煤陷育｣ｯ蜑・ｭｬ・ｼ邵ｲ竏ｵ・ｮ荵晢ｽ顔ｸｺ・ｯ陷茨ｽｨ闖ｴ謐ｺ諤呵叉蛟ｶ・ｽ髦ｪﾂｰ郢ｧ繝ｻ    const excess = -openSlots;
    const pitcherOver = Math.max(0, players.filter(p => p.isPitcher).length - OPTIMAL_PITCHER_COUNT);
    const batterOver = Math.max(0, players.filter(p => !p.isPitcher).length - TARGET_BATTERS);
    const demoted = new Set();
    const applyDemote = (candidates, limit) => {
      // 隰仙｢鍋・邵ｺ繝ｻMIN_ACTIVE_CATCHERS 陷ｷ蝣ｺ・ｻ・･闕ｳ荵昶・郢ｧ陋ｾ蜑・ｭｬ・ｼ陝・ｽｾ髮趣ｽ｡邵ｺ荵晢ｽ蛾ｫｯ・､陞溘・      const activeCatcherCount = () => players.filter(p => !p.isPitcher && p.pos === '隰仙｢鍋・' && !demoted.has(p.id)).length;
      [...candidates].sort((a, b) => effScore(a, false) - effScore(b, false)).slice(0, limit).forEach(p => {
        if (!p.isPitcher && p.pos === '隰仙｢鍋・' && activeCatcherCount() <= MIN_ACTIVE_CATCHERS) return;
        players = players.filter(q => q.id !== p.id);
        newFarm = [...newFarm, { ...p, registrationCooldownDays: REGISTRATION_COOLDOWN_DAYS }];
        demoted.add(p.id);
      });
    };
    applyDemote(players.filter(p => p.isPitcher), Math.min(pitcherOver, excess));
    applyDemote(players.filter(p => !p.isPitcher), Math.min(batterOver, excess - demoted.size));
    if (demoted.size < excess) applyDemote(players.filter(p => !demoted.has(p.id)), excess - demoted.size);
  } else {
    const usedFarmIds = new Set();
    const usedActiveIds = new Set();
    const eligibleFarm = newFarm.filter(canPromote);
    const eligP = [...eligibleFarm].filter(p => p.isPitcher).sort((a, b) => effScore(b, true) - effScore(a, true));
    const eligB = [...eligibleFarm].filter(p => !p.isPitcher).sort((a, b) => effScore(b, true) - effScore(a, true));
    let slotsLeft = Math.min(openSlots, 3); // CPU 邵ｺ・ｯ1陜玲ｨ頑呵棔・ｧ3闔・ｺ邵ｺ・ｾ邵ｺ・ｧ陞溽判蟲ｩ

    const pitcherNeed = Math.max(0, OPTIMAL_PITCHER_COUNT - players.filter(p => p.isPitcher).length);
    eligP.slice(0, Math.min(pitcherNeed, slotsLeft)).forEach(p => { players.push(p); usedFarmIds.add(p.id); slotsLeft--; });

    const batterNeed = Math.max(0, TARGET_BATTERS - players.filter(p => !p.isPitcher).length);
    eligB.slice(0, Math.min(batterNeed, slotsLeft)).forEach(p => { players.push(p); usedFarmIds.add(p.id); slotsLeft--; });

    if (slotsLeft > 0) {
      eligibleFarm.filter(p => !usedFarmIds.has(p.id)).sort((a, b) => effScore(b, true) - effScore(a, true))
        .slice(0, slotsLeft).forEach(p => { players.push(p); usedFarmIds.add(p.id); });
    }

    // 郢ｧ・ｯ郢晢ｽｭ郢ｧ・ｹ驕橸ｽｮ陋ｻ・･郢晁・ﾎ帷ｹ晢ｽｳ郢ｧ・ｹ髫ｱ・ｿ隰ｨ・ｴ: 隰壼｢鍋・闕ｳ蟠趣ｽｶ・ｳ邵ｺ・ｪ郢ｧ逕ｻ諤呵托ｽｱ鬩･蜿也・遶顔夢諤呵托ｽｷfarm隰壼｢鍋・邵ｲ繝ｻ纃ｽ隰・ｶ・ｸ蟠趣ｽｶ・ｳ邵ｺ・ｪ郢ｧ逕ｻ諤呵托ｽｱ隰壼｢鍋・遶顔夢諤呵托ｽｷfarm鬩･蜿也・
    let curP = players.filter(p => p.isPitcher).length;
    let curB = players.filter(p => !p.isPitcher).length;
    while (curP < OPTIMAL_PITCHER_COUNT && curB > TARGET_BATTERS) {
      const fp = newFarm.filter(p => p.isPitcher && canPromote(p) && !usedFarmIds.has(p.id)).sort((a, b) => effScore(b, true) - effScore(a, true))[0];
      const ap = players.filter(p => !p.isPitcher && !usedActiveIds.has(p.id)).sort((a, b) => effScore(a, false) - effScore(b, false))[0];
      if (!fp || !ap) break;
      players = [...players.filter(p => p.id !== ap.id), fp];
      newFarm = [...newFarm.filter(p => p.id !== fp.id), { ...ap, registrationCooldownDays: REGISTRATION_COOLDOWN_DAYS }];
      usedFarmIds.add(fp.id); usedActiveIds.add(ap.id);
      curP = players.filter(p => p.isPitcher).length; curB = players.filter(p => !p.isPitcher).length;
    }
    while (curB < TARGET_BATTERS && curP > OPTIMAL_PITCHER_COUNT) {
      const fp = newFarm.filter(p => !p.isPitcher && canPromote(p) && !usedFarmIds.has(p.id)).sort((a, b) => effScore(b, true) - effScore(a, true))[0];
      const ap = players.filter(p => p.isPitcher && !usedActiveIds.has(p.id)).sort((a, b) => effScore(a, false) - effScore(b, false))[0];
      if (!fp || !ap) break;
      players = [...players.filter(p => p.id !== ap.id), fp];
      newFarm = [...newFarm.filter(p => p.id !== fp.id), { ...ap, registrationCooldownDays: REGISTRATION_COOLDOWN_DAYS }];
      usedFarmIds.add(fp.id); usedActiveIds.add(ap.id);
      curP = players.filter(p => p.isPitcher).length; curB = players.filter(p => !p.isPitcher).length;
    }

    // 郢ｧ・ｹ郢晢ｽｯ郢昴・繝ｻ繝ｻ蝓滓剰怏蟶托ｽｺ迹夲ｽｻ繝ｻvs 闕ｳﾂ髴・ｺ・ｸ蛟ｶ・ｽ髦ｪ繝ｻ陷ｷ讙趣ｽｨ・ｮ陋ｻ・･繝ｻ繝ｻ    const remainFarm = newFarm.filter(fp => canPromote(fp) && !usedFarmIds.has(fp.id));
    if (remainFarm.length > 0) {
      [...players].sort((a, b) => effScore(a, false) - effScore(b, false)).forEach(ap => {
        if (usedActiveIds.has(ap.id)) return;
        const best = remainFarm.find(fp => !usedFarmIds.has(fp.id) && fp.isPitcher === ap.isPitcher);
        if (!best) return;
        if (effScore(best, true) - effScore(ap, false) >= ROSTER_SWAP_SCORE_THRESHOLD) {
          players = players.filter(p => p.id !== ap.id);
          players.push(best);
          newFarm = newFarm.filter(p => p.id !== best.id);
          newFarm.push({ ...ap, registrationCooldownDays: REGISTRATION_COOLDOWN_DAYS });
          usedFarmIds.add(best.id);
          usedActiveIds.add(ap.id);
        }
      });
    }

    // 隴上・・ｰ・ｼ陞ｳ貅ｯ・｡繝ｻ farm 邵ｺ荵晢ｽ蛾ｫｯ・､陷ｴ・ｻ繝ｻ蛹ｻ縺醍ｹ晢ｽｭ郢ｧ・ｹ驕橸ｽｮ陋ｻ・･陋ｻ繝ｻ諤ｧ郢ｧﾂ繝ｻ繝ｻ    [...usedFarmIds].forEach(id => { newFarm = newFarm.filter(fp => fp.id !== id); });
  }

  // 隨渉隨渉 1.5 陷郁ご蛹ｱ郢晢ｽｭ郢晢ｽｼ郢昴・・｢・ｺ闖ｫ繝ｻ 1髴・ｦ翫・騾具ｽｺ邵ｺ繝ｻ闔・ｺ隴幢ｽｪ雋・邵ｺ・ｪ郢ｧ繝ｻfarm 陷郁ご蛹ｱ郢ｧ雋樞煤陷亥沺繝ｻ隴ｬ・ｼ 隨渉隨渉
  {
    const TARGET_ROT = 6;
    const farmSP = newFarm
      .filter(p => p.isPitcher && p.subtype === '陷郁ご蛹ｱ' && canPromote(p))
      .sort((a, b) => effScore(b, true) - effScore(a, true));
    for (const sp of farmSP) {
      const curSP = players.filter(p => p.isPitcher && p.subtype === '陷郁ご蛹ｱ' && !p.isIkusei && (p.injuryDaysLeft ?? 0) === 0).length;
      if (curSP >= TARGET_ROT) break;
      if (players.length < MAX_ROSTER) {
        players = [...players, sp];
        newFarm = newFarm.filter(p => p.id !== sp.id);
      } else {
        const weakRP = players
          .filter(p => p.isPitcher && p.subtype !== '陷郁ご蛹ｱ' && !p.isIkusei)
          .sort((a, b) => effScore(a, false) - effScore(b, false))[0];
        if (!weakRP) break;
        players = [...players.filter(p => p.id !== weakRP.id), sp];
        newFarm = [...newFarm.filter(p => p.id !== sp.id), { ...weakRP, registrationCooldownDays: REGISTRATION_COOLDOWN_DAYS }];
      }
    }
  }

  // 隨渉隨渉 1.6 隰仙｢鍋・隴崢闖ｴ繝ｻMIN_ACTIVE_CATCHERS 陷ｷ蜥ｲ・｢・ｺ闖ｫ繝ｻ隨渉隨渉
  {
    const activeCatchers = () => players.filter(p => !p.isPitcher && p.pos === '隰仙｢鍋・' && (p.injuryDaysLeft ?? 0) === 0);
    const farmCatchers = () => newFarm.filter(p => !p.isPitcher && p.pos === '隰仙｢鍋・' && canPromote(p))
      .sort((a, b) => effScore(b, true) - effScore(a, true));
    while (activeCatchers().length < MIN_ACTIVE_CATCHERS) {
      const fc = farmCatchers()[0];
      if (!fc) break;
      if (players.length < MAX_ROSTER) {
        players = [...players, fc];
        newFarm = newFarm.filter(p => p.id !== fc.id);
      } else {
        const weakBatter = players
          .filter(p => !p.isPitcher && p.pos !== '隰仙｢鍋・')
          .sort((a, b) => effScore(a, false) - effScore(b, false))[0];
        if (!weakBatter) break;
        players = [...players.filter(p => p.id !== weakBatter.id), fc];
        newFarm = [...newFarm.filter(p => p.id !== fc.id), { ...weakBatter, registrationCooldownDays: REGISTRATION_COOLDOWN_DAYS }];
      }
    }
  }

  // 隨渉隨渉 2. 隰・ｦｴ・ｰ繝ｻ繝ｻ陷肴・・ｨ・ｭ陞ｳ螟ｲ・ｼ繝ｻRV 郢晏・ﾎ礼ｹ晢ｽｼ郢晢ｽｪ郢ｧ・ｹ郢昴・縺・ｹ昴・縺代・繝ｻ隨渉隨渉
  const batters = players.filter(p => !p.isPitcher && !p.isIkusei && (p.injuryDaysLeft ?? 0) === 0);
  const useDh = !!team.dhEnabled;
  const required = [...FIELDING_POSITIONS, ...(useDh ? ['DH'] : [])];
  const profAt = (p, pos) => pos === 'DH' ? 50 : p.pos === pos ? 100 : (p.positions?.[pos] ?? 0);
  const sortedB = [...batters].sort((a, b) => _cpuBatterScore(b) - _cpuBatterScore(a));
  const posEligible = Object.fromEntries(required.map(pos => [pos, sortedB.filter(p => profAt(p, pos) > 0)]));
  const posOrder = [...required].sort((a, b) => posEligible[a].length - posEligible[b].length);
  const assignment = new Map();
  const playerUsed = new Set();
  for (const pos of posOrder) {
    const best = posEligible[pos].find(p => !playerUsed.has(p.id));
    if (best) { assignment.set(pos, best); playerUsed.add(best.id); }
  }
  for (const pos of posOrder) {
    if (assignment.has(pos)) continue;
    const fallback = sortedB.find(p => !playerUsed.has(p.id));
    if (fallback) { assignment.set(pos, fallback); playerUsed.add(fallback.id); }
  }
  const newLineup = [...assignment.entries()]
    .sort((a, b) => _cpuBatterScore(b[1]) - _cpuBatterScore(a[1]))
    .map(([, player]) => player.id);

  // 隨渉隨渉 3. 隰壼｢鍋・郢晢ｽｭ郢晢ｽｼ郢昴・繝ｻ驍ｯ蜻主・髢ｾ・ｪ陷肴・・ｨ・ｭ陞ｳ繝ｻ隨渉隨渉
  const pitchers = players.filter(p => p.isPitcher && !p.isIkusei && (p.injuryDaysLeft ?? 0) === 0);
  const starters = pitchers.filter(p => p.subtype === '陷郁ご蛹ｱ').sort((a, b) => _cpuStarterScore(b) - _cpuStarterScore(a));
  const relievers = pitchers.filter(p => p.subtype !== '陷郁ご蛹ｱ').sort((a, b) => _cpuRelieverScore(b) - _cpuRelieverScore(a));
  const MIN_ROT = 5;
  const newRotation = starters.slice(0, 6).map(p => p.id);
  // 陷郁ご蛹ｱ郢ｧ・ｿ郢ｧ・､郢晏干窶ｲ髮懶ｽｳ郢ｧ鄙ｫ竊醍ｸｺ繝ｻ・ｰ・ｴ陷ｷ蛹ｻ繝ｻ邵ｲ竏壹○郢ｧ・ｿ郢晄ｺ倥Μ闕ｳ雍具ｽｽ髦ｪ繝ｻ闕ｳ・ｭ驍ｯ蜷ｶ邃・ｸｺ・ｧ隴崢闖ｴ繝ｻ隴ｫ・ｰ郢ｧ雋樊ｲらｹｧ竏夲ｽ・
  if (newRotation.length < MIN_ROT) {
    const need = MIN_ROT - newRotation.length;
    const fallbackRelievers = [...relievers]
      .sort((a, b) => (b.pitching?.stamina ?? 50) - (a.pitching?.stamina ?? 50))
      .slice(0, need)
      .map(p => p.id);
    newRotation.push(...fallbackRelievers);
  }
  const rotSet = new Set(newRotation);
  const remaining = pitchers.filter(p => !rotSet.has(p.id)).sort((a, b) => _cpuRelieverScore(b) - _cpuRelieverScore(a));
  const newPattern = {
    closerId: remaining[0]?.id ?? null,
    setupId: remaining[1]?.id ?? null,
    seventhId: remaining[2]?.id ?? null,
    middleOrder: remaining.slice(3).map(p => p.id),
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
    faPool, setFaPool, faYears, seasonHistory, setSeasonHistory, news, mailbox,
    saveRevision, setSaveRevision,
    setSaveExists, cpuTradeOffers,
    allStarDone, setAllStarDone, allStarResult, setAllStarResult,
    allStarTriggerDay,
    setAllTeamResultsMap, setPregameError,
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

  const prevMyPlayersRef = useRef(null);
  const prevMyFarmRef = useRef(null);

  // 隴崢驍ｨ繧亥ｧｶ驍ｨ繧・ｽｺ繝ｻ・ｾ繝ｻ 陷茨ｽｨsetState繝ｻ莠･・ｯ・ｾ隰鯉ｽｦ騾ｶ・ｸ隰・事・ｨ蛟ｬ鮖ｸ郢晢ｽｻCPU髫ｧ・ｦ陷ｷ闌ｨ・ｼ蟲ｨ窶ｲ陷ｿ閧ｴ荳千ｸｺ霈費ｽ檎ｸｺ繝ｻteams 邵ｺ・ｧ郢晏干ﾎ樒ｹ晢ｽｼ郢ｧ・ｪ郢晏供繝ｻ隴帶ｺｷ蝟ｧ
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

  // 郢ｧ・｢郢晢ｽｳ郢晄ｧｭ縺育ｹ晢ｽｳ郢晏現ﾂ謦ｰ・ｼ譎牙愛鬮ｱ・｢邵ｺ荵晢ｽ臥ｹｧ・ｳ郢晢ｽｳ郢晄亢繝ｻ郢晞亂ﾎｦ郢晏現窶ｲ陷ｿ謔ｶ・企ｫｯ・､邵ｺ荵晢ｽ檎ｹｧ荵晢ｼ・ｸｺ・ｨ邵ｲ隨ｬ蜃ｾ邵ｺ・ｫ郢晁・繝｣郢昶・繝ｻ騾・・・定叉・ｭ隴・ｽｭ
  useEffect(() => () => {
    isBatchCancelledRef.current = true;
  }, []);

  // 髢ｾ・ｪ陷肴坩蜑・ｭｬ・ｼ郢晢ｽｻ陜玲ｧｫ・ｾ・ｩ鬨ｾ螟り｡・ myTeam 邵ｺ・ｮ players/farm 陞溽甥蝟ｧ郢ｧ蜻茨ｽ､諛・｡咲ｸｺ蜉ｱ窶ｻ鬨ｾ螟り｡・
  useEffect(()=>{
    if(!myTeam||!myId) return;
    const prevPlayers=prevMyPlayersRef.current;
    const prevFarm=prevMyFarmRef.current;
    if(prevPlayers!==null){
      const prevPlayerIds=new Set(prevPlayers.map(p=>p.id));
      // 闕ｳﾂ髴・亂ﾂｰ郢ｧ謌托ｽｺ迹夲ｽｻ髦ｪ竊馴§・ｻ陷阪・邵ｺ荵昶命 隲､・ｪ隰御ｻ｣竕郢ｧ繝ｻ遶翫・髢ｾ・ｪ陷肴坩蜑・ｭｬ・ｼ鬨ｾ螟り｡・
      const newlyDemotedInj=myTeam.farm.filter(p=>prevPlayerIds.has(p.id)&&!myTeam.players.find(x=>x.id===p.id)&&(p.injuryDaysLeft??0)>0);
      if(newlyDemotedInj.length>0){
        const names=newlyDemotedInj.map(p=>`${p.name}・・{p.injuryDaysLeft}譌･・荏).join('縲・);
        notify(`､・${names}縺梧ｪ謌代〒閾ｪ蜍穂ｺ瑚ｻ埼剄譬ｼ`,'warn');
      }
    }
    if(prevFarm!==null){
      const prevIneligibleIds=new Set(prevFarm.filter(p=>!p.isIkusei&&((p.injuryDaysLeft??0)>0||(p.registrationCooldownDays??0)>0)).map(p=>p.id));
      const newlyEligible=myTeam.farm.filter(p=>!p.isIkusei&&prevIneligibleIds.has(p.id)&&(p.injuryDaysLeft??0)===0&&(p.registrationCooldownDays??0)===0);
      if(newlyEligible.length>0){
        const names=newlyEligible.map(p=>p.name).join('縲・);
        notify(`笨・${names}縺悟屓蠕ｩ・∽ｸ霆肴・譬ｼ蜿ｯ閭ｽ`,'ok');
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
        title:`${offer.from.name}縺九ｉ繝医Ξ繝ｼ繝峨が繝輔ぃ繝ｼ`,
        from:offer.from.name,
        dateLabel:`${year}陝ｷ・ｴ ${gameDay}隴鯉ｽ･騾ｶ・ｮ`,
        timestamp:Date.now(),
        read:false,
        resolved:false,
      body:`${offer.from.name}繧医ｊ繝医Ξ繝ｼ繝峨・謇楢ｨｺ縺後≠繧翫∪縺励◆縲・n\n繝ｻ迯ｲ蠕励＠縺溘＞驕ｸ謇・ ${offer.want.map(p=>p.name).join('縲・)}\n繝ｻ謾ｾ蜃ｺ蛟呵｣・ ${offer.offer.length>0?offer.offer.map(p=>p.name).join('縲・):'縺ｪ縺・}${offer.cash>0?'\n繝ｻ驥鷹姦: +'+(offer.cash/10000).toLocaleString()+'荳・・':''}\n\n繝｡繝ｼ繝ｫ逕ｻ髱｢縺九ｉ霑皮ｭ斐＠縺ｦ縺上□縺輔＞縲Ａ,
        offer
      };
      setMailbox(prev=>[...prev,mail]);
      notify(`${offer.from.name}縺九ｉ繝医Ξ繝ｼ繝峨が繝輔ぃ繝ｼ縺悟ｱ翫″縺ｾ縺励◆`,'ok');
    }
  };

  /**
   * 7隴帛現繝ｻ郢晁・繝｣郢昶・縺咏ｹ晢｣ｰ闕ｳ・ｭ邵ｺ・ｫCPU vs CPU 郢昴・繝｣郢晏ｳｨﾎ帷ｹｧ・､郢晢ｽｳ郢晏現ﾎ樒ｹ晢ｽｼ郢晏ｳｨ・帝圦・ｦ邵ｺ・ｿ郢ｧ荵敖繝ｻ   * @param {object[]} teamsArr
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
      headline: `遘ｻ邀肴ュ蝣ｱ ${buyerGets.name}縺・{buyerName}縺ｸ`,
      body: `${sellerName}縺ｨ${buyerName}縺ｮ髢薙〒繝医Ξ繝ｼ繝峨′謌千ｫ九・{buyerName}縺ｯ${buyerGets.name}繧堤佐蠕励＠縲・{sellerGets.name}繧呈叛蜃ｺ縺励∪縺励◆縲Ａ,
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
      title: `${offer.from.name}縺九ｉ繝医Ξ繝ｼ繝峨が繝輔ぃ繝ｼ`,
      from: offer.from.name,
      dateLabel: `${year}蟷ｴ ${currentGameDay}譌･逶ｮ`,
      timestamp: Date.now(),
      read: false,
      resolved: false,
      body: `${offer.from.name}繧医ｊ繝医Ξ繝ｼ繝峨・謇楢ｨｺ縺後≠繧翫∪縺励◆縲・n\n繝ｻ迯ｲ蠕励＠縺溘＞驕ｸ謇・ ${offer.want.map(p => p.name).join('縲・)}\n繝ｻ謾ｾ蜃ｺ蛟呵｣・ ${offer.offer.length > 0 ? offer.offer.map(p => p.name).join('縲・) : '縺ｪ縺・}${offer.cash > 0 ? '\n繝ｻ驥鷹姦: +' + (offer.cash / 10000).toLocaleString() + '荳・・' : ''}\n\n繝｡繝ｼ繝ｫ逕ｻ髱｢縺九ｉ霑皮ｭ斐＠縺ｦ縺上□縺輔＞縲Ａ,
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
    const dayNews = (res.news || []).map((item) => ({ ...item, dateLabel: `${year}陝ｷ・ｴ ${currentGameDay}隴鯉ｽ･騾ｶ・ｮ` }));
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
      headline: `繧ｪ繝ｼ繝ｫ繧ｹ繧ｿ繝ｼ隨ｬ1謌ｦ 繧ｻ${asResult.game1.score.ce} - 繝・{asResult.game1.score.pa}`,
      source: 'NPB蜈ｬ蠑・,
      dateLabel: `${year}陝ｷ・ｴ ${dayLabel}隴鯉ｽ･騾ｶ・ｮ`,
      body: `莨壼ｴ: ${asResult.venue}\n繧ｻ繝ｻ繝ｪ繝ｼ繧ｰ ${asResult.game1.score.ce} - ${asResult.game1.score.pa} 繝代・繝ｪ繝ｼ繧ｰ\nMVP: ${asResult.game1.mvp?.name || '驕ｸ蜃ｺ縺ｪ縺・}`,
    },{
      type: 'allstar',
      headline: `繧ｪ繝ｼ繝ｫ繧ｹ繧ｿ繝ｼ隨ｬ2謌ｦ 繧ｻ${asResult.game2.score.ce} - 繝・{asResult.game2.score.pa}`,
      source: 'NPB蜈ｬ蠑・,
      dateLabel: `${year}陝ｷ・ｴ ${dayLabel + 1}隴鯉ｽ･騾ｶ・ｮ`,
      body: `繧ｻ繝ｻ繝ｪ繝ｼ繧ｰ ${asResult.game2.score.ce} - ${asResult.game2.score.pa} 繝代・繝ｪ繝ｼ繧ｰ\nMVP: ${asResult.game2.mvp?.name || '驕ｸ蜃ｺ縺ｪ縺・}`,
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

    // 隴鯉ｽ｢陝・･ﾎ帷ｹｧ・､郢晢ｽｳ郢晉ｿｫ繝｣郢晏干ﾂｰ郢ｧ逕ｻ諤剰怏・ｹ邵ｺ・ｪ鬮ｱ讓雁・隰・ｹ昴・邵ｺ・ｿ
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

  const pickOpponentFromSchedule = (day) => {
    const matchup=getMyMatchup(schedule,day,myId);
    if(matchup){
      return {opp:teams.find(t=>t.id===matchup.oppId)||null, isHome:matchup.isHome, venueNote:matchup.venueNote};
    }
    const myLeague=myTeam?.league;
    const pool=teams.filter(t=>t.id!==myId&&t.league===myLeague);
    return {opp:pool[rng(0,pool.length-1)]||teams.find(t=>t.id!==myId),isHome:true,venueNote:null};
  };

  // Pick opponent and go to mode select
  const handleStartGame = () => {
    if(!myTeam) return;
    const {opp,isHome}=pickOpponentFromSchedule(gameDay);
    if(!opp) return;

    // 隨渉隨渉 髫ｧ・ｦ陷ｷ莠･辯慕ｹ晁・ﾎ懃ｹ昴・繝ｻ郢ｧ・ｷ郢晢ｽｧ郢晢ｽｳ 隨渉隨渉
    const useDh = isHome ? !!myTeam.dhEnabled : !!opp.dhEnabled;
    const neededBatters = useDh ? 9 : 8;
    const activeCount = myTeam.players.filter(p => !p.isIkusei).length;
    if (activeCount > MAX_ROSTER) {
      setPregameError({ message: `荳霆咲匳骭ｲ縺御ｸ企剞縺ｮ ${MAX_ROSTER} 莠ｺ繧定ｶ・∴縺ｦ縺・∪縺吶ら樟蝨ｨ ${activeCount} 莠ｺ縺ｧ縺吶Ａ });
      return;
    }
    const myNonPitchers = myTeam.players.filter(p => !p.isPitcher && !p.isIkusei);
    const myNonPitcherIds = new Set(myNonPitchers.map(p => p.id));
    const lineupSrc = useDh ? (myTeam.lineupDh || myTeam.lineup || []) : (myTeam.lineupNoDh || myTeam.lineup || []);
    const myLineup = lineupSrc.filter(id => myNonPitcherIds.has(id));
    if (myLineup.length < neededBatters) {
      setPregameError({ message: `蜈育匱繝｡繝ｳ繝舌・縺御ｸ崎ｶｳ縺励※縺・∪縺吶ょｿ・ｦ・${neededBatters} 莠ｺ / 迴ｾ蝨ｨ ${myLineup.length} 莠ｺ縺ｧ縺吶Ａ });
      return;
    }
    const foreignInLineup = myLineup.filter(id => myNonPitchers.find(p => p.id === id)?.isForeign).length;
    if (foreignInLineup > MAX_FOREIGN_ACTIVE) {
      setPregameError({ message: `蜈育匱繝｡繝ｳ繝舌・縺ｮ螟門嵜莠ｺ譫縺ｯ ${MAX_FOREIGN_ACTIVE} 莠ｺ縺ｾ縺ｧ縺ｧ縺吶ら樟蝨ｨ ${foreignInLineup} 莠ｺ縺・∪縺吶Ａ });
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

  // Mode selected 遶翫・start appropriate game type
  const handleModeSelect = mode => {
    setGameMode(mode);
    if(mode==="tactical"){
      const hasCurrentGameTeams = Boolean(currentGameTeams?.my && currentGameTeams?.opp);
      const fallbackMyTeam = teams.find(t=>t.id===myId);
      const hasFallbackOpp = Boolean(currentOpp);
      if (!hasCurrentGameTeams && (!fallbackMyTeam || !hasFallbackOpp)) {
        notify("隧ｦ蜷医ョ繝ｼ繧ｿ縺ｮ隱ｭ縺ｿ霎ｼ縺ｿ縺ｫ螟ｱ謨励＠縺ｾ縺励◆縲よ律遞狗判髱｢縺九ｉ蜀榊ｺｦ隧ｦ縺励※縺上□縺輔＞縲・, "warn");
        setScreen("hub");
        return;
      }
      setScreen("tactical_game");
    } else {
      const myT=(currentGameTeams?.my)||teams.find(t=>t.id===myId);
      const oppT=(currentGameTeams?.opp)||currentOpp;
      const r=quickSimGame(myT,oppT);
      handleAutoSimEnd(r);
    }
  };

  // Auto sim result handler
  const handleAutoSimEnd = r => {
    const myT=teams.find(t=>t.id===myId);
    if(!myT) return;
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
      updated.players=tickInjuries(updated.players);
      updated.players=tickPositionTraining(updated.players);
      updated.players=updated.players.map(p=>({...p,daysOnActiveRoster:(p.daysOnActiveRoster??0)+1}));
      updated.players=applyDefenseCoachRecovery(updated.players,t.coaches);
      const newInj=checkForInjuries(updated.players, year);
      if(newInj.length>0){
        const injNames=newInj.reduce((acc,i)=>{const p=updated.players.find(x=>x.id===i.id);if(p)acc.push({name:p.name,...i});return acc;},[]);
        updated.players=applyInjuriesToPlayers(updated.players, newInj, year);
        injNames.filter(i=>i.days>=7).forEach(i=>{addNews({type:"season",headline:`､・${i.name}縺瑚ｲ蛯ｷ`,source:"繝√・繝諠・ｱ",dateLabel:`${year}蟷ｴ ${gameDay}譌･逶ｮ`,body:`${i.name}縺ｯ${i.type}縺ｧ${i.days}譌･髮｢閼ｱ隕玖ｾｼ縺ｿ縺ｧ縺吶ゅメ繝ｼ繝縺ｯ繝ｭ繧ｹ繧ｿ繝ｼ隱ｿ謨ｴ繧帝ｲ繧√∪縺吶Ａ});});
      }
      // 騾具ｽｻ鬪ｭ・ｲ郢ｧ・ｯ郢晢ｽｼ郢晢ｽｫ郢敖郢ｧ・ｦ郢晢ｽｳ郢昴・縺醍ｹ晢ｽｪ郢晢ｽ｡郢晢ｽｳ郢昴・      updated.players=tickCooldowns(updated.players);
      // 闔迹夲ｽｻ繝ｻ 隲､・ｪ隰悟､ｧ螻楢包ｽｩ + 郢ｧ・ｯ郢晢ｽｼ郢晢ｽｫ郢敖郢ｧ・ｦ郢晢ｽｳ郢昴・縺醍ｹ晢ｽｪ郢晢ｽ｡郢晢ｽｳ郢昴・      updated.farm=tickInjuries(updated.farm??[]);
      updated.farm=tickCooldowns(updated.farm??[]);
      // 隲､・ｪ隰檎ｬｬ蠕玖ｬｨ・ｰ > 10隴鯉ｽ･邵ｺ・ｮ闕ｳﾂ髴・涵竏郁ｬ・ｹ晢ｽ帝明・ｪ陷咲ｩゑｽｺ迹夲ｽｻ蝓ｼ蜑・ｭｬ・ｼ
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
      updated.players=tickInjuries(updated.players);
      const newInj=checkForInjuries(updated.players, year);
      updated.players=applyInjuriesToPlayers(updated.players, newInj, year);
      Object.assign(updated,applyPopularityDelta(t,!won&&!drew,drew));
      return updated;
    });
    // Simulate remaining CPU vs CPU games for this day (schedule-based matchups)
    // CPU 郢昶・繝ｻ郢晢｣ｰ邵ｺ・ｯ邵ｺ・ｾ邵ｺ・ｰ upd() 邵ｺ・ｮ陟厄ｽｱ鬮ｻ・ｿ郢ｧ雋槫･ｳ邵ｺ莉｣窶ｻ邵ｺ繝ｻ竊醍ｸｺ繝ｻ笳・ｹｧ繝ｻteams 郢ｧ蝣､蟲ｩ隰暦ｽ･陷ｿ繧峨・邵ｺ蜉ｱ窶ｻ OK
    const _oppId=currentOpp.id;
    const _cpuMatchups=getCpuMatchups(schedule,gameDay,myId,_oppId);
    const _fallbackOthers=teams.filter(t=>t.id!==myId&&t.id!==_oppId);
    const matchupList=_cpuMatchups.length>0
      ?_cpuMatchups
      :(()=>{const pairs=[];for(let i=0;i<_fallbackOthers.length-1;i+=2)pairs.push({homeId:_fallbackOthers[i].id,awayId:_fallbackOthers[i+1].id});return pairs;})();

    // 郢ｧ・ｷ郢晢｣ｰ陞ｳ貅ｯ・｡魃会ｽｼ繝ｻetTeams 陞溷私・ｼ菫・・ 驍ｨ蜈域｣｡郢ｧ蛛ｵ竏ｪ邵ｺ・ｨ郢ｧ竏壺ｻ邵ｺ荵晢ｽ・state 郢ｧ蜻亥ｳｩ隴・ｽｰ
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
        a.players=tickInjuries(a.players);
        const aInj=checkForInjuries(a.players,year);
        a.players=applyInjuriesToPlayers(a.players,aInj,year);
        b.players=applyGameStatsFromLog(b.players,cr.log||[],false,!aWon&&!cdrew, gameDay);
        b.players=applyPostGameCondition(b.players,cr.log||[],false,gameDay);
        b.players=tickInjuries(b.players);
        const bInj=checkForInjuries(b.players,year);
        b.players=applyInjuriesToPlayers(b.players,bInj,year);
      }
      return newTeams;
    });
    // allTeamResultsMap 邵ｺ・ｫ CPU 郢ｧ・ｲ郢晢ｽｼ郢晢｣ｰ + 髢ｾ・ｪ郢昶・繝ｻ郢晢｣ｰ郢ｧ・ｲ郢晢ｽｼ郢晢｣ｰ邵ｺ・ｮ郢晄㈱繝｣郢ｧ・ｯ郢ｧ・ｹ郢ｧ・ｹ郢ｧ・ｳ郢ｧ・｢郢ｧ蜑・ｽｸﾂ隲｡・ｬ髫ｪ蛟ｬ鮖ｸ
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
      // 髢ｾ・ｪ郢昶・繝ｻ郢晢｣ｰ邵ｺ・ｮ髫ｧ・ｦ陷ｷ闌ｨ・ｼ繝ｻyTeam 邵ｺ繝ｻhome繝ｻ繝ｻ      recordGame(myId,_oppId,r,myTeam.players,currentOpp.players,myTeam.name,currentOpp.name);
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
        addNews({ type: 'trade', headline: newsItem.headline, source: 'Baseball Times', dateLabel: `${year}陝ｷ・ｴ ${gameDay}隴鯉ｽ･騾ｶ・ｮ`, body: newsItem.body });
        addTransferLog({
          year,
          day: gameDay,
          type: "trade",
          headline: `邵ｲ辯ｭPU鬮｢阮吶Κ郢晢ｽｬ郢晢ｽｼ郢晏ｳｨﾂ繝ｻ{newsItem.sellerName} 遶翫・${newsItem.buyerName}`,
          fromTeam: newsItem.sellerName,
          toTeam: newsItem.buyerName,
          playersIn: [newsItem.buyerGetsName],
          playersOut: [newsItem.sellerGetsName],
          detail: newsItem.body,
        });
      }
    }
    if(Math.random()<0.04&&myTeam){
      const cands=myTeam.players.filter(p=>p.age>=35&&!p._retireNow&&calcRetireWill(p)>=40);
      if(cands.length>0){
        const rp=cands[rng(0,cands.length-1)];
        setRetireModal({player:rp,type:"announce"});
        addNews({type:"season",headline:`蠑暮遉ｺ蜚・${rp.name}`,source:"繧ｹ繝昴・繝・ｱ遏･",dateLabel:`${year}蟷ｴ ${gameDay}譌･逶ｮ`,body:`${rp.name}・・{rp.age}豁ｳ・峨′蠑暮繧堤､ｺ蜚・☆繧九さ繝｡繝ｳ繝医ｒ蜃ｺ縺励∪縺励◆縲ゅメ繝ｼ繝縺ｯ莉雁ｾ後∵悽莠ｺ縺ｮ諢乗昴ｒ遒ｺ隱阪＠縺ｦ縺・″縺ｾ縺吶Ａ});
      }
    }
    const _tmpl=won?NEWS_TEMPLATES_WIN:NEWS_TEMPLATES_LOSE;
    const _scoreStr=r.score.my+"-"+r.score.opp;
    const _hl=_tmpl[rng(0,_tmpl.length-1)].replace("{team}",myTeam?.name||"閾ｪ繝√・繝").replace("{opp}",currentOpp?.name||"逶ｸ謇・).replace("{score}",_scoreStr);
    addNews({type:"game",headline:_hl,source:"繧ｹ繝昴・繝・ｱ遏･",dateLabel:`${year}蟷ｴ ${gameDay}譌･逶ｮ`,body:(won?`${myTeam?.name}縺・{currentOpp?.name}縺ｫ${_scoreStr}縺ｧ蜍晏茜縺励∪縺励◆縲Ａ:`${myTeam?.name}縺ｯ${currentOpp?.name}縺ｫ${_scoreStr}縺ｧ謨励ｌ縺ｾ縺励◆縲Ａ)});
    if(Math.random()<0.35){
      const _qs=won?INTERVIEW_QUESTIONS_WIN:INTERVIEW_QUESTIONS_LOSE;
      const _opts=won?INTERVIEW_OPTIONS_WIN:INTERVIEW_OPTIONS_LOSE;
      addNews({type:"interview",headline:`繧､繝ｳ繧ｿ繝薙Η繝ｼ ${myTeam?.name||""}謌ｦ蠕御ｼ夊ｦ義,source:"逅・屮蠎・ｱ",dateLabel:`${year}蟷ｴ ${gameDay}譌･逶ｮ`,body:"隧ｦ蜷亥ｾ後∫屮逹｣縺ｫ繧ｳ繝｡繝ｳ繝医ｒ豎ゅａ繧峨ｌ縺溘・,question:_qs[rng(0,_qs.length-1)],options:_opts});
    }
    const _adrew=r.score.my===r.score.opp;
    pushResult(won,_adrew,currentOpp?.name||"",r.score.my,r.score.opp,gameDay);
    gs.pushGameResult(gameDay,{won,drew:_adrew,oppName:currentOpp?.name||"",myScore:r.score.my,oppScore:r.score.opp,log:r.log||[],inningSummary:r.inningSummary||[],oppTeam:currentOpp});
    setGameDay(d=>d+1);
    if(!allStarDone && gameDay+1===allStarTriggerDay){
      const rosters=selectAllStars(teams);
      const asResult=runAllStarGame(rosters, year);
      setTeams(prev=>applyAllStarSelections(prev, rosters));
      setAllStarDone(true);
      setAllStarResult({ rosters, gameResult: asResult });
      publishAllStarNews(asResult, gameDay+1);
      setScreen("allstar");
      return;
    }
    if(gameDay>=SEASON_GAMES){
      // 陷茨ｽｨsetState陷ｿ閧ｴ荳占募ｾ後・ teams 邵ｺ・ｧinitPlayoff郢ｧ雋樔ｻ也ｸｺ・ｶ邵ｺ貅假ｽ「seEffect邵ｺ・ｫ陝狗｢托ｽｭ・ｲ
      pendingPlayoffRef.current=true;
    }
    else setScreen("result");
  };

  // 闔会ｽｻ隲｢蜑ｰ・ｩ・ｦ陷ｷ蝓溽・邵ｺ・ｾ邵ｺ・ｨ郢ｧ竏壺ｻ郢ｧ・ｪ郢晢ｽｼ郢晏現縺咏ｹ晢｣ｰ
  const handleBatchSim = (count, autoManageMyTeam=false) => {
    if(!myTeam) return;
    const requestedCount = Number.isFinite(count) ? Math.floor(count) : BATCH;
    const safeRequestedCount = Math.max(0, requestedCount);
    const actual=Math.min(safeRequestedCount, SEASON_GAMES-(gameDay-1));
    if(actual<=0) return;
    runBatchGames(actual, autoManageMyTeam);
  };

  // 隹ｿ荵晢ｽ願怦・ｨ髫ｧ・ｦ陷ｷ蛹ｻ竏ｪ邵ｺ・ｨ郢ｧ竏壺ｻ郢ｧ・ｪ郢晢ｽｼ郢晏現縺咏ｹ晢｣ｰ


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

  // 郢晁・繝｣郢昶・繝ｻ騾・・繝ｻ陷茨ｽｱ鬨ｾ螢ｹﾎ溽ｹｧ・ｸ郢昴・縺・
  const runBatchGames = async (count, autoManageMyTeam=false) => {
    if(!myTeam) return;
    const safeCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
    if (safeCount <= 0) {
      notify("繝舌ャ繝∬ｩｦ蜷域焚縺御ｸ肴ｭ｣縺ｧ縺・, "warn");
      return;
    }

    const startedAt = Date.now();
    const taskId = uid();
    const snapshot = {
      teams,
      schedule,
      faPool,
      seasonHistory,
      news,
      mailbox,
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
      phase: "隧ｦ蜷医す繝",
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
              phase: typeof payload.phase === "string" && payload.phase.trim() ? payload.phase : "隧ｦ蜷医す繝",
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
        notify("繝舌ャ繝∝・逅・ｒ荳ｭ豁｢縺励∪縺励◆", "warn");
        return;
      }

      const {
        nextState,
        batchResults,
        batchMeta,
        recentResults: nextRecentResults,
        gameResultsMapPatch,
        allTeamResultsPatch,
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
      gs.setRecentResults((prev) => [...nextRecentResults, ...prev].slice(0, 5));
      gs.setGameResultsMap((prev) => ({ ...prev, ...gameResultsMapPatch }));
      mergeAllTeamResultsPatch(allTeamResultsPatch);

      if (nextAllStarDone) {
        setAllStarDone(true);
      }
      if (allStarPayload) {
        setAllStarResult(allStarPayload);
      }

      if ((summaryCounts?.tradeMailCount || 0) > 0) {
        notify(`鐙 繝舌ャ繝∽ｸｭ縺ｫ繝医Ξ繝ｼ繝峨が繝輔ぃ繝ｼ縺・{summaryCounts.tradeMailCount}莉ｶ螻翫″縺ｾ縺励◆`, "ok");
      }
      if ((summaryCounts?.foreignSigningCount || 0) > 0) {
        notify(`璃 繝舌ャ繝∽ｸｭ縺ｫ莉也帥蝗｣縺ｮ陬懷ｼｷ縺・{summaryCounts.foreignSigningCount}莉ｶ縺ゅｊ縺ｾ縺励◆`, "ok");
      }

      if (shouldEnterPlayoff) {
        const withFarm = runFarmSeason(nextState.teams);
        setTeams(withFarm);
        setPlayoff(initPlayoff(withFarm));
        setScreen("playoff");
      } else {
        setScreen("batch_result");
      }

      enqueueSaveGame(nextState, { skipBackupRotation: true, preferMainSave: true })
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
      notify("繝舌ャ繝∝・逅・ｸｭ縺ｫ繧ｨ繝ｩ繝ｼ縺檎匱逕溘＠縺ｾ縺励◆", "error");
    } finally {
      cleanupWorker();
    }
  };

  // Game over callback from TacticalGameScreen
  const handleTacticalGameEnd = gsResult => {
    if(!myTeam||!currentOpp) return;
    const won=gsResult.score.my>gsResult.score.opp;
    const drew=gsResult.score.my===gsResult.score.opp;
    const immediateResult={
      score:gsResult.score,
      log:gsResult.log||[],
      inningSummary:gsResult.inningSummary||[],
      oppTeam:currentOpp,
      won,
      gameNo:gameDay,
      _source:"tactical",
      isPostGameProcessing:true,
    };

    setGameResult(immediateResult);
    setScreen("result");

    scheduleDeferredPostGameWork(()=>{
      try{
        upd(myId,t=>{
          let updated={...t,
            wins:t.wins+(won?1:0),losses:t.losses+(!won&&!drew?1:0),draws:t.draws+(drew?1:0),
            rf:t.rf+gsResult.score.my,ra:t.ra+gsResult.score.opp,
            rotIdx:t.rotIdx+1,
          };
          updated.players=applyGameStatsFromLog(updated.players, gsResult.log, true, won, gameDay);
          updated.players=applyPostGameCondition(updated.players, gsResult.log, true, gameDay);
          updated.players=tickInjuries(updated.players);
          updated.players=tickPositionTraining(updated.players);
          updated.players=updated.players.map(p=>({...p,daysOnActiveRoster:(p.daysOnActiveRoster??0)+1}));
          updated.players=applyDefenseCoachRecovery(updated.players,t.coaches);
          const newInj=checkForInjuries(updated.players, year);
          updated.players=applyInjuriesToPlayers(updated.players, newInj, year);
          updated.players=tickCooldowns(updated.players);
          updated.farm=tickInjuries(updated.farm??[]);
          updated.farm=tickCooldowns(updated.farm??[]);
          updated=autoInjuryDemote(updated);
          const popFieldsT=applyPopularityDelta(t,won,drew);updated={...updated,...popFieldsT};
          const rev=calcRevenue(updated);
          const revTotal=rev.ticket+rev.sponsor+rev.merch;
          updated.budget+=revTotal;
          updated.revenueThisSeason=(updated.revenueThisSeason??0)+revTotal;
          return updated;
        });
        upd(currentOpp.id,t=>{
          let updated={...t,
            wins:t.wins+(!won&&!drew?1:0),
            losses:t.losses+(won?1:0),
            draws:t.draws+(drew?1:0),
            rf:t.rf+gsResult.score.opp,
            ra:t.ra+gsResult.score.my,
          };
          updated.players=applyGameStatsFromLog(updated.players,gsResult.log,false,!won&&!drew, gameDay);
          updated.players=applyPostGameCondition(updated.players,gsResult.log,false,gameDay);
          updated.players=tickInjuries(updated.players);
          const newInj=checkForInjuries(updated.players, year);
          updated.players=applyInjuriesToPlayers(updated.players, newInj, year);
          Object.assign(updated,applyPopularityDelta(t,!won&&!drew,drew));
          return updated;
        });
        const _tOppId=currentOpp.id;
        const _tCpuMatchups=getCpuMatchups(schedule,gameDay,myId,_tOppId);
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
          const cr=quickSimGame(applyDhToTeam(a,useDh),applyDhToTeam(b,useDh));
          tCpuSimResults.push({matchup,cr,homeTeam:a,awayTeam:b});
        }
        setTeams(prev=>{
          let newTeams=prev.map(t=>({...t,players:t.players.map(p=>({...p,stats:{...p.stats}}))}));
          for(const{matchup,cr}of tCpuSimResults){
            const a=newTeams.find(t=>t.id===matchup.homeId);
            const b=newTeams.find(t=>t.id===matchup.awayId);
            if(!a||!b) continue;
            const cdrew=cr.score.my===cr.score.opp;
            const aWon=cr.won;
            if(aWon){a.wins++;a.rf+=cr.score.my;a.ra+=cr.score.opp;b.losses++;b.rf+=cr.score.opp;b.ra+=cr.score.my;}
            else if(cdrew){a.draws++;a.rf+=cr.score.my;a.ra+=cr.score.opp;b.draws++;b.rf+=cr.score.opp;b.ra+=cr.score.my;}
            else{b.wins++;b.rf+=cr.score.opp;b.ra+=cr.score.my;a.losses++;a.rf+=cr.score.my;a.ra+=cr.score.opp;}
            Object.assign(a,applyPopularityDelta(a,aWon,cdrew));Object.assign(b,applyPopularityDelta(b,!aWon&&!cdrew,cdrew));
            const aRevT=calcRevenue(a);a.budget=(a.budget??0)+aRevT.ticket+aRevT.sponsor+aRevT.merch;a.revenueThisSeason=(a.revenueThisSeason??0)+aRevT.ticket+aRevT.sponsor+aRevT.merch;
            const bRevT=calcRevenue(b);b.budget=(b.budget??0)+bRevT.ticket+bRevT.sponsor+bRevT.merch;b.revenueThisSeason=(b.revenueThisSeason??0)+bRevT.ticket+bRevT.sponsor+bRevT.merch;
            a.players=applyGameStatsFromLog(a.players,cr.log||[],true,aWon, gameDay);
            a.players=applyPostGameCondition(a.players,cr.log||[],true,gameDay);
            a.players=tickInjuries(a.players);
            const aInj=checkForInjuries(a.players,year);
            a.players=applyInjuriesToPlayers(a.players,aInj,year);
            b.players=applyGameStatsFromLog(b.players,cr.log||[],false,!aWon&&!cdrew, gameDay);
            b.players=applyPostGameCondition(b.players,cr.log||[],false,gameDay);
            b.players=tickInjuries(b.players);
            const bInj=checkForInjuries(b.players,year);
            b.players=applyInjuriesToPlayers(b.players,bInj,year);
          }
          return newTeams;
        });
        setAllTeamResultsMap(prev=>{
          const next={...prev};
          const recordGame=(homeId,awayId,cr,hPlayers,aPlayers,oppHName,oppAName)=>{
            const bs=computeBoxScore(cr.log||[],cr.inningSummary||[],hPlayers,aPlayers,cr.score.my,cr.score.opp);
            const hWon=cr.won; const gameDrew=cr.score.my===cr.score.opp;
            next[homeId]={...(next[homeId]||{}),[gameDay]:{won:hWon,drew:gameDrew,myScore:cr.score.my,oppScore:cr.score.opp,oppName:oppAName,oppId:awayId,homeId,awayId,...(bs||{})}};
            next[awayId]={...(next[awayId]||{}),[gameDay]:{won:!hWon&&!gameDrew,drew:gameDrew,myScore:cr.score.opp,oppScore:cr.score.my,oppName:oppHName,oppId:homeId,homeId,awayId,inningScores:bs?.inningScores,myBatting:bs?.awayBatting,oppBatting:bs?.homeBatting,myPitching:bs?.awayPitching,oppPitching:bs?.homePitching}};
          };
          for(const{matchup,cr,homeTeam,awayTeam}of tCpuSimResults){
            recordGame(matchup.homeId,matchup.awayId,cr,homeTeam.players,awayTeam.players,homeTeam.name,awayTeam.name);
          }
          recordGame(myId,_tOppId,gsResult,myTeam.players,currentOpp.players,myTeam.name,currentOpp.name);
          return next;
        });
        const _tmpl=won?NEWS_TEMPLATES_WIN:NEWS_TEMPLATES_LOSE;
        const _scoreStr=gsResult.score.my+"-"+gsResult.score.opp;
        const _hl=_tmpl[rng(0,_tmpl.length-1)].replace("{team}",myTeam?.name||"自チーム").replace("{opp}",currentOpp?.name||"相手").replace("{score}",_scoreStr);
        addNews({type:"game",headline:_hl,source:"スポーツ速報",dateLabel:`${year}年 ${gameDay}日目`,body:(won?`${myTeam?.name}が${currentOpp?.name}に${_scoreStr}で勝利しました。`:`${myTeam?.name}は${currentOpp?.name}に${_scoreStr}で敗れました。`)});
        if(Math.random()<0.35){
          const _qs=won?INTERVIEW_QUESTIONS_WIN:INTERVIEW_QUESTIONS_LOSE;
          const _opts=won?INTERVIEW_OPTIONS_WIN:INTERVIEW_OPTIONS_LOSE;
          addNews({type:"interview",headline:`インタビュー ${myTeam?.name||""} 試合後`,source:"記者会見",dateLabel:`${year}年 ${gameDay}日目`,body:"試合後のコメントです。",question:_qs[rng(0,_qs.length-1)],options:_opts});
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
              headline: `CPUトレード ${newsItem.sellerName} -> ${newsItem.buyerName}`,
              fromTeam: newsItem.sellerName,
              toTeam: newsItem.buyerName,
              playersIn: [newsItem.buyerGetsName],
              playersOut: [newsItem.sellerGetsName],
              detail: newsItem.body,
            });
          }
        }
        pushResult(won,drew,currentOpp?.name||"",gsResult.score.my,gsResult.score.opp,gameDay);
        gs.pushGameResult(gameDay,{won,drew,oppName:currentOpp?.name||"",myScore:gsResult.score.my,oppScore:gsResult.score.opp,log:gsResult.log||[],inningSummary:gsResult.inningSummary||[],oppTeam:currentOpp});
        setGameDay(d=>d+1);
        if(!allStarDone && gameDay+1===allStarTriggerDay){
          const rosters=selectAllStars(teams);
          const asResult=runAllStarGame(rosters, year);
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
      } finally {
        setGameResult(prev => prev ? { ...prev, isPostGameProcessing: false } : prev);
      }
    });
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

