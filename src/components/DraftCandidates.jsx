import React,{useEffect,useMemo,useRef,useState} from 'react';
import {Button,StateLabel} from './design-system/primitives';
import {DRAFT_SKILLS,draftBand,draftReport,publicDraftTier} from '../engine/draftReports';
import '../draft-decision.css';

export function DraftReportContent({player,report,publicTier,fitReason}) {
  if(!report)return <p>評価情報を確認できません。</p>;
  return <>
    <p className="draft-summary">{report.summary}</p>
    <section className="draft-report-section" aria-label="自球団の見立て">
      <h3>自球団の見立て <StateLabel>確度 {report.confidence}</StateLabel></h3>
      <dl className="draft-evaluation-grid"><div><dt>現在能力の推定</dt><dd>{report.currentRange.join('〜')}</dd></div><div><dt>将来性</dt><dd>{draftBand(report.future)}</dd></div></dl>
      <p className="draft-muted">期待する役割：{report.role}。{fitReason}</p>
      <details><summary>能力の内訳・評価の読み方</summary><dl className="draft-skills">{Object.entries(report.skills).map(([k,v])=><div key={k}><dt>{DRAFT_SKILLS[k]}</dt><dd>{v.low===v.high?v.value:`${v.low}〜${v.high}`}</dd></div>)}</dl>
        <p className="draft-muted">能力は0〜99の評価。推定幅は目安です。将来性は成長・活躍を保証しません。確度は調査の精度を表します。</p>
        {player.fromScout&&<p className="draft-muted">事前調査済み：現在能力は確認済みです。</p>}
      </details>
    </section>
    <section className="draft-report-section"><h3>世間の評価</h3><p><StateLabel>{publicTier}</StateLabel></p></section>
  </>;
}

