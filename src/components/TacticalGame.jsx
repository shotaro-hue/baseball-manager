import { useState, useEffect, useRef } from "react";
import { STRATEGY_OPTS, PITCHING_POLICY_OPTS, RLABEL, IS_HIT, IS_OUT, BATCH, FATIGUE_WARNING } from '../constants';
import { fmtAvg, fmtPct } from '../utils';
import { saberBatter, saberPitcher } from '../engine/sabermetrics';
import { initGameState, matchupScore, calcFatigue, calcEffectiveFatigue, processAtBat, endHalfInning, checkStopCondition } from '../engine/simulation';
import { OV, CondBadge, HandBadge, PitchBadge } from './ui';



export function TacticalGameScreen({myTeam,oppTeam,onGameEnd}){
  const [gs,setGs]=useState(()=>initGameState(myTeam,oppTeam));
  const [autoRunning,setAutoRunning]=useState(false);
  const [selectedPH,setSelectedPH]=useState(null);
  const [selectedRP,setSelectedRP]=useState(null);
  const [selectedStrat,setSelectedStrat]=useState("normal");
  const [showMenu,setShowMenu]=useState(null); // "pitcher"|"pinch"|"strategy"
  const [pitchingPolicy,setPitchingPolicy]=useState("normal");
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
  const fatigue=calcFatigue(gs.myPitchCount,curPitcher?.pitching?.stamina||60);
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

  return(
    <div className="app">
      <div className="gscreen">
        {/* LEFT: Main area */}
        <div>
          {/* Scoreboard */}
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

          {/* Stop Banner */}
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

          {/* Diamond + Game Info */}
          <div style={{display:"flex",gap:14,alignItems:"flex-start",marginBottom:10,flexWrap:"wrap"}}>
            {/* Diamond */}
            <div style={{textAlign:"center"}}>
              <div className="diamond">
                <div className="base bH"/><div className={`base b1 ${gs.bases[0]?"on":""}`}/>
                <div className={`base b2 ${gs.bases[1]?"on":""}`}/><div className={`base b3 ${gs.bases[2]?"on":""}`}/>
              </div>
              <div className="odots">{[0,1,2].map(i=><div key={i} className={`odot ${i<gs.outs?"on":""}`}/>)}</div>
              <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:22,color:"#374151",marginTop:4}}>
                {gs.inning}回{gs.isTop?"表":"裏"}
              </div>
            </div>
            {/* Score big */}
            <div style={{flex:1,textAlign:"center",padding:"8px 0"}}>
              <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:38,color:gs.score.my>gs.score.opp?"#f5c842":gs.score.my<gs.score.opp?"#f87171":"#94a3b8"}}>
                {gs.score.my} <span style={{color:"#1e2d3d",fontSize:22}}>–</span> {gs.score.opp}
              </div>
              <div style={{fontSize:11,color:"#374151",marginTop:2}}>{gs.isTop?"相手の攻撃":"自チームの攻撃"}</div>
            </div>
            {/* Pitcher info */}
            <div className="card2" style={{minWidth:160,margin:0}}>
              <div style={{fontSize:9,color:"#374151",letterSpacing:".2em",marginBottom:6}}>自チーム投手</div>
              <div style={{fontWeight:700,fontSize:13,marginBottom:4}}>{curPitcher?.name||"—"}</div>
              <div style={{fontSize:10,color:"#374151",marginBottom:6}}>球数: <span style={{fontFamily:"monospace",color:calcEffectiveFatigue(gs.myPitchCount,gs.myPitcher)>=FATIGUE_WARNING?"#f87171":"#f5c842"}}>{gs.myPitchCount}</span>球</div>
              <div style={{fontSize:9,color:"#374151",marginBottom:3}}>疲労度</div>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <div className="fat-bar" style={{flex:1}}>
                  <div className="fat-fill" style={{width:`${fatigue}%`,background:fatigueColor}}/>
                </div>
                <span style={{fontFamily:"monospace",fontSize:10,color:fatigueColor,width:28}}>{fatigue}%</span>
              </div>
              <div style={{marginTop:6,fontSize:9,color:"#374151"}}>球速<OV v={curPitcher?.pitching?.velocity||0}/> 制球<OV v={curPitcher?.pitching?.control||0}/></div>
              <div style={{marginTop:8,fontSize:9,color:"#374151",letterSpacing:".1em",marginBottom:4}}>投球方針</div>
              <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
                {PITCHING_POLICY_OPTS.map(opt=>(
                  <button key={opt.id} onClick={()=>changePitchingPolicy(opt.id)} style={{padding:"3px 7px",fontSize:9,borderRadius:4,cursor:"pointer",border:pitchingPolicy===opt.id?"1px solid #f5c842":"1px solid rgba(255,255,255,.1)",background:pitchingPolicy===opt.id?"rgba(245,200,66,.15)":"rgba(255,255,255,.04)",color:pitchingPolicy===opt.id?"#f5c842":"#94a3b8",whiteSpace:"nowrap"}}>
                    {opt.icon} {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Momentum Bar */}
          <div className="mom-wrap">
            <div className="fsb" style={{fontSize:9,color:"#374151",marginBottom:3}}>
              <span>← {oppTeam.short}</span>
              <span style={{color:gs.momentum>55?"#34d399":gs.momentum<45?"#f87171":"#f5c842",fontWeight:700}}>
                モメンタム {gs.momentum>65?"🔥 圧倒的優勢":gs.momentum>55?"↑優勢":gs.momentum>=45?"互角":gs.momentum>=35?"↓劣勢":"❄️ 劣勢"}
              </span>
              <span>{myTeam.short} →</span>
            </div>
            <div className="mom-bar">
              <div className="mom-fill" style={{width:"100%"}}/>
              <div className="mom-marker" style={{left:`${gs.momentum}%`}}/>
            </div>
          </div>

          {/* Next batter matchup */}
          <div className="card2" style={{marginBottom:10}}>
            <div className="fsb">
              <div>
                <span style={{fontSize:9,color:"#374151",letterSpacing:".15em"}}>次打者vs投手</span>
                <span style={{fontSize:12,fontWeight:700,marginLeft:8}}>{nextBatter?.name||"—"}</span>
              </div>
              <span className={`matchup-badge ${muClass}`}>{muLabel} ({mu>0?"+":""}{mu})</span>
            </div>
            {nextBatter?.batting&&<div style={{display:"flex",gap:10,marginTop:6}}>
              <span style={{fontSize:10}}>ミート<OV v={nextBatter.batting.contact}/></span>
              <span style={{fontSize:10}}>長打<OV v={nextBatter.batting.power}/></span>
              <span style={{fontSize:10}}>選球<OV v={nextBatter.batting.eye}/></span>
            </div>}
          </div>

          {/* Event Log */}
          <div className="evlog" ref={logRef}>
            {gs.log.map((e,i)=>{
              if(e.result==="change") return <div key={i} style={{padding:"3px 8px",fontSize:10,color:"#a78bfa",borderLeft:"3px solid #a78bfa",margin:"4px 0"}}>{e.text}</div>;
              const isInnHdr=false;
              const cls=e.result==="hr"?"evi-hr":IS_HIT(e.result)?"evi-hit":IS_OUT(e.result)?"evi-out":"";
              return(
                <div key={i} className={`evi ${cls}`}>
                  <span style={{color:e.scorer?"#7a4a10":"#1e2d3d",fontSize:9,marginRight:4}}>{e.scorer?"●":"○"}</span>
                  <span style={{fontSize:9,color:"#1e2d3d",marginRight:3}}>{e.inning}{e.isTop?"表":"裏"}</span>
                  <span style={{color:"#374151",fontSize:11,marginRight:5}}>{e.batter}</span>
                  <span>{RLABEL[e.result]||e.result}</span>
                  <PitchBadge pitchType={e.pitchType} zone={e.zone} />
                  {e.strategy&&<span style={{fontSize:9,color:"#a78bfa",marginLeft:4}}>[{e.strategy}]</span>}
                  {e.ev>0&&<span style={{fontFamily:"monospace",fontSize:9,color:"#1e2d3d",marginLeft:4}}>EV:{e.ev} LA:{e.la}° {e.dist>0&&`${e.dist}m`}</span>}
                  {e.rbi>0&&<span style={{color:"#f5c842",marginLeft:5,fontSize:11}}>+{e.rbi}点！</span>}
                </div>
              );
            })}
          </div>

          {/* Menus appear above sticky bar */}

          {/* PITCHER CHANGE MENU */}
          {showMenu==="pitcher"&&(
            <div className="card" style={{marginTop:10}}>
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
            <div className="card" style={{marginTop:10}}>
              <div className="card-h">代打 — ベンチから選択</div>
              <div style={{fontSize:10,color:"#374151",marginBottom:8}}>次打者: <span style={{color:"#f5c842"}}>{nextBatter?.name}</span>（ミート:{nextBatter?.batting?.contact}）と交代</div>
              {gs.myBench.length===0&&<p style={{color:"#374151",fontSize:12}}>ベンチに選手がいません</p>}
              {gs.myBench.map(p=>{
                const mu2=matchupScore(p,gs.isTop?curPitcher:gs.opPitcher);
                const sb=saberBatter(p.stats);
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
                    <div style={{display:"flex",gap:10,marginTop:5}}>
                      <span style={{fontSize:11}}>ミート<OV v={p.batting.contact}/></span>
                      <span style={{fontSize:11}}>長打<OV v={p.batting.power}/></span>
                      <span style={{fontSize:11}}>選球<OV v={p.batting.eye}/></span>
                      <span style={{fontSize:10,color:"#374151"}}>打率:{fmtAvg(p.stats.H,p.stats.AB)}</span>
                    </div>
                  </div>
                );
              })}
              <button className="bsm bgr" style={{marginTop:6}} onClick={()=>setShowMenu(null)}>キャンセル</button>
            </div>
          )}

          {/* STRATEGY MENU */}
          {showMenu==="strategy"&&(
            <div className="card" style={{marginTop:10}}>
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
        </div>{/* end LEFT */}

        {/* RIGHT: Info Panel */}
        <div>
          {/* Current inning summary */}
          <div className="card">
            <div className="card-h">得点状況</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
              {gs.inningSummary.map((s,i)=>(
                <div key={i} style={{textAlign:"center",minWidth:32}}>
                  <div style={{fontSize:8,color:"#1e2d3d"}}>{s.inning}{s.isTop?"表":"裏"}</div>
                  <div style={{fontFamily:"monospace",fontSize:14,color:s.runs>0?(!s.isTop?"#f5c842":"#34d399"):"#1e2d3d"}}>{s.runs}</div>
                </div>
              ))}
              {gs.inningSummary.length===0&&<span style={{color:"#1e2d3d",fontSize:11}}>試合開始前</span>}
            </div>
            <div className="divider"/>
            <div style={{display:"flex",gap:10,justifyContent:"center"}}>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:9,color:"#374151",marginBottom:3}}>自チーム</div>
                <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:26,color:"#f5c842"}}>{gs.score.my}</div>
              </div>
              <div style={{alignSelf:"center",color:"#1e2d3d",fontSize:18}}>—</div>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:9,color:"#374151",marginBottom:3}}>相手</div>
                <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:26,color:"#94a3b8"}}>{gs.score.opp}</div>
              </div>
            </div>
          </div>

          {/* 得点圏サマリー */}
          <div className="card">
            <div className="card-h">得点圏状況</div>
            <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:8}}>
              <div className="diamond" style={{width:60,height:60}}>
                <div className="base bH" style={{width:10,height:10}}/><div className={`base b1 ${gs.bases[0]?"on":""}`} style={{width:10,height:10}}/><div className={`base b2 ${gs.bases[1]?"on":""}`} style={{width:10,height:10}}/><div className={`base b3 ${gs.bases[2]?"on":""}`} style={{width:10,height:10}}/>
              </div>
              <div>
                <div style={{fontSize:11,color:"#374151"}}>{gs.bases.filter(Boolean).length>0?`${gs.bases.filter(Boolean).length}人の走者あり`:"走者なし"}</div>
                {(gs.bases[1]||gs.bases[2])&&<div style={{fontSize:10,color:"#f5c842",marginTop:2}}>🔥 得点圏にランナー</div>}
                <div style={{fontSize:10,color:"#374151",marginTop:2}}>{gs.outs}アウト</div>
              </div>
            </div>
          </div>

          {/* Bench remaining */}
          <div className="card">
            <div className="card-h">ベンチ残り ({gs.myBench.length}人)</div>
            {gs.myBench.length===0&&<p style={{color:"#1e2d3d",fontSize:11}}>なし</p>}
            {gs.myBench.slice(0,6).map(p=>(
              <div key={p.id} className="bench-item">
                <span style={{fontSize:11,flex:1}}>{p.name}</span>
                <span style={{fontSize:9,color:"#374151"}}>{p.pos}</span>
                <OV v={Math.round((p.batting.contact+p.batting.power)/2)}/>
              </div>
            ))}
            <div className="divider"/>
            <div style={{fontSize:9,color:"#374151",marginBottom:4}}>ブルペン ({gs.myBullpen.length}人)</div>
            {gs.myBullpen.slice(0,4).map(p=>(
              <div key={p.id} className="bench-item">
                <span style={{fontSize:11,flex:1}}>{p.name}<HandBadge p={p}/></span>
                <span style={{fontSize:9,color:"#374151"}}>{p.subtype}</span>
                <OV v={p.pitching.velocity}/>
              </div>
            ))}
          </div>

          {/* Opponent pitcher */}
          <div className="card">
            <div className="card-h">相手投手</div>
            <div style={{fontWeight:700,fontSize:13,marginBottom:4}}>{gs.opPitcher?.name||"—"}<HandBadge p={gs.opPitcher}/></div>
            <div style={{display:"flex",gap:8,marginBottom:6}}>
              <span style={{fontSize:11}}>球速<OV v={gs.opPitcher?.pitching?.velocity||0}/></span>
              <span style={{fontSize:11}}>制球<OV v={gs.opPitcher?.pitching?.control||0}/></span>
              <span style={{fontSize:11}}>変化<OV v={gs.opPitcher?.pitching?.breaking||0}/></span>
            </div>
            <div style={{fontSize:10,color:"#374151"}}>球数: <span style={{color:"#94a3b8",fontFamily:"monospace"}}>{gs.opPitchCount}球</span></div>
            <div style={{fontSize:9,color:"#374151",marginTop:3}}>疲労</div>
            <div className="fat-bar" style={{marginTop:3}}>
              <div className="fat-fill" style={{width:`${calcFatigue(gs.opPitchCount,gs.opPitcher?.pitching?.stamina||60)}%`,background:"#f87171"}}/>
            </div>
          </div>
        </div>
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
      </div>
    </div>
  );
}
/* ═══════════════════════════════════════════════
   BATCH RESULT SCREEN
═══════════════════════════════════════════════ */
