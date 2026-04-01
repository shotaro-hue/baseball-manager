import React, { useState } from "react";

export function MailboxTab({mailbox, onRead, onAction, teams, myTeam, onTrade}){
  const [selected, setSelected] = useState(null);
  const unread = mailbox.filter(m=>!m.read).length;

  const handleSelect = (m) => {
    setSelected(m);
    if(!m.read) onRead(m.id);
  };

  const typeIcon = t => t==="trade"?"🔄":t==="posting_request"?"✈️":t==="posting_result"?"💰":t==="info"?"📋":t==="scout"?"🔍":"📨";
  const typeColor = t => t==="trade"?"#f97316":t==="posting_request"?"#34d399":t==="posting_result"?"#f5c842":t==="info"?"#60a5fa":t==="scout"?"#a78bfa":"#94a3b8";

  return(
    <div style={{display:"grid", gridTemplateColumns: selected?"1fr 1fr":"1fr", gap:8}}>
      {/* メール一覧 */}
      <div className="card" style={{padding:"10px"}}>
        <div className="card-h">
          📨 メールボックス
          {unread>0&&<span style={{marginLeft:8,background:"#f87171",color:"#fff",borderRadius:10,padding:"1px 7px",fontSize:10,fontWeight:700}}>{unread}</span>}
        </div>
        {mailbox.length===0&&<p style={{fontSize:11,color:"#374151",padding:"12px 0"}}>メールはありません</p>}
        {[...mailbox].sort((a,b)=>b.timestamp-a.timestamp).map(m=>(
          <div key={m.id} onClick={()=>handleSelect(m)}
            style={{padding:"8px 10px",marginBottom:4,borderRadius:6,cursor:"pointer",
              background:selected?.id===m.id?"rgba(245,200,66,.08)":m.read?"rgba(255,255,255,.02)":"rgba(255,255,255,.05)",
              border:selected?.id===m.id?"1px solid rgba(245,200,66,.3)":m.read?"1px solid transparent":"1px solid rgba(255,255,255,.1)"}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
              <span style={{fontSize:12}}>{typeIcon(m.type)}</span>
              {!m.read&&<span style={{width:6,height:6,borderRadius:"50%",background:"#f87171",display:"inline-block",flexShrink:0}}/>}
              <span style={{fontSize:11,fontWeight:m.read?400:700,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.title}</span>
            </div>
            <div style={{fontSize:9,color:"#374151",paddingLeft:18}}>{m.from} · {m.dateLabel}</div>
          </div>
        ))}
      </div>

      {/* メール詳細 */}
      {selected&&(
        <div className="card" style={{padding:"12px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <span style={{fontSize:10,color:typeColor(selected.type),fontWeight:700}}>{typeIcon(selected.type)} {selected.type==="trade"?"トレードオファー":"お知らせ"}</span>
            <button className="bsm bga" onClick={()=>setSelected(null)}>✕</button>
          </div>
          <div style={{fontWeight:700,fontSize:14,marginBottom:4}}>{selected.title}</div>
          <div style={{fontSize:10,color:"#374151",marginBottom:10}}>差出人: {selected.from} · {selected.dateLabel}</div>
          <div style={{fontSize:12,color:"#e0d4bf",lineHeight:1.7,marginBottom:12,whiteSpace:"pre-wrap"}}>{selected.body}</div>

          {/* トレードオファーの場合は承諾/拒否ボタン */}
          {selected.type==="trade"&&selected.offer&&!selected.resolved&&(
            <div>
              <div style={{marginBottom:10,padding:"8px",borderRadius:6,background:"rgba(249,115,22,.06)",border:"1px solid rgba(249,115,22,.2)"}}>
                <div style={{fontSize:10,color:"#374151",marginBottom:6}}>オファー内容</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",gap:6,alignItems:"center"}}>
                  <div>
                    <div style={{fontSize:9,color:"#f87171",marginBottom:2}}>あなたが出す</div>
                    {selected.offer.want.map(p=>(<div key={p.id} style={{fontSize:11,color:"#f87171",fontWeight:700}}>{p.name}<span style={{fontSize:9,color:"#374151",marginLeft:4}}>{p.pos}</span></div>))}
                  </div>
                  <div style={{fontSize:16}}>⇄</div>
                  <div>
                    <div style={{fontSize:9,color:"#34d399",marginBottom:2}}>あなたが受け取る</div>
                    {selected.offer.offer.map(p=>(<div key={p.id} style={{fontSize:11,color:"#34d399",fontWeight:700}}>{p.name}<span style={{fontSize:9,color:"#374151",marginLeft:4}}>{p.pos}</span></div>))}
                    {selected.offer.cash>0&&<div style={{fontSize:10,color:"#f5c842"}}>+{(selected.offer.cash/10000).toLocaleString()}万円</div>}
                  </div>
                </div>
              </div>
              <div style={{display:"flex",gap:8}}>
                <button className="bsm bga" style={{flex:1}} onClick={()=>{onAction(selected.id,"accept");setSelected({...selected,resolved:true});}}>✅ 承諾する</button>
                <button className="bsm bgr" style={{flex:1}} onClick={()=>{onAction(selected.id,"decline");setSelected({...selected,resolved:true});}}>❌ 断る</button>
              </div>
            </div>
          )}

          {/* ポスティング申請の場合は承諾/拒否ボタン */}
          {selected.type==="posting_request"&&!selected.resolved&&(
            <div>
              <div style={{marginBottom:10,padding:"10px",borderRadius:6,background:"rgba(52,211,153,.06)",border:"1px solid rgba(52,211,153,.2)"}}>
                <div style={{fontSize:10,color:"#34d399",marginBottom:6}}>✈️ ポスティング申請</div>
                <div style={{fontSize:11,color:"#e2e8f0",lineHeight:1.6}}>
                  承認 → 選手はMLBへ移籍、球団に移籍金収入<br/>
                  拒否 → 選手がチームに残留（モラル -10）
                </div>
              </div>
              <div style={{display:"flex",gap:8}}>
                <button className="bsm bga" style={{flex:1}} onClick={()=>{onAction(selected.id,"accept");setSelected({...selected,resolved:true});}}>✅ 承認する</button>
                <button className="bsm bgr" style={{flex:1}} onClick={()=>{onAction(selected.id,"decline");setSelected({...selected,resolved:true});}}>❌ 拒否する</button>
              </div>
            </div>
          )}

          {selected.resolved&&<div style={{textAlign:"center",fontSize:11,color:"#374151",padding:"8px"}}>対応済み</div>}
        </div>
      )}
    </div>
  );
}
