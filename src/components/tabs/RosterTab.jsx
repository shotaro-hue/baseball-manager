import React, { useState } from "react";
import { MobileRoster } from '../MobileRoster';
import { MAX_ROSTER, MAX_外国人_一軍, MAX_SHIHAKA_TOTAL, DEV_GOALS_BATTER, DEV_GOALS_PITCHER, TALK_COOLDOWN_DAYS, POSITIONS, FIELDING_POSITIONS } from '../../constants';
import { fmtAvg, fmtEra } from '../../utils';
import { saberBatter, saberPitcher } from '../../engine/sabermetrics';
import { OV, CondBadge, HandBadge } from '../ui';
import {
  buildAutoLineupEntries as buildPolicyLineupEntries,
  buildAutoPitchingStaff,
  buildFullRosterPlan,
  buildRosterRecs as buildPolicyRosterRecs,
  DEFAULT_ROSTER_AUTOMATION_MODE,
  ROSTER_AUTOMATION_MODES,
} from '../../engine/rosterAutomation';
import {
  MANAGEMENT_POLICIES,
  MANAGEMENT_POLICY_ORDER,
  createManagementLeagueContext,
  evaluateBatterForPolicy,
  getManagementPolicy,
  getManagementTrait,
} from '../../engine/managementPolicy';
import {
  MIN_OFFICIAL_BATTED_BALLS,
  stableSort,
} from '../../engine/analysisComparison';

const TALK_OPTIONS = [
  { type: "praise",       label: "💪 激励する",      desc: "モラル +5〜+15（確実）" },
  { type: "playing_time", label: "⚾ 出場について",   desc: "出場少→+8〜+15 / 多→+3〜+8" },
  { type: "contract",     label: "💴 契約について",   desc: "低給→+5〜+12 / 適正→+2〜+6" },
  { type: "trade_rumor",  label: "🤫 噂を否定する",   desc: "海外志向→-5〜+3 / その他→+2〜+8" },
];

const TRAINING_OPTIONS=[["","バランス"],["contact","ミート"],["power","長打"],["eye","選球"],["speed","走力"],["arm","肩"],["defense","守備"],["velocity","球速"],["control","制球"],["breaking","変化球"],["stamina","スタミナ"]];

const MoralBadge=({v})=>{const m=v||70;const icon=m>=75?"😊":m>=50?"😐":"😟";const col=m>=75?"#14714b":m>=50?"#805700":"#b42332";return <span style={{fontSize:14,color:col}}>{icon}{m}</span>;};

