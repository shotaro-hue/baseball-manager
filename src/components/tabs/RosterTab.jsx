import React, { useState } from "react";
import { MAX_ROSTER, MAX_FARM, MAX_外国人_一軍 } from '../../constants';
import { fmtAvg, fmtSal } from '../../utils';
import { saberBatter, saberPitcher } from '../../engine/sabermetrics';
import { OV, CondBadge, HandBadge } from '../ui';

const TRAINING_OPTIONS=[["","バランス"],["contact","ミート"],["power","長打"],["eye","選球"],["speed","走力"],["arm","肩"],["defense","守備"],["velocity","球速"],["control","制球"],["breaking","変化球"],["stamina","スタミナ"]];

const MoralBadge=({v})=>{const m=v||70;const icon=m>=75?"😊":m>=50?"😐":"😟";const col=m>=75?"#34d399":m>=50?"#f5c842":"#f87171";return <span style={{fontSize:10,color:col}}>{icon}{m}</span>;};

export function RosterTab({team,onToggle,onSetStarter,onPromo,onDemo,onSetTrainingFocus,onConvertIkusei,onMoveRotation,onRemoveFromRotation,onSetPitchingPattern,onPlayerClick}){
  const [view,setView]=useState("batters");
  const batters=team.players.filter(p=>!p.isPitcher);
  const pitchers=team.players.filter(p=>p.isPitcher);
  const liMap={};team.lineup.forEach((id,i)=>liMap[id]=i+1);
  const injured=team.players.filter(p=>(p.injuryDaysLeft??0)>0);
  return(
    <div>
      {injured.length>0&&(
        <div className="card" style={{marginBottom:8,background:"rgba(248,113,113,.06)",border:"1px solid rgba(248,113,113,.2)"}}>
          <div className="card-h" style={{color:"#f87171"}}>🤕 負傷者リスト ({injured.length}人)</div>
          {injured.map(p=>(
            <div key={p.id} style={{fontSize:11,padding:"3px 0",color:"#94a3b8",display:"flex",justifyContent:"space-between"}}>
              <span><span style={{cursor:"pointer",color:"#93c5fd"}} onClick={()=>onPlayerClick?.(p,team.name)}>{p.name}</span> <span style={{color:"#f87171"}}>[{p.injury}]</span></span>
              <span>残{p.injuryDaysLeft}試合</span>
            </div>
          ))}
        </div>
      )}
      <div style={{display:"flex",gap:6,marginBottom:10}}>
        {[["batters","🏏 野手"],["pitchers","⚾ 投手"],["farm","🌿 二軍"],["pattern","📋 継投"]].map(([k,l])=>(
          <button key={k} onClick={()=>setView(k)} className={`tab ${view===k?"on":""}`} style={{flex:0,padding:"6px 14px"}}>{l}</button>
        ))}
        <span className="chip cy" style={{marginLeft:"auto",alignSelf:"center"}}>一軍 {team.players.length}/{MAX_ROSTER}</span>
        <span className="chip cb" style={{alignSelf:"center"}}>外国人 {team.players.filter(p=>p.isForeign).length}/{MAX_外国人_一軍}</span>
      </div>
      {view==="batters"&&(
        <div className="card">
          <div className="card-h">打線設定 ({team.lineup.length}/9)</div>
          <div style={{overflowX:"auto"}}>
            <table className="tbl">
              <thead><tr><th>#</th><th>選手名</th><th>守備</th><th>年齢</th><th>ミート</th><th>長打</th><th>走力</th><th>選球</th><th>クラッチ</th><th>変化球</th><th>状態</th><th>モラル</th><th>打率</th><th>HR</th><th>OPS</th><th>強化</th><th></th></tr></thead>
              <tbody>
                {batters.map(p=>{const inL=team.lineup.includes(p.id);const sb=saberBatter(p.stats);const isInj=(p.injuryDaysLeft??0)>0;return(
                  <tr key={p.id} style={isInj?{opacity:.55}:undefined}>
                    <td>{inL?<span className="lnb">{liMap[p.id]}</span>:<span style={{color:"#1e2d3d"}}>—</span>}</td>
                    <td style={{fontWeight:inL?700:400,cursor:"pointer"}} onClick={()=>onPlayerClick?.(p,team.name)}><span style={{color:inL?"#93c5fd":"#60a5fa"}}>{p.name}</span>{p.isForeign&&<span className="chip cb" style={{marginLeft:4,fontSize:8}}>外</span>}{isInj&&<span style={{marginLeft:4,fontSize:9,color:"#f87171"}}>🤕{p.injuryDaysLeft}</span>}</td>
                    <td style={{fontSize:10,color:"#374151"}}>{p.pos}</td><td className="mono" style={{color:"#374151"}}>{p.age}</td>
                    <td><OV v={p.batting.contact}/></td><td><OV v={p.batting.power}/></td><td><OV v={p.batting.speed}/></td><td><OV v={p.batting.eye}/></td>
                    <td><OV v={p.batting.clutch}/></td><td><OV v={p.batting.breakingBall}/></td>
                    <td><CondBadge p={p}/></td>
                    <td><MoralBadge v={p.morale}/></td>
                    <td className="mono">{fmtAvg(p.stats.H,p.stats.AB)}</td>
                    <td className="mono" style={{color:p.stats.HR>=20?"#f5c842":undefined}}>{p.stats.HR}</td>
                    <td className="mono" style={{color:sb.OPS>=.850?"#34d399":sb.OPS>=.700?"#f5c842":undefined}}>{sb.OPS>0?sb.OPS.toFixed(3):"---"}</td>
                    <td><select style={{fontSize:9,background:"#0d1b2a",color:"#94a3b8",border:"1px solid #1e3a5f",borderRadius:3,padding:"1px 2px"}} value={p.trainingFocus||""} onChange={e=>onSetTrainingFocus&&onSetTrainingFocus(p.id,e.target.value||null)}>{TRAINING_OPTIONS.filter(([k])=>!["velocity","control","breaking","stamina"].includes(k)).map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></td>
                    <td><button className={`bsm ${inL?"bgr":"bga"}`} onClick={()=>!isInj&&onToggle(p.id)} disabled={isInj}>{inL?"外す":"入れる"}</button> <button className="bsm bgr" onClick={()=>onDemo(p.id)}>↓</button></td>
                  </tr>
                );})}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {view==="pitchers"&&(
        <div className="card">
          <div className="card-h">投手陣</div>
          <div style={{overflowX:"auto"}}>
            <table className="tbl">
              <thead><tr><th></th><th>選手名</th><th>役割</th><th>年齢</th><th>球速</th><th>制球</th><th>スタミナ</th><th>変化球</th><th>球種</th><th>ピンチ</th><th>状態</th><th>モラル</th><th>防御率</th><th>WHIP</th><th>勝</th><th>敗</th><th></th></tr></thead>
              <tbody>
                {pitchers.map(p=>{const inR=team.rotation.includes(p.id);const sp=saberPitcher(p.stats);return(
                  <tr key={p.id}>
                    <td>{inR&&<span style={{fontSize:9,color:"#f5c842",background:"rgba(245,200,66,.1)",padding:"1px 5px",borderRadius:3}}>先発</span>}</td>
                    <td style={{fontWeight:700,fontSize:12,cursor:"pointer"}} onClick={()=>onPlayerClick?.(p,team.name)}><span style={{color:"#60a5fa"}}>{p.name}</span><HandBadge p={p}/>{(p.injuryDaysLeft??0)>0&&<span style={{marginLeft:4,fontSize:9,color:"#f87171"}}>🤕{p.injuryDaysLeft}</span>}</td>
                    <td style={{fontSize:10,color:"#374151"}}>{p.subtype}</td><td className="mono" style={{color:"#374151"}}>{p.age}</td>
                    <td><OV v={p.pitching.velocity}/></td><td><OV v={p.pitching.control}/></td><td><OV v={p.pitching.stamina}/></td><td><OV v={p.pitching.breaking}/></td>
                    <td><OV v={p.pitching.variety}/></td><td><OV v={p.pitching.clutchP}/></td>
                    <td><CondBadge p={p}/></td>
                    <td><MoralBadge v={p.morale}/></td>
                    <td className="mono" style={{color:sp.ERA>0&&sp.ERA<3?"#34d399":sp.ERA<4?"#f5c842":sp.ERA>0?"#f87171":undefined}}>{sp.ERA>0?sp.ERA:"---"}</td>
                    <td className="mono" style={{color:sp.WHIP>0&&sp.WHIP<1.0?"#34d399":sp.WHIP<1.3?"#f5c842":sp.WHIP<1.5?"#94a3b8":"#f87171"}}>{sp.WHIP>0?sp.WHIP:"---"}</td>
                    <td className="mono" style={{color:"#34d399"}}>{p.stats.W}</td><td className="mono" style={{color:"#f87171"}}>{p.stats.L}</td>
                    <td><select style={{fontSize:9,background:"#0d1b2a",color:"#94a3b8",border:"1px solid #1e3a5f",borderRadius:3,padding:"1px 2px"}} value={p.trainingFocus||""} onChange={e=>onSetTrainingFocus&&onSetTrainingFocus(p.id,e.target.value||null)}>{TRAINING_OPTIONS.filter(([k])=>!["contact","power","eye","speed","arm","defense"].includes(k)).map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></td>
                    <td><button className="bsm bgb" onClick={()=>onSetStarter(p.id)}>先発へ</button> <button className="bsm bgr" onClick={()=>onDemo(p.id)}>↓</button></td>
                  </tr>
                );})}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {view==="farm"&&(
        <div className="card">
          <div className="card-h">二軍 ({team.farm.length}/{MAX_FARM})</div>
          <div style={{overflowX:"auto"}}>
            <table className="tbl">
              <thead><tr><th>選手名</th><th>守備</th><th>年齢</th><th>育成年</th><th>潜在</th><th>主要能力</th><th>状態</th><th></th></tr></thead>
              <tbody>
                {team.farm.map(p=>(
                  <tr key={p.id}>
                    <td style={{fontWeight:600,fontSize:12,cursor:"pointer"}} onClick={()=>onPlayerClick?.(p,team.name)}><span style={{color:"#60a5fa"}}>{p.name}</span>{p.育成&&<span style={{fontSize:9,color:"#a78bfa",marginLeft:4}}>[育{p.ikuseiYears||0}年]</span>}</td>
                    <td style={{fontSize:10,color:"#374151"}}>{p.pos}</td><td className="mono" style={{color:"#374151"}}>{p.age}</td>
                    <td className="mono" style={{color:p.育成?"#a78bfa":"#1e2d3d",fontSize:10}}>{p.育成?(p.ikuseiYears||0)+"年":"—"}</td>
                    <td><OV v={p.potential}/></td>
                    <td><OV v={p.isPitcher?p.pitching.velocity:p.batting.contact}/></td>
                    <td><CondBadge p={p}/></td>
                    <td style={{display:"flex",gap:4}}>
                      {p.育成
                        ?<button className="bsm" style={{background:"rgba(167,139,250,.15)",border:"1px solid rgba(167,139,250,.4)",color:"#a78bfa",fontSize:9,padding:"2px 6px",borderRadius:4,cursor:"pointer",whiteSpace:"nowrap"}} onClick={()=>onConvertIkusei&&onConvertIkusei(p.id)}>支配下登録</button>
                        :<button className="bsm bga" onClick={()=>onPromo(p.id)}>↑一軍</button>
                      }
                    </td>
                  </tr>
                ))}
                {team.farm.length===0&&<tr><td colSpan={8} style={{color:"#1e2d3d",padding:"16px",textAlign:"center"}}>二軍選手なし</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {view==="pattern"&&(()=>{
        const pattern=team.pitchingPattern??{closerId:null,setupId:null,middleOrder:[]};
        const rotPitchers=team.rotation.map(id=>team.players.find(p=>p.id===id)).filter(Boolean);
        const nonRotPitchers=pitchers.filter(p=>!team.rotation.includes(p.id));
        const closerP=pitchers.find(p=>p.id===pattern.closerId);
        const setupP=pitchers.find(p=>p.id===pattern.setupId);
        const middleOrder=pattern.middleOrder??[];
        const orderedBullpen=[
          ...middleOrder.map(id=>pitchers.find(p=>p.id===id)).filter(Boolean),
          ...nonRotPitchers.filter(p=>!middleOrder.includes(p.id)),
        ];
        const moveMiddle=(pid,dir)=>{
          const arr=[...middleOrder];
          const i=arr.indexOf(pid);
          if(i<0){onSetPitchingPattern&&onSetPitchingPattern({middleOrder:[...arr,pid]});return;}
          const j=i+dir;if(j<0||j>=arr.length)return;
          [arr[i],arr[j]]=[arr[j],arr[i]];
          onSetPitchingPattern&&onSetPitchingPattern({middleOrder:arr});
        };
        const addToMiddle=pid=>{if(!middleOrder.includes(pid))onSetPitchingPattern&&onSetPitchingPattern({middleOrder:[...middleOrder,pid]});};
        const removeFromMiddle=pid=>onSetPitchingPattern&&onSetPitchingPattern({middleOrder:middleOrder.filter(id=>id!==pid)});
        const cardStyle={background:"rgba(14,27,46,.6)",border:"1px solid #1e3a5f",borderRadius:6,padding:"10px 12px",flex:1,minWidth:140};
        const rowStyle={display:"flex",alignItems:"center",gap:6,padding:"5px 0",borderBottom:"1px solid rgba(30,58,95,.4)"};
        const btnSm={fontSize:10,padding:"1px 6px",borderRadius:3,cursor:"pointer",background:"rgba(30,58,95,.6)",border:"1px solid #1e3a5f",color:"#94a3b8"};
        return(
          <div>
            <div className="card" style={{marginBottom:8}}>
              <div className="card-h">先発ローテーション ({rotPitchers.length}/6)</div>
              {rotPitchers.map((p,i)=>(
                <div key={p.id} style={rowStyle}>
                  <span style={{fontSize:10,color:"#374151",width:16,textAlign:"right"}}>{i+1}</span>
                  <span style={{flex:1,fontWeight:600,fontSize:12,cursor:"pointer",color:"#60a5fa"}} onClick={()=>onPlayerClick?.(p,team.name)}>{p.name}</span>
                  <span style={{fontSize:9,color:"#94a3b8"}}>スタミナ</span><span style={{fontSize:11,color:"#f5c842",fontFamily:"monospace"}}>{p.pitching?.stamina??50}</span>
                  <span style={{fontSize:9,color:"#94a3b8",marginLeft:4}}>Cond</span><span style={{fontSize:11,color:(p.condition??70)>=80?"#34d399":(p.condition??70)>=60?"#f5c842":"#f87171",fontFamily:"monospace"}}>{p.condition??70}</span>
                  <button style={btnSm} onClick={()=>onMoveRotation&&onMoveRotation(p.id,-1)} disabled={i===0}>↑</button>
                  <button style={btnSm} onClick={()=>onMoveRotation&&onMoveRotation(p.id,1)} disabled={i===rotPitchers.length-1}>↓</button>
                  <button style={{...btnSm,color:"#f87171"}} onClick={()=>onRemoveFromRotation&&onRemoveFromRotation(p.id)}>✕</button>
                </div>
              ))}
              {rotPitchers.length<6&&nonRotPitchers.length>0&&(
                <div style={{marginTop:6}}>
                  <select style={{fontSize:10,background:"#0d1b2a",color:"#94a3b8",border:"1px solid #1e3a5f",borderRadius:3,padding:"3px 6px"}}
                    value="" onChange={e=>{if(e.target.value)onSetStarter&&onSetStarter(e.target.value);}}>
                    <option value="">＋ 先発追加...</option>
                    {nonRotPitchers.map(p=><option key={p.id} value={p.id}>{p.name}（{p.subtype}）</option>)}
                  </select>
                </div>
              )}
              {rotPitchers.length===0&&<div style={{color:"#374151",fontSize:11,padding:"8px 0"}}>先発投手が未設定です</div>}
            </div>
            <div className="card" style={{marginBottom:8}}>
              <div className="card-h">指名投手</div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {[
                  {key:"closerId",label:"🔒 抑え（9回）",current:closerP,otherId:pattern.setupId},
                  {key:"setupId",label:"⚙️ セットアッパー（8回）",current:setupP,otherId:pattern.closerId},
                ].map(({key,label,current,otherId})=>(
                  <div key={key} style={cardStyle}>
                    <div style={{fontSize:9,color:"#374151",marginBottom:4,letterSpacing:".1em"}}>{label}</div>
                    <select style={{fontSize:11,background:"#0d1b2a",color:"#e0d4bf",border:"1px solid #1e3a5f",borderRadius:3,padding:"3px 6px",width:"100%"}}
                      value={pattern[key]??""} onChange={e=>onSetPitchingPattern&&onSetPitchingPattern({[key]:e.target.value||null})}>
                      <option value="">指名なし（自動）</option>
                      {pitchers.map(p=><option key={p.id} value={p.id} disabled={p.id===otherId}>{p.name}（{p.subtype}）</option>)}
                    </select>
                    {current&&(
                      <div style={{marginTop:6,display:"flex",gap:8,fontSize:10}}>
                        <span style={{color:"#94a3b8"}}>球速</span><span style={{color:"#e0d4bf",fontFamily:"monospace"}}>{current.pitching?.velocity??50}</span>
                        <span style={{color:"#94a3b8"}}>制球</span><span style={{color:"#e0d4bf",fontFamily:"monospace"}}>{current.pitching?.control??50}</span>
                        <span style={{color:"#94a3b8"}}>Cond</span><span style={{color:(current.condition??70)>=80?"#34d399":(current.condition??70)>=60?"#f5c842":"#f87171",fontFamily:"monospace"}}>{current.condition??70}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className="card">
              <div className="card-h">中継ぎ優先順 <span style={{fontSize:9,color:"#374151",fontWeight:400}}>（上から順に登板 / リスト外はスコア自動選択）</span></div>
              {orderedBullpen.map((p,i)=>{
                const inOrder=middleOrder.includes(p.id);
                const isCloser=p.id===pattern.closerId;
                const isSetup=p.id===pattern.setupId;
                const orderIdx=middleOrder.indexOf(p.id);
                return(
                  <div key={p.id} style={{...rowStyle,opacity:isCloser||isSetup?0.5:1}}>
                    <span style={{fontSize:10,color:inOrder?"#f5c842":"#374151",width:16,textAlign:"right",fontFamily:"monospace"}}>{inOrder?orderIdx+1:"—"}</span>
                    <span style={{flex:1,fontWeight:600,fontSize:12,cursor:"pointer",color:"#60a5fa"}} onClick={()=>onPlayerClick?.(p,team.name)}>{p.name}</span>
                    <span style={{fontSize:9,color:"#374151"}}>{p.subtype}</span>
                    <span style={{fontSize:9,color:"#94a3b8",marginLeft:4}}>St</span><span style={{fontSize:10,color:"#e0d4bf",fontFamily:"monospace"}}>{p.pitching?.stamina??50}</span>
                    {isCloser&&<span style={{fontSize:9,color:"#f5c842",background:"rgba(245,200,66,.1)",padding:"1px 5px",borderRadius:3}}>抑え指名</span>}
                    {isSetup&&<span style={{fontSize:9,color:"#60a5fa",background:"rgba(96,165,250,.1)",padding:"1px 5px",borderRadius:3}}>セットアッパー指名</span>}
                    {!isCloser&&!isSetup&&(<>
                      {inOrder?(
                        <>
                          <button style={btnSm} onClick={()=>moveMiddle(p.id,-1)} disabled={orderIdx===0}>↑</button>
                          <button style={btnSm} onClick={()=>moveMiddle(p.id,1)} disabled={orderIdx===middleOrder.length-1}>↓</button>
                          <button style={{...btnSm,color:"#f87171"}} onClick={()=>removeFromMiddle(p.id)}>✕</button>
                        </>
                      ):(
                        <button style={{...btnSm,color:"#34d399"}} onClick={()=>addToMiddle(p.id)}>＋優先</button>
                      )}
                    </>)}
                  </div>
                );
              })}
              {orderedBullpen.length===0&&<div style={{color:"#374151",fontSize:11,padding:"8px 0"}}>ブルペン投手なし</div>}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
