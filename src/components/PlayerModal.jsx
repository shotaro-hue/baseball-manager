import { useEffect } from "react";
import { fmtSal, fmtAvg, fmtIP } from '../utils';
import { saberBatter, saberPitcher } from '../engine/sabermetrics';

/* ═══════════════════════════════════════════════
   PLAYER DETAIL MODAL
═══════════════════════════════════════════════ */

function AbilityBar({label, value, color="#60a5fa"}){
  const pct=Math.round((value/99)*100);
  const c=value>=80?"#34d399":value>=65?"#f5c842":value>=50?"#94a3b8":"#f87171";
  return(
    <div style={{marginBottom:5}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
        <span style={{fontSize:10,color:"#94a3b8"}}>{label}</span>
        <span style={{fontSize:10,fontFamily:"monospace",color:c,fontWeight:700}}>{value}</span>
      </div>
      <div style={{height:4,background:"rgba(255,255,255,.08)",borderRadius:2,overflow:"hidden"}}>
        <div style={{height:"100%",width:pct+"%",background:c,borderRadius:2,transition:"width .3s"}}/>
      </div>
    </div>
  );
}

export function PlayerModal({player:p, teamName, onClose}){
  useEffect(()=>{
    const handler=(e)=>{if(e.key==="Escape")onClose();};
    window.addEventListener("keydown",handler);
    return()=>window.removeEventListener("keydown",handler);
  },[onClose]);

  if(!p) return null;

  const sb=!p.isPitcher?saberBatter(p.stats):null;
  const sp=p.isPitcher?saberPitcher(p.stats):null;

  const phase=p.growthPhase==="growth"?"成長期":p.growthPhase==="peak"?"全盛期":p.growthPhase==="earlydecline"?"衰退初期":"衰退期";
  const phaseColor=p.growthPhase==="growth"?"#34d399":p.growthPhase==="peak"?"#f5c842":p.growthPhase==="earlydecline"?"#f97316":"#f87171";

  // FA資格
  const faYrs=p.entryAge<=17?8:7;
  const faLeft=Math.max(0,faYrs-(p.serviceYears||0));
  const faLabel=p.isFA?"FA中":faLeft===0?"FA資格あり":`FA まで ${faLeft} 年`;

  return(
    <div
      style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,.78)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 16px"}}
      onClick={e=>{if(e.target===e.currentTarget)onClose();}}
    >
      <div style={{background:"#0d1b2a",border:"1px solid #1e3a5f",borderRadius:12,padding:20,width:"100%",maxWidth:460,boxShadow:"0 8px 32px rgba(0,0,0,.6)",maxHeight:"90vh",overflowY:"auto"}}>

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
          <span style={{fontSize:9,padding:"2px 8px",borderRadius:10,background:"rgba(255,255,255,.05)",color:"#94a3b8"}}>在籍 {p.serviceYears||0} 年目</span>
          <span style={{fontSize:9,padding:"2px 8px",borderRadius:10,background:"rgba(255,255,255,.05)",color:p.isFA?"#f5c842":"#94a3b8"}}>{faLabel}</span>
          {(p.injuryDaysLeft??0)>0&&<span style={{fontSize:9,padding:"2px 8px",borderRadius:10,background:"rgba(248,113,113,.1)",color:"#f87171",border:"1px solid rgba(248,113,113,.3)"}}>🤕 {p.injury} 残{p.injuryDaysLeft}試合</span>}
        </div>

        {/* 2カラムレイアウト */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>

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
            {/* 今季成績 */}
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
                </>
              )}
            </div>

            {/* 契約情報 */}
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
