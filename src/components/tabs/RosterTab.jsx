import React, { useState } from "react";
import { MAX_ROSTER, MAX_FARM, MAX_外国人_一軍, MAX_SHIHAKA_TOTAL, DEV_GOALS_BATTER, DEV_GOALS_PITCHER, TALK_COOLDOWN_DAYS, POSITIONS } from '../../constants';
import { fmtAvg, fmtSal } from '../../utils';
import { saberBatter, saberPitcher } from '../../engine/sabermetrics';
import { OV, CondBadge, HandBadge } from '../ui';

const TALK_OPTIONS = [
  { type: "praise",       label: "💪 激励する",      desc: "モラル +5〜+15（確実）" },
  { type: "playing_time", label: "⚾ 出場について",   desc: "出場少→+8〜+15 / 多→+3〜+8" },
  { type: "contract",     label: "💴 契約について",   desc: "低給→+5〜+12 / 適正→+2〜+6" },
  { type: "trade_rumor",  label: "🤫 噂を否定する",   desc: "海外志向→-5〜+3 / その他→+2〜+8" },
];

const TRAINING_OPTIONS=[["","バランス"],["contact","ミート"],["power","長打"],["eye","選球"],["speed","走力"],["arm","肩"],["defense","守備"],["velocity","球速"],["control","制球"],["breaking","変化球"],["stamina","スタミナ"]];
const LINEUP_SLOTS = [1,2,3,4,5,6,7,8,9];

const MoralBadge=({v})=>{const m=v||70;const icon=m>=75?"😊":m>=50?"😐":"😟";const col=m>=75?"#34d399":m>=50?"#f5c842":"#f87171";return <span style={{fontSize:10,color:col}}>{icon}{m}</span>;};

