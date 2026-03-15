import { useState } from "react";
import { IS_HIT, RLABEL } from '../constants';



export function BatchResultScreen({results,myTeam,onEnd}){
  const [sel,setSel]=useState(null);
  const wins=results.filter(r=>r.won).length;
  const losses=results.length-wins;

  const selGame=sel!=null?results[sel]:null;
  // Build inning scores for selected game
  const inningScores={};
  if(selGame){
    (selGame.inningSummary||[]).forEach(s=>{
      if(!inningScores[s.inning]) inningScores[s.inning]={top:"-",bot:"-"};
      if(s.isTop) inningScores[s.inning].top=s.runs;
      else inningScores[s.inning].bot=s.runs;
    });
  }
  const innings=selGame?Array.from({length:Math.max(9,(selGame.inningSummary||[]).reduce((m,s)=>Math.max(m,s.inning),9))},(_,i)=>i+1):[];

  return(
    <div className="app">
      <div style={{maxWidth:680,margin:"0 auto",padding:"16px 12px"}}>
        {/* サマリー */}
        <div className="card" style={{textAlign:"center",marginBottom:12}}>
          <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:42,letterSpacing:".1em",color:wins>losses?"#f5c842":wins<losses?"#f87171":"#94a3b8",marginBottom:4}}>
            {wins}勝 {losses}敗
          </div>
          <div style={{fontSize:12,color:"#374151",marginBottom:10}}>第{results[0]?.gameNo}〜{results[results.length-1]?.gameNo}戦 / {results.length}試合</div>
          <div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap"}}>
            {results.map((r,i)=>(
              <button key={i} onClick={()=>setSel(sel===i?null:i)}
                className={`bsm ${sel===i?"bgy":r.won?"bga":"bgr"}`}
                style={{minWidth:70,padding:"7px 10px",fontSize:12}}>
                <span style={{fontSize:9,display:"block",color:"inherit",opacity:.7}}>第{r.gameNo}戦</span>
                {r.oppTeam?.short} {r.score.my}-{r.score.opp}
                <span style={{marginLeft:4}}>{r.won?"✓":"✗"}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 選択した試合のスコアボード */}
        {selGame&&(
          <div className="card" style={{marginBottom:12,animation:"fi .2s"}}>
            <div className="card-h">第{selGame.gameNo}戦 詳細 — vs {selGame.oppTeam?.name}</div>
            <div style={{overflowX:"auto",marginBottom:10}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontFamily:"'Share Tech Mono',monospace",fontSize:11,whiteSpace:"nowrap"}}>
                <thead><tr>
                  <td style={{padding:"4px 8px",color:"#374151",fontSize:9,minWidth:80}}>チーム</td>
                  {innings.map(i=><td key={i} style={{textAlign:"center",padding:"4px 6px",color:"#374151",fontSize:9}}>{i}</td>)}
                  <td style={{textAlign:"center",padding:"4px 8px",fontWeight:700,borderLeft:"2px solid rgba(255,255,255,.06)",fontSize:14}}>R</td>
                </tr></thead>
                <tbody>
                  <tr>
                    <td style={{padding:"5px 8px"}}><span style={{color:selGame.oppTeam?.color}}>{selGame.oppTeam?.emoji} {selGame.oppTeam?.short}</span></td>
                    {innings.map(i=><td key={i} style={{textAlign:"center",color:inningScores[i]?.top>0?"#34d399":"#1e2d3d"}}>{inningScores[i]?.top??"-"}</td>)}
                    <td style={{textAlign:"center",borderLeft:"2px solid rgba(255,255,255,.06)",fontSize:16}}>{selGame.score.opp}</td>
                  </tr>
                  <tr>
                    <td style={{padding:"5px 8px"}}><span style={{color:myTeam?.color}}>{myTeam?.emoji} {myTeam?.short}</span></td>
                    {innings.map(i=><td key={i} style={{textAlign:"center",color:inningScores[i]?.bot>0?"#f5c842":"#1e2d3d"}}>{inningScores[i]?.bot??"-"}</td>)}
                    <td style={{textAlign:"center",borderLeft:"2px solid rgba(255,255,255,.06)",fontSize:16,color:"#f5c842",fontWeight:700}}>{selGame.score.my}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            {/* ハイライト打席 */}
            <div style={{fontSize:10,color:"#374151",marginBottom:6,letterSpacing:".15em"}}>ハイライト</div>
            <div style={{background:"rgba(0,0,0,.3)",borderRadius:6,padding:8,maxHeight:140,overflowY:"auto"}}>
              {(selGame.log||[]).filter(e=>IS_HIT(e.result)||e.result==="hr").slice(0,12).map((e,i)=>(
                <div key={i} style={{padding:"2px 6px",fontSize:11,color:e.result==="hr"?"#f5c842":e.scorer?"#34d399":"#94a3b8",marginBottom:1}}>
                  <span style={{fontSize:9,color:"#1e2d3d",marginRight:4}}>{e.inning}{e.isTop?"表":"裏"}</span>
                  {e.batter} {RLABEL[e.result]}
                  {e.rbi>0&&<span style={{color:"#f5c842",marginLeft:4}}>+{e.rbi}点</span>}
                  {e.ev>0&&<span style={{fontSize:9,color:"#1e2d3d",marginLeft:4}}>{e.ev}km/h {e.dist>0&&`${e.dist}m`}</span>}
                </div>
              ))}
              {(selGame.log||[]).filter(e=>IS_HIT(e.result)).length===0&&<div style={{color:"#1e2d3d",fontSize:11}}>ヒットなし</div>}
            </div>
          </div>
        )}

        <button className="sim-btn" onClick={onEnd}>ハブに戻る →</button>
      </div>
    </div>
  );
}
/* ═══════════════════════════════════════════════
   MODE SELECT SCREEN
═══════════════════════════════════════════════ */
