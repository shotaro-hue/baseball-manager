import { useState, useEffect, useRef } from "react";
import { STRATEGY_OPTS, PITCHING_POLICY_OPTS, RLABEL, IS_HIT, IS_OUT, BATCH, FATIGUE_WARNING } from '../constants';
import { fmtAvg, fmtPct } from '../utils';
import { saberBatter, saberPitcher } from '../engine/sabermetrics';
import { initGameState, matchupScore, calcEffectiveFatigue, processAtBat, endHalfInning, checkStopCondition, STADIUMS, TEAM_STADIUM } from '../engine/simulation';
import { OV, CondBadge, HandBadge, PitchBadge } from './ui';
import Baseball3DModal from './Baseball3DModal';



function getGameBattingStats(log, playerId) {
  if (!playerId) return null;
  const entries = log.filter(e => e.batId === playerId && e.result !== 'change');
  if (!entries.length) return null;
  const ab = entries.filter(e => !['bb','hbp','sac','sf'].includes(e.result)).length;
  const h = entries.filter(e => IS_HIT(e.result)).length;
  const hr = entries.filter(e => e.result === 'hr').length;
  const rbi = entries.reduce((s,e) => s + (e.rbi||0), 0);
  const bb = entries.filter(e => e.result === 'bb' || e.result === 'hbp').length;
  return { pa: entries.length, ab, h, hr, rbi, bb };
}

function getGamePitchingStats(log, pitcherId) {
  if (!pitcherId) return null;
  const entries = log.filter(e => e.pitcherId === pitcherId && e.result !== 'change');
  if (!entries.length) return null;
  const k = entries.filter(e => e.result === 'k').length;
  const ha = entries.filter(e => IS_HIT(e.result)).length;
  const ra = entries.reduce((s,e) => s + (e.rbi||0), 0);
  const bb = entries.filter(e => e.result === 'bb' || e.result === 'hbp').length;
  return { bf: entries.length, k, ha, ra, bb };
}

