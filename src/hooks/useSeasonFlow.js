import { useState, useRef, useEffect } from "react";
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
import { saveGame } from '../engine/saveload';
import { processCpuFaBids } from '../engine/contract';
import { SEASON_GAMES, BATCH, NEWS_TEMPLATES_WIN, NEWS_TEMPLATES_LOSE, INTERVIEW_QUESTIONS_WIN, INTERVIEW_QUESTIONS_LOSE, INTERVIEW_OPTIONS_WIN, INTERVIEW_OPTIONS_LOSE, INJURY_AUTO_DEMOTE_DAYS, REGISTRATION_COOLDOWN_DAYS, TRADE_DEADLINE_MONTH, TRADE_DEADLINE_PROB_EARLY, TRADE_DEADLINE_PROB_PEAK, TRADE_DEADLINE_CPU_CPU_PROB, INJURY_HISTORY_MAX, MAX_ROSTER, MAX_外国人_一軍, CPU_AUTO_MANAGE_INTERVAL, ROSTER_SWAP_SCORE_THRESHOLD, ROSTER_DEVREC_BONUS, ROSTER_DEVREC_POTENTIAL_MIN, ROSTER_DEVREC_DAYS_MAX, FIELDING_POSITIONS, OPTIMAL_PITCHER_COUNT } from '../constants';
import { saberBatter, saberPitcher } from '../engine/sabermetrics';

// 守備コーチボーナス: 怪我回復速度 UP
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

// 登録クールダウンを1日デクリメント
function tickCooldowns(players) {
  return players.map(p=>{const cd=p.registrationCooldownDays??0;if(!cd)return p;return{...p,registrationCooldownDays:Math.max(0,cd-1)};});
}

// 怪我日数 > INJURY_AUTO_DEMOTE_DAYS の一軍選手を自動二軍降格し、クールダウンをセット
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

// ─── CPU チーム自動編成 ───────────────────────────────────────────────────────
// スコア関数（RosterTab の rosterRecScore と同じロジック）
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

