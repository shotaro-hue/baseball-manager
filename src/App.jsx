import { useState, useCallback, useEffect, useMemo } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles.css';
import { uid, fmtM, fmtSal, gameDayToDate, scoutedValue, clamp, rng, rngf } from './utils';
import { loadGame, getSaveMeta, deleteSave } from './engine/saveload';
import { generateSeasonSchedule, calcAllStarTriggerDay } from './engine/scheduleGen';
import { SEASON_PARAMS, getDefaultParams } from './data/scheduleParams.js';
import { BatchResultScreen } from './components/BatchResult';
import { ResultScreen } from './components/ResultScreen';
import { ModeSelectScreen, RetirePhaseScreen, WaiverPhaseScreen, WaiverResultScreen, GrowthSummaryScreen, NewSeasonScreen, SpringTrainingScreen, ContractRenewalPhaseScreen } from './components/Screens';
import { DraftPreviewScreen, DraftLotteryScreen, DraftScreen, DraftReviewScreen } from './components/Draft';
import { PlayoffScreen } from './components/PlayoffScreen';
import { RetireModal } from './components/RetireModal';
import { PlayerModal } from './components/PlayerModal';
import { TeamDetailScreen } from './components/TeamDetailScreen';
import { PressConferenceModal } from './components/PressConferenceModal';
import { AllStarScreen } from './components/AllStarScreen';
import { DashboardTab } from './components/DashboardTab';
import { TacticalGameScreen } from './components/TacticalGame';
import { StatsTab, FinanceTab, ContractTab, NewsTab, MailboxTab, TradeTab, AlumniTab, RosterTab, StandingsTab, RecordsTab, ScheduleTab, BalanceTab, LeaderboardTab } from './components/Tabs';
import {
  SEASON_GAMES, MAX_外国人_一軁E MAX_ROSTER, TEAM_DEFS, COACH_DEFS, COACH_GRADES, SCOUT_REGIONS,
  POP_RELEASE_PENALTY, POP_RELEASE_SALARY_THRESHOLD,
  POSITIONS, FIELDING_POSITIONS,
  FOREIGN_DEADLINE_DAY, FOREIGN_AGENT_SALARY_RATIO, FOREIGN_AGENT_ACCEPT_PROB, FOREIGN_FA_COUNT_MIN, FOREIGN_FA_COUNT_MAX, TRADE_DEADLINE_MONTH,
} from './constants';
import { calcOwnerTrustDelta } from './engine/frontend';
import { generateForeignFaPool } from './engine/player';
import { useGameState } from './hooks/useGameState';
import { useSeasonFlow } from './hooks/useSeasonFlow';
import { useOffseason } from './hooks/useOffseason';

const PRIMARY_SECTIONS = [
  { id: "home", label: "ホ�Eム", icon: "🏠", defaultTab: "dashboard", tabs: [["dashboard", "概況E]] },
  { id: "game", label: "日稁E, icon: "⚾", defaultTab: "schedule", tabs: [["schedule", "日稁E]] },
  { id: "rosterOps", label: "編戁E, icon: "🧩", defaultTab: "roster", tabs: [["roster", "ロースター"], ["trade", "トレーチE], ["contract", "契紁E], ["fa", "FA"], ["scout", "スカウチE]] },
  { id: "analysis", label: "刁E��", icon: "📊", defaultTab: "stats", tabs: [["stats", "成績"], ["leaderboard", "ランキング"], ["standings", "頁E��E], ["records", "記録"], ["finance", "財勁E], ["balance", "リーグ刁E��"]] },
  { id: "inbox", label: "受信箱", icon: "📨", defaultTab: "mailbox", tabs: [["mailbox", "メール"], ["news", "ニュース"], ["alumni", "歴代"]] },
];

const TAB_TO_SECTION = PRIMARY_SECTIONS.reduce((acc, section) => {
  section.tabs.forEach(([tabId]) => {
    acc[tabId] = section.id;
  });
  return acc;
}, {});

