import { useState, useCallback } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles.css';
import { uid, fmtM, fmtSal, gameDayToDate, scoutedValue, clamp, rng, rngf } from './utils';
import { loadGame, getSaveMeta, deleteSave } from './engine/saveload';
import { generateSeasonSchedule, calcAllStarTriggerDay } from './engine/scheduleGen';
import { SEASON_PARAMS, getDefaultParams } from './data/scheduleParams.js';
import { TacticalGameScreen } from './components/TacticalGame';
import { BatchResultScreen } from './components/BatchResult';
import { ModeSelectScreen, ResultScreen, RetirePhaseScreen, WaiverPhaseScreen, WaiverResultScreen, GrowthSummaryScreen, NewSeasonScreen } from './components/Screens';
import { DraftPreviewScreen, DraftLotteryScreen, DraftScreen, DraftReviewScreen } from './components/Draft';
import { PlayoffScreen } from './components/PlayoffScreen';
import { RetireModal } from './components/RetireModal';
import { PlayerModal } from './components/PlayerModal';
import { TeamDetailScreen } from './components/TeamDetailScreen';
import { PressConferenceModal } from './components/PressConferenceModal';
import { AllStarScreen } from './components/AllStarScreen';
import { DashboardTab } from './components/DashboardTab';
import { StatsTab, FinanceTab, ContractTab, NewsTab, MailboxTab, TradeTab, AlumniTab, RosterTab, StandingsTab, RecordsTab, ScheduleTab, BalanceTab } from './components/Tabs';
import {
  SEASON_GAMES, BATCH, MAX_外国人_一軍, TEAM_DEFS, COACH_DEFS, COACH_GRADES, SCOUT_REGIONS,
  POP_RELEASE_PENALTY, POP_RELEASE_SALARY_THRESHOLD,
  POSITIONS, FIELDING_POSITIONS,
  FOREIGN_DEADLINE_DAY, FOREIGN_AGENT_SALARY_RATIO, FOREIGN_AGENT_ACCEPT_PROB, FOREIGN_FA_COUNT_MIN, FOREIGN_FA_COUNT_MAX, TRADE_DEADLINE_MONTH,
} from './constants';
import { calcOwnerTrustDelta } from './engine/frontend';
import { generateForeignFaPool } from './engine/player';
import { useGameState } from './hooks/useGameState';
import { useSeasonFlow } from './hooks/useSeasonFlow';
import { useOffseason } from './hooks/useOffseason';

const TAB_GROUPS = [
  { label: "試合", tabs: [["dashboard","🏠 概況"],["schedule","🗓️ 日程"],["standings","🏆 順位"],["stats","📊 成績"],["records","🏛 記録"]] },
  { label: "編成", tabs: [["roster","👥 ロースター"],["trade","🔄 トレード"],["contract","📝 契約"],["fa","🏪 FA"],["scout","🔍 スカウト"]] },
  { label: "球団", tabs: [["news","📰 ニュース"],["mailbox","📨 メール"],["alumni","📖 歴代"],["finance","💴 財務"]] },
  { label: "分析", tabs: [["balance","⚖️ リーグ分析"]] },
];

