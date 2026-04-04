import React, { useState } from "react";

export function StandingsTab({teams,myId,onTeamClick}){
  const myLeague=teams.find(t=>t.id===myId)?.league;
  const [lg,setLg]=useState(myLeague||"セ");
  const sorted=[...teams.filter(t=>t.league===lg)].sort((a,b)=>{const pa=a.wins/Math.max(1,a.wins+a.losses),pb=b.wins/Math.max(1,b.wins+b.losses);return pb-pa||(b.rf-b.ra)-(a.rf-a.ra);});
  const top=sorted[0];
  return(
    <div>
      <div style={{display:"flex",gap:6,marginBottom:10}}>{["セ","パ"].map(l=><button key={l} onClick={()=>setLg(l)} className={`tab ${lg===l?"on":""}`} style={{flex:0,padding:"6px 18px"}}>{l}リーグ</button>)}</div>
      <div className="card"><div style={{overflowX:"auto"}}>
        <table className="tbl">
          <thead><tr><th>順位</th><th>チーム</th><th>試合</th><th style={{color:"#34d399"}}>勝</th><th style={{color:"#f87171"}}>敗</th><th>勝率</th><th>G差</th><th>得点</th><th>失点</th><th>得失差</th></tr></thead>
          <tbody>{sorted.map((t,i)=>{
            const g=t.wins+t.losses+t.draws;
            const gb=i===0?"—":(((top.wins-t.wins)+(t.losses-top.losses))/2).toFixed(1);
            const isMe=t.id===myId;
            return(<tr key={t.id} style={{background:isMe?"rgba(245,200,66,.04)":undefined}}>
              <td><span className="mono" style={{color:i===0?"#ffd700":i===1?"#94a3b8":i===2?"#b45309":"#1e2d3d",fontWeight:700,fontSize:15}}>{i+1}</span></td>
              <td><button
                onClick={()=>onTeamClick?.(t)}
                style={{background:"none",border:"none",cursor:"pointer",color:"inherit",fontWeight:"inherit",padding:0}}
              ><span style={{color:t.color,marginRight:5}}>{t.emoji}</span><span style={{fontWeight:isMe?700:400,color:isMe?"#f5c842":undefined}}>{t.name}{isMe&&" ★"}</span></button></td>
              <td className="mono">{g}</td><td className="mono" style={{color:"#34d399"}}>{t.wins}</td><td className="mono" style={{color:"#f87171"}}>{t.losses}</td>
              <td className="mono">{t.wins+t.losses>0?"."+String(Math.round(t.wins/(t.wins+t.losses)*1000)).padStart(3,"0"):"---"}</td>
              <td className="mono" style={{color:"#374151"}}>{gb}</td>
              <td className="mono">{t.rf}</td><td className="mono">{t.ra}</td>
              <td className="mono" style={{color:(t.rf-t.ra)>0?"#34d399":(t.rf-t.ra)<0?"#f87171":"#374151"}}>{(t.rf-t.ra)>0?"+":""}{t.rf-t.ra}</td>
            </tr>);
          })}</tbody>
        </table>
      </div></div>
    </div>
  );
}
