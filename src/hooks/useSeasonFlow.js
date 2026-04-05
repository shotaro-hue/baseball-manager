import { useState, useRef, useEffect } from "react";
import { uid, rng, rngf, gameDayToDate } from '../utils';
import { checkForInjuries, tickInjuries, calcRetireWill } from '../engine/player';
import { quickSimGame, runFarmSeason } from '../engine/simulation';
import { applyGameStatsFromLog, applyPostGameCondition } from '../engine/postGame';
import { calcRevenue } from '../engine/finance';
import { applyPopularityDelta } from '../engine/fanSentiment';
import { generateCpuOffer, generateCpuCpuTrade, classifyTeam } from '../engine/trade';
import { initPlayoff } from '../engine/playoff';
import { selectAllStars, runAllStarGame } from '../engine/allstar';
import { getMyMatchup, getCpuMatchups } from '../engine/scheduleGen';
import { saveGame } from '../engine/saveload';
import { SEASON_GAMES, BATCH, NEWS_TEMPLATES_WIN, NEWS_TEMPLATES_LOSE, INTERVIEW_QUESTIONS_WIN, INTERVIEW_QUESTIONS_LOSE, INTERVIEW_OPTIONS_WIN, INTERVIEW_OPTIONS_LOSE, INJURY_AUTO_DEMOTE_DAYS, REGISTRATION_COOLDOWN_DAYS, MAX_FARM, TRADE_DEADLINE_MONTH, TRADE_DEADLINE_PROB_EARLY, TRADE_DEADLINE_PROB_PEAK, TRADE_DEADLINE_CPU_CPU_PROB } from '../constants';

// 守備コーチボーナス: 怪我回復速度 UP
function applyDefenseCoachRecovery(players, coaches) {
  const defBonus=(coaches||[]).filter(c=>c.type==='defense').reduce((s,c)=>s+(c.bonus||0),0);
  if(!defBonus) return players;
  return players.map(p=>{if(!p.injuryDaysLeft) return p;const extra=Math.random()<(defBonus*0.1)?1:0;if(!extra) return p;const next=Math.max(0,p.injuryDaysLeft-extra);return{...p,injuryDaysLeft:next,injury:next>0?p.injury:null};});
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
    if((p.injuryDaysLeft??0)>INJURY_AUTO_DEMOTE_DAYS&&farm.length+demoted.length<MAX_FARM){
      demoted.push({...p,registrationCooldownDays:REGISTRATION_COOLDOWN_DAYS});
    }else{kept.push(p);}
  }
  if(demoted.length===0)return team;
  const demotedIds=new Set(demoted.map(p=>p.id));
  return{...team,players:kept,lineup:(team.lineup??[]).filter(id=>!demotedIds.has(id)),rotation:(team.rotation??[]).filter(id=>!demotedIds.has(id)),farm:[...farm,...demoted]};
}

