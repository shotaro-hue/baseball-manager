import { useState } from "react";
import { TEAM_DEFS } from '../constants';
import { fmtSal, fmtM } from '../utils';
import { calcRetireWill } from '../engine/player';



export function ModeSelectScreen({myTeam,oppTeam,gameDay,onSelect,onBack}){
  return(
    <div className="app">
      <div className="mode-wrap">
        <div style={{marginBottom:6,fontSize:11,color:"#374151",letterSpacing:".2em"}}>第{gameDay}戦</div>
        <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:36,color:"#f5c842",letterSpacing:".1em",marginBottom:4}}>
          vs {oppTeam?.name}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:28}}>
          <span style={{fontSize:22}}>{myTeam?.emoji}</span>
          <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:16,color:"#374151"}}>vs</span>
          <span style={{fontSize:22}}>{oppTeam?.emoji}</span>
        </div>

        <div className="mode-card tactical" onClick={()=>onSelect("tactical")}>
          <div style={{fontSize:42,marginBottom:10}}>🎮</div>
          <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:28,color:"#f5c842",letterSpacing:".1em",marginBottom:6}}>
            采配モード
          </div>
          <div style={{fontSize:12,color:"#4b5563",lineHeight:1.6}}>
            重要局面で自動停止。<br/>
            投手交代・代打・作戦を自分で指示。<br/>
            <span style={{color:"#f5c842",fontSize:11}}>★ じっくり遊びたい人向け</span>
          </div>
        </div>

        <div className="mode-card auto" onClick={()=>onSelect("auto")}>
          <div style={{fontSize:42,marginBottom:10}}>⚡</div>
          <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:28,color:"#34d399",letterSpacing:".1em",marginBottom:6}}>
            オートシムモード
          </div>
          <div style={{fontSize:12,color:"#4b5563",lineHeight:1.6}}>
            試合を自動で進めて結果だけ確認。<br/>
            すばやくシーズンを進めたい時に。<br/>
            <span style={{color:"#34d399",fontSize:11}}>★ サクサク進めたい人向け</span>
          </div>
        </div>

        <button onClick={onBack} style={{background:"transparent",border:"none",color:"#374151",cursor:"pointer",fontSize:12,marginTop:4}}>
          ← ハブに戻る
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   ROSTER TAB (simplified for space)
═══════════════════════════════════════════════ */

export function ResultScreen({gsResult,myTeam,oppTeam,gameDay,onNext}){
  const won=gsResult.score.my>gsResult.score.opp;
  return(
    <div className="app">
      <div className="rw">
        <div style={{color:"#1e2d3d",letterSpacing:".2em",fontSize:11,marginBottom:8}}>第{gameDay}戦 vs {oppTeam.name}</div>
        <div className={`rtitle ${won?"rwin":"rlose"}`}>{won?"勝利！！":"敗北..."}</div>
        <div className="rscore" style={{color:won?"#f5c842":"#374151"}}>{myTeam.short} {gsResult.score.my} – {gsResult.score.opp} {oppTeam.short}</div>
        <div style={{color:"#374151",fontSize:12,marginBottom:28}}>通算 {myTeam.wins}勝 {myTeam.losses}敗</div>
        <button className="btn btn-gold" onClick={onNext}>次の試合へ →</button>
      </div>
    </div>
  );
}
/* ═══════════════════════════════════════════════
   SEASON END
═══════════════════════════════════════════════ */




