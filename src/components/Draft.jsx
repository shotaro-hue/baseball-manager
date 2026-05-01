import { useState, useEffect, useMemo } from "react";
import React from "react";
import { POSITIONS, DRAFT_ROUNDS, DRAFT_COMMENTS_MY, DRAFT_COMMENTS_CPU, DRAFT_LOTTERY_MAX_ROUNDS, MAX_SHIHAKA_TOTAL } from '../constants';
import { rng, clamp, scoutedValue } from '../utils';
import { analyzeTeamNeeds } from '../engine/trade';
import { draftOverallComment, recommendForTeam } from '../engine/draft';
import { OV, HandBadge } from './ui';



export function DraftPreviewScreen({teams,myId,year,pool,draftAllocation,onAllocationChange,onStart,startLabel}){
  const myTeam=teams.find(t=>t.id===myId);
  const rec=recommendForTeam(myTeam,pool);
  const spots=pool.filter(p=>p.spotlight);
  const alloc=draftAllocation??{pitcher:50,batter:50};
  const predictTeam=player=>{
    const cands=[...teams].sort((a,b)=>a.wins-b.wins).slice(0,4);
    return cands.find(t=>{
      const n=analyzeTeamNeeds(t);
      const wantsPitcher=n.some(x=>x.type.includes("先発")||x.type.includes("中継ぎ")||x.type.includes("抑え")||x.type.includes("投手"));
      return player.isPitcher ? wantsPitcher : n.some(x=>x.type.includes("ミート")||x.type.includes("捕手"));
    })||cands[0];
  };
  const [tab,setTab]=useState("overview");
  const [recFilter,setRecFilter]=useState("all");
  const ov=p=>p.isPitcher?Math.round((p.pitching.velocity+p.pitching.control+p.pitching.breaking)/3):Math.round((p.batting.contact+p.batting.power+p.batting.eye)/3);
  const readinessLabel=score=>score>=65?{label:"⚡ 即戦力",color:"#34d399"}:score>=45?{label:"⚖️ バランス",color:"#94a3b8"}:{label:"🌱 素材型",color:"#a78bfa"};
  return(
    <div className="app"><div style={{maxWidth:700,margin:"0 auto",padding:"16px 12px"}}>
      <div style={{textAlign:"center",marginBottom:14}}>
        <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:36,color:"#f5c842",letterSpacing:".05em"}}>⚾ {year+1}年 ドラフト展望</div>
        <div style={{fontSize:11,color:"#374151"}}>会議開始前の事前情報 — スカウト陣からのレポート</div>
      </div>
      <div style={{display:"flex",gap:6,marginBottom:12}}>
        {[["overview","📋 総評"],["teams","🏟️ 各球団"],["rec","⭐ おすすめ"],["alloc","⚙️ 予算配分"]].map(([k,l])=>(<button key={k} className={"bsm "+(tab===k?"bgb":"bga")} style={{flex:1,padding:"7px 0",fontSize:11}} onClick={()=>setTab(k)}>{l}</button>))}
      </div>
      {tab==="overview"&&(<>
        <div className="card" style={{marginBottom:10}}>
          <div className="card-h">📊 今年のドラフト総評</div>
          <p style={{color:"#e0d4bf",fontSize:13,lineHeight:1.7,margin:"4px 0 10px"}}>{draftOverallComment(pool)}</p>
          <div style={{fontSize:10,color:"#374151"}}>上位5人平均ポテンシャル: <span style={{fontWeight:700,color:"#f5c842"}}>{Math.round(pool.slice(0,5).reduce((s,p)=>s+p.potential,0)/5)}</span>　候補総数: {pool.length}人</div>
        </div>
        <div className="card">
          <div className="card-h">👑 注目選手 &amp; 指名予想球団</div>
          {spots.map(p=>{const pred=predictTeam(p);return(<div key={p.id} style={{padding:"10px",marginBottom:8,borderRadius:6,background:"rgba(245,200,66,.05)",border:"1px solid rgba(245,200,66,.15)"}}>
            <div className="fsb"><div><span style={{fontSize:9,color:"#f97316",fontWeight:700}}>{p.spotlight} </span><span style={{fontWeight:700,fontSize:14}}>{p.name}</span>{p.isPitcher&&<HandBadge p={p}/>}<span style={{fontSize:10,color:"#374151",marginLeft:6}}>{p.pos}/{p.age}歳</span></div><OV v={ov(p)}/></div>
            <div style={{fontSize:10,color:"#374151",marginTop:4}}>{p.isPitcher?`球速${p.pitching.velocity} 制球${p.pitching.control} 変化${p.pitching.breaking}`:`ミート${p.batting.contact} 長打${p.batting.power} 走力${p.batting.speed}`}</div>
            <div style={{marginTop:6,fontSize:10,color:"#60a5fa"}}>📡 指名予想: <span style={{fontWeight:700,color:pred.color}}>{pred.emoji}{pred.name}</span><span style={{color:"#374151",marginLeft:6}}>({analyzeTeamNeeds(pred)[0]?.type})</span></div>
          </div>);})}
        </div>
      </>)}
      {tab==="teams"&&(<div className="card"><div className="card-h">🏟️ 各球団の補強ポイント</div>
        {[...teams].sort((a,b)=>a.wins-b.wins).map((t,i)=>{const needs=analyzeTeamNeeds(t);const isMe=t.id===myId;return(<div key={t.id} style={{padding:"8px 10px",marginBottom:6,borderRadius:6,background:isMe?"rgba(245,200,66,.06)":"rgba(255,255,255,.02)",border:isMe?"1px solid rgba(245,200,66,.2)":"1px solid rgba(255,255,255,.04)"}}>
          <div className="fsb"><div><span style={{fontSize:10,color:"#374151",marginRight:6}}>{i+1}位指名</span><span style={{color:t.color,fontWeight:700}}>{t.emoji} {t.name}</span>{isMe&&<span style={{fontSize:9,color:"#f5c842",marginLeft:6}}>← あなた</span>}</div><span style={{fontSize:10,color:"#374151"}}>{t.wins}勝{t.losses}敗</span></div>
          <div style={{marginTop:4,display:"flex",gap:6,flexWrap:"wrap"}}>{needs.map((n,j)=>(<span key={j} style={{fontSize:9,background:"rgba(96,165,250,.1)",color:"#60a5fa",padding:"2px 7px",borderRadius:10}}>📌 {n.type}</span>))}</div>
        </div>);})}
      </div>)}
      {tab==="rec"&&(<div className="card"><div className="card-h">⭐ {myTeam?.name} おすすめ候補 TOP5</div>
        <p style={{fontSize:11,color:"#374151",marginBottom:8}}>チームの現状分析をもとにスカウト陣が選定しました</p>
        <div style={{display:"flex",gap:4,marginBottom:10}}>
          {[["all","全て"],["ready","⚡ 即戦力"],["prospect","🌱 素材型"]].map(([k,l])=>(
            <button key={k} className={"bsm "+(recFilter===k?"bgb":"bga")} style={{fontSize:10,padding:"3px 10px"}} onClick={()=>setRecFilter(k)}>{l}</button>
          ))}
        </div>
        {rec.filter(p=>recFilter==="all"||(recFilter==="ready"&&(p.readinessScore??50)>=65)||(recFilter==="prospect"&&(p.readinessScore??50)<45))
          .map((p,i)=>{const rankColor=["#ffd700","#94a3b8","#b45309","#374151","#374151"][i];const rl=readinessLabel(p.readinessScore??50);return(<div key={p.id} style={{padding:"10px",marginBottom:6,borderRadius:6,background:"rgba(255,255,255,.02)",border:"1px solid rgba(255,255,255,.06)"}}>
          <div className="fsb"><div><span style={{fontSize:16,fontWeight:700,color:rankColor,marginRight:8}}>#{i+1}</span><span style={{fontWeight:700,fontSize:13}}>{p.name}</span>{p.isPitcher&&<HandBadge p={p}/>}<span style={{fontSize:10,color:"#374151",marginLeft:6}}>{p.pos}/{p.age}歳</span>{p.prospectType&&<span style={{fontSize:9,padding:"1px 5px",borderRadius:3,background:"rgba(255,255,255,.06)",color:"#94a3b8",marginLeft:4}}>{p.prospectType}</span>}{p.spotlight&&<span style={{fontSize:9,color:"#f97316",marginLeft:4}}>{p.spotlight}</span>}</div><OV v={ov(p)}/></div>
          <div style={{fontSize:9,color:"#374151",marginTop:4}}>{p.isPitcher?`球速${p.pitching.velocity} 制球${p.pitching.control} 変化${p.pitching.breaking}`:`ミート${p.batting.contact} 長打${p.batting.power} 走力${p.batting.speed}`}</div>
          <div style={{display:"flex",alignItems:"center",gap:8,marginTop:4}}>
            <span style={{fontSize:9,color:"#374151"}}>即戦力度</span>
            <div style={{flex:1,height:4,borderRadius:2,background:"rgba(255,255,255,.08)"}}><div style={{height:"100%",borderRadius:2,width:`${p.readinessScore??50}%`,background:rl.color}}/></div>
            <span style={{fontSize:9,fontWeight:700,color:rl.color}}>{rl.label}</span>
          </div>
          <div style={{fontSize:9,color:"#a78bfa",marginTop:2}}>ポテンシャル {p.potential}{p.playerType&&<span style={{color:"#60a5fa",marginLeft:6}}>{p.playerType}</span>}</div>
          {p.playerComment&&<div style={{fontSize:8,color:"#374151",marginTop:1,fontStyle:"italic"}}>"{p.playerComment}"</div>}
          {p.fromScout&&<div style={{fontSize:8,color:"#34d399",marginTop:1}}>✅ スカウト済み選手</div>}
        </div>);})}
      </div>)}
      {tab==="alloc"&&(<div className="card"><div className="card-h">⚙️ スカウト予算配分</div>
        <p style={{fontSize:11,color:"#374151",marginBottom:12}}>投手・野手スカウトへの予算配分を設定。高配分ほど精度UP・自動開示人数UP。</p>
        <div style={{marginBottom:16}}>
          <div className="fsb" style={{marginBottom:6}}><span style={{fontSize:12}}>投手スカウト</span><span style={{fontWeight:700,color:"#f5c842"}}>{alloc.pitcher}%</span></div>
          <input type="range" min="10" max="90" step="5" value={alloc.pitcher} onChange={e=>{const p=Number(e.target.value);onAllocationChange&&onAllocationChange({pitcher:p,batter:100-p});}} style={{width:"100%"}}/>
          <div className="fsb" style={{fontSize:10,color:"#374151",marginTop:4}}><span>野手スカウト: {alloc.batter}%</span><span>合計: {alloc.pitcher+alloc.batter}%</span></div>
        </div>
        {[{label:"投手",share:alloc.pitcher/100,isPitcher:true},{label:"野手",share:alloc.batter/100,isPitcher:false}].map(({label,share,isPitcher})=>{
          const stars=share>=0.7?"★★★":share>=0.5?"★★☆":"★☆☆";
          const noise=Math.round(10*(1.0-share*0.5));
          const autoReveal=Math.round(share*8);
          const poolCount=pool.filter(p=>p.isPitcher===isPitcher).length;
          return(<div key={label} style={{padding:"10px",marginBottom:8,borderRadius:6,background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.06)"}}>
            <div className="fsb"><span style={{fontWeight:700,fontSize:13}}>{label}スカウト</span><span style={{color:"#f5c842"}}>{stars}</span></div>
            <div style={{fontSize:10,color:"#4b5563",marginTop:4}}>精度: ±{noise}点　自動開示: {autoReveal}名 / {poolCount}名中</div>
          </div>);
        })}
      </div>)}
      <div style={{textAlign:"center",marginTop:16}}><button className="btn btn-gold" style={{padding:"12px 48px",fontSize:15}} onClick={onStart}>{startLabel||"⚾ ドラフト会議を開始する"}</button></div>
    </div></div>
  );
}


