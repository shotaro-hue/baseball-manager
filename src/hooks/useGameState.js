import { useState, useReducer, useMemo, useCallback, useEffect } from "react";
import { gameStateReducer, G } from './gameStateReducer';
import { uid, clamp, rng, pname, scoutedValue } from '../utils';
import { buildTeam, makePlayer, resolveTrainingFocusFromGoal, generateForeignFaPool } from '../engine/player';
import { saveGame, hasSave } from '../engine/saveload';
import { generateSeasonSchedule, calcAllStarTriggerDay } from '../engine/scheduleGen';
import { buildRealTeam } from '../engine/realplayer';
import { NPB2025_ROSTERS } from '../data/npb2025';
import { SEASON_PARAMS, getDefaultParams } from '../data/scheduleParams.js';
import {
  TEAM_DEFS, POSITIONS, COACH_DEFS, COACH_GRADES, SCOUT_REGIONS,
  MAX_ROSTER, MAX_FARM, MAX_外国人_一軍, MIN_SALARY_SHIHAKA,
  MAX_SHIHAKA_TOTAL, REGISTRATION_COOLDOWN_DAYS, TALK_COOLDOWN_DAYS,
  PRESS_CONFERENCE_INTERVAL,
  FOREIGN_FA_COUNT_MIN, FOREIGN_FA_COUNT_MAX,
} from '../constants';
import { pickQuestion, calcPressDelta } from '../engine/pressConference';

const INIT_TEAMS = TEAM_DEFS.map(function(d){
  const t = NPB2025_ROSTERS[d.id] ? buildRealTeam(d, NPB2025_ROSTERS[d.id]) : buildTeam(d);
  t.history = []; return t;
});

