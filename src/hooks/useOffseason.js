import { useState } from "react";
import { uid, clamp, rng, rngf, fmtM } from '../utils';
import { emptyStats, rollRetire, developPlayers, generateForeignFaPool } from '../engine/player';
import { calcSeasonAwards, updateRecords, checkHallOfFame } from '../engine/awards';
import { evalOffer, cpuRenewContracts, processCpuFaBids, getFaThreshold, calcPlayerDemand } from '../engine/contract';
import { initDraftPool } from '../engine/draft';
import { calcPostingRequestProb, calcPostingBid, POSTING_FEE_RATE } from '../engine/posting';
import { calcOffseasonPopDelta, driftPopularity } from '../engine/fanSentiment';
import { generateSeasonSchedule, calcAllStarTriggerDay } from '../engine/scheduleGen';
import { SEASON_PARAMS, getDefaultParams } from '../data/scheduleParams.js';
import {
  TEAM_DEFS, OWNER_TRUST_BUDGET_LOW, OWNER_TRUST_BUDGET_HIGH,
  OWNER_TRUST_FACTOR_LOW, OWNER_TRUST_FACTOR_HIGH, POP_RELEASE_PENALTY, POP_RELEASE_SALARY_THRESHOLD,
  FOREIGN_FA_COUNT_MIN, FOREIGN_FA_COUNT_MAX, MIN_SALARY_SHIHAKA, ACCEPT_THRESHOLD,
  CAMP_COND_VARIATION, CAMP_BREAKOUT_COUNT, CAMP_BREAKOUT_COND_BOOST,
  CAMP_STRUGGLE_COUNT, CAMP_STRUGGLE_COND_HIT, CAMP_MIN_CONDITION,
} from '../constants';

