import { useState, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import React from "react";
import { POSITIONS, DRAFT_ROUNDS, DRAFT_COMMENTS_MY, DRAFT_COMMENTS_CPU, DRAFT_LOTTERY_MAX_ROUNDS, MAX_SHIHAKA_TOTAL } from '../constants';
import { rng } from '../utils';
import { remainingDraftSlots, chooseDraftProspect, autoFirstRound, draftRefused, drawDraftWinner, registeredDraftCount, rankDraftProspects, forecastDraft } from '../engine/draftRules';
import { HandBadge } from './ui';
import { Button, StateLabel } from './design-system/primitives';
import DraftCandidates from './DraftCandidates';
import DraftPreviewScreen from './DraftPreview';
import { useDraftEvaluation } from '../hooks/useDraftEvaluation';
import { draftReport, draftBand, publicDraftTier, scoutDraftCandidate, rememberDraftReport } from '../engine/draftReports';
export { DraftPreviewScreen };

import { decodeLottery, encodeLottery, draftPicksForTeam } from '../engine/offseasonResume';



export function DraftLotteryScreen({teams,myId,year,pool,onDone,savedState,onStateChange,draftAllocation,evaluation,onEvaluationChange}){
  const [restored] = useState(() => decodeLottery(savedState, teams, pool));
  const {session,update}=useDraftEvaluation({teams,myId,year,pool,draftAllocation,evaluation,onEvaluationChange,savedState,started:true});
  const [candidateView,setCandidateView]=useState(restored.candidateView || {});
  const completed = useRef(false);
  const phaseRef = useRef(restored.phase ?? 'select');
  const drawn = useRef(new Set());
  const allSorted=React.useMemo(()=>[...teams].sort((a,b)=>a.wins-b.wins),[teams]);
  // phase: "select" → "announce" → "lottery" → (外れラウンド繰り返し) → "done"
  const [phase,setPhase]=React.useState(restored.phase ?? "select");
  const [showPreview,setShowPreview]=React.useState(restored.showPreview ?? false);
  // ラウンド: 0=1位, 1=外れ1位, 2=外れ外れ1位...（重複あれば再指名ループ）
  const [hazureRound,setHazureRound]=React.useState(restored.hazureRound ?? 0);
  const [activeTeams,setActiveTeams]=React.useState(()=>restored.activeTeams ?? [...teams].sort((a,b)=>a.wins-b.wins).filter(t=>remainingDraftSlots(t)>0));
  const [confirmedPicks,setConfirmedPicks]=React.useState(restored.confirmedPicks ?? {});
  // 現ラウンド
  const [myPick,setMyPick]=React.useState(restored.myPick ?? null);
  const [cpuPicks,setCpuPicks]=React.useState(restored.cpuPicks ?? null);
  const [animStep,setAnimStep]=React.useState(restored.animStep ?? 0);
  // くじ引き
  const [pendingConflicts,setPendingConflicts]=React.useState(restored.pendingConflicts ?? []);
  const [currentConflictIdx,setCurrentConflictIdx]=React.useState(restored.currentConflictIdx ?? 0);
  const [lotteryTarget,setLotteryTarget]=React.useState(restored.lotteryTarget ?? null);
  const [lotteryTeams,setLotteryTeams]=React.useState(restored.lotteryTeams ?? []);
  const [lotteryResult,setLotteryResult]=React.useState(restored.lotteryResult ?? null);
  const [lotteryRound,setLotteryRound]=React.useState(restored.lotteryRound ?? 0);
  const [resolvedPicks,setResolvedPicks]=React.useState(restored.resolvedPicks ?? {});
  const [allLotteryLosers,setAllLotteryLosers]=React.useState(restored.allLotteryLosers ?? []);
  const [round1Result,setRound1Result]=React.useState(restored.round1Result ?? {});
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  // Bridge candidate-view commits into the save state before a same-task save.
  useLayoutEffect(() => { onStateChange?.(encodeLottery({ phase, showPreview, hazureRound, activeTeams, confirmedPicks,
    myPick, cpuPicks, animStep, pendingConflicts, currentConflictIdx, lotteryTarget, lotteryTeams,
    lotteryResult, lotteryRound, resolvedPicks, allLotteryLosers, round1Result,candidateView,...(!onEvaluationChange?{evaluation:session}:{}) })); },
    [phase, showPreview, hazureRound, activeTeams, confirmedPicks, myPick, cpuPicks, animStep, pendingConflicts,
      currentConflictIdx, lotteryTarget, lotteryTeams, lotteryResult, lotteryRound, resolvedPicks, allLotteryLosers, round1Result, candidateView, session, onStateChange]);
  const finishLottery = (picks, auto) => { if (completed.current) return; completed.current = true; onDone(picks, auto); };

  const myTeam=teams.find(t=>t.id===myId);
  const myShihaikaCount = registeredDraftCount(myTeam);
  const myDraftedCount = confirmedPicks[myId] ? 1 : 0;
  const myRemainingSlots = Math.max(0, MAX_SHIHAKA_TOTAL - myShihaikaCount - myDraftedCount);
  const canMyTeamDraft = myRemainingSlots > 0;
  const amIActive=activeTeams.some(t=>t.id===myId);
  const priorUsedIds=new Set(Object.values(confirmedPicks).filter(Boolean).map(p=>p.id));
  const roundPool=pool.filter(p=>!p._drafted&&!priorUsedIds.has(p.id));
  const roundLabel=hazureRound===0?"1位指名":"外れ".repeat(hazureRound)+"1位指名";


  // CPU指名（現ラウンドのactiveTeams・roundPoolを使用）
  const buildCpuPicks=()=>{
    const picks={};
    activeTeams.forEach(t=>{
      if(t.id===myId) return;
      if (remainingDraftSlots(t) <= 0) return;
      picks[t.id]=chooseDraftProspect(t,roundPool,1,[],{teams,evaluation:session,activeTeamIds:activeTeams.map(t=>t.id)});
    });
    return picks;
  };

  // 一斉発表フェーズへ（自チームが外れていないラウンドではmyPick不要）
  const handleAnnounce=(chosen)=>{
    const selected=chosen?.id!=null?chosen:myPick;
    if (phaseRef.current !== 'select') return;
    if(!selected&&amIActive&&canMyTeamDraft&&roundPool.length) return;
    if(selected&&amIActive){if(!roundPool.some(p=>p.id===selected.id))return;setMyPick(selected);update(s=>rememberDraftReport(s,selected.id));}
    const cpu=buildCpuPicks();
    phaseRef.current = 'announce';
    setCpuPicks(cpu);
    setPhase("announce");
    setAnimStep(0);
  };
  useEffect(() => {
    if (phase !== 'announce' || !cpuPicks) return;
    let step = animStep, timeout;
    const timer = setInterval(() => {
      step++; setAnimStep(step);
      if (step >= activeTeams.length) { clearInterval(timer); timeout = setTimeout(() => processConflicts(cpuPicks), 600); }
    }, 400);
    return () => { clearInterval(timer); clearTimeout(timeout); };
  // The animation resumes from its saved step; CPU choices never reroll here.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, cpuPicks]);

  // 現ラウンドの競合検出（重複OK → くじ引き、なければラウンド終了）
  const processConflicts=(cpu)=>{
    const allPicks={...cpu};
    if(amIActive&&canMyTeamDraft&&myPick) allPicks[myId]=myPick;
    const byPlayer={};
    Object.entries(allPicks).forEach(([tid,p])=>{
      if(!p) return;
      if(!byPlayer[p.id]) byPlayer[p.id]=[];
      byPlayer[p.id].push(tid);
    });
    const conflicts=Object.entries(byPlayer)
      .filter(([,tids])=>tids.length>1)
      .map(([pid,tids])=>({pid,tids}));
    if(conflicts.length){
      setPendingConflicts(conflicts);
      setCurrentConflictIdx(0);
      setLotteryRound(1);
      setAllLotteryLosers([]);
      setResolvedPicks({});
      const first=conflicts[0];
      setLotteryTarget(roundPool.find(p=>String(p.id)===first.pid));
      setLotteryTeams(first.tids.map(tid=>teams.find(t=>String(t.id)===tid)).filter(Boolean));
      setLotteryResult(null);
      setPhase("lottery");
    } else {
      endRound(allPicks,[]);
    }
  };

  // くじを順番に処理（全完了後にラウンド終了）
  const advanceConflict=(resolved,losers,conflictIdx)=>{
    const nextIdx=conflictIdx+1;
    if(nextIdx<pendingConflicts.length&&nextIdx<DRAFT_LOTTERY_MAX_ROUNDS){
      setCurrentConflictIdx(nextIdx);
      setLotteryRound(r=>r+1);
      const next=pendingConflicts[nextIdx];
      setLotteryTarget(roundPool.find(p=>String(p.id)===next.pid));
      setLotteryTeams(next.tids.map(tid=>teams.find(t=>String(t.id)===tid)).filter(Boolean));
      setLotteryResult(null);
      setPhase("lottery");
      return;
    }
    // 上限超えの競合を自動解決
    let autoResolved={...resolved};
    const allLosers=[...losers];
    pendingConflicts.slice(nextIdx).forEach(({pid,tids})=>{
      const winner=drawDraftWinner(tids);
      autoResolved[winner]=roundPool.find(p=>String(p.id)===pid);
      tids.filter(tid=>tid!==winner).forEach(tid=>{
        const t=teams.find(x=>String(x.id)===tid);if(t) allLosers.push(t);
      });
    });
    const cpu=cpuPicks||{};
    const allPicks={...cpu};if(amIActive&&canMyTeamDraft&&myPick) allPicks[myId]=myPick;
    const loserIds=new Set(allLosers.map(t=>String(t.id)));
    const finalRoundPicks={};
    Object.entries(allPicks).forEach(([tid,p])=>{
      if(!loserIds.has(tid)) finalRoundPicks[tid]=autoResolved[tid]||p;
    });
    endRound(finalRoundPicks,allLosers);
  };

  // くじ引き実行
  const drawLottery=()=>{
    const key = `${hazureRound}:${currentConflictIdx}`;
    if (lotteryResult || !lotteryTeams.length || drawn.current.has(key)) return;
    drawn.current.add(key);
    const winner=drawDraftWinner(lotteryTeams);
    setLotteryResult(winner);
  };
  useEffect(() => {
    if (phase !== 'lottery' || !lotteryResult) return;
    const timer = setTimeout(()=>{
      const winner = lotteryResult;
      const losers=lotteryTeams.filter(t=>t.id!==winner.id);
      const newResolved={...resolvedPicks,[winner.id]:lotteryTarget};
      const newAllLosers=[...allLotteryLosers,...losers];
      setAllLotteryLosers(newAllLosers);
      setResolvedPicks(newResolved);
      advanceConflict(newResolved,newAllLosers,currentConflictIdx);
    },1500);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, lotteryResult, currentConflictIdx]);

  // ラウンド終了：敗退球団があれば次の外れラウンドへ、なければ確定
  const endRound=(roundPicks,losers)=>{
    const newConfirmed={...confirmedPicks};
    Object.entries(roundPicks).forEach(([tid,p])=>{if(p) newConfirmed[tid]=p;});
    if(losers.length===0){
      setRound1Result(newConfirmed);
      setConfirmedPicks(newConfirmed);
      setPhase("done");
    } else {
      setConfirmedPicks(newConfirmed);
      setHazureRound(r=>r+1);
      setActiveTeams(losers);
      setMyPick(null);setCpuPicks(null);setAnimStep(0);
      setPendingConflicts([]);setCurrentConflictIdx(0);
      setResolvedPicks({});setAllLotteryLosers([]);
      setPhase("select");
    }
  };

  // Full-auto uses the same independent nominations and fair lottery.
  const handleAutoAll=()=>{
    if (phaseRef.current !== 'select' || completed.current) return;
    const winners=autoFirstRound(allSorted,roundPool,{evaluation:session});
    if(winners[myId])update(s=>rememberDraftReport(s,winners[myId].id));
    finishLottery(winners,true);
  };

  if(showPreview) return(
    <div style={{position:"relative"}}>
      <div style={{position:"sticky",top:0,zIndex:99,background:"rgba(10,15,26,.95)",padding:"8px 14px",borderBottom:"1px solid rgba(255,255,255,.08)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{fontSize:12,color:"#94a3b8"}}>📋 ドラフト展望 (参考)</span>
        <button className="btn" style={{fontSize:11,padding:"4px 14px",background:"rgba(148,163,184,.1)",color:"#94a3b8",border:"1px solid rgba(148,163,184,.2)"}} onClick={()=>setShowPreview(false)}>← 戻る</button>
      </div>
      <DraftPreviewScreen teams={teams} myId={myId} year={year} pool={pool} draftAllocation={session.allocation} evaluation={session} onEvaluationChange={onEvaluationChange} onAllocationChange={null} onStart={()=>setShowPreview(false)} startLabel="← ドラフトに戻る"/>
    </div>
  );

  if(phase==="select") return <div className="draft-experience" data-ds="draft"><div className="draft-page">
    <header className="draft-header"><div><small>DRAFT {year}</small><h1>{roundLabel}</h1><p>全球団が同時に指名。競合は抽選で決まります。</p></div><Button variant="secondary" onClick={()=>setShowPreview(true)}>展望</Button></header>
    <p>支配下登録 {myShihaikaCount+myDraftedCount}/{MAX_SHIHAKA_TOTAL} · 残枠 {myRemainingSlots}</p>
    {!roundPool.length?<section className="draft-panel"><p>指名できる候補がいなくなりました。確定済みの指名を引き継ぎます。</p><Button onClick={()=>finishLottery(confirmedPicks)}>候補が尽きたため結果へ</Button></section>:amIActive?<>
      {!canMyTeamDraft&&<p role="status">支配下登録人数が上限のため指名できません。</p>}
      <DraftCandidates pool={roundPool} session={session} onScout={id=>update(s=>scoutDraftCandidate(s,roundPool,id))}
        rankings={rankDraftProspects(myTeam,roundPool,1,[],{teams,evaluation:session})}
        forecast={forecastDraft(teams,roundPool,myId,{evaluation:session,activeTeamIds:activeTeams.map(t=>t.id)})}
        canPick={canMyTeamDraft} remainingSlots={myRemainingSlots} onPick={handleAnnounce} savedState={candidateView} onStateChange={setCandidateView}/>
      {!canMyTeamDraft&&<Button onClick={handleAnnounce}>発表を見る →</Button>}
    </>:<section className="draft-panel"><p>{canMyTeamDraft?'あなたの球団は指名が確定しました':'登録上限のため指名を見送ります'}</p><p>{activeTeams.map(t=>t.name).join(' / ')} が選択中</p><Button onClick={handleAnnounce}>発表を見る →</Button></section>}
    {hazureRound===0&&<Button variant="secondary" onClick={handleAutoAll}>全ドラフト自動処理（1巡目〜全巡一括）</Button>}
  </div></div>;

  if(phase==="announce") return(
    <div className="draft-experience draft-lottery" data-ds="draft"><div className="draft-page" style={{padding:"14px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div style={{fontSize:22,fontWeight:700,color:"#f5c842"}}>📢 {roundLabel} 一斉発表</div>
        <button className="btn" style={{fontSize:10,padding:"3px 10px",background:"rgba(148,163,184,.1)",color:"#94a3b8",border:"1px solid rgba(148,163,184,.2)"}} onClick={()=>setShowPreview(true)}>📋 展望</button>
      </div>
      <div className="card">
        {activeTeams.map((t,idx)=>{
          const pick=t.id===myId?myPick:(cpuPicks?cpuPicks[t.id]:null);
          const visible=animStep>idx;
          return(
            <div key={t.id} style={{padding:"8px 6px",borderBottom:"1px solid rgba(255,255,255,.04)",opacity:visible?1:0,transition:"opacity .3s",minHeight:36}}>
              {visible&&(
                <div className="fsb">
                  <div>
                    <span style={{fontSize:11,color:t.id===myId?"#f5c842":"#94a3b8"}}>{t.emoji} {t.name}</span>
                    <span style={{fontWeight:700,fontSize:13,marginLeft:8,color:t.id===myId?"#f5c842":"#e0d4bf"}}>{pick?.name||"---"}</span>
                  </div>
                  <span style={{fontSize:10,color:"#374151"}}>{pick?.pos}/{pick?.age}歳</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div></div>
  );

  if(phase==="lottery") return(
    <div className="draft-experience draft-lottery" data-ds="draft"><div className="draft-page" style={{padding:"14px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
        <div style={{fontSize:22,fontWeight:700,color:"#f5c842"}}>🎰 競合！くじ引き</div>
        <button className="btn" style={{fontSize:10,padding:"3px 10px",background:"rgba(148,163,184,.1)",color:"#94a3b8",border:"1px solid rgba(148,163,184,.2)"}} onClick={()=>setShowPreview(true)}>📋 展望</button>
      </div>
      <div style={{fontSize:11,color:"#94a3b8",textAlign:"center",marginBottom:4}}>{roundLabel}</div>
      {pendingConflicts.length>1&&(
        <div style={{fontSize:10,color:"#94a3b8",textAlign:"center",marginBottom:8}}>
          競合 {currentConflictIdx+1} / {pendingConflicts.length} 件目（第{lotteryRound}回戦）
        </div>
      )}
      <div style={{textAlign:"center",fontSize:13,color:"#94a3b8",marginBottom:14}}>{lotteryTarget?.name} に {lotteryTeams.length}球団が競合</div>
      <div className="card" style={{textAlign:"center",padding:24,marginBottom:12}}>
        <div style={{fontSize:40,marginBottom:8}}>📋</div>
        <div style={{fontSize:14,color:"#e0d4bf",marginBottom:12}}>競合球団:</div>
        {lotteryTeams.map(t=>(
          <div key={t.id} style={{fontSize:13,color:t.id===myId?"#f5c842":"#94a3b8",padding:"3px 0"}}>{t.emoji} {t.name}</div>
        ))}
        {!lotteryResult&&(
          <button className="btn btn-gold" style={{marginTop:20,padding:"10px 32px"}} onClick={drawLottery}>くじを引く！</button>
        )}
        {lotteryResult&&(
          <div style={{marginTop:20,padding:"16px",background:"rgba(245,200,66,.08)",borderRadius:8}}>
            <div style={{fontSize:32,marginBottom:4}}>{lotteryResult.id===myId?"🎉":"😢"}</div>
            <div style={{fontSize:16,fontWeight:700,color:lotteryResult.id===myId?"#f5c842":"#94a3b8"}}>
              {lotteryResult.emoji} {lotteryResult.name} が当選！
            </div>
            <div style={{fontSize:11,color:"#94a3b8",marginTop:4}}>{lotteryTarget?.name} の交渉権獲得</div>
          </div>
        )}
      </div>
    </div></div>
  );

  if(phase==="done") return(
    <div className="draft-experience draft-lottery" data-ds="draft"><div className="draft-page" style={{padding:"14px"}}>
      <div style={{fontSize:22,fontWeight:700,color:"#f5c842",marginBottom:14,textAlign:"center"}}>✅ 1巡目結果</div>
      <div className="card" style={{marginBottom:14}}>
        {allSorted.map(t=>{
          const p=confirmedPicks[t.id];
          return p?(
            <div key={t.id} className="fsb" style={{padding:"7px 6px",borderBottom:"1px solid rgba(255,255,255,.04)"}}>
              <div>
                <span style={{fontSize:11,color:t.id===myId?"#f5c842":"#94a3b8"}}>{t.emoji} {t.name}</span>
                <span style={{fontWeight:700,fontSize:13,marginLeft:8,color:t.id===myId?"#f5c842":"#e0d4bf"}}>{p.name}</span>
              </div>
              <span style={{fontSize:10,color:"#374151"}}>{p.pos}/{p.age}歳</span>
            </div>
          ):null;
        })}
      </div>
      <button className="btn btn-gold" style={{width:"100%",padding:"12px 0"}} onClick={()=>finishLottery(confirmedPicks)}>
        2巡目以降へ →
      </button>
    </div></div>
  );

  return null;
}


export function DraftScreen({teams,myId,year,pool,draftAllocation,autoSkip:autoSkipProp,onDraftDone,savedState,onStateChange,evaluation,onEvaluationChange}){
  const alloc=draftAllocation??{pitcher:50,batter:50};
  const {session,update}=useDraftEvaluation({teams,myId,year,pool,draftAllocation,evaluation,onEvaluationChange,savedState,started:true});
  const [candidateView,setCandidateView]=useState(savedState?.candidateView || {});
  const allSorted=[...teams].sort((a,b)=>a.wins-b.wins);
  const draftOrder=[];
  for(let round=0;round<DRAFT_ROUNDS;round++){allSorted.forEach(t=>draftOrder.push({round,team:t}));}
  // 1巡目はlotteryで処理済みなのでスキップ
  const draftOrderFiltered=draftOrder.filter(function(d){return d.round>0;});
  const [pickIdx,setPickIdx]=useState(savedState?.pickIdx ?? 0);
  const [drafted,setDrafted]=useState(savedState?.drafted ?? {});
  const [log,setLog]=useState(() => (savedState?.log || []).map(r => ({ ...r, team: teams.find(t=>t.id===r.team), player: pool.find(p=>p.id===r.player) })).filter(r=>r.team&&r.player));
  const [done,setDone]=useState(savedState?.done ?? false);
  const nextPickRef = useRef(pickIdx);
  const finishedRef = useRef(false);
  const scouted=useMemo(()=>new Set(session.scouted),[session.scouted]);
  const scoutPt=session.points;
  const [announcement,setAnnouncement]=useState(null);
  const [autoRunning,setAutoRunning]=useState(false);
  const [localAutoSkip,setLocalAutoSkip]=useState(savedState?.localAutoSkip ?? !!autoSkipProp);
  const effectiveAutoSkip=autoSkipProp||localAutoSkip;
  const [showPreview,setShowPreview]=useState(savedState?.showPreview ?? false);
  useLayoutEffect(() => { onStateChange?.({ pickIdx, drafted, log: log.map(r=>({ ...r, team: r.team.id, player: r.player.id })),
    done, scouted: [...scouted], scoutPt, localAutoSkip, showPreview,candidateView,...(!onEvaluationChange?{evaluation:session}:{}) }); },
    [pickIdx, drafted, log, done, scouted, scoutPt, localAutoSkip, showPreview,candidateView,session,onStateChange]);
  const current=draftOrderFiltered[pickIdx];

  const isMyTurn=current&&current.team.id===myId&&!done;
  const isPickedAfterRound1=pid=>Object.prototype.hasOwnProperty.call(drafted,pid);
  // 1巡目で指名済みの選手を除外
  const predrafted=pool.filter(p=>p._drafted).reduce((a,p)=>{a[p.id]=p._r1winner;return a;},{});
  const availPool=pool.filter(p=>!isPickedAfterRound1(p.id)&&!p._drafted);
  const myPicks=draftPicksForTeam(pool, drafted, myId);
  const myTeam = teams.find(t => Number(t.id) === Number(myId));
  const myCurrentShihaikaCount = registeredDraftCount(myTeam);
  const myTotalDrafted = myPicks.length;
  const myRemainingSlots = Math.max(0, MAX_SHIHAKA_TOTAL - myCurrentShihaikaCount - myTotalDrafted);
  const canMyTeamDraft = myRemainingSlots > 0;
  const doScout=pid=>update(s=>scoutDraftCandidate(s,availPool,pid));
  const announcementTimer = useRef(null);
  useEffect(() => () => clearTimeout(announcementTimer.current), []);
  const announce=(msg,color="#f5c842")=>{setAnnouncement({msg,color});clearTimeout(announcementTimer.current);announcementTimer.current=setTimeout(()=>setAnnouncement(null),2200);};
  const doPick=(pick,isMe)=>{
    if (!current || done || nextPickRef.current !== pickIdx || isPickedAfterRound1(pick.id) || pick._drafted || remainingDraftSlots(current.team,pool,drafted) <= 0) return;
    nextPickRef.current = pickIdx + 1;
    if(isMe)update(s=>rememberDraftReport(s,pick.id));
    const newDrafted={...drafted,[pick.id]:isMe?myId:current.team.id};
    const comment=isMe?DRAFT_COMMENTS_MY[rng(0,DRAFT_COMMENTS_MY.length-1)]:`${current.team.name}${DRAFT_COMMENTS_CPU[rng(0,DRAFT_COMMENTS_CPU.length-1)]}`;
    setDrafted(newDrafted);
    setLog(prev=>[{round:current.round+1,team:current.team,player:pick,isMe,comment},...prev]);
    // 入団拒否リスク（自チーム指名時のみ、高ポテンシャルほど拒否しやすい）
    let refused=false;
    if(isMe){
      if(draftRefused(pick,true)){
        refused=true;
        setDrafted({ ...drafted, [pick.id]: 'refused' });
        setLog(prev => prev.map((entry, i) => i === 0 ? { ...entry, refused: true, comment: '入団拒否' } : entry));
        announce(`❌ ${pick.name} が入団を拒否しました`,"#f87171");
        if(pickIdx+1>=draftOrderFiltered.length) setDone(true);
        else setPickIdx(i=>i+1);
        return;
      }
    }
    if(!refused){
      announce(isMe?`🎉 ${pick.name} を指名！${comment}`:`${current.team.emoji} ${pick.name} — ${comment}`,isMe?"#f5c842":current.team.color);
      if(pickIdx+1>=draftOrderFiltered.length) setDone(true);
      else setPickIdx(i=>i+1);
    }
  };
  const cpuPick=()=>{
    if(!current||done) return;
    const avail=pool.filter(p=>!isPickedAfterRound1(p.id)&&!p._drafted);
    if(!avail.length){setDone(true);return;}
    const acceptedPicks=draftPicksForTeam(pool,drafted,current.team.id);
    doPick(chooseDraftProspect(current.team,avail,current.round+1,acceptedPicks,{teams,draftPool:pool,drafted,evaluation:session}),current.team.id===myId);
  };

  const myPick=pid=>{
    if(!canMyTeamDraft){
      announce(`⚠️ 支配下登録人数が上限（${MAX_SHIHAKA_TOTAL}名）に到達しているため、指名できません。`,"#f87171");
      return;
    }
    const pick=pool.find(p=>p.id===pid);
    if(!pick||isPickedAfterRound1(pick.id)||!isMyTurn) return;
    doPick(pick,true);
  };
  // 通常CPU自動指名（autoSkip中は無効）
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(()=>{if(effectiveAutoSkip||isMyTurn||done||pickIdx>=draftOrderFiltered.length) return;const t=setTimeout(cpuPick,350);return()=>clearTimeout(t);},[pickIdx,isMyTurn,done,effectiveAutoSkip]);
  // Both modes skip a full club and then use the same guarded pick path.
  useEffect(()=>{
    if(done || !current) return;
    if(availPool.length===0) { setDone(true); return; }
    if(remainingDraftSlots(current.team,pool,drafted)>0) return;
    if(nextPickRef.current!==pickIdx) return;
    nextPickRef.current=pickIdx+1;
    if(pickIdx+1>=draftOrderFiltered.length) setDone(true);
    else setPickIdx(i=>i+1);
  },[pickIdx,done,pool,drafted]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(()=>{
    if(!effectiveAutoSkip||done||!current) return;
    const t=setTimeout(cpuPick,30);
    return()=>clearTimeout(t);
  },[effectiveAutoSkip,pickIdx,done]);
  if(showPreview) return(
    <div style={{position:"relative"}}>
      <div style={{position:"sticky",top:0,zIndex:99,background:"rgba(10,15,26,.95)",padding:"8px 14px",borderBottom:"1px solid rgba(255,255,255,.08)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{fontSize:12,color:"#94a3b8"}}>📋 ドラフト展望 (参考)</span>
        <button className="btn" style={{fontSize:11,padding:"4px 14px",background:"rgba(148,163,184,.1)",color:"#94a3b8",border:"1px solid rgba(148,163,184,.2)"}} onClick={()=>setShowPreview(false)}>← 戻る</button>
      </div>
      <DraftPreviewScreen teams={teams} myId={myId} year={year} pool={pool} draftAllocation={session.allocation} evaluation={session} onEvaluationChange={onEvaluationChange} onAllocationChange={null} onStart={()=>setShowPreview(false)} startLabel="← ドラフトに戻る"/>
    </div>
  );
  const nextTeams=[];
  const nextMine=draftOrderFiltered.findIndex((d,i)=>i>pickIdx && String(d.team.id)===String(myId));
  const limit=nextMine<0?draftOrderFiltered.length:nextMine;
  for(let i=pickIdx;i<limit;i++) if(String(draftOrderFiltered[i].team.id)!==String(myId))nextTeams.push(draftOrderFiltered[i].team);
  const noNextPick=nextMine<0 || myRemainingSlots<=(isMyTurn?1:0);
  const ctx={teams,evaluation:session,draftPool:pool,drafted,round:(current?.round || 1)+1,nextTeams,noNextPick};
  return <div className="draft-experience" data-ds="draft"><div className="draft-page">
    <header className="draft-header"><div><small>DRAFT {year}</small><h1>{done?'ドラフト終了':`${(current?.round || 1)+1}巡目`}</h1><p>{isMyTurn?'あなたの指名です':done?'指名選手を確認して結果レビューへ':`${current?.team.name}が選択中`}</p></div><Button variant="secondary" onClick={()=>setShowPreview(true)}>展望</Button></header>
    {!done&&<><p>支配下登録 {myCurrentShihaikaCount+myTotalDrafted}/{MAX_SHIHAKA_TOTAL} · 残枠 {myRemainingSlots}</p><div className="draft-actions"><Button variant="secondary" disabled={effectiveAutoSkip} onClick={()=>setLocalAutoSkip(true)}>残りを自動処理</Button>{effectiveAutoSkip&&<span role="status">自動処理中…</span>}</div></>}
    {announcement&&<p role="status" className="draft-panel">{announcement.msg}</p>}
    {done?<section className="draft-panel"><h2>自チーム指名選手 ({myPicks.length}人)</h2>{myPicks.map(p=><div key={p.id} className="draft-result-row"><strong>{p.name}</strong><p>{session.snapshots[p.id]?.report.summary || '当時の評価記録なし'}</p></div>)}<Button onClick={()=>{if(finishedRef.current)return;finishedRef.current=true;onDraftDone(pool,drafted);}}>結果レビューへ →</Button></section>
      :<DraftCandidates pool={availPool} session={session} onScout={doScout} rankings={rankDraftProspects(myTeam,availPool,ctx.round,myPicks,ctx)} forecast={forecastDraft(teams,availPool,myId,ctx)} round={ctx.round} noNextPick={noNextPick} canPick={isMyTurn&&canMyTeamDraft} remainingSlots={myRemainingSlots} onPick={p=>myPick(p.id)} savedState={candidateView} onStateChange={setCandidateView}/>}
    <section className="draft-panel"><h2>指名実況</h2><div className="draft-log-items">{log.map((e,i)=><div key={i}>{e.round}巡目 · {e.team.name} <strong>{e.player.name}</strong> · {e.player.pos}{e.refused?' · 入団拒否':''}</div>)}{!log.length&&<p>指名待ち…</p>}</div></section>
  </div></div>;
}
/* ═══════════════════════════════════════════════
   PLAYOFF SYSTEM
═══════════════════════════════════════════════ */

export function DraftReviewScreen({teams,myId,year,pool,drafted,onEnd,savedState,onStateChange,evaluation}) {
  const [tab,setTab]=useState(savedState?.tab || 'myteam');
  useEffect(()=>{onStateChange?.({tab});},[tab,onStateChange]);
  const picksFor=id=>draftPicksForTeam(pool,drafted || {},id),mine=picksFor(myId);
  const undrafted=pool.filter(p=>!p._drafted&&drafted?.[p.id]===undefined);
  return <div className="draft-experience" data-ds="draft"><div className="draft-page"><header className="draft-header"><div><small>DRAFT REVIEW</small><h1>{year+1}年 ドラフト結果</h1><p>指名時の見立てを、今後の育成につなげる</p></div><StateLabel>獲得 {mine.length}人</StateLabel></header>
    <nav className="draft-tabs" aria-label="ドラフト結果">{[['myteam','自チーム'],['allteams','全球団結果'],['undrafted','指名漏れ']].map(([id,label])=><Button key={id} variant={tab===id?'primary':'secondary'} onClick={()=>setTab(id)}>{label}</Button>)}</nav>
    {tab==='myteam'&&<section className="draft-panel"><h2>指名時のスカウト所見</h2><p className="draft-muted">当時の評価記録です。将来の活躍を確定する採点ではありません。</p>{!mine.length&&<p>指名なし</p>}{mine.map(p=>{const snapshot=evaluation?.snapshots?.[p.id];return <div key={p.id} className="draft-result-row"><strong>{p.name}</strong><span className="draft-muted">　{p.pos} · {p.age}歳</span>{snapshot?<><p>{snapshot.report.summary}</p><p>期待役割：{snapshot.report.role} · 将来性 {draftBand(snapshot.report.future)} · 確度 {snapshot.report.confidence}</p><StateLabel>当時の世間：{snapshot.publicTier}</StateLabel></>:<p>当時の評価記録なし</p>}</div>;})}</section>}
    {tab==='allteams'&&<section className="draft-panel"><h2>全球団 指名結果</h2>{teams.map(t=><div key={t.id} className="draft-team-row"><h3>{t.name}</h3><p>{picksFor(t.id).map(p=>`${p.name}（${p.pos}）`).join(' / ') || '指名なし'}</p></div>)}</section>}
    {tab==='undrafted'&&<section className="draft-panel"><h2>指名漏れ ({undrafted.length}人)</h2>{undrafted.map(p=><div key={p.id} className="draft-result-row"><strong>{p.name}</strong> · {p.pos} · {p.age}歳 <StateLabel>{publicDraftTier(evaluation,p.id)}</StateLabel></div>)}</section>}
    <Button onClick={onEnd}>{year+1}年シーズン開幕！</Button>
  </div></div>;
}
