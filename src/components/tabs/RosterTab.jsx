import React, { useState } from "react";
import { MAX_ROSTER, MAX_FARM, MAX_外国人_一軍, MAX_SHIHAKA_TOTAL, DEV_GOALS_BATTER, DEV_GOALS_PITCHER, TALK_COOLDOWN_DAYS, POSITIONS, FIELDING_POSITIONS, ROSTER_SWAP_SCORE_THRESHOLD } from '../../constants';
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

const MoralBadge=({v})=>{const m=v||70;const icon=m>=75?"😊":m>=50?"😐":"😟";const col=m>=75?"#34d399":m>=50?"#f5c842":"#f87171";return <span style={{fontSize:10,color:col}}>{icon}{m}</span>;};

const playerScore=(p)=>{
  if(p.isPitcher){
    const sp=saberPitcher(p.stats??{});
    const eraBonus=sp.ERA>0?Math.max(0,(4-sp.ERA)*15):0;
    return(p.pitching?.velocity??50)*1.5+(p.pitching?.control??50)*1.5+(p.pitching?.breaking??50)*1.2+(p.pitching?.stamina??50)*1.0+eraBonus;
  }
  const sb=saberBatter(p.stats??{});
  return(sb.OPS||0)*1000+(p.batting?.contact??50)*1.6+(p.batting?.eye??50)*1.1+(p.batting?.power??50)*1.2+(p.batting?.speed??50)*0.7;
};

const buildRosterRecs=(team)=>{
  const recs=[];
  const rosterCount=team.players.length;
  const openSlots=MAX_ROSTER-rosterCount;
  const foreignInActive=team.players.filter(p=>p.isForeign).length;
  const canPromote=(p)=>!p.育成&&(p.injuryDaysLeft??0)===0&&(p.registrationCooldownDays??0)===0&&!(p.isForeign&&foreignInActive>=MAX_外国人_一軍);

  // 降格（1軍枠超過）
  if(openSlots<0){
    [...team.players].sort((a,b)=>playerScore(a)-playerScore(b)).slice(0,Math.min(-openSlots,3)).forEach(p=>recs.push({type:'demote',downPlayer:p,upPlayer:null,scoreDiff:0}));
    return recs;
  }

  const usedFarmIds=new Set();
  const usedActiveIds=new Set();
  const eligible=[...team.farm].filter(canPromote).sort((a,b)=>playerScore(b)-playerScore(a));

  // 昇格（空き枠あり）
  eligible.slice(0,Math.min(openSlots,3)).forEach(p=>{
    recs.push({type:'promote',upPlayer:p,downPlayer:null,scoreDiff:Math.round(playerScore(p))});
    usedFarmIds.add(p.id);
  });

  // スワップ（残り有力二軍選手 vs 一軍下位選手）
  const remainFarm=eligible.filter(fp=>!usedFarmIds.has(fp.id));
  if(remainFarm.length>0){
    [...team.players].sort((a,b)=>playerScore(a)-playerScore(b)).forEach(ap=>{
      if(recs.length>=6||usedActiveIds.has(ap.id))return;
      const best=remainFarm.find(fp=>!usedFarmIds.has(fp.id)&&fp.isPitcher===ap.isPitcher);
      if(!best)return;
      const diff=playerScore(best)-playerScore(ap);
      if(diff>=ROSTER_SWAP_SCORE_THRESHOLD){
        recs.push({type:'swap',upPlayer:best,downPlayer:ap,scoreDiff:Math.round(diff)});
        usedFarmIds.add(best.id);
        usedActiveIds.add(ap.id);
      }
    });
  }
  return recs;
};