export function useOffseason(gs) {
  const {
    teams, setTeams, myId, myTeam,
    year, setYear, gameDay, setGameDay,
    faPool, setFaPool, setFaYears,
    seasonHistory, setSeasonHistory,
    setMailbox, setScreen,
    notify, upd, addNews, addToHistory, addTransferLog,
    setRetireModal, setRetireGamePlayer, retireRole,
    setAllStarDone,
    setAllStarResult,
    setSchedule,
    schedule,
    gameResultsMap,
    allTeamResultsMap,
    setGameResultsMap,
    scheduleArchive, setScheduleArchive,
    setAllTeamResultsMap,
    setAllStarTriggerDay,
  } = gs;

  const [developmentSummary, setDevelopmentSummary] = useState(null);
  const [newSeasonInfo, setNewSeasonInfo] = useState(null);
  const [springTrainingData, setSpringTrainingData] = useState(null);
  const [draftPool, setDraftPool] = useState(null);
  const [draftResult, setDraftResult] = useState(null);
  const [draftAllocation, setDraftAllocation] = useState({pitcher:50,batter:50});
  const [waiverClaimResults, setWaiverClaimResults] = useState(null);
  const [contractRenewalDemands, setContractRenewalDemands] = useState(null);
  // { [playerId]: { demandSalary, minAcceptSalary, resistanceFactor } }

  // careerLogをコンパクト形式で保存（evSum/evN等の不要フィールドを除外）
  const mkCareerEntry = (s, ps, yr, teamId, teamName) => {
    const pick=x=>({PA:x.PA,AB:x.AB,H:x.H,D:x.D,T:x.T,HR:x.HR,RBI:x.RBI,BB:x.BB,K:x.K,HBP:x.HBP,SF:x.SF,SB:x.SB,IP:x.IP,ER:x.ER,BBp:x.BBp,HBPp:x.HBPp,Kp:x.Kp,HRp:x.HRp,Hp:x.Hp,BF:x.BF,W:x.W,L:x.L,SV:x.SV,HLD:x.HLD,QS:x.QS});
    return{year:yr,teamId,teamName,stats:pick(s),playoffStats:pick(ps||emptyStats())};
  };

  const handleNextYear = () => {
    const foreignPool = generateForeignFaPool(rng(FOREIGN_FA_COUNT_MIN, FOREIGN_FA_COUNT_MAX));
    setYear(y=>y+1);setGameDay(1);setFaPool(foreignPool);setDraftAllocation({pitcher:50,batter:50});
    setAllStarDone(false);
    setAllStarResult(null);
    setTeams(prev=>prev.map(t=>{
      const nextPlayers=t.players.filter(p=>!p._retireNow).map(p=>({...p,age:p.age+1,stats:emptyStats(),playoffStats:emptyStats(),injury:null,injuryDaysLeft:0,condition:clamp(p.condition+20,60,100),contractYearsLeft:Math.max(0,p.contractYearsLeft-1),postingRequested:false,growthPhase:p.age+1<=24?"growth":p.age+1<=29?"peak":p.age+1<=33?"earlyDecline":"decline",retireStyle:p.retireStyle!==undefined?p.retireStyle:(p.age+1>=35?rng(0,100):undefined),careerLog:[...(p.careerLog||[]),mkCareerEntry(p.stats,p.playoffStats,year,t.id,t.name)],serviceYears:p.育成?(p.serviceYears||0):(p.serviceYears||0)+1,ikuseiYears:p.育成?(p.ikuseiYears||0)+1:0}));
      const nextIds=new Set(nextPlayers.map(p=>p.id));
      const baseBudget=TEAM_DEFS.find(d=>d.id===t.id)?.budget??t.budget;
      const seasonalPayroll=nextPlayers.reduce((s,p)=>s+(p.salary||0),0)+(t.farm||[]).reduce((s,p)=>s+(p.salary||0),0);
      const rawBudget=baseBudget+Math.round((t.revenueThisSeason||0)*0.6)-seasonalPayroll;
      const trust=t.ownerTrust??50;
      const trustFactor=t.id===myId?(trust<OWNER_TRUST_BUDGET_LOW?OWNER_TRUST_FACTOR_LOW:trust>OWNER_TRUST_BUDGET_HIGH?OWNER_TRUST_FACTOR_HIGH:1.0):1.0;
      const newBudget=Math.max(Math.round(baseBudget*0.5),Math.round(rawBudget*trustFactor));
      return{...t,wins:0,losses:0,draws:0,rf:0,ra:0,rotIdx:0,revenueThisSeason:0,winStreak:0,loseStreak:0,stadiumLevel:t.stadiumLevel??0,budget:newBudget,players:nextPlayers,lineup:(t.lineup||[]).filter(id=>nextIds.has(id)),lineupNoDh:(t.lineupNoDh||[]).filter(id=>nextIds.has(id)),lineupDh:(t.lineupDh||[]).filter(id=>nextIds.has(id)),rotation:(t.rotation||[]).filter(id=>nextIds.has(id)),farm:t.farm.map(p=>({...p,age:p.age+1,stats:emptyStats(),injury:null,serviceYears:p.育成?(p.serviceYears||0):(p.serviceYears||0)+1,ikuseiYears:p.育成?(p.ikuseiYears||0)+1:0}))};
    }));
    // 現シーズンの日程・試合結果をアーカイブに保存
    // 詳細ボックススコアは自チーム分のみ保持して容量増加を抑える
    if(schedule){
      const myTeamResultsMap = myId ? (allTeamResultsMap?.[myId] || {}) : {};
      setScheduleArchive(prev=>[...prev,{year,schedule,gameResultsMap,myTeamResultsMap}].slice(-5));
    }
    const nextYear=year+1;
    const newSchedule=generateSeasonSchedule(nextYear, teams);
    setSchedule(newSchedule);
    setGameResultsMap({});
    setAllTeamResultsMap({});
    const params=SEASON_PARAMS[nextYear]||getDefaultParams(nextYear);
    setAllStarTriggerDay(calcAllStarTriggerDay(newSchedule, params.allStarSkipDates));
    setScreen("new_season");
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
      oldCond: p.condition || 100,
      delta: conditionDeltas[p.id] || 0,
      newCond: clamp((p.condition || 100) + (conditionDeltas[p.id] || 0), CAMP_MIN_CONDITION, 100),
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
        newCond: clamp((p.condition || 100) + (conditionDeltas[p.id] || 0), CAMP_MIN_CONDITION, 100),
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
    const sameTeam=(a,b)=>Number(a)===Number(b);
    const picksFor=teamId=>[
      ...pl.filter(p=>p._drafted&&sameTeam(p._r1winner,teamId)),
      ...pl.filter(p=>sameTeam(dr[p.id],teamId)),
    ];
    const myPicks=picksFor(myId);
    const updatedTeams = teams.map(t => {
      const picks=picksFor(t.id);
      if(!picks.length) return t;
      return{...t,farm:[...t.farm,...picks.map(p=>({...p,育成:false,salary:Math.max(MIN_SALARY_SHIHAKA,p.salary),contractYears:1,contractYearsLeft:1,ikuseiYears:0}))]};
    });
    setTeams(updatedTeams);
    setNewSeasonInfo(prev=>({...(prev||{}),draftCount:myPicks.length,draftNames:myPicks.slice(0,3).map(p=>p.name)}));
    const stData = generateSpringTraining(updatedTeams);
    setSpringTrainingData(stData);
    setScreen("spring_training");
  };

  const handleSpringTrainingComplete = () => {
    if (springTrainingData?.conditionDeltas) {
      const deltas = springTrainingData.conditionDeltas;
      setTeams(prev => prev.map(t => ({
        ...t,
        players: t.players.map(p => ({
          ...p,
          condition: clamp((p.condition || 100) + (deltas[p.id] || 0), CAMP_MIN_CONDITION, 100),
        })),
        farm: (t.farm || []).map(p => ({
          ...p,
          condition: p.育成 ? (p.condition || 100) : clamp((p.condition || 100) + (deltas[p.id] || 0), CAMP_MIN_CONDITION, 100),
        })),
      })));
    }
    setSpringTrainingData(null);
    handleNextYear();
  };

  const handleContractOffer = (pid, sal, yrs, meta = {}) => {
    const p=myTeam?.players.find(x=>x.id===pid);if(!p) return;
    const incentives = meta.incentives || {};
    const r=evalOffer(p,{salary:sal,years:yrs,incentives},myTeam,teams);
    const waitDays=Math.max(1, Math.min(7, Number(meta.responseAfterDays)||rng(2,4)));
    const willAccept=r.total>=ACCEPT_THRESHOLD;
    const deliveryDay=gameDay+waitDays;
    const incentiveParts = [];
    if ((Number(incentives.performanceBonusRate) || 0) > 0) incentiveParts.push(`出来高+${incentives.performanceBonusRate}%`);
    if ((Number(incentives.titleBonus) || 0) > 0) incentiveParts.push(`タイトル${fmtM(incentives.titleBonus)}`);
    if (incentives.optOut) incentiveParts.push("オプトアウト");
    const incentiveLabel = incentiveParts.length ? incentiveParts.join(" / ") : "なし";
    setMailbox(prev=>[...prev,{
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
        salary:sal,
        years:yrs,
        incentives,
        score:r.total,
        accepted:willAccept,
      },
    }]);
    notify(`📨 ${p.name}の最終回答は${waitDays}日後に受信箱へ届きます`,"ok");
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
    const mail=gs.mailbox.find(m=>m.id===id);
    if(!mail) return;

    // ポスティング申請の承諾/拒否
    if(mail.type==="posting_request"){
      const player=myTeam?.players.find(p=>p.id===mail.playerId);
      if(player){
        if(action==="accept"){
          const bid=calcPostingBid(player);
          const fee=Math.round(bid*POSTING_FEE_RATE);
          upd(myId,t=>({...t,
            budget:t.budget+fee,
            players:t.players.filter(p=>p.id!==mail.playerId),
            lineup:(t.lineup||[]).filter(pid=>pid!==mail.playerId),
            lineupNoDh:(t.lineupNoDh||[]).filter(pid=>pid!==mail.playerId),
            lineupDh:(t.lineupDh||[]).filter(pid=>pid!==mail.playerId),
            rotation:(t.rotation||[]).filter(pid=>pid!==mail.playerId),
          }));
          setMailbox(prev=>[...prev,{id:uid(),type:"posting_result",read:false,
            title:`【ポスティング成立】${player.name} 入札額${fmtM(bid)}`,
            from:"MLB事務局",dateLabel:`${year}年`,timestamp:Date.now(),
            body:`${player.name}のポスティングが成立しました。\n入札額: ${fmtM(bid)}\n球団受取移籍金: ${fmtM(fee)}（落札額の20%）`,
          }]);
          addNews({type:"season",headline:`【MLB移籍】${player.name}（${myTeam?.name}）がポスティングで渡米`,source:"野球速報",dateLabel:`${year}年`,body:`${player.name}選手がポスティングを通じてMLBへ移籍。入札額${fmtM(bid)}、球団移籍金収入${fmtM(fee)}。`});
          notify(`${player.name} MLB移籍承認 — 移籍金+${fmtM(fee)}`,"ok");
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
    const success=Math.random()*100>(p.retireStyle||50);
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
  const handleRetirePhaseNext = (decisions) => {
    if(decisions){Object.entries(decisions).forEach(function(e){const pid=e[0];const dec=e[1];const p=myTeam?.players.find(function(x){return x.id===pid;});if(!p) return;if(dec==="accepted"||dec==="retain_failed"){upd(myId,function(t){return{...t,players:t.players.map(function(x){return x.id===pid?{...x,isRetired:true,_retireNow:true}:x;})};});addToHistory(myId,p,"引退");addNews({type:"season",headline:"【引退】"+p.name+"選手が現役引退",source:"野球速報",dateLabel:year+"年",body:p.name+"選手（"+p.age+"歳）が"+year+"年シーズンをもって現役を引退した。"});}else if(dec==="retained"){notify(p.name+"の引き留め成功！","ok");}});}
    let mySummary=null;
    const developedTeams=teams.map(t=>{
      const cpuRetiredPlayers=t.id!==myId?t.players.filter(p=>p.age>=35&&rollRetire(p)):[];
      if(t.id!==myId)cpuRetiredPlayers.forEach(p=>{addNews({type:"season",headline:"【引退】"+p.name+"（"+t.name+"）が引退",source:"野球速報",dateLabel:year+"年",body:p.name+"選手（"+p.age+"歳）が引退を発表。"});});
      const retiredIds=new Set(cpuRetiredPlayers.map(p=>p.id));
      const activePlayers=t.players.filter(p=>!retiredIds.has(p.id));
      const res=developPlayers(activePlayers, t.coaches||[]);
      const farmRes=developPlayers(t.farm, t.coaches||[]);
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

      const cpuAlumni=cpuRetiredPlayers.map(p=>({...p,exitYear:year,exitReason:"引退",tenure:p.serviceYears||1}));
      return{...t,players:postingPlayers,farm:farmAfterIkusei,history:[...(t.history||[]),...cpuAlumni]};
    });
    // CPU契約更改は contract_renewal_phase 完了後に実行（フェーズ分離）
    // 自チーム満了選手の要求額を事前計算して state に保持
    const myDeveloped=developedTeams.find(t=>t.id===myId);
    const expiringMine=(myDeveloped?.players||[]).filter(p=>p.contractYearsLeft===0&&!p.isRetired&&!p._retireNow);
    const demands={};
    for(const p of expiringMine) demands[p.id]=calcPlayerDemand(p);
    setContractRenewalDemands(demands);
    setTeams(developedTeams);
    setDevelopmentSummary(mySummary);
    const awards=calcSeasonAwards(developedTeams,year);
    const {records:newRec,broken:brokenRecs}=updateRecords(seasonHistory.records,developedTeams);
    if(brokenRecs.length>0){const recLabel={singleSeasonHR:"シーズン本塁打",singleSeasonAVG:"シーズン打率",singleSeasonK:"シーズン奪三振"};const fmtVal=r=>r.type==="singleSeasonAVG"?`.${String(Math.round(r.value*1000)).padStart(3,"0")}`:r.type==="singleSeasonK"?`${r.value}奪三振`:`${r.value}本塁打`;const fmtOld=r=>r.type==="singleSeasonAVG"?`.${String(Math.round(r.oldValue*1000)).padStart(3,"0")}`:r.type==="singleSeasonK"?`${r.oldValue}奪三振`:`${r.oldValue}本塁打`;brokenRecs.forEach(r=>addNews({type:"record",headline:`🏅 ${r.playerName}（${r.teamName}）が${recLabel[r.type]}記録を更新！`,source:"NPB記録部",dateLabel:`${year}年`,body:`${r.playerName}（${r.teamName}）が${year}年シーズンに${fmtVal(r)}を記録し、従来の${recLabel[r.type]}記録（${fmtOld(r)}）を塗り替えた。`}));}
    const allAlumni=developedTeams.flatMap(t=>t.history||[]);
    const newInductees=checkHallOfFame(seasonHistory.hallOfFame,allAlumni,year);
    const newHoF=[...seasonHistory.hallOfFame,...newInductees];
    if(newInductees.length>0){newInductees.forEach(h=>{setMailbox(prev=>[...prev,{id:uid(),type:"hof",read:false,title:"🏛 殿堂入り: "+h.playerName,from:"球団殿堂委員会",dateLabel:year+"年",timestamp:Date.now(),body:h.playerName+"選手が"+year+"年度の球団殿堂入りを果たした。"+[h.careerHR>0?"通算"+h.careerHR+"本塁打":"",h.careerW>0?"通算"+h.careerW+"勝":"",h.careerPA>0?"通算"+h.careerPA+"打席":""].filter(Boolean).join(" / ")}]);});}
    const makeRanking=(lg)=>developedTeams.filter(t=>t.league===lg).sort((a,b)=>{const pa=a.wins/Math.max(1,a.wins+a.losses);const pb=b.wins/Math.max(1,b.wins+b.losses);return pb-pa||(b.rf-b.ra)-(a.rf-a.ra);}).map(t=>({id:t.id,name:t.name,emoji:t.emoji,wins:t.wins,losses:t.losses,rf:t.rf,ra:t.ra}));
    const standingsSnap={year,central:makeRanking("セ"),pacific:makeRanking("パ"),titles:awards.titles,playerAwards:{mvpCentral:awards.mvp?.central,mvpPacific:awards.mvp?.pacific,sawamura:awards.sawamura,rookie:awards.rookie}};
    setSeasonHistory(prev=>({...prev,awards:[...prev.awards,awards],records:newRec,hallOfFame:newHoF,standingsHistory:[...(prev.standingsHistory||[]),standingsSnap]}));
    const retiredMyNames=decisions?Object.entries(decisions).filter(([,d])=>d==="accepted"||d==="retain_failed").map(([pid])=>myTeam?.players.find(x=>x.id===pid)?.name).filter(Boolean):[];
    setNewSeasonInfo({retiredNames:retiredMyNames,year:year+1,draftCount:0,draftNames:[]});
    setScreen("contract_renewal_phase");
  };

  // 契約更改フェーズ: 合意確定（ダイアログUI側から呼ばれる）
  const handleContractRenewalSign = (pid, finalSalary, years, moraleDelta, trustDelta) => {
    const p = myTeam?.players.find(x => x.id === pid);
    upd(myId, t => ({
      ...t,
      players: t.players.map(x => x.id === pid ? {
        ...x,
        salary: finalSalary,
        contractYears: years,
        contractYearsLeft: years,
        morale: clamp((x.morale ?? 70) + (moraleDelta || 0), 20, 100),
        trust:  clamp((x.trust  ?? 50) + (trustDelta  || 0), 0, 100),
      } : x),
    }));
    if (p) {
      addNews({ type: 'season', headline: `【契約更改】${p.name}（${myTeam?.name}）が${years}年契約`, source: '野球速報', dateLabel: `${year}年`, body: `${p.name}選手（${p.age}歳）が${myTeam?.name}と${years}年契約（${finalSalary}万円）を結んだ。` });
    }
  };

  // 契約更改フェーズ完了: CPU球団の更改シミュ + 人気計算 → development_phase へ
  const handleContractRenewalPhaseNext = () => {
    const renewResult = cpuRenewContracts(teams, myId, teams);
    const postCpuTeams = renewResult.updatedTeams;
    // オフシーズン人気変動（handleRetirePhaseNextから移動）
    const makeLeagueRanking = (lg) => [...postCpuTeams.filter(t => t.league === lg)].sort((a, b) => {
      const pa = a.wins / Math.max(1, a.wins + a.losses);
      const pb = b.wins / Math.max(1, b.wins + b.losses);
      return pb - pa || (b.rf - b.ra) - (a.rf - a.ra);
    });
    const seRanks = makeLeagueRanking("セ");
    const paRanks = makeLeagueRanking("パ");
    const championId = seasonHistory.championships?.at(-1)?.championId ?? null;
    const csIds = new Set([...seRanks.slice(0, 3).map(t => t.id), ...paRanks.slice(0, 3).map(t => t.id)]);
    const teamsWithPop = postCpuTeams.map(t => {
      const leagueRanks = t.league === "セ" ? seRanks : paRanks;
      const rank = leagueRanks.findIndex(r => r.id === t.id) + 1;
      const isPennant = rank === 1;
      const delta = calcOffseasonPopDelta(rank, leagueRanks.length, t.id === championId, isPennant, csIds.has(t.id));
      return { ...t, popularity: driftPopularity(Math.min(100, Math.max(0, (t.popularity ?? 50) + delta))), winStreak: 0, loseStreak: 0 };
    });
    setTeams(teamsWithPop);
    setFaPool(prev => [...prev, ...renewResult.newFaPlayers]);
    renewResult.news.forEach(n => addNews(n));
    setContractRenewalDemands(null);
    setScreen("development_phase");
  };

  // ウェーバーフェーズ処理（戦力外確定→CPU FA獲得→ドラフトへ）
  const handleWaiverPhaseNext = (markedIds) => {
    const waiverReleased=[];
    markedIds.forEach(pid=>{const p=myTeam?.players.find(x=>x.id===pid);const popPenalty=(p?.salary??0)>POP_RELEASE_SALARY_THRESHOLD?POP_RELEASE_PENALTY:0;upd(myId,t=>({...t,players:t.players.filter(x=>x.id!==pid),popularity:Math.min(100,Math.max(0,(t.popularity??50)+popPenalty))}));if(p){addToHistory(myId,p,"戦力外");waiverReleased.push({...p,isFA:true,isWaiverReleased:true});addNews({type:"season",headline:"【戦力外】"+p.name+"選手に戦力外通告",source:"野球速報",dateLabel:year+"年",body:p.name+"選手（"+p.age+"歳）が戦力外通告を受けた。"});}});
    const releasedIds=new Set(waiverReleased.map(p=>p.id));
    const combinedPool=[...faPool,...waiverReleased];
    const faResult=processCpuFaBids(teams,myId,combinedPool,teams,year);
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
    setWaiverClaimResults({claimed:claimedNew,unclaimed:unclaimedNew});
    setFaYears({});
    setDraftPool(initDraftPool(myTeam));
    setScreen("waiver_result");
  };

  return {
    developmentSummary, setDevelopmentSummary,
    newSeasonInfo, setNewSeasonInfo,
    springTrainingData,
    draftPool, setDraftPool,
    draftResult, setDraftResult,
    draftAllocation, setDraftAllocation,
    waiverClaimResults,
    contractRenewalDemands,
    handleNextYear,
    handleDraftComplete,
    handleSpringTrainingComplete,
    handleContractOffer,
    handleContractRenewalSign,
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
  };
}
