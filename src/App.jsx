import { ErrorBoundary } from './components/ErrorBoundary';
import './styles.css';
import { uid, fmtM, fmtSal, gameDayToDate, scoutedValue, clamp } from './utils';
import { loadGame, getSaveMeta, deleteSave } from './engine/saveload';
import { generateSeasonSchedule } from './engine/scheduleGen';
import { TacticalGameScreen } from './components/TacticalGame';
import { BatchResultScreen } from './components/BatchResult';
import { ModeSelectScreen, ResultScreen, RetirePhaseScreen, WaiverPhaseScreen, WaiverResultScreen, GrowthSummaryScreen, NewSeasonScreen } from './components/Screens';
import { DraftPreviewScreen, DraftLotteryScreen, DraftScreen, DraftReviewScreen } from './components/Draft';
import { PlayoffScreen } from './components/PlayoffScreen';
import { RetireModal } from './components/RetireModal';
import { PlayerModal } from './components/PlayerModal';
import { PressConferenceModal } from './components/PressConferenceModal';
import { AllStarScreen } from './components/AllStarScreen';
import { DashboardTab } from './components/DashboardTab';
import { StatsTab, FinanceTab, ContractTab, NewsTab, MailboxTab, TradeTab, AlumniTab, RosterTab, StandingsTab, RecordsTab, ScheduleTab } from './components/Tabs';
import { SEASON_GAMES, BATCH, MAX_外国人_一軍, TEAM_DEFS, COACH_DEFS, COACH_GRADES, SCOUT_REGIONS, POP_RELEASE_PENALTY, POP_RELEASE_SALARY_THRESHOLD } from './constants';
import { calcOwnerTrustDelta } from './engine/frontend';
import { useGameState } from './hooks/useGameState';
import { useSeasonFlow } from './hooks/useSeasonFlow';
import { useOffseason } from './hooks/useOffseason';

const TAB_GROUPS = [
  { label: "試合", tabs: [["dashboard","🏠 概況"],["schedule","🗓️ 日程"],["standings","🏆 順位"],["stats","📊 成績"],["records","🏛 記録"]] },
  { label: "編成", tabs: [["roster","👥 ロースター"],["trade","🔄 トレード"],["contract","📝 契約"],["fa","🏪 FA"],["scout","🔍 スカウト"]] },
  { label: "球団", tabs: [["news","📰 ニュース"],["mailbox","📨 メール"],["alumni","📖 歴代"],["finance","💴 財務"]] },
];