export function RosterTab({team,onToggle,onReplaceLineup,onSetLineupOrder,onSetRosterDhMode,onSetPlayerPosition,onSetStarter,onPromo,onDemo,onSetTrainingFocus,onConvertIkusei,onMoveRotation,onRemoveFromRotation,onSetPitchingPattern,onPlayerClick,onSetDevGoal,onPlayerTalk,onSetConvertTarget,gameDay}){
  const [view,setView]=useState("batters");
  const [justConverted,setJustConverted]=useState(new Set());
  const [talkingPid,setTalkingPid]=useState(null);
  const [rosterRecs,setRosterRecs]=useState(null);
  const handleConvertIkusei=(pid)=>{onConvertIkusei&&onConvertIkusei(pid);setJustConverted(s=>new Set([...s,pid]));};
  const batters=team.players.filter(p=>!p.isPitcher);
  const pitchers=team.players.filter(p=>p.isPitcher);
  const liMap={};team.lineup.forEach((id,i)=>liMap[id]=i+1);
  const batterOriginalIndex = {};
  batters.forEach((p, i) => { batterOriginalIndex[p.id] = i; });
  const orderedBatters = [...batters].sort((a, b) => {
    const aOrder = liMap[a.id] ?? Number.POSITIVE_INFINITY;
    const bOrder = liMap[b.id] ?? Number.POSITIVE_INFINITY;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return (batterOriginalIndex[a.id] ?? 0) - (batterOriginalIndex[b.id] ?? 0);
  });
  const lineupPlayers=team.lineup.map(id=>batters.find(p=>p.id===id)).filter(Boolean);
  const posCountInLineup=lineupPlayers.reduce((acc,p)=>{acc[p.pos]=(acc[p.pos]??0)+1;return acc;},{});
  const injured=team.players.filter(p=>(p.injuryDaysLeft??0)>0);
  const rosterDhMode = team.rosterDhMode ?? team.dhEnabled;
  const lineupLimit = rosterDhMode ? 9 : 8;
  const lineupSlots = Array.from({ length: lineupLimit }, (_, i) => i + 1);
  const autoSetLineup=()=>{
    const eligible=batters.filter(p=>(p.injuryDaysLeft??0)===0);
    if(!eligible.length)return;
    const scoreOf=p=>{const s=saberBatter(p.stats);return(s.OPS||0)*1000+p.batting.contact*1.6+p.batting.eye*1.1+p.batting.power*1.2+p.batting.speed*0.7;};
    const profAt=(p,pos)=>pos==='DH'?50:p.pos===pos?100:(p.positions?.[pos]??0);
    const required=[...FIELDING_POSITIONS,...(rosterDhMode?['DH']:[])];
    const sorted=[...eligible].sort((a,b)=>scoreOf(b)-scoreOf(a));
    const posEligible=Object.fromEntries(required.map(pos=>[pos,sorted.filter(p=>profAt(p,pos)>0)]));
    // 最も候補が少ないポジションから埋める（MRV ヒューリスティック）
    const posOrder=[...required].sort((a,b)=>posEligible[a].length-posEligible[b].length);
    const assignment=new Map();
    const playerUsed=new Set();
    for(const pos of posOrder){
      const best=posEligible[pos].find(p=>!playerUsed.has(p.id));
      if(best){assignment.set(pos,best);playerUsed.add(best.id);}
    }
    // 全守備位置を埋めることを最優先: 適性なしでも残った選手を強制割り当て
    for(const pos of posOrder){
      if(assignment.has(pos))continue;
      const fallback=sorted.find(p=>!playerUsed.has(p.id));
      if(fallback){assignment.set(pos,fallback);playerUsed.add(fallback.id);}
    }
    // ラインアップを一括置換（重複なし・アトミック更新）
    const entries=[...assignment.entries()]
      .sort((a,b)=>scoreOf(b[1])-scoreOf(a[1]))
      .map(([pos,player])=>({id:player.id,pos}));
    onReplaceLineup&&onReplaceLineup(entries);
    setRosterRecs(buildRosterRecs(team));
  };
  const executeRec=(rec,idx)=>{
    if(rec.type==='demote'||rec.type==='swap')onDemo&&onDemo(rec.downPlayer.id);
    if(rec.type==='promote'||rec.type==='swap')onPromo&&onPromo(rec.upPlayer.id);
    setRosterRecs(prev=>prev?prev.filter((_,i)=>i!==idx):null);
  };
  const executeAllRecs=()=>{
    if(!rosterRecs?.length){setRosterRecs(null);return;}
    rosterRecs.filter(r=>r.downPlayer).forEach(r=>onDemo&&onDemo(r.downPlayer.id));
    rosterRecs.filter(r=>r.upPlayer).forEach(r=>onPromo&&onPromo(r.upPlayer.id));
    setRosterRecs(null);
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
        {[["batters","🏏 野手"],["pitchers","⚾ 投手・継投"],["farm","🌿 二軍"],["talk","💬 会話"]].map(([k,l])=>(
          <button key={k} onClick={()=>setView(k)} className={`tab ${view===k?"on":""}`} style={{flex:0,padding:"6px 14px"}}>{l}</button>
        ))}
        <span className="chip cy" style={{marginLeft:"auto",alignSelf:"center"}}>一軍 {team.players.length}/{MAX_ROSTER}</span>
        <span className="chip cb" style={{alignSelf:"center"}}>外国人 {team.players.filter(p=>p.isForeign).length}/{MAX_外国人_一軍}</span>
        {(()=>{const s=team.players.filter(p=>!p.育成).length+team.farm.filter(p=>!p.育成).length;const over=s>=MAX_SHIHAKA_TOTAL;return <span className="chip" style={{alignSelf:"center",background:over?"rgba(248,113,113,.15)":"rgba(52,211,153,.08)",border:`1px solid ${over?"rgba(248,113,113,.4)":"rgba(52,211,153,.25)"}`,color:over?"#f87171":"#94a3b8",fontSize:10}}>支配下 {s}/{MAX_SHIHAKA_TOTAL}</span>;})()}
      </div>
      {rosterRecs!==null&&(
        <div className="card" style={{marginBottom:10,borderColor:"rgba(99,102,241,.35)",background:"rgba(99,102,241,.04)"}}>
          <div className="card-h" style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{color:"#a5b4fc"}}>📋 編成レコメンド</span>
            {rosterRecs.length>0&&<button className="bsm bgb" style={{marginLeft:"auto"}} onClick={executeAllRecs}>▶ すべて実行</button>}
            <button className="bsm" style={{marginLeft:rosterRecs.length>0?0:"auto"}} onClick={()=>setRosterRecs(null)}>✕ 閉じる</button>
          </div>
          {rosterRecs.length===0&&<div style={{fontSize:11,color:"#6b7280",padding:"4px 0"}}>現在のロスターは最適です。改善推薦なし。</div>}
          {rosterRecs.map((rec,i)=>{
            const badge=rec.type==='promote'?{label:'昇格',bg:'rgba(52,211,153,.15)',border:'rgba(52,211,153,.4)',color:'#34d399'}
              :rec.type==='demote'?{label:'降格',bg:'rgba(248,113,113,.15)',border:'rgba(248,113,113,.4)',color:'#f87171'}
              :{label:'スワップ',bg:'rgba(245,200,66,.12)',border:'rgba(245,200,66,.35)',color:'#f5c842'};
            return(
              <div key={i} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 0",borderBottom:"1px solid rgba(30,58,95,.4)",fontSize:11,flexWrap:"wrap"}}>
                <span style={{fontSize:9,padding:"2px 6px",borderRadius:3,background:badge.bg,border:`1px solid ${badge.border}`,color:badge.color,flexShrink:0}}>{badge.label}</span>
                {rec.upPlayer&&<span style={{color:"#34d399"}}>↑ <span style={{fontWeight:600,cursor:"pointer"}} onClick={()=>onPlayerClick?.(rec.upPlayer,team.name)}>{rec.upPlayer.name}</span><span style={{fontSize:9,color:"#6b7280",marginLeft:2}}>{rec.upPlayer.pos}</span>{rec.upPlayer.isForeign&&<span className="chip cb" style={{marginLeft:3,fontSize:7}}>外</span>}</span>}
                {rec.type==='swap'&&<span style={{color:"#374151",fontSize:10}}>⇄</span>}
                {rec.downPlayer&&<span style={{color:"#f87171"}}>↓ <span style={{fontWeight:600,cursor:"pointer"}} onClick={()=>onPlayerClick?.(rec.downPlayer,team.name)}>{rec.downPlayer.name}</span><span style={{fontSize:9,color:"#6b7280",marginLeft:2}}>{rec.downPlayer.pos}</span></span>}
                {rec.scoreDiff>0&&<span style={{fontSize:9,color:"#f5c842",marginLeft:2}}>+{rec.scoreDiff}pt</span>}
                <button className="bsm bga" style={{marginLeft:"auto",fontSize:9}} onClick={()=>executeRec(rec,i)}>▶ 実行</button>
              </div>
            );
          })}
        </div>
      )}
      {view==="batters"&&(
        <div className="card">
          <div className="card-h" style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            <span>打線設定 ({team.lineup.length}/{lineupLimit})</span>
            <span style={{fontSize:10,color:"#6b7280",fontWeight:400}}>
              守備配置: {FIELDING_POSITIONS.map(pos=>`${pos.replace("手","")}:${posCountInLineup[pos]??0}`).join(" / ")}
              {rosterDhMode ? ` / DH:${posCountInLineup["DH"]??0}` : ""}
            </span>
            <div style={{display:"inline-flex",gap:4,marginLeft:8}}>
              <button className={`bsm ${!rosterDhMode?"bgb":""}`} onClick={()=>onSetRosterDhMode&&onSetRosterDhMode(false)}>DHなし</button>
              <button className={`bsm ${rosterDhMode?"bgb":""}`} onClick={()=>onSetRosterDhMode&&onSetRosterDhMode(true)}>DHあり</button>
            </div>
            <button className="bsm bgb" style={{marginLeft:"auto"}} onClick={autoSetLineup}>自動編成</button>
          </div>
          <div style={{overflowX:"auto"}}>
            <table className="tbl">
              <thead><tr><th>#</th><th>選手名</th><th>守備</th><th>適正</th><th>年齢</th><th>ミート</th><th>長打</th><th>走力</th><th>選球</th><th>クラッチ</th><th>変化球</th><th>状態</th><th>モラル</th><th>打率</th><th>HR</th><th>OPS</th><th>強化</th><th>コンバート</th><th></th></tr></thead>
              <tbody>
                {orderedBatters.map(p=>{const inL=team.lineup.includes(p.id);const sb=saberBatter(p.stats);const isInj=(p.injuryDaysLeft??0)>0;return(
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
                        {lineupSlots.map(n => (
                          <option key={n} value={n}>{n}番</option>
                        ))}
                      </select>
                      {inL&&(
                        <div style={{display:"flex",gap:2,marginTop:2}}>
                          <button className="bsm" style={{fontSize:9,padding:"1px 4px"}} onClick={()=>onSetLineupOrder&&onSetLineupOrder(p.id,Math.max(1,(liMap[p.id]??1)-1))}>↑</button>
                          <button className="bsm" style={{fontSize:9,padding:"1px 4px"}} onClick={()=>onSetLineupOrder&&onSetLineupOrder(p.id,Math.min(lineupLimit,(liMap[p.id]??1)+1))}>↓</button>
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
                        {POSITIONS.filter(pos => pos !== "DH" || rosterDhMode).map(pos => {
                          const n=posCountInLineup[pos]??0;
                          return (
                          <option key={pos} value={pos}>{pos}{n>0?` (${n})`:""}</option>
                        );})}
                      </select>
                      <div style={{fontSize:9,color:"#6b7280",marginTop:2}}>
                        {posCountInLineup[p.pos]>1&&team.lineup.includes(p.id)
                          ?(p.pos==="DH"?"⚠ DHは1人まで":"⚠ 同守備が重複")
                          :" "}
                      </div>
                    </td>
                    <td style={{minWidth:60}}>
                      {Object.entries(p.positions||{}).filter(([pos])=>pos!==p.pos).map(([pos,prof])=>{
                        const profColor=prof>=80?"#34d399":prof>=60?"#f5c842":"#f87171";
                        return <span key={pos} style={{display:"inline-block",fontSize:8,color:profColor,marginRight:2,whiteSpace:"nowrap"}}>{pos.replace("手","")}{Math.round(prof)}</span>;
                      })}
                      {p.convertTarget&&p.convertTarget!==p.pos&&(
                        <span style={{display:"block",fontSize:8,color:"#818cf8",marginTop:1}}>▶{p.convertTarget.replace("手","")}</span>
                      )}
                    </td>
                    <td className="mono" style={{color:"#374151"}}>{p.age}</td>
                    <td><OV v={p.batting.contact}/></td><td><OV v={p.batting.power}/></td><td><OV v={p.batting.speed}/></td><td><OV v={p.batting.eye}/></td>
                    <td><OV v={p.batting.clutch}/></td><td><OV v={p.batting.breakingBall}/></td>
                    <td><CondBadge p={p}/></td>
                    <td><MoralBadge v={p.morale}/></td>
                    <td className="mono">{fmtAvg(p.stats.H,p.stats.AB)}</td>
                    <td className="mono" style={{color:p.stats.HR>=20?"#f5c842":undefined}}>{p.stats.HR}</td>
                    <td className="mono" style={{color:sb.OPS>=.850?"#34d399":sb.OPS>=.700?"#f5c842":undefined}}>{sb.OPS>0?sb.OPS.toFixed(3):"---"}</td>
                    <td><select style={{fontSize:9,background:"#0d1b2a",color:"#94a3b8",border:"1px solid #1e3a5f",borderRadius:3,padding:"1px 2px"}} value={p.trainingFocus||""} onChange={e=>onSetTrainingFocus&&onSetTrainingFocus(p.id,e.target.value||null)}>{TRAINING_OPTIONS.filter(([k])=>!["velocity","control","breaking","stamina"].includes(k)).map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></td>
                    <td style={{minWidth:70}}>
                      <select style={{fontSize:9,background:"#0d1b2a",color:"#818cf8",border:"1px solid #1e3a5f",borderRadius:3,padding:"1px 2px"}} value={p.convertTarget||""} onChange={e=>onSetConvertTarget&&onSetConvertTarget(p.id,e.target.value||null)}>
                        <option value="">—</option>
                        {FIELDING_POSITIONS.filter(pos=>pos!==p.pos).map(pos=>{
                          const prof=p.positions?.[pos];
                          return <option key={pos} value={pos}>{pos.replace("手","")}{prof!=null?` ${Math.round(prof)}`:" 新"}</option>;
                        })}
                      </select>
                    </td>
                    <td><button className="bsm bgr" onClick={()=>onDemo(p.id)}>↓</button></td>
                  </tr>
                );})}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {view==="pitchers"&&(()=>{
        const pattern=team.pitchingPattern??{closerId:null,setupId:null,seventhId:null,middleOrder:[]};
        const rotPitchers=team.rotation.map(id=>team.players.find(p=>p.id===id)).filter(Boolean);
        const nonRotPitchers=pitchers.filter(p=>!team.rotation.includes(p.id));
        const closerP=pitchers.find(p=>p.id===pattern.closerId);
        const setupP=pitchers.find(p=>p.id===pattern.setupId);
        const seventhP=pitchers.find(p=>p.id===pattern.seventhId);
        const middleOrder=pattern.middleOrder??[];
        const designatedIds=new Set([pattern.closerId,pattern.setupId,pattern.seventhId].filter(Boolean));
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
        const rowStyle={display:"flex",alignItems:"center",gap:6,padding:"5px 0",borderBottom:"1px solid rgba(30,58,95,.4)"};
        const btnSm={fontSize:10,padding:"1px 6px",borderRadius:3,cursor:"pointer",background:"rgba(30,58,95,.6)",border:"1px solid #1e3a5f",color:"#94a3b8"};
        const cardStyle={background:"rgba(14,27,46,.6)",border:"1px solid #1e3a5f",borderRadius:6,padding:"10px 12px",flex:1,minWidth:160};
        const PitcherStatRow=({p})=>{
          const sp=saberPitcher(p.stats);
          return(
            <div style={{display:"flex",gap:10,fontSize:10,marginTop:4,flexWrap:"wrap"}}>
              <span style={{color:"#94a3b8"}}>球速</span><span style={{color:"#e0d4bf",fontFamily:"monospace"}}>{p.pitching?.velocity??50}</span>
              <span style={{color:"#94a3b8"}}>制球</span><span style={{color:"#e0d4bf",fontFamily:"monospace"}}>{p.pitching?.control??50}</span>
              <span style={{color:"#94a3b8"}}>変化</span><span style={{color:"#e0d4bf",fontFamily:"monospace"}}>{p.pitching?.breaking??50}</span>
              <span style={{color:"#94a3b8"}}>Cond</span><span style={{color:(p.condition??70)>=80?"#34d399":(p.condition??70)>=60?"#f5c842":"#f87171",fontFamily:"monospace"}}>{p.condition??70}</span>
              <span style={{color:"#94a3b8"}}>ERA</span><span style={{color:sp.ERA>0&&sp.ERA<3?"#34d399":sp.ERA<4?"#f5c842":sp.ERA>0?"#f87171":"#374151",fontFamily:"monospace"}}>{sp.ERA>0?sp.ERA:"---"}</span>
              <span style={{color:"#94a3b8"}}>WHIP</span><span style={{color:sp.WHIP>0&&sp.WHIP<1.0?"#34d399":sp.WHIP<1.3?"#f5c842":sp.WHIP>0?"#94a3b8":"#374151",fontFamily:"monospace"}}>{sp.WHIP>0?sp.WHIP:"---"}</span>
            </div>
          );
        };
        return(
          <div>
            {/* 先発ローテーション */}
            <div className="card" style={{marginBottom:8}}>
              <div className="card-h">先発ローテーション ({rotPitchers.length}/6)</div>
              {rotPitchers.map((p,i)=>{
                const sp=saberPitcher(p.stats);
                return(
                  <div key={p.id} style={{...rowStyle,flexWrap:"wrap"}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,width:"100%"}}>
                      <span style={{fontSize:10,color:"#374151",width:16,textAlign:"right"}}>{i+1}</span>
                      <span style={{flex:1,fontWeight:600,fontSize:12,cursor:"pointer",color:"#60a5fa"}} onClick={()=>onPlayerClick?.(p,team.name)}>{p.name}<HandBadge p={p}/>{(p.injuryDaysLeft??0)>0&&<span style={{marginLeft:4,fontSize:9,color:"#f87171"}}>🤕{p.injuryDaysLeft}</span>}</span>
                      <span style={{fontSize:9,color:"#374151"}}>{p.subtype}</span>
                      <span style={{fontSize:9,color:"#94a3b8"}}>St</span><span style={{fontSize:11,color:"#f5c842",fontFamily:"monospace"}}>{p.pitching?.stamina??50}</span>
                      <button style={btnSm} onClick={()=>onMoveRotation&&onMoveRotation(p.id,-1)} disabled={i===0}>↑</button>
                      <button style={btnSm} onClick={()=>onMoveRotation&&onMoveRotation(p.id,1)} disabled={i===rotPitchers.length-1}>↓</button>
                      <button style={{...btnSm,color:"#f87171"}} onClick={()=>onRemoveFromRotation&&onRemoveFromRotation(p.id)}>✕</button>
                      <button className="bsm bgr" onClick={()=>onDemo(p.id)}>↓二軍</button>
                    </div>
                    <div style={{paddingLeft:22,width:"100%",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                      <span style={{fontSize:9,color:"#94a3b8"}}>球速</span><span style={{fontSize:10,color:"#e0d4bf",fontFamily:"monospace"}}>{p.pitching?.velocity??50}</span>
                      <span style={{fontSize:9,color:"#94a3b8"}}>制球</span><span style={{fontSize:10,color:"#e0d4bf",fontFamily:"monospace"}}>{p.pitching?.control??50}</span>
                      <span style={{fontSize:9,color:"#94a3b8"}}>変化</span><span style={{fontSize:10,color:"#e0d4bf",fontFamily:"monospace"}}>{p.pitching?.breaking??50}</span>
                      <span style={{fontSize:9,color:"#94a3b8"}}>ERA</span><span style={{fontSize:10,color:sp.ERA>0&&sp.ERA<3?"#34d399":sp.ERA<4?"#f5c842":sp.ERA>0?"#f87171":"#374151",fontFamily:"monospace"}}>{sp.ERA>0?sp.ERA:"---"}</span>
                      <span style={{fontSize:9,color:"#94a3b8"}}>WHIP</span><span style={{fontSize:10,color:sp.WHIP>0&&sp.WHIP<1.0?"#34d399":sp.WHIP<1.3?"#f5c842":sp.WHIP>0?"#94a3b8":"#374151",fontFamily:"monospace"}}>{sp.WHIP>0?sp.WHIP:"---"}</span>
                      <span style={{fontSize:9,color:"#94a3b8"}}>{p.stats.W}勝{p.stats.L}敗</span>
                      <select style={{fontSize:9,background:"#0d1b2a",color:"#94a3b8",border:"1px solid #1e3a5f",borderRadius:3,padding:"1px 2px"}} value={p.trainingFocus||""} onChange={e=>onSetTrainingFocus&&onSetTrainingFocus(p.id,e.target.value||null)}>{TRAINING_OPTIONS.filter(([k])=>!["contact","power","eye","speed","arm","defense"].includes(k)).map(([k,l])=><option key={k} value={k}>{l}</option>)}</select>
                    </div>
                  </div>
                );
              })}
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
            {/* 継投 */}
            <div className="card" style={{marginBottom:8}}>
              <div className="card-h">継投</div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {[
                  {key:"closerId",label:"🔒 抑え（9回）",current:closerP,disabledIds:[pattern.setupId,pattern.seventhId]},
                  {key:"setupId",label:"⚙️ セットアッパー（8回）",current:setupP,disabledIds:[pattern.closerId,pattern.seventhId]},
                  {key:"seventhId",label:"🌉 7回担当",current:seventhP,disabledIds:[pattern.closerId,pattern.setupId]},
                ].map(({key,label,current,disabledIds})=>(
                  <div key={key} style={cardStyle}>
                    <div style={{fontSize:9,color:"#374151",marginBottom:4,letterSpacing:".1em"}}>{label}</div>
                    <select style={{fontSize:11,background:"#0d1b2a",color:"#e0d4bf",border:"1px solid #1e3a5f",borderRadius:3,padding:"3px 6px",width:"100%"}}
                      value={pattern[key]??""} onChange={e=>onSetPitchingPattern&&onSetPitchingPattern({[key]:e.target.value||null})}>
                      <option value="">指名なし（自動）</option>
                      {pitchers.map(p=><option key={p.id} value={p.id} disabled={disabledIds.includes(p.id)}>{p.name}（{p.subtype}）</option>)}
                    </select>
                    {current&&(
                      <>
                        <PitcherStatRow p={current}/>
                        <div style={{marginTop:4,display:"flex",alignItems:"center",gap:6}}>
                          <span style={{fontSize:9,color:"#94a3b8"}}>強化</span>
                          <select style={{fontSize:9,background:"#0d1b2a",color:"#94a3b8",border:"1px solid #1e3a5f",borderRadius:3,padding:"1px 2px"}} value={current.trainingFocus||""} onChange={e=>onSetTrainingFocus&&onSetTrainingFocus(current.id,e.target.value||null)}>{TRAINING_OPTIONS.filter(([k])=>!["contact","power","eye","speed","arm","defense"].includes(k)).map(([k,l])=><option key={k} value={k}>{l}</option>)}</select>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
            {/* その他中継ぎ投手 */}
            <div className="card">
              <div className="card-h">その他中継ぎ投手 <span style={{fontSize:9,color:"#374151",fontWeight:400}}>（上から順に登板 / リスト外はスコア自動選択）</span></div>
              {orderedBullpen.map((p,i)=>{
                const inOrder=middleOrder.includes(p.id);
                const isDesignated=designatedIds.has(p.id);
                const orderIdx=middleOrder.indexOf(p.id);
                const sp=saberPitcher(p.stats);
                const designLabel=p.id===pattern.closerId?"抑え指名":p.id===pattern.setupId?"8回指名":p.id===pattern.seventhId?"7回指名":null;
                return(
                  <div key={p.id} style={{...rowStyle,flexWrap:"wrap",opacity:isDesignated?0.5:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,width:"100%"}}>
                      <span style={{fontSize:10,color:inOrder?"#f5c842":"#374151",width:16,textAlign:"right",fontFamily:"monospace"}}>{inOrder?orderIdx+1:"—"}</span>
                      <span style={{flex:1,fontWeight:600,fontSize:12,cursor:"pointer",color:"#60a5fa"}} onClick={()=>onPlayerClick?.(p,team.name)}>{p.name}<HandBadge p={p}/>{(p.injuryDaysLeft??0)>0&&<span style={{marginLeft:4,fontSize:9,color:"#f87171"}}>🤕{p.injuryDaysLeft}</span>}</span>
                      <span style={{fontSize:9,color:"#374151"}}>{p.subtype}</span>
                      {designLabel&&<span style={{fontSize:9,color:"#f5c842",background:"rgba(245,200,66,.1)",padding:"1px 5px",borderRadius:3}}>{designLabel}</span>}
                      {!isDesignated&&(<>
                        {inOrder?(
                          <>
                            <button style={btnSm} onClick={()=>moveMiddle(p.id,-1)} disabled={orderIdx===0}>↑</button>
                            <button style={btnSm} onClick={()=>moveMiddle(p.id,1)} disabled={orderIdx===middleOrder.length-1}>↓</button>
                            <button style={{...btnSm,color:"#f87171"}} onClick={()=>removeFromMiddle(p.id)}>✕</button>
                          </>
                        ):(
                          <button style={{...btnSm,color:"#34d399"}} onClick={()=>addToMiddle(p.id)}>＋優先</button>
                        )}
                        <button className="bsm bgr" onClick={()=>onDemo(p.id)}>↓二軍</button>
                      </>)}
                    </div>
                    {!isDesignated&&(
                      <div style={{paddingLeft:22,width:"100%",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                        <span style={{fontSize:9,color:"#94a3b8"}}>球速</span><span style={{fontSize:10,color:"#e0d4bf",fontFamily:"monospace"}}>{p.pitching?.velocity??50}</span>
                        <span style={{fontSize:9,color:"#94a3b8"}}>制球</span><span style={{fontSize:10,color:"#e0d4bf",fontFamily:"monospace"}}>{p.pitching?.control??50}</span>
                        <span style={{fontSize:9,color:"#94a3b8"}}>ERA</span><span style={{fontSize:10,color:sp.ERA>0&&sp.ERA<3?"#34d399":sp.ERA<4?"#f5c842":sp.ERA>0?"#f87171":"#374151",fontFamily:"monospace"}}>{sp.ERA>0?sp.ERA:"---"}</span>
                        <span style={{fontSize:9,color:"#94a3b8"}}>WHIP</span><span style={{fontSize:10,color:sp.WHIP>0&&sp.WHIP<1.0?"#34d399":sp.WHIP<1.3?"#f5c842":sp.WHIP>0?"#94a3b8":"#374151",fontFamily:"monospace"}}>{sp.WHIP>0?sp.WHIP:"---"}</span>
                        <select style={{fontSize:9,background:"#0d1b2a",color:"#94a3b8",border:"1px solid #1e3a5f",borderRadius:3,padding:"1px 2px"}} value={p.trainingFocus||""} onChange={e=>onSetTrainingFocus&&onSetTrainingFocus(p.id,e.target.value||null)}>{TRAINING_OPTIONS.filter(([k])=>!["contact","power","eye","speed","arm","defense"].includes(k)).map(([k,l])=><option key={k} value={k}>{l}</option>)}</select>
                      </div>
                    )}
                  </div>
                );
              })}
              {orderedBullpen.length===0&&<div style={{color:"#374151",fontSize:11,padding:"8px 0"}}>ブルペン投手なし</div>}
            </div>
          </div>
        );
      })()}
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