// CPU チームのロスター全体を自動最適化して更新したチームオブジェクトを返す
function cpuAutoManageTeam(team) {
  const farm = team.farm ?? [];
  const foreignInActive = team.players.filter(p => p.isForeign).length;
  const canPromote = (p) => !p.育成 && !p.isIkusei && (p.injuryDaysLeft ?? 0) === 0 && (p.registrationCooldownDays ?? 0) === 0 && !(p.isForeign && foreignInActive >= MAX_外国人_一軍);
  let players = [...team.players];
  let newFarm = [...farm];

  const effScore = (p, isFarm) => {
    const base = _cpuRosterRecScore(p);
    const devBonus = isFarm && (p.potential ?? 0) >= ROSTER_DEVREC_POTENTIAL_MIN && (p.daysOnActiveRoster ?? 0) < ROSTER_DEVREC_DAYS_MAX ? ROSTER_DEVREC_BONUS : 0;
    return base + devBonus;
  };

  // ── 1. ロスター入れ替え（降格・昇格・スワップ） ──
  const TARGET_BATTERS = MAX_ROSTER - OPTIMAL_PITCHER_COUNT;
  const openSlots = MAX_ROSTER - players.length;
  if (openSlots < 0) {
    // 超過分: 超過種別（投手>13 or 野手>15）から優先降格、残りは全体最下位から
    const excess = -openSlots;
    const pitcherOver = Math.max(0, players.filter(p => p.isPitcher).length - OPTIMAL_PITCHER_COUNT);
    const batterOver = Math.max(0, players.filter(p => !p.isPitcher).length - TARGET_BATTERS);
    const demoted = new Set();
    const applyDemote = (candidates, limit) => {
      [...candidates].sort((a, b) => effScore(a, false) - effScore(b, false)).slice(0, limit).forEach(p => {
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
    let slotsLeft = Math.min(openSlots, 3); // CPU は1回最大3人まで変更

    // 投手枠を優先昇格（目標OPTIMAL_PITCHER_COUNTまで）
    const pitcherNeed = Math.max(0, OPTIMAL_PITCHER_COUNT - players.filter(p => p.isPitcher).length);
    eligP.slice(0, Math.min(pitcherNeed, slotsLeft)).forEach(p => { players.push(p); usedFarmIds.add(p.id); slotsLeft--; });

    // 野手枠を優先昇格（目標TARGET_BATTERSまで）
    const batterNeed = Math.max(0, TARGET_BATTERS - players.filter(p => !p.isPitcher).length);
    eligB.slice(0, Math.min(batterNeed, slotsLeft)).forEach(p => { players.push(p); usedFarmIds.add(p.id); slotsLeft--; });

    // 残り枠は最高スコア順
    if (slotsLeft > 0) {
      eligibleFarm.filter(p => !usedFarmIds.has(p.id)).sort((a, b) => effScore(b, true) - effScore(a, true))
        .slice(0, slotsLeft).forEach(p => { players.push(p); usedFarmIds.add(p.id); });
    }

    // クロス種別バランス調整: 投手不足なら最弱野手↔最強farm投手、野手不足なら最弱投手↔最強farm野手
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

    // スワップ（有力二軍 vs 一軍下位・同種別）
    const remainFarm = newFarm.filter(fp => canPromote(fp) && !usedFarmIds.has(fp.id));
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

    // 昇格実行: farm から除去（クロス種別分含む）
    [...usedFarmIds].forEach(id => { newFarm = newFarm.filter(fp => fp.id !== id); });
  }

  // ── 1.5 先発ローテ確保: 1軍先発が6人未満なら farm 先発を優先昇格 ──
  // 空き枠があればそのまま昇格、なければ最弱の非先発投手と入れ替え（最低5人・目標6人）
  {
    const TARGET_ROT = 6;
    const farmSP = newFarm
      .filter(p => p.isPitcher && p.subtype === '先発' && canPromote(p))
      .sort((a, b) => effScore(b, true) - effScore(a, true));
    for (const sp of farmSP) {
      const curSP = players.filter(p => p.isPitcher && p.subtype === '先発' && !p.isIkusei && (p.injuryDaysLeft ?? 0) === 0).length;
      if (curSP >= TARGET_ROT) break;
      if (players.length < MAX_ROSTER) {
        players = [...players, sp];
        newFarm = newFarm.filter(p => p.id !== sp.id);
      } else {
        const weakRP = players
          .filter(p => p.isPitcher && p.subtype !== '先発' && !p.isIkusei)
          .sort((a, b) => effScore(a, false) - effScore(b, false))[0];
        if (!weakRP) break;
        players = [...players.filter(p => p.id !== weakRP.id), sp];
        newFarm = [...newFarm.filter(p => p.id !== sp.id), { ...weakRP, registrationCooldownDays: REGISTRATION_COOLDOWN_DAYS }];
      }
    }
  }

  // ── 2. 打順自動設定（MRV ヒューリスティック） ──
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

  // ── 3. 投手ローテ・継投自動設定 ──
  const pitchers = players.filter(p => p.isPitcher && !p.isIkusei && (p.injuryDaysLeft ?? 0) === 0);
  const starters = pitchers.filter(p => p.subtype === '先発').sort((a, b) => _cpuStarterScore(b) - _cpuStarterScore(a));
  const relievers = pitchers.filter(p => p.subtype !== '先発').sort((a, b) => _cpuRelieverScore(b) - _cpuRelieverScore(a));
  const MIN_ROT = 5;
  const newRotation = starters.slice(0, 6).map(p => p.id);
  // 先発タイプが足りない場合は、スタミナ上位の中継ぎで最低5枠を埋める
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
    setMailbox, setRetireModal,
    faPool, setFaPool, faYears, seasonHistory, news, mailbox,
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
  const pendingPlayoffRef = useRef(false);

  const prevMyPlayersRef = useRef(null);
  const prevMyFarmRef = useRef(null);

  // 最終戦終了後: 全setState（対戦相手記録・CPU試合）が反映された teams でプレーオフ初期化
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

  // 自動降格・回復通知: myTeam の players/farm 変化を検知して通知
  useEffect(()=>{
    if(!myTeam||!myId) return;
    const prevPlayers=prevMyPlayersRef.current;
    const prevFarm=prevMyFarmRef.current;
    if(prevPlayers!==null){
      const prevPlayerIds=new Set(prevPlayers.map(p=>p.id));
      // 一軍から二軍に移動 かつ 怪我あり → 自動降格通知
      const newlyDemotedInj=myTeam.farm.filter(p=>prevPlayerIds.has(p.id)&&!myTeam.players.find(x=>x.id===p.id)&&(p.injuryDaysLeft??0)>0);
      if(newlyDemotedInj.length>0){
        const names=newlyDemotedInj.map(p=>`${p.name}（残${p.injuryDaysLeft}試合）`).join('、');
        notify(`🤕 ${names}が怪我で自動二軍降格`,'warn');
      }
    }
    if(prevFarm!==null){
      const prevIneligibleIds=new Set(prevFarm.filter(p=>!p.育成&&((p.injuryDaysLeft??0)>0||(p.registrationCooldownDays??0)>0)).map(p=>p.id));
      const newlyEligible=myTeam.farm.filter(p=>!p.育成&&prevIneligibleIds.has(p.id)&&(p.injuryDaysLeft??0)===0&&(p.registrationCooldownDays??0)===0);
      if(newlyEligible.length>0){
        const names=newlyEligible.map(p=>p.name).join('、');
        notify(`✅ ${names}が回復！一軍昇格可能`,'ok');
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
        body:`${offer.from.name}より交渉の申し入れがありました。\n\n■ あなたが出す: ${offer.want.map(p=>p.name).join('、')}\n■ 受け取る: ${offer.offer.length>0?offer.offer.map(p=>p.name).join('、'):'なし'}${offer.cash>0?'\n■ 金銭: +'+(offer.cash/10000).toLocaleString()+'万円':''}\n\n期限内にご検討ください。`,
        offer
      };
      setMailbox(prev=>[...prev,mail]);
      notify(offer.from.name+'からトレードオファーが届きました！','ok');
    }
  };

  /**
   * 7月のバッチシム中にCPU vs CPU デッドライントレードを試みる。
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
      headline: `【移籍情報】${buyerGets.name}が${buyerName}へ`,
      body: `${sellerName}と${buyerName}の間でトレードが成立。${buyerName}は${buyerGets.name}を獲得し、${sellerGets.name}を放出した。`,
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
      body: `${offer.from.name}より交渉の申し入れがありました。\n\n■ あなたが出す: ${offer.want.map(p => p.name).join('、')}\n■ 受け取る: ${offer.offer.length > 0 ? offer.offer.map(p => p.name).join('、') : 'なし'}${offer.cash > 0 ? '\n■ 金銭: +' + (offer.cash / 10000).toLocaleString() + '万円' : ''}\n\n期限内にご検討ください。`,
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

  // スケジュールから対戦相手を取得（フォールバック: ランダム同リーグ選択）
  const applyAllStarSelections = (baseTeams, rosters) => {
    const pickedIds = new Set([...(rosters?.ce || []), ...(rosters?.pa || [])].map(p => p.id));
    return baseTeams.map(t => ({
      ...t,
      players: (t.players || []).map(p => pickedIds.has(p.id)
        ? { ...p, allStarSelections: (p.allStarSelections || 0) + 1 }
        : p),
    }));
  };

  const publishAllStarNews = (asResult, dayLabel) => {
    if (!asResult) return;
    addNews({
      type: 'allstar',
      headline: `【オールスター第1戦】セ${asResult.game1.score.ce} - パ${asResult.game1.score.pa}`,
      source: 'NPB公式',
      dateLabel: `${year}年 ${dayLabel}日目`,
      body: `開催球場: ${asResult.venue}
セ・リーグ選抜 ${asResult.game1.score.ce} - ${asResult.game1.score.pa} パ・リーグ選抜。MVP: ${asResult.game1.mvp?.name || '未選出'}。`,
    });
    addNews({
      type: 'allstar',
      headline: `【オールスター第2戦】セ${asResult.game2.score.ce} - パ${asResult.game2.score.pa}`,
      source: 'NPB公式',
      dateLabel: `${year}年 ${dayLabel + 1}日目`,
      body: `セ・リーグ選抜 ${asResult.game2.score.ce} - ${asResult.game2.score.pa} パ・リーグ選抜。MVP: ${asResult.game2.mvp?.name || '未選出'}。`,
    });
  };

  // ポジション優先順（不足時の自動補完に使用）
  const POSITION_FILL_ORDER = ['C','SS','2B','3B','1B','LF','CF','RF','DH'];

  // CPU チーム用ラインナップ構築（自動補完・外国人枠トリム付き）
  const buildSimLineup = (team, useDh) => {
    const limit = useDh ? 9 : 8;
    const nonPitchers = (team.players || []).filter(p => !p.isPitcher && !p.isIkusei);
    const nonPitcherIds = new Set(nonPitchers.map(p => p.id));
    const source = useDh ? (team.lineupDh || team.lineup || []) : (team.lineupNoDh || team.lineup || []);

    // 既存ラインナップから有効な非投手のみ
    let lineup = source.filter(id => nonPitcherIds.has(id));

    // 外国人選手枠トリム（4人以内）
    let foreignCount = 0;
    lineup = lineup.filter(id => {
      const p = nonPitchers.find(x => x.id === id);
      if (p?.isForeign) { if (foreignCount < MAX_外国人_一軍) { foreignCount++; return true; } return false; }
      return true;
    });

    // 不足分を自動補完（ポジション優先で並べる）
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
        if (p.isForeign && foreignCount >= MAX_外国人_一軍) continue;
        if (p.isForeign) foreignCount++;
        lineup.push(p.id);
      }
    }

    return lineup.slice(0, limit);
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

    // ── 試合前バリデーション ──
    const useDh = isHome ? !!myTeam.dhEnabled : !!opp.dhEnabled;
    const neededBatters = useDh ? 9 : 8;
    const activeCount = myTeam.players.filter(p => !p.isIkusei).length;
    if (activeCount > MAX_ROSTER) {
      setPregameError({ message: `一軍登録人数が上限（${MAX_ROSTER}人）を超えています（現在 ${activeCount} 人）。ロースターを調整してから試合を開始してください。` });
      return;
    }
    const myNonPitchers = myTeam.players.filter(p => !p.isPitcher && !p.isIkusei);
    const myNonPitcherIds = new Set(myNonPitchers.map(p => p.id));
    const lineupSrc = useDh ? (myTeam.lineupDh || myTeam.lineup || []) : (myTeam.lineupNoDh || myTeam.lineup || []);
    const myLineup = lineupSrc.filter(id => myNonPitcherIds.has(id));
    if (myLineup.length < neededBatters) {
      setPregameError({ message: `打順の設定が不足しています（必要: ${neededBatters}人 / 現在: ${myLineup.length}人）。ロースタータブで打順を設定してください。` });
      return;
    }
    const foreignInLineup = myLineup.filter(id => myNonPitchers.find(p => p.id === id)?.isForeign).length;
    if (foreignInLineup > MAX_外国人_一軍) {
      setPregameError({ message: `打順内の外国人選手が上限（${MAX_外国人_一軍}人）を超えています（現在 ${foreignInLineup} 人）。ロースタータブで打順を修正してください。` });
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

  // Mode selected → start appropriate game type
  const handleModeSelect = mode => {
    setGameMode(mode);
    if(mode==="tactical"){
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
      updated.players=applyGameStatsFromLog(updated.players, r.log||[], true, won);
      updated.players=applyPostGameCondition(updated.players, r.log||[], true, gameDay);
      updated.players=tickInjuries(updated.players);
      updated.players=tickPositionTraining(updated.players);
      updated.players=updated.players.map(p=>({...p,daysOnActiveRoster:(p.daysOnActiveRoster??0)+1}));
      updated.players=applyDefenseCoachRecovery(updated.players,t.coaches);
      const newInj=checkForInjuries(updated.players, year);
      if(newInj.length>0){
        const injNames=newInj.reduce((acc,i)=>{const p=updated.players.find(x=>x.id===i.id);if(p)acc.push({name:p.name,...i});return acc;},[]);
        updated.players=applyInjuriesToPlayers(updated.players, newInj, year);
        injNames.filter(i=>i.days>=7).forEach(i=>{addNews({type:"season",headline:`🤕 【怪我】${i.name}が負傷`,source:"チーム広報",dateLabel:`${year}年 ${gameDay}日目`,body:`${i.name}が${i.type}により${i.days}試合の戦線離脱が見込まれる。チームはロスター調整を余儀なくされる。`});});
      }
      // 登録クールダウンデクリメント
      updated.players=tickCooldowns(updated.players);
      // 二軍: 怪我回復 + クールダウンデクリメント
      updated.farm=tickInjuries(updated.farm??[]);
      updated.farm=tickCooldowns(updated.farm??[]);
      // 怪我日数 > 10日の一軍選手を自動二軍降格
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
      updated.players=applyGameStatsFromLog(updated.players,r.log||[],false,!won&&!drew);
      updated.players=applyPostGameCondition(updated.players,r.log||[],false,gameDay);
      updated.players=tickInjuries(updated.players);
      const newInj=checkForInjuries(updated.players, year);
      updated.players=applyInjuriesToPlayers(updated.players, newInj, year);
      Object.assign(updated,applyPopularityDelta(t,!won&&!drew,drew));
      return updated;
    });
    // Simulate remaining CPU vs CPU games for this day (schedule-based matchups)
    // CPU チームはまだ upd() の影響を受けていないため teams を直接参照して OK
    const _oppId=currentOpp.id;
    const _cpuMatchups=getCpuMatchups(schedule,gameDay,myId,_oppId);
    const _fallbackOthers=teams.filter(t=>t.id!==myId&&t.id!==_oppId);
    const matchupList=_cpuMatchups.length>0
      ?_cpuMatchups
      :(()=>{const pairs=[];for(let i=0;i<_fallbackOthers.length-1;i+=2)pairs.push({homeId:_fallbackOthers[i].id,awayId:_fallbackOthers[i+1].id});return pairs;})();

    // シム実行（setTeams 外）→ 結果をまとめてから state を更新
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
        a.players=applyGameStatsFromLog(a.players,cr.log||[],true,aWon);
        a.players=applyPostGameCondition(a.players,cr.log||[],true,gameDay);
        a.players=tickInjuries(a.players);
        const aInj=checkForInjuries(a.players,year);
        a.players=applyInjuriesToPlayers(a.players,aInj,year);
        b.players=applyGameStatsFromLog(b.players,cr.log||[],false,!aWon&&!cdrew);
        b.players=applyPostGameCondition(b.players,cr.log||[],false,gameDay);
        b.players=tickInjuries(b.players);
        const bInj=checkForInjuries(b.players,year);
        b.players=applyInjuriesToPlayers(b.players,bInj,year);
      }
      return newTeams;
    });
    // allTeamResultsMap に CPU ゲーム + 自チームゲームのボックススコアを一括記録
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
      // 自チームの試合（myTeam が home）
      recordGame(myId,_oppId,r,myTeam.players,currentOpp.players,myTeam.name,currentOpp.name);
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
          headline: `【CPU間トレード】${newsItem.sellerName} ↔ ${newsItem.buyerName}`,
          fromTeam: newsItem.sellerName,
          toTeam: newsItem.buyerName,
          playersIn: [newsItem.buyerGetsName],
          playersOut: [newsItem.sellerGetsName],
          detail: newsItem.body,
        });
      }
    }
    // 引退表明ランダム発生
    if(Math.random()<0.04&&myTeam){
      const cands=myTeam.players.filter(p=>p.age>=35&&!p._retireNow&&calcRetireWill(p)>=40);
      if(cands.length>0){
        const rp=cands[rng(0,cands.length-1)];
        setRetireModal({player:rp,type:"announce"});
        addNews({type:"season",headline:"【引退表明】"+rp.name+"選手が今季限りでの引退を示唆",source:"スポーツ報知",dateLabel:year+"年 "+gameDay+"日目",body:rp.name+"選手（"+rp.age+"歳）が引退を示唆するコメントを発表した。チーム関係者は今後の対応を検討している。"});
      }
    }
    const _tmpl=won?NEWS_TEMPLATES_WIN:NEWS_TEMPLATES_LOSE;
    const _scoreStr=r.score.my+"-"+r.score.opp;
    const _hl=_tmpl[rng(0,_tmpl.length-1)].replace("{team}",myTeam?.name||"自チーム").replace("{opp}",currentOpp?.name||"相手").replace("{score}",_scoreStr);
    addNews({type:"game",headline:_hl,source:"スポーツ報知",dateLabel:year+"年 "+gameDay+"日目",body:(won?myTeam?.name+"が"+currentOpp?.name+"に"+_scoreStr+"で勝利した。\n\n投打ともに噛み合い、理想的な試合運びで勝点を積み上げた。":myTeam?.name+"は"+currentOpp?.name+"に"+_scoreStr+"で敗れた。\n\n流れを引き戻せず、次戦での巻き返しが期待される。")});
    if(Math.random()<0.35){
      const _qs=won?INTERVIEW_QUESTIONS_WIN:INTERVIEW_QUESTIONS_LOSE;
      const _opts=won?INTERVIEW_OPTIONS_WIN:INTERVIEW_OPTIONS_LOSE;
      addNews({type:"interview",headline:"【インタビュー】"+(myTeam?.name||"")+"監督に直撃！",source:"野球速報",dateLabel:year+"年 "+gameDay+"日目",body:"試合後、記者団が監督にコメントを求めた。",question:_qs[rng(0,_qs.length-1)],options:_opts});
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
      // 全setState反映後の teams でinitPlayoffを呼ぶためuseEffectに委譲
      pendingPlayoffRef.current=true;
    }
    else setScreen("result");
  };

  // 任意試合数まとめてオートシム
  const handleBatchSim = (count, autoManageMyTeam=false) => {
    if(!myTeam) return;
    const actual=Math.min(count ?? BATCH, SEASON_GAMES-(gameDay-1));
    if(actual<=0) return;
    runBatchGames(actual, autoManageMyTeam);
  };

  // 残り全試合まとめてオートシム
  const handleSeasonSim = (autoManageMyTeam=false) => {
    if(!myTeam) return;
    const count=SEASON_GAMES-(gameDay-1);
    if(count<=0) return;
    runBatchGames(count, autoManageMyTeam);
  };

  // リーグ内順位を計算（batchMeta用）
  const calcLeagueRank = (teamId, allTeams, league) => {
    const same = [...allTeams.filter(t => t.league === league)]
      .sort((a, b) => {
        const pa = a.wins / Math.max(1, a.wins + a.losses);
        const pb = b.wins / Math.max(1, b.wins + b.losses);
        return pb - pa || (b.rf - b.ra) - (a.rf - a.ra);
      });
    return same.findIndex(t => t.id === teamId) + 1;
  };

  // バッチ処理の共通ロジック
  const runBatchGames = (count, autoManageMyTeam=false) => {
    if(!myTeam) return;
    let newTeams=[...teams.map(t=>({...t,players:[...t.players.map(p=>({...p,stats:{...p.stats}}))],...(t.id===myId?{}:{})}))];
    const results=[];
    let newDay=gameDay;
    let allStarDoneLocal=allStarDone;
    let newFaPool=[...faPool];
    const pendingTradeCountBase=mailbox.filter(m=>m.type==='trade'&&!m.resolved).length;
    const batchTradeMails=[];
    const batchForeignSignNews=[];
    const batchForeignSignings=[];

    // バッチ前の順位・成績スナップショット
    const beforeRank = calcLeagueRank(myId, newTeams, myTeam.league);
    const beforeRecord = { w: myTeam.wins, l: myTeam.losses, d: myTeam.draws ?? 0 };
    // バッチ中に集積するメタデータ
    const batchInjuries = [];
    const cpuHighlights = [];
    const batchNewsItems = []; // 試合結果ニュース
    const batchBoxScores = []; // { homeId, awayId, dayNo, cr, homePlayers, awayPlayers, homeName, awayName }

    for(let g=0;g<count;g++){
      // CPU_AUTO_MANAGE_INTERVAL 日ごとに全球団のロスター・打順・ローテを最適化
      // autoManageMyTeam=true の場合は自チームも対象に含める
      if(newDay % CPU_AUTO_MANAGE_INTERVAL === 0){
        newTeams=newTeams.map(t=>(t.id===myId && !autoManageMyTeam)?t:cpuAutoManageTeam(t));
      }

      const scheduleMatchup=getMyMatchup(schedule,newDay,myId);
      const oppId=scheduleMatchup?.oppId;
      const opp=scheduleMatchup ? newTeams.find(t=>t.id===scheduleMatchup.oppId) : null;
      const cpuPairs=getCpuMatchups(schedule,newDay,myId,oppId);
      for(const cpuMatchup of cpuPairs){
        const a=newTeams.find(t=>t.id===cpuMatchup.homeId);
        const b=newTeams.find(t=>t.id===cpuMatchup.awayId);
        if(!a||!b) continue;
        const useDh = !!a.dhEnabled;
        const aPlayersSnap=[...a.players]; const bPlayersSnap=[...b.players]; // 名前解決用スナップショット
        const cr=quickSimGame(applyDhToTeam(a, useDh),applyDhToTeam(b, useDh));
        batchBoxScores.push({homeId:a.id,awayId:b.id,dayNo:newDay,cr,homePlayers:aPlayersSnap,awayPlayers:bPlayersSnap,homeName:a.name,awayName:b.name});
        const cdrew=cr.score.my===cr.score.opp;
        const aWon=cr.won;
        // 注目CPU試合を収集（大差 or 接戦）
        {
          const margin=Math.abs(cr.score.my-cr.score.opp);
          if(!cdrew&&(margin>=4||margin<=1)&&cpuHighlights.length<8){
            const label=margin>=4?"大勝":"接戦";
            cpuHighlights.push({
              homeTeam:{short:a.short,emoji:a.emoji,color:a.color},
              awayTeam:{short:b.short,emoji:b.emoji,color:b.color},
              homeScore:cr.score.my,awayScore:cr.score.opp,
              homeWon:aWon,label
            });
          }
        }
        if(aWon){a.wins++;a.rf+=cr.score.my;a.ra+=cr.score.opp;b.losses++;b.rf+=cr.score.opp;b.ra+=cr.score.my;}
        else if(cdrew){a.draws++;a.rf+=cr.score.my;a.ra+=cr.score.opp;b.draws++;b.rf+=cr.score.opp;b.ra+=cr.score.my;}
        else{b.wins++;b.rf+=cr.score.opp;b.ra+=cr.score.my;a.losses++;a.rf+=cr.score.my;a.ra+=cr.score.opp;}
        Object.assign(a,applyPopularityDelta(a,aWon,cdrew));Object.assign(b,applyPopularityDelta(b,!aWon&&!cdrew,cdrew));
        const aRevB=calcRevenue(a);a.budget=(a.budget??0)+aRevB.ticket+aRevB.sponsor+aRevB.merch;a.revenueThisSeason=(a.revenueThisSeason??0)+aRevB.ticket+aRevB.sponsor+aRevB.merch;
        const bRevB=calcRevenue(b);b.budget=(b.budget??0)+bRevB.ticket+bRevB.sponsor+bRevB.merch;b.revenueThisSeason=(b.revenueThisSeason??0)+bRevB.ticket+bRevB.sponsor+bRevB.merch;
        a.players=applyGameStatsFromLog(a.players,cr.log||[],true,aWon);
        a.players=applyPostGameCondition(a.players,cr.log||[],true,newDay);
        a.players=tickInjuries(a.players);
        a.players=a.players.map(p=>({...p,daysOnActiveRoster:(p.daysOnActiveRoster??0)+1}));
        const aInj=checkForInjuries(a.players, year);
        a.players=applyInjuriesToPlayers(a.players, aInj, year);
        b.players=applyGameStatsFromLog(b.players,cr.log||[],false,!aWon&&!cdrew);
        b.players=applyPostGameCondition(b.players,cr.log||[],false,newDay);
        b.players=tickInjuries(b.players);
        b.players=b.players.map(p=>({...p,daysOnActiveRoster:(p.daysOnActiveRoster??0)+1}));
        const bInj=checkForInjuries(b.players, year);
        b.players=applyInjuriesToPlayers(b.players, bInj, year);
        a.rotIdx=(a.rotIdx||0)+1;
        b.rotIdx=(b.rotIdx||0)+1;
      }
      const cpuCpuTradeNews = tryCpuCpuDeadlineTrade(newTeams, newDay);
      if (cpuCpuTradeNews) {
        results.push({ type: 'trade_news', ...cpuCpuTradeNews, day: newDay });
      }
      const tradeMail = tryGenerateCpuOfferInBatch(newTeams, newDay, pendingTradeCountBase + batchTradeMails.length);
      if (tradeMail) {
        batchTradeMails.push(tradeMail);
      }
      const foreignFaResult = tryCpuForeignFaInBatch(newTeams, newDay, newFaPool);
      newTeams = foreignFaResult.updatedTeams;
      newFaPool = foreignFaResult.remainingFaPool;
      if (foreignFaResult.news?.length) {
        batchForeignSignNews.push(...foreignFaResult.news);
      }
      if (foreignFaResult.claimed?.length) {
        batchForeignSignings.push(...foreignFaResult.claimed);
      }
      const myT=newTeams.find(t=>t.id===myId);
      if(scheduleMatchup && opp && myT){
        const useDh = scheduleMatchup.isHome ? !!myT.dhEnabled : !!opp.dhEnabled;
        const myTPlayersSnap=[...myT.players]; const oppPlayersSnap=[...opp.players];
        const r=quickSimGame(applyDhToTeam(myT, useDh),applyDhToTeam(opp, useDh));
        batchBoxScores.push({homeId:myT.id,awayId:opp.id,dayNo:newDay,cr:r,homePlayers:myTPlayersSnap,awayPlayers:oppPlayersSnap,homeName:myT.name,awayName:opp.name});
        const won=r.score.my>r.score.opp;
        const drew=r.score.my===r.score.opp;
        if(won){myT.wins++;myT.rf+=r.score.my;myT.ra+=r.score.opp;}
        else if(drew){myT.draws++;myT.rf+=r.score.my;myT.ra+=r.score.opp;}
        else{myT.losses++;myT.rf+=r.score.my;myT.ra+=r.score.opp;}
        Object.assign(myT,applyPopularityDelta(myT,won,drew));
        myT.rotIdx++;
        myT.players=applyGameStatsFromLog(myT.players, r.log||[], true, won);
        myT.players=applyPostGameCondition(myT.players, r.log||[], true, newDay);
        myT.players=tickInjuries(myT.players);
        myT.players=tickPositionTraining(myT.players);
        myT.players=myT.players.map(p=>({...p,daysOnActiveRoster:(p.daysOnActiveRoster??0)+1}));
        myT.players=applyDefenseCoachRecovery(myT.players,myT.coaches);
        const _inj=checkForInjuries(myT.players, year);
        // 新規負傷選手をバッチメタに収集
        if(_inj.length>0){
          _inj.forEach(inj=>{
            const p=myT.players.find(pl=>pl.id===inj.id);
            if(p) batchInjuries.push({name:p.name,pos:p.pos,type:inj.type,days:inj.days,part:inj.part});
          });
        }
        myT.players=applyInjuriesToPlayers(myT.players, _inj, year);
        // 登録クールダウンデクリメント
        myT.players=tickCooldowns(myT.players);
        // 二軍: 怪我回復 + クールダウンデクリメント
        myT.farm=tickInjuries(myT.farm??[]);
        myT.farm=tickCooldowns(myT.farm??[]);
        // 怪我日数 > 10日の一軍選手を自動二軍降格（インライン: myT参照を維持）
        {const farm=myT.farm??[];const demotedB=[];const keptB=[];for(const p of myT.players){if((p.injuryDaysLeft??0)>INJURY_AUTO_DEMOTE_DAYS){demotedB.push({...p,registrationCooldownDays:REGISTRATION_COOLDOWN_DAYS});}else{keptB.push(p);}}if(demotedB.length>0){const dIds=new Set(demotedB.map(p=>p.id));myT.players=keptB;myT.farm=[...farm,...demotedB];myT.lineup=(myT.lineup??[]).filter(id=>!dIds.has(id));myT.lineupNoDh=(myT.lineupNoDh??[]).filter(id=>!dIds.has(id));myT.lineupDh=(myT.lineupDh??[]).filter(id=>!dIds.has(id));myT.rotation=(myT.rotation??[]).filter(id=>!dIds.has(id));}}
        const oppT=newTeams.find(t=>t.id===opp.id);
        if(oppT){
          if(won){oppT.losses++;oppT.rf+=r.score.opp;oppT.ra+=r.score.my;}
          else if(drew){oppT.draws++;oppT.rf+=r.score.opp;oppT.ra+=r.score.my;}
          else{oppT.wins++;oppT.rf+=r.score.opp;oppT.ra+=r.score.my;}
          Object.assign(oppT,applyPopularityDelta(oppT,!won&&!drew,drew));
          oppT.players=applyGameStatsFromLog(oppT.players,r.log||[],false,!won&&!drew);
          oppT.players=applyPostGameCondition(oppT.players,r.log||[],false,newDay);
          oppT.players=tickInjuries(oppT.players);
          const oppInj=checkForInjuries(oppT.players, year);
          oppT.players=applyInjuriesToPlayers(oppT.players, oppInj, year);
          oppT.rotIdx=(oppT.rotIdx||0)+1;
        }
        const rev=calcRevenue(myT);
        const revTotal=rev.ticket+rev.sponsor+rev.merch;
        myT.budget+=revTotal;
        myT.revenueThisSeason=(myT.revenueThisSeason??0)+revTotal;
        results.push({...r,won,oppTeam:opp,gameNo:newDay});
        // バッチ試合ごとに試合結果ニュースを生成
        {
          const _tmpl=won?NEWS_TEMPLATES_WIN:NEWS_TEMPLATES_LOSE;
          const _scoreStr=r.score.my+"-"+r.score.opp;
          const myTName=newTeams.find(t=>t.id===myId)?.name||"自チーム";
          const _hl=_tmpl[rng(0,_tmpl.length-1)].replace("{team}",myTName).replace("{opp}",opp.name||"相手").replace("{score}",_scoreStr);
          batchNewsItems.push({type:"game",headline:_hl,source:"スポーツ報知",dateLabel:`${year}年 ${newDay}日目`,body:(won?myTName+"が"+opp.name+"に"+_scoreStr+"で勝利した。":myTName+"は"+opp.name+"に"+_scoreStr+"で敗れた。")});
          // インタビュー（バッチ中は低確率）
          if(rngf(0,1)<0.15){
            const _qs=won?INTERVIEW_QUESTIONS_WIN:INTERVIEW_QUESTIONS_LOSE;
            const _opts=won?INTERVIEW_OPTIONS_WIN:INTERVIEW_OPTIONS_LOSE;
            batchNewsItems.push({type:"interview",headline:"【インタビュー】"+myTName+"監督に直撃！",source:"野球速報",dateLabel:`${year}年 ${newDay}日目`,body:"試合後、記者団が監督にコメントを求めた。",question:_qs[rng(0,_qs.length-1)],options:_opts});
          }
        }
      }
      if(!allStarDoneLocal && newDay===allStarTriggerDay){
        const rosters=selectAllStars(newTeams);
        const asResult=runAllStarGame(rosters, year);
        newTeams=applyAllStarSelections(newTeams, rosters);
        allStarDoneLocal=true;
        publishAllStarNews(asResult, newDay);
        if(myId){
          setAllStarResult({ rosters, gameResult: asResult });
        }
      }
      newDay++;
    }

    const nextMailbox = batchTradeMails.length ? [...mailbox, ...batchTradeMails] : mailbox;
    const batchSaveResult=saveGame({teams:newTeams,myId,gameDay:newDay,year,faPool:newFaPool,faYears,seasonHistory,news,mailbox:nextMailbox});
    if(batchSaveResult.ok) setSaveExists(true);
    results.filter(r=>r.type==='trade_news').forEach(r=>{
      addNews({
        type:'trade',
        headline:r.headline,
        source:'Baseball Times',
        dateLabel:`${year}年 ${r.day}日目`,
        body:r.body,
      });
      addTransferLog({
        year,
        day: r.day,
        type: "trade",
        headline: `【CPU間トレード】${r.sellerName} ↔ ${r.buyerName}`,
        fromTeam: r.sellerName,
        toTeam: r.buyerName,
        playersIn: [r.buyerGetsName],
        playersOut: [r.sellerGetsName],
        detail: r.body,
      });
    });
    // バッチ試合結果ニュース（古い順に追加 → ニュースタブは新しい順表示）
    [...batchNewsItems].reverse().forEach(item=>addNews(item));
    batchForeignSignNews.forEach(item=>addNews(item));
    if(batchTradeMails.length){
      setMailbox(prev=>[...prev,...batchTradeMails]);
      notify(`📨 バッチ中にトレードオファーが${batchTradeMails.length}件届きました`,'ok');
    }
    if(batchForeignSignings.length){
      const byTeam=new Map();
      for(const c of batchForeignSignings){
        if(!byTeam.has(c.teamId)) byTeam.set(c.teamId,{teamId:c.teamId,teamName:c.teamName,teamEmoji:c.teamEmoji,players:[]});
        byTeam.get(c.teamId).players.push(`${c.player.name}（${c.player.pos}）`);
      }
      const signings=Array.from(byTeam.values());
      setMailbox(prev=>[...prev,{
        id:uid(),
        type:'cpu_fa_summary',
        read:false,
        title:`【バッチ補強情報】${signings.length}球団が選手補強`,
        subject:`【バッチ補強情報】${signings.length}球団が選手補強`,
        from:'スカウト部',
        dateLabel:`${year}年 ${newDay-1}日目まで`,
        timestamp:Date.now(),
        body:'バッチシム中に他球団で補強がありました。球団名をクリックして詳細ロスターを確認できます。',
        signings,
      }]);
      notify(`🗞 バッチ中に他球団の補強が${batchForeignSignings.length}件ありました`,'ok');
    }
    if(newFaPool.length!==faPool.length) setFaPool(newFaPool);
    setTeams(newTeams);
    setGameDay(newDay);
    if(allStarDoneLocal) setAllStarDone(true);
    const gameResults=results.filter(r=>r.type!=='trade_news');
    // バッチ後の順位・成績を集計してメタデータをセット
    const afterMyT=newTeams.find(t=>t.id===myId);
    const afterRecord=afterMyT?{w:afterMyT.wins,l:afterMyT.losses,d:afterMyT.draws??0}:{w:0,l:0,d:0};
    const afterRank=calcLeagueRank(myId,newTeams,myTeam.league);
    setBatchMeta({beforeRank,afterRank,beforeRecord,afterRecord,injuries:batchInjuries,cpuHighlights});
    setBatchResults(gameResults);
    gs.setRecentResults(prev=>[...gameResults.map(r=>({won:r.won,drew:r.score.my===r.score.opp,oppName:r.oppTeam?.name||"",myScore:r.score.my,oppScore:r.score.opp,gameNo:r.gameNo})).reverse(),...prev].slice(0,5));
    gs.setGameResultsMap(prev=>{const next={...prev};gameResults.forEach(r=>{next[r.gameNo]={won:r.won,drew:r.score.my===r.score.opp,oppName:r.oppTeam?.name||"",myScore:r.score.my,oppScore:r.score.opp,log:r.log||[],inningSummary:r.inningSummary||[],oppTeam:r.oppTeam};});return next;});
    setAllTeamResultsMap(prev=>{
      const next={...prev};
      for(const{homeId,awayId,dayNo,cr,homePlayers,awayPlayers,homeName,awayName}of batchBoxScores){
        const bs=computeBoxScore(cr.log||[],cr.inningSummary||[],homePlayers,awayPlayers,cr.score.my,cr.score.opp);
        const hWon=cr.won; const drew=cr.score.my===cr.score.opp;
        next[homeId]={...(next[homeId]||{}),[dayNo]:{won:hWon,drew,myScore:cr.score.my,oppScore:cr.score.opp,oppName:awayName,oppId:awayId,homeId,awayId,...(bs||{})}};
        next[awayId]={...(next[awayId]||{}),[dayNo]:{won:!hWon&&!drew,drew,myScore:cr.score.opp,oppScore:cr.score.my,oppName:homeName,oppId:homeId,homeId,awayId,inningScores:bs?.inningScores,myBatting:bs?.awayBatting,oppBatting:bs?.homeBatting,myPitching:bs?.awayPitching,oppPitching:bs?.homePitching}};
      }
      return next;
    });
    if(newDay-1>=SEASON_GAMES){const withFarm=runFarmSeason(newTeams);setTeams(withFarm);setPlayoff(initPlayoff(withFarm));setScreen("playoff");}
    else setScreen("batch_result");
  };

  // Game over callback from TacticalGameScreen
  const handleTacticalGameEnd = gsResult => {
    if(!myTeam||!currentOpp) return;
    const won=gsResult.score.my>gsResult.score.opp;
    const drew=gsResult.score.my===gsResult.score.opp;
    upd(myId,t=>{
      let updated={...t,
        wins:t.wins+(won?1:0),losses:t.losses+(!won&&!drew?1:0),draws:t.draws+(drew?1:0),
        rf:t.rf+gsResult.score.my,ra:t.ra+gsResult.score.opp,
        rotIdx:t.rotIdx+1,
      };
      updated.players=applyGameStatsFromLog(updated.players, gsResult.log, true, won);
      updated.players=applyPostGameCondition(updated.players, gsResult.log, true, gameDay);
      updated.players=tickInjuries(updated.players);
      updated.players=tickPositionTraining(updated.players);
      updated.players=updated.players.map(p=>({...p,daysOnActiveRoster:(p.daysOnActiveRoster??0)+1}));
      updated.players=applyDefenseCoachRecovery(updated.players,t.coaches);
      const newInj=checkForInjuries(updated.players, year);
      updated.players=applyInjuriesToPlayers(updated.players, newInj, year);
      // 登録クールダウンデクリメント
      updated.players=tickCooldowns(updated.players);
      // 二軍: 怪我回復 + クールダウンデクリメント
      updated.farm=tickInjuries(updated.farm??[]);
      updated.farm=tickCooldowns(updated.farm??[]);
      // 怪我日数 > 10日の一軍選手を自動二軍降格
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
      updated.players=applyGameStatsFromLog(updated.players,gsResult.log,false,!won&&!drew);
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
        a.players=applyGameStatsFromLog(a.players,cr.log||[],true,aWon);
        a.players=applyPostGameCondition(a.players,cr.log||[],true,gameDay);
        a.players=tickInjuries(a.players);
        const aInj=checkForInjuries(a.players,year);
        a.players=applyInjuriesToPlayers(a.players,aInj,year);
        b.players=applyGameStatsFromLog(b.players,cr.log||[],false,!aWon&&!cdrew);
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
        const hWon=cr.won; const drew=cr.score.my===cr.score.opp;
        next[homeId]={...(next[homeId]||{}),[gameDay]:{won:hWon,drew,myScore:cr.score.my,oppScore:cr.score.opp,oppName:oppAName,oppId:awayId,homeId,awayId,...(bs||{})}};
        next[awayId]={...(next[awayId]||{}),[gameDay]:{won:!hWon&&!drew,drew,myScore:cr.score.opp,oppScore:cr.score.my,oppName:oppHName,oppId:homeId,homeId,awayId,inningScores:bs?.inningScores,myBatting:bs?.awayBatting,oppBatting:bs?.homeBatting,myPitching:bs?.awayPitching,oppPitching:bs?.homePitching}};
      };
      for(const{matchup,cr,homeTeam,awayTeam}of tCpuSimResults){
        recordGame(matchup.homeId,matchup.awayId,cr,homeTeam.players,awayTeam.players,homeTeam.name,awayTeam.name);
      }
      const r2=gsResult; recordGame(myId,_tOppId,r2,myTeam.players,currentOpp.players,myTeam.name,currentOpp.name);
      return next;
    });
    setGameResult({...gsResult,oppTeam:currentOpp,won,gameNo:gameDay});
    // 試合ニュース（手動試合も同様に生成）
    const _tmpl=won?NEWS_TEMPLATES_WIN:NEWS_TEMPLATES_LOSE;
    const _scoreStr=gsResult.score.my+"-"+gsResult.score.opp;
    const _hl=_tmpl[rng(0,_tmpl.length-1)].replace("{team}",myTeam?.name||"自チーム").replace("{opp}",currentOpp?.name||"相手").replace("{score}",_scoreStr);
    addNews({type:"game",headline:_hl,source:"スポーツ報知",dateLabel:year+"年 "+gameDay+"日目",body:(won?myTeam?.name+"が"+currentOpp?.name+"に"+_scoreStr+"で勝利した。\n\n投打ともに噛み合い、理想的な試合運びで勝点を積み上げた。":myTeam?.name+"は"+currentOpp?.name+"に"+_scoreStr+"で敗れた。\n\n流れを引き戻せず、次戦での巻き返しが期待される。")});
    if(Math.random()<0.35){
      const _qs=won?INTERVIEW_QUESTIONS_WIN:INTERVIEW_QUESTIONS_LOSE;
      const _opts=won?INTERVIEW_OPTIONS_WIN:INTERVIEW_OPTIONS_LOSE;
      addNews({type:"interview",headline:"【インタビュー】"+(myTeam?.name||"")+"監督に直撃！",source:"野球速報",dateLabel:year+"年 "+gameDay+"日目",body:"試合後、記者団が監督にコメントを求めた。",question:_qs[rng(0,_qs.length-1)],options:_opts});
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
          headline: `【CPU間トレード】${newsItem.sellerName} ↔ ${newsItem.buyerName}`,
          fromTeam: newsItem.sellerName,
          toTeam: newsItem.buyerName,
          playersIn: [newsItem.buyerGetsName],
          playersOut: [newsItem.sellerGetsName],
          detail: newsItem.body,
        });
      }
    }
    const _tdrew=gsResult.score.my===gsResult.score.opp;
    pushResult(won,_tdrew,currentOpp?.name||"",gsResult.score.my,gsResult.score.opp,gameDay);
    gs.pushGameResult(gameDay,{won,drew:_tdrew,oppName:currentOpp?.name||"",myScore:gsResult.score.my,oppScore:gsResult.score.opp,log:gsResult.log||[],inningSummary:gsResult.inningSummary||[],oppTeam:currentOpp});
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
    handleStartGame,
    handleModeSelect,
    handleAutoSimEnd,
    handleBatchSim,
    handleSeasonSim,
    handleTacticalGameEnd,
    tryGenerateCpuOffer,
  };
}