export default function App(){
  const gs = useGameState();
  const sf = useSeasonFlow(gs);
  const os = useOffseason(gs);

  const handleLoad = async () => {
    const saved = await loadGame();
    if(!saved){ gs.notify('セーブデータがありません','warn'); return; }
    const normalizedTeams = (saved.teams || []).map(t => {
      const nonPitcherIds = (t.players || []).filter(p => !p.isPitcher).map(p => p.id);
      const fallback = (t.lineup || []).filter(id => nonPitcherIds.includes(id));
      const lineupNoDh = (t.lineupNoDh || fallback).filter(id => nonPitcherIds.includes(id)).slice(0, 8);
      const lineupDh = (t.lineupDh || fallback).filter(id => nonPitcherIds.includes(id)).slice(0, 9);
      const rosterDhMode = t.rosterDhMode ?? t.dhEnabled ?? false;
      return { ...t, lineupNoDh, lineupDh, rosterDhMode, lineup: (rosterDhMode ? lineupDh : lineupNoDh).slice() };
    });
    gs.setTeams(normalizedTeams);
    gs.setMyId(saved.myId);
    gs.setGameDay(saved.gameDay);
    gs.setYear(saved.year);
    const loadedSchedule = generateSeasonSchedule(saved.year, normalizedTeams);
    gs.setSchedule(loadedSchedule);
    const loadedParams = SEASON_PARAMS[saved.year] || getDefaultParams(saved.year);
    gs.setAllStarTriggerDay(calcAllStarTriggerDay(loadedSchedule, loadedParams.allStarSkipDates));
    const openingForeignPool = generateForeignFaPool(rng(FOREIGN_FA_COUNT_MIN, FOREIGN_FA_COUNT_MAX));
    const shouldBackfillForeignFa = (saved.faPool?.length ?? 0) === 0 && saved.gameDay === 1;
    gs.setFaPool(shouldBackfillForeignFa ? openingForeignPool : (saved.faPool || []));
    gs.setFaYears(saved.faYears||{});
    gs.setSeasonHistory(saved.seasonHistory||{awards:[],records:{singleSeasonHR:null,singleSeasonAVG:null,singleSeasonK:null,careerHR:{},careerW:{}},hallOfFame:[],championships:[],standingsHistory:[],transfers:[]}, { markDirty: false });
    gs.setNews(saved.news||[], { markDirty: false });
    gs.setMailbox(saved.mailbox||[], { markDirty: false });
    gs.setGameResultsMap(saved.gameResultsMap||{}, { markDirty: false });
    gs.setScheduleArchive(saved.scheduleArchive||[], { markDirty: false });
    gs.resetSaveTracking(Number(saved.saveRevision)||0);
    gs.setCpuTradeOffers([]);
    sf.setPlayoff(null);
    os.setDraftPool(null);
    os.setDraftResult(null);
    os.setDevelopmentSummary(null);
    gs.setTab('dashboard');
    gs.setScreen('hub');
  };

  const {
    screen, myTeam, myId, teams, tab, setTab, gameDay, year, schedule,
    notif, tabBadges, faPool, faYears, setFaYears,
    saveExists, setSaveExists, retireModal, setRetireModal,
    playerModal, setPlayerModal, retireRole, setRetireRole,
    notify, upd, addNews, addToHistory, setFaPool, setTeams, setSeasonHistory, setMailbox, setScreen,
    pressEvent, handlePressAnswer,
    allStarResult,
  } = gs;
  const { gameResult, currentOpp, batchResults, batchMeta, playoff, setPlayoff } = sf;
  const { developmentSummary, newSeasonInfo, draftPool, setDraftPool, draftResult, setDraftResult, draftAllocation, setDraftAllocation, waiverClaimResults, contractRenewalDemands } = os;
  const [agentNeg, setAgentNeg] = useState(null);
  const [draftAutoSkip, setDraftAutoSkip] = useState(false);
  const [sectionLastTab, setSectionLastTab] = useState(() => (
    PRIMARY_SECTIONS.reduce((acc, section) => ({ ...acc, [section.id]: section.defaultTab }), {})
  ));
  const [currentPrimarySection, setCurrentPrimarySection] = useState("home");
  const [batchCount, setBatchCount] = useState(5);
  const [batchAutoManage, setBatchAutoManage] = useState(false);
  const [seasonAutoManage, setSeasonAutoManage] = useState(false);
  const dashboardSlice = useMemo(() => (
    tab === "dashboard" ? gs.getDashboardSlice({ limit: 5, gameDay }) : null
  ), [tab, gs, gameDay]);
  const mailboxForView = useMemo(() => (
    tab === "mailbox" ? gs.getVisibleMailbox(gameDay, { limit: 150 }) : []
  ), [tab, gs, gameDay]);
  const mailboxUnreadCount = useMemo(() => (
    tab === "mailbox" ? gs.getUnreadMailboxCount(gameDay) : 0
  ), [tab, gs, gameDay]);
  const newsForView = useMemo(() => (
    tab === "news" ? gs.getNewsBySelector({ limit: 120 }) : []
  ), [tab, gs]);
  const transferLogsForView = useMemo(() => (
    tab === "news" ? gs.getTransferLogs({ limit: 120 }) : []
  ), [tab, gs]);
  const recordsView = useMemo(() => (
    tab === "records" ? gs.getRecordsView() : null
  ), [tab, gs]);
  const scheduleArchiveForView = useMemo(() => (
    tab === "schedule" ? gs.getScheduleArchive() : []
  ), [tab, gs]);
  const gameResultsMapForView = useMemo(() => (
    tab === "schedule" ? gs.getGameResultsMap() : {}
  ), [tab, gs]);
  const tradeOffers = useMemo(() => (
    tab === "trade" ? gs.getPendingTradeOffers(gameDay, { limit: 50 }) : []
  ), [tab, gs, gameDay]);

  useEffect(() => {
    const sectionId = TAB_TO_SECTION[tab];
    if (!sectionId) return;
    setCurrentPrimarySection(sectionId);
    setSectionLastTab(prev => (
      prev[sectionId] === tab
        ? prev
        : { ...prev, [sectionId]: tab }
    ));
  }, [tab]);

  const handleTabChange = useCallback((newTab) => {
    if (tab === "roster" && newTab !== "roster" && myTeam) {
      const lineupPlayers = myTeam.lineup
        .map(id => myTeam.players.find(p => p.id === id))
        .filter(Boolean);
      const rosterDhMode = myTeam.rosterDhMode ?? myTeam.dhEnabled;
      const required = rosterDhMode ? POSITIONS : FIELDING_POSITIONS;
      const requiredCount = required.length;

      if (lineupPlayers.length < requiredCount) {
        notify(
          rosterDhMode
            ? "打線が 9 人揁E��てぁE��せん�E�EH含む�E�E
            : "打線が 8 人揁E��てぁE��せん",
          "warn",
        );
        return;
      }

      const posCount = {};
      lineupPlayers.forEach(p => { posCount[p.pos] = (posCount[p.pos] ?? 0) + 1; });

      for (const pos of required) {
        if (!posCount[pos]) {
          notify(`${pos}が未割り当てです`, "warn");
          return;
        }
        if (posCount[pos] > 1) {
          notify(`${pos}が重褁E��てぁE��す`, "warn");
          return;
        }
      }
    }
    setTab(newTab);
  }, [tab, myTeam, notify, setTab]);

  const handlePrimarySectionChange = useCallback((sectionId) => {
    const section = PRIMARY_SECTIONS.find(item => item.id === sectionId);
    if (!section) return;
    setCurrentPrimarySection(sectionId);
    const targetTab = sectionLastTab[sectionId] || section.defaultTab;
    handleTabChange(targetTab);
  }, [handleTabChange, sectionLastTab]);

  const activeSection = PRIMARY_SECTIONS.find(section => section.id === currentPrimarySection) || PRIMARY_SECTIONS[0];

  const parseSafeBatchCount = (rawValue, allowedOptions, fallbackValue) => {
    const parsed = Number.parseInt(String(rawValue), 10);
    if (!Number.isFinite(parsed)) return fallbackValue;
    return allowedOptions.includes(parsed) ? parsed : fallbackValue;
  };

  const foreignFaPool = faPool.filter(p => p.isForeign);
  const domesticFaPool = faPool.filter(p => !p.isForeign);
  const foreignActiveCount = myTeam?.players?.filter(p => p.isForeign).length || 0;

  const startNeg = (player) => {
    const salaryDemand = Math.ceil((player.salary || 0) * FOREIGN_AGENT_SALARY_RATIO);
    const minYears = player.age <= 30 ? 2 : 1;
    setAgentNeg({ player, round: 1, salaryDemand, minYears, salaryOffer: salaryDemand });
  };

  const signForeignPlayer = (player, salary, years) => {
    const totalCost = salary * years;
    if ((myTeam?.budget || 0) < totalCost) { notify("予算不足", "warn"); return; }
    const foreignPitchers = (myTeam?.players || []).filter(p => p.isForeign && p.isPitcher).length;
    const foreignBatters = (myTeam?.players || []).filter(p => p.isForeign && !p.isPitcher).length;
    const wouldBeAllPitchers = player.isPitcher && foreignPitchers === MAX_外国人_一軁E- 1;
    const wouldBeAllBatters = !player.isPitcher && foreignBatters === MAX_外国人_一軁E- 1;
    const balanceViolation = foreignActiveCount === MAX_外国人_一軁E- 1 && (wouldBeAllPitchers || wouldBeAllBatters);
    const rosterFull = (myTeam?.players?.length || 0) >= MAX_ROSTER;
    const goToFarm = foreignActiveCount >= MAX_外国人_一軁E|| balanceViolation || rosterFull;
    if (goToFarm) {
      upd(myId, t => ({
        ...t,
        budget: t.budget - totalCost,
        farm: [...(t.farm || []), { ...player, isFA: false, contractYearsLeft: years, contractYears: years, salary }],
        history: [...(t.history || []), { ...player, isFA: false, contractYearsLeft: years, contractYears: years, salary, exitYear: year, exitReason: '外国人獲征E, tenure: 0 }],
      }));
      const reason = foreignActiveCount >= MAX_外国人_一軁E
        ? "外国人枠満杯"
        : rosterFull
          ? "一軍枠満杯"
          : "投手4名また�E野手4名�E登録不可";
      notify(`${player.name}と契紁E��E{reason}のため二軍スタート）`, "warn");
    } else {
      upd(myId, t => ({
        ...t,
        budget: t.budget - totalCost,
        players: [...t.players, { ...player, isFA: false, contractYearsLeft: years, contractYears: years, salary }],
        history: [...(t.history || []), { ...player, isFA: false, contractYearsLeft: years, contractYears: years, salary, exitYear: year, exitReason: '外国人獲征E, tenure: 0 }],
      }));
      notify(`${player.name}を一軍登録で獲得！E${years}年 訁E{fmtSal(totalCost)})`, "ok");
    }
    setFaPool(prev => prev.filter(p => p.id !== player.id));
    setFaYears(prev => { const n = { ...prev }; delete n[player.id]; return n; });
    setAgentNeg(null);
  };

  // ── タイトル画面 ──
  if(screen==="title"){const saveMeta=saveExists?getSaveMeta():null;return(<><div className="app"><div className="title"><div className="tlogo">⚾ BASEBALL<br/>MANAGER 2025</div><div className="tsub">NPB SIMULATION v2.1  ETACTICAL MODE</div>{saveMeta&&(<div style={{background:"rgba(74,222,128,.08)",border:"1px solid rgba(74,222,128,.3)",borderRadius:8,padding:"10px 14px",marginBottom:16,textAlign:"left"}}><div style={{fontSize:10,color:"#4ade80",letterSpacing:".1em",marginBottom:6}}>◁Eセーブデータ</div><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}><div><div style={{fontWeight:700,fontSize:15}}>{saveMeta.teamEmoji} {saveMeta.teamName}</div><div style={{fontSize:11,color:"#94a3b8"}}>{saveMeta.year}年 第{saveMeta.gameDay}戦 {saveMeta.wins}勝{saveMeta.losses}敁E/div><div style={{fontSize:9,color:"#64748b",marginTop:2}}>{saveMeta.savedAt}</div></div><div style={{display:"flex",gap:6,alignItems:"center"}}><button className="sim-btn" style={{margin:0,padding:"8px 18px",fontSize:13,background:"linear-gradient(135deg,#14532d,#166534)",borderColor:"rgba(74,222,128,.6)",color:"#4ade80"}} onClick={handleLoad}>▶ 続きから</button><button className="bsm bgr" style={{padding:"6px 10px"}} onClick={()=>{if(window.confirm('セーブデータを削除しますか�E�E)){deleteSave();setSaveExists(false);}}}>削除</button></div></div></div>)}<div style={{fontSize:10,color:"#1e2d3d",letterSpacing:".2em",marginBottom:8,marginTop:saveExists?8:0,zIndex:1,position:"relative"}}>◁E新規ゲーム  Eチ�Eムを選抁E/div><div style={{fontSize:10,color:"#1e2d3d",letterSpacing:".2em",marginBottom:8,zIndex:1,position:"relative"}}>◁Eセントラルリーグ</div><div className="tgrid" style={{marginBottom:14}}>{TEAM_DEFS.filter(t=>t.league==="セ").map(t=><div key={t.id} className="tcard" style={{"--c":t.color}} onClick={()=>gs.handleSelect(t.id)}><span style={{fontSize:24,display:"block",marginBottom:5}}>{t.emoji}</span><div className="tcard-nm">{t.name}</div></div>)}</div><div style={{fontSize:10,color:"#1e2d3d",letterSpacing:".2em",marginBottom:8,zIndex:1,position:"relative"}}>◁EパシフィチE��リーグ</div><div className="tgrid">{TEAM_DEFS.filter(t=>t.league==="チE).map(t=><div key={t.id} className="tcard" style={{"--c":t.color}} onClick={()=>gs.handleSelect(t.id)}><span style={{fontSize:24,display:"block",marginBottom:5}}>{t.emoji}</span><div className="tcard-nm">{t.name}</div></div>)}</div><div style={{marginTop:24,paddingTop:16,borderTop:"1px solid rgba(100,116,139,.12)",textAlign:"center"}}><a href="/baseball-manager/flow-diagram.html" target="_blank" rel="noopener noreferrer" style={{fontSize:10,color:"#334155",textDecoration:"none",letterSpacing:".1em"}}>⚁E開発老E��ぁE シスチE��フロー図</a></div></div></div></>);}

  if(screen==="mode_select") return(<><ModeSelectScreen myTeam={myTeam} oppTeam={currentOpp} gameDay={gameDay} onSelect={sf.handleModeSelect} onBack={()=>setScreen("hub")} isProcessing={!!sf.batchProgress} processingPhase={sf.batchProgress?.phase||""}/></>);
  if(screen==="batch_result") return(<><ErrorBoundary onReset={()=>setScreen("hub")}><BatchResultScreen results={batchResults} batchMeta={batchMeta} myTeam={myTeam} onEnd={()=>setScreen("hub")} onViewDetail={r=>{const detail=gs.getGameResultsMap()?.[r.gameNo];if(detail){sf.setGameResult({score:{my:detail.myScore,opp:detail.oppScore},log:detail.log||[],inningSummary:detail.inningSummary||[],oppTeam:detail.oppTeam||r.oppTeam,won:detail.won,gameNo:r.gameNo,_source:"batch"});setScreen("result");}}}/></ErrorBoundary></>);

  if(screen==="result"&&gameResult){const _src=gameResult._source;const _retScreen=_src==="batch"?"batch_result":"hub";const _retLabel=_src==="batch"?"ↁEバッチ結果に戻めE:_src==="schedule"?"ↁE日程に戻めE:"ハブに戻めE;return(<><ResultScreen gsResult={gameResult} myTeam={myTeam} oppTeam={gameResult.oppTeam} gameDay={gameResult.gameNo??gameDay-1} onNext={()=>setScreen(_retScreen)} nextLabel={_retLabel}/></>);}


  if(screen==="tactical_game"){
    if(!currentOpp || !myTeam){
      return (
        <div className="app">
          <div className="rw">
            <div className="rtitle rlose">試合画面を開けません</div>
            <div style={{ marginBottom: 20, color: "#94a3b8", fontSize: 13 }}>
              対戦チE�Eタが不足してぁE��ため、試合を開始できませんでした。日程画面から再試行してください、E
            </div>
            <button className="btn btn-gold" onClick={()=>setScreen("hub")}>日程画面へ戻めE/button>
          </div>
        </div>
      );
    }
    return(<><ErrorBoundary onReset={()=>setScreen("hub")}><TacticalGameScreen myTeam={myTeam} oppTeam={currentOpp} onGameEnd={sf.handleTacticalGameEnd}/></ErrorBoundary></>);
  }
  if(screen==="allstar"&&allStarResult) return(<>
    <AllStarScreen
      year={year}
      rosters={allStarResult.rosters}
      gameResult={allStarResult.gameResult}
      onEnd={()=>setScreen("hub")}
    />
  </>);

  if(screen==="retire_phase") return(<><ErrorBoundary onReset={()=>setScreen("hub")}><RetirePhaseScreen teams={teams} myId={myId} year={year} onNext={os.handleRetirePhaseNext}/></ErrorBoundary></>);
  if(screen==="contract_renewal_phase") return(<><ErrorBoundary onReset={()=>setScreen("hub")}><ContractRenewalPhaseScreen teams={teams} myId={myId} year={year} demands={contractRenewalDemands||{}} onSign={os.handleContractRenewalSign} onRelease={(pid)=>{const p=myTeam?.players.find(x=>x.id===pid);upd(myId,t=>({...t,players:t.players.filter(x=>x.id!==pid)}));if(p){setFaPool(prev=>[...prev,{...p,isFA:true}]);addToHistory(myId,p,"戦力夁E);addNews({type:"season",headline:`【戦力外、E{p.name}選手に戦力外通告`,source:"野球速報",dateLabel:`${year}年`,body:`${p.name}選手！E{p.age}歳�E�が戦力外通告を受けた。`});notify(`${p.name}を戦力外通告しました`,"warn");}}} onNext={os.handleContractRenewalPhaseNext}/></ErrorBoundary></>);
  if(screen==="development_phase") return(<><ErrorBoundary onReset={()=>setScreen("hub")}><GrowthSummaryScreen summary={developmentSummary} year={year} onNext={()=>setScreen("waiver_phase")}/></ErrorBoundary></>);
  if(screen==="waiver_phase") return(<><ErrorBoundary onReset={()=>setScreen("hub")}><WaiverPhaseScreen teams={teams} myId={myId} year={year} onRelease={(pid)=>{const p=myTeam?.players.find(x=>x.id===pid);const popPenalty=(p?.salary??0)>POP_RELEASE_SALARY_THRESHOLD?POP_RELEASE_PENALTY:0;upd(myId,t=>({...t,players:t.players.filter(x=>x.id!==pid),popularity:Math.min(100,Math.max(0,(t.popularity??50)+popPenalty))}));if(p) setFaPool(prev=>[...prev,{...p,isFA:true}]);}} onNext={os.handleWaiverPhaseNext}/></ErrorBoundary></> );
  if(screen==="waiver_result") return(<><ErrorBoundary onReset={()=>setScreen("hub")}><WaiverResultScreen results={waiverClaimResults} year={year} onNext={()=>setScreen("draft_preview")}/></ErrorBoundary></>);
  if(screen==="playoff"&&playoff) return(<><ErrorBoundary onReset={()=>setScreen("hub")}><PlayoffScreen playoff={playoff} setPlayoff={setPlayoff} teams={teams} myId={myId} year={year} onFinish={()=>{
    if(playoff?.champion){
      const jpS=playoff.jpSeries;
      const opp=jpS?jpS.teams.find(t=>t.id!==playoff.champion.id):null;
      const seriesResult=jpS?jpS.wins[0]+"-"+jpS.wins[1]:"4-?";
      setSeasonHistory(prev=>({...prev,championships:[...(prev.championships||[]),{year,championId:playoff.champion.id,championName:playoff.champion.name,opponent:opp?.name||"?",seriesResult}]}));
      if(playoff.champion.id===myId){setMailbox(prev=>[...prev,{id:uid(),type:"championship",read:false,title:"🏆 "+year+"年 日本一達�E�E�E,from:"NPB本部",dateLabel:year+"年",timestamp:Date.now(),body:playoff.champion.name+"ぁE+year+"年の日本シリーズを制要E��ました�E�E+seriesResult+"�E�。球団史に残る偉業です！E}]);}
    }
    const trustDelta=calcOwnerTrustDelta(myId,myTeam,playoff);
    if(trustDelta!==0){
      gs.upd(myId,t=>({...t,ownerTrust:clamp((t.ownerTrust??50)+trustDelta,0,100)}));
      const goalLabel={champion:"日本一",pennant:"ペナント優勁E,cs:"CS出場",rebuild:"再建"}[myTeam?.ownerGoal||"cs"];
      setMailbox(prev=>[...prev,{id:uid(),type:"owner_trust",read:false,title:(trustDelta>0?"✁E:"⚠�E�E)+" オーナ�E評価: 目標、E+goalLabel+"、E+(trustDelta>0?"達�E":"未遁E),from:"琁E��オーナ�E",dateLabel:year+"年",timestamp:Date.now(),body:"今季の目標、E+goalLabel+"」に対する評価が確定しました。信頼度ぁE+(trustDelta>0?"+":"")+trustDelta+"変動しました�E�翌年予算に影響します）、E}]);
    }
    setScreen("retire_phase");
  }}/></ErrorBoundary></>);
  if(screen==="draft_preview"&&draftPool) return(<><DraftPreviewScreen teams={teams} myId={myId} year={year} pool={draftPool} draftAllocation={draftAllocation} onAllocationChange={setDraftAllocation} onStart={()=>setScreen("draft_lottery")}/></>);
  if(screen==="draft_lottery"&&draftPool) return(<><DraftLotteryScreen teams={teams} myId={myId} year={year} pool={draftPool} onDone={(r1,autoSkip)=>{setDraftPool(prev=>prev.map(p=>{const winner=Object.entries(r1).find(function(e){return e[1]&&e[1].id===p.id;});return{...p,_drafted:winner?true:undefined,_r1winner:winner?Number(winner[0]):undefined};}));if(autoSkip) setDraftAutoSkip(true);setScreen("draft");}}/></>);
  if(screen==="draft"&&draftPool) return(<><DraftScreen teams={teams} myId={myId} year={year} pool={draftPool} draftAllocation={draftAllocation} autoSkip={draftAutoSkip} onDraftDone={(pl,dr)=>{setDraftAutoSkip(false);setDraftResult({pool:pl,drafted:dr});setScreen("draft_review");}}/></>);
  if(screen==="draft_review"&&draftResult) return(<><DraftReviewScreen teams={teams} myId={myId} year={year} pool={draftResult.pool} drafted={draftResult.drafted} onEnd={()=>os.handleDraftComplete(draftResult.pool,draftResult.drafted)}/></>);
  if(screen==="spring_training") return(<><SpringTrainingScreen year={year} myTeam={myTeam} springData={os.springTrainingData} onComplete={os.handleSpringTrainingComplete}/></>);
  if(screen==="new_season") return(<><NewSeasonScreen year={year} info={newSeasonInfo} developmentSummary={developmentSummary} ownerGoal={myTeam?.ownerGoal||"cs"} onGoalSelect={(goal)=>gs.upd(myId,t=>({...t,ownerGoal:goal}))} onStart={()=>{setScreen("hub");setTab("dashboard");notify(`${year}年シーズン開幕！`,"ok");}}/></>);

  if(screen==="team_detail"&&gs.viewingTeam) return(
    <TeamDetailScreen
      team={gs.viewingTeam}
      myTeam={myTeam}
      allTeams={teams}
      schedule={schedule}
      year={year}
      allTeamResultsMap={gs.allTeamResultsMap}
        allTeamBoxScoresMap={gs.allTeamBoxScoresMap}
      onBack={()=>setScreen("hub")}
      onPlayerClick={gs.handlePlayerClick}
      onOpenTrade={()=>{ setScreen("hub"); setTab("trade"); }}
    />
  );

  // ── HUB ──
  const g=(myTeam?.wins||0)+(myTeam?.losses||0);
  const remain=SEASON_GAMES-g;

  return(<><div className="app"><div className="app-layout">
    <aside className="primary-sidebar" aria-label="メインナビゲーション">
      <div className="primary-sidebar-title">監督メニュー</div>
      <div className="primary-sidebar-list">
        {PRIMARY_SECTIONS.map((section) => {
          const badgeTab = section.id === "inbox" ? "mailbox" : section.id === "rosterOps" ? "contract" : null;
          const badge = badgeTab ? tabBadges[badgeTab] : null;
          return (
            <button
              key={section.id}
              className={`primary-sidebar-btn ${currentPrimarySection===section.id?"on":""}`}
              onClick={()=>handlePrimarySectionChange(section.id)}
            >
              <span className="primary-sidebar-icon">{section.icon}</span>
              <span>{section.label}</span>
              {badge&&<span className="primary-sidebar-badge" style={{background:badge.color}}>{badge.n}</span>}
            </button>
          );
        })}
      </div>
    </aside><div className="hub">
    <div className="topbar">
      <span style={{fontSize:26}}>{myTeam?.emoji}</span>
      <div style={{flex:1}}><div style={{fontWeight:700,fontSize:14,color:myTeam?.color}}>{myTeam?.name}</div><div style={{fontSize:10,color:"#374151"}}>{year}年 {(d=>d.month+"朁E+d.day+"日")(gameDayToDate(gameDay,schedule))} / 第{gameDay}戦{schedule?.[gameDay]?.isInterleague?" 🔄交流戦":""} / 残り{remain}試吁E/div></div>
      <div style={{display:"flex",gap:5,flexWrap:"wrap"}}><span className="chip cg">{myTeam?.wins}勁E/span><span className="chip cr">{myTeam?.losses}敁E/span><span className="chip cy">{fmtM(myTeam?.budget||0)}</span></div>
      <div className="tb-record">{myTeam?.wins}勝{myTeam?.losses}敁E/div>
      <button style={{background:"rgba(74,222,128,.1)",border:"1px solid rgba(74,222,128,.4)",color:"#4ade80",borderRadius:6,padding:"4px 10px",fontSize:11,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}} onClick={gs.handleSave}>💾 保孁E/button>
    </div>

    {notif&&<div className={`notif ${notif.type==="ok"?"nok":notif.type==="warn"?"nwarn":"nbad"}`}>{notif.msg}</div>}

    {gameDay<=SEASON_GAMES&&(
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:10}}>
        <button className="sim-btn" style={{margin:0,fontSize:12}} onClick={sf.handleStartGame}>
          ⚾ 1試吁Ebr/>
          <span style={{fontSize:9,opacity:.7}}>
            {(d=>d?`${d.month}/${d.day} `:"") (gameDayToDate(gameDay,schedule))}釁E�E or オーチE
          </span>
        </button>
        {/* バッチシム  E5試合刻みプルダウン */}
        {(()=>{
          const opts=[];
          for(let i=5;i<=remain;i+=5) opts.push(i);
          if(opts.length===0) opts.push(Math.max(1,remain));
          const eff=opts.includes(batchCount)?batchCount:opts[0];
          const sd=gameDayToDate(gameDay,schedule);
          const ed=gameDayToDate(Math.min(gameDay+eff-1,SEASON_GAMES),schedule);
          return(
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:5,background:"linear-gradient(135deg,#071a2c,#0d2840)",border:"1px solid rgba(96,165,250,.5)",borderRadius:10,padding:"8px 6px"}}>
              <select value={eff} onChange={e=>setBatchCount(parseSafeBatchCount(e.target.value, opts, eff))} style={{width:"100%",background:"rgba(15,23,42,.9)",border:"1px solid rgba(96,165,250,.4)",color:"#93c5fd",borderRadius:4,fontSize:11,fontWeight:700,padding:"3px 4px",fontFamily:"'Share Tech Mono',monospace",cursor:"pointer"}}>
                {opts.map(n=>{const d=gameDayToDate(Math.min(gameDay+n-1,SEASON_GAMES),schedule);return<option key={n} value={n}>{n}試吁Ed?` (、E{d.month}/${d.day})`:""}</option>;})}
              </select>
              {sd&&ed&&<div style={{fontSize:9,color:"#7dd3fc"}}>{sd.month}/{sd.day} 、E{ed.month}/{ed.day}</div>}
              <label style={{display:"flex",alignItems:"center",gap:4,fontSize:9,color:batchAutoManage?"#34d399":"#475569",cursor:"pointer",userSelect:"none"}}>
                <input type="checkbox" checked={batchAutoManage} onChange={e=>setBatchAutoManage(e.target.checked)} style={{accentColor:"#34d399",cursor:"pointer"}}/>
                自動編成も実衁E
              </label>
              <button style={{background:"transparent",border:"none",color:"#60a5fa",fontSize:11,cursor:sf.batchProgress?"not-allowed":"pointer",padding:"2px 4px",fontFamily:"'Bebas Neue',cursive",letterSpacing:".15em",opacity:sf.batchProgress?0.5:1}} disabled={!!sf.batchProgress} onClick={()=>sf.handleBatchSim(eff,batchAutoManage)}>⚡ まとめてシム</button>
            </div>
          );
        })()}
        {sf.batchProgress&&(
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:3,background:"linear-gradient(135deg,#071a2c,#0d2840)",border:"1px solid rgba(96,165,250,.5)",borderRadius:10,padding:"8px 6px",minWidth:80}}>
            <div style={{fontSize:9,color:"#7dd3fc",letterSpacing:".05em"}}>シミュレーション中</div>
            <div style={{fontSize:13,color:"#60a5fa",fontWeight:700,fontFamily:"'Share Tech Mono',monospace"}}>{sf.batchProgress.current}/{sf.batchProgress.total}</div>
            <div style={{fontSize:9,color:"#93c5fd"}}>残り約{Math.max(0, Math.round(sf.batchProgress.etaSec ?? 0))}私E/div>
            <div style={{fontSize:9,color:"#7dd3fc"}}>フェーズ: {sf.batchProgress.phase ?? "試合計箁E}</div>
            <div style={{width:"100%",height:4,background:"rgba(96,165,250,.2)",borderRadius:2}}><div style={{height:"100%",background:"#60a5fa",borderRadius:2,width:`${Math.round(sf.batchProgress.current/sf.batchProgress.total*100)}%`,transition:"width .1s"}}/></div>
            {sf.batchProgress.current>=sf.batchProgress.total&&<div style={{fontSize:8,color:"#bfdbfe"}}>100%後も後�E琁E��継続中</div>}
          </div>
        )}
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:5,background:"linear-gradient(135deg,#1a0730,#2d0f50)",border:"1px solid rgba(167,139,250,.5)",borderRadius:10,padding:"8px 6px"}}>
          <label style={{display:"flex",alignItems:"center",gap:4,fontSize:9,color:seasonAutoManage?"#c4b5fd":"#6b7280",cursor:"pointer",userSelect:"none"}}>
            <input type="checkbox" checked={seasonAutoManage} onChange={e=>setSeasonAutoManage(e.target.checked)} style={{accentColor:"#a78bfa",cursor:"pointer"}}/>
            自動編成も実衁E
          </label>
          <button className="sim-btn" style={{margin:0,fontSize:12,width:"100%",background:"transparent",border:"none",boxShadow:"none",color:"#a78bfa",padding:"2px 4px",opacity:sf.batchProgress?0.5:1}} disabled={!!sf.batchProgress} onClick={()=>sf.handleSeasonSim(seasonAutoManage)}>
            🚀 残り全{remain}試吁Ebr/>
            <span style={{fontSize:9,opacity:.7}}>
              {(()=>{const s=gameDayToDate(gameDay,schedule);const e=gameDayToDate(SEASON_GAMES,schedule);return s&&e?`${s.month}/${s.day}、E{e.month}/${e.day}`:"シーズン一括";})()}
            </span>
          </button>
        </div>
      </div>
    )}

    <div className="tabs-nav redesigned-tabs">
      <div className="tab-group">
        <div className="tab-group-label">{activeSection.label}</div>
        <div className="tabs">
          {activeSection.tabs.map(([id, label])=>(
            <button key={id} className={`tab ${tab===id?"on":""}`} onClick={()=>handleTabChange(id)}>
              {label}{tabBadges[id]&&<span style={{marginLeft:4,background:tabBadges[id].color,color:"#fff",borderRadius:8,padding:"0 5px",fontSize:9,fontWeight:700}}>{tabBadges[id].n}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>

    <ErrorBoundary key={tab}>
    {tab==="dashboard"&&<DashboardTab myTeam={myTeam} teams={teams} schedule={schedule} gameDay={gameDay} year={year} recentResults={gs.recentResults} pendingTradeCount={dashboardSlice?.pendingTrades||0} faPool={faPool} onTabSwitch={handleTabChange} unreadMailboxCount={dashboardSlice?.unreadMailboxCount||0} latestNewsId={dashboardSlice?.latestNewsId||""}/>}
    {tab==="roster"&&<RosterTab team={myTeam} onToggle={gs.toggleLineup} onReplaceLineup={gs.replaceLineup} onSetLineupOrder={gs.setLineupOrder} onSetRosterDhMode={gs.setRosterDhMode} onSetPlayerPosition={gs.setPlayerPosition} onSetStarter={gs.setStarter} onPromo={gs.promote} onDemo={gs.demote} onSetTrainingFocus={gs.setTrainingFocus} onConvertIkusei={gs.convertIkusei} onMoveRotation={gs.moveRotation} onRemoveFromRotation={gs.removeFromRotation} onSetPitchingPattern={gs.setPitchingPattern} onReplaceRotation={gs.replaceRotation} onReplaceFullRoster={gs.replaceFullRoster} onPlayerClick={gs.handlePlayerClick} onSetDevGoal={gs.setDevGoal} onPlayerTalk={gs.handlePlayerTalk} onSetConvertTarget={gs.setConvertTarget} gameDay={gameDay}/>}
    {tab==="schedule"&&<ScheduleTab schedule={schedule} gameDay={gameDay} myTeam={myTeam} teams={teams} year={year} gameResultsMap={gameResultsMapForView} allStarDone={gs.allStarDone} allStarResult={gs.allStarResult} allStarTriggerDay={gs.allStarTriggerDay} scheduleArchive={scheduleArchiveForView||[]} onResultClick={dayNo=>{const r=gameResultsMapForView[dayNo];if(r){sf.setGameResult({score:{my:r.myScore,opp:r.oppScore},log:r.log||[],inningSummary:r.inningSummary||[],oppTeam:r.oppTeam,won:r.won,gameNo:dayNo,_source:"schedule"});setScreen("result");}}}/>}
    {tab==="records"&&<RecordsTab history={recordsView}/>}
    {tab==="news"&&<NewsTab news={newsForView} transfers={transferLogsForView} onInterview={gs.handleInterview} currentYear={year}/>}
    {tab==="mailbox"&&<MailboxTab mailbox={mailboxForView} unreadCount={mailboxUnreadCount} onRead={os.handleMailRead} onAction={os.handleMailAction} teams={teams} myTeam={myTeam} onTrade={os.handleTrade} onTeamClick={gs.handleTeamClick} gameDay={gameDay}/>}
    {tab==="trade"&&<TradeTab myTeam={myTeam} teams={teams} onTrade={os.handleTrade} cpuOffers={tradeOffers.map(m=>m.offer)} onAcceptOffer={(idx)=>os.handleMailAction(tradeOffers[idx].id,"accept")} onDeclineOffer={(idx)=>os.handleMailAction(tradeOffers[idx].id,"decline")} deadlinePassed={(()=>{const d=gameDayToDate(gameDay,schedule);return d?d.month>TRADE_DEADLINE_MONTH:gameDay>95;})()} onPlayerClick={gs.handlePlayerClick}/>}
    {tab==="contract"&&<ContractTab team={myTeam} allTeams={teams} year={year} onOffer={os.handleContractOffer} onRelease={pid=>{const p=myTeam?.players.find(x=>x.id===pid);const popPenalty=(p?.salary??0)>POP_RELEASE_SALARY_THRESHOLD?POP_RELEASE_PENALTY:0;upd(myId,t=>({...t,players:t.players.filter(x=>x.id!==pid),popularity:Math.min(100,Math.max(0,(t.popularity??50)+popPenalty))}));if(p){addToHistory(myId,p,"自由契紁E);setFaPool(prev=>[...prev,{...p,isFA:true}]);}notify("放出しました","warn");}}/>}
    {tab==="alumni"&&<AlumniTab myTeam={myTeam}/>}
        {tab==="fa"&&(
      <div className="card">
        <div className="card-h">FA市場 ({faPool.length}人)
          <span className="chip cb" style={{marginLeft:8,fontSize:10}}>外国人一軁E {foreignActiveCount}/{MAX_外国人_一軍}</span>
        </div>

        <div className="card-h" style={{marginTop:8}}>🌏 外国人FA市場 ({foreignFaPool.length}人)</div>
        {gameDay>FOREIGN_DEADLINE_DAY&&(
          <div className="card2" style={{borderColor:"rgba(248,113,113,.4)",color:"#fca5a5"}}>交渉期限終亁E��E月末�E�E/div>
        )}
        {foreignFaPool.length===0&&<p style={{color:"#2a3a4c",fontSize:12}}>現在、外国人FA選手�EぁE��せん</p>}
        {foreignFaPool.map((p)=>{
          const active = agentNeg?.player?.id===p.id;
          return(
            <div key={p.id} className="card2">
              <div className="fsb" style={{flexWrap:"wrap",gap:6}}>
                <div>
                  <span style={{fontWeight:700,fontSize:13}}>{p.name}</span>
                  <span style={{fontSize:10,color:"#374151",marginLeft:8}}>{p.pos}/{p.age}歳 {p.hometown} 出身 · 基準{fmtSal(p.salary)}/年</span>
                </div>
                <div style={{fontSize:10,color:"#374151"}}>{p.isPitcher?`抁E 琁E��E{p.pitching?.velocity||"-"} 制琁E{p.pitching?.control||"-"}`:`扁E チE{p.batting?.contact||"-"} チE{p.batting?.power||"-"}`}</div>
              </div>
              {!active&&(
                <button className="bsm bga" style={{marginTop:8,opacity:gameDay>FOREIGN_DEADLINE_DAY?0.5:1}} disabled={gameDay>FOREIGN_DEADLINE_DAY} onClick={()=>startNeg(p)}>
                  代琁E��交渁E
                </button>
              )}
              {active&&agentNeg&&(
                <div style={{marginTop:8,borderTop:"1px solid rgba(100,116,139,.25)",paddingTop:8,fontSize:11}}>
                  {agentNeg.round===1&&(
                    <>
                      <div style={{marginBottom:6,color:"#cbd5e1"}}>Round 1: 年俸交渉（代琁E��要汁E {fmtSal(agentNeg.salaryDemand)}/年�E�E/div>
                      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                        <button className="bsm bga" onClick={()=>setAgentNeg(prev=>({...prev,round:2,salaryOffer:prev.salaryDemand}))}>要求を呑�E</button>
                        <button className="bsm bga" onClick={()=>{
                          const accepted = rngf(0,1) < FOREIGN_AGENT_ACCEPT_PROB;
                          if(!accepted){ notify("エージェントが交渉を打ち刁E��ました", "warn"); setAgentNeg(null); return; }
                          setAgentNeg(prev=>({...prev,round:2,salaryOffer:prev.player.salary}));
                        }}>基準年俸で交渁E/button>
                        <button className="bsm bgr" onClick={()=>setAgentNeg(null)}>交渉打ち刁E��</button>
                      </div>
                    </>
                  )}
                  {agentNeg.round===2&&(
                    <>
                      <div style={{marginBottom:6,color:"#cbd5e1"}}>Round 2: 契紁E��数�E�最佁E{agentNeg.minYears} 年�E�E/div>
                      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                        <button className="bsm bga" onClick={()=>signForeignPlayer(agentNeg.player, agentNeg.salaryOffer, agentNeg.minYears)}>
                          同意する�E�EagentNeg.minYears}年 訁EfmtSal(agentNeg.salaryOffer*agentNeg.minYears)}�E�E
                        </button>
                        <button className="bsm bgr" onClick={()=>setAgentNeg(null)}>交渉打ち刁E��</button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}

        <div className="card-h" style={{marginTop:12}}>国冁EA・戦力夁E({domesticFaPool.length}人)</div>
        {domesticFaPool.length===0&&<p style={{color:"#2a3a4c",fontSize:12}}>現在FA選手�EぁE��せん</p>}
        {domesticFaPool.map((p)=>{
          const yrs=faYears[p.id]||1;
          const totalCost=p.salary*yrs;
          const canAfford=myTeam.budget>=totalCost;
          return(
          <div key={p.id} className="card2">
            <div className="fsb" style={{flexWrap:"wrap",gap:6}}>
              <div><span style={{fontWeight:700,fontSize:13}}>{p.name}</span><span style={{fontSize:10,color:"#374151",marginLeft:8}}>{p.pos}/{p.age}歳 {fmtSal(p.salary)}/年</span></div>
              <div style={{display:"flex",gap:4,alignItems:"center",flexWrap:"wrap"}}>
                <span style={{fontSize:10,color:"#374151"}}>契紁E��数:</span>
                {[1,2,3].map(y=><button key={y} className={"bsm "+(yrs===y?"bgb":"bga")} style={{padding:"2px 8px"}} onClick={()=>setFaYears(prev=>({...prev,[p.id]:y}))}>{y}年</button>)}
                <button className="bsm bga" style={{marginLeft:4,opacity:canAfford?1:0.4}} onClick={()=>{if(!canAfford){notify("予算不足","warn");return;}const toFarm=(myTeam?.players?.length||0)>=MAX_ROSTER;const acquireReason=p.isWaiverReleased?'戦力外獲征E:'FA獲征E;upd(myId,t=>toFarm?({...t,budget:t.budget-totalCost,farm:[...t.farm,{...p,isFA:false,contractYearsLeft:yrs,contractYears:yrs}],history:[...(t.history||[]),{...p,isFA:false,contractYearsLeft:yrs,contractYears:yrs,exitYear:year,exitReason:acquireReason,tenure:0}]}):({...t,budget:t.budget-totalCost,players:[...t.players,{...p,isFA:false,contractYearsLeft:yrs,contractYears:yrs}],history:[...(t.history||[]),{...p,isFA:false,contractYearsLeft:yrs,contractYears:yrs,exitYear:year,exitReason:acquireReason,tenure:0}]}));setFaPool(prev=>prev.filter(x=>x.id!==p.id));setFaYears(prev=>{const n={...prev};delete n[p.id];return n;});notify(toFarm?`${p.name}を獲得（一軍枠満杯のため二軍スタート）`:`${p.name}を獲得！E${yrs}年 訁E{fmtSal(totalCost)})`,"ok");}}>獲征E/button>
              </div>
            </div>
          </div>
          );
        })}
      </div>
    )}
    {tab==="scout"&&(
      <div>
        {myTeam?.scoutResults.length>0&&<div className="card"><div className="card-h">スカウト報呁E/div>{myTeam.scoutResults.map((p,i)=>{
          const bf=p._scoutBudgetFactor||1.0; const rf=p._scoutRegionFactor||1.0;
          const sv=(key,val)=>scoutedValue(val,p.id,key,15,bf,rf);
          const ScoutVal=({k,v})=>{const r=sv(k,v);return <span style={{color:r.estimated?"#f5c842":"#94a3b8"}}>{r.value}{r.estimated&&<span style={{fontSize:8,opacity:.6}}>?</span>}</span>;};
          return <div key={p.id} className="card2">
            <div className="fsb" style={{marginBottom:6}}><span style={{fontWeight:700}}>{p.name} <span style={{fontSize:10,color:"#374151"}}>{p.pos}/{p.age}歳</span>{p.isForeign&&<span className="chip cb" style={{marginLeft:4,fontSize:8}}>夁E/span>}</span><div style={{display:"flex",gap:6}}><button className="bsm bga" onClick={()=>gs.signPlayer(i)}>獲征E/button><button className="bsm bgr" onClick={()=>upd(myId,t=>({...t,scoutResults:t.scoutResults.filter((_,j)=>j!==i)}))}>見送り</button></div></div>
            <div style={{display:"flex",gap:12,flexWrap:"wrap",fontSize:10}}>
              {p.isPitcher?<>
                <span style={{color:"#374151"}}>琁E��E<ScoutVal k="velocity" v={p.pitching?.velocity}/></span>
                <span style={{color:"#374151"}}>制琁E<ScoutVal k="control" v={p.pitching?.control}/></span>
                <span style={{color:"#374151"}}>変化 <ScoutVal k="breaking" v={p.pitching?.breaking}/></span>
                <span style={{color:"#374151"}}>スタ <ScoutVal k="stamina" v={p.pitching?.stamina}/></span>
              </>:<>
                <span style={{color:"#374151"}}>ミ�EチE<ScoutVal k="contact" v={p.batting?.contact}/></span>
                <span style={{color:"#374151"}}>長扁E<ScoutVal k="power" v={p.batting?.power}/></span>
                <span style={{color:"#374151"}}>走劁E<ScoutVal k="speed" v={p.batting?.speed}/></span>
                <span style={{color:"#374151"}}>選琁E<ScoutVal k="eye" v={p.batting?.eye}/></span>
              </>}
              <span style={{color:"#374151"}}>潜在 <ScoutVal k="potential" v={p.potential}/></span>
            </div>
            <div style={{fontSize:9,color:"#374151",marginTop:4}}>{fmtSal(p.salary)}/年 · <span style={{color:"#f5c842"}}>?マ�Eクは推定値</span></div>
          </div>;
        })}</div>}
        <div className="card"><div className="card-h">スカウト派遣</div><div className="g2">{SCOUT_REGIONS.map(sr=><div key={sr.id} className="card2" style={{cursor:"pointer"}} onClick={()=>gs.sendScout(sr)}><div style={{fontWeight:700,fontSize:12,marginBottom:3}}>{sr.name}</div><div style={{fontSize:10,color:"#374151"}}>費用:{fmtSal(sr.cost)} / Lv{sr.qMin}〜{sr.qMax}</div></div>)}</div></div>
      </div>
    )}
    {tab==="finance"&&<FinanceTab team={myTeam} onStadiumUpgrade={gs.handleStadiumUpgrade} onTicketPriceChange={gs.handleSetTicketPrice} gameDay={gameDay} onPlayerClick={gs.handlePlayerClick}/>}
    {tab==="standings"&&<StandingsTab teams={teams} myId={myId} onTeamClick={gs.handleTeamClick}/>}
    {tab==="stats"&&<StatsTab teams={teams} myId={myId} onPlayerClick={gs.handlePlayerClick}/>}
    {tab==="leaderboard"&&<LeaderboardTab teams={teams} myId={myId} gameDay={gameDay}/>}
    {tab==="balance"&&<BalanceTab teams={teams} myTeam={myTeam} upd={upd} myId={myId}/>}

    {tab==="roster"&&(
      <div className="card">
        <div className="card-h">コーチE��</div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10}}>{myTeam?.coaches.map((c,i)=><div key={i} className="card2" style={{display:"flex",alignItems:"center",gap:8,flex:"1 1 190px"}}><span style={{fontSize:18}}>{c.emoji}</span><div style={{flex:1}}><div style={{fontSize:12,fontWeight:700}}>{c.typeName} <span style={{color:"#f5c842",fontSize:10}}>Lv{c.grade}</span></div><div style={{fontSize:10,color:"#374151"}}>{c.name}</div></div><button className="bsm bgr" onClick={()=>gs.fireCoach(i)}>解雁E/button></div>)}</div>
        <details><summary style={{fontSize:11,color:"#374151",cursor:"pointer"}}>+ コーチを雁E��</summary><div className="g2" style={{marginTop:8}}>{COACH_DEFS.map(cd=>COACH_GRADES.map(cg=>{const hired=myTeam?.coaches.some(c=>c.type===cd.type&&c.grade===cg.g);return <div key={cd.type+cg.g} className="card2" style={{opacity:hired?0.5:1}}><div className="fsb"><span style={{fontSize:11}}>{cd.emoji}{cd.name} Lv{cg.g}</span><button className="bsm bga" disabled={hired} onClick={()=>gs.hireCoach(cd,cg)}>{hired?"渁E:"雁E��"}</button></div><div style={{fontSize:10,color:"#374151",marginTop:2}}>{fmtSal(cg.salary)}/朁E· +{cg.bonus}成長</div></div>;}))}</div></details>
      </div>
    )}
    <RetireModal modal={retireModal} retireRole={retireRole} setRetireRole={setRetireRole} onRetain={()=>os.handleRetain(retireModal.player)} onAccept={()=>os.handleAcceptRetire(retireModal.player)} onStartRetireGame={()=>os.handleStartRetireGame(retireModal.player)} onSkipRetireGame={()=>os.handleSkipRetireGame(retireModal.player)}/>
    {playerModal&&<PlayerModal player={playerModal.player} teamName={playerModal.teamName} isMyTeam={playerModal.teamName===myTeam?.name} onSetConvertTarget={gs.setConvertTarget} onClose={()=>setPlayerModal(null)}/>}

    {gs.pregameError&&(
      <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.72)',zIndex:400,display:'flex',alignItems:'center',justifyContent:'center',padding:'0 16px'}}>
        <div style={{background:'#0d1b2a',border:'1px solid rgba(248,113,113,.4)',borderRadius:12,padding:'24px 20px',width:'100%',maxWidth:420,boxShadow:'0 8px 32px rgba(0,0,0,.6)'}}>
          <div style={{fontSize:15,fontWeight:700,color:'#f87171',marginBottom:10}}>⚠�E�E試合開始エラー</div>
          <div style={{fontSize:13,color:'#cbd5e1',marginBottom:18,lineHeight:1.6}}>{gs.pregameError.message}</div>
          <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
            <button
              className="bsm bga"
              onClick={()=>{gs.setPregameError(null);setTab('roster');}}
            >ロースタータブへ</button>
            <button
              className="bsm bgr"
              onClick={()=>gs.setPregameError(null)}
            >閉じめE/button>
          </div>
        </div>
      </div>
    )}
    {pressEvent&&<PressConferenceModal event={pressEvent} onAnswer={handlePressAnswer}/>}
    </ErrorBoundary>

    <div className="primary-bottom-nav">
      {PRIMARY_SECTIONS.map((section) => {
        const badgeTab = section.id === "inbox" ? "mailbox" : section.id === "rosterOps" ? "contract" : null;
        const badge = badgeTab ? tabBadges[badgeTab] : null;
        return (
          <button key={section.id} className={`primary-nav-btn ${currentPrimarySection===section.id?"on":""}`} onClick={()=>handlePrimarySectionChange(section.id)}>
            <span className="primary-nav-icon">{section.icon}</span>
            <span>{section.label}</span>
            {badge&&<span className="primary-nav-badge" style={{background:badge.color}}>{badge.n}</span>}
          </button>
        );
      })}
      <button className="primary-nav-cta" onClick={sf.handleStartGame} disabled={gameDay>SEASON_GAMES}>
        次へ進む
      </button>
    </div>
  </div></div></div></>);
}
