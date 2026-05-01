import { useEffect, useState } from "react";
import { fmtSal, fmtAvg, fmtIP } from '../utils';
import { saberBatter, saberPitcher } from '../engine/sabermetrics';
import { CareerTable } from './tabs/CareerTable';

/* ═══════════════════════════════════════════════
   PLAYER DETAIL MODAL
═══════════════════════════════════════════════ */

function abilityGrade(v){
  if(v>=90) return{g:"S",c:"#e879f9"};
  if(v>=80) return{g:"A",c:"#34d399"};
  if(v>=65) return{g:"B",c:"#f5c842"};
  if(v>=50) return{g:"C",c:"#94a3b8"};
  if(v>=35) return{g:"D",c:"#f97316"};
  return{g:"E",c:"#f87171"};
}

function AbilityBar({label, value, color="#60a5fa"}){
  const pct=Math.round((value/99)*100);
  const {g,c}=abilityGrade(value);
  return(
    <div style={{marginBottom:5}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:2,alignItems:"center"}}>
        <span style={{fontSize:10,color:"#94a3b8"}}>{label}</span>
        <div style={{display:"flex",alignItems:"center",gap:5}}>
          <span style={{fontSize:9,fontWeight:700,color:c,background:"rgba(0,0,0,.3)",borderRadius:3,padding:"0 4px",minWidth:14,textAlign:"center"}}>{g}</span>
          <span style={{fontSize:10,fontFamily:"monospace",color:c,fontWeight:700}}>{value}</span>
        </div>
      </div>
      <div style={{height:4,background:"rgba(255,255,255,.08)",borderRadius:2,overflow:"hidden"}}>
        <div style={{height:"100%",width:pct+"%",background:c,borderRadius:2,transition:"width .3s"}}/>
      </div>
    </div>
  );
}

function sanitizeSprayPoint(point) {
  if (!point || typeof point !== 'object' || Array.isArray(point)) return null;
  const rawDist = Number(point.dist);
  const rawSpray = Number(point.sprayAngle);
  if (!Number.isFinite(rawDist) || !Number.isFinite(rawSpray)) return null;
  return {
    dist: Math.min(220, Math.max(0, rawDist)),
    sprayAngle: Math.min(90, Math.max(0, rawSpray)),
    result: String(point.result || 'out'),
  };
}