export function SeasonEndScreen({teams,myId,year,onToDraft}){
  const myLeague=teams.find(t=>t.id===myId)?.league;
  const sorted=[...teams.filter(t=>t.league===myLeague)].sort((a,b)=>b.wins-a.wins);
  const me=teams.find(t=>t.id===myId);
  const myRank=sorted.findIndex(t=>t.id===myId)+1;
  const isChamp=myRank===1;
  return(
    <div className="app">
      <div style={{maxWidth:580,margin:"0 auto",padding:"40px 20px",textAlign:"center"}}>
        <div style={{fontSize:48,marginBottom:10}}>{isChamp?"🏆":"📋"}</div>
        <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:52,color:isChamp?"#f5c842":"#94a3b8",letterSpacing:".1em"}}>{isChamp?`${year}年 優勝！`:`${year}年 終了`}</div>
        <p style={{color:"#4b5563",margin:"10px 0 20px"}}>{me?.name} — {myRank}位 {me?.wins}勝{me?.losses}敗</p>
        <div className="card" style={{textAlign:"left",marginBottom:20}}>
          {sorted.map((t,i)=>(
            <div key={t.id} className="fsb" style={{padding:"7px 0",borderBottom:"1px solid rgba(255,255,255,.04)",background:t.id===myId?"rgba(245,200,66,.04)":undefined}}>
              <div><span className="mono" style={{color:i===0?"#ffd700":i===1?"#94a3b8":i===2?"#b45309":"#1e2d3d",marginRight:10}}>{i+1}</span><span style={{color:t.color,marginRight:6}}>{t.emoji}</span><span style={{fontWeight:t.id===myId?700:400,color:t.id===myId?"#f5c842":undefined}}>{t.name}</span></div>
              <span className="mono"><span style={{color:"#34d399"}}>{t.wins}</span><span style={{color:"#374151"}}>/</span><span style={{color:"#f87171"}}>{t.losses}</span></span>
            </div>
          ))}
        </div>
        <button className="btn btn-gold" style={{padding:"12px 36px"}} onClick={onToDraft}>⚾ ドラフト会議へ →</button>
      </div>
    </div>
  );
}
/* ═══════════════════════════════════════════════
   STATS APPLY HELPER
   log の全打席を正確に選手statsへ反映する
═══════════════════════════════════════════════ */

export function RetirePhaseScreen({teams,myId,year,onNext}){
  const myTeam=teams.find(t=>t.id===myId);
  const [results,setResults]=useState({}); // {pid: "retained"|"retain_failed"|"accepted"}
  const candidates=myTeam.players.filter(p=>p.age>=35&&!p.isRetired);
  const rsLabel=(rs)=>rs===undefined?"---":rs>=70?"潔い引退型":rs<=30?"燃え尽き型":"普通型";
  const willLabel=(w)=>w>=70?"引退意欲：高":w>=40?"引退意欲：中":"引退意欲：低";

  const handleRetain=(p)=>{
    const success=Math.random()*100>(p.retireStyle||50);
    setResults(prev=>({...prev,[p.id]:success?"retained":"retain_failed"}));
  };
  const handleAccept=(p)=>{
    setResults(prev=>({...prev,[p.id]:"accepted"}));
  };

  const needsAction=candidates.filter(p=>calcRetireWill(p)>=30);
  const allDone=needsAction.every(p=>results[p.id]);

  // onNextに引退確定選手のIDセットを渡す
  const handleNext=()=>{
    const decisions={};
    Object.entries(results).forEach(function(e){decisions[e[0]]=e[1];});
    onNext(decisions);
  };

  return(
    <div className="app">
      <div style={{padding:"16px 14px 0"}}>
        <div style={{fontSize:11,color:"#94a3b8",letterSpacing:".1em",marginBottom:4}}>OFFSEASON</div>
        <div style={{fontSize:20,fontWeight:700,color:"#f5c842",marginBottom:16}}>⚾ 引退フェーズ — {year}年</div>
        {candidates.length===0&&(
          <div className="card" style={{textAlign:"center",padding:"32px 16px"}}>
            <div style={{fontSize:32,marginBottom:8}}>✅</div>
            <div style={{fontSize:13,color:"#94a3b8"}}>引退候補の選手はいません</div>
            <button className="btn btn-gold" style={{marginTop:16,padding:"10px 32px"}} onClick={()=>onNext({})}>次へ（戦力外フェーズ）→</button>
          </div>
        )}
        {candidates.map(p=>{
          const will=calcRetireWill(p);
          const res=results[p.id];
          const willColor=will>=70?"#f87171":will>=40?"#f5c842":"#34d399";
          return(
            <div key={p.id} className="card" style={{marginBottom:10}}>
              <div className="fsb" style={{marginBottom:4}}>
                <div>
                  <span style={{fontWeight:700,fontSize:14}}>{p.name}</span>
                  <span style={{fontSize:11,color:"#94a3b8",marginLeft:8}}>{p.age}歳 / {p.pos}</span>
                </div>
                <span style={{fontSize:10,color:"#a78bfa"}}>{rsLabel(p.retireStyle)}</span>
              </div>
              <div style={{fontSize:10,color:willColor,marginBottom:8}}>{willLabel(will)}</div>
              {will>=30&&!res&&(
                <div style={{display:"flex",gap:6}}>
                  <button className="bsm btn-gold" style={{flex:1,padding:"7px 0"}} onClick={()=>handleRetain(p)}>引き留める</button>
                  <button className="bsm bgr" style={{flex:1,padding:"7px 0"}} onClick={()=>handleAccept(p)}>引退を受け入れる</button>
                </div>
              )}
              {res==="retained"&&(
                <div style={{padding:"8px 10px",background:"rgba(52,211,153,.08)",borderRadius:6,fontSize:11,color:"#34d399"}}>
                  ✅ 引き留め成功！来季も続投します
                </div>
              )}
              {res==="retain_failed"&&(
                <div style={{padding:"8px 10px",background:"rgba(248,113,113,.08)",borderRadius:6,fontSize:11,color:"#f87171"}}>
                  ❌ 引き留め失敗…引退を決意しました
                </div>
              )}
              {res==="accepted"&&(
                <div style={{padding:"8px 10px",background:"rgba(148,163,184,.08)",borderRadius:6,fontSize:11,color:"#94a3b8"}}>
                  👋 引退を受け入れました。お疲れ様でした
                </div>
              )}
              {will<30&&(
                <div style={{fontSize:10,color:"#34d399"}}>現役続行意欲あり — 対応不要</div>
              )}
            </div>
          );
        })}
        {candidates.length>0&&(
          <button className="btn btn-gold" style={{width:"100%",padding:"12px 0",marginTop:8,opacity:allDone?1:0.5}} onClick={()=>{if(allDone)handleNext();}}>
            戦力外フェーズへ →
          </button>
        )}
      </div>
    </div>
  );
}
/* ═══════════════════════════════════════════════
   WAIVER PHASE SCREEN
═══════════════════════════════════════════════ */