export default function DraftCandidates({pool,session,onScout,rankings=[],forecast={},onPick,canPick=false,round=1,remainingSlots,savedState,onStateChange,readOnly=false,noNextPick=false}) {
  const [view,setView]=useState(()=>({role:'all',type:'all',sort:'team',selected:null,compare:null,listScroll:0,...savedState}));
  const [confirm,setConfirm]=useState(false),[notice,setNotice]=useState('');
  const callback=useRef(onStateChange),listRef=useRef(null),headingRef=useRef(null),returnId=useRef(null);
  callback.current=onStateChange;
  const signature=JSON.stringify(view);
  useEffect(()=>{callback.current?.(view);},[signature]); // Only view changes are persisted, not callback identities.
  const candidateSignature=pool.map(p=>String(p.id)).sort().join('|');
  useEffect(()=>{
    if(view.selected!=null&&!pool.some(p=>String(p.id)===String(view.selected))){returnId.current=view.selected;setView(v=>({...v,selected:null}));setConfirm(false);setNotice('選択していた候補は指名済みです。残る候補を確認してください。');}
    if(view.compare!=null&&!pool.some(p=>String(p.id)===String(view.compare)))setView(v=>({...v,compare:null}));
  },[candidateSignature]);
  useEffect(()=>{
    if(view.selected!=null)headingRef.current?.focus();
    else {
      if(listRef.current)listRef.current.scrollTop=view.listScroll;
      if(returnId.current!=null && typeof document!=='undefined'){
        (document.getElementById(`draft-candidate-${returnId.current}`) || listRef.current?.querySelector('button'))?.focus();returnId.current=null;
      }
    }
  },[view.selected]);
  const ranking=new Map(rankings.map(r=>[String(r.p.id),r]));
  const displayed=useMemo(()=>pool.filter(p=>(view.role==='all'||(p.subtype||p.pos)===view.role)&&(view.type==='all'||p.prospectType===view.type))
    .sort((a,b)=>{
      const value=p=>view.sort==='public'?(draftReport(session,p.id)?.value ?? -Infinity):(ranking.get(String(p.id))?.score ?? draftReport(session,p.id,session.myId)?.value ?? -Infinity);
      return value(b)-value(a)||String(a.id).localeCompare(String(b.id));
    }),[pool,session,view.role,view.type,view.sort,rankings]);
  const selected=pool.find(p=>String(p.id)===String(view.selected));
  const compared=pool.find(p=>String(p.id)===String(view.compare));
  const report=selected&&draftReport(session,selected.id,session.myId);
  const forecastName=round===1?'競合見込み':'次の自球団指名までの残存見込み';
  const open=p=>{setConfirm(false);setView(v=>({...v,selected:p.id}));};
  const back=()=>{returnId.current=view.selected;setConfirm(false);setView(v=>({...v,selected:null}));};
  const row=p=>{
    const r=draftReport(session,p.id,session.myId),f=forecast[p.id];
    return <article className="draft-candidate-row" key={p.id}>
      <button type="button" className="draft-candidate-open" id={`draft-candidate-${p.id}`} aria-label={`${p.name}のレポート`} aria-pressed={String(view.selected)===String(p.id)} onClick={()=>open(p)}>
        <span className="draft-identity"><strong>{p.name}</strong><span>{p.age}歳 · {p.subtype||p.pos} {p.prospectType&&`· ${p.prospectType}`}</span></span>
        <span className="draft-candidate-trait">{r?.summary || '評価情報なし'}</span>
        <span className="draft-candidate-evaluations"><span>自球団：現在 {draftBand(r?.current)} · 将来 {draftBand(r?.future)}</span><span>{publicDraftTier(session,p.id)} · {round===1?'競合':'残存'} {f?.label || '不明'}</span></span>
      </button>
      {!readOnly&&<button type="button" className="draft-row-select" aria-label={`${p.name}を指名`} onClick={()=>open(p)}>指名を検討</button>}
    </article>;
  };
  return <div className="draft-candidates" data-selected={selected?'true':'false'}>
    <div className="draft-candidate-list">
      <div className="draft-list-heading"><h2>候補一覧 <small>{displayed.length}人</small></h2><span>追加調査 残り <strong>{session.points}</strong>pt</span></div>
      <div className="draft-filters">
        <label>位置・役割<select aria-label="位置・役割" value={view.role} onChange={e=>setView(v=>({...v,role:e.target.value,listScroll:0}))}><option value="all">すべて</option>{[...new Set(pool.map(p=>p.subtype||p.pos))].sort().map(pos=><option key={pos}>{pos}</option>)}</select></label>
        <label>区分<select aria-label="区分" value={view.type} onChange={e=>setView(v=>({...v,type:e.target.value,listScroll:0}))}><option value="all">すべて</option>{[...new Set(pool.map(p=>p.prospectType).filter(Boolean))].sort().map(type=><option key={type}>{type}</option>)}</select></label>
        <label>並び順<select aria-label="並び順" value={view.sort} onChange={e=>setView(v=>({...v,sort:e.target.value,listScroll:0}))}><option value="team">自球団の評価・相性</option><option value="public">世間の評価</option></select></label>
      </div>
      {notice&&<p role="status">{notice}</p>}
      <div className="draft-candidate-scroll" ref={listRef} onScroll={e=>{const scroll=e.currentTarget.scrollTop;setView(v=>({...v,listScroll:scroll}));}}>{displayed.map(row)}{!displayed.length&&<p className="draft-empty">条件に合う候補がいません。</p>}</div>
    </div>
    <div className="draft-candidate-detail">
      {selected?<>
        <Button variant="secondary" onClick={back}>候補一覧に戻る</Button>
        <h2 ref={headingRef} tabIndex={-1}>{selected.name}</h2><p className="draft-muted">{selected.age}歳 · {selected.subtype||selected.pos} · {selected.prospectType || '区分未記録'}</p>
        <DraftReportContent player={selected} report={report} publicTier={publicDraftTier(session,selected.id)} fitReason={ranking.get(String(selected.id))?.fitReason}/>
        <div className="draft-forecast"><strong>{noNextPick?'次の自球団指名はありません':`${forecastName}：${forecast[selected.id]?.label || '不明'}`}</strong><p>{noNextPick?'残存見込みの予測は対象外です。':'公開評価と球団事情に基づく予想です。'}</p></div>
        {!readOnly&&<Button variant="secondary" aria-label={`${selected.name}を追加調査（1ポイント）`} disabled={!session.locked||session.points<=0||session.scouted.includes(selected.id)} onClick={()=>onScout?.(selected.id)}>{session.scouted.includes(selected.id)?'調査済み':'追加調査（1ポイント）'}</Button>}
        {compared&&compared.id!==selected.id?<section className="draft-report-section" aria-label="候補比較"><h3>{compared.name}との比較</h3><table className="draft-compare"><thead><tr><th>評価</th><th>{compared.name}</th><th>{selected.name}</th></tr></thead><tbody>{[
          ['現在能力',p=>draftReport(session,p.id,session.myId)?.currentRange.join('〜')],['将来性',p=>draftBand(draftReport(session,p.id,session.myId)?.future)],['強み',p=>draftReport(session,p.id,session.myId)?.strength],['確度',p=>draftReport(session,p.id,session.myId)?.confidence],['世間',p=>publicDraftTier(session,p.id)],
        ].map(([label,get])=><tr key={label}><th>{label}</th><td>{get(compared)}</td><td>{get(selected)}</td></tr>)}</tbody></table><Button variant="secondary" onClick={()=>setView(v=>({...v,compare:null}))}>比較を解除</Button></section>
        :<Button variant="secondary" onClick={()=>setView(v=>({...v,compare:selected.id}))}>{compared?'比較候補に設定済み':'比較に追加'}</Button>}
        {!readOnly&&(confirm?<section className="draft-confirm" aria-label="指名内容の確認"><h3>{selected.name}を{round===1?'1位':`${round}巡目`}で指名</h3><p>期待役割：{report?.role} · 支配下残枠 {remainingSlots ?? '確認中'}</p><p>確定後は指名を取り消せません。</p><div className="draft-actions"><Button variant="secondary" onClick={()=>setConfirm(false)}>選び直す</Button><Button disabled={!canPick} onClick={()=>{if(canPick)onPick?.(selected);}}>指名を確定</Button></div></section>
        :<Button disabled={!canPick} onClick={()=>setConfirm(true)}>指名内容を確認</Button>)}
      </>:<div className="draft-detail-placeholder"><h2>選手を選んで比較</h2><p>自球団の見立てと世間の評価を見ながら、本命と代替候補を検討できます。</p></div>}
    </div>
  </div>;
}