function SprayDistributionChart({ sprayPoints }) {
  const safePoints = Array.isArray(sprayPoints)
    ? sprayPoints.map(sanitizeSprayPoint).filter(Boolean)
    : [];
  const hasData = safePoints.length > 0;
  const plottedPoints = safePoints.map((point, idx) => {
    // 角度 0~90 を左翼〜右翼方向にマップ【＝座標変換】
    const angleRad = ((point.sprayAngle - 45) * Math.PI) / 180;
    const radius = (point.dist / 220) * 106;
    const cx = 130 + Math.sin(angleRad) * radius;
    const cy = 140 - Math.cos(angleRad) * radius;
    const isHomeRun = point.result === 'hr';
    return {
      key: `spray-pt-${idx}`,
      cx: Math.max(12, Math.min(248, cx)),
      cy: Math.max(12, Math.min(146, cy)),
      color: isHomeRun ? '#f87171' : '#f8fafc',
      opacity: isHomeRun ? 0.95 : 0.78,
      radius: isHomeRun ? 2.4 : 1.9,
    };
  });

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 9, color: "#64748b", marginBottom: 4 }}>
        着弾分布図【＝外野方向ごとの打球の偏りを図で可視化】
      </div>
      <svg viewBox="0 0 260 150" style={{ width: "100%", display: "block", borderRadius: 8, background: "rgba(12,122,62,.15)", border: "1px solid rgba(255,255,255,.08)" }}>
        <line x1="130" y1="140" x2="16" y2="26" stroke="rgba(255,255,255,.4)" strokeWidth="1.2" />
        <line x1="130" y1="140" x2="244" y2="26" stroke="rgba(255,255,255,.4)" strokeWidth="1.2" />
        <path d="M 36 122 Q 130 18 224 122" fill="none" stroke="rgba(148,163,184,.7)" strokeWidth="2" />
        <path d="M 58 118 Q 130 38 202 118" fill="none" stroke="rgba(148,163,184,.35)" strokeWidth="1.2" />
        <line x1="130" y1="140" x2="130" y2="22" stroke="rgba(255,255,255,.25)" strokeDasharray="3 3" strokeWidth="1" />
        <text x="54" y="20" fontSize="9" fill="#e2e8f0" textAnchor="middle">左翼方向</text>
        <text x="130" y="13" fontSize="9" fill="#fde68a" textAnchor="middle">中堅方向</text>
        <text x="206" y="20" fontSize="9" fill="#e2e8f0" textAnchor="middle">右翼方向</text>

        {plottedPoints.map((dot) => (
          <circle
            key={dot.key}
            cx={dot.cx}
            cy={dot.cy}
            r={dot.radius}
            fill={dot.color}
            opacity={dot.opacity}
          />
        ))}

        {!hasData && (
          <text x="130" y="96" fontSize="10" fill="#cbd5e1" textAnchor="middle">
            データ不足
          </text>
        )}
      </svg>
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
  if(prof>=80) return "#34d399";
  if(prof>=60) return "#f5c842";
  if(prof>=40) return "#f97316";
  return "#f87171";
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
        <span style={{fontSize:10,color:"#374151",fontWeight:700,letterSpacing:".05em"}}>守備適正</span>
        {onSetConvertTarget&&<span style={{fontSize:8,color:"#818cf8"}}>ポジションをクリックでコンバート指示</span>}
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

          const color = isPrimary ? "#60a5fa" : hasProf ? profColor(prof) : "rgba(255,255,255,.2)";
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
          <span style={{fontSize:9,color:"#818cf8"}}>
            ▶ {convertTarget}にコンバート中&nbsp;
            ({Math.round(positions[convertTarget]??0)}/100)
          </span>
          {onSetConvertTarget&&(
            <button
              style={{fontSize:8,background:"none",border:"1px solid rgba(129,140,248,.3)",color:"#818cf8",borderRadius:3,padding:"1px 6px",cursor:"pointer"}}
              onClick={()=>onSetConvertTarget(null)}
            >解除</button>
          )}
        </div>
      )}

      {/* 凡例 */}
      <div style={{display:"flex",gap:10,justifyContent:"center",marginTop:6}}>
        {[["#60a5fa","主"],["#34d399","80+"],["#f5c842","60+"],["#f97316","40+"],["#f87171","~39"]].map(([c,l])=>(
          <span key={l} style={{fontSize:7.5,color:c,display:"flex",alignItems:"center",gap:2}}>
            <span style={{width:6,height:6,borderRadius:"50%",background:c,display:"inline-block"}}/>
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}

export function PlayerModal({player:p, teamName, isMyTeam, onSetConvertTarget, onClose}){
  const [localConvertTarget, setLocalConvertTarget] = useState(p?.convertTarget ?? null);

  useEffect(()=>{
    const handler=(e)=>{if(e.key==="Escape")onClose();};
    window.addEventListener("keydown",handler);
    return()=>window.removeEventListener("keydown",handler);
  },[onClose]);

  if(!p) return null;

  const sb=!p.isPitcher?saberBatter(p.stats):null;
  const sp=p.isPitcher?saberPitcher(p.stats):null;

  const phase=p.growthPhase==="growth"?"成長期":p.growthPhase==="peak"?"全盛期":p.growthPhase==="earlyDecline"?"衰退初期":"衰退期";
  const phaseColor=p.growthPhase==="growth"?"#34d399":p.growthPhase==="peak"?"#f5c842":p.growthPhase==="earlyDecline"?"#f97316":"#f87171";

  const FA_DAYS = 120;
  const domDays = (p.entryType==='高卒'||p.entryType==='外国人') ? 8*FA_DAYS : 7*FA_DAYS;
  const days = p.daysOnActiveRoster ?? (p.serviceYears??0)*FA_DAYS;
  const domLeft = Math.max(0, domDays - days);
  const faLabel = p.isFA ? "FA中"
    : domLeft===0 ? "FA資格あり"
    : `FA まで ${domLeft}日（${Math.ceil(domLeft/FA_DAYS)}年相当）`;
  const foreignExemptDays = p.isForeign && !p.isFA ? Math.max(0, (9*FA_DAYS) - days) : 0;

  const handleConvert = (pos) => {
    setLocalConvertTarget(pos);
    onSetConvertTarget?.(p.id, pos);
  };

  return(
    <div
      style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,.78)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 16px"}}
      onClick={e=>{if(e.target===e.currentTarget)onClose();}}
    >
      <div style={{background:"#0d1b2a",border:"1px solid #1e3a5f",borderRadius:12,padding:20,width:"100%",maxWidth:480,boxShadow:"0 8px 32px rgba(0,0,0,.6)",maxHeight:"90vh",overflowY:"auto"}}>

        {/* ヘッダー */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
          <div>
            <div style={{fontSize:16,fontWeight:700,color:"#e0d4bf",marginBottom:2}}>
              {p.name}
              {p.isForeign&&<span style={{fontSize:9,background:"rgba(96,165,250,.15)",color:"#60a5fa",border:"1px solid rgba(96,165,250,.3)",borderRadius:3,padding:"1px 5px",marginLeft:6}}>外国人</span>}
              {p.育成&&<span style={{fontSize:9,background:"rgba(167,139,250,.15)",color:"#a78bfa",border:"1px solid rgba(167,139,250,.3)",borderRadius:3,padding:"1px 5px",marginLeft:4}}>育成</span>}
            </div>
            <div style={{fontSize:11,color:"#374151"}}>
              {p.age}歳 / {p.pos}
              {p.isPitcher&&p.subtype&&p.subtype!==p.pos&&<span style={{marginLeft:6,color:"#374151"}}>（{p.subtype}）</span>}
              {p.isPitcher&&<span style={{marginLeft:6,color:p.hand==="left"?"#a78bfa":"#94a3b8"}}>{p.hand==="left"?"左投":"右投"}</span>}
            </div>
            {teamName&&<div style={{fontSize:10,color:"#60a5fa",marginTop:2}}>{teamName}</div>}
          </div>
          <button
            onClick={onClose}
            style={{background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.1)",color:"#94a3b8",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:12}}
          >✕</button>
        </div>

        {/* 状態バッジ行 */}
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14}}>
          <span style={{fontSize:9,padding:"2px 8px",borderRadius:10,background:"rgba(255,255,255,.05)",color:phaseColor,border:`1px solid ${phaseColor}40`}}>{phase}</span>
          <span style={{fontSize:9,padding:"2px 8px",borderRadius:10,background:"rgba(255,255,255,.05)",color:"#94a3b8"}}>在籍 {Math.floor(days/FA_DAYS)||p.serviceYears||0} 年目</span>
          <span style={{fontSize:9,padding:"2px 8px",borderRadius:10,background:"rgba(255,255,255,.05)",color:p.isFA?"#f5c842":"#94a3b8"}}>{faLabel}</span>
          {foreignExemptDays>0&&<span style={{fontSize:9,padding:"2px 8px",borderRadius:10,background:"rgba(96,165,250,.08)",color:"#60a5fa",border:"1px solid rgba(96,165,250,.25)"}}>外国人枠免除まで {foreignExemptDays}日</span>}
          {(p.injuryDaysLeft??0)>0&&<span style={{fontSize:9,padding:"2px 8px",borderRadius:10,background:"rgba(248,113,113,.1)",color:"#f87171",border:"1px solid rgba(248,113,113,.3)"}}>🤕 {p.injury}{p.injuryPart ? ` [${p.injuryPart}]` : ''} 残{p.injuryDaysLeft}試合</span>}
        </div>

        {/* 2カラムレイアウト */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12,minWidth:0}}>

          {/* 能力値 */}
          <div style={{background:"rgba(255,255,255,.03)",borderRadius:8,padding:"10px 12px"}}>
            <div style={{fontSize:10,color:"#374151",fontWeight:700,marginBottom:8,letterSpacing:".05em"}}>能力値</div>
            {p.isPitcher?(
              <>
                <AbilityBar label="球速" value={p.pitching.velocity}/>
                <AbilityBar label="制球" value={p.pitching.control}/>
                <AbilityBar label="スタミナ" value={p.pitching.stamina}/>
                <AbilityBar label="変化球" value={p.pitching.breaking}/>
                <AbilityBar label="球種" value={p.pitching.variety}/>
                <AbilityBar label="ピンチ" value={p.pitching.clutchP}/>
              </>
            ):(
              <>
                <AbilityBar label="ミート" value={p.batting.contact}/>
                <AbilityBar label="長打" value={p.batting.power}/>
                <AbilityBar label="走力" value={p.batting.speed}/>
                <AbilityBar label="守備" value={p.batting.defense}/>
                <AbilityBar label="選球眼" value={p.batting.eye}/>
                <AbilityBar label="クラッチ" value={p.batting.clutch}/>
              </>
            )}
            <div style={{marginTop:8,paddingTop:8,borderTop:"1px solid rgba(255,255,255,.06)",display:"flex",justifyContent:"space-between"}}>
              <span style={{fontSize:9,color:"#374151"}}>潜在能力</span>
              <span style={{fontSize:10,color:"#a78bfa",fontFamily:"monospace",fontWeight:700}}>{p.potential}</span>
            </div>
          </div>

          {/* 今季成績 + 契約 */}
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <div style={{background:"rgba(255,255,255,.03)",borderRadius:8,padding:"10px 12px",flex:1}}>
              <div style={{fontSize:10,color:"#374151",fontWeight:700,marginBottom:8,letterSpacing:".05em"}}>今季成績</div>
              {p.isPitcher?(
                <>
                  <StatRow label="防御率" value={sp.ERA>0?sp.ERA:"---"} color={sp.ERA>0&&sp.ERA<3?"#34d399":sp.ERA<4?"#f5c842":sp.ERA>0?"#f87171":undefined}/>
                  <StatRow label="勝-敗" value={`${p.stats.W}-${p.stats.L}`}/>
                  <StatRow label="投球回" value={p.stats.IP>0?fmtIP(p.stats.IP):"---"}/>
                  <StatRow label="奪三振" value={p.stats.Kp||0}/>
                  <StatRow label="WHIP" value={sp.WHIP>0?sp.WHIP:"---"} color={sp.WHIP>0&&sp.WHIP<1.0?"#34d399":sp.WHIP<1.3?"#f5c842":undefined}/>
                  <StatRow label="セーブ" value={p.stats.SV||0}/>
                  <StatRow label="H" value={p.stats.HLD||0}/>
                </>
              ):(
                <>
                  <StatRow label="打率" value={fmtAvg(p.stats.H,p.stats.AB)} color={p.stats.AB>0&&(p.stats.H/p.stats.AB)>=.300?"#34d399":(p.stats.H/p.stats.AB)>=.250?"#f5c842":undefined}/>
                  <StatRow label="本塁打" value={p.stats.HR} color={p.stats.HR>=20?"#f5c842":undefined}/>
                  <StatRow label="打点" value={p.stats.RBI}/>
                  <StatRow label="OPS" value={sb.OPS>0?sb.OPS.toFixed(3):"---"} color={sb.OPS>=.850?"#34d399":sb.OPS>=.700?"#f5c842":undefined}/>
                  <StatRow label="盗塁" value={p.stats.SB||0}/>
                  <StatRow label="出塁率" value={sb.OBP>0?sb.OBP.toFixed(3):"---"}/>
                  <StatRow label="強打球率" value={sb.hardHitPct>0?`${(sb.hardHitPct*100).toFixed(1)}%`:"---"} color={sb.hardHitPct>=0.4?"#34d399":undefined}/>
                </>
              )}
            </div>

            {!p.isPitcher&&(
              <div style={{background:"rgba(255,255,255,.03)",borderRadius:8,padding:"10px 12px"}}>
                <div style={{fontSize:10,color:"#374151",fontWeight:700,marginBottom:8,letterSpacing:".05em"}}>打球傾向分析</div>
                <StatRow label="左翼方向" value={sb.pullPct>0?`${(sb.pullPct*100).toFixed(1)}%`:"---"}/>
                <StatRow label="中堅方向" value={sb.centerPct>0?`${(sb.centerPct*100).toFixed(1)}%`:"---"}/>
                <StatRow label="右翼方向" value={sb.oppositePct>0?`${(sb.oppositePct*100).toFixed(1)}%`:"---"}/>
                <StatRow label="ゴロ率" value={sb.gbPct>0?`${(sb.gbPct*100).toFixed(1)}%`:"---"}/>
                <StatRow label="ライナー率" value={sb.ldPct>0?`${(sb.ldPct*100).toFixed(1)}%`:"---"}/>
                <StatRow label="フライ率" value={sb.fbPct>0?`${(sb.fbPct*100).toFixed(1)}%`:"---"}/>
                <SprayDistributionChart sprayPoints={p.stats?.sprayPoints} />
              </div>
            )}

            <div style={{background:"rgba(255,255,255,.03)",borderRadius:8,padding:"10px 12px"}}>
              <div style={{fontSize:10,color:"#374151",fontWeight:700,marginBottom:8,letterSpacing:".05em"}}>契約</div>
              <StatRow label="年俸" value={fmtSal(p.salary)} color="#f5c842"/>
              <StatRow label="残年数" value={`${p.contractYearsLeft}年`} color={p.contractYearsLeft===0?"#f87171":undefined}/>
              <div style={{marginTop:6,paddingTop:6,borderTop:"1px solid rgba(255,255,255,.06)",display:"flex",justifyContent:"space-between"}}>
                <span style={{fontSize:9,color:"#374151"}}>モラル</span>
                <span style={{fontSize:10,fontFamily:"monospace",color:(p.morale??70)>=80?"#34d399":(p.morale??70)>=60?"#f5c842":"#f87171"}}>{p.morale??70}</span>
              </div>
              <div style={{marginTop:4,display:"flex",justifyContent:"space-between"}}>
                <span style={{fontSize:9,color:"#374151"}}>コンディション</span>
                <span style={{fontSize:10,fontFamily:"monospace",color:(p.condition??70)>=80?"#34d399":(p.condition??70)>=60?"#f5c842":"#f87171"}}>{p.condition??70}</span>
              </div>
            </div>
          </div>
        </div>

        {/* 守備適正ダイヤモンド（野手のみ） */}
        {!p.isPitcher&&(
          <div style={{marginBottom:12}}>
            <PositionDiamond
              player={p}
              convertTarget={localConvertTarget}
              onSetConvertTarget={isMyTeam ? handleConvert : null}
            />
          </div>
        )}

        {/* 年度別・通算成績 */}
        <CareerTable player={p}/>

      </div>
    </div>
  );
}

function StatRow({label,value,color}){
  return(
    <div style={{display:"flex",justifyContent:"space-between",padding:"2px 0"}}>
      <span style={{fontSize:10,color:"#374151"}}>{label}</span>
      <span style={{fontSize:10,fontFamily:"monospace",color:color||"#e0d4bf",fontWeight:color?700:400}}>{value}</span>
    </div>
  );
}