export function TacticalGameScreen({myTeam,oppTeam,onGameEnd}){
  const [gs,setGs]=useState(()=>initGameState(myTeam,oppTeam));
  const [autoRunning,setAutoRunning]=useState(false);
  const [selectedPH,setSelectedPH]=useState(null);
  const [selectedRP,setSelectedRP]=useState(null);
  const [selectedStrat,setSelectedStrat]=useState("normal");
  const [showMenu,setShowMenu]=useState(null); // "pitcher"|"pinch"|"strategy"
  const [pitchingPolicy,setPitchingPolicy]=useState("normal");
  const [modal3D,setModal3D]=useState(null);
  const [modalWarning,setModalWarning]=useState('');
  const logRef=useRef(null);

  // Auto-scroll log
  useEffect(()=>{if(logRef.current) logRef.current.scrollTop=logRef.current.scrollHeight;},[gs.log.length]);

  // Auto-advance: 自動進行モード
  useEffect(()=>{
    if(!autoRunning||gs.stopped||gs.gameOver) return;
    const t=setTimeout(()=>{
      setGs(prev=>{
        if(prev.stopped||prev.gameOver) return prev;
        if(prev.outs>=3) return endHalfInning(prev);
        let next=processAtBat(prev,"normal");
        if(next.outs>=3) return endHalfInning(next);
        // Check stop condition
        const stop=checkStopCondition(next);
        if(stop){setAutoRunning(false);return{...next,stopped:true,stopReason:stop.reason,stopData:stop};}
        return next;
      });
    },180);
    return()=>clearTimeout(t);
  },[autoRunning,gs]);

  // 手動1打席進める
  const advance=(strategy="normal")=>{
    setGs(prev=>{
      if(prev.stopped||prev.gameOver) return prev;
      if(prev.outs>=3) return endHalfInning(prev);
      let next=processAtBat(prev,strategy);
      if(next.outs>=3) return endHalfInning(next);
      const stop=checkStopCondition(next);
      if(stop) return{...next,stopped:true,stopReason:stop.reason,stopData:stop};
      return next;
    });
    setShowMenu(null);setSelectedStrat("normal");
  };

  // 続行（停止解除）
  const resume=()=>{setGs(prev=>({...prev,stopped:false,stopReason:null,stopData:null}));setShowMenu(null);setAutoRunning(true);};

  // 投球方針変更
  const changePitchingPolicy=pol=>{setPitchingPolicy(pol);setGs(prev=>({...prev,pitchingPolicy:pol}));};

  // 投手交代
  const changePitcher=rpId=>{
    const rp=gs.myBullpen.find(p=>p.id===rpId);
    if(!rp) return;
    setGs(prev=>({...prev,myPitcher:rp,myBullpen:prev.myBullpen.filter(p=>p.id!==rpId),myPitchCount:0,stopped:false,stopReason:null,stopData:null,log:[...prev.log,{inning:prev.inning,isTop:prev.isTop,result:"change",batter:"",text:`⬆️ 投手交代: ${prev.myPitcher?.name} → ${rp.name}`,scorer:false}]}));
    setShowMenu(null);setSelectedRP(null);setAutoRunning(true);
  };

  // 代打
  const sendPinchHitter=phId=>{
    const ph=gs.myBench.find(p=>p.id===phId);
    if(!ph||gs.isTop) return;
    const nextIdx=gs.myBatIdx%gs.myLineup.length;
    setGs(prev=>{
      const newLineup=[...prev.myLineup];
      newLineup[nextIdx]=ph;
      return{...prev,myLineup:newLineup,myBench:prev.myBench.filter(p=>p.id!==phId),stopped:false,stopReason:null,stopData:null,log:[...prev.log,{inning:prev.inning,isTop:prev.isTop,result:"change",text:`🔄 代打: ${ph.name}`,scorer:true}]};
    });
    setShowMenu(null);setSelectedPH(null);setAutoRunning(true);
  };

  const currentStadiumKey = TEAM_STADIUM[gs.homeTeamId];
  const currentStadium = STADIUMS[currentStadiumKey] || STADIUMS.tokyo_dome;

  function normalizeReplayEvent(event) {
    // ⚠️ セキュリティ: 外部入力由来の可能性があるため、必ず型と数値を検証してからUIに渡す
    if (!event || typeof event !== 'object' || Array.isArray(event)) {
      return { ok: false, reason: 'イベントがオブジェクトではありません', event: null };
    }
    const normalizedEv = Number(event.ev);
    const normalizedLa = Number(event.la);
    if (!Number.isFinite(normalizedEv) || !Number.isFinite(normalizedLa)) {
      return { ok: false, reason: 'ev または la が有限数ではありません', event: null };
    }
    const fallbackType = event.result || 'batted_ball';
    return {
      ok: true,
      reason: '',
      event: { ...event, ev: normalizedEv, la: normalizedLa, type: event.type || fallbackType },
    };
  }

  function open3DReplaySafely(event) {
    const validation = normalizeReplayEvent(event);
    if (!validation.ok) {
      setModalWarning(`⚠️ 3D再生を開始できません: ${validation.reason}`);
      return;
    }
    setModalWarning('');
    setModal3D({ event: validation.event, stadium: currentStadium });
  }

  if(gs.gameOver){
    const won=gs.score.my>gs.score.opp;
    return(
      <div className="app">
        <div className="rw">
          <div style={{color:"#1e2d3d",letterSpacing:".2em",fontSize:11,marginBottom:8}}>vs {oppTeam.name}</div>
          <div className={`rtitle ${won?"rwin":"rlose"}`}>{won?"勝利！！":"敗北..."}</div>
          <div className="rscore" style={{color:won?"#f5c842":"#374151"}}>{myTeam.short} {gs.score.my} – {gs.score.opp} {oppTeam.short}</div>
          <div style={{marginBottom:24}}>
            {/* Top batters */}
            <div style={{display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap"}}>
              {gs.myLineup.filter((p,i,arr)=>arr.indexOf(p)===i).map(p=>{
                const hits=gs.log.filter(e=>e.batId===p?.id&&IS_HIT(e.result));
                if(!hits.length) return null;
                return <div key={p?.id} className="card2" style={{textAlign:"center",minWidth:90}}>
                  <div style={{fontSize:11,fontWeight:700}}>{p?.name}</div>
                  <div className="mono" style={{color:"#f5c842"}}>{hits.length}安打</div>
                  <div style={{fontSize:9,color:"#374151"}}>{hits.filter(e=>e.result==="hr").length}HR {gs.log.filter(e=>e.batId===p?.id).reduce((s,e)=>s+(e.rbi||0),0)}打点</div>
                </div>;
              })}
            </div>
          </div>
          <button className="btn btn-gold" onClick={()=>onGameEnd(gs)}>試合終了 → 結果へ</button>
        </div>
      </div>
    );
  }

  const curPitcher=gs.myPitcher;
  const fatigue=calcEffectiveFatigue(gs.myPitchCount,curPitcher);
  const fatigueColor=fatigue<40?"#34d399":fatigue<70?"#f5c842":"#f87171";
  const nextBatter=!gs.isTop?gs.myLineup[gs.myBatIdx%Math.max(gs.myLineup.length,1)]:gs.opLineup[gs.opBatIdx%Math.max(gs.opLineup.length,1)];
  const mu=matchupScore(!gs.isTop?nextBatter:null,gs.isTop?curPitcher:gs.opPitcher);
  const muLabel=mu>15?"⚡ 有利":mu>-15?"⚖️ 互角":"💀 不利";
  const muClass=mu>15?"mu-adv":mu>-15?"mu-even":"mu-dis";

  // Build scoreboard
  const inningScores={};
  gs.inningSummary.forEach(s=>{if(!inningScores[s.inning]) inningScores[s.inning]={top:"-",bot:"-"};if(s.isTop) inningScores[s.inning].top=s.runs;else inningScores[s.inning].bot=s.runs;});
  const maxInn=Math.max(9,gs.inning);
  const innings=Array.from({length:maxInn},(_,i)=>i+1);

  const opFatigue=calcEffectiveFatigue(gs.opPitchCount,gs.opPitcher);

  return(
    <div className="app">
      <div className="gscreen">

        {/* ═══════════ 1. スコア ═══════════ */}
        <section className="tg-section">
          <div className="tg-section-label">① スコア</div>

          {/* Score hero — 一瞬で点差が分かる */}
          <div className="tg-score-hero">
            <div>
              <div className="tg-score-num" style={{color:gs.score.my>=gs.score.opp?"#f5c842":"#94a3b8"}}>{gs.score.my}</div>
              <div className="tg-score-team" style={{color:myTeam.color}}>{myTeam.emoji} {myTeam.short}</div>
            </div>
            <div className="tg-score-divider">{gs.inning}回{gs.isTop?"表":"裏"}</div>
            <div>
              <div className="tg-score-num" style={{color:gs.score.opp>gs.score.my?"#f87171":"#94a3b8"}}>{gs.score.opp}</div>
              <div className="tg-score-team" style={{color:oppTeam.color}}>{oppTeam.emoji} {oppTeam.short}</div>
            </div>
          </div>

          {/* Compact scoreboard (inning-by-inning) */}
          <div className="scoreboard">
            <table className="sct">
              <thead><tr>
                <td className="stc" style={{color:"#1e2d3d",fontSize:9}}>チーム</td>
                {innings.map(i=><td key={i} style={{color:i===gs.inning?"#f5c842":"#1e2d3d",fontSize:9,fontWeight:i===gs.inning?700:400}}>{i}</td>)}
                <td className="stot" style={{color:"#1e2d3d",fontSize:9}}>R</td>
              </tr></thead>
              <tbody>
                <tr>
                  <td className="stc"><span style={{color:oppTeam.color}}>{oppTeam.emoji} {oppTeam.short}</span></td>
                  {innings.map(i=><td key={i} style={{color:inningScores[i]?.top>0?"#34d399":"#1e2d3d"}}>{inningScores[i]?.top??"-"}</td>)}
                  <td className="stot">{gs.score.opp}</td>
                </tr>
                <tr>
                  <td className="stc"><span style={{color:myTeam.color}}>{myTeam.emoji} {myTeam.short}</span></td>
                  {innings.map(i=><td key={i} style={{color:inningScores[i]?.bot>0?"#f5c842":"#1e2d3d"}}>{inningScores[i]?.bot??"-"}</td>)}
                  <td className="stot" style={{color:"#f5c842"}}>{gs.score.my}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* ═══════════ 2. 状況 ═══════════ */}
        <section className="tg-section">
          <div className="tg-section-label">② 状況</div>

          {/* Stop banner — 判断を促す */}
          {gs.stopped&&gs.stopData&&(
            <div className={`stop-banner ${gs.stopData.priority>=3?"danger":gs.stopData.reason==="scoring_chance"?"chance":"warning"}`}>
              <div style={{fontWeight:700,fontSize:14,marginBottom:4}}>{gs.stopData.label}</div>
              <div style={{fontSize:11,opacity:.8}}>
                {gs.stopData.reason==="pitcher_tired"&&`球数: ${gs.myPitchCount}球 / 疲労: ${fatigue}%`}
                {gs.stopData.reason==="scoring_position_crisis"&&"ランナーあり・2アウト — 投手交代を検討"}
                {gs.stopData.reason==="scoring_chance"&&`${gs.stopData.data?.gap===0?"同点":"1点差"}チャンス！作戦を指示`}
                {gs.stopData.reason==="pinch_hit_chance"&&`次打者: ${gs.stopData.data?.batter?.name} (ミート:${gs.stopData.data?.batter?.batting?.contact})`}
                {gs.stopData.reason==="closer_time"&&"終盤リード — クローザー投入を検討"}
              </div>
            </div>
          )}

          {/* 攻守 + ダイヤモンド + アウト */}
          <div className={`side-banner ${gs.isTop?"defending":"attacking"}`}>
            <div style={{fontSize:32}}>{gs.isTop?"🛡️":"⚔️"}</div>
            <div style={{flex:1}}>
              <div className="side-banner-main">{gs.isTop?"守備中":"攻撃中"}</div>
              <div className="side-banner-sub">
                {gs.bases.filter(Boolean).length>0?`${gs.bases.filter(Boolean).length}人の走者`:"走者なし"} ・ {gs.outs}アウト
                {(gs.bases[1]||gs.bases[2])&&<span style={{color:"#f5c842",marginLeft:6}}>🔥 得点圏</span>}
              </div>
            </div>
            <div style={{textAlign:"center"}}>
              <div className="diamond" style={{margin:"0 auto"}}>
                <div className="base bH"/><div className={`base b1 ${gs.bases[0]?"on":""}`}/>
                <div className={`base b2 ${gs.bases[1]?"on":""}`}/><div className={`base b3 ${gs.bases[2]?"on":""}`}/>
              </div>
              <div className="odots" style={{marginTop:4}}>{[0,1,2].map(i=><div key={i} className={`odot ${i<gs.outs?"on":""}`}/>)}</div>
            </div>
          </div>

          {/* 自チーム投手 status */}
          <div className="card2" style={{margin:0}}>
            <div className="fsb" style={{marginBottom:6}}>
              <div>
                <span style={{fontSize:9,color:"var(--dim)",letterSpacing:".2em",textTransform:"uppercase"}}>自チーム投手</span>
                <span style={{fontWeight:700,fontSize:14,marginLeft:8}}>{curPitcher?.name||"—"}</span>
              </div>
              <span style={{fontFamily:"monospace",fontSize:11,color:fatigue>=FATIGUE_WARNING?"#f87171":"#f5c842"}}>{gs.myPitchCount}球</span>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
              <div className="fat-bar" style={{flex:1}}>
                <div className="fat-fill" style={{width:`${fatigue}%`,background:fatigueColor}}/>
              </div>
              <span style={{fontFamily:"monospace",fontSize:11,color:fatigueColor,width:36,textAlign:"right"}}>{fatigue}%</span>
            </div>
            {(()=>{const ps=getGamePitchingStats(gs.log,curPitcher?.id);if(!ps)return null;return<div className="gstat" style={{marginBottom:8}}>{ps.bf}打者 <span style={{color:"#a78bfa"}}>{ps.k}K</span> <span style={{color:"#f87171"}}>{ps.ha}被安打</span> <span style={{color:"#fbbf24"}}>{ps.ra}失点</span></div>;})()}
            <div style={{display:"flex",gap:10,marginBottom:8,flexWrap:"wrap"}}>
              <span style={{fontSize:11}}>球速<OV v={curPitcher?.pitching?.velocity||0}/></span>
              <span style={{fontSize:11}}>制球<OV v={curPitcher?.pitching?.control||0}/></span>
              <span style={{fontSize:11}}>変化<OV v={curPitcher?.pitching?.breaking||0}/></span>
            </div>
            <div style={{fontSize:9,color:"var(--dim)",letterSpacing:".15em",marginBottom:4,textTransform:"uppercase"}}>投球方針</div>
            <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
              {PITCHING_POLICY_OPTS.map(opt=>(
                <button key={opt.id} onClick={()=>changePitchingPolicy(opt.id)} style={{padding:"5px 10px",fontSize:10,borderRadius:6,cursor:"pointer",border:pitchingPolicy===opt.id?"1px solid #f5c842":"1px solid rgba(255,255,255,.1)",background:pitchingPolicy===opt.id?"rgba(245,200,66,.15)":"rgba(255,255,255,.04)",color:pitchingPolicy===opt.id?"#f5c842":"#94a3b8",whiteSpace:"nowrap"}}>
                  {opt.icon} {opt.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════ 3. 対戦 ═══════════ */}
        <section className="tg-section">
          <div className="tg-section-label">③ 対戦</div>

          {/* Matchup card — pitcher vs batter side-by-side */}
          <div className="card2" style={{margin:0}}>
            <div className="fsb" style={{marginBottom:8}}>
              <span style={{fontSize:9,color:"var(--dim)",letterSpacing:".2em",textTransform:"uppercase"}}>{gs.isTop?"自投手 vs 相手打者":"相手投手 vs 自打者"}</span>
              <span className={`matchup-badge ${muClass}`}>{muLabel} ({mu>0?"+":""}{mu})</span>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",gap:"var(--sp-1)",alignItems:"center"}}>
              {/* 投手 */}
              <div>
                <div style={{fontSize:9,color:"var(--dim)",letterSpacing:".15em",marginBottom:3,textTransform:"uppercase"}}>投手</div>
                <div style={{fontWeight:700,fontSize:13,marginBottom:4}}>
                  {gs.isTop?(curPitcher?.name||"—"):(gs.opPitcher?.name||"—")}
                  <HandBadge p={gs.isTop?curPitcher:gs.opPitcher}/>
                </div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  <span style={{fontSize:10}}>球速<OV v={(gs.isTop?curPitcher:gs.opPitcher)?.pitching?.velocity||0}/></span>
                  <span style={{fontSize:10}}>制球<OV v={(gs.isTop?curPitcher:gs.opPitcher)?.pitching?.control||0}/></span>
                </div>
                <div style={{fontSize:9,color:"var(--dim)",marginTop:4}}>
                  疲労 {gs.isTop?fatigue:opFatigue}%
                </div>
              </div>

              <div style={{textAlign:"center",fontSize:18,color:"var(--dim)"}}>VS</div>

              {/* 打者 */}
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:9,color:"var(--dim)",letterSpacing:".15em",marginBottom:3,textTransform:"uppercase"}}>打者</div>
                <div style={{fontWeight:700,fontSize:13,marginBottom:4}}>{nextBatter?.name||"—"}</div>
                {nextBatter?.batting&&<div style={{display:"flex",gap:6,justifyContent:"flex-end",flexWrap:"wrap"}}>
                  <span style={{fontSize:10}}>ミート<OV v={nextBatter.batting.contact}/></span>
                  <span style={{fontSize:10}}>長打<OV v={nextBatter.batting.power}/></span>
                </div>}
                {(()=>{const bs=getGameBattingStats(gs.log,nextBatter?.id);if(!bs)return<div style={{fontSize:9,color:"var(--dim)",marginTop:4}}>本日初打席</div>;return<div className="gstat" style={{marginTop:4}}>{bs.ab}打{bs.h}安打{bs.hr>0?` ${bs.hr}HR`:""}</div>;})()}
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════ 4. 操作 ═══════════ */}
        <section className="tg-section">
          <div className="tg-section-label">④ 操作 ・ ログ</div>

          {/* Event Log */}
          {modalWarning && <div className="notif nwarn">{modalWarning}</div>}
          <div className="evlog" ref={logRef}>
            {gs.log.map((e,i)=>{
              if(e.result==="change") return <div key={i} style={{padding:"3px 8px",fontSize:10,color:"#a78bfa",borderLeft:"3px solid #a78bfa",margin:"4px 0"}}>{e.text}</div>;
              const cls=e.result==="hr"?"evi-hr":IS_HIT(e.result)?"evi-hit":IS_OUT(e.result)?"evi-out":"";
              return(
                <div key={i} className={`evi ${cls}`}>
                  <span style={{color:e.scorer?"#7a4a10":"#1e2d3d",fontSize:9,marginRight:4}}>{e.scorer?"●":"○"}</span>
                  <span style={{fontSize:9,color:"#1e2d3d",marginRight:3}}>{e.inning}{e.isTop?"表":"裏"}</span>
                  <span style={{color:"#374151",fontSize:11,marginRight:5}}>{e.batter}</span>
                  <span>{RLABEL[e.result]||e.result}</span>
                  <PitchBadge pitchType={e.pitchType} zone={e.zone} />
                  {e.strategy&&<span style={{fontSize:9,color:"#a78bfa",marginLeft:4}}>[{e.strategy}]</span>}
                  {e.ev>0&&<span style={{fontFamily:"monospace",fontSize:9,color:"#1e2d3d",marginLeft:4}}>EV:{Math.round((Number(e.ev)||0)*10)/10}km/h LA:{e.la}° {e.dist>0&&`${e.dist}m`}</span>}
                  {Number.isFinite(Number(e.ev)) && Number(e.ev) > 0 && <button onClick={()=>open3DReplaySafely(e)} style={{fontSize:9,marginLeft:4,padding:'1px 4px',cursor:'pointer'}}>3D再生</button>}
                  {e.rbi>0&&<span style={{color:"#f5c842",marginLeft:5,fontSize:11}}>+{e.rbi}点！</span>}
                </div>
              );
            })}
          </div>

          {/* Bench / Bullpen quick reference */}
          <details className="card2" style={{margin:0}}>
            <summary style={{cursor:"pointer",fontSize:11,color:"var(--dim)",letterSpacing:".15em",textTransform:"uppercase",listStyle:"none"}}>
              控え選手 ▸ ベンチ {gs.myBench.length} ・ ブルペン {gs.myBullpen.length}
            </summary>
            <div className="tg-quick-row" style={{marginTop:8}}>
              <div>
                <div style={{fontSize:9,color:"var(--dim)",marginBottom:4}}>ベンチ ({gs.myBench.length})</div>
                {gs.myBench.length===0&&<div style={{color:"#1e2d3d",fontSize:11}}>なし</div>}
                {gs.myBench.slice(0,6).map(p=>(
                  <div key={p.id} className="bench-item">
                    <span style={{fontSize:11,flex:1}}>{p.name}</span>
                    <span style={{fontSize:9,color:"#374151"}}>{p.pos}</span>
                    <OV v={Math.round((p.batting.contact+p.batting.power)/2)}/>
                  </div>
                ))}
              </div>
              <div>
                <div style={{fontSize:9,color:"var(--dim)",marginBottom:4}}>ブルペン ({gs.myBullpen.length})</div>
                {gs.myBullpen.length===0&&<div style={{color:"#1e2d3d",fontSize:11}}>なし</div>}
                {gs.myBullpen.slice(0,4).map(p=>(
                  <div key={p.id} className="bench-item">
                    <span style={{fontSize:11,flex:1}}>{p.name}<HandBadge p={p}/></span>
                    <span style={{fontSize:9,color:"#374151"}}>{p.subtype}</span>
                    <OV v={p.pitching.velocity}/>
                  </div>
                ))}
              </div>
            </div>
          </details>

          {/* PITCHER CHANGE MENU */}
          {showMenu==="pitcher"&&(
            <div className="card" style={{margin:0}}>
              <div className="card-h">投手交代 — ブルペンから選択</div>
              {gs.myBullpen.length===0&&<p style={{color:"#374151",fontSize:12}}>投手がいません</p>}
              {gs.myBullpen.map(p=>{
                const sp=saberPitcher(p.stats);
                return(
                  <div key={p.id} className={`card2 ${selectedRP===p.id?"":""}`} style={{cursor:"pointer",borderColor:selectedRP===p.id?"rgba(245,200,66,.4)":undefined}} onClick={()=>setSelectedRP(p.id)}>
                    <div className="fsb">
                      <div>
                        <span style={{fontWeight:700,fontSize:13}}>{p.name}</span>
                        <HandBadge p={p}/>
                        <span style={{fontSize:10,color:"#374151",marginLeft:8}}>{p.subtype} / {p.age}歳</span>
                      </div>
                      <button className="bsm bgy" onClick={()=>changePitcher(p.id)}>この投手に交代</button>
                    </div>
                    <div style={{display:"flex",gap:10,marginTop:5}}>
                      <span style={{fontSize:11}}>球速<OV v={p.pitching.velocity}/></span>
                      <span style={{fontSize:11}}>制球<OV v={p.pitching.control}/></span>
                      <span style={{fontSize:11}}>変化<OV v={p.pitching.breaking}/></span>
                      <span style={{fontSize:10,color:"#374151"}}>防御率:{sp.ERA>0?sp.ERA:"--"}</span>
                    </div>
                    <CondBadge p={p}/>
                  </div>
                );
              })}
              <button className="bsm bgr" style={{marginTop:6}} onClick={()=>setShowMenu(null)}>キャンセル</button>
            </div>
          )}

          {/* PINCH HITTER MENU */}
          {showMenu==="pinch"&&(
            <div className="card" style={{margin:0}}>
              <div className="card-h">代打 — ベンチから選択</div>
              <div style={{fontSize:10,color:"#374151",marginBottom:8}}>次打者: <span style={{color:"#f5c842"}}>{nextBatter?.name}</span>（ミート:{nextBatter?.batting?.contact}）と交代</div>
              {gs.myBench.length===0&&<p style={{color:"#374151",fontSize:12}}>ベンチに選手がいません</p>}
              {gs.myBench.map(p=>{
                const mu2=matchupScore(p,gs.isTop?curPitcher:gs.opPitcher);
                return(
                  <div key={p.id} className="card2" style={{cursor:"pointer"}} onClick={()=>setSelectedPH(p.id)}>
                    <div className="fsb">
                      <div>
                        <span style={{fontWeight:700,fontSize:13}}>{p.name}</span>
                        <span style={{fontSize:10,color:"#374151",marginLeft:8}}>{p.pos} / {p.age}歳</span>
                      </div>
                      <div style={{display:"flex",gap:6,alignItems:"center"}}>
                        <span className={`matchup-badge ${mu2>15?"mu-adv":mu2>-15?"mu-even":"mu-dis"}`} style={{fontSize:9}}>{mu2>0?"+":""}{mu2}</span>
                        <button className="bsm bga" onClick={()=>sendPinchHitter(p.id)}>代打！</button>
                      </div>
                    </div>
                    <div style={{display:"flex",gap:10,marginTop:5,flexWrap:"wrap",alignItems:"center"}}>
                      <span style={{fontSize:11}}>ミート<OV v={p.batting.contact}/></span>
                      <span style={{fontSize:11}}>長打<OV v={p.batting.power}/></span>
                      <span style={{fontSize:11}}>選球<OV v={p.batting.eye}/></span>
                      <span style={{fontSize:10,color:"#374151"}}>打率:{fmtAvg(p.stats.H,p.stats.AB)}</span>
                      {(()=>{const bs=getGameBattingStats(gs.log,p.id);if(!bs)return null;return<span className="gstat" style={{marginLeft:4}}>{bs.ab}打{bs.h}安</span>;})()}
                    </div>
                  </div>
                );
              })}
              <button className="bsm bgr" style={{marginTop:6}} onClick={()=>setShowMenu(null)}>キャンセル</button>
            </div>
          )}

          {/* STRATEGY MENU */}
          {showMenu==="strategy"&&(
            <div className="card" style={{margin:0}}>
              <div className="card-h">作戦指示</div>
              <div className="strat-grid">
                {STRATEGY_OPTS.map(s=>(
                  <button key={s.id} className={`strat-btn ${selectedStrat===s.id?"sel":""}`} onClick={()=>setSelectedStrat(s.id)}>
                    <div style={{fontSize:14,marginBottom:3}}>{s.icon} {s.label}</div>
                    <div style={{fontSize:10,color:"#374151"}}>{s.desc}</div>
                  </button>
                ))}
              </div>
              <div style={{display:"flex",gap:8,marginTop:10}}>
                <button className="btn btn-gold" style={{flex:1}} onClick={()=>advance(selectedStrat)}>
                  {STRATEGY_OPTS.find(s=>s.id===selectedStrat)?.label}で実行！
                </button>
                <button className="bsm bgr" onClick={()=>setShowMenu(null)}>キャンセル</button>
              </div>
            </div>
          )}
        </section>
      </div>
      {/* STICKY CONTROL BAR - always visible at bottom */}
      <div className="ctrl-bar">
        {!gs.stopped&&!gs.gameOver&&(
          <>
            <button className="btn btn-green" onClick={()=>setAutoRunning(a=>!a)}>
              {autoRunning?"⏸ 一時停止":"▶ 自動進行"}
            </button>
            {!autoRunning&&<button className="btn btn-gold" onClick={()=>advance("normal")}>▶▶ 1打席進む</button>}
          </>
        )}
        {gs.stopped&&!gs.gameOver&&(
          <>
            <button className="btn btn-green" onClick={resume}>▶ 続行</button>
            <button className="btn btn-gold" onClick={()=>setShowMenu(m=>m==="pitcher"?null:"pitcher")} disabled={gs.myBullpen.length===0} style={{opacity:gs.myBullpen.length===0?0.4:1}}>🔄 投手交代</button>
            <button className="btn" style={{background:"rgba(96,165,250,.1)",border:"1px solid rgba(96,165,250,.2)",color:"#60a5fa",opacity:gs.isTop||gs.myBench.length===0?0.4:1}} onClick={()=>setShowMenu(m=>m==="pinch"?null:"pinch")} disabled={gs.isTop||gs.myBench.length===0}>👤 代打</button>
            <button className="btn" style={{background:"rgba(167,139,250,.1)",border:"1px solid rgba(167,139,250,.2)",color:"#a78bfa"}} onClick={()=>setShowMenu(m=>m==="strategy"?null:"strategy")}>🎯 作戦</button>
          </>
        )}
        {gs.gameOver&&(
          <button className="btn btn-gold" style={{width:"100%"}} onClick={()=>onGameEnd(gs)}>試合終了 → 結果へ ✓</button>
        )}

          {modal3D && (
            <Baseball3DModal
              event={modal3D.event}
              stadium={modal3D.stadium}
              onClose={() => setModal3D(null)}
            />
          )}
      </div>
    </div>
  );
}
/* ═══════════════════════════════════════════════
   BATCH RESULT SCREEN
═══════════════════════════════════════════════ */
