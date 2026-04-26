import React, { useState } from "react";

export function NewsTab({news,onInterview,seasonHistory,currentYear}){
  const [sel,setSel]=useState(null);
  const [answered,setAnswered]=useState({});
  const [transferYear,setTransferYear]=useState("all");
  const icon=t=>t==="game"?"⚾":t==="trade"?"🔄":t==="draft"?"📋":t==="interview"?"🎤":t==="season"?"🏆":"📰";
  const col=t=>t==="game"?"#60a5fa":t==="trade"?"#f97316":t==="draft"?"#a78bfa":t==="interview"?"#f5c842":t==="season"?"#34d399":"#94a3b8";
  const transferLogs=(seasonHistory?.transfers||[]).slice().sort((a,b)=>{
    if((b.year||0)!==(a.year||0)) return (b.year||0)-(a.year||0);
    if((b.day||0)!==(a.day||0)) return (b.day||0)-(a.day||0);
    return (b.timestamp||0)-(a.timestamp||0);
  });
  const transferYears=["all",...new Set(transferLogs.map(l=>l.year).filter(Boolean))];
  const shownTransfers=transferYear==="all"?transferLogs:transferLogs.filter(l=>String(l.year)===transferYear);
  const handleAnswer=(newsId,opt)=>{
    onInterview(newsId,opt);
    setAnswered(prev=>({...prev,[newsId]:opt}));
    setSel(prev=>prev?{...prev,_answered:opt}:null);
  };
  return(
    <div style={{display:"grid",gridTemplateColumns:sel?"1fr 1fr":"1fr",gap:8}}>
      <div className="card" style={{padding:"10px"}}>
        <div className="card-h">📰 スポーツニュース</div>
        {news.length===0&&<p style={{fontSize:11,color:"#374151",padding:"12px 0"}}>試合を進めるとニュースが届きます</p>}
        {[...news].sort((a,b)=>b.timestamp-a.timestamp).map(n=>{
          const needsAnswer=n.type==="interview"&&!answered[n.id];
          return(<div key={n.id} onClick={()=>setSel(n)} style={{padding:"8px 10px",marginBottom:4,borderRadius:6,cursor:"pointer",background:sel?.id===n.id?"rgba(245,200,66,.08)":needsAnswer?"rgba(245,200,66,.03)":"rgba(255,255,255,.02)",border:sel?.id===n.id?"1px solid rgba(245,200,66,.3)":needsAnswer?"1px solid rgba(245,200,66,.15)":"1px solid rgba(255,255,255,.04)"}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
              <span style={{fontSize:11,color:col(n.type)}}>{icon(n.type)}</span>
              {needsAnswer&&<span style={{fontSize:8,background:"#f5c842",color:"#000",borderRadius:4,padding:"1px 5px",fontWeight:700}}>回答待ち</span>}
              <span style={{fontSize:11,fontWeight:needsAnswer?700:400,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{n.headline}</span>
            </div>
            <div style={{fontSize:9,color:"#374151",paddingLeft:18}}>{n.source} · {n.dateLabel}</div>
          </div>);
        })}
      </div>
      <div className="card" style={{padding:"10px"}}>
        <div className="card-h">🌐 球界移籍トラッカー</div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,gap:8}}>
          <div style={{fontSize:10,color:"#374151"}}>シーズン中の全球団トレード履歴（過去シーズン閲覧対応）</div>
          <select value={transferYear} onChange={e=>setTransferYear(e.target.value)} style={{background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.12)",color:"#e0d4bf",borderRadius:6,padding:"4px 6px",fontSize:10}}>
            {transferYears.map(y=><option key={String(y)} value={String(y)}>{y==="all"?"全年度":`${y}年`}{y===currentYear?"（今季）":""}</option>)}
          </select>
        </div>
        {shownTransfers.length===0&&<p style={{fontSize:11,color:"#374151",padding:"8px 0"}}>この年度の移籍ログはまだありません</p>}
        {shownTransfers.slice(0,120).map(item=>(
          <div key={item.id} style={{padding:"8px 10px",marginBottom:5,borderRadius:6,background:"rgba(249,115,22,.06)",border:"1px solid rgba(249,115,22,.2)"}}>
            <div style={{display:"flex",justifyContent:"space-between",gap:6,alignItems:"center"}}>
              <div style={{fontSize:11,fontWeight:700,color:"#f97316"}}>{item.headline||"トレード"}</div>
              <div style={{fontSize:9,color:"#94a3b8"}}>{item.year}年 {item.day?`${item.day}日目`:""}</div>
            </div>
            <div style={{fontSize:10,color:"#d1d5db",marginTop:4}}>
              IN: {(item.playersIn||[]).join("、")||"なし"} / OUT: {(item.playersOut||[]).join("、")||"なし"}
              {Number(item.cash)!==0&&<span style={{marginLeft:6,color:"#f5c842"}}>{Number(item.cash)>0?`金銭支払い ${Math.abs(item.cash).toLocaleString()}万円`:`金銭受取 ${Math.abs(item.cash).toLocaleString()}万円`}</span>}
            </div>
            {item.detail&&<div style={{fontSize:9,color:"#94a3b8",marginTop:3,whiteSpace:"pre-wrap"}}>{item.detail}</div>}
          </div>
        ))}
      </div>
      {sel&&(
        <div className="card" style={{padding:"12px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <span style={{fontSize:10,color:col(sel.type),fontWeight:700}}>{icon(sel.type)} {sel.source}</span>
            <button className="bsm bga" onClick={()=>setSel(null)}>✕</button>
          </div>
          <div style={{fontWeight:700,fontSize:13,lineHeight:1.5,marginBottom:4}}>{sel.headline}</div>
          <div style={{fontSize:9,color:"#374151",marginBottom:10}}>{sel.dateLabel}</div>
          <div style={{fontSize:12,color:"#e0d4bf",lineHeight:1.8,marginBottom:12,whiteSpace:"pre-wrap"}}>{sel.body}</div>
          {sel.type==="interview"&&!answered[sel.id]&&!sel._answered&&(
            <div style={{borderTop:"1px solid rgba(255,255,255,.08)",paddingTop:10}}>
              <div style={{fontSize:11,color:"#f5c842",fontWeight:700,marginBottom:8}}>🎤 記者: 「{sel.question}」</div>
              <div style={{fontSize:10,color:"#374151",marginBottom:8}}>あなたの回答を選んでください（球団人気・選手モラルに影響）</div>
              {sel.options.map((opt,i)=>(
                <div key={i} onClick={()=>handleAnswer(sel.id,opt)} style={{padding:"10px",marginBottom:6,borderRadius:6,cursor:"pointer",background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.08)"}}>
                  <div style={{fontSize:11,color:"#e0d4bf",marginBottom:3}}>{opt.text}</div>
                  <div style={{fontSize:9,color:"#374151"}}>人気 {opt.popMod>=0?"+":""}{opt.popMod} ／ モラル {opt.moraleMod>=0?"+":""}{opt.moraleMod}</div>
                </div>
              ))}
            </div>
          )}
          {(answered[sel.id]||sel._answered)&&sel.type==="interview"&&(
            <div style={{borderTop:"1px solid rgba(255,255,255,.08)",paddingTop:10}}>
              <div style={{fontSize:10,color:"#374151",marginBottom:4}}>あなたの回答：</div>
              <div style={{fontSize:11,color:"#f5c842",fontStyle:"italic",lineHeight:1.6}}>{(answered[sel.id]||sel._answered)?.text}</div>
              <div style={{fontSize:9,color:"#34d399",marginTop:6}}>人気 {(answered[sel.id]||sel._answered)?.popMod>=0?"+":""}{(answered[sel.id]||sel._answered)?.popMod} ／ モラル {(answered[sel.id]||sel._answered)?.moraleMod>=0?"+":""}{(answered[sel.id]||sel._answered)?.moraleMod}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
