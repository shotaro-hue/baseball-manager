import { useEffect, useState } from "react";
import { fmtSal, fmtAvg, fmtIP } from '../utils';
import { saberBatter, saberPitcher } from '../engine/sabermetrics';
import { CareerTable } from './tabs/CareerTable';
import { BattedBallAnalysisPanel } from './BattedBallAnalysisPanel';
import '../mobile-flow.css';
import { playerCondition } from './DashboardTab';
import { getFaProgress } from '../engine/contract';

/* ═══════════════════════════════════════════════
   PLAYER DETAIL MODAL
═══════════════════════════════════════════════ */

function abilityGrade(v){
  if(v>=90) return{g:"S",c:"#e879f9"};
  if(v>=80) return{g:"A",c:"#14714b"};
  if(v>=65) return{g:"B",c:"#805700"};
  if(v>=50) return{g:"C",c:"#53657c"};
  if(v>=35) return{g:"D",c:"#f97316"};
  return{g:"E",c:"#b42332"};
}

function AbilityBar({label, value, color="#095cc7"}){
  const pct=Math.round((value/99)*100);
  const {g,c}=abilityGrade(value);
  return(
    <div style={{marginBottom:5}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:2,alignItems:"center"}}>
        <span style={{fontSize:14,color:"#53657c"}}>{label}</span>
        <div style={{display:"flex",alignItems:"center",gap:5}}>
          <span style={{fontSize:14,fontWeight:700,color:c,background:"rgba(0,0,0,.3)",borderRadius:3,padding:"0 4px",minWidth:14,textAlign:"center"}}>{g}</span>
          <span style={{fontSize:14,fontFamily:"monospace",color:c,fontWeight:700}}>{value}</span>
        </div>
      </div>
      <div style={{height:4,background:"rgba(255,255,255,.08)",borderRadius:2,overflow:"hidden"}}>
        <div style={{height:"100%",width:pct+"%",background:c,borderRadius:2,transition:"width .3s"}}/>
      </div>
    </div>
  );
}


// 守備適正ダイヤモンド
const FIELD_POSITIONS = [
  { key:"捕手",   x:150, y:165, label:"C"  },
  { key:"一塁手", x:232, y:100, label:"1B" },
  { key:"二塁手", x:166, y:44,  label:"2B" },
  { key:"三塁手", x:68,  y:100, label:"3B" },
  { key:"遊撃手", x:104, y:60,  label:"SS" },
  { key:"左翼手", x:22,  y:22,  label:"LF" },
  { key:"中堅手", x:150, y:6,   label:"CF" },
  { key:"右翼手", x:278, y:22,  label:"RF" },
];

function profColor(prof){
  if(prof>=80) return "#14714b";
  if(prof>=60) return "#805700";
  if(prof>=40) return "#f97316";
  return "#b42332";
}