export function RosterTab({team,onToggle,onSetLineupOrder,onSetPlayerPosition,onSetStarter,onPromo,onDemo,onSetTrainingFocus,onConvertIkusei,onMoveRotation,onRemoveFromRotation,onSetPitchingPattern,onPlayerClick,onSetDevGoal,onPlayerTalk,gameDay}){
  const [view,setView]=useState("batters");
  const [justConverted,setJustConverted]=useState(new Set());
  const [talkingPid,setTalkingPid]=useState(null);
  const handleConvertIkusei=(pid)=>{onConvertIkusei&&onConvertIkusei(pid);setJustConverted(s=>new Set([...s,pid]));};
  const batters=team.players.filter(p=>!p.isPitcher);
  const pitchers=team.players.filter(p=>p.isPitcher);
  const liMap={};team.lineup.forEach((id,i)=>liMap[id]=i+1);
  const lineupPlayers=team.lineup.map(id=>batters.find(p=>p.id===id)).filter(Boolean);
  const posCountInLineup=lineupPlayers.reduce((acc,p)=>{acc[p.pos]=(acc[p.pos]??0)+1;return acc;},{});
  const injured=team.players.filter(p=>(p.injuryDaysLeft??0)>0);
  const autoSetLineup=()=>{
    const candidate=batters.filter(p=>(p.injuryDaysLeft??0)===0).slice().sort((a,b)=>{
      const sa=saberBatter(a.stats), sb=saberBatter(b.stats);
      const scoreA=(sa.OPS||0)*1000+a.batting.contact*1.6+a.batting.eye*1.1+a.batting.power*1.2+a.batting.speed*0.7;
      const scoreB=(sb.OPS||0)*1000+b.batting.contact*1.6+b.batting.eye*1.1+b.batting.power*1.2+b.batting.speed*0.7;
      return scoreB-scoreA;
    }).slice(0,9);
    candidate.forEach((p,idx)=>onSetLineupOrder&&onSetLineupOrder(p.id,idx+1));
  };
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
        {[["batters","🏏 野手"],["pitchers","⚾ 投手"],["farm","🌿 二軍"],["pattern","📋 継投"],["talk","💬 会話"]].map(([k,l])=>(
          <button key={k} onClick={()=>setView(k)} className={`tab ${view===k?"on":""}`} style={{flex:0,padding:"6px 14px"}}>{l}</button>
        ))}
        <span className="chip cy" style={{marginLeft:"auto",alignSelf:"center"}}>一軍 {team.players.length}/{MAX_ROSTER}</span>
        <span className="chip cb" style={{alignSelf:"center"}}>外国人 {team.players.filter(p=>p.isForeign).length}/{MAX_外国人_一軍}</span>
        {(()=>{const s=team.players.filter(p=>!p.育成).length+team.farm.filter(p=>!p.育成).length;const over=s>=MAX_SHIHAKA_TOTAL;return <span className="chip" style={{alignSelf:"center",background:over?"rgba(248,113,113,.15)":"rgba(52,211,153,.08)",border:`1px solid ${over?"rgba(248,113,113,.4)":"rgba(52,211,153,.25)"}`,color:over?"#f87171":"#94a3b8",fontSize:10}}>支配下 {s}/{MAX_SHIHAKA_TOTAL}</span>;})()}
      </div>
      {view==="batters"&&(
        <div className="card">
          <div className="card-h" style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            <span>打線設定 ({team.lineup.length}/9)</span>
            <span style={{fontSize:10,color:"#6b7280",fontWeight:400}}>守備配置: {POSITIONS.map(pos=>`${pos.replace("手","")}:${posCountInLineup[pos]??0}`).join(" / ")}</span>
            <button className="bsm bgb" style={{marginLeft:"auto"}} onClick={autoSetLineup}>自動編成</button>
          </div>
          <div style={{overflowX:"auto"}}>
            <table className="tbl">
              <thead><tr><th>#</th><th>選手名</th><th>守備</th><th>年齢</th><th>ミート</th><th>長打</th><th>走力</th><th>選球</th><th>クラッチ</th><th>変化球</th><th>状態</th><th>モラル</th><th>打率</th><th>HR</th><th>OPS</th><th>強化</th><th></th></tr></thead>
              <tbody>
                {batters.map(p=>{const inL=team.lineup.includes(p.id);const sb=saberBatter(p.stats);const isInj=(p.injuryDaysLeft??0)>0;return(
                  <tr key={p.id} style={isInj?{opacity:.55}:undefined}>
                    <td>
                      <select
                        value={inL ? liMap[p.id] : 0}
                        disabled={isInj}
                        style={{
                          fontSize: 11,
                          background: "#0d1b2a",
                          color: inL ? "#93c5fd" : "#374151",
                          border: "1px solid #1e3a5f",
                          borderRadius: 3,
                          padding: "1px 3px",
                          width: 46,
                        }}
                        onChange={e => {
                          const order = parseInt(e.target.value, 10);
                          if (onSetLineupOrder) onSetLineupOrder(p.id, order);
                        }}
                      >
                        <option value={0}>—</option>
                        {LINEUP_SLOTS.map(n => (
                          <option key={n} value={n}>{n}番</option>
                        ))}
                      </select>
                      {inL&&(
                        <div style={{display:"flex",gap:2,marginTop:2}}>
                          <button className="bsm" style={{fontSize:9,padding:"1px 4px"}} onClick={()=>onSetLineupOrder&&onSetLineupOrder(p.id,Math.max(1,(liMap[p.id]??1)-1))}>↑</button>
                          <button className="bsm" style={{fontSize:9,padding:"1px 4px"}} onClick={()=>onSetLineupOrder&&onSetLineupOrder(p.id,Math.min(9,(liMap[p.id]??1)+1))}>↓</button>
                        </div>
                      )}
                    </td>
                    <td style={{fontWeight:inL?700:400,cursor:"pointer"}} onClick={()=>onPlayerClick?.(p,team.name)}><span style={{color:inL?"#93c5fd":"#60a5fa"}}>{p.name}</span>{p.isForeign&&<span className="chip cb" style={{marginLeft:4,fontSize:8}}>外</span>}{isInj&&<span style={{marginLeft:4,fontSize:9,color:"#f87171"}}>🤕{p.injuryDaysLeft}</span>}</td>
                    <td>
                      <select
                        value={p.pos || ""}
                        style={{
                          fontSize: 10,
                          background: "#0d1b2a",
                          color: "#94a3b8",
                          border: "1px solid #1e3a5f",
                          borderRadius: 3,
                          padding: "1px 2px",
                        }}
                        onChange={e => {
                          if (onSetPlayerPosition) onSetPlayerPosition(p.id, e.target.value);
                        }}
                      >
                        {POSITIONS.map(pos => {
                          const n=posCountInLineup[pos]??0;
                          return (
                          <option key={pos} value={pos}>{pos}{n>0?` (${n})`:""}</option>
                        );})}
                      </select>
                      <div style={{fontSize:9,color:"#6b7280",marginTop:2}}>
                        {posCountInLineup[p.pos]>1&&team.lineup.includes(p.id)?"⚠ 同守備が重複":" "}
                      </div>
                    </td><td className="mono" style={{color:"#374151"}}>{p.age}</td>
                    <td><OV v={p.batting.contact}/></td><td><OV v={p.batting.power}/></td><td><OV v={p.batting.speed}/></td><td><OV v={p.batting.eye}/></td>
                    <td><OV v={p.batting.clutch}/></td><td><OV v={p.batting.breakingBall}/></td>
                    <td><CondBadge p={p}/></td>
                    <td><MoralBadge v={p.morale}/></td>
                    <td className="mono">{fmtAvg(p.stats.H,p.stats.AB)}</td>
                    <td className="mono" style={{color:p.stats.HR>=20?"#f5c842":undefined}}>{p.stats.HR}</td>
                    <td className="mono" style={{color:sb.OPS>=.850?"#34d399":sb.OPS>=.700?"#f5c842":undefined}}>{sb.OPS>0?sb.OPS.toFixed(3):"---"}</td>
                    <td><select style={{fontSize:9,background:"#0d1b2a",color:"#94a3b8",border:"1px solid #1e3a5f",borderRadius:3,padding:"1px 2px"}} value={p.trainingFocus||""} onChange={e=>onSetTrainingFocus&&onSetTrainingFocus(p.id,e.target.value||null)}>{TRAINING_OPTIONS.filter(([k])=>!["velocity","control","breaking","stamina"].includes(k)).map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></td>
                    <td><button className="bsm bgr" onClick={()=>onDemo(p.id)}>↓</button></td>
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
        <div>
          {(()=>{
            const eligible=team.farm.filter(p=>!p.育成&&(p.injuryDaysLeft??0)===0&&(p.registrationCooldownDays??0)===0);
            if(team.players.length<MAX_ROSTER&&eligible.length>0){
              const top=eligible.slice().sort((a,b)=>(b.potential??50)-(a.potential??50)).slice(0,3);
              return(
                <div style={{marginBottom:8,padding:"8px 12px",background:"rgba(52,211,153,.08)",border:"1px solid rgba(52,211,153,.25)",borderRadius:6,fontSize:11,color:"#34d399"}}>
                  💡 一軍枠に空き（{MAX_ROSTER-team.players.length}枠）- 昇格推薦: {top.map(p=>p.name).join('、')}
                </div>
              );
            }
            return null;
          })()}
          <div className="card">
            <div className="card-h">二軍 ({team.farm.length}/{MAX_FARM})</div>
            <div style={{overflowX:"auto"}}>
              <table className="tbl">
                <thead><tr><th>選手名</th><th>守備</th><th>年齢</th><th>育成年</th><th>潜在</th><th>主要能力</th><th>育成目標</th><th>状態</th><th>二軍成績</th><th></th></tr></thead>
                <tbody>
                  {team.farm.map(p=>{
                    const s2=p.stats2;
                    const farmStat=s2&&!p.isPitcher&&s2.PA>0
                      ?`${fmtAvg(s2.H,s2.PA)} ${s2.HR}HR`
                      :s2&&p.isPitcher&&s2.IP>0
                      ?`${s2.W}W ${s2.IP>0?(s2.ER*9/s2.IP).toFixed(2):"--"}`
                      :"—";
                    const cd=p.registrationCooldownDays??0;
                    const isInj=(p.injuryDaysLeft??0)>0;
                    const canPromote=!p.育成&&!isInj&&cd===0;
                    return(
                    <tr key={p.id} style={isInj?{opacity:.6}:undefined}>
                      <td style={{fontWeight:600,fontSize:12,cursor:"pointer"}} onClick={()=>onPlayerClick?.(p,team.name)}>
                        <span style={{color:"#60a5fa"}}>{p.name}</span>
                        {p.育成&&<span style={{fontSize:9,color:"#a78bfa",marginLeft:4}}>[育{p.ikuseiYears||0}年]</span>}
                        {isInj&&<span style={{fontSize:9,color:"#f87171",marginLeft:4}}>🤕{p.injuryDaysLeft}</span>}
                        {!isInj&&cd>0&&<span style={{fontSize:9,color:"#f5c842",marginLeft:4}}>🔒{cd}日</span>}
                      </td>
                      <td style={{fontSize:10,color:"#374151"}}>{p.pos}</td><td className="mono" style={{color:"#374151"}}>{p.age}</td>
                      <td className="mono" style={{color:p.育成?"#a78bfa":"#1e2d3d",fontSize:10}}>{p.育成?(p.ikuseiYears||0)+"年":"—"}</td>
                      <td><OV v={p.potential}/></td>
                      <td><OV v={p.isPitcher?p.pitching.velocity:p.batting.contact}/></td>
                      <td>
                        <select style={{fontSize:9,background:"#0d1b2a",color:"#94a3b8",border:"1px solid #1e3a5f",borderRadius:3,padding:"1px 2px",maxWidth:90}} value={p.devGoal||""} onChange={e=>onSetDevGoal&&onSetDevGoal(p.id,e.target.value||null)}>
                          {(p.isPitcher?DEV_GOALS_PITCHER:DEV_GOALS_BATTER).map(({key,label})=><option key={key} value={key}>{label}</option>)}
                        </select>
                      </td>
                      <td><CondBadge p={p}/></td>
                      <td className="mono" style={{fontSize:10,color:"#94a3b8"}}>{farmStat}</td>
                      <td style={{display:"flex",gap:4}}>
                        {p.育成
                          ?<button className="bsm" style={{background:"rgba(167,139,250,.15)",border:"1px solid rgba(167,139,250,.4)",color:"#a78bfa",fontSize:9,padding:"2px 6px",borderRadius:4,cursor:"pointer",whiteSpace:"nowrap"}} onClick={()=>handleConvertIkusei(p.id)}>支配下登録</button>
                          :<button className="bsm bga" onClick={()=>canPromote&&onPromo(p.id)} disabled={!canPromote} style={!canPromote?{opacity:.4,cursor:"not-allowed"}:undefined}>{cd>0?`🔒${cd}日`:isInj?`🤕${p.injuryDaysLeft}`:"↑一軍"}</button>
                        }
                        {justConverted.has(p.id)&&!p.育成&&<button className="bsm" style={{background:"rgba(52,211,153,.15)",border:"1px solid rgba(52,211,153,.4)",color:"#34d399",fontSize:9,padding:"2px 6px",borderRadius:4,cursor:"pointer",whiteSpace:"nowrap"}} onClick={()=>{onPromo(p.id);setJustConverted(s=>{const n=new Set(s);n.delete(p.id);return n;});}}>↑一軍昇格</button>}
                      </td>
                    </tr>
                    );
                  })}
                  {team.farm.length===0&&<tr><td colSpan={10} style={{color:"#1e2d3d",padding:"16px",textAlign:"center"}}>二軍選手なし</td></tr>}
                </tbody>
              </table>
            </div>
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
      {view==="talk"&&(
        <div className="card">
          <div className="card-h">💬 選手コミュニケーション</div>
          <div style={{fontSize:10,color:"#6b7280",marginBottom:10}}>月1回（{TALK_COOLDOWN_DAYS}試合に1回）まで同一選手と話せます。モラルが低い選手から優先しましょう。</div>
          {[...team.players].sort((a,b)=>(a.morale??70)-(b.morale??70)).map(p=>{
            const gd=gameDay??0;
            const lastTalk=p.lastTalkGameDay??0;
            const cooldownLeft=lastTalk>0?Math.max(0,TALK_COOLDOWN_DAYS-(gd-lastTalk)):0;
            const canTalk=cooldownLeft===0;
            const isOpen=talkingPid===p.id;
            return(
              <div key={p.id} className="card2" style={{marginBottom:6}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <div style={{flex:1}}>
                    <span style={{fontWeight:700,fontSize:12,cursor:"pointer",color:"#60a5fa"}} onClick={()=>onPlayerClick?.(p,team.name)}>{p.name}</span>
                    <span style={{fontSize:10,color:"#374151",marginLeft:6}}>{p.pos}/{p.age}歳</span>
                    {p.isForeign&&<span className="chip cb" style={{marginLeft:4,fontSize:8}}>外</span>}
                  </div>
                  <MoralBadge v={p.morale}/>
                  {canTalk
                    ?<button className={`bsm ${isOpen?"bgb":"bga"}`} style={{fontSize:10}} onClick={()=>setTalkingPid(isOpen?null:p.id)}>💬 話す</button>
                    :<span style={{fontSize:9,color:"#374151"}}>🔒 あと{cooldownLeft}試合</span>
                  }
                </div>
                {isOpen&&canTalk&&(
                  <div style={{marginTop:8,display:"grid",gridTemplateColumns:"1fr 1fr",gap:5}}>
                    {TALK_OPTIONS.map(opt=>(
                      <button key={opt.type} className="bsm bga" style={{padding:"6px 8px",textAlign:"left",height:"auto"}}
                        onClick={()=>{onPlayerTalk?.(p.id,opt.type);setTalkingPid(null);}}>
                        <div style={{fontSize:11,fontWeight:700}}>{opt.label}</div>
                        <div style={{fontSize:9,color:"#6b7280",marginTop:1}}>{opt.desc}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {team.players.length===0&&<div style={{color:"#374151",fontSize:11}}>一軍選手なし</div>}
        </div>
      )}
    </div>
  );
}
