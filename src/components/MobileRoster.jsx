import React, { useState } from 'react';
import { CaretRight, ArrowLeft } from '@phosphor-icons/react';
import { playerCondition, getDashboardLineup } from './DashboardTab';

export function MobileRoster({ team, onPlayerClick, onReplaceLineup, onSetLineupOrder, onSetRosterDhMode }) {
  const [view,setView]=useState('batters');
  const [metric,setMetric]=useState('condition');
  const [replaceId,setReplaceId]=useState(null);
  const lineup=getDashboardLineup(team);
  const target=lineup.find(e=>e.player.id===replaceId);
  const candidates=(team.players || []).filter(p=>!p.isPitcher && !(team.lineup || []).includes(p.id));
  const pitchers=(team.players || []).filter(p=>p.isPitcher);
  const rowInfo=p=> metric==='ability' ? `ミート ${p.batting?.contact ?? '—'} / 長打 ${p.batting?.power ?? '—'}`
    : metric==='stats' ? `打率 ${p.stats?.AB>0 ? ((p.stats.H || 0)/p.stats.AB).toFixed(3) : '—'} / ${p.stats?.HR ?? 0}本`
      : `${playerCondition(p).label} · ${p.condition ?? 70}`;
  const choose=p=>{
    if(!target || (p.injuryDaysLeft || 0)>0) return;
    onReplaceLineup(lineup.map(e=>({id:e.player.id===replaceId?p.id:e.player.id,pos:e.position})));
    setReplaceId(null);
  };
  return <section className="mobile-roster flow-screen"><h1>編成</h1>
    <div className="flow-tabs" aria-label="編成対象">{[['batters','野手'],['pitchers','投手']].map(([id,label])=><button key={id} aria-pressed={view===id} onClick={()=>{setView(id);setReplaceId(null);}}>{label}</button>)}</div>
    {target ? <section><button className="flow-link" onClick={()=>setReplaceId(null)}><ArrowLeft/>打線に戻る</button><h2>{target.player.name}の入替候補</h2><p className="flow-muted">{target.order}番・{target.position}の守備を引き継ぎます。選手詳細で適性を確認してください。</p>{candidates.map(p=><div className="flow-roster-row" key={p.id}><button className="flow-player" onClick={()=>onPlayerClick?.(p,team.name)}><strong>{p.name}</strong><small>{p.pos} · {rowInfo(p)}</small></button><button className="calm-secondary" disabled={(p.injuryDaysLeft || 0)>0} onClick={()=>choose(p)}>起用</button></div>)}{!candidates.length && <p>控え野手はいません</p>}</section>
    : view==='batters' ? <>
      <div className="flow-toolbar"><h2>スタメン</h2><div className="flow-tabs">{[['ability','能力'],['stats','成績'],['condition','状態']].map(([id,label])=><button key={id} aria-pressed={metric===id} onClick={()=>setMetric(id)}>{label}</button>)}</div></div>
      <label className="flow-check"><input type="checkbox" checked={Boolean(team.rosterDhMode ?? team.dhEnabled)} onChange={e=>onSetRosterDhMode?.(e.target.checked)}/>DHあり</label>
      {lineup.map(({player:p,order,position})=><div className="flow-roster-row" key={p.id}><label><span className="sr-only">{p.name}の打順</span><select aria-label={`${p.name}の打順`} value={order} onChange={e=>onSetLineupOrder?.(p.id,Number(e.target.value))}>{lineup.map(e=><option key={e.order} value={e.order}>{e.order}番</option>)}</select></label><button className="flow-player" onClick={()=>onPlayerClick?.(p,team.name)}><strong>{p.name}<CaretRight size={16}/></strong><small>{position} · {rowInfo(p)}</small></button><button className="calm-secondary" onClick={()=>setReplaceId(p.id)}>入替</button></div>)}
      {!lineup.length && <p>打線が未設定です。下の「詳細な編成・育成設定」から設定してください。</p>}
      {!(team.rosterDhMode ?? team.dhEnabled) && <p className="flow-muted">9番は当日の先発投手です。</p>}
    </> : <><h2>投手・継投</h2><p className="flow-muted">ローテーション・救援の役割変更は下の詳細設定から行えます。</p>{pitchers.map(p=><button className="flow-row" key={p.id} onClick={()=>onPlayerClick?.(p,team.name)}><span><strong>{p.name}</strong><small>{(team.rotation || []).includes(p.id)?`先発 ${(team.rotation || []).indexOf(p.id)+1}番手`:p.subtype || '救援'} · {playerCondition(p).label} · {p.condition ?? 70}</small></span><CaretRight/></button>)}</>}
  </section>;
}