export function useSeasonFlow(gs) {
  const {
    teams, setTeams, myId, myTeam,
    gameDay, setGameDay, year,
    schedule, setScreen,
    notify, upd, addNews, pushResult,
    setMailbox, setRetireModal,
    faPool, faYears, seasonHistory, news, mailbox,
    setSaveExists, cpuTradeOffers,
    allStarDone, setAllStarDone, allStarResult, setAllStarResult,
    allStarTriggerDay,
  } = gs;

  const [gameResult, setGameResult] = useState(null);
  const [currentOpp, setCurrentOpp] = useState(null);
  const [gameMode, setGameMode] = useState(null);
  const [batchResults, setBatchResults] = useState([]);
  const [playoff, setPlayoff] = useState(null);
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
    };
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
    const {opp}=pickOpponentFromSchedule(gameDay);
    if(!opp) return;
    setCurrentOpp(opp);
    setScreen("mode_select");
  };

  // Mode selected → start appropriate game type
  const handleModeSelect = mode => {
    setGameMode(mode);
    if(mode==="tactical"){
      setScreen("tactical_game");
    } else {
      const myT=teams.find(t=>t.id===myId);
      const r=quickSimGame(myT,currentOpp);
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
      updated.players=updated.players.map(p=>({...p,daysOnActiveRoster:(p.daysOnActiveRoster??0)+1}));
      updated.players=applyDefenseCoachRecovery(updated.players,t.coaches);
      const newInj=checkForInjuries(updated.players);
      if(newInj.length>0){
        const injNames=newInj.reduce((acc,i)=>{const p=updated.players.find(x=>x.id===i.id);if(p)acc.push({name:p.name,...i});return acc;},[]);
        updated.players=updated.players.map(p=>{const inj=newInj.find(i=>i.id===p.id);return inj?{...p,injury:inj.type,injuryDaysLeft:inj.days}:p;});
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
      const newInj=checkForInjuries(updated.players);
      if(newInj.length>0)updated.players=updated.players.map(p=>{const inj=newInj.find(i=>i.id===p.id);return inj?{...p,injury:inj.type,injuryDaysLeft:inj.days}:p;});
      Object.assign(updated,applyPopularityDelta(t,!won&&!drew,drew));
      return updated;
    });
    // Simulate remaining CPU vs CPU games for this day (schedule-based matchups)
    const _oppId=currentOpp.id;
    const _cpuMatchups=getCpuMatchups(schedule,gameDay,myId,_oppId);
    setTeams(prev=>{
      let newTeams=prev.map(t=>({...t,players:t.players.map(p=>({...p,stats:{...p.stats}}))}));
      const matchupList=_cpuMatchups.length>0
        ?_cpuMatchups
        :(()=>{const others=newTeams.filter(t=>t.id!==myId&&t.id!==_oppId);const pairs=[];for(let i=0;i<others.length-1;i+=2)pairs.push({homeId:others[i].id,awayId:others[i+1].id});return pairs;})();
      for(const matchup of matchupList){
        const a=newTeams.find(t=>t.id===matchup.homeId);
        const b=newTeams.find(t=>t.id===matchup.awayId);
        if(!a||!b) continue;
        const cr=quickSimGame(a,b);
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
        const aInj=checkForInjuries(a.players);
        if(aInj.length>0)a.players=a.players.map(p=>{const inj=aInj.find(i=>i.id===p.id);return inj?{...p,injury:inj.type,injuryDaysLeft:inj.days}:p;});
        b.players=applyGameStatsFromLog(b.players,cr.log||[],false,!aWon&&!cdrew);
        b.players=applyPostGameCondition(b.players,cr.log||[],false,gameDay);
        b.players=tickInjuries(b.players);
        const bInj=checkForInjuries(b.players);
        if(bInj.length>0)b.players=b.players.map(p=>{const inj=bInj.find(i=>i.id===p.id);return inj?{...p,injury:inj.type,injuryDaysLeft:inj.days}:p;});
      }
      return newTeams;
    });
    setGameResult({score:r.score,won,log:r.log||[],inningSummary:r.inningSummary||[],oppTeam:currentOpp});
    tryGenerateCpuOffer();
    const autoDate = gameDayToDate(gameDay, schedule);
    if (autoDate && autoDate.month === TRADE_DEADLINE_MONTH) {
      const liveTeams = teams.map((t) => ({ ...t, players: [...(t.players || [])] }));
      const newsItem = tryCpuCpuDeadlineTrade(liveTeams, gameDay);
      if (newsItem) {
        setTeams(liveTeams);
        addNews({ type: 'trade', headline: newsItem.headline, source: 'Baseball Times', dateLabel: `${year}年 ${gameDay}日目`, body: newsItem.body });
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
    gs.pushGameResult(gameDay,{won,drew:_adrew,oppName:currentOpp?.name||"",myScore:r.score.my,oppScore:r.score.opp});
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

  // 5試合まとめてオートシム
  const handleBatchSim = () => {
    if(!myTeam) return;
    const count=Math.min(BATCH, SEASON_GAMES-(gameDay-1));
    if(count<=0) return;
    runBatchGames(count);
  };

  // 残り全試合まとめてオートシム
  const handleSeasonSim = () => {
    if(!myTeam) return;
    const count=SEASON_GAMES-(gameDay-1);
    if(count<=0) return;
    runBatchGames(count);
  };

  // バッチ処理の共通ロジック
  const runBatchGames = (count) => {
    if(!myTeam) return;
    let newTeams=[...teams.map(t=>({...t,players:[...t.players.map(p=>({...p,stats:{...p.stats}}))],...(t.id===myId?{}:{})}))];
    const results=[];
    let newDay=gameDay;
    let allStarDoneLocal=allStarDone;

    for(let g=0;g<count;g++){
      const scheduleMatchup=getMyMatchup(schedule,newDay,myId);
      let oppId=scheduleMatchup?.oppId;
      if(!oppId){
        const isInterleague=newDay>=60&&newDay<=94;
        const oppPool=isInterleague
          ?newTeams.filter(t=>t.id!==myId&&t.league!==myTeam.league)
          :newTeams.filter(t=>t.id!==myId&&t.league===myTeam.league);
        oppId=(oppPool[rng(0,oppPool.length-1)]||newTeams.find(t=>t.id!==myId))?.id;
      }
      const opp=newTeams.find(t=>t.id===oppId)||newTeams.find(t=>t.id!==myId);
      const batchCpuMatchups=getCpuMatchups(schedule,newDay,myId,opp.id);
      const cpuPairs=batchCpuMatchups.length>0
        ?batchCpuMatchups
        :(()=>{const others=newTeams.filter(t=>t.id!==myId&&t.id!==opp.id);const pairs=[];for(let i=0;i<others.length-1;i+=2)pairs.push({homeId:others[i].id,awayId:others[i+1].id});return pairs;})();
      for(const cpuMatchup of cpuPairs){
        const a=newTeams.find(t=>t.id===cpuMatchup.homeId);
        const b=newTeams.find(t=>t.id===cpuMatchup.awayId);
        if(!a||!b) continue;
        const cr=quickSimGame(a,b);
        const cdrew=cr.score.my===cr.score.opp;
        const aWon=cr.won;
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
        const aInj=checkForInjuries(a.players);
        if(aInj.length>0)a.players=a.players.map(p=>{const inj=aInj.find(i=>i.id===p.id);return inj?{...p,injury:inj.type,injuryDaysLeft:inj.days}:p;});
        b.players=applyGameStatsFromLog(b.players,cr.log||[],false,!aWon&&!cdrew);
        b.players=applyPostGameCondition(b.players,cr.log||[],false,newDay);
        b.players=tickInjuries(b.players);
        b.players=b.players.map(p=>({...p,daysOnActiveRoster:(p.daysOnActiveRoster??0)+1}));
        const bInj=checkForInjuries(b.players);
        if(bInj.length>0)b.players=b.players.map(p=>{const inj=bInj.find(i=>i.id===p.id);return inj?{...p,injury:inj.type,injuryDaysLeft:inj.days}:p;});
        a.rotIdx=(a.rotIdx||0)+1;
        b.rotIdx=(b.rotIdx||0)+1;
      }
      const cpuCpuTradeNews = tryCpuCpuDeadlineTrade(newTeams, newDay);
      if (cpuCpuTradeNews) {
        results.push({ type: 'trade_news', ...cpuCpuTradeNews, day: newDay });
      }
      const myT=newTeams.find(t=>t.id===myId);
      const r=quickSimGame(myT,opp);
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
      myT.players=myT.players.map(p=>({...p,daysOnActiveRoster:(p.daysOnActiveRoster??0)+1}));
      myT.players=applyDefenseCoachRecovery(myT.players,myT.coaches);
      const _inj=checkForInjuries(myT.players);
      if(_inj.length>0)myT.players=myT.players.map(p=>{const inj=_inj.find(i=>i.id===p.id);return inj?{...p,injury:inj.type,injuryDaysLeft:inj.days}:p;});
      // 登録クールダウンデクリメント
      myT.players=tickCooldowns(myT.players);
      // 二軍: 怪我回復 + クールダウンデクリメント
      myT.farm=tickInjuries(myT.farm??[]);
      myT.farm=tickCooldowns(myT.farm??[]);
      // 怪我日数 > 10日の一軍選手を自動二軍降格（インライン: myT参照を維持）
      {const farm=myT.farm??[];const demotedB=[];const keptB=[];for(const p of myT.players){if((p.injuryDaysLeft??0)>INJURY_AUTO_DEMOTE_DAYS&&farm.length+demotedB.length<MAX_FARM){demotedB.push({...p,registrationCooldownDays:REGISTRATION_COOLDOWN_DAYS});}else{keptB.push(p);}}if(demotedB.length>0){const dIds=new Set(demotedB.map(p=>p.id));myT.players=keptB;myT.farm=[...farm,...demotedB];myT.lineup=(myT.lineup??[]).filter(id=>!dIds.has(id));myT.rotation=(myT.rotation??[]).filter(id=>!dIds.has(id));}}
      const oppT=newTeams.find(t=>t.id===opp.id);
      if(oppT){
        if(won){oppT.losses++;oppT.rf+=r.score.opp;oppT.ra+=r.score.my;}
        else if(drew){oppT.draws++;oppT.rf+=r.score.opp;oppT.ra+=r.score.my;}
        else{oppT.wins++;oppT.rf+=r.score.opp;oppT.ra+=r.score.my;}
        Object.assign(oppT,applyPopularityDelta(oppT,!won&&!drew,drew));
        oppT.players=applyGameStatsFromLog(oppT.players,r.log||[],false,!won&&!drew);
        oppT.players=applyPostGameCondition(oppT.players,r.log||[],false,newDay);
        oppT.players=tickInjuries(oppT.players);
        const oppInj=checkForInjuries(oppT.players);
        if(oppInj.length>0)oppT.players=oppT.players.map(p=>{const inj=oppInj.find(i=>i.id===p.id);return inj?{...p,injury:inj.type,injuryDaysLeft:inj.days}:p;});
        oppT.rotIdx=(oppT.rotIdx||0)+1;
      }
      const rev=calcRevenue(myT);
      const revTotal=rev.ticket+rev.sponsor+rev.merch;
      myT.budget+=revTotal;
      myT.revenueThisSeason=(myT.revenueThisSeason??0)+revTotal;
      results.push({...r,won,oppTeam:opp,gameNo:newDay});
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

    const batchSaveResult=saveGame({teams:newTeams,myId,gameDay:newDay,year,faPool,faYears,seasonHistory,news,mailbox});
    if(batchSaveResult.ok) setSaveExists(true);
    results.filter(r=>r.type==='trade_news').forEach(r=>{
      addNews({
        type:'trade',
        headline:r.headline,
        source:'Baseball Times',
        dateLabel:`${year}年 ${r.day}日目`,
        body:r.body,
      });
    });
    setTeams(newTeams);
    setGameDay(newDay);
    if(allStarDoneLocal) setAllStarDone(true);
    setBatchResults(results);
    gs.setRecentResults(prev=>[...results.map(r=>({won:r.won,drew:r.score.my===r.score.opp,oppName:r.oppTeam?.name||"",myScore:r.score.my,oppScore:r.score.opp,gameNo:r.gameNo})).reverse(),...prev].slice(0,5));
    gs.setGameResultsMap(prev=>{const next={...prev};results.forEach(r=>{next[r.gameNo]={won:r.won,drew:r.score.my===r.score.opp,oppName:r.oppTeam?.name||"",myScore:r.score.my,oppScore:r.score.opp};});return next;});
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
      updated.players=updated.players.map(p=>({...p,daysOnActiveRoster:(p.daysOnActiveRoster??0)+1}));
      updated.players=applyDefenseCoachRecovery(updated.players,t.coaches);
      const newInj=checkForInjuries(updated.players);
      if(newInj.length>0)updated.players=updated.players.map(p=>{const inj=newInj.find(i=>i.id===p.id);return inj?{...p,injury:inj.type,injuryDaysLeft:inj.days}:p;});
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
      const newInj=checkForInjuries(updated.players);
      if(newInj.length>0)updated.players=updated.players.map(p=>{const inj=newInj.find(i=>i.id===p.id);return inj?{...p,injury:inj.type,injuryDaysLeft:inj.days}:p;});
      Object.assign(updated,applyPopularityDelta(t,!won&&!drew,drew));
      return updated;
    });
    const _tOppId=currentOpp.id;
    const _tCpuMatchups=getCpuMatchups(schedule,gameDay,myId,_tOppId);
    setTeams(prev=>{
      let newTeams=prev.map(t=>({...t,players:t.players.map(p=>({...p,stats:{...p.stats}}))}));
      const tMatchupList=_tCpuMatchups.length>0
        ?_tCpuMatchups
        :(()=>{const others=newTeams.filter(t=>t.id!==myId&&t.id!==_tOppId);const pairs=[];for(let i=0;i<others.length-1;i+=2)pairs.push({homeId:others[i].id,awayId:others[i+1].id});return pairs;})();
      for(const matchup of tMatchupList){
        const a=newTeams.find(t=>t.id===matchup.homeId);
        const b=newTeams.find(t=>t.id===matchup.awayId);
        if(!a||!b) continue;
        const cr=quickSimGame(a,b);
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
        const aInj=checkForInjuries(a.players);
        if(aInj.length>0)a.players=a.players.map(p=>{const inj=aInj.find(i=>i.id===p.id);return inj?{...p,injury:inj.type,injuryDaysLeft:inj.days}:p;});
        b.players=applyGameStatsFromLog(b.players,cr.log||[],false,!aWon&&!cdrew);
        b.players=applyPostGameCondition(b.players,cr.log||[],false,gameDay);
        b.players=tickInjuries(b.players);
        const bInj=checkForInjuries(b.players);
        if(bInj.length>0)b.players=b.players.map(p=>{const inj=bInj.find(i=>i.id===p.id);return inj?{...p,injury:inj.type,injuryDaysLeft:inj.days}:p;});
      }
      return newTeams;
    });
    setGameResult({...gsResult,oppTeam:currentOpp,won});
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
      }
    }
    const _tdrew=gsResult.score.my===gsResult.score.opp;
    pushResult(won,_tdrew,currentOpp?.name||"",gsResult.score.my,gsResult.score.opp,gameDay);
    gs.pushGameResult(gameDay,{won,drew:_tdrew,oppName:currentOpp?.name||"",myScore:gsResult.score.my,oppScore:gsResult.score.opp});
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
    gameMode, setGameMode,
    batchResults, setBatchResults,
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