function PositionDiamond({player, convertTarget, onSetConvertTarget}){
  const positions = player.positions || {[player.pos]:100};

  const handleClick = (key) => {
    if(!onSetConvertTarget) return;
    onSetConvertTarget(key === convertTarget ? null : key);
  };

  return(
    <div style={{background:"rgba(255,255,255,.03)",borderRadius:8,padding:"10px 12px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
        <span style={{fontSize:14,color:"#53657c",fontWeight:700,letterSpacing:".05em"}}>守備適正</span>
        {onSetConvertTarget&&<span style={{fontSize:14,color:"#818cf8"}}>ポジションをクリックでコンバート指示</span>}
      </div>

      <svg viewBox="0 0 300 180" style={{width:"100%",display:"block",maxHeight:160}}>
        {/* ファウルライン */}
        <line x1="150" y1="148" x2="5"   y2="5"   stroke="rgba(255,255,255,.05)" strokeWidth="1"/>
        <line x1="150" y1="148" x2="295" y2="5"   stroke="rgba(255,255,255,.05)" strokeWidth="1"/>
        {/* 内野ダイヤモンド */}
        <polygon points="150,148 228,94 150,40 72,94"
          fill="rgba(52,211,153,.04)" stroke="rgba(52,211,153,.18)" strokeWidth="1"/>

        {FIELD_POSITIONS.map(({key, x, y, label})=>{
          const prof    = positions[key];
          const isPrimary   = key === player.pos;
          const isConverting = key === convertTarget;
          const hasProf = prof != null;
          const canClick = onSetConvertTarget && !isPrimary;

          const color = isPrimary ? "#095cc7" : hasProf ? profColor(prof) : "rgba(255,255,255,.2)";
          const r     = isPrimary ? 15 : 12;
          const bgOpacity = isPrimary ? ".18" : hasProf ? ".12" : ".03";

          return(
            <g key={key}
               style={{cursor: canClick ? "pointer" : "default"}}
               onClick={()=> canClick && handleClick(key)}>
              {/* 外枠ハイライト（コンバート中） */}
              {isConverting&&<circle cx={x} cy={y} r={r+4} fill="none" stroke="#818cf8" strokeWidth="1" strokeDasharray="3,2" opacity=".7"/>}
              {/* メイン円 */}
              <circle cx={x} cy={y} r={r}
                fill={`${color.replace("#","rgba(").replace(/^rgba\(/,"rgba(")}`}
                style={{fill: `${color}${bgOpacity.replace(".","").padStart(2,"0")}`}}
                stroke={isConverting ? "#818cf8" : color}
                strokeWidth={isPrimary ? 2 : isConverting ? 1.5 : 1}
              />
              {/* ラベル */}
              <text x={x} y={y-2} textAnchor="middle" fontSize="7.5"
                fill={color} fontWeight={isPrimary?"bold":"normal"}>{label}</text>
              {/* 習熟度 or 主 */}
              <text x={x} y={y+8} textAnchor="middle" fontSize="7.5" fill={color}>
                {isPrimary ? "主" : hasProf ? Math.round(prof) : "?"}
              </text>
              {/* コンバート中矢印 */}
              {isConverting&&<text x={x} y={y-r-3} textAnchor="middle" fontSize="8" fill="#818cf8">▶</text>}
            </g>
          );
        })}
      </svg>

      {/* コンバート状態表示 */}
      {convertTarget && convertTarget !== player.pos && (
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginTop:4,padding:"4px 8px",background:"rgba(129,140,248,.08)",borderRadius:6,border:"1px solid rgba(129,140,248,.2)"}}>
          <span style={{fontSize:14,color:"#818cf8"}}>
            ▶ {convertTarget}にコンバート中&nbsp;
            ({Math.round(positions[convertTarget]??0)}/100)
          </span>
          {onSetConvertTarget&&(
            <button
              style={{fontSize:14,background:"none",border:"1px solid rgba(129,140,248,.3)",color:"#818cf8",borderRadius:3,padding:"1px 6px",cursor:"pointer"}}
              onClick={()=>onSetConvertTarget(null)}
            >解除</button>
          )}
        </div>
      )}

      {/* 凡例 */}
      <div style={{display:"flex",gap:10,justifyContent:"center",marginTop:6}}>
        {[["#095cc7","主"],["#14714b","80+"],["#805700","60+"],["#f97316","40+"],["#b42332","~39"]].map(([c,l])=>(
          <span key={l} style={{fontSize:7.5,color:c,display:"flex",alignItems:"center",gap:2}}>
            <span style={{width:6,height:6,borderRadius:"50%",background:c,display:"inline-block"}}/>
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}

const VALID_SECTIONS = new Set(["profile", "stats", "battedBall", "career"]);

function resolveInitialSection(player, requestedSection) {
  if (!VALID_SECTIONS.has(requestedSection)) return "profile";
  if (requestedSection === "battedBall" && player?.isPitcher) return "stats";
  return requestedSection;
}

export function PlayerModal({
  player:p,
  teamName,
  isMyTeam,
  initialSection = "profile",
  saveId,
  year,
  teams,
  isCompared = false,
  onToggleCompare,
  onNavigate,
  onSetConvertTarget,
  onClose,
}){
  const [localConvertTarget, setLocalConvertTarget] = useState(p?.convertTarget ?? null);
  const [activeSection, setActiveSection] = useState(
    () => resolveInitialSection(p, initialSection),
  );

  useEffect(()=>{
    if (typeof document === 'undefined') return;
    const overflow = document.body.style.overflow;
    const opener = document.activeElement;
    document.body.style.overflow = 'hidden';
    const handler=(e)=>{if(e.key==="Escape")onClose();};
    window.addEventListener("keydown",handler);
    return()=>{window.removeEventListener("keydown",handler);document.body.style.overflow=overflow;opener?.focus?.({preventScroll:true});};
  },[onClose]);

  if(!p) return null;

  const sb=saberBatter(p.stats || {});
  const sp=p.isPitcher?saberPitcher(p.stats):null;

  const phase=p.growthPhase==="growth"?"成長期":p.growthPhase==="peak"?"全盛期":p.growthPhase==="earlyDecline"?"衰退初期":"衰退期";
  const phaseColor=p.growthPhase==="growth"?"#14714b":p.growthPhase==="peak"?"#805700":p.growthPhase==="earlyDecline"?"#f97316":"#b42332";

  const faProgress = getFaProgress(p);
  const faLabel = p.isFA ? "FA中"
    : !faProgress.recorded ? 'FA登録日数未記録'
    : `${faProgress.domestic.eligible ? '国内FA資格あり' : `国内FA 最短あと${faProgress.domestic.years}年（${faProgress.domestic.remainingDays}日）`}${faProgress.estimated ? '・推定' : ''}`;
  const foreignExemptDays = p.isForeign && !p.isFA && faProgress.recorded ? faProgress.overseas.remainingDays : 0;

  const handleConvert = (pos) => {
    setLocalConvertTarget(pos);
    onSetConvertTarget?.(p.id, pos);
  };

  // ⚠️ 文字列の長さを制限し、意図しない過大入力の描画負荷を回避する
  const safePlayerName = String(p?.name ?? "").slice(0, 60);
  const safeTeamName = typeof teamName === "string" ? teamName.slice(0, 80) : "";
  const safeSubtype = typeof p?.subtype === "string" ? p.subtype.slice(0, 30) : "";
  const safeInjury = typeof p?.injury === "string" ? p.injury.slice(0, 40) : "";
  const safeInjuryPart = typeof p?.injuryPart === "string" ? p.injuryPart.slice(0, 20) : "";
  const careerTeamId = Array.isArray(teams)
    ? teams.find((team) => team?.name === teamName)?.id
    : undefined;

  return(
    <div
      className="player-modal-overlay calm-player-surface"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`player-modal-title-${p.id}`}
      onClick={e=>{if(e.target===e.currentTarget)onClose();}}
    >
      <div className={`player-modal-card ${activeSection === "battedBall" ? "wide" : ""}`}>
        <button type="button" className="player-detail-back" onClick={onClose}>元の画面に戻る</button>
        <p className="flow-muted">{playerCondition(p).label} · コンディション {p.condition ?? 70}</p>

        {/* ヘッダー */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
          <div>
            <div id={`player-modal-title-${p.id}`} style={{fontSize:16,fontWeight:700,color:"#17243a",marginBottom:2}}>
              {safePlayerName}
              {p.isForeign&&<span style={{fontSize:14,background:"rgba(96,165,250,.15)",color:"#095cc7",border:"1px solid rgba(96,165,250,.3)",borderRadius:3,padding:"1px 5px",marginLeft:6}}>外国人</span>}
              {p.育成&&<span style={{fontSize:14,background:"rgba(167,139,250,.15)",color:"#7050ad",border:"1px solid rgba(167,139,250,.3)",borderRadius:3,padding:"1px 5px",marginLeft:4}}>育成</span>}
            </div>
            <div style={{fontSize:14,color:"#53657c"}}>
              {p.age}歳 / {p.pos}
              {p.isPitcher&&safeSubtype&&safeSubtype!==p.pos&&<span style={{marginLeft:6,color:"#53657c"}}>（{safeSubtype}）</span>}
              {p.isPitcher&&<span style={{marginLeft:6,color:p.hand==="left"?"#7050ad":"#53657c"}}>{p.hand==="left"?"左投":"右投"}</span>}
            </div>
            {safeTeamName&&<div style={{fontSize:14,color:"#095cc7",marginTop:2}}>{safeTeamName}</div>}
          </div>
          <div className="player-modal-header-actions">
            {onToggleCompare&&(
              <button
                type="button"
                className={isCompared?"compare-add-button on":"compare-add-button"}
                onClick={()=>onToggleCompare(p,teamName)}
              >
                {isCompared?"比較から外す":"＋ 比較"}
              </button>
            )}
            <button
              onClick={onClose}
              aria-label="選手詳細を閉じる"
              style={{background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.1)",color:"#53657c",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:14}}
            >✕</button>
          </div>
        </div>

        {/* 状態バッジ行 */}
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14}}>
          <span style={{fontSize:14,padding:"2px 8px",borderRadius:10,background:"rgba(255,255,255,.05)",color:phaseColor,border:`1px solid ${phaseColor}40`}}>{phase}</span>
          <span style={{fontSize:14,padding:"2px 8px",borderRadius:10,background:"rgba(255,255,255,.05)",color:"#53657c"}}>在籍 {Number.isFinite(p.serviceYears) ? `${p.serviceYears}年` : '未記録'}</span>
          <span style={{fontSize:14,padding:"2px 8px",borderRadius:10,background:"rgba(255,255,255,.05)",color:p.isFA?"#805700":"#53657c"}}>{faLabel}</span>
          {foreignExemptDays>0&&<span style={{fontSize:14,padding:"2px 8px",borderRadius:10,background:"rgba(96,165,250,.08)",color:"#095cc7",border:"1px solid rgba(96,165,250,.25)"}}>外国人枠免除まで {foreignExemptDays}日</span>}
          {(p.injuryDaysLeft??0)>0&&<span style={{fontSize:14,padding:"2px 8px",borderRadius:10,background:"rgba(248,113,113,.1)",color:"#b42332",border:"1px solid rgba(248,113,113,.3)"}}>🤕 {safeInjury}{safeInjuryPart ? ` [${safeInjuryPart}]` : ''} 残{p.injuryDaysLeft}試合</span>}
        </div>

        {/* セクション切替 */}
        <div className="player-detail-tabs" role="tablist" aria-label="選手詳細">
          {[
            ["profile", "概要"],
            ["stats", "今季成績"],
            ...(!p.isPitcher ? [["battedBall", "打球分析"]] : []),
            ["career", "年度別・通算"],
          ].map(([sectionId, label]) => (
            <button
              key={sectionId}
              type="button"
              role="tab"
              aria-selected={activeSection === sectionId}
              className={activeSection === sectionId ? "on" : ""}
              onClick={() => setActiveSection(sectionId)}
            >
              {label}
            </button>
          ))}
        </div>

        {activeSection==="profile"&&(<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12,minWidth:0}}>
          <div style={{background:"rgba(255,255,255,.03)",borderRadius:8,padding:"10px 12px"}}>
            <div style={{fontSize:14,color:"#53657c",fontWeight:700,marginBottom:8,letterSpacing:".05em"}}>能力値</div>
            {p.isPitcher?(<><AbilityBar label="球速" value={p.pitching.velocity}/><AbilityBar label="制球" value={p.pitching.control}/><AbilityBar label="スタミナ" value={p.pitching.stamina}/><AbilityBar label="変化球" value={p.pitching.breaking}/><AbilityBar label="球種" value={p.pitching.variety}/><AbilityBar label="ピンチ" value={p.pitching.clutchP}/></>):(<><AbilityBar label="ミート" value={p.batting.contact}/><AbilityBar label="長打" value={p.batting.power}/><AbilityBar label="走力" value={p.batting.speed}/><AbilityBar label="守備" value={p.batting.defense}/><AbilityBar label="選球眼" value={p.batting.eye}/><AbilityBar label="クラッチ" value={p.batting.clutch}/></>)}
            <div style={{marginTop:8,paddingTop:8,borderTop:"1px solid rgba(255,255,255,.06)",display:"flex",justifyContent:"space-between"}}><span style={{fontSize:14,color:"#53657c"}}>潜在能力</span><span style={{fontSize:14,color:"#7050ad",fontFamily:"monospace",fontWeight:700}}>{p.potential}</span></div>
          </div>
          <div style={{background:"rgba(255,255,255,.03)",borderRadius:8,padding:"10px 12px"}}><div style={{fontSize:14,color:"#53657c",fontWeight:700,marginBottom:8,letterSpacing:".05em"}}>契約</div><StatRow label="年俸" value={fmtSal(p.salary)} color="#805700"/><StatRow label="残年数" value={`${p.contractYearsLeft}年`} color={p.contractYearsLeft===0?"#b42332":undefined}/><div style={{marginTop:6,paddingTop:6,borderTop:"1px solid rgba(255,255,255,.06)",display:"flex",justifyContent:"space-between"}}><span style={{fontSize:14,color:"#53657c"}}>モラル</span><span style={{fontSize:14,fontFamily:"monospace",color:(p.morale??70)>=80?"#14714b":(p.morale??70)>=60?"#805700":"#b42332"}}>{p.morale??70}</span></div><div style={{marginTop:4,display:"flex",justifyContent:"space-between"}}><span style={{fontSize:14,color:"#53657c"}}>コンディション</span><span style={{fontSize:14,fontFamily:"monospace",color:(p.condition??70)>=80?"#14714b":(p.condition??70)>=60?"#805700":"#b42332"}}>{p.condition??70}</span></div></div>
        </div>)}

        {activeSection==="stats"&&(
          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:12,minWidth:0}}>
            <dl className="flow-metrics">
              {p.isPitcher ? <><div><dt>防御率</dt><dd>{p.stats.IP>0?sp.ERA:'—'}</dd></div><div><dt>投球回</dt><dd>{p.stats.IP>0?fmtIP(p.stats.IP):'—'}</dd></div><div><dt>奪三振</dt><dd>{p.stats.Kp ?? 0}</dd></div></> : <><div><dt>打率</dt><dd>{p.stats.AB>0?fmtAvg(p.stats.H,p.stats.AB):'—'}</dd></div><div><dt>本塁打</dt><dd>{p.stats.HR ?? 0}</dd></div><div><dt>打点</dt><dd>{p.stats.RBI ?? 0}</dd></div></>}
            </dl>
            <details><summary className="player-detail-back">詳細指標を見る</summary>
            <div style={{background:"rgba(255,255,255,.03)",borderRadius:8,padding:"10px 12px"}}>
              <div style={{fontSize:14,color:"#53657c",fontWeight:700,marginBottom:8,letterSpacing:".05em"}}>今季成績</div>
              {p.isPitcher ? (
                <>
                  <StatRow label="防御率" value={p.stats.IP>0?sp.ERA:"---"} color={sp.ERA>0&&sp.ERA<3?"#14714b":sp.ERA<4?"#805700":sp.ERA>0?"#b42332":undefined}/>
                  <StatRow label="勝-敗" value={`${p.stats.W}-${p.stats.L}`}/>
                  <StatRow label="投球回" value={p.stats.IP>0?fmtIP(p.stats.IP):"---"}/>
                  <StatRow label="奪三振" value={p.stats.Kp||0}/>
                  <StatRow label="WHIP" value={p.stats.IP>0?sp.WHIP:"---"} color={sp.WHIP>0&&sp.WHIP<1.0?"#14714b":sp.WHIP<1.3?"#805700":undefined}/>
                  <StatRow label="セーブ" value={p.stats.SV||0}/>
                  <StatRow label="ホールド" value={p.stats.HLD||0}/>
                  <div style={{margin:"7px 0 5px",paddingTop:7,borderTop:"1px solid rgba(255,255,255,.06)",fontSize:14,color:"#53657c",fontWeight:700,letterSpacing:".05em"}}>打撃成績</div>
                  <StatRow label="打席" value={p.stats.PA||0}/>
                  <StatRow label="打数" value={p.stats.AB||0}/>
                  <StatRow label="打率" value={p.stats.AB>0?fmtAvg(p.stats.H,p.stats.AB):"---"}/>
                  <StatRow label="安打" value={p.stats.H||0}/>
                  <StatRow label="打点" value={p.stats.RBI||0}/>
                  <StatRow label="犠打" value={p.stats.SH||0}/>
                  <StatRow label="OPS" value={sb.OPS>0?sb.OPS.toFixed(3):"---"}/>
                </>
              ) : (
                <>
                  <StatRow label="打率" value={fmtAvg(p.stats.H,p.stats.AB)} color={p.stats.AB>0&&(p.stats.H/p.stats.AB)>=.300?"#14714b":(p.stats.H/p.stats.AB)>=.250?"#805700":undefined}/>
                  <StatRow label="本塁打" value={p.stats.HR} color={p.stats.HR>=20?"#805700":undefined}/>
                  <StatRow label="打点" value={p.stats.RBI}/>
                  <StatRow label="OPS" value={sb.OPS>0?sb.OPS.toFixed(3):"---"} color={sb.OPS>=.850?"#14714b":sb.OPS>=.700?"#805700":undefined}/>
                  <StatRow label="盗塁" value={p.stats.SB||0}/>
                  <StatRow label="出塁率" value={sb.OBP>0?sb.OBP.toFixed(3):"---"}/>
                  <StatRow label="強打球率" value={sb.hardHitPct>0?`${(sb.hardHitPct*100).toFixed(1)}%`:"---"} color={sb.hardHitPct>=0.4?"#14714b":undefined}/>
                </>
              )}
            </div>
            </details>
          </div>
        )}

        {activeSection === "battedBall" && !p.isPitcher && (
          <div className="calm-detail detail-analysis">
          <BattedBallAnalysisPanel player={p} saveId={saveId} year={year} teams={teams} teamName={teamName}/>
          </div>
        )}

        {activeSection === "career" && (
          <div className="calm-detail detail-analysis">
          <CareerTable player={p} year={year} teamId={careerTeamId} teamName={teamName}/>
          </div>
        )}

        {onNavigate&&(
          <div className="player-decision-actions" aria-label="この選手について判断する">
            <span>この選手について判断</span>
            {isMyTeam&&<button type="button" className="bsm bga" onClick={()=>onNavigate("roster",p,teamName)}>起用へ</button>}
            {isMyTeam&&<button type="button" className="bsm bga" onClick={()=>onNavigate("contract",p,teamName)}>契約へ</button>}
            <button type="button" className="bsm bgb" onClick={()=>onNavigate("trade",p,teamName)}>トレードへ</button>
          </div>
        )}

      </div>
    </div>
  );
}

function StatRow({label,value,color}){
  return(
    <div style={{display:"flex",justifyContent:"space-between",padding:"2px 0"}}>
      <span style={{fontSize:14,color:"#53657c"}}>{label}</span>
      <span style={{fontSize:14,fontFamily:"monospace",color:color||"#17243a",fontWeight:color?700:400}}>{value}</span>
    </div>
  );
}