export default function App(){
  const gs = useGameState();
  const sf = useSeasonFlow(gs);
  const os = useOffseason(gs);

  const handleLoad = () => {
    const saved = loadGame();
    if(!saved){ gs.notify('セーブデータがありません','warn'); return; }
    gs.setTeams(saved.teams);
    gs.setMyId(saved.myId);
    gs.setGameDay(saved.gameDay);
    gs.setYear(saved.year);
    gs.setSchedule(generateSeasonSchedule(saved.year, saved.teams));
    gs.setFaPool(saved.faPool||[]);
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
  const { gameResult, currentOpp, batchResults, playoff, setPlayoff } = sf;
  const { developmentSummary, newSeasonInfo, draftPool, setDraftPool, draftResult, setDraftResult, draftAllocation, setDraftAllocation, waiverClaimResults } = os;

  // ── タイトル画面 ──
  if(screen==="title"){const saveMeta=saveExists?getSaveMeta():null;return(<><div className="app"><div className="title"><div className="tlogo">⚾ BASEBALL<br/>MANAGER 2025</div><div className="tsub">NPB SIMULATION v2.1 — TACTICAL MODE</div>{saveMeta&&(<div style={{background:"rgba(74,222,128,.08)",border:"1px solid rgba(74,222,128,.3)",borderRadius:8,padding:"10px 14px",marginBottom:16,textAlign:"left"}}><div style={{fontSize:10,color:"#4ade80",letterSpacing:".1em",marginBottom:6}}>◈ セーブデータ</div><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}><div><div style={{fontWeight:700,fontSize:15}}>{saveMeta.teamEmoji} {saveMeta.teamName}</div><div style={{fontSize:11,color:"#94a3b8"}}>{saveMeta.year}年 第{saveMeta.gameDay}戦 {saveMeta.wins}勝{saveMeta.losses}敗</div><div style={{fontSize:9,color:"#64748b",marginTop:2}}>{saveMeta.savedAt}</div></div><div style={{display:"flex",gap:6,alignItems:"center"}}><button className="sim-btn" style={{margin:0,padding:"8px 18px",fontSize:13,background:"linear-gradient(135deg,#14532d,#166534)",borderColor:"rgba(74,222,128,.6)",color:"#4ade80"}} onClick={handleLoad}>▶ 続きから</button><button className="bsm bgr" style={{padding:"6px 10px"}} onClick={()=>{if(window.confirm('セーブデータを削除しますか？')){deleteSave();setSaveExists(false);}}}>削除</button></div></div></div>)}<div style={{fontSize:10,color:"#1e2d3d",letterSpacing:".2em",marginBottom:8,marginTop:saveExists?8:0,zIndex:1,position:"relative"}}>◈ 新規ゲーム — チームを選択</div><div style={{fontSize:10,color:"#1e2d3d",letterSpacing:".2em",marginBottom:8,zIndex:1,position:"relative"}}>◈ セントラルリーグ</div><div className="tgrid" style={{marginBottom:14}}>{TEAM_DEFS.filter(t=>t.league==="セ").map(t=><div key={t.id} className="tcard" style={{"--c":t.color}} onClick={()=>gs.handleSelect(t.id)}><span style={{fontSize:24,display:"block",marginBottom:5}}>{t.emoji}</span><div className="tcard-nm">{t.name}</div></div>)}</div><div style={{fontSize:10,color:"#1e2d3d",letterSpacing:".2em",marginBottom:8,zIndex:1,position:"relative"}}>◈ パシフィックリーグ</div><div className="tgrid">{TEAM_DEFS.filter(t=>t.league==="パ").map(t=><div key={t.id} className="tcard" style={{"--c":t.color}} onClick={()=>gs.handleSelect(t.id)}><span style={{fontSize:24,display:"block",marginBottom:5}}>{t.emoji}</span><div className="tcard-nm">{t.name}</div></div>)}</div></div></div></>);}

  if(screen==="mode_select") return(<><ModeSelectScreen myTeam={myTeam} oppTeam={currentOpp} gameDay={gameDay} onSelect={sf.handleModeSelect} onBack={()=>setScreen("hub")}/></>);
  if(screen==="tactical_game"&&currentOpp) return(<><ErrorBoundary onReset={()=>setScreen("hub")}><TacticalGameScreen myTeam={myTeam} oppTeam={currentOpp} onGameEnd={sf.handleTacticalGameEnd}/></ErrorBoundary></>);
  if(screen==="batch_result") return(<><ErrorBoundary onReset={()=>setScreen("hub")}><BatchResultScreen results={batchResults} myTeam={myTeam} onEnd={()=>setScreen("hub")}/></ErrorBoundary></>);

  if(screen==="result"&&gameResult) return(<><ResultScreen gsResult={gameResult} myTeam={myTeam} oppTeam={gameResult.oppTeam} gameDay={gameDay-1} onNext={()=>setScreen("hub")}/></>);

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
      if(playoff.champion.id===myId){setMailbox(prev=>[...prev,{id:uid(),type:"championship",read:false,subject:"🏆 "+year+"年 日本一達成！",body:playoff.champion.name+"が"+year+"年の日本シリーズを制覇しました（"+seriesResult+"）。球団史に残る偉業です！"}]);}
    }
    const trustDelta=calcOwnerTrustDelta(myId,myTeam,playoff);
    if(trustDelta!==0){
      gs.upd(myId,t=>({...t,ownerTrust:clamp((t.ownerTrust??50)+trustDelta,0,100)}));
      const goalLabel={champion:"日本一",pennant:"ペナント優勝",cs:"CS出場",rebuild:"再建"}[myTeam?.ownerGoal||"cs"];
      setMailbox(prev=>[...prev,{id:uid(),type:"owner_trust",read:false,subject:(trustDelta>0?"✅":"⚠️")+" オーナー評価: 目標「"+goalLabel+"」"+(trustDelta>0?"達成":"未達"),body:"今季の目標「"+goalLabel+"」に対する評価が確定しました。信頼度が"+(trustDelta>0?"+":"")+trustDelta+"変動しました（翌年予算に影響します）。"}]);
    }
    setScreen("retire_phase");
  }}/></ErrorBoundary></>);
  if(screen==="draft_preview"&&draftPool) return(<><DraftPreviewScreen teams={teams} myId={myId} year={year} pool={draftPool} draftAllocation={draftAllocation} onAllocationChange={setDraftAllocation} onStart={()=>setScreen("draft_lottery")}/></>);
  if(screen==="draft_lottery"&&draftPool) return(<><DraftLotteryScreen teams={teams} myId={myId} year={year} pool={draftPool} onDone={(r1)=>{setDraftPool(prev=>prev.map(p=>{const winner=Object.entries(r1).find(function(e){return e[1]&&e[1].id===p.id;});return{...p,_drafted:winner?true:undefined,_r1winner:winner?winner[0]:undefined};}));setScreen("draft");}}/></>);
  if(screen==="draft"&&draftPool) return(<><DraftScreen teams={teams} myId={myId} year={year} pool={draftPool} draftAllocation={draftAllocation} onDraftDone={(pl,dr)=>{setDraftResult({pool:pl,drafted:dr});setScreen("draft_review");}}/></>);
  if(screen==="draft_review"&&draftResult) return(<><DraftReviewScreen teams={teams} myId={myId} year={year} pool={draftResult.pool} drafted={draftResult.drafted} onEnd={()=>os.handleDraftComplete(draftResult.pool,draftResult.drafted)}/></>);
  if(screen==="new_season") return(<><NewSeasonScreen year={year} info={newSeasonInfo} developmentSummary={developmentSummary} ownerGoal={myTeam?.ownerGoal||"cs"} onGoalSelect={(goal)=>gs.upd(myId,t=>({...t,ownerGoal:goal}))} onStart={()=>{setScreen("hub");setTab("dashboard");notify(`${year}年シーズン開幕！`,"ok");}}/></>);

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
              <button key={id} className={`tab ${tab===id?"on":""}`} onClick={()=>setTab(id)}>
                {l}{tabBadges[id]&&<span style={{marginLeft:4,background:tabBadges[id].color,color:"#fff",borderRadius:8,padding:"0 5px",fontSize:9,fontWeight:700}}>{tabBadges[id].n}</span>}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>

    <ErrorBoundary key={tab}>
    {tab==="dashboard"&&<DashboardTab myTeam={myTeam} teams={teams} schedule={schedule} gameDay={gameDay} year={year} recentResults={gs.recentResults} mailbox={mailbox} faPool={faPool} onTabSwitch={setTab}/>}
    {tab==="roster"&&<RosterTab team={myTeam} onToggle={gs.toggleLineup} onSetStarter={gs.setStarter} onPromo={gs.promote} onDemo={gs.demote} onSetTrainingFocus={gs.setTrainingFocus} onConvertIkusei={gs.convertIkusei} onMoveRotation={gs.moveRotation} onRemoveFromRotation={gs.removeFromRotation} onSetPitchingPattern={gs.setPitchingPattern} onPlayerClick={gs.handlePlayerClick} onSetDevGoal={gs.setDevGoal} onPlayerTalk={gs.handlePlayerTalk} gameDay={gameDay}/>}
    {tab==="schedule"&&<ScheduleTab schedule={schedule} gameDay={gameDay} myTeam={myTeam} teams={teams} year={year} gameResultsMap={gs.gameResultsMap} allStarDone={gs.allStarDone}/>}
    {tab==="records"&&<RecordsTab history={gs.seasonHistory}/>}
    {tab==="news"&&<NewsTab news={news} onInterview={gs.handleInterview}/>}
    {tab==="mailbox"&&<MailboxTab mailbox={mailbox} onRead={os.handleMailRead} onAction={os.handleMailAction} teams={teams} myTeam={myTeam} onTrade={os.handleTrade}/>}
    {tab==="trade"&&(()=>{const pendingTrades=mailbox.filter(m=>m.type==="trade"&&!m.resolved);return<TradeTab myTeam={myTeam} teams={teams} onTrade={os.handleTrade} cpuOffers={pendingTrades.map(m=>m.offer)} onAcceptOffer={(idx)=>os.handleMailAction(pendingTrades[idx].id,"accept")} onDeclineOffer={(idx)=>os.handleMailAction(pendingTrades[idx].id,"decline")} deadlinePassed={gameDay>95} onPlayerClick={gs.handlePlayerClick}/>;})()}
    {tab==="contract"&&<ContractTab team={myTeam} allTeams={teams} onOffer={os.handleContractOffer} onRelease={pid=>{const p=myTeam?.players.find(x=>x.id===pid);const popPenalty=(p?.salary??0)>POP_RELEASE_SALARY_THRESHOLD?POP_RELEASE_PENALTY:0;upd(myId,t=>({...t,players:t.players.filter(x=>x.id!==pid),popularity:Math.min(100,Math.max(0,(t.popularity??50)+popPenalty))}));if(p){addToHistory(myId,p,"自由契約");setFaPool(prev=>[...prev,{...p,isFA:true}]);}notify("放出しました","warn");}}/>}
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
    {tab==="standings"&&<StandingsTab teams={teams} myId={myId}/>}
    {tab==="stats"&&<StatsTab teams={teams} myId={myId}/>}

    {tab==="roster"&&(
      <div className="card">
        <div className="card-h">コーチ陣</div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10}}>{myTeam?.coaches.map((c,i)=><div key={i} className="card2" style={{display:"flex",alignItems:"center",gap:8,flex:"1 1 190px"}}><span style={{fontSize:18}}>{c.emoji}</span><div style={{flex:1}}><div style={{fontSize:12,fontWeight:700}}>{c.typeName} <span style={{color:"#f5c842",fontSize:10}}>Lv{c.grade}</span></div><div style={{fontSize:10,color:"#374151"}}>{c.name}</div></div><button className="bsm bgr" onClick={()=>gs.fireCoach(i)}>解雇</button></div>)}</div>
        <details><summary style={{fontSize:11,color:"#374151",cursor:"pointer"}}>+ コーチを雇う</summary><div className="g2" style={{marginTop:8}}>{COACH_DEFS.map(cd=>COACH_GRADES.map(cg=>{const hired=myTeam?.coaches.some(c=>c.type===cd.type&&c.grade===cg.g);return <div key={cd.type+cg.g} className="card2" style={{opacity:hired?0.5:1}}><div className="fsb"><span style={{fontSize:11}}>{cd.emoji}{cd.name} Lv{cg.g}</span><button className="bsm bga" disabled={hired} onClick={()=>gs.hireCoach(cd,cg)}>{hired?"済":"雇う"}</button></div><div style={{fontSize:10,color:"#374151",marginTop:2}}>{fmtSal(cg.salary)}/月 · +{cg.bonus}成長</div></div>;}))}</div></details>
      </div>
    )}
    <RetireModal modal={retireModal} retireRole={retireRole} setRetireRole={setRetireRole} onRetain={()=>os.handleRetain(retireModal.player)} onAccept={()=>os.handleAcceptRetire(retireModal.player)} onStartRetireGame={()=>os.handleStartRetireGame(retireModal.player)} onSkipRetireGame={()=>os.handleSkipRetireGame(retireModal.player)}/>
    {playerModal&&<PlayerModal player={playerModal.player} teamName={playerModal.teamName} onClose={()=>setPlayerModal(null)}/>}
    {pressEvent&&<PressConferenceModal event={pressEvent} onAnswer={handlePressAnswer}/>}
    </ErrorBoundary>
  </div></div></>);
}
