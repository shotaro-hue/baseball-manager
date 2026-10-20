import React, { useRef, useState } from "react";
import { DecisionConfirmation, money } from '../management/DecisionParts';

export function MailboxTab({ mailbox, unreadCount = 0, onRead, onAction, teams, myTeam, onTrade, onTeamClick, gameDay, onNavigate }){
  const [selectedId, setSelectedId] = useState(null);
  const [confirmation, setConfirmation] = useState(null), [actionError, setActionError] = useState(null);
  const busy = useRef(false), current = useRef(null), handled = useRef(new Set());
  const selectedHeading = useRef(null);
  // The linked trade screen can resolve this mail while the inbox is hidden.
  const selected = mailbox.find(mail => mail.id === selectedId) ?? null;
  current.current = { selected, confirmation };
  const decide = action => { busy.current = false; setActionError(null); setConfirmation({ id: selected.id, action }); };
  const confirm = () => {
    const c = current.current;
    if (busy.current || !c.confirmation || !c.selected || c.selected.id !== c.confirmation.id || c.selected.resolved || handled.current.has(c.selected.id)) return;
    busy.current = true;
    if (onAction(c.selected.id, c.confirmation.action) === true) handled.current.add(c.selected.id);
    else { busy.current = false; setActionError('確定できませんでした。通知と最新の所属・予算を確認してください。'); }
    setConfirmation(null);
  };

  const handleSelect = (m) => {
    setSelectedId(m.id);
    setConfirmation(null); setActionError(null);
    if(!m.read) onRead(m.id);
  };

  const typeIcon = t => t==="trade"?"🔄":t==="posting_request"?"✈️":t==="posting_result"?"💰":t==="cpu_fa_summary"?"🗞":t==="info"?"📋":t==="scout"?"🔍":t==="contract_reply"?"✉️":"📨";
  const typeColor = t => t==="trade"?"#f97316":t==="posting_request"?"#34d399":t==="posting_result"?"#f5c842":t==="cpu_fa_summary"?"#38bdf8":t==="info"?"#60a5fa":t==="scout"?"#a78bfa":t==="contract_reply"?"#22d3ee":"#94a3b8";
  const typeLabel = t => t==="trade"?"トレードオファー":t==="contract_reply"?"契約回答":"お知らせ";

  return(
    <div style={{display:"grid", gridTemplateColumns: selected?"1fr 1fr":"1fr", gap:8}}>
      <div className="card" style={{padding:"10px"}}>
        <div className="card-h">
          📨 メールボックス
          {unreadCount>0&&<span style={{marginLeft:8,background:"#f87171",color:"#fff",borderRadius:10,padding:"1px 7px",fontSize:10,fontWeight:700}}>{unreadCount}</span>}
        </div>
        {mailbox.length===0&&<p style={{fontSize:11,color:"#374151",padding:"12px 0"}}>メールはありません</p>}
        {mailbox.map(m=>(
          <div key={m.id} onClick={()=>handleSelect(m)} role="button" tabIndex={0} aria-label={m.title} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSelect(m); } }}
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

      {selected&&(
        <div className="card" style={{padding:"12px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <span style={{fontSize:10,color:typeColor(selected.type),fontWeight:700}}>{typeIcon(selected.type)} {typeLabel(selected.type)}</span>
            <button className="bsm bga" onClick={()=>setSelectedId(null)}>✕</button>
          </div>
          <div ref={selectedHeading} role="heading" aria-level={3} tabIndex={-1} style={{fontWeight:700,fontSize:14,marginBottom:4}}>{selected.title}</div>
          <div style={{fontSize:10,color:"#374151",marginBottom:10}}>差出人: {selected.from} · {selected.dateLabel}</div>
          <div style={{fontSize:12,color:"#e0d4bf",lineHeight:1.7,marginBottom:12,whiteSpace:"pre-wrap"}}>{selected.body}</div>

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
                <button className="bsm bga" style={{flex:1}} disabled={handled.current.has(selected.id)} onClick={()=>decide('accept')}>✅ 承諾する</button>
                <button className="bsm bgr" style={{flex:1}} disabled={handled.current.has(selected.id)} onClick={()=>decide('decline')}>❌ 断る</button>
              </div>
            </div>
          )}

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
                <button className="bsm bga" style={{flex:1}} disabled={handled.current.has(selected.id)} onClick={()=>decide('accept')}>✅ 承認する</button>
                <button className="bsm bgr" style={{flex:1}} disabled={handled.current.has(selected.id)} onClick={()=>decide('decline')}>❌ 拒否する</button>
              </div>
            </div>
          )}

          {selected.type==="cpu_fa_summary"&&selected.signings?.length>0&&(
            <div style={{marginTop:12,display:"flex",flexDirection:"column",gap:8}}>
              {selected.signings.map(s=>{
                const teamObj=teams?.find(t=>t.id===s.teamId);
                return(
                  <div key={s.teamId} style={{display:"flex",alignItems:"baseline",gap:8,flexWrap:"wrap"}}>
                    <button
                      onClick={()=>teamObj&&onTeamClick?.(teamObj)}
                      style={{background:"rgba(56,189,248,.12)",border:"1px solid rgba(56,189,248,.35)",color:"#7dd3fc",borderRadius:6,padding:"3px 8px",cursor:"pointer",fontSize:12,fontWeight:700}}
                    >
                      {s.teamEmoji} {s.teamName}
                    </button>
                    <span style={{color:"#94a3b8",fontSize:13}}>{s.players.join('、')}</span>
                  </div>
                );
              })}
            </div>
          )}

          {onNavigate && selected.type === 'trade' && selected.offer && <button className="bsm bga" style={{minHeight:44,marginBottom:12}} onClick={() => onNavigate('trade', selected.id)}>トレード画面で検討する</button>}
          {onNavigate && selected.type === 'contract_reply' && selected.decision?.playerId != null && <button className="bsm bga" style={{minHeight:44}} onClick={() => onNavigate('contract', selected.decision.playerId)}>この選手の契約状況を見る</button>}
          {actionError && <p role="alert">{actionError}</p>}
          {confirmation?.id === selected.id && <div className="management-decisions"><DecisionConfirmation
            fallbackFocus={selectedHeading}
            title={selected.type === 'posting_request' ? 'ポスティング判断の確認' : 'トレード判断の確認'}
            onCancel={() => setConfirmation(null)} onConfirm={confirm}
            confirmLabel={confirmation.action === 'decline' ? '辞退を確定する' : selected.type === 'posting_request' ? '承認を確定する' : '承諾を確定する'}
            error={selected.resolved || handled.current.has(selected.id) ? 'この案件は対応済みです。再実行できません。' : null}>
            <p>{selected.title}</p>
            {confirmation.action === 'decline' ? <p>{selected.type === 'posting_request' ? '移籍を拒否し、選手のモラルが10下がります。' : 'この提案を辞退します。所属・予算は変わりません。'}</p>
              : selected.type === 'posting_request' ? <p>選手は所属を離れてMLBへ移籍し、既存ルールによる移籍金を受け取ります。</p>
                : <><p>放出：{selected.offer.want.map(p => p.name).join('、') || 'なし'} / 獲得：{selected.offer.offer.map(p => p.name).join('、') || 'なし'}</p><p>金銭受取 {money((selected.offer.cash ?? 0) / 10000)}。確定時に両球団の予算と所属を検証します。</p></>}
            <p>確定後は取消できません。</p>
          </DecisionConfirmation></div>}
          {selected.resolved&&<div style={{textAlign:"center",fontSize:11,color:"#374151",padding:"8px"}}>対応済み</div>}
        </div>
      )}
    </div>
  );
}