export function useGameState() {
  const [screen, setScreen] = useState("title");
  const [retireModal, setRetireModal] = useState(null);
  const [playerModal, setPlayerModal] = useState(null);
  const [teamModal, setTeamModal] = useState(null);
  const [retireGamePlayer, setRetireGamePlayer] = useState(null);
  const [retireRole, setRetireRole] = useState(null);
  const [gameState, dispatch] = useReducer(gameStateReducer, { teams: INIT_TEAMS, gameDay: 1, year: 2025, myId: null });
  const { teams, gameDay, year, myId } = gameState;
  const setTeams   = useCallback((n) => dispatch({ type: G.SET_TEAMS,    teams: n }),    []);
  const setGameDay = useCallback((n) => dispatch({ type: G.SET_GAME_DAY, day:   n }),    []);
  const setYear    = useCallback((n) => dispatch({ type: G.SET_YEAR,     year:  n }),    []);
  const setMyId    = useCallback((id) => dispatch({ type: G.SET_MY_ID,   myId:  id }),   []);
  const [tab, setTab] = useState("dashboard");
  const [faPool, setFaPool] = useState(() => generateForeignFaPool(rng(FOREIGN_FA_COUNT_MIN, FOREIGN_FA_COUNT_MAX)));
  const [faYears, setFaYears] = useState({});
  const [notif, setNotif] = useState(null);
  const [seasonHistory, setSeasonHistory] = useState({awards:[],records:{singleSeasonHR:null,singleSeasonAVG:null,singleSeasonK:null,careerHR:{},careerW:{}},hallOfFame:[],championships:[],standingsHistory:[]});
  const [saveExists, setSaveExists] = useState(()=>hasSave());
  const [schedule, setSchedule] = useState(null);
  const [news, setNews] = useState([]);
  const [mailbox, setMailbox] = useState([]);
  const [recentResults, setRecentResults] = useState([]);
  const [gameResultsMap, setGameResultsMap] = useState({});
  const [cpuTradeOffers, setCpuTradeOffers] = useState([]);
  const [pressEvent, setPressEvent] = useState(null);  // 記者会見イベント
  const [lastPressDay, setLastPressDay] = useState(0); // 最後に記者会見を行ったgameDay
  const [allStarDone, setAllStarDone] = useState(false);
  const [allStarResult, setAllStarResult] = useState(null);
  const [allStarTriggerDay, setAllStarTriggerDay] = useState(72);

  // gameDay が進んだとき、記者会見インターバルを超えていれば会見イベントをセット
  useEffect(()=>{
    if(!myId || gameDay <= 1 || gameDay > 143) return;
    if(pressEvent) return; // 既にイベント表示中
    if(gameDay - lastPressDay >= PRESS_CONFERENCE_INTERVAL){
      setPressEvent(pickQuestion(gameDay));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[gameDay, myId]);

  // シーズン日程をyear変更時に再生成（チームID・リーグ構成は不変なのでteams.lengthで十分）
  useEffect(()=>{
    if(teams.length===12){
      const newSchedule = generateSeasonSchedule(year,teams);
      setSchedule(newSchedule);
      const params = SEASON_PARAMS[year] || getDefaultParams(year);
      setAllStarTriggerDay(calcAllStarTriggerDay(newSchedule, params.allStarSkipDates));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[year,teams.length]);

  const myTeam = useMemo(()=>teams.find(t=>t.id===myId),[teams,myId]);
  const tabBadges = useMemo(()=>{
    if(!myTeam) return {};
    const expiringCount=myTeam.players.filter(p=>!p.isIkusei&&(p.contractYearsLeft??99)<=1).length;
    const pendingTrades=mailbox.filter(m=>m.type==="trade"&&!m.resolved&&!m.read).length;
    const unreadMail=mailbox.filter(m=>!m.read).length;
    const unreadInterviews=news.filter(n=>n.type==="interview"&&!n.answered).length;
    return {
      roster: myTeam.players.filter(p=>!p.isIkusei).length>MAX_ROSTER?{n:myTeam.players.filter(p=>!p.isIkusei).length-MAX_ROSTER,color:"#f87171"}:null,
      contract: expiringCount>0?{n:expiringCount,color:"#f5c842"}:null,
      trade: pendingTrades>0?{n:pendingTrades,color:"#f97316"}:null,
      mailbox: unreadMail>0?{n:unreadMail,color:pendingTrades>0?"#f97316":"#f5c842"}:null,
      fa: faPool.length>0?{n:faPool.length,color:"#94a3b8"}:null,
      news: unreadInterviews>0?{n:unreadInterviews,color:"#f5c842"}:null,
    };
  },[myTeam,mailbox,faPool,news]);

  const notify = useCallback((msg,type="ok")=>{setNotif({msg,type});setTimeout(()=>setNotif(null),3500);},[]);
  const upd = useCallback((id, fn) => dispatch({ type: G.UPD_TEAM, id, fn }), []);

  const pushResult = useCallback((won,drew,oppName,myScore,oppScore,gameNo)=>{
    setRecentResults(prev=>[{won,drew,oppName,myScore,oppScore,gameNo},...prev].slice(0,5));
  },[]);

  const pushGameResult = useCallback((gameNo, result)=>{
    setGameResultsMap(prev=>({...prev,[gameNo]:result}));
  },[]);

  const addNews = useCallback((article)=>{
    setNews(prev=>[{id:uid(),timestamp:Date.now(),...article},...prev].slice(0,50));
  },[]);

  const addToHistory = useCallback((teamId,player,exitReason)=>{
    if(!player) return;
    setTeams(prev=>prev.map(function(t){
      if(t.id!==teamId) return t;
      const joinYear=(player.careerLog&&player.careerLog.length>0)?player.careerLog[0].year:0;
      const tenure=joinYear>0?year-joinYear+1:1;
      const record=Object.assign({},player,{exitYear:year,exitReason:exitReason,tenure:tenure});
      return Object.assign({},t,{history:[...(t.history||[]),record]});
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[year]);

  // オートセーブ（hubに戻った時）
  useEffect(()=>{
    if(screen!=='hub') return;
    const result=saveGame({teams,myId,gameDay,year,faPool,faYears,seasonHistory,news,mailbox});
    if(result.ok){setSaveExists(true);notify('💾 オートセーブ','ok');}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[screen]);

  const handleSave = useCallback(()=>{
    const result=saveGame({teams,myId,gameDay,year,faPool,faYears,seasonHistory,news,mailbox});
    if(result.ok) setSaveExists(true);
    notify(result.ok?'💾 セーブしました':result.quota?'💾 ストレージ容量が不足しています':'セーブに失敗しました',result.ok?'ok':'warn');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[teams,myId,gameDay,year,faPool,faYears,seasonHistory,news,mailbox,notify]);

  const handleSelect = useCallback((id)=>{
    setMyId(id);
    setScreen("hub");
    setTab("dashboard");
    const newSchedule = generateSeasonSchedule(year,teams);
    setSchedule(newSchedule);
    const params = SEASON_PARAMS[year] || getDefaultParams(year);
    setAllStarTriggerDay(calcAllStarTriggerDay(newSchedule, params.allStarSkipDates));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[year,teams]);

  const handlePlayerClick = useCallback((player,teamName)=>setPlayerModal({player,teamName}),[]);
  const handleTeamClick = useCallback((team)=>setTeamModal(team),[]);

  const setTrainingFocus = useCallback((pid,focus)=>upd(myId,t=>({...t,players:t.players.map(p=>p.id===pid?{...p,trainingFocus:focus}:p)})),[upd,myId]);

  const setDevGoal = useCallback((pid, goal) => {
    upd(myId, t => {
      const updateP = p => {
        if (p.id !== pid) return p;
        const updated = { ...p, devGoal: goal || null };
        updated.trainingFocus = resolveTrainingFocusFromGoal(updated);
        return updated;
      };
      return { ...t, players: t.players.map(updateP), farm: t.farm.map(updateP) };
    });
  }, [upd, myId]);

  const handlePlayerTalk = useCallback((pid, talkType) => {
    const p = myTeam?.players.find(x => x.id === pid);
    if (!p) return;
    if ((p.lastTalkGameDay ?? 0) > 0 && gameDay - p.lastTalkGameDay < TALK_COOLDOWN_DAYS) {
      notify(`${p.name}とは今月済みです`, "warn"); return;
    }
    const pa = p.stats?.PA ?? 0;
    const bf = p.stats?.BF ?? 0;
    let delta = 0;
    switch (talkType) {
      case "praise":       delta = rng(5, 15); break;
      case "playing_time": delta = (p.isPitcher ? bf < 80 : pa < 200) ? rng(8, 15) : rng(3, 8); break;
      case "contract":     delta = p.salary < 10000000 ? rng(5, 12) : rng(2, 6); break;
      case "trade_rumor":  delta = (p.personality?.overseas ?? 50) >= 60 ? rng(-5, 3) : rng(2, 8); break;
      default:             delta = rng(3, 10);
    }
    upd(myId, t => ({...t, players: t.players.map(x => x.id === pid
      ? {...x, morale: clamp((x.morale ?? 70) + delta, 0, 100), lastTalkGameDay: gameDay}
      : x)}));
    const TALK_LABELS = { praise:"激励", playing_time:"出場機会", contract:"契約", trade_rumor:"噂否定" };
    notify(`${p.name}「${TALK_LABELS[talkType]}」— モラル${delta >= 0 ? "+" : ""}${delta}`, delta >= 0 ? "ok" : "warn");
  }, [myTeam, gameDay, upd, myId, notify]);

  const handleInterview = useCallback((newsId,opt)=>{
    upd(myId,t=>({...t,popularity:clamp((t.popularity||50)+opt.popMod,0,100),players:t.players.map(p=>({...p,morale:clamp((p.morale||60)+opt.moraleMod,0,100)}))}));
    setNews(prev=>prev.map(n=>n.id===newsId?{...n,answered:true}:n));
    notify("回答しました！ 人気"+(opt.popMod>=0?"+":"")+opt.popMod+" モラル"+(opt.moraleMod>=0?"+":"")+opt.moraleMod,"ok");
  },[upd,myId,notify,setNews]);

  const toggleLineup = useCallback((pid)=>{
    if(!myTeam) return;
    const inL=myTeam.lineup.includes(pid);
    const p=myTeam.players.find(x=>x.id===pid);
    if(p?.isPitcher){notify("投手は打線に入れられません","warn");return;}
    if(p?.injury){notify("故障中は出場不可","warn");return;}
    if(!inL&&myTeam.lineup.length>=9){notify("打線は最大9人です","warn");return;}
    if(inL&&myTeam.lineup.length<=4){notify("最低4人必要です","warn");return;}
    upd(myId,t=>({...t,lineup:inL?t.lineup.filter(id=>id!==pid):[...t.lineup,pid]}));
  },[myTeam,upd,myId,notify]);

  const setStarter = useCallback((pid)=>{upd(myId,t=>({...t,rotation:t.rotation.includes(pid)?t.rotation:[...t.rotation,pid]}));notify("先発ローテに追加","ok");},[upd,myId,notify]);
  const moveRotation = useCallback((pid,dir)=>upd(myId,t=>{const r=[...t.rotation];const i=r.indexOf(pid);if(i<0)return t;const j=i+dir;if(j<0||j>=r.length)return t;[r[i],r[j]]=[r[j],r[i]];return{...t,rotation:r};}),[upd,myId]);
  const removeFromRotation = useCallback((pid)=>upd(myId,t=>({...t,rotation:t.rotation.filter(id=>id!==pid)})),[upd,myId]);
  const setPitchingPattern = useCallback((patch)=>upd(myId,t=>({...t,pitchingPattern:{...(t.pitchingPattern??{}), ...patch}})),[upd,myId]);

  const promote = useCallback((pid)=>{
    if(!myTeam) return;
    const p=myTeam.farm.find(x=>x.id===pid);
    if(!p) return;
    if(p.育成){notify("育成選手は一軍出場不可。先に支配下登録してください","warn");return;}
    if(myTeam.players.length>=MAX_ROSTER){notify("一軍枠満杯","warn");return;}
    if (p.isForeign) {
      const foreignPlayers = myTeam.players.filter(x => x.isForeign);
      if (foreignPlayers.length >= MAX_外国人_一軍) {
        notify(`外国人枠は${MAX_外国人_一軍}名まで`,"warn");
        return;
      }
      const foreignPitchers = foreignPlayers.filter(x => x.isPitcher).length;
      const foreignBatters = foreignPlayers.length - foreignPitchers;
      const wouldBeAllPitchers = p.isPitcher && foreignPlayers.length === MAX_外国人_一軍 - 1 && foreignPitchers === MAX_外国人_一軍 - 1;
      const wouldBeAllBatters = !p.isPitcher && foreignPlayers.length === MAX_外国人_一軍 - 1 && foreignBatters === MAX_外国人_一軍 - 1;
      if (wouldBeAllPitchers || wouldBeAllBatters) {
        notify("外国人登録は投手4名または野手4名のみにはできません", "warn");
        return;
      }
    }
    if((p.registrationCooldownDays??0)>0){notify(`登録抹消後10日ルール: あと${p.registrationCooldownDays}日は昇格不可`,"warn");return;}
    upd(myId,t=>({...t,players:[...t.players,p],farm:t.farm.filter(x=>x.id!==pid)}));
    notify(`${p.name}を一軍昇格！`,"ok");
  },[myTeam,upd,myId,notify]);

  const convertIkusei = useCallback((pid)=>{
    if(!myTeam) return;
    const p=myTeam.farm.find(x=>x.id===pid);
    if(!p||!p.育成) return;
    // 支配下70人枠チェック
    const shihakaNow=myTeam.players.filter(x=>!x.育成).length+myTeam.farm.filter(x=>!x.育成).length;
    if(shihakaNow>=MAX_SHIHAKA_TOTAL){notify(`支配下上限（${MAX_SHIHAKA_TOTAL}人）到達。支配下登録不可`,"warn");return;}
    if(myTeam.players.length>=MAX_ROSTER){notify("支配下枠満杯（最大"+MAX_ROSTER+"名）","warn");return;}
    const minSal=MIN_SALARY_SHIHAKA;
    const newSal=Math.max(p.salary,minSal);
    const diff=newSal-p.salary;
    if(diff>0&&myTeam.budget<diff){notify("予算不足（差額"+Math.round(diff/10000)+"万円必要）","warn");return;}
    upd(myId,t=>({...t,budget:t.budget-diff,farm:t.farm.map(x=>x.id===pid?{...x,育成:false,salary:newSal,contractYears:1,contractYearsLeft:1,ikuseiYears:0}:x)}));
    notify(`${p.name}を支配下登録！`,"ok");
  },[myTeam,upd,myId,notify]);

  const demote = useCallback((pid)=>{
    if(!myTeam) return;
    const p=myTeam.players.find(x=>x.id===pid);
    if(!p) return;
    if(myTeam.farm.length>=MAX_FARM){notify("二軍満杯","warn");return;}
    // 手動降格: 登録抹消クールダウン10日をセット
    const demotedPlayer={...p,registrationCooldownDays:REGISTRATION_COOLDOWN_DAYS};
    upd(myId,t=>({...t,players:t.players.filter(x=>x.id!==pid),lineup:t.lineup.filter(id=>id!==pid),rotation:t.rotation.filter(id=>id!==pid),farm:[...t.farm,demotedPlayer]}));
    notify(`${p.name}を二軍降格（再登録まで${REGISTRATION_COOLDOWN_DAYS}日）`,"warn");
  },[myTeam,upd,myId,notify]);

  const hireCoach = useCallback((cd,cg)=>{
    if(!myTeam||myTeam.budget<cg.salary*12){notify("予算不足","warn");return;}
    upd(myId,t=>({...t,budget:t.budget-cg.salary*12,coaches:[...t.coaches,{type:cd.type,typeName:cd.name,emoji:cd.emoji,name:pname(),grade:cg.g,label:cg.label,salary:cg.salary*12,bonus:cg.bonus}]}));
    notify(`${cd.name}(Lv${cg.g})を雇いました！`,"ok");
  },[myTeam,upd,myId,notify]);

  const fireCoach = useCallback((idx)=>{
    upd(myId,t=>({...t,coaches:t.coaches.filter((_,i)=>i!==idx)}));
    notify("コーチを解雇","warn");
  },[upd,myId,notify]);

  const sendScout = useCallback((region)=>{
    if(!myTeam||myTeam.budget<region.cost){notify("予算不足","warn");return;}
    upd(myId,t=>({...t,budget:t.budget-region.cost,scoutMissions:[...t.scoutMissions,{id:uid(),name:region.name,weeksLeft:region.weeks,qMin:region.qMin,qMax:region.qMax,cost:region.cost,foreign:region.foreign,regionFactor:region.regionFactor||1.0}]}));
    notify(`${region.name}へスカウト派遣！`,"ok");
    setTimeout(()=>{
      upd(myId,t=>{const mis=t.scoutMissions.find(m=>m.name===region.name);if(!mis) return t;const np=makePlayer(Math.random()<0.4?"先発":POSITIONS[rng(0,7)],rng(mis.qMin,mis.qMax),Math.random()<0.4,undefined,mis.foreign&&Math.random()<0.7);return{...t,scoutMissions:t.scoutMissions.filter(m=>m!==mis),scoutResults:[...t.scoutResults,{...np,_scoutRegionFactor:mis.regionFactor||1.0,_scoutBudgetFactor:t.budget>300000?0.7:t.budget>150000?0.85:1.0}]};});
      notify("スカウト報告が届きました！","ok");
    },3000);
  },[myTeam,upd,myId,notify]);

  const signPlayer = useCallback((idx)=>{
    if(!myTeam) return;
    const p=myTeam.scoutResults[idx];
    if(!p||myTeam.budget<p.salary){notify("予算不足","warn");return;}
    if(myTeam.farm.length>=MAX_FARM){notify("二軍枠満杯","warn");return;}
    upd(myId,t=>({...t,budget:t.budget-p.salary,farm:[...t.farm,{...p,contractYearsLeft:2}],scoutResults:t.scoutResults.filter((_,i)=>i!==idx)}));
    notify(`${p.name}を獲得！`,"ok");
  },[myTeam,upd,myId,notify]);

  const handlePressAnswer = useCallback((choiceIdx) => {
    if (!pressEvent) return;
    const choice = pressEvent.choices[choiceIdx];
    const { popDelta, moraleDelta } = calcPressDelta(choice);
    upd(myId, t => ({
      ...t,
      popularity: Math.min(100, Math.max(0, (t.popularity ?? 50) + popDelta)),
      players: t.players.map(p => ({
        ...p,
        morale: Math.min(100, Math.max(0, (p.morale ?? 70) + moraleDelta)),
      })),
    }));
    notify(
      `記者会見「${choice.label}」— 人気${popDelta >= 0 ? '+' : ''}${popDelta} チームモラル${moraleDelta >= 0 ? '+' : ''}${moraleDelta}`,
      popDelta + moraleDelta >= 0 ? 'ok' : 'warn',
    );
    setPressEvent(null);
    setLastPressDay(gameDay);
  }, [pressEvent, upd, myId, notify, gameDay]);

  const handleStadiumUpgrade = useCallback(()=>{
    if(!myTeam) return;
    const lvl=myTeam.stadiumLevel??0;
    const UPGRADE_COSTS=[5000000,10000000,20000000];
    if(lvl>=3){notify("球場はすでに最高レベルです","warn");return;}
    const cost=UPGRADE_COSTS[lvl];
    if(myTeam.budget<cost){notify("予算不足","warn");return;}
    upd(myId,t=>({...t,budget:t.budget-cost,stadiumLevel:(t.stadiumLevel??0)+1}));
    notify(`球場をLv${lvl+1}にアップグレード！チケット収入 UP`,"ok");
  },[myTeam,upd,myId,notify]);

  return {
    // state & setters
    screen, setScreen,
    retireModal, setRetireModal,
    playerModal, setPlayerModal,
    teamModal, setTeamModal,
    retireGamePlayer, setRetireGamePlayer,
    retireRole, setRetireRole,
    teams, setTeams,
    myId, setMyId,
    tab, setTab,
    gameDay, setGameDay,
    year, setYear,
    faPool, setFaPool,
    faYears, setFaYears,
    notif,
    seasonHistory, setSeasonHistory,
    saveExists, setSaveExists,
    schedule, setSchedule,
    news, setNews,
    mailbox, setMailbox,
    recentResults, setRecentResults,
    gameResultsMap, setGameResultsMap,
    cpuTradeOffers, setCpuTradeOffers,
    pressEvent, setPressEvent,
    lastPressDay, setLastPressDay,
    allStarDone, setAllStarDone,
    allStarResult, setAllStarResult,
    allStarTriggerDay, setAllStarTriggerDay,
    // derived
    myTeam,
    tabBadges,
    // actions
    notify,
    upd,
    pushResult,
    pushGameResult,
    addNews,
    addToHistory,
    handleSave,
    handleSelect,
    handlePlayerClick,
    handleTeamClick,
    handlePlayerTalk,
    setTrainingFocus,
    setDevGoal,
    handleInterview,
    toggleLineup,
    setStarter,
    moveRotation,
    removeFromRotation,
    setPitchingPattern,
    promote,
    convertIkusei,
    demote,
    hireCoach,
    fireCoach,
    sendScout,
    signPlayer,
    handleStadiumUpgrade,
    handlePressAnswer,
  };
}