export function RosterTab({team,allTeams,onReplaceLineup,onSetLineupOrder,onSetRosterDhMode,onSetPlayerPosition,onSetStarter,onPromo,onDemo,onSetTrainingFocus,onConvertIkusei,onMoveRotation,onRemoveFromRotation,onSetPitchingPattern,onReplaceRotation,onApplyRosterPlan,onPlayerClick,onSetDevGoal,onPlayerTalk,onSetConvertTarget,onSetManagementPolicy,onSetRosterAutomationMode,gameDay}){
  const [view,setView]=useState("batters");
  const [justConverted,setJustConverted]=useState(new Set());
  const [talkingPid,setTalkingPid]=useState(null);
  const [rosterRecs,setRosterRecs]=useState(null);
  const [pendingRosterPlan,setPendingRosterPlan]=useState(null);
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
  const rosterDhMode = team.rosterDhMode ?? team.dhEnabled;
  const activeFielding = rosterDhMode ? (team.fieldingDh || {}) : (team.fieldingNoDh || {});
  const lineupPlayers=team.lineup.map(id=>{
    const player=batters.find(p=>p.id===id);
    if(!player)return null;
    const assignedPos=activeFielding[id]||player.pos;
    return assignedPos===player.pos?player:{...player,pos:assignedPos};
  }).filter(Boolean);
  const posCountInLineup=lineupPlayers.reduce((acc,p)=>{acc[p.pos]=(acc[p.pos]??0)+1;return acc;},{});
  const injured=team.players.filter(p=>(p.injuryDaysLeft??0)>0);
  const rosterAutomationMode = team.rosterAutomationMode ?? DEFAULT_ROSTER_AUTOMATION_MODE;
  const policy = getManagementPolicy(team);
  const trait = getManagementTrait(team);
  const leagueContext = createManagementLeagueContext(allTeams, team);
  const policyEvaluations = Object.fromEntries(
    batters.map((player) => [
      player.id,
      evaluateBatterForPolicy(player, team, { teams: allTeams, leagueContext }),
    ]),
  );
  const leagueEvRows = stableSort(
    (allTeams || [])
      .filter((entry) => entry.league === team.league)
      .flatMap((entry) => (entry.players || []).filter((player) => !player.isPitcher))
      .map((player) => {
        const profile = player.stats?.battedBallProfile || {};
        return {
          playerId: player.id,
          count: Number(profile.bip) || 0,
          value: Number(profile.evN) > 0 ? Number(profile.evSum) / Number(profile.evN) : null,
        };
      })
      .filter((row) => row.count >= MIN_OFFICIAL_BATTED_BALLS && row.value != null),
    (row) => row.value,
    'desc',
  );
  const leagueEvTopPercent = Object.fromEntries(
    leagueEvRows.map((row, index) => [
      row.playerId,
      Math.max(1, Math.ceil(((index + 1) / leagueEvRows.length) * 100)),
    ]),
  );
  const lineupLimit = rosterDhMode ? 9 : 8;
  const lineupSlots = Array.from({ length: lineupLimit }, (_, i) => i + 1);
  const autoSetLineup=()=>{
    setPendingRosterPlan(null);
    const entries=buildPolicyLineupEntries(team,{rosterDhMode,teams:allTeams,leagueContext});
    onReplaceLineup&&onReplaceLineup(entries);
    setRosterRecs(buildPolicyRosterRecs(team,{teams:allTeams,leagueContext}));
  };
  const autoSetPitcherLineup=()=>{
    setPendingRosterPlan(null);
    const {rotation,pitchingPattern}=buildAutoPitchingStaff(team);
    onReplaceRotation&&onReplaceRotation(rotation,pitchingPattern);
    setRosterRecs(buildPolicyRosterRecs(team,{teams:allTeams,leagueContext}));
  };
  const autoSetFullRoster=()=>{
    const plan=buildFullRosterPlan(team,{rosterDhMode,teams:allTeams,leagueContext});
    setPendingRosterPlan(plan);
    setRosterRecs(plan.changes);
  };
  const executeRec=(rec,idx)=>{
    if(rec.type==='demote'||rec.type==='swap')onDemo&&onDemo(rec.downPlayer.id);
    if(rec.type==='promote'||rec.type==='swap')onPromo&&onPromo(rec.upPlayer.id);
    setRosterRecs(prev=>prev?prev.filter((_,i)=>i!==idx):null);
  };
  const executeAllRecs=()=>{
    if(pendingRosterPlan){
      onApplyRosterPlan&&onApplyRosterPlan(pendingRosterPlan.team);
      setPendingRosterPlan(null);
      setRosterRecs(null);
      return;
    }
    if(!rosterRecs?.length){setRosterRecs(null);return;}
    rosterRecs.filter(r=>r.downPlayer).forEach(r=>onDemo&&onDemo(r.downPlayer.id));
    rosterRecs.filter(r=>r.upPlayer).forEach(r=>onPromo&&onPromo(r.upPlayer.id));
    setRosterRecs(null);
  };
  return(
    <div>
      <MobileRoster team={team} onPlayerClick={onPlayerClick} onReplaceLineup={onReplaceLineup} onSetLineupOrder={onSetLineupOrder} onSetRosterDhMode={onSetRosterDhMode}/>
      <details className="roster-full-settings calm-detail">
      <summary>詳細な編成・育成設定</summary>
      <div className="card" style={{marginBottom:10,borderColor:"rgba(96,165,250,.28)",background:"rgba(30,64,175,.06)"}}>
        <div className="card-h" style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          <span>🧭 起用方針</span>
          <span className="chip cb">{policy.label}</span>
          <span className="chip" style={{color:"#7050ad",background:"rgba(139,92,246,.1)"}}>特徴: {trait.label}</span>
          <span style={{marginLeft:"auto",fontSize:14,color:"#53657c"}}>見切り目安 {policy.patiencePa}打席</span>
        </div>
        <input
          type="range"
          min="0"
          max={MANAGEMENT_POLICY_ORDER.length-1}
          step="1"
          value={MANAGEMENT_POLICY_ORDER.indexOf(policy.id)}
          onChange={(event)=>onSetManagementPolicy?.(MANAGEMENT_POLICY_ORDER[Number(event.target.value)])}
          aria-label="起用方針"
          style={{width:"100%",accentColor:"#095cc7"}}
        />
        <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:3,fontSize:14,color:"#53657c",textAlign:"center"}}>
          {MANAGEMENT_POLICY_ORDER.map((id)=><span key={id} style={{color:id===policy.id?"#095cc7":"#53657c"}}>{MANAGEMENT_POLICIES[id].label}</span>)}
        </div>
        <div style={{marginTop:8,fontSize:14,color:"#334962"}}>{policy.short}</div>
        <div style={{marginTop:5,fontSize:14,color:"#53657c"}}>
          成績 {policy.weights.season}% / 直近 {policy.weights.recent}% / 打球 {policy.weights.battedBall}% / 能力 {policy.weights.ability}% / 守備 {policy.weights.defense}% / 将来性 {policy.weights.future}%
        </div>
        {team.managementMeta?.lastDecision&&<div style={{marginTop:5,fontSize:14,color:"#7050ad"}}>前回判断: {team.managementMeta.lastDecision}</div>}
        <div style={{display:"flex",alignItems:"center",flexWrap:"wrap",gap:8,marginTop:9,paddingTop:8,borderTop:"1px solid rgba(96,165,250,.15)"}}>
          <span style={{fontSize:14,color:"#53657c"}}>編成モード</span>
          <select
            value={rosterAutomationMode}
            onChange={(event)=>onSetRosterAutomationMode?.(event.target.value)}
            style={{background:"#fff",color:"#334962",border:"1px solid #c5d8ed",borderRadius:4,padding:"3px 6px",fontSize:14}}
            aria-label="編成モード"
          >
            <option value={ROSTER_AUTOMATION_MODES.MANUAL}>手動（不正編成なら進行停止）</option>
            <option value={ROSTER_AUTOMATION_MODES.EMERGENCY}>緊急補充（負傷時だけ）</option>
            <option value={ROSTER_AUTOMATION_MODES.FULL}>フル自動（定期最適化）</option>
          </select>
          <span style={{fontSize:14,color:"#53657c"}}>
            {rosterAutomationMode===ROSTER_AUTOMATION_MODES.MANUAL
              ?"自動昇降格なし"
              :rosterAutomationMode===ROSTER_AUTOMATION_MODES.FULL
                ?"負傷補充＋定期的な最適化"
                :"負傷者の枠だけ1対1で補充"}
          </span>
        </div>
      </div>
      {injured.length>0&&(
        <div className="card" style={{marginBottom:8,background:"rgba(248,113,113,.06)",border:"1px solid rgba(248,113,113,.2)"}}>
          <div className="card-h" style={{color:"#b42332"}}>🤕 負傷者リスト ({injured.length}人)</div>
          {injured.map(p=>(
            <div key={p.id} style={{fontSize:14,padding:"3px 0",color:"#53657c",display:"flex",justifyContent:"space-between"}}>
              <span><span style={{cursor:"pointer",color:"#095cc7"}} onClick={()=>onPlayerClick?.(p,team.name)}>{p.name}</span> <span style={{color:"#b42332"}}>[{p.injury}]</span></span>
              <span>残{p.injuryDaysLeft}試合</span>
            </div>
          ))}
        </div>
      )}
      <div className="detail-roster-toolbar">
        {[["batters","🏏 野手"],["pitchers","⚾ 投手・継投"],["farm","🌿 二軍"],["talk","💬 会話"]].map(([k,l])=>(
          <button key={k} onClick={()=>setView(k)} aria-pressed={view===k} className={`tab ${view===k?"on":""}`} style={{flex:0,padding:"6px 14px"}}>{l}</button>
        ))}
        <span className="chip cy" style={{marginLeft:"auto",alignSelf:"center"}}>一軍 {team.players.length}/{MAX_ROSTER}</span>
        <span className="chip cb" style={{alignSelf:"center"}}>外国人 {team.players.filter(p=>p.isForeign).length}/{MAX_外国人_一軍}</span>
        {(()=>{const s=team.players.filter(p=>!p.育成).length+team.farm.filter(p=>!p.育成).length;const over=s>=MAX_SHIHAKA_TOTAL;return <span className="chip" style={{alignSelf:"center",background:over?"rgba(248,113,113,.15)":"rgba(52,211,153,.08)",border:`1px solid ${over?"rgba(248,113,113,.4)":"rgba(52,211,153,.25)"}`,color:over?"#b42332":"#53657c",fontSize:14}}>支配下 {s}/{MAX_SHIHAKA_TOTAL}</span>;})()}
        <button className="bsm bgb" style={{alignSelf:"center",fontSize:14,padding:"5px 10px"}} onClick={autoSetFullRoster}>🔄 一括自動編成を確認</button>
      </div>
      {rosterRecs!==null&&(
        <div className="card" style={{marginBottom:10,borderColor:"rgba(99,102,241,.35)",background:"rgba(99,102,241,.04)"}}>
          <div className="card-h" style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{color:"#7050ad"}}>📋 編成レコメンド</span>
            {(rosterRecs.length>0||pendingRosterPlan)&&<button className="bsm bgb" style={{marginLeft:"auto",opacity:pendingRosterPlan&&!pendingRosterPlan.validation.valid?0.55:1}} disabled={Boolean(pendingRosterPlan&&!pendingRosterPlan.validation.valid)} onClick={executeAllRecs}>▶ {pendingRosterPlan?"プランを一括反映":"すべて実行"}</button>}
            <button className="bsm" style={{marginLeft:rosterRecs.length>0?0:"auto"}} onClick={()=>{setRosterRecs(null);setPendingRosterPlan(null);}}>✕ 閉じる</button>
          </div>
          {rosterRecs.length===0&&<div style={{fontSize:14,color:"#53657c",padding:"4px 0"}}>現在のロスターは最適です。改善推薦なし。</div>}
          {pendingRosterPlan&&(
            <div style={{fontSize:14,color:pendingRosterPlan.validation.valid?"#14714b":"#b42332",marginBottom:6}}>
              {pendingRosterPlan.validation.valid
                ?"制約検証OK：登録・守備・打順・投手役割を一括反映できます。"
                :`反映不可：${pendingRosterPlan.validation.errors.join(" / ")}`}
              {pendingRosterPlan.validation.warnings.length>0&&<div style={{color:"#805700",marginTop:2}}>注意: {pendingRosterPlan.validation.warnings.join(" / ")}</div>}
            </div>
          )}
          {rosterRecs.map((rec,i)=>{
            const badge=rec.type==='promote'?{label:'昇格',bg:'rgba(52,211,153,.15)',border:'rgba(52,211,153,.4)',color:'#14714b'}
              :rec.type==='demote'?{label:'降格',bg:'rgba(248,113,113,.15)',border:'rgba(248,113,113,.4)',color:'#b42332'}
              :{label:'スワップ',bg:'rgba(245,200,66,.12)',border:'rgba(245,200,66,.35)',color:'#805700'};
            return(
              <div key={i} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 0",borderBottom:"1px solid rgba(30,58,95,.4)",fontSize:14,flexWrap:"wrap"}}>
                <span style={{fontSize:14,padding:"2px 6px",borderRadius:3,background:badge.bg,border:`1px solid ${badge.border}`,color:badge.color,flexShrink:0}}>{badge.label}</span>
                {rec.upPlayer&&<span style={{color:"#14714b"}}>↑ <span style={{fontWeight:600,cursor:"pointer"}} onClick={()=>onPlayerClick?.(rec.upPlayer,team.name)}>{rec.upPlayer.name}</span><span style={{fontSize:14,color:"#53657c",marginLeft:2}}>{rec.upPlayer.pos}</span>{rec.upPlayer.isForeign&&<span className="chip cb" style={{marginLeft:3,fontSize:14}}>外</span>}</span>}
                {rec.type==='swap'&&<span style={{color:"#53657c",fontSize:14}}>⇄</span>}
                {rec.downPlayer&&<span style={{color:"#b42332"}}>↓ <span style={{fontWeight:600,cursor:"pointer"}} onClick={()=>onPlayerClick?.(rec.downPlayer,team.name)}>{rec.downPlayer.name}</span><span style={{fontSize:14,color:"#53657c",marginLeft:2}}>{rec.downPlayer.pos}</span></span>}
                {rec.scoreDiff>0&&<span style={{fontSize:14,color:"#805700",marginLeft:2}}>+{rec.scoreDiff}pt</span>}
                {rec.reasons?.length>0&&<span style={{fontSize:14,color:"#53657c"}}>{rec.reasons.join(" / ")}</span>}
                {!pendingRosterPlan&&<button className="bsm bga" style={{marginLeft:"auto",fontSize:14}} onClick={()=>executeRec(rec,i)}>▶ 実行</button>}
              </div>
            );
          })}
        </div>
      )}
      {view==="batters"&&(
        <div className="card">
          <div className="card-h" style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            <span>
              {rosterDhMode
                ? `打線設定 (${team.lineup.length}/${lineupLimit})`
                : `打線設定 (野手${team.lineup.length}/${lineupLimit}・9番は当日先発投手)`}
            </span>
            <span style={{fontSize:14,color:"#53657c",fontWeight:400}}>
              守備配置: {FIELDING_POSITIONS.map(pos=>`${pos.replace("手","")}:${posCountInLineup[pos]??0}`).join(" / ")}
              {rosterDhMode ? ` / DH:${posCountInLineup["DH"]??0}` : ""}
            </span>
            <div style={{display:"inline-flex",gap:4,marginLeft:8}}>
              <button className={`bsm ${!rosterDhMode?"bgb":""}`} onClick={()=>onSetRosterDhMode&&onSetRosterDhMode(false)}>DHなし</button>
              <button className={`bsm ${rosterDhMode?"bgb":""}`} onClick={()=>onSetRosterDhMode&&onSetRosterDhMode(true)}>DHあり</button>
            </div>
            <button className="bsm bgb" style={{marginLeft:"auto"}} onClick={autoSetLineup}>自動編成</button>
          </div>
          <div className="detail-table-scroll" tabIndex={0} role="region" aria-label="成績一覧。横にスクロールできます">
            <table className="tbl detail-lineup-table">
              <thead><tr><th>#</th><th>選手名</th><th>守備</th><th>適正</th><th>年齢</th><th>方針評価</th><th>リーグ打球</th><th>ミート</th><th>長打</th><th>走力</th><th>選球</th><th>クラッチ</th><th>変化球</th><th>状態</th><th>調子</th><th>モラル</th><th>打率</th><th>HR</th><th>OPS</th><th>強化</th><th>コンバート</th><th></th></tr></thead>
              <tbody>
                {orderedBatters.map(p=>{const inL=team.lineup.includes(p.id);const sb=saberBatter(p.stats);const isInj=(p.injuryDaysLeft??0)>0;return(
                  <tr key={p.id} style={isInj?{opacity:.55}:undefined}>
                    <td>
                      <select
                        value={inL ? liMap[p.id] : 0}
                        disabled={isInj}
                        style={{
                          fontSize:14,
                          background: "#fff",
                          color: inL ? "#095cc7" : "#53657c",
                          border: "1px solid #c5d8ed",
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
                          <button className="bsm" style={{fontSize:14,padding:"1px 4px"}} onClick={()=>onSetLineupOrder&&onSetLineupOrder(p.id,Math.max(1,(liMap[p.id]??1)-1))}>↑</button>
                          <button className="bsm" style={{fontSize:14,padding:"1px 4px"}} onClick={()=>onSetLineupOrder&&onSetLineupOrder(p.id,Math.min(lineupLimit,(liMap[p.id]??1)+1))}>↓</button>
                        </div>
                      )}
                    </td>
                    <td style={{fontWeight:inL?700:400,cursor:"pointer"}} onClick={()=>onPlayerClick?.(p,team.name)}><span style={{color:inL?"#095cc7":"#095cc7"}}>{p.name}</span>{p.isForeign&&<span className="chip cb" style={{marginLeft:4,fontSize:14}}>外</span>}{isInj&&<span style={{marginLeft:4,fontSize:14,color:"#b42332"}}>🤕{p.injuryDaysLeft}</span>}</td>
                    <td>
                      <select
                        value={(inL?activeFielding[p.id]:null)||p.pos||""}
                        style={{
                          fontSize:14,
                          background: "#fff",
                          color: "#53657c",
                          border: "1px solid #c5d8ed",
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
                      <div style={{fontSize:14,color:"#53657c",marginTop:2}}>
                        {posCountInLineup[(inL?activeFielding[p.id]:null)||p.pos]>1&&team.lineup.includes(p.id)
                          ?(((inL?activeFielding[p.id]:null)||p.pos)==="DH"?"⚠ DHは1人まで":"⚠ 同守備が重複")
                          :" "}
                      </div>
                    </td>
                    <td style={{minWidth:60}}>
                      {Object.entries(p.positions||{}).filter(([pos])=>pos!==p.pos).map(([pos,prof])=>{
                        const profColor=prof>=80?"#14714b":prof>=60?"#805700":"#b42332";
                        return <span key={pos} style={{display:"inline-block",fontSize:14,color:profColor,marginRight:2,whiteSpace:"nowrap"}}>{pos.replace("手","")}{Math.round(prof)}</span>;
                      })}
                      {p.convertTarget&&p.convertTarget!==p.pos&&(
                        <span style={{display:"block",fontSize:14,color:"#7050ad",marginTop:1}}>▶{p.convertTarget.replace("手","")}</span>
                      )}
                    </td>
                    <td className="mono" style={{color:"#53657c"}}>{p.age}</td>
                    <td title={policyEvaluations[p.id]?.reasons?.join(" / ")} style={{color:(policyEvaluations[p.id]?.total??50)>=60?"#14714b":(policyEvaluations[p.id]?.total??50)<45?"#b42332":"#805700",fontWeight:700}}>
                      {Math.round(policyEvaluations[p.id]?.total??50)}
                    </td>
                    <td style={{color:(leagueEvTopPercent[p.id]??101)<=25?"#14714b":"#53657c",fontSize:14,whiteSpace:"nowrap"}}>
                      {leagueEvTopPercent[p.id]?`上位${leagueEvTopPercent[p.id]}%`:"N不足"}
                    </td>
                    <td><OV v={p.batting.contact}/></td><td><OV v={p.batting.power}/></td><td><OV v={p.batting.speed}/></td><td><OV v={p.batting.eye}/></td>
                    <td><OV v={p.batting.clutch}/></td><td><OV v={p.batting.breakingBall}/></td>
                    <td><CondBadge p={p}/></td>
                    <td className="mono" style={{color:(p.form??50)>=58?"#14714b":(p.form??50)<=42?"#b42332":"#53657c"}}>{Math.round(p.form??50)}</td>
                    <td><MoralBadge v={p.morale}/></td>
                    <td className="mono">{fmtAvg(p.stats.H,p.stats.AB)}</td>
                    <td className="mono" style={{color:p.stats.HR>=20?"#805700":undefined}}>{p.stats.HR}</td>
                    <td className="mono" style={{color:sb.OPS>=.850?"#14714b":sb.OPS>=.700?"#805700":undefined}}>{sb.OPS>0?sb.OPS.toFixed(3):"---"}</td>
                    <td><select style={{fontSize:14,background:"#fff",color:"#53657c",border:"1px solid #c5d8ed",borderRadius:3,padding:"1px 2px"}} value={p.trainingFocus||""} onChange={e=>onSetTrainingFocus&&onSetTrainingFocus(p.id,e.target.value||null)}>{TRAINING_OPTIONS.filter(([k])=>!["velocity","control","breaking","stamina"].includes(k)).map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></td>
                    <td style={{minWidth:70}}>
                      <select style={{fontSize:14,background:"#fff",color:"#7050ad",border:"1px solid #c5d8ed",borderRadius:3,padding:"1px 2px"}} value={p.convertTarget||""} onChange={e=>onSetConvertTarget&&onSetConvertTarget(p.id,e.target.value||null)}>
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
        const btnSm={fontSize:14,minWidth:44,padding:"1px 6px",borderRadius:3,cursor:"pointer",background:"#edf4fc",border:"1px solid #c5d8ed",color:"#53657c"};
        const cardStyle={background:"#f0f7ff",border:"1px solid #c5d8ed",borderRadius:6,padding:"10px 12px",flex:1,minWidth:160};
        const PitcherStatRow=({p})=>{
          const sp=saberPitcher(p.stats);
          return(
            <div style={{display:"flex",gap:10,fontSize:14,marginTop:4,flexWrap:"wrap"}}>
              <span style={{color:"#53657c"}}>球速</span><span style={{color:"#17243a",fontFamily:"monospace"}}>{p.pitching?.velocity??50}</span>
              <span style={{color:"#53657c"}}>制球</span><span style={{color:"#17243a",fontFamily:"monospace"}}>{p.pitching?.control??50}</span>
              <span style={{color:"#53657c"}}>変化</span><span style={{color:"#17243a",fontFamily:"monospace"}}>{p.pitching?.breaking??50}</span>
              <span style={{color:"#53657c"}}>Cond</span><span style={{color:(p.condition??70)>=80?"#14714b":(p.condition??70)>=60?"#805700":"#b42332",fontFamily:"monospace"}}>{p.condition??70}</span>
              <span style={{color:"#53657c"}}>ERA</span><span style={{color:sp.ERA>0&&sp.ERA<3?"#14714b":sp.ERA<4?"#805700":sp.ERA>0?"#b42332":"#53657c",fontFamily:"monospace"}}>{fmtEra(sp.ERA)}</span>
              <span style={{color:"#53657c"}}>WHIP</span><span style={{color:sp.WHIP>0&&sp.WHIP<1.0?"#14714b":sp.WHIP<1.3?"#805700":sp.WHIP>0?"#53657c":"#53657c",fontFamily:"monospace"}}>{p.stats.IP>0?sp.WHIP:"---"}</span>
            </div>
          );
        };
        return(
          <div>
            {/* 先発ローテーション */}
            <div className="card" style={{marginBottom:8}}>
              <div className="card-h" style={{display:"flex",alignItems:"center",gap:8}}>
                <span>先発ローテーション ({rotPitchers.length}/6)</span>
                <button className="bsm bgb" style={{marginLeft:"auto"}} onClick={autoSetPitcherLineup}>自動編成</button>
              </div>
              {rotPitchers.map((p,i)=>{
                const sp=saberPitcher(p.stats);
                return(
                  <div key={p.id} style={{...rowStyle,flexWrap:"wrap"}}>
                    <div style={{display:"flex",alignItems:"center",flexWrap:"wrap",gap:6,width:"100%"}}>
                      <span style={{fontSize:14,color:"#53657c",width:16,textAlign:"right"}}>{i+1}</span>
                      <span style={{flex:1,fontWeight:600,fontSize:14,cursor:"pointer",color:"#095cc7"}} onClick={()=>onPlayerClick?.(p,team.name)}>{p.name}<HandBadge p={p}/>{(p.injuryDaysLeft??0)>0&&<span style={{marginLeft:4,fontSize:14,color:"#b42332"}}>🤕{p.injuryDaysLeft}</span>}</span>
                      <span style={{fontSize:14,color:"#53657c"}}>{p.subtype}</span>
                      <span style={{fontSize:14,color:"#53657c"}}>St</span><span style={{fontSize:14,color:"#805700",fontFamily:"monospace"}}>{p.pitching?.stamina??50}</span>
                      <button aria-label={`${p.name}の先発順を変更`} style={btnSm} onClick={()=>onMoveRotation&&onMoveRotation(p.id,-1)} disabled={i===0}>↑</button>
                      <button aria-label={`${p.name}の先発順を変更`} style={btnSm} onClick={()=>onMoveRotation&&onMoveRotation(p.id,1)} disabled={i===rotPitchers.length-1}>↓</button>
                      <button aria-label={`${p.name}を先発ローテーションから外す`} style={{...btnSm,color:"#b42332"}} onClick={()=>onRemoveFromRotation&&onRemoveFromRotation(p.id)}>✕</button>
                      <button className="bsm bgr" onClick={()=>onDemo(p.id)}>↓二軍</button>
                    </div>
                    <div style={{paddingLeft:22,width:"100%",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                      <span style={{fontSize:14,color:"#53657c"}}>球速</span><span style={{fontSize:14,color:"#17243a",fontFamily:"monospace"}}>{p.pitching?.velocity??50}</span>
                      <span style={{fontSize:14,color:"#53657c"}}>制球</span><span style={{fontSize:14,color:"#17243a",fontFamily:"monospace"}}>{p.pitching?.control??50}</span>
                      <span style={{fontSize:14,color:"#53657c"}}>変化</span><span style={{fontSize:14,color:"#17243a",fontFamily:"monospace"}}>{p.pitching?.breaking??50}</span>
                      <span style={{fontSize:14,color:"#53657c"}}>ERA</span><span style={{fontSize:14,color:sp.ERA>0&&sp.ERA<3?"#14714b":sp.ERA<4?"#805700":sp.ERA>0?"#b42332":"#53657c",fontFamily:"monospace"}}>{fmtEra(sp.ERA)}</span>
                      <span style={{fontSize:14,color:"#53657c"}}>WHIP</span><span style={{fontSize:14,color:sp.WHIP>0&&sp.WHIP<1.0?"#14714b":sp.WHIP<1.3?"#805700":sp.WHIP>0?"#53657c":"#53657c",fontFamily:"monospace"}}>{p.stats.IP>0?sp.WHIP:"---"}</span>
                      <span style={{fontSize:14,color:"#53657c"}}>{p.stats.W}勝{p.stats.L}敗</span>
                      <select style={{fontSize:14,background:"#fff",color:"#53657c",border:"1px solid #c5d8ed",borderRadius:3,padding:"1px 2px"}} value={p.trainingFocus||""} onChange={e=>onSetTrainingFocus&&onSetTrainingFocus(p.id,e.target.value||null)}>{TRAINING_OPTIONS.filter(([k])=>!["contact","power","eye","speed","arm","defense"].includes(k)).map(([k,l])=><option key={k} value={k}>{l}</option>)}</select>
                    </div>
                  </div>
                );
              })}
              {rotPitchers.length<6&&nonRotPitchers.length>0&&(
                <div style={{marginTop:6}}>
                  <select style={{fontSize:14,background:"#fff",color:"#53657c",border:"1px solid #c5d8ed",borderRadius:3,padding:"3px 6px"}}
                    value="" onChange={e=>{if(e.target.value)onSetStarter&&onSetStarter(e.target.value);}}>
                    <option value="">＋ 先発追加...</option>
                    {nonRotPitchers.map(p=><option key={p.id} value={p.id}>{p.name}（{p.subtype}）</option>)}
                  </select>
                </div>
              )}
              {rotPitchers.length===0&&<div style={{color:"#53657c",fontSize:14,padding:"8px 0"}}>先発投手が未設定です</div>}
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
                    <div style={{fontSize:14,color:"#53657c",marginBottom:4,letterSpacing:".1em"}}>{label}</div>
                    <select style={{fontSize:14,background:"#fff",color:"#17243a",border:"1px solid #c5d8ed",borderRadius:3,padding:"3px 6px",width:"100%"}}
                      value={pattern[key]??""} onChange={e=>onSetPitchingPattern&&onSetPitchingPattern({[key]:e.target.value||null})}>
                      <option value="">指名なし（自動）</option>
                      {pitchers.map(p=><option key={p.id} value={p.id} disabled={disabledIds.includes(p.id)}>{p.name}（{p.subtype}）</option>)}
                    </select>
                    {current&&(
                      <>
                        <PitcherStatRow p={current}/>
                        <div style={{marginTop:4,display:"flex",alignItems:"center",gap:6}}>
                          <span style={{fontSize:14,color:"#53657c"}}>強化</span>
                          <select style={{fontSize:14,background:"#fff",color:"#53657c",border:"1px solid #c5d8ed",borderRadius:3,padding:"1px 2px"}} value={current.trainingFocus||""} onChange={e=>onSetTrainingFocus&&onSetTrainingFocus(current.id,e.target.value||null)}>{TRAINING_OPTIONS.filter(([k])=>!["contact","power","eye","speed","arm","defense"].includes(k)).map(([k,l])=><option key={k} value={k}>{l}</option>)}</select>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
            {/* その他中継ぎ投手 */}
            <div className="card">
              <div className="card-h">その他中継ぎ投手 <span style={{fontSize:14,color:"#53657c",fontWeight:400}}>（上から順に登板 / リスト外はスコア自動選択）</span></div>
              {orderedBullpen.map((p,i)=>{
                const inOrder=middleOrder.includes(p.id);
                const isDesignated=designatedIds.has(p.id);
                const orderIdx=middleOrder.indexOf(p.id);
                const sp=saberPitcher(p.stats);
                const designLabel=p.id===pattern.closerId?"抑え指名":p.id===pattern.setupId?"8回指名":p.id===pattern.seventhId?"7回指名":null;
                return(
                  <div key={p.id} style={{...rowStyle,flexWrap:"wrap",opacity:isDesignated?0.5:1}}>
                    <div style={{display:"flex",alignItems:"center",flexWrap:"wrap",gap:6,width:"100%"}}>
                      <span style={{fontSize:14,color:inOrder?"#805700":"#53657c",width:16,textAlign:"right",fontFamily:"monospace"}}>{inOrder?orderIdx+1:"—"}</span>
                      <span style={{flex:1,fontWeight:600,fontSize:14,cursor:"pointer",color:"#095cc7"}} onClick={()=>onPlayerClick?.(p,team.name)}>{p.name}<HandBadge p={p}/>{(p.injuryDaysLeft??0)>0&&<span style={{marginLeft:4,fontSize:14,color:"#b42332"}}>🤕{p.injuryDaysLeft}</span>}</span>
                      <span style={{fontSize:14,color:"#53657c"}}>{p.subtype}</span>
                      {designLabel&&<span style={{fontSize:14,color:"#805700",background:"rgba(245,200,66,.1)",padding:"1px 5px",borderRadius:3}}>{designLabel}</span>}
                      {!isDesignated&&(<>
                        {inOrder?(
                          <>
                            <button style={btnSm} onClick={()=>moveMiddle(p.id,-1)} disabled={orderIdx===0}>↑</button>
                            <button style={btnSm} onClick={()=>moveMiddle(p.id,1)} disabled={orderIdx===middleOrder.length-1}>↓</button>
                            <button style={{...btnSm,color:"#b42332"}} onClick={()=>removeFromMiddle(p.id)}>✕</button>
                          </>
                        ):(
                          <button style={{...btnSm,color:"#14714b"}} onClick={()=>addToMiddle(p.id)}>＋優先</button>
                        )}
                        <button className="bsm bgr" onClick={()=>onDemo(p.id)}>↓二軍</button>
                      </>)}
                    </div>
                    {!isDesignated&&(
                      <div style={{paddingLeft:22,width:"100%",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                        <span style={{fontSize:14,color:"#53657c"}}>球速</span><span style={{fontSize:14,color:"#17243a",fontFamily:"monospace"}}>{p.pitching?.velocity??50}</span>
                        <span style={{fontSize:14,color:"#53657c"}}>制球</span><span style={{fontSize:14,color:"#17243a",fontFamily:"monospace"}}>{p.pitching?.control??50}</span>
                        <span style={{fontSize:14,color:"#53657c"}}>ERA</span><span style={{fontSize:14,color:sp.ERA>0&&sp.ERA<3?"#14714b":sp.ERA<4?"#805700":sp.ERA>0?"#b42332":"#53657c",fontFamily:"monospace"}}>{fmtEra(sp.ERA)}</span>
                        <span style={{fontSize:14,color:"#53657c"}}>WHIP</span><span style={{fontSize:14,color:sp.WHIP>0&&sp.WHIP<1.0?"#14714b":sp.WHIP<1.3?"#805700":sp.WHIP>0?"#53657c":"#53657c",fontFamily:"monospace"}}>{p.stats.IP>0?sp.WHIP:"---"}</span>
                        <select style={{fontSize:14,background:"#fff",color:"#53657c",border:"1px solid #c5d8ed",borderRadius:3,padding:"1px 2px"}} value={p.trainingFocus||""} onChange={e=>onSetTrainingFocus&&onSetTrainingFocus(p.id,e.target.value||null)}>{TRAINING_OPTIONS.filter(([k])=>!["contact","power","eye","speed","arm","defense"].includes(k)).map(([k,l])=><option key={k} value={k}>{l}</option>)}</select>
                      </div>
                    )}
                  </div>
                );
              })}
              {orderedBullpen.length===0&&<div style={{color:"#53657c",fontSize:14,padding:"8px 0"}}>ブルペン投手なし</div>}
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
                <div style={{marginBottom:8,padding:"8px 12px",background:"rgba(52,211,153,.08)",border:"1px solid rgba(52,211,153,.25)",borderRadius:6,fontSize:14,color:"#14714b"}}>
                  💡 一軍枠に空き（{MAX_ROSTER-team.players.length}枠）- 昇格推薦: {top.map(p=>p.name).join('、')}
                </div>
              );
            }
            return null;
          })()}
          <div className="card">
            <div className="card-h">二軍 ({team.farm.length}人)</div>
            <div className="detail-table-scroll" tabIndex={0} role="region" aria-label="成績一覧。横にスクロールできます">
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
                      <td style={{fontWeight:600,fontSize:14,cursor:"pointer"}} onClick={()=>onPlayerClick?.(p,team.name)}>
                        <span style={{color:"#095cc7"}}>{p.name}</span>
                        {p.育成&&<span style={{fontSize:14,color:"#7050ad",marginLeft:4}}>[育{p.ikuseiYears||0}年]</span>}
                        {isInj&&<span style={{fontSize:14,color:"#b42332",marginLeft:4}}>🤕{p.injuryDaysLeft}</span>}
                        {!isInj&&cd>0&&<span style={{fontSize:14,color:"#805700",marginLeft:4}}>🔒{cd}日</span>}
                      </td>
                      <td style={{fontSize:14,color:"#53657c"}}>{p.pos}</td><td className="mono" style={{color:"#53657c"}}>{p.age}</td>
                      <td className="mono" style={{color:p.育成?"#7050ad":"#53657c",fontSize:14}}>{p.育成?(p.ikuseiYears||0)+"年":"—"}</td>
                      <td><OV v={p.potential}/></td>
                      <td><OV v={p.isPitcher?p.pitching.velocity:p.batting.contact}/></td>
                      <td>
                        <select style={{fontSize:14,background:"#fff",color:"#53657c",border:"1px solid #c5d8ed",borderRadius:3,padding:"1px 2px",maxWidth:90}} value={p.devGoal||""} onChange={e=>onSetDevGoal&&onSetDevGoal(p.id,e.target.value||null)}>
                          {(p.isPitcher?DEV_GOALS_PITCHER:DEV_GOALS_BATTER).map(({key,label})=><option key={key} value={key}>{label}</option>)}
                        </select>
                      </td>
                      <td><CondBadge p={p}/></td>
                      <td className="mono" style={{fontSize:14,color:"#53657c"}}>{farmStat}</td>
                      <td style={{display:"flex",gap:4}}>
                        {p.育成
                          ?<button className="bsm" style={{background:"rgba(167,139,250,.15)",border:"1px solid rgba(167,139,250,.4)",color:"#7050ad",fontSize:14,padding:"2px 6px",borderRadius:4,cursor:"pointer",whiteSpace:"nowrap"}} onClick={()=>handleConvertIkusei(p.id)}>支配下登録</button>
                          :<button className="bsm bga" onClick={()=>canPromote&&onPromo(p.id)} disabled={!canPromote} style={!canPromote?{opacity:.4,cursor:"not-allowed"}:undefined}>{cd>0?`🔒${cd}日`:isInj?`🤕${p.injuryDaysLeft}`:"↑一軍"}</button>
                        }
                        {justConverted.has(p.id)&&!p.育成&&<button className="bsm" style={{background:"rgba(52,211,153,.15)",border:"1px solid rgba(52,211,153,.4)",color:"#14714b",fontSize:14,padding:"2px 6px",borderRadius:4,cursor:"pointer",whiteSpace:"nowrap"}} onClick={()=>{onPromo(p.id);setJustConverted(s=>{const n=new Set(s);n.delete(p.id);return n;});}}>↑一軍昇格</button>}
                      </td>
                    </tr>
                    );
                  })}
                  {team.farm.length===0&&<tr><td colSpan={10} style={{color:"#53657c",padding:"16px",textAlign:"center"}}>二軍選手なし</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      {view==="talk"&&(
        <div className="card">
          <div className="card-h">💬 選手コミュニケーション</div>
          <div style={{fontSize:14,color:"#53657c",marginBottom:10}}>月1回（{TALK_COOLDOWN_DAYS}試合に1回）まで同一選手と話せます。モラルが低い選手から優先しましょう。</div>
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
                    <span style={{fontWeight:700,fontSize:14,cursor:"pointer",color:"#095cc7"}} onClick={()=>onPlayerClick?.(p,team.name)}>{p.name}</span>
                    <span style={{fontSize:14,color:"#53657c",marginLeft:6}}>{p.pos}/{p.age}歳</span>
                    {p.isForeign&&<span className="chip cb" style={{marginLeft:4,fontSize:14}}>外</span>}
                  </div>
                  <MoralBadge v={p.morale}/>
                  {canTalk
                    ?<button className={`bsm ${isOpen?"bgb":"bga"}`} style={{fontSize:14}} onClick={()=>setTalkingPid(isOpen?null:p.id)}>💬 話す</button>
                    :<span style={{fontSize:14,color:"#53657c"}}>🔒 あと{cooldownLeft}試合</span>
                  }
                </div>
                {isOpen&&canTalk&&(
                  <div style={{marginTop:8,display:"grid",gridTemplateColumns:"1fr 1fr",gap:5}}>
                    {TALK_OPTIONS.map(opt=>(
                      <button key={opt.type} className="bsm bga" style={{padding:"6px 8px",textAlign:"left",height:"auto"}}
                        onClick={()=>{onPlayerTalk?.(p.id,opt.type);setTalkingPid(null);}}>
                        <div style={{fontSize:14,fontWeight:700}}>{opt.label}</div>
                        <div style={{fontSize:14,color:"#53657c",marginTop:1}}>{opt.desc}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {team.players.length===0&&<div style={{color:"#53657c",fontSize:14}}>一軍選手なし</div>}
        </div>
      )}
      </details>
    </div>
  );
}
