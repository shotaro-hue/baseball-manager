import React, { useState } from "react";
import { fmtM, scoutNoise } from '../../utils';
import { tradeValue, evalTradeForCpu, analyzeTeamNeeds } from '../../engine/trade';

export function TradeTab({myTeam,teams,onTrade,cpuOffers,onAcceptOffer,onDeclineOffer,deadlinePassed=false,onPlayerClick}){
  const [phase,setPhase]=useState("top");
  const [targetTeam,setTargetTeam]=useState(null);
  const [myOut,setMyOut]=useState([]);
  const [theirIn,setTheirIn]=useState([]);
  const [myCash,setMyCash]=useState(0);
  const [tradeResult,setTradeResult]=useState(null);
  const [counter,setCounter]=useState(null);
  const [counterRound,setCounterRound]=useState(0);
  const [cpuReasons,setCpuReasons]=useState([]);

  const otherTeams=teams.filter(t=>t.id!==myTeam.id);
  const myOutVal=myOut.reduce((s,p)=>s+tradeValue(p),0);
  const theirInVal=theirIn.reduce((s,p)=>s+tradeValue(p),0);
  const cashVal=myCash*0.3;
  const balance=myOutVal+cashVal-theirInVal;
  const canPropose=theirIn.length>0;

  const toggleMyOut=p=>setMyOut(prev=>prev.find(x=>x.id===p.id)?prev.filter(x=>x.id!==p.id):[...prev,p]);
  const toggleTheirIn=p=>setTheirIn(prev=>prev.find(x=>x.id===p.id)?prev.filter(x=>x.id!==p.id):[...prev,p]);

  const proposeTrade=()=>{
    if(!canPropose||!targetTeam) return;
    const ev=evalTradeForCpu(targetTeam,myOut,theirIn,myCash);
    setCpuReasons(ev.reasons||[]);
    if(counterRound>=2){
      if(ev.favorable||(ev.fair&&Math.random()<0.5)){onTrade(myOut,theirIn,targetTeam,myCash);setTradeResult("accept");}
      else{setTradeResult("reject");}
      return;
    }
    const acceptThreshold=counterRound===0?0.55:0.30;
    if(ev.favorable){
      onTrade(myOut,theirIn,targetTeam,myCash);setTradeResult("accept");
    } else if(ev.fair){
      if(Math.random()<acceptThreshold){onTrade(myOut,theirIn,targetTeam,myCash);setTradeResult("accept");}
      else{
        const extra=targetTeam.players.filter(p=>!theirIn.find(x=>x.id===p.id)).sort((a,b)=>tradeValue(a)-tradeValue(b))[0];
        const needCash=Math.max(0,Math.round((theirInVal-myOutVal-cashVal)*10));
        const cashMult=counterRound===1?1.5:1;
        setCounter({extraPlayer:Math.random()<0.5&&extra?extra:null,extraCash:Math.random()<0.5&&extra?0:Math.round(needCash*cashMult)});
        setCounterRound(r=>r+1);
        setTradeResult("counter");
      }
    } else{setTradeResult("reject");}
  };

  const acceptCounter=()=>{
    const newIn=counter?.extraPlayer?[...theirIn,counter.extraPlayer]:theirIn;
    onTrade(myOut,newIn,targetTeam,myCash+(counter?.extraCash||0));
    setTradeResult("accept");
  };
  const reset=()=>{setPhase("top");setTargetTeam(null);setMyOut([]);setTheirIn([]);setMyCash(0);setTradeResult(null);setCounter(null);setCounterRound(0);setCpuReasons([]);};
  const fmtV=v=>{const c=v>=80?"#ffd700":v>=65?"#34d399":v>=50?"#60a5fa":"#94a3b8";return <span style={{fontWeight:700,color:c,fontFamily:"monospace"}}>{v}</span>;};
  const sl=p=>p.isPitcher?`球速${p.pitching?.velocity} 制球${p.pitching?.control}`:`ミート${p.batting?.contact} 長打${p.batting?.power}`;
  const slNoisy=p=>p.isPitcher?`球速${scoutNoise(p.pitching?.velocity,p.id,"velocity")} 制球${scoutNoise(p.pitching?.control,p.id,"control")}`:`ミート${scoutNoise(p.batting?.contact,p.id,"contact")} 長打${scoutNoise(p.batting?.power,p.id,"power")}`;
  const balColor=balance>8?"#34d399":balance<-8?"#f87171":"#f5c842";
  const balLabel=balance>8?"⚠️ 相手に有利（承認されやすい）":balance<-8?"⚠️ 自分に有利（断られやすい）":"⚖️ ほぼ等価";

  return(
    <div>
      {cpuOffers.length>0&&(
        <div className="card" style={{marginBottom:10,border:"1px solid rgba(249,115,22,.3)"}}>
          <div className="card-h" style={{color:"#f97316"}}>📨 トレードオファー ({cpuOffers.length}件)</div>
          {cpuOffers.map((offer,i)=>(
            <div key={i} style={{padding:"10px",marginBottom:6,borderRadius:6,background:"rgba(249,115,22,.05)"}}>
              <div style={{fontWeight:700,color:offer.from.color,marginBottom:6}}>{offer.from.emoji} {offer.from.name} からのオファー</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",gap:8,alignItems:"center",marginBottom:8}}>
                <div><div style={{fontSize:9,color:"#374151",marginBottom:3}}>あなたが出す</div>
                  {offer.want.map(p=>(<div key={p.id} style={{fontSize:11,color:"#f87171",fontWeight:700}}>{p.name}<span style={{fontSize:9,color:"#374151",marginLeft:4}}>{p.pos} 評価{tradeValue(p)}</span></div>))}
                </div>
                <div style={{fontSize:20}}>⇄</div>
                <div><div style={{fontSize:9,color:"#374151",marginBottom:3}}>あなたが受け取る</div>
                  {offer.offer.length>0?offer.offer.map(p=>(<div key={p.id} style={{fontSize:11,color:"#34d399",fontWeight:700}}>{p.name}<span style={{fontSize:9,color:"#374151",marginLeft:4}}>{p.pos} 評価{tradeValue(p)}</span></div>)):<div style={{fontSize:11,color:"#34d399"}}>💴 金銭のみ</div>}
                  {offer.cash>0&&<div style={{fontSize:10,color:"#f5c842"}}>+{(offer.cash/10000).toLocaleString()}万円</div>}
                </div>
              </div>
              <div style={{display:"flex",gap:6}}>
                <button className="bsm bga" style={{flex:1}} onClick={()=>onAcceptOffer(i)}>✅ 承諾</button>
                <button className="bsm bgr" style={{flex:1}} onClick={()=>onDeclineOffer(i)}>❌ 拒否</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {phase==="top"&&(
        <div className="card">
          <div className="card-h">🔄 トレード交渉を始める</div>
          {deadlinePassed
            ? <div style={{background:"rgba(248,113,113,.1)",border:"1px solid rgba(248,113,113,.3)",borderRadius:6,padding:"10px 12px",color:"#f87171",fontSize:12,marginBottom:8}}>⛔ トレード期限終了 — 第96戦以降はトレード不可</div>
            : <p style={{fontSize:11,color:"#374151",marginBottom:10}}>交渉する球団を選んでください</p>
          }
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
            {otherTeams.map(t=>(<div key={t.id} style={{padding:"10px",borderRadius:6,background:deadlinePassed?"rgba(255,255,255,.01)":"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.06)",cursor:deadlinePassed?"not-allowed":"pointer",opacity:deadlinePassed?0.4:1}} onClick={()=>{if(deadlinePassed)return;setTargetTeam(t);setPhase("build");}}>
              <div style={{fontWeight:700,color:t.color,marginBottom:4}}>{t.emoji} {t.name}</div>
              <div style={{fontSize:9,color:"#374151"}}>{analyzeTeamNeeds(t).map(n=>"📌"+n).join(" ")}</div>
            </div>))}
          </div>
        </div>
      )}
      {phase==="build"&&targetTeam&&!tradeResult&&(
        <div>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
            <button className="bsm bga" onClick={reset}>← 戻る</button>
            <span style={{fontWeight:700,color:targetTeam.color}}>{targetTeam.emoji} {targetTeam.name} との交渉</span>
          </div>
          <div className="card" style={{marginBottom:8}}>
            <div className="card-h">💴 自分が支払う金額（任意）</div>
            <div style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",flexWrap:"wrap"}}>
              {[0,500,1000,3000,5000].map(v=>(<button key={v} className={"bsm "+(myCash===v?"bgb":"bga")} onClick={()=>setMyCash(v)}>{v===0?"なし":v.toLocaleString()+"万"}</button>))}
              <input type="number" value={myCash} onChange={e=>setMyCash(Math.max(0,Number(e.target.value)))} step="100" min="0"
                style={{background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.1)",borderRadius:6,padding:"4px 8px",color:"#e0d4bf",fontFamily:"monospace",width:80}}/>
              <span style={{fontSize:10,color:"#374151"}}>万円</span>
            </div>
            {myOut.length===0&&myCash>0&&<div style={{fontSize:10,color:"#60a5fa",marginTop:4}}>💡 金銭のみで選手を獲得できます</div>}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
            <div className="card" style={{padding:"10px"}}>
              <div className="card-h" style={{color:"#f87171",marginBottom:6}}>📤 自分が出す選手<span style={{fontSize:9,color:"#374151",fontWeight:400,marginLeft:6}}>（任意）</span></div>
              <div style={{maxHeight:220,overflowY:"auto"}}>
                {myTeam.players.map(p=>{const sel=!!myOut.find(x=>x.id===p.id);return(
                  <div key={p.id} onClick={()=>toggleMyOut(p)} style={{padding:"5px 6px",marginBottom:3,borderRadius:4,cursor:"pointer",background:sel?"rgba(248,113,113,.12)":"rgba(255,255,255,.02)",border:sel?"1px solid rgba(248,113,113,.4)":"1px solid transparent"}}>
                    <div className="fsb"><span style={{fontSize:11,fontWeight:sel?700:400}}><span style={{color:"#60a5fa"}} onClick={e=>{e.stopPropagation();onPlayerClick?.(p,myTeam.name);}}>{p.name}</span></span>{fmtV(tradeValue(p))}</div>
                    <div style={{fontSize:9,color:"#374151"}}>{p.pos}/{p.age}歳 {sl(p)}</div>
                  </div>
                );})}
              </div>
            </div>
            <div className="card" style={{padding:"10px"}}>
              <div className="card-h" style={{color:"#34d399",marginBottom:6}}>📥 相手から受け取る</div>
              <div style={{fontSize:9,color:"#374151",marginBottom:4}}>※スカウト評価（誤差±12）</div>
              <div style={{maxHeight:220,overflowY:"auto"}}>
                {targetTeam.players.map(p=>{const sel=!!theirIn.find(x=>x.id===p.id);return(
                  <div key={p.id} onClick={()=>toggleTheirIn(p)} style={{padding:"5px 6px",marginBottom:3,borderRadius:4,cursor:"pointer",background:sel?"rgba(52,211,153,.08)":"rgba(255,255,255,.02)",border:sel?"1px solid rgba(52,211,153,.3)":"1px solid transparent"}}>
                    <div className="fsb"><span style={{fontSize:11,fontWeight:sel?700:400}}><span style={{color:"#60a5fa"}} onClick={e=>{e.stopPropagation();onPlayerClick?.(p,targetTeam.name);}}>{p.name}</span></span>{fmtV(tradeValue(p))}</div>
                    <div style={{fontSize:9,color:"#374151"}}>{p.pos}/{p.age}歳 {slNoisy(p)}</div>
                  </div>
                );})}
              </div>
            </div>
          </div>
          {canPropose&&(<div className="card" style={{marginBottom:8,padding:"10px"}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",gap:8,alignItems:"center"}}>
              <div style={{textAlign:"center"}}><div style={{fontSize:9,color:"#f87171"}}>あなたが出す</div><div style={{fontSize:20,fontWeight:700,color:"#f87171"}}>{myOutVal}</div>{myCash>0&&<div style={{fontSize:9,color:"#f5c842"}}>+{myCash.toLocaleString()}万円</div>}</div>
              <div style={{fontSize:18}}>⇄</div>
              <div style={{textAlign:"center"}}><div style={{fontSize:9,color:"#34d399"}}>受け取る</div><div style={{fontSize:20,fontWeight:700,color:"#34d399"}}>{theirInVal}</div></div>
            </div>
            <div style={{textAlign:"center",fontSize:10,marginTop:6,color:balColor}}>{balLabel}</div>
          </div>)}
          <button className="btn btn-gold" style={{width:"100%",padding:"12px 0",opacity:canPropose?1:0.4}} disabled={!canPropose} onClick={proposeTrade}>📨 トレードを提案する</button>
          {!canPropose&&<div style={{fontSize:10,color:"#374151",textAlign:"center",marginTop:6}}>受け取る選手を1人以上選んでください</div>}
        </div>
      )}
      {tradeResult&&(<div className="card" style={{textAlign:"center",padding:"24px 16px"}}>
        {tradeResult==="accept"&&<><div style={{fontSize:40,marginBottom:8}}>🎉</div><div style={{fontFamily:"'Bebas Neue',cursive",fontSize:28,color:"#34d399",marginBottom:8}}>トレード成立！</div><p style={{fontSize:12,color:"#374151",marginBottom:16}}>{targetTeam?.name}との交渉が成立しました</p></>}
        {tradeResult==="reject"&&<><div style={{fontSize:40,marginBottom:8}}>❌</div><div style={{fontFamily:"'Bebas Neue',cursive",fontSize:28,color:"#f87171",marginBottom:8}}>拒否されました</div><p style={{fontSize:12,color:"#374151",marginBottom:16}}>金銭を上乗せするか、条件を変えて再提案しましょう。</p></>}
        {tradeResult==="counter"&&counter&&<><div style={{fontSize:40,marginBottom:8}}>🔄</div>
          <div style={{fontSize:10,color:"#f5c842",marginBottom:6}}>交渉 {counterRound}/{3} ラウンド目</div>
          <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:28,color:"#f5c842",marginBottom:8}}>逆提案が来ました！</div>
          <div className="card" style={{textAlign:"left",marginBottom:12}}><div className="card-h">{targetTeam?.name}の追加要求</div>
            {counter.extraPlayer&&<div style={{padding:"6px 0",fontSize:12,color:"#f5c842"}}>「{counter.extraPlayer.name}も一緒に欲しい」<span style={{fontSize:9,color:"#374151",marginLeft:6}}>{counter.extraPlayer.pos} 評価{tradeValue(counter.extraPlayer)}</span></div>}
            {!counter.extraPlayer&&counter.extraCash>0&&<div style={{padding:"6px 0",fontSize:12,color:"#f5c842"}}>「{counter.extraCash.toLocaleString()}万円を上乗せしてほしい」</div>}
            {cpuReasons.length>0&&<div style={{marginTop:8,padding:"6px 10px",background:"rgba(255,255,255,.04)",borderRadius:6,fontSize:11,color:"#94a3b8"}}><div style={{fontSize:9,color:"#374151",marginBottom:3}}>CPU の本音：</div>{cpuReasons.map((r,i)=><div key={i} style={{padding:"2px 0"}}>「{r}」</div>)}</div>}
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <button className="btn btn-gold" style={{flex:1}} onClick={acceptCounter}>✅ 受け入れる</button>
            {counterRound<3&&<button className="bsm bga" style={{flex:1,padding:"10px 0"}} onClick={()=>{setTradeResult(null);setPhase("build");}}>✏️ 修正して再提案</button>}
            <button className="bsm bgr" style={{flex:1,padding:"10px 0"}} onClick={reset}>❌ 断る</button>
          </div>
        </>}
        {(tradeResult==="reject"||tradeResult==="accept")&&<button className="bsm bga" style={{marginTop:12}} onClick={reset}>続けて交渉する</button>}
      </div>)}
    </div>
  );
}