export function WaiverPhaseScreen({teams,myId,year,onRelease,onNext}){
  const myTeam=teams.find(t=>t.id===myId);
  const [marked,setMarked]=useState([]);
  const toggle=(pid)=>setMarked(prev=>prev.includes(pid)?prev.filter(x=>x!==pid):[...prev,pid]);
  const candidates=myTeam.players.filter(p=>p.contractYearsLeft===0&&!p.isRetired);
  const others=myTeam.players.filter(p=>p.contractYearsLeft>0&&!p.isRetired);
  return(
    <div className="app">
      <div style={{padding:"16px 14px 0"}}>
        <div style={{fontSize:11,color:"#94a3b8",letterSpacing:".1em",marginBottom:4}}>OFFSEASON</div>
        <div style={{fontSize:20,fontWeight:700,color:"#f5c842",marginBottom:4}}>✂️ 戦力外フェーズ — {year}年</div>
        <div style={{fontSize:11,color:"#94a3b8",marginBottom:16}}>契約満了選手の処遇を決定してください</div>
        <div className="card" style={{marginBottom:10}}>
          <div className="card-h">契約満了選手（{candidates.length}人）</div>
          {candidates.length===0&&<div style={{fontSize:11,color:"#374151"}}>対象選手なし</div>}
          {candidates.map(p=>(
            <div key={p.id} className="fsb" style={{padding:"6px 0",borderBottom:"1px solid rgba(255,255,255,.04)"}}>
              <div>
                <span style={{fontSize:12,fontWeight:700}}>{p.name}</span>
                <span style={{fontSize:10,color:"#374151",marginLeft:6}}>{p.pos} / {p.age}歳</span>
              </div>
              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                <span style={{fontSize:10,color:"#f5c842"}}>{fmtSal(p.salary)}/年</span>
                <button className={"bsm "+(marked.includes(p.id)?"bgr":"bga")} onClick={()=>toggle(p.id)}>
                  {marked.includes(p.id)?"✓ 戦力外":"戦力外"}
                </button>
              </div>
            </div>
          ))}
        </div>
        {marked.length>0&&(
          <div className="card" style={{marginBottom:10,background:"rgba(248,113,113,.06)"}}>
            <div style={{fontSize:11,color:"#f87171",marginBottom:6}}>⚠️ 戦力外通告 {marked.length}人</div>
            {marked.map(pid=>{const p=myTeam.players.find(x=>x.id===pid);return p?(
              <div key={pid} style={{fontSize:11,color:"#94a3b8",padding:"2px 0"}}>{p.name}（{p.pos}/{p.age}歳）</div>
            ):null;})}
          </div>
        )}
        <button className="btn btn-gold" style={{width:"100%",padding:"12px 0",marginTop:8}} onClick={()=>onNext(marked)}>
          ドラフトへ →
        </button>
      </div>
    </div>
  );
}