export default function App(){
  const gs = useGameState();
  const sf = useSeasonFlow(gs);
  const os = useOffseason(gs);

  const handleLoad = () => {
    const saved = loadGame();
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
    gs.setSeasonHistory(saved.seasonHistory||{awards:[],records:{singleSeasonHR:null,singleSeasonAVG:null,singleSeasonK:null,careerHR:{},careerW:{}},hallOfFame:[],championships:[],standingsHistory:[]});
    gs.setNews(saved.news||[]);
    gs.setMailbox(saved.mailbox||[]);
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
    notif, tabBadges, faPool, faYears, setFaYears, news, mailbox,
    saveExists, setSaveExists, retireModal, setRetireModal,
    playerModal, setPlayerModal, retireRole, setRetireRole,
    notify, upd, addNews, addToHistory, setFaPool, setTeams, setSeasonHistory, setMailbox, setScreen,
    pressEvent, handlePressAnswer,
    allStarResult,
  } = gs;
  const { gameResult, currentOpp, batchResults, batchMeta, playoff, setPlayoff } = sf;
  const { developmentSummary, newSeasonInfo, draftPool, setDraftPool, draftResult, setDraftResult, draftAllocation, setDraftAllocation, waiverClaimResults } = os;
  const [agentNeg, setAgentNeg] = useState(null);
  const [draftAutoSkip, setDraftAutoSkip] = useState(false);
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
            ? "打線が 9 人揃っていません（DH含む）"
            : "打線が 8 人揃っていません",
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
          notify(`${pos}が重複しています`, "warn");
          return;
        }
      }
    }
    setTab(newTab);
  }, [tab, myTeam, notify, setTab]);

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
    const wouldBeAllPitchers = player.isPitcher && foreignPitchers === MAX_外国人_一軍 - 1;
    const wouldBeAllBatters = !player.isPitcher && foreignBatters === MAX_外国人_一軍 - 1;
    const balanceViolation = foreignActiveCount === MAX_外国人_一軍 - 1 && (wouldBeAllPitchers || wouldBeAllBatters);
    const goToFarm = foreignActiveCount >= MAX_外国人_一軍 || balanceViolation;
    if (goToFarm) {
      upd(myId, t => ({
        ...t,
        budget: t.budget - totalCost,
        farm: [...(t.farm || []), { ...player, isFA: false, contractYearsLeft: years, contractYears: years, salary }],
      }));
      const reason = foreignActiveCount >= MAX_外国人_一軍
        ? "外国人枠満杯"
        : "投手4名または野手4名は登録不可";
      notify(`${player.name}と契約（${reason}のため二軍スタート）`, "warn");
    } else {
      upd(myId, t => ({
        ...t,
        budget: t.budget - totalCost,
        players: [...t.players, { ...player, isFA: false, contractYearsLeft: years, contractYears: years, salary }],
      }));
      notify(`${player.name}を一軍登録で獲得！(${years}年 計${fmtSal(totalCost)})`, "ok");
    }
    setFaPool(prev => prev.filter(p => p.id !== player.id));
    setFaYears(prev => { const n = { ...prev }; delete n[player.id]; return n; });
    setAgentNeg(null);
  };

  // ── タイトル画面 ──
  if(screen==="title"){const saveMeta=saveExists?getSaveMeta():null;return(<><div className="app"><div className="title"><div className="tlogo">⚾ BASEBALL<br/>MANAGER 2025</div><div className="tsub">NPB SIMULATION v2.1 — TACTICAL MODE</div>{saveMeta&&(<div style={{background:"rgba(74,222,128,.08)",border:"1px solid rgba(74,222,128,.3)",borderRadius:8,padding:"10px 14px",marginBottom:16,textAlign:"left"}}><div style={{fontSize:10,color:"#4ade80",letterSpacing:".1em",marginBottom:6}}>◈ セーブデータ</div><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}><div><div style={{fontWeight:700,fontSize:15}}>{saveMeta.teamEmoji} {saveMeta.teamName}</div><div style={{fontSize:11,color:"#94a3b8"}}>{saveMeta.year}年 第{saveMeta.gameDay}戦 {saveMeta.wins}勝{saveMeta.losses}敗</div><div style={{fontSize:9,color:"#64748b",marginTop:2}}>{saveMeta.savedAt}</div></div><div style={{display:"flex",gap:6,alignItems:"center"}}><button className="sim-btn" style={{margin:0,padding:"8px 18px",fontSize:13,background:"linear-gradient(135deg,#14532d,#166534)",borderColor:"rgba(74,222,128,.6)",color:"#4ade80"}} onClick={handleLoad}>▶ 続きから</button><button className="bsm bgr" style={{padding:"6px 10px"}} onClick={()=>{if(window.confirm('セーブデータを削除しますか？')){deleteSave();setSaveExists(false);}}}>削除</button></div></div></div>)}<div style={{fontSize:10,color:"#1e2d3d",letterSpacing:".2em",marginBottom:8,marginTop:saveExists?8:0,zIndex:1,position:"relative"}}>◈ 新規ゲーム — チームを選択</div><div style={{fontSize:10,color:"#1e2d3d",letterSpacing:".2em",marginBottom:8,zIndex:1,position:"relative"}}>◈ セントラルリーグ</div><div className="tgrid" style={{marginBottom:14}}>{TEAM_DEFS.filter(t=>t.league==="セ").map(t=><div key={t.id} className="tcard" style={{"--c":t.color}} onClick={()=>gs.handleSelect(t.id)}><span style={{fontSize:24,display:"block",marginBottom:5}}>{t.emoji}</span><div className="tcard-nm">{t.name}</div></div>)}</div><div style={{fontSize:10,color:"#1e2d3d",letterSpacing:".2em",marginBottom:8,zIndex:1,position:"relative"}}>◈ パシフィックリーグ</div><div className="tgrid">{TEAM_DEFS.filter(t=>t.league==="パ").map(t=><div key={t.id} className="tcard" style={{"--c":t.color}} onClick={()=>gs.handleSelect(t.id)}><span style={{fontSize:24,display:"block",marginBottom:5}}>{t.emoji}</span><div className="tcard-nm">{t.name}</div></div>)}</div><div style={{marginTop:24,paddingTop:16,borderTop:"1px solid rgba(100,116,139,.12)",textAlign:"center"}}><a href="/baseball-manager/flow-diagram.html" target="_blank" rel="noopener noreferrer" style={{fontSize:10,color:"#334155",textDecoration:"none",letterSpacing:".1em"}}>⚙ 開発者向け: システムフロー図</a></div></div></div></>);}

  if(screen==="mode_select") return(<><ModeSelectScreen myTeam={myTeam} oppTeam={currentOpp} gameDay={gameDay} onSelect={sf.handleModeSelect} onBack={()=>setScreen("hub")}/></>);
  if(screen==="tactical_game"&&currentOpp) return(<><ErrorBoundary onReset={()=>setScreen("hub")}><TacticalGameScreen myTeam={sf.currentGameTeams?.my||myTeam} oppTeam={sf.currentGameTeams?.opp||currentOpp} onGameEnd={sf.handleTacticalGameEnd}/></ErrorBoundary></>);
  if(screen==="batch_result") return(<><ErrorBoundary onReset={()=>setScreen("hub")}><BatchResultScreen results={batchResults} batchMeta={batchMeta} myTeam={myTeam} onEnd={()=>setScreen("hub")} onViewDetail={r=>{sf.setGameResult({score:r.score,log:r.log||[],inningSummary:r.inningSummary||[],oppTeam:r.oppTeam,won:r.won,gameNo:r.gameNo,_source:"batch"});setScreen("result");}}/></ErrorBoundary></>);

  if(screen==="result"&&gameResult){const _src=gameResult._source;const _retScreen=_src==="batch"?"batch_result":"hub";const _retLabel=_src==="batch"?"← バッチ結果に戻る":_src==="schedule"?"← 日程に戻る":"次の試合へ →";return(<><ResultScreen gsResult={gameResult} myTeam={myTeam} oppTeam={gameResult.oppTeam} gameDay={gameResult.gameNo??gameDay-1} onNext={()=>setScreen(_retScreen)} nextLabel={_retLabel}/></>);}

  if(screen==="allstar"&&allStarResult) return(<>
    <AllStarScreen
      year={year}
      rosters={allStarResult.rosters}
      gameResult={allStarResult.gameResult}
      onEnd={()=>setScreen("hub")}
    />
  </>);

  if(screen==="retire_phase") return(<><ErrorBoundary onReset={()=>setScreen("hub")}><RetirePhaseScreen teams={teams} myId={myId} year={year} onNext={os.handleRetirePhaseNext}/></ErrorBoundary></>);
  if(screen==="development_phase") return(<><ErrorBoundary onReset={()=>setScreen("hub")}><GrowthSummaryScreen summary={developmentSummary} year={year} onNext={()=>setScreen("waiver_phase")}/></ErrorBoundary></>);
  if(screen==="waiver_phase") return(<><ErrorBoundary onReset={()=>setScreen("hub")}><WaiverPhaseScreen teams={teams} myId={myId} year={year} onRelease={(pid)=>{const p=myTeam?.players.find(x=>x.id===pid);const popPenalty=(p?.salary??0)>POP_RELEASE_SALARY_THRESHOLD?POP_RELEASE_PENALTY:0;upd(myId,t=>({...t,players:t.players.filter(x=>x.id!==pid),popularity:Math.min(100,Math.max(0,(t.popularity??50)+popPenalty))}));if(p) setFaPool(prev=>[...prev,{...p,isFA:true}]);}} onNext={os.handleWaiverPhaseNext}/></ErrorBoundary></> );
  if(screen==="waiver_result") return(<><ErrorBoundary onReset={()=>setScreen("hub")}><WaiverResultScreen results={waiverClaimResults} year={year} onNext={()=>setScreen("draft_preview")}/></ErrorBoundary></>);
  if(screen==="playoff"&&playoff) return(<><ErrorBoundary onReset={()=>setScreen("hub")}><PlayoffScreen playoff={playoff} setPlayoff={setPlayoff} teams={teams} myId={myId} year={year} onFinish={()=>{
    if(playoff?.champion){
      const jpS=playoff.jpSeries;
      const opp=jpS?jpS.teams.find(t=>t.id!==playoff.champion.id):null;
      const seriesResult=jpS?jpS.wins[0]+"-"+jpS.wins[1]:"4-?";
      setSeasonHistory(prev=>({...prev,championships:[...(prev.championships||[]),{year,championId:playoff.champion.id,championName:playoff.champion.name,opponent:opp?.name||"?",seriesResult}]}));
      if(playoff.champion.id===myId){setMailbox(prev=>[...prev,{id:uid(),type:"championship",read:false,title:"🏆 "+year+"年 日本一達成！",from:"NPB本部",dateLabel:year+"年",timestamp:Date.now(),body:playoff.champion.name+"が"+year+"年の日本シリーズを制覇しました（"+seriesResult+"）。球団史に残る偉業です！"}]);}
    }
    const trustDelta=calcOwnerTrustDelta(myId,myTeam,playoff);
    if(trustDelta!==0){
      gs.upd(myId,t=>({...t,ownerTrust:clamp((t.ownerTrust??50)+trustDelta,0,100)}));
      const goalLabel={champion:"日本一",pennant:"ペナント優勝",cs:"CS出場",rebuild:"再建"}[myTeam?.ownerGoal||"cs"];
      setMailbox(prev=>[...prev,{id:uid(),type:"owner_trust",read:false,title:(trustDelta>0?"✅":"⚠️")+" オーナー評価: 目標「"+goalLabel+"」"+(trustDelta>0?"達成":"未達"),from:"球団オーナー",dateLabel:year+"年",timestamp:Date.now(),body:"今季の目標「"+goalLabel+"」に対する評価が確定しました。信頼度が"+(trustDelta>0?"+":"")+trustDelta+"変動しました（翌年予算に影響します）。"}]);
    }
    setScreen("retire_phase");
  }}/></ErrorBoundary></>);
  if(screen==="draft_preview"&&draftPool) return(<><DraftPreviewScreen teams={teams} myId={myId} year={year} pool={draftPool} draftAllocation={draftAllocation} onAllocationChange={setDraftAllocation} onStart={()=>setScreen("draft_lottery")}/></>);
  if(screen==="draft_lottery"&&draftPool) return(<><DraftLotteryScreen teams={teams} myId={myId} year={year} pool={draftPool} onDone={(r1,autoSkip)=>{setDraftPool(prev=>prev.map(p=>{const winner=Object.entries(r1).find(function(e){return e[1]&&e[1].id===p.id;});return{...p,_drafted:winner?true:undefined,_r1winner:winner?Number(winner[0]):undefined};}));if(autoSkip) setDraftAutoSkip(true);setScreen("draft");}}/></>);
  if(screen==="draft"&&draftPool) return(<><DraftScreen teams={teams} myId={myId} year={year} pool={draftPool} draftAllocation={draftAllocation} autoSkip={draftAutoSkip} onDraftDone={(pl,dr)=>{setDraftAutoSkip(false);setDraftResult({pool:pl,drafted:dr});setScreen("draft_review");}}/></>);
  if(screen==="draft_review"&&draftResult) return(<><DraftReviewScreen teams={teams} myId={myId} year={year} pool={draftResult.pool} drafted={draftResult.drafted} onEnd={()=>os.handleDraftComplete(draftResult.pool,draftResult.drafted)}/></>);
  if(screen==="new_season") return(<><NewSeasonScreen year={year} info={newSeasonInfo} developmentSummary={developmentSummary} ownerGoal={myTeam?.ownerGoal||"cs"} onGoalSelect={(goal)=>gs.upd(myId,t=>({...t,ownerGoal:goal}))} onStart={()=>{setScreen("hub");setTab("dashboard");notify(`${year}年シーズン開幕！`,"ok");}}/></>);

  if(screen==="team_detail"&&gs.viewingTeam) return(
    <TeamDetailScreen
      team={gs.viewingTeam}
      allTeams={teams}
      schedule={schedule}
      year={year}
      allTeamResultsMap={gs.allTeamResultsMap}
      onBack={()=>setScreen("hub")}
      onPlayerClick={gs.handlePlayerClick}
    />
  );

  // ── HUB ──
  const g=(myTeam?.wins||0)+(myTeam?.losses||0);
  const remain=SEASON_GAMES-g;

  return(<><div className="app"><div className="hub">
    <div className="topbar">
      <span style={{fontSize:26}}>{myTeam?.emoji}</span>
      <div style={{flex:1}}><div style={{fontWeight:700,fontSize:14,color:myTeam?.color}}>{myTeam?.name}</div><div style={{fontSize:10,color:"#374151"}}>{year}年 {(d=>d.month+"月"+d.day+"日")(gameDayToDate(gameDay,schedule))} / 第{gameDay}戦{schedule?.[gameDay]?.isInterleague?" 🔄交流戦":""} / 残り{remain}試合</div></div>
      <div style={{display:"flex",gap:5,flexWrap:"wrap"}}><span className="chip cg">{myTeam?.wins}勝</span><span className="chip cr">{myTeam?.losses}敗</span><span className="chip cy">{fmtM(myTeam?.budget||0)}</span></div>
      <div className="tb-record">{myTeam?.wins}勝{myTeam?.losses}敗</div>
      <button style={{background:"rgba(74,222,128,.1)",border:"1px solid rgba(74,222,128,.4)",color:"#4ade80",borderRadius:6,padding:"4px 10px",fontSize:11,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}} onClick={gs.handleSave}>💾 保存</button>
    </div>

    {notif&&<div className={`notif ${notif.type==="ok"?"nok":notif.type==="warn"?"nwarn":"nbad"}`}>{notif.msg}</div>}

    {gameDay<=SEASON_GAMES&&(
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:10}}>
        <button className="sim-btn" style={{margin:0,fontSize:12}} onClick={sf.handleStartGame}>
          ⚾ 1試合<br/><span style={{fontSize:9,opacity:.7}}>采配 or オート</span>
        </button>
        <button className="sim-btn" style={{margin:0,fontSize:12,background:"linear-gradient(135deg,#071a2c,#0d2840)",borderColor:"rgba(96,165,250,.5)",color:"#60a5fa"}} onClick={sf.handleBatchSim}>
          ⚡ {Math.min(BATCH,SEASON_GAMES-(gameDay-1))}試合まとめて<br/><span style={{fontSize:9,opacity:.7}}>オートシム</span>
        </button>
        <button className="sim-btn" style={{margin:0,fontSize:12,background:"linear-gradient(135deg,#1a0730,#2d0f50)",borderColor:"rgba(167,139,250,.5)",color:"#a78bfa"}} onClick={sf.handleSeasonSim}>
          🚀 残り全{remain}試合<br/><span style={{fontSize:9,opacity:.7}}>シーズン一括消化</span>
        </button>
      </div>
    )}

    <div className="tabs-nav">
      {TAB_GROUPS.map(group=>(
        <div key={group.label} className="tab-group">
          <div className="tab-group-label">{group.label}</div>
          <div className="tabs">
            {group.tabs.map(([id,l])=>(
              <button key={id} className={`tab ${tab===id?"on":""}`} onClick={()=>handleTabChange(id)}>
                {l}{tabBadges[id]&&<span style={{marginLeft:4,background:tabBadges[id].color,color:"#fff",borderRadius:8,padding:"0 5px",fontSize:9,fontWeight:700}}>{tabBadges[id].n}</span>}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>

    <ErrorBoundary key={tab}>
    {tab==="dashboard"&&<DashboardTab myTeam={myTeam} teams={teams} schedule={schedule} gameDay={gameDay} year={year} recentResults={gs.recentResults} mailbox={mailbox} faPool={faPool} onTabSwitch={handleTabChange}/>}
    {tab==="roster"&&<RosterTab team={myTeam} onToggle={gs.toggleLineup} onSetLineupOrder={gs.setLineupOrder} onSetRosterDhMode={gs.setRosterDhMode} onSetPlayerPosition={gs.setPlayerPosition} onSetStarter={gs.setStarter} onPromo={gs.promote} onDemo={gs.demote} onSetTrainingFocus={gs.setTrainingFocus} onConvertIkusei={gs.convertIkusei} onMoveRotation={gs.moveRotation} onRemoveFromRotation={gs.removeFromRotation} onSetPitchingPattern={gs.setPitchingPattern} onPlayerClick={gs.handlePlayerClick} onSetDevGoal={gs.setDevGoal} onPlayerTalk={gs.handlePlayerTalk} onSetConvertTarget={gs.setConvertTarget} gameDay={gameDay}/>}
    {tab==="schedule"&&<ScheduleTab schedule={schedule} gameDay={gameDay} myTeam={myTeam} teams={teams} year={year} gameResultsMap={gs.gameResultsMap} allStarDone={gs.allStarDone} allStarResult={gs.allStarResult} allStarTriggerDay={gs.allStarTriggerDay} scheduleArchive={gs.scheduleArchive||[]} onResultClick={dayNo=>{const r=gs.gameResultsMap[dayNo];if(r){sf.setGameResult({score:{my:r.myScore,opp:r.oppScore},log:r.log||[],inningSummary:r.inningSummary||[],oppTeam:r.oppTeam,won:r.won,gameNo:dayNo,_source:"schedule"});setScreen("result");}}}/>}
    {tab==="records"&&<RecordsTab history={gs.seasonHistory}/>}
    {tab==="news"&&<NewsTab news={news} onInterview={gs.handleInterview}/>}
    {tab==="mailbox"&&<MailboxTab mailbox={mailbox} onRead={os.handleMailRead} onAction={os.handleMailAction} teams={teams} myTeam={myTeam} onTrade={os.handleTrade} onTeamClick={gs.handleTeamClick}/>}
    {tab==="trade"&&(()=>{const pendingTrades=mailbox.filter(m=>m.type==="trade"&&!m.resolved);return<TradeTab myTeam={myTeam} teams={teams} onTrade={os.handleTrade} cpuOffers={pendingTrades.map(m=>m.offer)} onAcceptOffer={(idx)=>os.handleMailAction(pendingTrades[idx].id,"accept")} onDeclineOffer={(idx)=>os.handleMailAction(pendingTrades[idx].id,"decline")} deadlinePassed={(()=>{const d=gameDayToDate(gameDay,schedule);return d?d.month>TRADE_DEADLINE_MONTH:gameDay>95;})()} onPlayerClick={gs.handlePlayerClick}/>;})()}
    {tab==="contract"&&<ContractTab team={myTeam} allTeams={teams} onOffer={os.handleContractOffer} onRelease={pid=>{const p=myTeam?.players.find(x=>x.id===pid);const popPenalty=(p?.salary??0)>POP_RELEASE_SALARY_THRESHOLD?POP_RELEASE_PENALTY:0;upd(myId,t=>({...t,players:t.players.filter(x=>x.id!==pid),popularity:Math.min(100,Math.max(0,(t.popularity??50)+popPenalty))}));if(p){addToHistory(myId,p,"自由契約");setFaPool(prev=>[...prev,{...p,isFA:true}]);}notify("放出しました","warn");}}/>}
    {tab==="alumni"&&<AlumniTab myTeam={myTeam}/>}
        {tab==="fa"&&(
      <div className="card">
        <div className="card-h">FA市場 ({faPool.length}人)
          <span className="chip cb" style={{marginLeft:8,fontSize:10}}>外国人一軍: {foreignActiveCount}/{MAX_外国人_一軍}</span>
        </div>

        <div className="card-h" style={{marginTop:8}}>🌏 外国人FA市場 ({foreignFaPool.length}人)</div>
        {gameDay>FOREIGN_DEADLINE_DAY&&(
          <div className="card2" style={{borderColor:"rgba(248,113,113,.4)",color:"#fca5a5"}}>交渉期限終了（7月末）</div>
        )}
        {foreignFaPool.length===0&&<p style={{color:"#2a3a4c",fontSize:12}}>現在、外国人FA選手はいません</p>}
        {foreignFaPool.map((p)=>{
          const active = agentNeg?.player?.id===p.id;
          return(
            <div key={p.id} className="card2">
              <div className="fsb" style={{flexWrap:"wrap",gap:6}}>
                <div>
                  <span style={{fontWeight:700,fontSize:13}}>{p.name}</span>
                  <span style={{fontSize:10,color:"#374151",marginLeft:8}}>{p.pos}/{p.age}歳 {p.hometown} 出身 · 基準{fmtSal(p.salary)}/年</span>
                </div>
                <div style={{fontSize:10,color:"#374151"}}>{p.isPitcher?`投: 球速${p.pitching?.velocity||"-"} 制球${p.pitching?.control||"-"}`:`打: ミ${p.batting?.contact||"-"} パ${p.batting?.power||"-"}`}</div>
              </div>
              {!active&&(
                <button className="bsm bga" style={{marginTop:8,opacity:gameDay>FOREIGN_DEADLINE_DAY?0.5:1}} disabled={gameDay>FOREIGN_DEADLINE_DAY} onClick={()=>startNeg(p)}>
                  代理人交渉
                </button>
              )}
              {active&&agentNeg&&(
                <div style={{marginTop:8,borderTop:"1px solid rgba(100,116,139,.25)",paddingTop:8,fontSize:11}}>
                  {agentNeg.round===1&&(
                    <>
                      <div style={{marginBottom:6,color:"#cbd5e1"}}>Round 1: 年俸交渉（代理人要求: {fmtSal(agentNeg.salaryDemand)}/年）</div>
                      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                        <button className="bsm bga" onClick={()=>setAgentNeg(prev=>({...prev,round:2,salaryOffer:prev.salaryDemand}))}>要求を呑む</button>
                        <button className="bsm bga" onClick={()=>{
                          const accepted = rngf(0,1) < FOREIGN_AGENT_ACCEPT_PROB;
                          if(!accepted){ notify("エージェントが交渉を打ち切りました", "warn"); setAgentNeg(null); return; }
                          setAgentNeg(prev=>({...prev,round:2,salaryOffer:prev.player.salary}));
                        }}>基準年俸で交渉</button>
                        <button className="bsm bgr" onClick={()=>setAgentNeg(null)}>交渉打ち切り</button>
                      </div>
                    </>
                  )}
                  {agentNeg.round===2&&(
                    <>
                      <div style={{marginBottom:6,color:"#cbd5e1"}}>Round 2: 契約年数（最低 {agentNeg.minYears} 年）</div>
                      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                        <button className="bsm bga" onClick={()=>signForeignPlayer(agentNeg.player, agentNeg.salaryOffer, agentNeg.minYears)}>
                          同意する（{agentNeg.minYears}年 計{fmtSal(agentNeg.salaryOffer*agentNeg.minYears)}）
                        </button>
                        <button className="bsm bgr" onClick={()=>setAgentNeg(null)}>交渉打ち切り</button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}

        <div className="card-h" style={{marginTop:12}}>国内FA・戦力外 ({domesticFaPool.length}人)</div>
        {domesticFaPool.length===0&&<p style={{color:"#2a3a4c",fontSize:12}}>現在FA選手はいません</p>}
        {domesticFaPool.map((p)=>{
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
                <button className="bsm bga" style={{marginLeft:4,opacity:canAfford?1:0.4}} onClick={()=>{if(!canAfford){notify("予算不足","warn");return;}upd(myId,t=>({...t,budget:t.budget-totalCost,players:[...t.players,{...p,isFA:false,contractYearsLeft:yrs,contractYears:yrs}]}));setFaPool(prev=>prev.filter(x=>x.id!==p.id));setFaYears(prev=>{const n={...prev};delete n[p.id];return n;});notify(`${p.name}を獲得！(${yrs}年 計${fmtSal(totalCost)})`,"ok");}}>獲得</button>
              </div>
            </div>
          </div>
          );
        })}
      </div>
    )}
    {tab==="scout"&&(
      <div>
        {myTeam?.scoutResults.length>0&&<div className="card"><div className="card-h">スカウト報告</div>{myTeam.scoutResults.map((p,i)=>{
          const bf=p._scoutBudgetFactor||1.0; const rf=p._scoutRegionFactor||1.0;
          const sv=(key,val)=>scoutedValue(val,p.id,key,15,bf,rf);
          const ScoutVal=({k,v})=>{const r=sv(k,v);return <span style={{color:r.estimated?"#f5c842":"#94a3b8"}}>{r.value}{r.estimated&&<span style={{fontSize:8,opacity:.6}}>?</span>}</span>;};
          return <div key={p.id} className="card2">
            <div className="fsb" style={{marginBottom:6}}><span style={{fontWeight:700}}>{p.name} <span style={{fontSize:10,color:"#374151"}}>{p.pos}/{p.age}歳</span>{p.isForeign&&<span className="chip cb" style={{marginLeft:4,fontSize:8}}>外</span>}</span><div style={{display:"flex",gap:6}}><button className="bsm bga" onClick={()=>gs.signPlayer(i)}>獲得</button><button className="bsm bgr" onClick={()=>upd(myId,t=>({...t,scoutResults:t.scoutResults.filter((_,j)=>j!==i)}))}>見送り</button></div></div>
            <div style={{display:"flex",gap:12,flexWrap:"wrap",fontSize:10}}>
              {p.isPitcher?<>
                <span style={{color:"#374151"}}>球速 <ScoutVal k="velocity" v={p.pitching?.velocity}/></span>
                <span style={{color:"#374151"}}>制球 <ScoutVal k="control" v={p.pitching?.control}/></span>
                <span style={{color:"#374151"}}>変化 <ScoutVal k="breaking" v={p.pitching?.breaking}/></span>
                <span style={{color:"#374151"}}>スタ <ScoutVal k="stamina" v={p.pitching?.stamina}/></span>
              </>:<>
                <span style={{color:"#374151"}}>ミート <ScoutVal k="contact" v={p.batting?.contact}/></span>
                <span style={{color:"#374151"}}>長打 <ScoutVal k="power" v={p.batting?.power}/></span>
                <span style={{color:"#374151"}}>走力 <ScoutVal k="speed" v={p.batting?.speed}/></span>
                <span style={{color:"#374151"}}>選球 <ScoutVal k="eye" v={p.batting?.eye}/></span>
              </>}
              <span style={{color:"#374151"}}>潜在 <ScoutVal k="potential" v={p.potential}/></span>
            </div>
            <div style={{fontSize:9,color:"#374151",marginTop:4}}>{fmtSal(p.salary)}/年 · <span style={{color:"#f5c842"}}>?マークは推定値</span></div>
          </div>;
        })}</div>}
        <div className="card"><div className="card-h">スカウト派遣</div><div className="g2">{SCOUT_REGIONS.map(sr=><div key={sr.id} className="card2" style={{cursor:"pointer"}} onClick={()=>gs.sendScout(sr)}><div style={{fontWeight:700,fontSize:12,marginBottom:3}}>{sr.name}</div><div style={{fontSize:10,color:"#374151"}}>費用:{fmtSal(sr.cost)} / Lv{sr.qMin}〜{sr.qMax}</div></div>)}</div></div>
      </div>
    )}
    {tab==="finance"&&<FinanceTab team={myTeam} onStadiumUpgrade={gs.handleStadiumUpgrade} gameDay={gameDay} onPlayerClick={gs.handlePlayerClick}/>}
    {tab==="standings"&&<StandingsTab teams={teams} myId={myId} onTeamClick={gs.handleTeamClick}/>}
    {tab==="stats"&&<StatsTab teams={teams} myId={myId}/>}
    {tab==="balance"&&<BalanceTab teams={teams}/>}

    {tab==="roster"&&(
      <div className="card">
        <div className="card-h">コーチ陣</div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10}}>{myTeam?.coaches.map((c,i)=><div key={i} className="card2" style={{display:"flex",alignItems:"center",gap:8,flex:"1 1 190px"}}><span style={{fontSize:18}}>{c.emoji}</span><div style={{flex:1}}><div style={{fontSize:12,fontWeight:700}}>{c.typeName} <span style={{color:"#f5c842",fontSize:10}}>Lv{c.grade}</span></div><div style={{fontSize:10,color:"#374151"}}>{c.name}</div></div><button className="bsm bgr" onClick={()=>gs.fireCoach(i)}>解雇</button></div>)}</div>
        <details><summary style={{fontSize:11,color:"#374151",cursor:"pointer"}}>+ コーチを雇う</summary><div className="g2" style={{marginTop:8}}>{COACH_DEFS.map(cd=>COACH_GRADES.map(cg=>{const hired=myTeam?.coaches.some(c=>c.type===cd.type&&c.grade===cg.g);return <div key={cd.type+cg.g} className="card2" style={{opacity:hired?0.5:1}}><div className="fsb"><span style={{fontSize:11}}>{cd.emoji}{cd.name} Lv{cg.g}</span><button className="bsm bga" disabled={hired} onClick={()=>gs.hireCoach(cd,cg)}>{hired?"済":"雇う"}</button></div><div style={{fontSize:10,color:"#374151",marginTop:2}}>{fmtSal(cg.salary)}/月 · +{cg.bonus}成長</div></div>;}))}</div></details>
      </div>
    )}
    <RetireModal modal={retireModal} retireRole={retireRole} setRetireRole={setRetireRole} onRetain={()=>os.handleRetain(retireModal.player)} onAccept={()=>os.handleAcceptRetire(retireModal.player)} onStartRetireGame={()=>os.handleStartRetireGame(retireModal.player)} onSkipRetireGame={()=>os.handleSkipRetireGame(retireModal.player)}/>
    {playerModal&&<PlayerModal player={playerModal.player} teamName={playerModal.teamName} isMyTeam={playerModal.teamName===myTeam?.name} onSetConvertTarget={gs.setConvertTarget} onClose={()=>setPlayerModal(null)}/>}

    {gs.pregameError&&(
      <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.72)',zIndex:400,display:'flex',alignItems:'center',justifyContent:'center',padding:'0 16px'}}>
        <div style={{background:'#0d1b2a',border:'1px solid rgba(248,113,113,.4)',borderRadius:12,padding:'24px 20px',width:'100%',maxWidth:420,boxShadow:'0 8px 32px rgba(0,0,0,.6)'}}>
          <div style={{fontSize:15,fontWeight:700,color:'#f87171',marginBottom:10}}>⚠️ 試合開始エラー</div>
          <div style={{fontSize:13,color:'#cbd5e1',marginBottom:18,lineHeight:1.6}}>{gs.pregameError.message}</div>
          <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
            <button
              className="bsm bga"
              onClick={()=>{gs.setPregameError(null);setTab('roster');}}
            >ロースタータブへ</button>
            <button
              className="bsm bgr"
              onClick={()=>gs.setPregameError(null)}
            >閉じる</button>
          </div>
        </div>
      </div>
    )}
    {pressEvent&&<PressConferenceModal event={pressEvent} onAnswer={handlePressAnswer}/>}
    </ErrorBoundary>
  </div></div></>);
}
