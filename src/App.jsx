import { useState, useMemo, useCallback, useEffect } from "react";
import './styles.css';
import { rng, clamp, uid, pname, fmtM, fmtSal } from './utils';
import { buildTeam, makePlayer, emptyStats, calcRetireWill, rollRetire, developPlayers, checkForInjuries, tickInjuries } from './engine/player';
import { calcSeasonAwards, updateRecords, checkHallOfFame } from './engine/awards';
import { evalOffer, cpuRenewContracts, processCpuFaBids } from './engine/contract';
import { quickSimGame } from './engine/simulation';
import { applyGameStatsFromLog, applyPostGameCondition } from './engine/postGame';
import { calcRevenue } from './engine/finance';
import { generateCpuOffer } from './engine/trade';
import { initDraftPool } from './engine/draft';
import { initPlayoff } from './engine/playoff';
import { TacticalGameScreen } from './components/TacticalGame';
import { BatchResultScreen } from './components/BatchResult';
import { ModeSelectScreen, ResultScreen, RetirePhaseScreen, WaiverPhaseScreen, GrowthSummaryScreen } from './components/Screens';
import { DraftPreviewScreen, DraftLotteryScreen, DraftScreen, DraftReviewScreen } from './components/Draft';
import { PlayoffScreen } from './components/PlayoffScreen';
import { RetireModal } from './components/RetireModal';
import { StatsTab, FinanceTab, ContractTab, NewsTab, MailboxTab, TradeTab, AlumniTab, RosterTab, StandingsTab, RecordsTab } from './components/Tabs';
import { SEASON_GAMES, BATCH, MAX_ROSTER, MAX_FARM, MAX_外国人_一軍, ACCEPT_THRESHOLD, TEAM_DEFS, POSITIONS, COACH_DEFS, COACH_GRADES, SCOUT_REGIONS, NEWS_TEMPLATES_WIN, NEWS_TEMPLATES_LOSE, INTERVIEW_QUESTIONS_WIN, INTERVIEW_QUESTIONS_LOSE, INTERVIEW_OPTIONS_WIN, INTERVIEW_OPTIONS_LOSE } from './constants';
import { saveGame, loadGame, hasSave, getSaveMeta, deleteSave } from './engine/saveload';
import { buildRealTeam } from './engine/realplayer';
import { NPB2025_ROSTERS } from './data/npb2025';


/* ═══════════════════════════════════════════════
   MAIN APP
═══════════════════════════════════════════════ */

const INIT_TEAMS=TEAM_DEFS.map(function(d){
  const t=NPB2025_ROSTERS[d.id]?buildRealTeam(d,NPB2025_ROSTERS[d.id]):buildTeam(d);
  t.history=[];return t;
});