export function DraftLotteryScreen({teams,myId,year,pool,onDone}){
  const allSorted=React.useMemo(()=>[...teams].sort((a,b)=>a.wins-b.wins),[teams]);
  // phase: "select" → "announce" → "lottery" → (外れラウンド繰り返し) → "done"
  const [phase,setPhase]=React.useState("select");
  const [showPreview,setShowPreview]=React.useState(false);
  // ラウンド: 0=1位, 1=外れ1位, 2=外れ外れ1位...（重複あれば再指名ループ）
  const [hazureRound,setHazureRound]=React.useState(0);
  const [activeTeams,setActiveTeams]=React.useState(()=>[...teams].sort((a,b)=>a.wins-b.wins));
  const [confirmedPicks,setConfirmedPicks]=React.useState({});
  // 現ラウンド
  const [myPick,setMyPick]=React.useState(null);
  const [cpuPicks,setCpuPicks]=React.useState(null);
  const [animStep,setAnimStep]=React.useState(0);
  // くじ引き
  const [pendingConflicts,setPendingConflicts]=React.useState([]);
  const [currentConflictIdx,setCurrentConflictIdx]=React.useState(0);
  const [lotteryTarget,setLotteryTarget]=React.useState(null);
  const [lotteryTeams,setLotteryTeams]=React.useState([]);
  const [lotteryResult,setLotteryResult]=React.useState(null);
  const [lotteryRound,setLotteryRound]=React.useState(0);
  const [resolvedPicks,setResolvedPicks]=React.useState({});
  const [allLotteryLosers,setAllLotteryLosers]=React.useState([]);
  const [round1Result,setRound1Result]=React.useState({});

  const myTeam=teams.find(t=>t.id===myId);
  const myShihaikaCount = ((myTeam?.players || []).length + (myTeam?.farm || []).filter(p => !p?.育成).length);
  const myDraftedCount = Object.values(confirmedPicks).filter(p => Number(p?._r1winner ?? myId) === Number(myId)).length;
  const myRemainingSlots = Math.max(0, MAX_SHIHAKA_TOTAL - myShihaikaCount - myDraftedCount);
  const canMyTeamDraft = myRemainingSlots > 0;
  const amIActive=activeTeams.some(t=>t.id===myId);
  const priorUsedIds=new Set(Object.values(confirmedPicks).filter(Boolean).map(p=>p.id));
  const roundPool=pool.filter(p=>!p._drafted&&!priorUsedIds.has(p.id));
  const roundLabel=hazureRound===0?"1位指名":"外れ".repeat(hazureRound)+"1位指名";
  const scoreProspectForTeam=(team, player, rankIdx=0)=>{
    const needs=analyzeTeamNeeds(team);
    const topNeed=needs[0];
    const wantsPitcher=needs.some(n=>n.type.includes("先発")||n.type.includes("中継ぎ")||n.type.includes("抑え")||n.type.includes("投手"));
    const wantsYouth=needs.some(n=>n.type.includes("若手")||n.type.includes("将来"));
    const urgent=topNeed?.horizon==="short";
    let score=100-rankIdx*3;
    if(wantsPitcher&&player.isPitcher) score+=26;
    if(!wantsPitcher&&!player.isPitcher) score+=16;
    if(needs.some(n=>n.type.includes("捕手"))&&!player.isPitcher&&player.pos==="捕手") score+=18;
    if(urgent) score+=Math.round((player.readinessScore??50)*0.2);
    else score+=Math.round((player.potential??50)*0.15);
    if(wantsYouth&&(player.age||22)<=20) score+=10;
    return score;
  };

  // CPU指名（現ラウンドのactiveTeams・roundPoolを使用）
  const buildCpuPicks=()=>{
    const picks={};
    activeTeams.forEach(t=>{
      if(t.id===myId) return;
      const already=new Set(Object.values(picks).filter(Boolean).map(p=>p.id));
      const avail=roundPool.filter(p=>!already.has(p.id));
      if(!avail.length) return;
      const scored=avail.map((p,i)=>({p,s:scoreProspectForTeam(t,p,i)})).sort((a,b)=>b.s-a.s);
      picks[t.id]=rng(0,9)<3&&scored.length>1?scored[rng(1,Math.min(3,scored.length-1))].p:scored[0].p;
    });
    return picks;
  };

  // 一斉発表フェーズへ（自チームが外れていないラウンドではmyPick不要）
  const handleAnnounce=()=>{
    if(amIActive && !canMyTeamDraft) return;
    if(!myPick&&amIActive) return;
    const cpu=buildCpuPicks();
    setCpuPicks(cpu);
    setPhase("announce");
    setAnimStep(0);
    let step=0;
    const timer=setInterval(()=>{
      step++;setAnimStep(step);
      if(step>=activeTeams.length){clearInterval(timer);setTimeout(()=>processConflicts(cpu),600);}
    },400);
  };

  // 現ラウンドの競合検出（重複OK → くじ引き、なければラウンド終了）
  const processConflicts=(cpu)=>{
    const allPicks={...cpu};
    if(amIActive&&myPick) allPicks[myId]=myPick;
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
      setLotteryTarget(roundPool.find(p=>p.id===first.pid));
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
      setLotteryTarget(roundPool.find(p=>p.id===next.pid));
      setLotteryTeams(next.tids.map(tid=>teams.find(t=>String(t.id)===tid)).filter(Boolean));
      setLotteryResult(null);
      setPhase("lottery");
      return;
    }
    // 上限超えの競合を自動解決
    let autoResolved={...resolved};
    const allLosers=[...losers];
    pendingConflicts.slice(nextIdx).forEach(({pid,tids})=>{
      const winner=tids[rng(0,tids.length-1)];
      autoResolved[winner]=roundPool.find(p=>p.id===pid);
      tids.filter(tid=>tid!==winner).forEach(tid=>{
        const t=teams.find(x=>String(x.id)===tid);if(t) allLosers.push(t);
      });
    });
    const cpu=cpuPicks||{};
    const allPicks={...cpu};if(amIActive&&myPick) allPicks[myId]=myPick;
    const loserIds=new Set(allLosers.map(t=>String(t.id)));
    const finalRoundPicks={};
    Object.entries(allPicks).forEach(([tid,p])=>{
      if(!loserIds.has(tid)) finalRoundPicks[tid]=autoResolved[tid]||p;
    });
    endRound(finalRoundPicks,allLosers);
  };

  // くじ引き実行
  const drawLottery=()=>{
    const thisIdx=currentConflictIdx;
    const winner=lotteryTeams[rng(0,lotteryTeams.length-1)];
    setLotteryResult(winner);
    setTimeout(()=>{
      const losers=lotteryTeams.filter(t=>t.id!==winner.id);
      const newResolved={...resolvedPicks,[winner.id]:lotteryTarget};
      const newAllLosers=[...allLotteryLosers,...losers];
      setAllLotteryLosers(newAllLosers);
      setResolvedPicks(newResolved);
      advanceConflict(newResolved,newAllLosers,thisIdx);
    },1500);
  };

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

  // 全ドラフト自動処理（全球団を順番に貪欲指名→DraftScreenもスキップ）
  const handleAutoAll=()=>{
    const used=new Set();
    const picks={};
    allSorted.forEach(t=>{
      const avail=roundPool.filter(p=>!used.has(p.id));
      if(!avail.length) return;
      const scored=avail.map((p,i)=>({p,score:scoreProspectForTeam(t,p,i)})).sort((a,b)=>b.score-a.score);
      picks[t.id]=scored[0].p;used.add(scored[0].p.id);
    });
    onDone(picks,true);
  };

  if(showPreview) return(
    <div style={{position:"relative"}}>
      <div style={{position:"sticky",top:0,zIndex:99,background:"rgba(10,15,26,.95)",padding:"8px 14px",borderBottom:"1px solid rgba(255,255,255,.08)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{fontSize:12,color:"#94a3b8"}}>📋 ドラフト展望 (参考)</span>
        <button className="btn" style={{fontSize:11,padding:"4px 14px",background:"rgba(148,163,184,.1)",color:"#94a3b8",border:"1px solid rgba(148,163,184,.2)"}} onClick={()=>setShowPreview(false)}>← 戻る</button>
      </div>
      <DraftPreviewScreen teams={teams} myId={myId} year={year} pool={pool} draftAllocation={null} onAllocationChange={null} onStart={()=>setShowPreview(false)} startLabel="← ドラフトに戻る"/>
    </div>
  );

  if(phase==="select") return(
    <div className="app"><div style={{padding:"14px"}}>
      <div style={{fontSize:11,color:"#94a3b8",letterSpacing:".1em",marginBottom:2}}>DRAFT {year}</div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div style={{fontSize:22,fontWeight:700,color:"#f5c842"}}>📋 {roundLabel}</div>
        <button className="btn" style={{fontSize:10,padding:"3px 10px",background:"rgba(148,163,184,.1)",color:"#94a3b8",border:"1px solid rgba(148,163,184,.2)",flexShrink:0}} onClick={()=>setShowPreview(true)}>📋 展望</button>
      </div>
      {amIActive?(
        <>
          <div style={{fontSize:11,color:"#94a3b8",marginBottom:10}}>全球団が同時発表します。被りはくじ引きで決定。</div>
          <div className="card" style={{marginBottom:10}}>
            <div className="card-h">{myTeam?.name} — {roundLabel}選手</div>
            {!canMyTeamDraft&&(
              <div style={{padding:"8px 6px",fontSize:11,color:"#f87171"}}>
                ⚠️ 支配下登録人数が上限（{MAX_SHIHAKA_TOTAL}名）に到達しているため、ドラフト指名はできません。
              </div>
            )}
            {roundPool.slice(0,20).map(p=>(
              <div key={p.id} onClick={()=>{if(canMyTeamDraft)setMyPick(p);}} style={{padding:"7px 6px",borderBottom:"1px solid rgba(255,255,255,.04)",cursor:canMyTeamDraft?"pointer":"not-allowed",opacity:canMyTeamDraft?1:0.5,background:myPick?.id===p.id?"rgba(245,200,66,.08)":undefined}}>
                <div className="fsb">
                  <div>
                    <span style={{fontWeight:700,fontSize:13,color:myPick?.id===p.id?"#f5c842":"#e0d4bf"}}>{p.name}</span>
                    {p.isPitcher&&<HandBadge p={p}/>}
                    <span style={{fontSize:10,color:"#374151",marginLeft:6}}>{p.pos}/{p.age}歳</span>
                  </div>
                  <span style={{fontSize:10,color:"#94a3b8"}}>{p.isPitcher?"投手":"野手"}</span>
                </div>
              </div>
            ))}
          </div>
          <button className="btn btn-gold" style={{width:"100%",padding:"12px 0",opacity:(myPick&&canMyTeamDraft)?1:0.4}} onClick={handleAnnounce}>
            {!canMyTeamDraft?"指名不可（支配下上限）":myPick?`${myPick.name} を${roundLabel} →`:"選手を選んでください"}
          </button>
        </>
      ):(
        <div style={{textAlign:"center",padding:"40px 0"}}>
          <div style={{fontSize:13,color:"#94a3b8",marginBottom:16}}>あなたの球団は前のラウンドで指名が確定しました</div>
          <div style={{fontSize:11,color:"#374151",marginBottom:24}}>{activeTeams.map(t=>`${t.emoji} ${t.name}`).join(" / ")} が{roundLabel}を選択中…</div>
          <button className="btn btn-gold" style={{padding:"10px 32px"}} onClick={handleAnnounce}>発表を見る →</button>
        </div>
      )}
      {hazureRound===0&&(
        <button className="btn" style={{width:"100%",padding:"10px 0",marginTop:8,fontSize:12,background:"rgba(148,163,184,.1)",color:"#94a3b8",border:"1px solid rgba(148,163,184,.2)"}} onClick={handleAutoAll}>
          ⚡ 全ドラフト自動処理（1巡目〜全巡一括）
        </button>
      )}
    </div></div>
  );

  if(phase==="announce") return(
    <div className="app"><div style={{padding:"14px"}}>
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
    <div className="app"><div style={{padding:"14px"}}>
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
    <div className="app"><div style={{padding:"14px"}}>
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
      <button className="btn btn-gold" style={{width:"100%",padding:"12px 0"}} onClick={()=>onDone(confirmedPicks)}>
        2巡目以降へ →
      </button>
    </div></div>
  );

  return null;
}


export function DraftScreen({teams,myId,year,pool,draftAllocation,autoSkip:autoSkipProp,onDraftDone}){
  const alloc=draftAllocation??{pitcher:50,batter:50};
  const allSorted=[...teams].sort((a,b)=>a.wins-b.wins);
  const draftOrder=[];
  for(let round=0;round<DRAFT_ROUNDS;round++){allSorted.forEach(t=>draftOrder.push({round,team:t}));}
  // 1巡目はlotteryで処理済みなのでスキップ
  const draftOrderFiltered=draftOrder.filter(function(d){return d.round>0;});
  const [pickIdx,setPickIdx]=useState(0);
  const [drafted,setDrafted]=useState({});
  const [log,setLog]=useState([]);
  const [done,setDone]=useState(false);
  // 予算配分に応じた自動スカウト開示
  const autoScout=useMemo(()=>{
    const pShare=alloc.pitcher/100;
    const bShare=alloc.batter/100;
    const pitchers=pool.filter(p=>p.isPitcher&&!p.fromScout).sort((a,b)=>b.potential-a.potential);
    const batters=pool.filter(p=>!p.isPitcher&&!p.fromScout).sort((a,b)=>b.potential-a.potential);
    const autoP=Math.round(pShare*8);
    const autoB=Math.round(bShare*8);
    const s=new Set([...pitchers.slice(0,autoP).map(p=>p.id),...batters.slice(0,autoB).map(p=>p.id),...pool.filter(p=>p.fromScout).map(p=>p.id)]);
    return s;
  },[pool,alloc.pitcher,alloc.batter]);
  const [scouted,setScouted]=useState(autoScout);
  const [scoutPt,setScoutPt]=useState(5);
  const [announcement,setAnnouncement]=useState(null);
  const [autoRunning,setAutoRunning]=useState(false);
  const [localAutoSkip,setLocalAutoSkip]=useState(!!autoSkipProp);
  const effectiveAutoSkip=autoSkipProp||localAutoSkip;
  const [showPreview,setShowPreview]=useState(false);
  const current=draftOrderFiltered[pickIdx];
  const scoreProspectForTeam=(team, player, rankIdx=0)=>{
    const needs=analyzeTeamNeeds(team);
    const topNeed=needs[0];
    const wantsPitcher=needs.some(n=>n.type.includes("先発")||n.type.includes("中継ぎ")||n.type.includes("抑え")||n.type.includes("投手"));
    const wantsYouth=needs.some(n=>n.type.includes("若手")||n.type.includes("将来"));
    const urgent=topNeed?.horizon==="short";
    let score=100-rankIdx*2;
    if(wantsPitcher&&player.isPitcher) score+=24;
    if(!wantsPitcher&&!player.isPitcher) score+=14;
    if(needs.some(n=>n.type.includes("捕手"))&&!player.isPitcher&&player.pos==="捕手") score+=16;
    if(urgent) score+=Math.round((player.readinessScore??50)*0.2);
    else score+=Math.round((player.potential??50)*0.15);
    if(wantsYouth&&(player.age||22)<=20) score+=10;
    return score;
  };
  const isMyTurn=current&&current.team.id===myId&&!done;
  const isPickedAfterRound1=pid=>Object.prototype.hasOwnProperty.call(drafted,pid);
  // 1巡目で指名済みの選手を除外
  const predrafted=pool.filter(p=>p._drafted).reduce((a,p)=>{a[p.id]=p._r1winner;return a;},{});
  const availPool=pool.filter(p=>!isPickedAfterRound1(p.id)&&!p._drafted);
  const myPicks=[
    ...pool.filter(p=>p._drafted&&Number(p._r1winner)===Number(myId)),
    ...pool.filter(p=>Number(drafted[p.id])===Number(myId)),
  ];
  const myTeam = teams.find(t => Number(t.id) === Number(myId));
  const myCurrentShihaikaCount = ((myTeam?.players || []).length + (myTeam?.farm || []).filter(p => !p?.育成).length);
  const myTotalDrafted = myPicks.length;
  const myRemainingSlots = Math.max(0, MAX_SHIHAKA_TOTAL - myCurrentShihaikaCount - myTotalDrafted);
  const canMyTeamDraft = myRemainingSlots > 0;
  const doScout=pid=>{if(scoutPt<=0||scouted.has(pid)) return;setScouted(prev=>new Set([...prev,pid]));setScoutPt(n=>n-1);};
  const announce=(msg,color="#f5c842")=>{setAnnouncement({msg,color});setTimeout(()=>setAnnouncement(null),2200);};
  const doPick=(pick,isMe)=>{
    const newDrafted={...drafted,[pick.id]:isMe?myId:current.team.id};
    const comment=isMe?DRAFT_COMMENTS_MY[rng(0,DRAFT_COMMENTS_MY.length-1)]:`${current.team.name}${DRAFT_COMMENTS_CPU[rng(0,DRAFT_COMMENTS_CPU.length-1)]}`;
    setDrafted(newDrafted);
    setLog(prev=>[{round:current.round+1,team:current.team,player:pick,isMe,comment},...prev]);
    // 入団拒否リスク（自チーム指名時のみ、高ポテンシャルほど拒否しやすい）
    let refused=false;
    if(isMe){
      const refuseChance=clamp((pick.potential-70)/200,0,0.15); // 最大15%
      if(Math.random()<refuseChance){
        refused=true;
        announce(`❌ ${pick.name} が入団を拒否！他球団を選択...`,"#f87171");
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
    // CPU戦略：補強ニーズに合う選手を優先
    const needs=analyzeTeamNeeds(current.team);
    const scored=avail.map((p,i)=>{
      let score=scoreProspectForTeam(current.team,p,i);
      if(needs.some(n=>n.type.includes("ミート"))&&!p.isPitcher&&(p.batting?.contact||0)>=65) score+=8;
      return {p,score};
    }).sort((a,b)=>b.score-a.score);
    // 8%でサプライズ指名
    const surprise=Math.random()<0.08&&avail.length>6;
    const pick=surprise?avail[rng(4,Math.min(8,avail.length-1))]:scored[0].p;
    doPick(pick,false);
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
  // 全自動処理：自チーム含め全指名を自動実行
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(()=>{
    if(!effectiveAutoSkip||done||pickIdx>=draftOrderFiltered.length) return;
    const t=setTimeout(()=>{
      if(!current) return;
      const avail=pool.filter(p=>!isPickedAfterRound1(p.id)&&!p._drafted);
      if(!avail.length){setDone(true);return;}
      const scored=avail.map((p,i)=>({p,score:scoreProspectForTeam(current.team,p,i)})).sort((a,b)=>b.score-a.score);
      const pick=scored[0].p;
      const isMe=current.team.id===myId;
      setDrafted(prev=>({...prev,[pick.id]:isMe?myId:current.team.id}));
      setLog(prev=>[{round:current.round+1,team:current.team,player:pick,isMe,comment:isMe?"(自動)":""},...prev]);
      if(pickIdx+1>=draftOrderFiltered.length) setDone(true);
      else setPickIdx(i=>i+1);
    },30);
    return()=>clearTimeout(t);
  },[effectiveAutoSkip,pickIdx,done]);
  const getBudgetFactor=p=>1.0-(p.isPitcher?alloc.pitcher:alloc.batter)/100*0.5;
  const statView=p=>{
    const sc=scouted.has(p.id)||Number(drafted[p.id])===Number(myId)||p.fromScout;
    if(!sc) return p.isPitcher?"球速??? 制球??? 変化??? スタ???":"ミート??? 長打??? 走力??? 選球???";
    if(p.fromScout){return p.isPitcher?`球速${p.pitching.velocity} 制球${p.pitching.control} 変化${p.pitching.breaking} スタ${p.pitching.stamina}`:`ミート${p.batting.contact} 長打${p.batting.power} 走力${p.batting.speed} 選球${p.batting.eye}`;}
    const bf=getBudgetFactor(p);
    const sv=(obj,k)=>scoutedValue(obj[k],p.id,k,10,bf).value;
    return p.isPitcher?`球速${sv(p.pitching,"velocity")} 制球${sv(p.pitching,"control")} 変化${sv(p.pitching,"breaking")} スタ${sv(p.pitching,"stamina")}`:`ミート${sv(p.batting,"contact")} 長打${sv(p.batting,"power")} 走力${sv(p.batting,"speed")} 選球${sv(p.batting,"eye")}`;
  };
  const ovView=p=>{
    if(!scouted.has(p.id)&&Number(drafted[p.id])!==Number(myId)&&!p.fromScout) return "??";
    if(p.fromScout) return p.isPitcher?Math.round((p.pitching.velocity+p.pitching.control+p.pitching.breaking)/3):Math.round((p.batting.contact+p.batting.power+p.batting.eye+p.batting.speed)/4);
    const bf=getBudgetFactor(p);
    const sv=(obj,k)=>scoutedValue(obj[k],p.id,k,10,bf).value;
    return p.isPitcher?Math.round((sv(p.pitching,"velocity")+sv(p.pitching,"control")+sv(p.pitching,"breaking"))/3):Math.round((sv(p.batting,"contact")+sv(p.batting,"power")+sv(p.batting,"eye")+sv(p.batting,"speed"))/4);
  };
  const progress=Math.round(pickIdx/draftOrderFiltered.length*100);
  if(showPreview) return(
    <div style={{position:"relative"}}>
      <div style={{position:"sticky",top:0,zIndex:99,background:"rgba(10,15,26,.95)",padding:"8px 14px",borderBottom:"1px solid rgba(255,255,255,.08)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{fontSize:12,color:"#94a3b8"}}>📋 ドラフト展望 (参考)</span>
        <button className="btn" style={{fontSize:11,padding:"4px 14px",background:"rgba(148,163,184,.1)",color:"#94a3b8",border:"1px solid rgba(148,163,184,.2)"}} onClick={()=>setShowPreview(false)}>← 戻る</button>
      </div>
      <DraftPreviewScreen teams={teams} myId={myId} year={year} pool={pool} draftAllocation={null} onAllocationChange={null} onStart={()=>setShowPreview(false)} startLabel="← ドラフトに戻る"/>
    </div>
  );
  return(
    <div className="app">
      <style>{`.draft-pool{max-height:320px;overflow-y:auto;}.draft-pick{padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.04);cursor:pointer;transition:.15s;}.draft-pick:hover{background:rgba(245,200,66,.06);}.draft-log{max-height:240px;overflow-y:auto;}@keyframes fadeSlide{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:translateY(0)}}.announce{animation:fadeSlide .3s ease;}`}</style>
      <div style={{maxWidth:740,margin:"0 auto",padding:"12px"}}>
        <div style={{textAlign:"center",marginBottom:10}}>
          <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:38,color:"#f5c842",letterSpacing:".05em"}}>{year+1}年 ドラフト会議</div>
          <div style={{fontSize:10,color:"#374151"}}>2巡目以降 · {pickIdx}/{draftOrderFiltered.length}指名完了</div>
          <div style={{background:"rgba(255,255,255,.05)",borderRadius:4,height:5,margin:"8px 0",overflow:"hidden"}}><div style={{height:"100%",background:"linear-gradient(90deg,#f5c842,#f97316)",width:progress+"%",transition:".4s"}}/></div>
          {!done&&(
            <div style={{display:"flex",gap:6,justifyContent:"center",marginTop:4}}>
              <button className="btn" style={{fontSize:11,padding:"4px 14px",background:"rgba(148,163,184,.1)",color:"#94a3b8",border:"1px solid rgba(148,163,184,.2)"}} onClick={()=>setShowPreview(true)}>📋 展望</button>
              {!effectiveAutoSkip&&(
                <button className="btn" style={{fontSize:11,padding:"4px 14px",background:"rgba(148,163,184,.1)",color:"#94a3b8",border:"1px solid rgba(148,163,184,.2)"}} onClick={()=>setLocalAutoSkip(true)}>⚡ 全自動処理</button>
              )}
              {effectiveAutoSkip&&<span style={{fontSize:10,color:"#94a3b8",alignSelf:"center"}}>⚡ 自動処理中…</span>}
            </div>
          )}
        </div>
        {pool.filter(p=>p.spotlight&&!isPickedAfterRound1(p.id)).length>0&&(
          <div style={{display:"flex",gap:6,marginBottom:10,overflowX:"auto",paddingBottom:4}}>
            {pool.filter(p=>p.spotlight&&!isPickedAfterRound1(p.id)).map(p=>(<div key={p.id} style={{minWidth:160,background:"linear-gradient(135deg,rgba(245,200,66,.12),rgba(249,115,22,.08))",border:"1px solid rgba(245,200,66,.3)",borderRadius:8,padding:"8px 10px",flexShrink:0}}>
              <div style={{fontSize:10,color:"#f97316",fontWeight:700,marginBottom:2}}>{p.spotlight}</div>
              <div style={{fontWeight:700,fontSize:13}}>{p.name}</div>
              <div style={{fontSize:10,color:"#374151"}}>{p.pos}/{p.age}歳{p.isPitcher&&<HandBadge p={p}/>}</div>
              <div style={{fontSize:9,color:"#a78bfa",marginTop:2}}>ポテンシャル {p.potential}</div>
            </div>))}
          </div>
        )}
        {announcement&&(<div className="announce" style={{background:"rgba(0,0,0,.7)",border:`1px solid ${announcement.color}`,borderRadius:8,padding:"10px 16px",marginBottom:10,textAlign:"center",color:announcement.color,fontWeight:700,fontSize:13}}>{announcement.msg}</div>)}
        {done?(
          <div style={{textAlign:"center",padding:"20px 0"}}>
            <div style={{fontSize:36,marginBottom:8}}>🎊</div>
            <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:32,color:"#34d399",marginBottom:16}}>ドラフト終了！</div>
            <div className="card" style={{textAlign:"left",marginBottom:16}}>
              <div className="card-h">自チーム指名選手 ({myPicks.length}人)</div>
              {myPicks.map(p=>(<div key={p.id} style={{padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,.04)"}}>
                <div className="fsb"><div><span style={{fontWeight:700,color:"#f5c842"}}>{p.name}</span>{p.isPitcher&&<HandBadge p={p}/>}<span style={{fontSize:10,color:"#374151",marginLeft:8}}>{p.pos}/{p.age}歳</span>{p.spotlight&&<span style={{fontSize:9,color:"#f97316",marginLeft:6}}>{p.spotlight}</span>}</div><span style={{fontSize:10,color:"#a78bfa"}}>P:{p.potential}</span></div>
                <div style={{fontSize:10,color:"#34d399",marginTop:4}}>{statView(p)}</div>
              </div>))}
            </div>
            <button className="btn btn-gold" style={{padding:"12px 40px"}} onClick={()=>onDraftDone(pool,drafted)}>▶ 結果レビューへ</button>
          </div>
        ):(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div className="card" style={{padding:"10px"}}>
              <div className="card-h" style={{marginBottom:6}}>{isMyTurn?<span style={{color:"#f5c842",fontWeight:700}}>🔔 あなたの番！</span>:<span style={{color:"#94a3b8"}}>{current?.team.emoji} {current?.team.name} が選択中…</span>}<span style={{float:"right",fontSize:10,color:"#374151"}}>{current?.round+1}巡目</span></div>
              <div style={{display:"flex",alignItems:"center",gap:8,padding:"5px 8px",background:"rgba(167,139,250,.08)",borderRadius:5,marginBottom:8,fontSize:11}}>
                <span style={{color:"#a78bfa"}}>🔍 スカウトPT</span><span style={{fontWeight:700,color:scoutPt>0?"#f5c842":"#f87171"}}>{scoutPt}</span><span style={{color:"#374151",fontSize:10}}>残</span>
              </div>
              <div style={{fontSize:10,color:canMyTeamDraft?"#94a3b8":"#f87171",marginBottom:8}}>
                支配下登録: {myCurrentShihaikaCount + myTotalDrafted}/{MAX_SHIHAKA_TOTAL}（残り {myRemainingSlots}）
              </div>
              <div className="draft-pool">
                {availPool.slice(0,22).map(p=>{const isSc=scouted.has(p.id);const ov=ovView(p);const rs=p.readinessScore??50;const rsColor=rs>=65?"#34d399":rs>=45?"#94a3b8":"#a78bfa";return(<div key={p.id} className="draft-pick" style={{background:p.spotlight?"rgba(249,115,22,.04)":undefined,borderLeft:p.spotlight?"2px solid #f97316":undefined,opacity:isMyTurn?1:.55}}>
                  <div className="fsb"><div style={{flex:1}} onClick={()=>isMyTurn&&myPick(p.id)}><span style={{fontWeight:700,fontSize:12}}>{p.name}</span>{p.isPitcher&&<HandBadge p={p}/>}<span style={{fontSize:10,color:"#374151",marginLeft:6}}>{p.pos}/{p.age}歳</span>{p.prospectType&&<span style={{fontSize:9,color:rsColor,marginLeft:4,padding:"1px 4px",borderRadius:3,background:"rgba(255,255,255,.05)"}}>{p.prospectType}</span>}{p.spotlight&&<span style={{fontSize:9,color:"#f97316",marginLeft:4}}>{p.spotlight}</span>}</div>
                    <div style={{display:"flex",gap:4,alignItems:"center"}}>
                      {!isSc&&<button className="bsm" style={{fontSize:9,padding:"1px 5px",background:"rgba(167,139,250,.15)",color:"#a78bfa",border:"1px solid rgba(167,139,250,.3)",borderRadius:3,opacity:scoutPt>0?1:.4,cursor:scoutPt>0?"pointer":"not-allowed"}} onClick={e=>{e.stopPropagation();doScout(p.id);}}>🔍-1</button>}
                      <span style={{fontSize:9,color:"#374151"}}>総合</span><span style={{fontFamily:"monospace",fontWeight:700,color:ov==="??"?"#374151":ov>=75?"#ffd700":ov>=65?"#34d399":"#94a3b8"}}>{ov}</span>
                    </div>
                  </div>
                  <div style={{fontSize:9,color:isSc?"#60a5fa":"#374151",marginTop:2}} onClick={()=>isMyTurn&&myPick(p.id)}>{statView(p)}</div>
                  {isSc&&<div style={{fontSize:9,color:"#a78bfa",marginTop:1}}>P:{p.potential}　{p.playerType&&<span style={{color:"#60a5fa"}}>{p.playerType}</span>}</div>}
                  {p.fromScout&&<div style={{fontSize:8,color:"#34d399",marginTop:1}}>✅ スカウト済み（能力値確認済み）</div>}
                  {isSc&&p.playerComment&&<div style={{fontSize:8,color:"#374151",marginTop:1,fontStyle:"italic"}}>"{p.playerComment}"</div>}
                </div>);})}
              </div>
            </div>
            <div className="card" style={{padding:"10px"}}>
              <div className="card-h">指名実況</div>
              <div className="draft-log">
                {log.map((e,i)=>(<div key={i} style={{padding:"6px 8px",marginBottom:4,borderRadius:5,background:e.isMe?"rgba(245,200,66,.08)":"rgba(255,255,255,.02)",borderLeft:`3px solid ${e.isMe?"#f5c842":e.team.color}`}}>
                  <div style={{fontSize:9,color:"#374151"}}>{e.round}巡目 · {e.team.emoji}{e.team.short}</div>
                  <div style={{fontSize:12,fontWeight:e.isMe?700:400,color:e.isMe?"#f5c842":"#e0d4bf"}}>{e.player.name}<span style={{fontSize:9,color:"#374151",marginLeft:6}}>{e.player.pos}/{e.player.age}歳</span></div>
                  <div style={{fontSize:9,color:e.isMe?"#34d399":"#374151",marginTop:1,fontStyle:"italic"}}>{e.comment}</div>
                </div>))}
                {log.length===0&&<div style={{color:"#374151",fontSize:11,padding:"8px"}}>指名待ち…</div>}
              </div>
              {myPicks.length>0&&(<div style={{marginTop:8,borderTop:"1px solid rgba(255,255,255,.06)",paddingTop:8}}>
                <div style={{fontSize:9,color:"#374151",marginBottom:4}}>✅ 自チーム指名済み ({myPicks.length}/{DRAFT_ROUNDS}人)</div>
                {myPicks.map(p=>(<div key={p.id} style={{fontSize:10,color:"#f5c842",padding:"2px 0",display:"flex",gap:6,alignItems:"center"}}>{p.name}{p.isPitcher&&<HandBadge p={p}/>}<span style={{color:"#374151"}}>{p.pos}</span></div>))}
              </div>)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
/* ═══════════════════════════════════════════════
   PLAYOFF SYSTEM
═══════════════════════════════════════════════ */

export function DraftReviewScreen({teams,myId,year,pool,drafted,onEnd}){
  const sameTeam=(a,b)=>Number(a)===Number(b);
  const picksFor=teamId=>pool.filter(p=>sameTeam(p._r1winner,teamId)||sameTeam(drafted[p.id],teamId));
  const myPicks=picksFor(myId);
  const undrafted=pool.filter(p=>!p._drafted&&drafted[p.id]===undefined);
  const [tab,setTab]=useState("myteam");
  const grade=()=>{
    if(!myPicks.length) return{g:"D",c:"指名なし。"};
    const sc=myPicks.reduce((s,p)=>s+p.potential,0)/myPicks.length+(myPicks.some(p=>p.spotlight)?10:0);
    if(sc>=82) return{g:"S",c:"素晴らしい！将来のチームの柱になりうる選手を獲得。完全勝利。"};
    if(sc>=74) return{g:"A",c:"上々のドラフト。ポテンシャルの高い選手を確保できた。"};
    if(sc>=66) return{g:"B",c:"平均的な結果。即戦力と将来性のバランスが取れた指名。"};
    if(sc>=58) return{g:"C",c:"やや物足りない。補強ポイントと合致しない指名もあった。"};
    return{g:"D",c:"厳しい結果。上位候補を逃した可能性が高い。"};
  };
  const pred=p=>{
    if(p.potential>=82) return{label:"💎 大当たり候補",color:"#ffd700"};
    if(p.potential>=74) return{label:"⭐ 当たり候補",color:"#34d399"};
    if(p.potential>=65) return{label:"🔵 普通",color:"#60a5fa"};
    return{label:"⚠️ 外れ候補",color:"#f87171"};
  };
  const {g,c}=grade();
  const gc=g==="S"?"#ffd700":g==="A"?"#34d399":g==="B"?"#60a5fa":g==="C"?"#f5c842":"#f87171";
  const ov=p=>p.isPitcher?Math.round((p.pitching.velocity+p.pitching.control+p.pitching.breaking)/3):Math.round((p.batting.contact+p.batting.power+p.batting.eye+p.batting.speed)/4);
  return(
    <div className="app"><div style={{maxWidth:700,margin:"0 auto",padding:"16px 12px"}}>
      <div style={{textAlign:"center",marginBottom:14}}><div style={{fontFamily:"'Bebas Neue',cursive",fontSize:34,color:"#f5c842"}}>{year+1}年 ドラフト レビュー</div></div>
      <div style={{display:"flex",gap:6,marginBottom:12}}>
        {[["myteam","🏆 自チーム評価"],["allteams","📋 全球団結果"],["undrafted","😢 指名漏れ"]].map(([k,l])=>(<button key={k} className={"bsm "+(tab===k?"bgb":"bga")} style={{flex:1,padding:"7px 0",fontSize:11}} onClick={()=>setTab(k)}>{l}</button>))}
      </div>
      {tab==="myteam"&&(<>
        <div className="card" style={{marginBottom:10,textAlign:"center"}}>
          <div style={{fontSize:13,color:"#374151",marginBottom:6}}>自チーム ドラフト採点</div>
          <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:72,color:gc,lineHeight:1}}>{g}</div>
          <p style={{color:"#e0d4bf",fontSize:12,marginTop:8,lineHeight:1.6}}>{c}</p>
        </div>
        <div className="card"><div className="card-h">指名選手 &amp; 成長予想メモ</div>
          <p style={{fontSize:10,color:"#374151",marginBottom:8}}>※ポテンシャルに基づく予想。実際の成長は育成次第！</p>
          {myPicks.map(p=>{const pr=pred(p);return(<div key={p.id} style={{padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,.04)"}}>
            <div className="fsb"><div><span style={{fontWeight:700,color:"#f5c842"}}>{p.name}</span>{p.isPitcher&&<HandBadge p={p}/>}<span style={{fontSize:10,color:"#374151",marginLeft:6}}>{p.pos}/{p.age}歳</span>{p.spotlight&&<span style={{fontSize:9,color:"#f97316",marginLeft:4}}>{p.spotlight}</span>}</div><span style={{fontSize:11,fontWeight:700,color:pr.color}}>{pr.label}</span></div>
            <div style={{fontSize:9,color:"#94a3b8",marginTop:3}}>{p.isPitcher?`球速${p.pitching.velocity} 制球${p.pitching.control} 変化${p.pitching.breaking}`:`ミート${p.batting.contact} 長打${p.batting.power} 走力${p.batting.speed}`}<span style={{color:"#a78bfa",marginLeft:8}}>P:{p.potential}</span></div>
          </div>);})}
        </div>
      </>)}
      {tab==="allteams"&&(<div className="card"><div className="card-h">全球団 指名結果</div>
        {teams.map(t=>{const picks=picksFor(t.id);const isMe=t.id===myId;return(<div key={t.id} style={{padding:"8px 10px",marginBottom:6,borderRadius:6,background:isMe?"rgba(245,200,66,.05)":"rgba(255,255,255,.02)",border:isMe?"1px solid rgba(245,200,66,.15)":"1px solid rgba(255,255,255,.04)"}}>
          <div style={{fontWeight:700,color:t.color,marginBottom:4}}>{t.emoji} {t.name}{isMe&&<span style={{fontSize:9,color:"#f5c842",marginLeft:6}}>← あなた</span>}</div>
          {picks.length===0?<span style={{fontSize:10,color:"#374151"}}>指名なし</span>:picks.map(p=>(<div key={p.id} style={{fontSize:11,color:isMe?"#f5c842":"#94a3b8",padding:"2px 0",display:"flex",gap:8,alignItems:"center"}}><span>{p.name}</span>{p.isPitcher&&<HandBadge p={p}/>}<span style={{fontSize:9,color:"#374151"}}>{p.pos}/{p.age}歳</span>{p.spotlight&&<span style={{fontSize:8,color:"#f97316"}}>{p.spotlight}</span>}<span style={{fontSize:9,color:"#a78bfa",marginLeft:"auto"}}>P:{p.potential}</span></div>))}
        </div>);})}
      </div>)}
      {tab==="undrafted"&&(<div className="card"><div className="card-h">😢 指名漏れ ({undrafted.length}人)</div>
        {undrafted.slice(0,10).map(p=>(<div key={p.id} style={{padding:"6px 0",borderBottom:"1px solid rgba(255,255,255,.04)",display:"flex",alignItems:"center",gap:8}}>
          <div style={{flex:1}}><span style={{fontWeight:700,fontSize:12}}>{p.name}</span>{p.isPitcher&&<HandBadge p={p}/>}<span style={{fontSize:10,color:"#374151",marginLeft:6}}>{p.pos}/{p.age}歳</span>{p.spotlight&&<span style={{fontSize:9,color:"#f97316",marginLeft:4}}>{p.spotlight}</span>}<div style={{fontSize:9,color:"#374151",marginTop:2}}>{p.isPitcher?`球速${p.pitching.velocity} 制球${p.pitching.control} 変化${p.pitching.breaking}`:`ミート${p.batting.contact} 長打${p.batting.power} 走力${p.batting.speed}`}</div></div>
          <div style={{textAlign:"right"}}><OV v={ov(p)}/><div style={{fontSize:9,color:"#a78bfa"}}>P:{p.potential}</div></div>
        </div>))}
      </div>)}
      <div style={{textAlign:"center",marginTop:16}}><button className="btn btn-gold" style={{padding:"12px 40px"}} onClick={onEnd}>▶ {year+1}年シーズン開幕！</button></div>
    </div></div>
  );
}
  const scoreProspectForTeam=(team, player, rankIdx=0)=>{
    const needs=analyzeTeamNeeds(team);
    const topNeed=needs[0];
    const wantsPitcher=needs.some(n=>n.type.includes("先発")||n.type.includes("中継ぎ")||n.type.includes("抑え")||n.type.includes("投手"));
    const wantsYouth=needs.some(n=>n.type.includes("若手")||n.type.includes("将来"));
    const urgent=topNeed?.horizon==="short";
    let score=100-rankIdx*3;
    if(wantsPitcher&&player.isPitcher) score+=26;
    if(!wantsPitcher&&!player.isPitcher) score+=16;
    if(needs.some(n=>n.type.includes("捕手"))&&!player.isPitcher&&player.pos==="捕手") score+=18;
    if(urgent) score+=Math.round((player.readinessScore??50)*0.2);
    else score+=Math.round((player.potential??50)*0.15);
    if(wantsYouth&&(player.age||22)<=20) score+=10;
    return score;
  };