/* ═══════════════════════════════════════════════
   GROWTH SUMMARY SCREEN
   年度末の成長・劣化レポート
═══════════════════════════════════════════════ */

export function GrowthSummaryScreen({ summary, year, onNext }) {
  const { breakout = [], growth = [], decline = [] } = summary || {};
  const hasAny = breakout.length + growth.length + decline.length > 0;
  return (
    <div className="app">
      <div style={{ padding: "16px 14px 0" }}>
        <div style={{ fontSize: 11, color: "#94a3b8", letterSpacing: ".1em", marginBottom: 4 }}>OFFSEASON</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#f5c842", marginBottom: 4 }}>📈 選手成長レポート — {year}年</div>
        <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 16 }}>今シーズン終了後の能力値変化です</div>

        {breakout.length > 0 && (
          <div className="card" style={{ marginBottom: 10, background: "rgba(251,191,36,.06)", border: "1px solid rgba(251,191,36,.2)" }}>
            <div className="card-h" style={{ color: "#f5c842" }}>🔥 ブレイクアウト</div>
            {breakout.map((item, i) => (
              <div key={i} style={{ fontSize: 12, padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                <span style={{ fontWeight: 700, color: "#e0d4bf" }}>{item.p.name}</span>
                <span style={{ fontSize: 10, color: "#94a3b8", marginLeft: 6 }}>{item.p.age}歳</span>
                <span style={{ fontSize: 11, color: "#f5c842", marginLeft: 8 }}>+{item.diff}pt 急成長</span>
              </div>
            ))}
          </div>
        )}

        {growth.length > 0 && (
          <div className="card" style={{ marginBottom: 10 }}>
            <div className="card-h" style={{ color: "#34d399" }}>📈 成長</div>
            {growth.map((item, i) => (
              <div key={i} style={{ fontSize: 11, padding: "3px 0", borderBottom: "1px solid rgba(255,255,255,.04)", display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#e0d4bf" }}>{item.p.name} <span style={{ color: "#94a3b8", fontSize: 10 }}>{item.p.age}歳</span></span>
                <span style={{ color: "#34d399" }}>+{item.diff}pt</span>
              </div>
            ))}
          </div>
        )}

        {decline.length > 0 && (
          <div className="card" style={{ marginBottom: 10 }}>
            <div className="card-h" style={{ color: "#f87171" }}>📉 下降</div>
            {decline.map((item, i) => (
              <div key={i} style={{ fontSize: 11, padding: "3px 0", borderBottom: "1px solid rgba(255,255,255,.04)", display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#94a3b8" }}>{item.p.name} <span style={{ fontSize: 10 }}>{item.p.age}歳</span></span>
                <span style={{ color: "#f87171" }}>{item.diff}pt</span>
              </div>
            ))}
          </div>
        )}

        {!hasAny && (
          <div className="card" style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 12, color: "#374151" }}>今シーズンは大きな変化なし</div>
          </div>
        )}

        <button className="btn btn-gold" style={{ width: "100%", padding: "12px 0", marginTop: 8 }} onClick={onNext}>
          戦力外フェーズへ →
        </button>
      </div>
    </div>
  );
}


/* ═══════════════════════════════════════════════
   RETIRE PHASE SCREEN
═══════════════════════════════════════════════ */