export default function App(){
  const [screen,setScreen]=useState("title");
  const [retireModal,setRetireModal]=useState(null); // {player,type:"announce"|"season_end"}
  const [retireGamePlayer,setRetireGamePlayer]=useState(null); // 引退試合対象選手
  const [retireRole,setRetireRole]=useState(null); // "starter"|"reliever"|"pinch"|"runner"
  const [teams,setTeams]=useState(INIT_TEAMS);
  const [myId,setMyId]=useState(null);
  const [tab,setTab]=useState("roster");
  const [gameDay,setGameDay]=useState(1);
  const [year,setYear]=useState(2025);
  const [gameResult,setGameResult]=useState(null);
  const [faPool,setFaPool]=useState([]);
  const [faYears,setFaYears]=useState({});
  const [notif,setNotif]=useState(null);
  const [currentOpp,setCurrentOpp]=useState(null);
  const [gameMode,setGameMode]=useState(null); // "tactical"|"auto"
  const [batchResults,setBatchResults]=useState([]);
  const [developmentSummary,setDevelopmentSummary]=useState(null);
  const [seasonHistory,setSeasonHistory]=useState({awards:[],records:{singleSeasonHR:null,singleSeasonAVG:null,singleSeasonK:null,careerHR:{},careerW:{}},hallOfFame:[]});
  const [saveExists,setSaveExists]=useState(()=>hasSave());

  const myTeam=useMemo(()=>teams.find(t=>t.id===myId),[teams,myId]);
  const notify=useCallback((msg,type="ok")=>{setNotif({msg,type});setTimeout(()=>setNotif(null),3500);},[]);
  const upd=useCallback((id,fn)=>setTeams(prev=>prev.map(t=>t.id===id?fn(t):t)),[]);
  const setTrainingFocus=(pid,focus)=>upd(myId,t=>({...t,players:t.players.map(p=>p.id===pid?{...p,trainingFocus:focus}:p)}));

  const handleSave=()=>{
    const result=saveGame({teams,myId,gameDay,year,faPool,faYears,seasonHistory,news,mailbox});
    if(result.ok) setSaveExists(true);
    notify(result.ok?'💾 セーブしました':result.quota?'💾 ストレージ容量が不足しています':'セーブに失敗しました',result.ok?'ok':'warn');
  };
  useEffect(()=>{
    if(screen!=='hub') return;
    const result=saveGame({teams,myId,gameDay,year,faPool,faYears,seasonHistory,news,mailbox});
    if(result.ok){setSaveExists(true);notify('💾 オートセーブ','ok');}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[screen]);

  const handleLoad=()=>{
    const saved=loadGame();
    if(!saved){notify('セーブデータがありません','warn');return;}
    setTeams(saved.teams);
    setMyId(saved.myId);
    setGameDay(saved.gameDay);
    setYear(saved.year);
    setFaPool(saved.faPool||[]);
    setFaYears(saved.faYears||{});
    setSeasonHistory(saved.seasonHistory||{awards:[],records:{singleSeasonHR:null,singleSeasonAVG:null,singleSeasonK:null,careerHR:{},careerW:{}},hallOfFame:[]});
    setNews(saved.news||[]);
    setMailbox(saved.mailbox||[]);
    setCpuTradeOffers([]);
    setDraftPool(null);
    setDraftResult(null);
    setPlayoff(null);
    setDevelopmentSummary(null);
    setTab('roster');
    setScreen('hub');
  };

  const addToHistory=(teamId,player,exitReason)=>{
    if(!player) return;
    setTeams(prev=>prev.map(function(t){
      if(t.id!==teamId) return t;
      const joinYear=(player.careerLog&&player.careerLog.length>0)?player.careerLog[0].year:0;
      const tenure=joinYear>0?year-joinYear+1:1;
      const record=Object.assign({},player,{exitYear:year,exitReason:exitReason,tenure:tenure});
      return Object.assign({},t,{history:[...(t.history||[]),record]});
    }));
  };

  const handleSelect=id=>{setMyId(id);setScreen("hub");setTab("roster");};

  // Pick opponent and go to mode select
  const handleStartGame=()=>{
    if(!myTeam) return;
    const sameLeague=teams.filter(t=>t.id!==myId&&t.league===myTeam.league);
    const opp=sameLeague[rng(0,sameLeague.length-1)];
    // CPU vs CPU for other games
    let newTeams=[...teams];
    const others=newTeams.filter(t=>t.id!==myId&&t.id!==opp.id);
    for(let i=0;i<others.length-1;i+=2){
      const a=newTeams.find(t=>t.id===others[i].id);
      const b=newTeams.find(t=>t.id===others[i+1]?.id);
      if(!a||!b) continue;
      const r=quickSimGame(a,b);
      const drew=r.score.my===r.score.opp;
      if(r.won){a.wins++;a.rf+=r.score.my;a.ra+=r.score.opp;b.losses++;b.rf+=r.score.opp;b.ra+=r.score.my;}
      else if(drew){a.draws++;a.rf+=r.score.my;a.ra+=r.score.opp;b.draws++;b.rf+=r.score.opp;b.ra+=r.score.my;}
      else{b.wins++;b.rf+=r.score.opp;b.ra+=r.score.my;a.losses++;a.rf+=r.score.my;a.ra+=r.score.opp;}
    }
    setTeams(newTeams);
    setCurrentOpp(opp);
    setScreen("mode_select");
  };

  // Mode selected → start appropriate game type
  const handleModeSelect=mode=>{
    setGameMode(mode);
    if(mode==="tactical"){
      setScreen("tactical_game");
    } else {
      // Auto-sim: run instantly
      const myT=teams.find(t=>t.id===myId);
      const r=quickSimGame(myT,currentOpp);
      handleAutoSimEnd(r);
    }
  };

  // Auto sim result handler
  const handleAutoSimEnd=r=>{
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
      updated.players=applyPostGameCondition(updated.players, r.log||[], true);
      updated.players=tickInjuries(updated.players);
      const newInj=checkForInjuries(updated.players);
      if(newInj.length>0)updated.players=updated.players.map(p=>{const inj=newInj.find(i=>i.id===p.id);return inj?{...p,injury:inj.type,injuryDaysLeft:inj.days}:p;});
      const rev=calcRevenue(updated);
      updated.budget+=rev.ticket+rev.sponsor+rev.merch;
      return updated;
    });
    setGameResult({score:r.score,won,log:r.log||[],inningSummary:r.inningSummary||[],oppTeam:currentOpp});
    tryGenerateCpuOffer();
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
    if(Math.random()<0.2){
      const _qs=won?INTERVIEW_QUESTIONS_WIN:INTERVIEW_QUESTIONS_LOSE;
      const _opts=won?INTERVIEW_OPTIONS_WIN:INTERVIEW_OPTIONS_LOSE;
      addNews({type:"interview",headline:"【インタビュー】"+(myTeam?.name||"")+"監督に直撃！",source:"野球速報",dateLabel:year+"年 "+gameDay+"日目",body:"試合後、記者団が監督にコメントを求めた。",question:_qs[rng(0,_qs.length-1)],options:_opts});
    }
    setGameDay(d=>d+1);
    if(gameDay>=SEASON_GAMES){
      const finalTeams=teams.map(t=>t.id===myId?{...t,wins:t.wins+(won?1:0),losses:t.losses+(!won&&!drew?1:0),draws:t.draws+(drew?1:0),rf:t.rf+r.score.my,ra:t.ra+r.score.opp}:t);
      setPlayoff(initPlayoff(finalTeams));setScreen("playoff");
    }
    else setScreen("result");
  };

  // 5試合まとめてオートシム
  const handleBatchSim=()=>{
    if(!myTeam) return;
    const count=Math.min(BATCH, SEASON_GAMES-(gameDay-1));
    if(count<=0) return;
    runBatchGames(count);
  };

  // 残り全試合まとめてオートシム
  const handleSeasonSim=()=>{
    if(!myTeam) return;
    const count=SEASON_GAMES-(gameDay-1);
    if(count<=0) return;
    runBatchGames(count);
  };

  // バッチ処理の共通ロジック
  const runBatchGames=(count)=>{
    if(!myTeam) return;
    const sameLeague=teams.filter(t=>t.id!==myId&&t.league===myTeam.league);
    let newTeams=[...teams.map(t=>({...t,players:[...t.players.map(p=>({...p,stats:{...p.stats}}))],...(t.id===myId?{}:{})}))];
    const results=[];
    let newDay=gameDay;

    for(let g=0;g<count;g++){
      const opp=sameLeague[rng(0,sameLeague.length-1)];
      // CPU vs CPU
      const others=newTeams.filter(t=>t.id!==myId&&t.id!==opp.id);
      for(let i=0;i<others.length-1;i+=2){
        const a=newTeams.find(t=>t.id===others[i].id);
        const b=newTeams.find(t=>t.id===others[i+1]?.id);
        if(!a||!b) continue;
        const r=quickSimGame(a,b);
        const drew=r.score.my===r.score.opp;
        if(r.won){a.wins++;a.rf+=r.score.my;a.ra+=r.score.opp;b.losses++;b.rf+=r.score.opp;b.ra+=r.score.my;}
        else if(drew){a.draws++;a.rf+=r.score.my;a.ra+=r.score.opp;b.draws++;b.rf+=r.score.opp;b.ra+=r.score.my;}
        else{b.wins++;b.rf+=r.score.opp;b.ra+=r.score.my;a.losses++;a.rf+=r.score.my;a.ra+=r.score.opp;}
      }
      // 自チームの試合
      const myT=newTeams.find(t=>t.id===myId);
      const r=quickSimGame(myT,opp);
      const won=r.score.my>r.score.opp;
      const drew=r.score.my===r.score.opp;
      if(won){myT.wins++;myT.rf+=r.score.my;myT.ra+=r.score.opp;}
      else if(drew){myT.draws++;myT.rf+=r.score.my;myT.ra+=r.score.opp;}
      else{myT.losses++;myT.rf+=r.score.my;myT.ra+=r.score.opp;}
      myT.rotIdx++;
      myT.players=applyGameStatsFromLog(myT.players, r.log||[], true, won);
      myT.players=applyPostGameCondition(myT.players, r.log||[], true);
      myT.players=tickInjuries(myT.players);
      const _inj=checkForInjuries(myT.players);
      if(_inj.length>0)myT.players=myT.players.map(p=>{const inj=_inj.find(i=>i.id===p.id);return inj?{...p,injury:inj.type,injuryDaysLeft:inj.days}:p;});
      results.push({...r,won,oppTeam:opp,gameNo:newDay});
      newDay++;
    }

    // 収益更新
    const myFinal=newTeams.find(t=>t.id===myId);
    for(let g=0;g<count;g++){
      const rev=calcRevenue(myFinal);
      myFinal.budget+=rev.ticket+rev.sponsor+rev.merch;
    }

    const batchSaveResult=saveGame({teams:newTeams,myId,gameDay:newDay,year,faPool,faYears,seasonHistory,news,mailbox});
    if(batchSaveResult.ok) setSaveExists(true);
    setTeams(newTeams);
    setGameDay(newDay);
    setBatchResults(results);
    if(newDay-1>=SEASON_GAMES){setPlayoff(initPlayoff(newTeams));setScreen("playoff");}
    else setScreen("batch_result");
  };

  // Game over callback from TacticalGameScreen
  const handleTacticalGameEnd=gsResult=>{
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
      updated.players=applyPostGameCondition(updated.players, gsResult.log, true);
      const rev=calcRevenue(updated);
      updated.budget+=rev.ticket+rev.sponsor+rev.merch;
      return updated;
    });
    setGameResult({...gsResult,oppTeam:currentOpp,won});
    setGameDay(d=>d+1);
    if(gameDay>=SEASON_GAMES){
      const finalTeams=teams.map(t=>t.id===myId?{...t,wins:t.wins+(won?1:0),losses:t.losses+(!won&&!drew?1:0),draws:t.draws+(drew?1:0),rf:t.rf+gsResult.score.my,ra:t.ra+gsResult.score.opp}:t);
      setPlayoff(initPlayoff(finalTeams));setScreen("playoff");
    }
    else setScreen("result");
  };

  const toggleLineup=pid=>{
    if(!myTeam) return;
    const inL=myTeam.lineup.includes(pid);
    const p=myTeam.players.find(x=>x.id===pid);
    if(p?.isPitcher){notify("投手は打線に入れられません","warn");return;}
    if(p?.injury){notify("故障中は出場不可","warn");return;}
    if(!inL&&myTeam.lineup.length>=9){notify("打線は最大9人です","warn");return;}
    if(inL&&myTeam.lineup.length<=4){notify("最低4人必要です","warn");return;}
    upd(myId,t=>({...t,lineup:inL?t.lineup.filter(id=>id!==pid):[...t.lineup,pid]}));
  };
  const setStarter=pid=>{upd(myId,t=>({...t,rotation:t.rotation.includes(pid)?t.rotation:[...t.rotation,pid]}));notify("先発ローテに追加","ok");};
  const promote=pid=>{if(!myTeam) return;const p=myTeam.farm.find(x=>x.id===pid);if(!p) return;if(myTeam.players.length>=MAX_ROSTER){notify("一軍枠満杯","warn");return;}if(p.isForeign&&myTeam.players.filter(x=>x.isForeign).length>=MAX_外国人_一軍){notify(`外国人枠は${MAX_外国人_一軍}名まで`,"warn");return;}upd(myId,t=>({...t,players:[...t.players,p],farm:t.farm.filter(x=>x.id!==pid)}));notify(`${p.name}を一軍昇格！`,"ok");};
  const demote=pid=>{if(!myTeam) return;const p=myTeam.players.find(x=>x.id===pid);if(!p) return;if(myTeam.farm.length>=MAX_FARM){notify("二軍満杯","warn");return;}upd(myId,t=>({...t,players:t.players.filter(x=>x.id!==pid),lineup:t.lineup.filter(id=>id!==pid),rotation:t.rotation.filter(id=>id!==pid),farm:[...t.farm,p]}));notify(`${p.name}を二軍降格`,"warn");};
  const hireCoach=(cd,cg)=>{if(!myTeam||myTeam.budget<cg.salary*12){notify("予算不足","warn");return;}upd(myId,t=>({...t,budget:t.budget-cg.salary*12,coaches:[...t.coaches,{type:cd.type,typeName:cd.name,emoji:cd.emoji,name:pname(),grade:cg.g,label:cg.label,salary:cg.salary*12,bonus:cg.bonus}]}));notify(`${cd.name}(Lv${cg.g})を雇いました！`,"ok");};
  const fireCoach=idx=>{upd(myId,t=>({...t,coaches:t.coaches.filter((_,i)=>i!==idx)}));notify("コーチを解雇","warn");};

  const sendScout=region=>{
    if(!myTeam||myTeam.budget<region.cost){notify("予算不足","warn");return;}
    upd(myId,t=>({...t,budget:t.budget-region.cost,scoutMissions:[...t.scoutMissions,{id:uid(),name:region.name,weeksLeft:region.weeks,qMin:region.qMin,qMax:region.qMax,cost:region.cost,foreign:region.foreign}]}));
    notify(`${region.name}へスカウト派遣！`,"ok");
    setTimeout(()=>{
      upd(myId,t=>{const mis=t.scoutMissions.find(m=>m.name===region.name);if(!mis) return t;const np=makePlayer(Math.random()<0.4?"先発":POSITIONS[rng(0,7)],rng(mis.qMin,mis.qMax),Math.random()<0.4,undefined,mis.foreign&&Math.random()<0.7);return{...t,scoutMissions:t.scoutMissions.filter(m=>m!==mis),scoutResults:[...t.scoutResults,np]};});
      notify("スカウト報告が届きました！","ok");
    },3000);
  };
  const signPlayer=idx=>{if(!myTeam) return;const p=myTeam.scoutResults[idx];if(!p||myTeam.budget<p.salary){notify("予算不足","warn");return;}if(myTeam.farm.length>=MAX_FARM){notify("二軍枠満杯","warn");return;}upd(myId,t=>({...t,budget:t.budget-p.salary,farm:[...t.farm,{...p,contractYearsLeft:2}],scoutResults:t.scoutResults.filter((_,i)=>i!==idx)}));notify(`${p.name}を獲得！`,"ok");};
  const handleContractOffer=(pid,sal,yrs)=>{
    const p=myTeam?.players.find(x=>x.id===pid);if(!p) return;
    const r=evalOffer(p,{salary:sal,years:yrs},myTeam,teams);
    if(r.total>=ACCEPT_THRESHOLD){upd(myId,t=>({...t,players:t.players.map(x=>x.id===pid?{...x,salary:sal,contractYears:yrs,contractYearsLeft:yrs}:x)}));notify(`✅ ${p.name}が合意 (${r.total})`,"ok");}
    else{addToHistory(myId,p,"FA移籍");upd(myId,t=>({...t,players:t.players.filter(x=>x.id!==pid)}));setFaPool(prev=>[...prev,{...p,isFA:true,highestBid:0}]);notify(`❌ ${p.name}がFA宣言 (${r.total})`,"warn");}
  };
  const addNews=(article)=>{
    setNews(prev=>[{id:uid(),timestamp:Date.now(),...article},...prev].slice(0,50));
  };
  const handleInterview=(newsId,opt)=>{
    upd(myId,t=>({...t,popularity:clamp((t.popularity||50)+opt.popMod,0,100),players:t.players.map(p=>({...p,morale:clamp((p.morale||60)+opt.moraleMod,0,100)}))}));
    notify("回答しました！ 人気"+(opt.popMod>=0?"+":"")+opt.popMod+" モラル"+(opt.moraleMod>=0?"+":"")+opt.moraleMod,"ok");
  };
  const handleTrade=(myOut,theirIn,tgtTeam,cash)=>{
    myOut.forEach(function(p){addToHistory(myId,p,"トレード");});
    setTeams(prev=>prev.map(t=>{
      if(t.id===myId){
        const np=[...t.players.filter(p=>!myOut.find(x=>x.id===p.id)),...theirIn];
        let nl=t.lineup.filter(id=>!myOut.find(x=>x.id===id));
        let nr=t.rotation.filter(id=>!myOut.find(x=>x.id===id));
        theirIn.filter(p=>!p.isPitcher).forEach(p=>{if(nl.length<9)nl=[...nl,p.id];});
        theirIn.filter(p=>p.isPitcher&&p.subtype==="先発").forEach(p=>{if(nr.length<6)nr=[...nr,p.id];});
        return{...t,players:np,lineup:nl,rotation:nr,budget:t.budget-(cash||0)*10000};
      }
      if(t.id===tgtTeam.id) return{...t,players:[...t.players.filter(p=>!theirIn.find(x=>x.id===p.id)),...myOut],budget:t.budget+(cash||0)*10000};
      return t;
    }));
    setCpuTradeOffers([]);
    notify("🔄 トレード成立！","ok");
    addNews({type:"trade",headline:"【移籍】"+(theirIn.map(p=>p.name).join("、")||"選手")+"が"+(myTeam?.name||"")+"へ",source:"Baseball Times",dateLabel:year+"年 "+gameDay+"日目",body:(myTeam?.name||"自チーム")+"と"+(tgtTeam?.name||"相手")+"の間でトレードが成立。"+(myTeam?.name||"")+"は"+(theirIn.map(p=>p.name).join("、")||"選手")+"を獲得し、"+(myOut.map(p=>p.name).join("、")||"選手")+"を放出した。"+(cash&&cash>0?"\nなお"+Math.abs(cash).toLocaleString()+"万円の金銭も含まれる。":"")});
  };
  const acceptCpuOffer=(idx)=>{const o=cpuTradeOffers[idx];if(!o)return;handleTrade(o.want,o.offer,o.from,-(o.cash||0)/10000);};
  const declineCpuOffer=(idx)=>{setCpuTradeOffers(prev=>prev.filter((_,i)=>i!==idx));notify("オファーを断りました","warn");};
  const handleMailRead=(id)=>{
    setMailbox(prev=>prev.map(m=>m.id===id?{...m,read:true}:m));
  };
  const handleMailAction=(id,action)=>{
    const mail=mailbox.find(m=>m.id===id);
    if(!mail||!mail.offer) return;
    if(action==="accept"){
      handleTrade(mail.offer.want,mail.offer.offer,mail.offer.from,-(mail.offer.cash||0)/10000);
    } else {
      notify('オファーを断りました','warn');
    }
    setMailbox(prev=>prev.map(m=>m.id===id?{...m,resolved:true,read:true}:m));
  };
  const tryGenerateCpuOffer=()=>{
    if(Math.random()>0.05||cpuTradeOffers.length>=2||!myTeam) return;
    const others=teams.filter(t=>t.id!==myId);
    if(!others.length) return;
    const cpuTeam=others[rng(0,others.length-1)];
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

  // 引退モーダル：引き留め
  const handleRetain=(p)=>{
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
  const handleAcceptRetire=(p)=>{
    setRetireModal({player:p,type:"retire_game"});
  };
  // 引退試合実施
  const handleStartRetireGame=(p)=>{
    upd(myId,t=>({...t,budget:t.budget+50000,players:t.players.map(x=>x.id===p.id?{...x,_retireRole:retireRole}:x)}));
    setRetireGamePlayer(p);
    setRetireModal(null);
    notify(p.name+"の引退試合！観客収入2倍","ok");
    addNews({type:"season",headline:"【引退試合】"+p.name+"選手の引退試合が開催",source:"野球速報",dateLabel:year+"年 "+gameDay+"日目",body:"満員の観衆が見守る中、"+p.name+"選手の引退試合が行われた。"});
  };
  // 引退試合なし
  const handleSkipRetireGame=(p)=>{
    upd(myId,t=>({...t,players:t.players.map(x=>x.id===p.id?{...x,isRetired:true,_retireNow:true}:x)}));
    setRetireModal(null);
    notify(p.name+"が引退しました","warn");
  };

  const handleNextYear=()=>{
    setYear(y=>y+1);setGameDay(1);setFaPool([]);setTeams(prev=>prev.map(t=>({...t,wins:0,losses:0,draws:0,rf:0,ra:0,rotIdx:0,players:t.players.filter(p=>!p._retireNow).map(p=>({...p,age:p.age+1,stats:emptyStats(),playoffStats:emptyStats(),injury:null,injuryDaysLeft:0,condition:clamp(p.condition+20,60,100),contractYearsLeft:Math.max(0,p.contractYearsLeft-1),growthPhase:p.age+1<=24?"growth":p.age+1<=29?"peak":p.age+1<=33?"earlydecline":"decline",retireStyle:p.retireStyle!==undefined?p.retireStyle:(p.age+1>=35?rng(0,100):undefined),careerLog:[...(p.careerLog||[]),{year,stats:{...p.stats},playoffStats:{...(p.playoffStats||emptyStats())}}]})),farm:t.farm.map(p=>({...p,age:p.age+1,stats:emptyStats(),injury:null}))})));setScreen("hub");setTab("roster");notify(`${year+1}年シーズン開幕！`,"ok");};

  const [news,setNews]=useState([]);
  const [mailbox,setMailbox]=useState([]);
  const [cpuTradeOffers,setCpuTradeOffers]=useState([]);
  const [draftPool,setDraftPool]=useState(null);
  const [draftResult,setDraftResult]=useState(null);
  const [playoff,setPlayoff]=useState(null);
  // initDraftPool is imported from engine/draft.js
  const handleDraftComplete=(pl,dr)=>{
    const myPicks=pl.filter(p=>dr[p.id]===myId);
    setTeams(prev=>prev.map(t=>{if(t.id!==myId) return t;return{...t,farm:[...t.farm,...myPicks.map(p=>({...p,育成:true}))]};}));
    handleNextYear();
  };

  // ── RENDER ──
  if(screen==="title"){const saveMeta=saveExists?getSaveMeta():null;return(<><div className="app"><div className="title"><div className="tlogo">⚾ BASEBALL<br/>MANAGER 2025</div><div className="tsub">NPB SIMULATION v2.1 — TACTICAL MODE</div>{saveMeta&&(<div style={{background:"rgba(74,222,128,.08)",border:"1px solid rgba(74,222,128,.3)",borderRadius:8,padding:"10px 14px",marginBottom:16,textAlign:"left"}}><div style={{fontSize:10,color:"#4ade80",letterSpacing:".1em",marginBottom:6}}>◈ セーブデータ</div><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}><div><div style={{fontWeight:700,fontSize:15}}>{saveMeta.teamEmoji} {saveMeta.teamName}</div><div style={{fontSize:11,color:"#94a3b8"}}>{saveMeta.year}年 第{saveMeta.gameDay}戦 {saveMeta.wins}勝{saveMeta.losses}敗</div><div style={{fontSize:9,color:"#64748b",marginTop:2}}>{saveMeta.savedAt}</div></div><div style={{display:"flex",gap:6,alignItems:"center"}}><button className="sim-btn" style={{margin:0,padding:"8px 18px",fontSize:13,background:"linear-gradient(135deg,#14532d,#166534)",borderColor:"rgba(74,222,128,.6)",color:"#4ade80"}} onClick={handleLoad}>▶ 続きから</button><button className="bsm bgr" style={{padding:"6px 10px"}} onClick={()=>{if(window.confirm('セーブデータを削除しますか？')){deleteSave();setSaveExists(false);}}}>削除</button></div></div></div>)}<div style={{fontSize:10,color:"#1e2d3d",letterSpacing:".2em",marginBottom:8,marginTop:saveExists?8:0,zIndex:1,position:"relative"}}>◈ 新規ゲーム — チームを選択</div><div style={{fontSize:10,color:"#1e2d3d",letterSpacing:".2em",marginBottom:8,zIndex:1,position:"relative"}}>◈ セントラルリーグ</div><div className="tgrid" style={{marginBottom:14}}>{TEAM_DEFS.filter(t=>t.league==="セ").map(t=><div key={t.id} className="tcard" style={{"--c":t.color}} onClick={()=>handleSelect(t.id)}><span style={{fontSize:24,display:"block",marginBottom:5}}>{t.emoji}</span><div className="tcard-nm">{t.name}</div></div>)}</div><div style={{fontSize:10,color:"#1e2d3d",letterSpacing:".2em",marginBottom:8,zIndex:1,position:"relative"}}>◈ パシフィックリーグ</div><div className="tgrid">{TEAM_DEFS.filter(t=>t.league==="パ").map(t=><div key={t.id} className="tcard" style={{"--c":t.color}} onClick={()=>handleSelect(t.id)}><span style={{fontSize:24,display:"block",marginBottom:5}}>{t.emoji}</span><div className="tcard-nm">{t.name}</div></div>)}</div></div></div></>);}

  if(screen==="mode_select") return(<><ModeSelectScreen myTeam={myTeam} oppTeam={currentOpp} gameDay={gameDay} onSelect={handleModeSelect} onBack={()=>setScreen("hub")}/></>);
  if(screen==="tactical_game"&&currentOpp) return(<><TacticalGameScreen myTeam={myTeam} oppTeam={currentOpp} onGameEnd={handleTacticalGameEnd}/></>);
  if(screen==="batch_result") return(<><BatchResultScreen results={batchResults} myTeam={myTeam} onEnd={()=>setScreen("hub")}/></>);

  if(screen==="result"&&gameResult) return(<><ResultScreen gsResult={gameResult} myTeam={myTeam} oppTeam={gameResult.oppTeam} gameDay={gameDay-1} onNext={()=>setScreen("hub")}/></>);

  if(screen==="retire_phase") return(<><RetirePhaseScreen teams={teams} myId={myId} year={year} onNext={(decisions)=>{
    // 引退処理
    if(decisions){Object.entries(decisions).forEach(function(e){const pid=e[0];const dec=e[1];const p=myTeam?.players.find(function(x){return x.id===pid;});if(!p) return;if(dec==="accepted"||dec==="retain_failed"){upd(myId,function(t){return{...t,players:t.players.map(function(x){return x.id===pid?{...x,isRetired:true,_retireNow:true}:x;})};});addToHistory(myId,p,"引退");addNews({type:"season",headline:"【引退】"+p.name+"選手が現役引退",source:"野球速報",dateLabel:year+"年",body:p.name+"選手（"+p.age+"歳）が"+year+"年シーズンをもって現役を引退した。"});}else if(dec==="retained"){notify(p.name+"の引き留め成功！","ok");}});
    }
    // 選手成長・劣化処理 + 他チーム引退 + ファーム育成（全チーム同期計算）
    let mySummary=null;
    const developedTeams=teams.map(t=>{
      // 他チーム引退判定（実際にロスターから除去）
      const retiredIds=t.id!==myId
        ? new Set(t.players.filter(p=>p.age>=35&&rollRetire(p)).map(p=>{
            addNews({type:"season",headline:"【引退】"+p.name+"（"+t.name+"）が引退",source:"野球速報",dateLabel:year+"年",body:p.name+"選手（"+p.age+"歳）が引退を発表。"});
            return p.id;
          }))
        : new Set();
      const activePlayers=t.players.filter(p=>!retiredIds.has(p.id));
      // 成長・劣化（一軍・ファーム両方）
      const res=developPlayers(activePlayers, t.coaches||[]);
      const farmRes=developPlayers(t.farm, t.coaches||[]);
      if(t.id===myId)mySummary=res.summary;
      // CPUチーム: 引退した分をファームの有望株から昇格補充
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
      return{...t,players:finalPlayers,farm:finalFarm};
    });
    // CPU 球団の契約満了選手を再契約（失敗は自由契約として faPool へ）
    const renewResult=cpuRenewContracts(developedTeams,myId,developedTeams);
    const finalTeams=renewResult.updatedTeams;
    setTeams(finalTeams);
    setFaPool(prev=>[...prev,...renewResult.newFaPlayers]);
    renewResult.news.forEach(n=>addNews(n));
    setDevelopmentSummary(mySummary);
    // シーズン表彰計算
    const awards=calcSeasonAwards(finalTeams,year);
    const newRec=updateRecords(seasonHistory.records,finalTeams);
    const allAlumni=finalTeams.flatMap(t=>t.history||[]);
    const newHoF=[...seasonHistory.hallOfFame,...checkHallOfFame(seasonHistory.hallOfFame,allAlumni,year)];
    setSeasonHistory(prev=>({...prev,awards:[...prev.awards,awards],records:newRec,hallOfFame:newHoF}));
    setScreen("development_phase");
  }}/></> );
  if(screen==="development_phase") return(<><GrowthSummaryScreen summary={developmentSummary} year={year} onNext={()=>setScreen("waiver_phase")}/></>);
  if(screen==="waiver_phase") return(<><WaiverPhaseScreen teams={teams} myId={myId} year={year} onRelease={(pid)=>{const p=myTeam?.players.find(x=>x.id===pid);upd(myId,t=>({...t,players:t.players.filter(x=>x.id!==pid)}));if(p) setFaPool(prev=>[...prev,{...p,isFA:true}]);}} onNext={(markedIds)=>{
  // プレイヤーの戦力外処理（同期的に収集）
  const waiverReleased=[];
  markedIds.forEach(pid=>{const p=myTeam?.players.find(x=>x.id===pid);upd(myId,t=>({...t,players:t.players.filter(x=>x.id!==pid)}));if(p){addToHistory(myId,p,"戦力外");waiverReleased.push({...p,isFA:true});addNews({type:"season",headline:"【戦力外】"+p.name+"選手に戦力外通告",source:"野球速報",dateLabel:year+"年",body:p.name+"選手（"+p.age+"歳）が戦力外通告を受けた。"});}});
  // CPU 球団が FA 市場で獲得（戦力外含む全 FA プールが対象）
  const combinedPool=[...faPool,...waiverReleased];
  const faResult=processCpuFaBids(teams,myId,combinedPool,teams);
  setTeams(faResult.updatedTeams);
  setFaPool(faResult.remainingFaPool);
  faResult.news.forEach(n=>addNews(n));
  setFaYears({});
  setDraftPool(initDraftPool(myTeam));setScreen("draft_preview");}}/></> );
  if(screen==="playoff"&&playoff) return(<><PlayoffScreen playoff={playoff} setPlayoff={setPlayoff} teams={teams} myId={myId} year={year} onFinish={()=>setScreen("retire_phase")}/></>);
  if(screen==="draft_preview"&&draftPool) return(<><DraftPreviewScreen teams={teams} myId={myId} year={year} pool={draftPool} onStart={()=>setScreen("draft_lottery")}/></>);
  if(screen==="draft_lottery"&&draftPool) return(<><DraftLotteryScreen teams={teams} myId={myId} year={year} pool={draftPool} onDone={(r1)=>{setDraftPool(prev=>prev.map(p=>{const winner=Object.entries(r1).find(function(e){return e[1]&&e[1].id===p.id;});return{...p,_drafted:winner?true:undefined,_r1winner:winner?winner[0]:undefined};}));setScreen("draft");}}/></>);
  if(screen==="draft"&&draftPool) return(<><DraftScreen teams={teams} myId={myId} year={year} pool={draftPool} onDraftDone={(pl,dr)=>{setDraftResult({pool:pl,drafted:dr});setScreen("draft_review");}}/></>);
  if(screen==="draft_review"&&draftResult) return(<><DraftReviewScreen teams={teams} myId={myId} year={year} pool={draftResult.pool} drafted={draftResult.drafted} onEnd={()=>handleDraftComplete(draftResult.pool,draftResult.drafted)}/></>);

  const g=(myTeam?.wins||0)+(myTeam?.losses||0);
  const remain=SEASON_GAMES-g;

  return(<><div className="app"><div className="hub">
    <div className="topbar">
      <span style={{fontSize:26}}>{myTeam?.emoji}</span>
      <div style={{flex:1}}><div style={{fontWeight:700,fontSize:14,color:myTeam?.color}}>{myTeam?.name}</div><div style={{fontSize:10,color:"#374151"}}>{year}年 / 第{gameDay}戦 / 残り{remain}試合</div></div>
      <div style={{display:"flex",gap:5,flexWrap:"wrap"}}><span className="chip cg">{myTeam?.wins}勝</span><span className="chip cr">{myTeam?.losses}敗</span><span className="chip cy">{fmtM(myTeam?.budget||0)}</span></div>
      <div className="tb-record">{myTeam?.wins}勝{myTeam?.losses}敗</div>
      <button style={{background:"rgba(74,222,128,.1)",border:"1px solid rgba(74,222,128,.4)",color:"#4ade80",borderRadius:6,padding:"4px 10px",fontSize:11,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}} onClick={handleSave}>💾 保存</button>
    </div>

    {notif&&<div className={`notif ${notif.type==="ok"?"nok":notif.type==="warn"?"nwarn":"nbad"}`}>{notif.msg}</div>}

    {gameDay<=SEASON_GAMES&&(
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:10}}>
        <button className="sim-btn" style={{margin:0,fontSize:12}} onClick={handleStartGame}>
          ⚾ 1試合<br/><span style={{fontSize:9,opacity:.7}}>采配 or オート</span>
        </button>
        <button className="sim-btn" style={{margin:0,fontSize:12,background:"linear-gradient(135deg,#071a2c,#0d2840)",borderColor:"rgba(96,165,250,.5)",color:"#60a5fa"}} onClick={handleBatchSim}>
          ⚡ {Math.min(BATCH,SEASON_GAMES-(gameDay-1))}試合まとめて<br/><span style={{fontSize:9,opacity:.7}}>オートシム</span>
        </button>
        <button className="sim-btn" style={{margin:0,fontSize:12,background:"linear-gradient(135deg,#1a0730,#2d0f50)",borderColor:"rgba(167,139,250,.5)",color:"#a78bfa"}} onClick={handleSeasonSim}>
          🚀 残り全{remain}試合<br/><span style={{fontSize:9,opacity:.7}}>シーズン一括消化</span>
        </button>
      </div>
    )}

    <div className="tabs">
      {[["roster","👥 ロースター"],["news","📰 ニュース"],["mailbox","📨 メール"],["trade","🔄 トレード"],["alumni","📖 歴代"],["contract","📝 契約"],["fa","🏪 FA"],["scout","🔍 スカウト"],["finance","💴 財務"],["standings","🏆 順位"],["stats","📊 成績"],["records","🏛 記録"]].map(([id,l])=>(
        <button key={id} className={`tab ${tab===id?"on":""}`} onClick={()=>setTab(id)}>
          {l}{id==="mailbox"&&mailbox.filter(m=>!m.read).length>0&&<span style={{marginLeft:4,background:"#f87171",color:"#fff",borderRadius:8,padding:"0 5px",fontSize:9,fontWeight:700}}>{mailbox.filter(m=>!m.read).length}</span>}
        </button>
      ))}
    </div>

    {tab==="roster"&&<RosterTab team={myTeam} onToggle={toggleLineup} onSetStarter={setStarter} onPromo={promote} onDemo={demote} onSetTrainingFocus={setTrainingFocus}/>}
    {tab==="records"&&<RecordsTab history={seasonHistory}/>}
    {tab==="news"&&<NewsTab news={news} onInterview={handleInterview}/>}
    {tab==="mailbox"&&<MailboxTab mailbox={mailbox} onRead={handleMailRead} onAction={handleMailAction} teams={teams} myTeam={myTeam} onTrade={handleTrade}/>}
    {tab==="trade"&&(()=>{const pendingTrades=mailbox.filter(m=>m.type==="trade"&&!m.resolved);return<TradeTab myTeam={myTeam} teams={teams} onTrade={handleTrade} cpuOffers={pendingTrades.map(m=>m.offer)} onAcceptOffer={(idx)=>handleMailAction(pendingTrades[idx].id,"accept")} onDeclineOffer={(idx)=>handleMailAction(pendingTrades[idx].id,"decline")} deadlinePassed={gameDay>95}/>;})()}
    {tab==="contract"&&<ContractTab team={myTeam} allTeams={teams} onOffer={handleContractOffer} onRelease={pid=>{const p=myTeam?.players.find(x=>x.id===pid);upd(myId,t=>({...t,players:t.players.filter(x=>x.id!==pid)}));if(p){addToHistory(myId,p,"自由契約");setFaPool(prev=>[...prev,{...p,isFA:true}]);}notify("放出しました","warn");}}/>}
    {tab==="alumni"&&<AlumniTab myTeam={myTeam}/>}
    {tab==="fa"&&(
      <div className="card">
        <div className="card-h">FA市場 ({faPool.length}人)</div>
        {faPool.length===0&&<p style={{color:"#2a3a4c",fontSize:12}}>現在FA選手はいません</p>}
        {faPool.map((p,i)=>{
          const yrs=faYears[p.id]||1;
          const totalCost=p.salary*yrs;
          const canAfford=myTeam.budget>=totalCost;
          return(
          <div key={p.id} className="card2">
            <div className="fsb" style={{flexWrap:"wrap",gap:6}}>
              <div><span style={{fontWeight:700,fontSize:13}}>{p.name}</span><span style={{fontSize:10,color:"#374151",marginLeft:8}}>{p.pos}/{p.age}歳 {fmtSal(p.salary)}/年</span></div>
              <div style={{display:"flex",gap:4,alignItems:"center",flexWrap:"wrap"}}>
                <span style={{fontSize:10,color:"#374151"}}>契約年数:</span>
                {[1,2,3].map(y=><button key={y} className={"bsm "+(yrs===y?"bgb":"bga")} style={{padding:"2px 8px"}} onClick={()=>setFaYears(prev=>({...prev,[p.id]:y}))}>{y}年</button>)}
                <button className="bsm bga" style={{marginLeft:4,opacity:canAfford?1:0.4}} onClick={()=>{if(!canAfford){notify("予算不足","warn");return;}if(p.isForeign&&myTeam.players.filter(x=>x.isForeign).length>=MAX_外国人_一軍){notify(`外国人枠は${MAX_外国人_一軍}名まで`,"warn");return;}upd(myId,t=>({...t,budget:t.budget-totalCost,players:[...t.players,{...p,isFA:false,contractYearsLeft:yrs}]}));setFaPool(prev=>prev.filter((_,j)=>j!==i));setFaYears(prev=>{const n={...prev};delete n[p.id];return n;});notify(`${p.name}を獲得！(${yrs}年 計${fmtSal(totalCost)})`,"ok");}}>獲得</button>
              </div>
            </div>
          </div>
          );
        })}
      </div>
    )}
    {tab==="scout"&&(
      <div>
        {myTeam?.scoutResults.length>0&&<div className="card"><div className="card-h">スカウト報告</div>{myTeam.scoutResults.map((p,i)=><div key={p.id} className="card2"><div className="fsb"><span style={{fontWeight:700}}>{p.name} <span style={{fontSize:10,color:"#374151"}}>{p.pos}/{p.age}歳</span></span><div style={{display:"flex",gap:6}}><button className="bsm bga" onClick={()=>signPlayer(i)}>獲得</button><button className="bsm bgr" onClick={()=>upd(myId,t=>({...t,scoutResults:t.scoutResults.filter((_,j)=>j!==i)}))}>見送り</button></div></div></div>)}</div>}
        <div className="card"><div className="card-h">スカウト派遣</div><div className="g2">{SCOUT_REGIONS.map(sr=><div key={sr.id} className="card2" style={{cursor:"pointer"}} onClick={()=>sendScout(sr)}><div style={{fontWeight:700,fontSize:12,marginBottom:3}}>{sr.name}</div><div style={{fontSize:10,color:"#374151"}}>費用:{fmtSal(sr.cost)} / Lv{sr.qMin}〜{sr.qMax}</div></div>)}</div></div>
      </div>
    )}
    {tab==="finance"&&<FinanceTab team={myTeam}/>}
    {tab==="standings"&&<StandingsTab teams={teams} myId={myId}/>}
    {tab==="stats"&&<StatsTab teams={teams} myId={myId}/>}

    {tab==="roster"&&(
      <div className="card">
        <div className="card-h">コーチ陣</div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10}}>{myTeam?.coaches.map((c,i)=><div key={i} className="card2" style={{display:"flex",alignItems:"center",gap:8,flex:"1 1 190px"}}><span style={{fontSize:18}}>{c.emoji}</span><div style={{flex:1}}><div style={{fontSize:12,fontWeight:700}}>{c.typeName} <span style={{color:"#f5c842",fontSize:10}}>Lv{c.grade}</span></div><div style={{fontSize:10,color:"#374151"}}>{c.name}</div></div><button className="bsm bgr" onClick={()=>fireCoach(i)}>解雇</button></div>)}</div>
        <details><summary style={{fontSize:11,color:"#374151",cursor:"pointer"}}>+ コーチを雇う</summary><div className="g2" style={{marginTop:8}}>{COACH_DEFS.map(cd=>COACH_GRADES.map(cg=>{const hired=myTeam?.coaches.some(c=>c.type===cd.type&&c.grade===cg.g);return <div key={cd.type+cg.g} className="card2" style={{opacity:hired?0.5:1}}><div className="fsb"><span style={{fontSize:11}}>{cd.emoji}{cd.name} Lv{cg.g}</span><button className="bsm bga" disabled={hired} onClick={()=>hireCoach(cd,cg)}>{hired?"済":"雇う"}</button></div><div style={{fontSize:10,color:"#374151",marginTop:2}}>{fmtSal(cg.salary)}/月 · +{cg.bonus}成長</div></div>;}))}</div></details>
      </div>
    )}
    <RetireModal modal={retireModal} retireRole={retireRole} setRetireRole={setRetireRole} onRetain={()=>handleRetain(retireModal.player)} onAccept={()=>handleAcceptRetire(retireModal.player)} onStartRetireGame={()=>handleStartRetireGame(retireModal.player)} onSkipRetireGame={()=>handleSkipRetireGame(retireModal.player)}/>
  </div></div></>);
}
