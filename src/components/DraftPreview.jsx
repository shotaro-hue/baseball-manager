import React,{useLayoutEffect,useState} from 'react';
import {Button,StateLabel} from './design-system/primitives';
import DraftCandidates from './DraftCandidates';
import {useDraftEvaluation} from '../hooks/useDraftEvaluation';
import {draftClassSummary,draftReport,publicDraftTier,startDraftEvaluation} from '../engine/draftReports';
import {rankDraftProspects,forecastDraft} from '../engine/draftRules';
import {analyzeTeamNeeds} from '../engine/trade';

export default function DraftPreviewScreen({teams,myId,year,pool,rules,endedTeams,draftAllocation,onAllocationChange,onStart,startLabel,savedState,onStateChange,evaluation,onEvaluationChange}) {
  const {session,update}=useDraftEvaluation({teams,myId,year,pool,draftAllocation,savedState,evaluation,onEvaluationChange});
  const [tab,setTab]=useState(savedState?.tab || 'overview'),[candidateView,setCandidateView]=useState(savedState?.candidateView || {});
  useLayoutEffect(()=>{onStateChange?.({tab,candidateView,...(!onEvaluationChange?{evaluation:session}:{})});},[tab,candidateView,session,onStateChange]);
  const myTeam=teams.find(t=>String(t.id)===String(myId));
  const context={rules,endedTeams,teams,evaluation:session};
  const rankings=rankDraftProspects(myTeam,pool,1,[],context),forecast=forecastDraft(teams,pool,myId,context);
  const publicOrder=[...pool].sort((a,b)=>draftReport(session,b.id).value-draftReport(session,a.id).value||String(a.id).localeCompare(String(b.id)));
  const allocation=session.locked?session.allocation:(draftAllocation || session.allocation);
  const canAllocate=!session.locked&&!!onAllocationChange;
  return <div className="draft-experience" data-ds="draft"><div className="draft-page">
    <header className="draft-header"><div><small>DRAFT PREVIEW</small><h1>{year+1}年 ドラフト展望</h1><p>自球団の見立てと、世間の評価を照らし合わせる</p></div><StateLabel>候補 {pool.length}人</StateLabel></header>
    <nav className="draft-tabs" aria-label="ドラフト展望">{[['overview','総評'],['teams','各球団'],['rec','おすすめ'],['alloc','予算配分']].map(([id,label])=><Button key={id} variant={tab===id?'primary':'secondary'} aria-pressed={tab===id} onClick={()=>setTab(id)}>{label}</Button>)}</nav>
    {tab==='overview'&&<><section className="draft-panel"><h2>今年のドラフト総評</h2><p>{draftClassSummary(session)}</p><p className="draft-muted">公開評価による見通しです。実力や将来の活躍が確定したものではありません。</p></section>
      <section className="draft-panel"><h2>世間が注目する候補</h2>{publicOrder.slice(0,3).map(p=><div key={p.id} className="draft-result-row"><strong>{p.name}</strong><span className="draft-muted">　{p.age}歳 · {p.subtype||p.pos}</span><p>{draftReport(session,p.id).summary}</p><div className="draft-result-tags"><StateLabel>{publicDraftTier(session,p.id)}</StateLabel><StateLabel>競合見込み {forecast[p.id]?.label || '不明'}</StateLabel></div><Button variant="secondary" onClick={()=>{setCandidateView(v=>({...v,selected:p.id}));setTab('rec');}}>レポートを確認</Button></div>)}</section></>}
    {tab==='teams'&&<section className="draft-panel"><h2>各球団の補強ポイント</h2>{[...teams].sort((a,b)=>a.wins-b.wins).map(t=><div key={t.id} className="draft-team-row"><strong>{t.name}{String(t.id)===String(myId)?'（自球団）':''}</strong><p>{analyzeTeamNeeds(t,{includeFarmPitchers:true}).map(n=>n.type).join(' · ') || '特定の補強急務なし'}</p></div>)}</section>}
    {tab==='rec'&&<DraftCandidates pool={pool} session={session} rankings={rankings} forecast={forecast} savedState={candidateView} onStateChange={setCandidateView} readOnly/>}
    {tab==='alloc'&&<section className="draft-panel draft-budget"><h2>スカウト予算配分</h2><p>会議開始時に自動調査の対象を確定します。追加調査5ポイントは1位から最終指名まで通算です。</p><label>投手 {allocation.pitcher}% · 野手 {allocation.batter}%<input aria-label="投手スカウト配分" type="range" min="10" max="90" step="5" disabled={!canAllocate} value={allocation.pitcher} onChange={e=>{const pitcher=Number(e.target.value);onAllocationChange?.({pitcher,batter:100-pitcher});}}/></label>
      {['pitcher','batter'].map(key=><p key={key}>{key==='pitcher'?'投手':'野手'}の自動調査：{Math.round(allocation[key]/100*8)}人 · 精度の目安 ±{Math.round(10*(1-allocation[key]/200))}</p>)}<p className="draft-muted">会議開始後は配分を固定します。候補人数が予定数より少ない場合は、その人数まで調査します。</p></section>}
    <div className="draft-actions"><Button onClick={()=>{update(s=>startDraftEvaluation(s,pool,allocation));onStart?.();}}>{startLabel || 'ドラフト会議を開始する'}</Button></div>
  </div></div>;
}
