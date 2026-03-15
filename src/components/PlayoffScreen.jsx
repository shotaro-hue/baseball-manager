import { useState } from "react";
import { quickSimGame } from '../engine/simulation';



export function PlayoffScreen({playoff,setPlayoff,teams,myId,year,onFinish}){
  const myTeam=teams.find(t=>t.id===myId);
  const phase=playoff.phase;
  const [simMsg,setSimMsg]=useState(null);

  const simOneGame=(seriesKey,need,nextPhaseBuilder)=>{
    const s=playoff[seriesKey];
    const t0=teams.find(t=>t.id===s.teams[0].id)||s.teams[0];
    const t1=teams.find(t=>t.id===s.teams[1].id)||s.teams[1];
    const r=quickSimGame(t0,t1);
    const my=r.score.my||0;
    const op=r.score.opp||0;
    const scoreStr=my+"-"+op;
    const won0=my>op;
    const nw=[s.wins[0]+(won0?1:0),s.wins[1]+(!won0?1:0)];
    const ng=[...s.games,{score:scoreStr,won0}];
    const w=nw[0]>=need?0:nw[1]>=need?1:null;
    const ns={...s,wins:nw,games:ng,done:w!==null,winner:w};
    const msg=(won0?t0.name:t1.name)+" が勝利！（"+scoreStr+"）"+(w!==null?"→ "+[t0,t1][w].name+"がシリーズ突破！":"");
    setSimMsg(msg);
    if(w!==null&&nextPhaseBuilder){
      const {nextPhase,extra}=nextPhaseBuilder([t0,t1][w],ns);
      setPlayoff(prev=>({...prev,[seriesKey]:ns,...extra,phase:nextPhase}));
    } else {
      setPlayoff(prev=>({...prev,[seriesKey]:ns}));
    }
  };

  const isMyGame=(seriesKey)=>{
    const s=playoff[seriesKey];
    return s&&!s.done&&(s.teams[0].id===myId||s.teams[1].id===myId);
  };

  // 全試合まとめてオートシム
  const simAllRemaining=()=>{
    const order=["cs1_se","cs1_pa","cs2_se","cs2_pa","jpSeries"];
    const needs={cs1_se:2,cs1_pa:2,cs2_se:4,cs2_pa:4,jpSeries:4};
    let state={...playoff};

    const simSeriesAll=(seriesKey,need)=>{
      let s=state[seriesKey];
      if(!s||s.done) return;
      while(!s.done){
        const t0=teams.find(t=>t.id===s.teams[0].id)||s.teams[0];
        const t1=teams.find(t=>t.id===s.teams[1].id)||s.teams[1];
        const r=quickSimGame(t0,t1);
        const my=r.score.my||0;const op=r.score.opp||0;
        const won0=my>op;
        const nw=[s.wins[0]+(won0?1:0),s.wins[1]+(!won0?1:0)];
        const ng=[...s.games,{score:my+"-"+op,won0}];
        const w=nw[0]>=need?0:nw[1]>=need?1:null;
        s={...s,wins:nw,games:ng,done:w!==null,winner:w};
      }
      state[seriesKey]=s;
      return [s.teams[0],s.teams[1]][s.winner];
    };

    // CS1
    const seW1=simSeriesAll("cs1_se",2);
    const paW1=simSeriesAll("cs1_pa",2);

    // CS2（CS1の勝者が確定してから）
    if(seW1&&state.cs1_se&&state.cs1_se.done){
      const cs1Se=state.cs1_se;
      const seTop=cs1Se.teams[0]; // 1位チーム（アドバンテージあり）
      state.cs2_se={label:"CSファイナルステージ（セ）",teams:[seTop,seW1],wins:[1,0],adv:[1,0],games:[],done:false,winner:null};
      simSeriesAll("cs2_se",4);
    }
    if(paW1&&state.cs1_pa&&state.cs1_pa.done){
      const cs1Pa=state.cs1_pa;
      const paTop=cs1Pa.teams[0];
      state.cs2_pa={label:"CSファイナルステージ（パ）",teams:[paTop,paW1],wins:[1,0],adv:[1,0],games:[],done:false,winner:null};
      simSeriesAll("cs2_pa",4);
    }

    // 日本シリーズ
    const seChamp=state.cs2_se&&state.cs2_se.done?[state.cs2_se.teams[0],state.cs2_se.teams[1]][state.cs2_se.winner]:null;
    const paChamp=state.cs2_pa&&state.cs2_pa.done?[state.cs2_pa.teams[0],state.cs2_pa.teams[1]][state.cs2_pa.winner]:null;
    if(seChamp&&paChamp){
      state.jpSeries={label:"日本シリーズ",teams:[seChamp,paChamp],wins:[0,0],adv:[0,0],games:[],done:false,winner:null};
      const jpW=simSeriesAll("jpSeries",4);
      if(jpW) state={...state,champion:jpW,phase:"champion"};
    }

    setPlayoff(state);
    setSimMsg("全試合シミュレーション完了！");
  };

  const renderSeries=(seriesKey,need,label)=>{
    const s=playoff[seriesKey];
    if(!s) return null;
    const t0=s.teams[0];const t1=s.teams[1];
    const active=phase===seriesKey&&!s.done;
    return(
      <div className="card" style={{marginBottom:8,border:active?"1px solid rgba(245,200,66,.3)":"1px solid rgba(255,255,255,.06)"}}>
        <div style={{fontSize:10,color:"#f5c842",fontWeight:700,marginBottom:6}}>{s.label}</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",alignItems:"center",gap:8,marginBottom:8}}>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:12,fontWeight:700,color:t0.color}}>{t0.emoji} {t0.short||t0.name}</div>
            {s.adv[0]>0&&<div style={{fontSize:9,color:"#94a3b8"}}>({s.adv[0]}勝アドバンテージ)</div>}
          </div>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:22,fontWeight:700,color:"#f5c842"}}>{s.wins[0]} - {s.wins[1]}</div>
            <div style={{fontSize:9,color:"#374151"}}>先に{need}勝</div>
          </div>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:12,fontWeight:700,color:t1.color}}>{t1.emoji} {t1.short||t1.name}</div>
          </div>
        </div>
        {s.games.length>0&&(
          <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:6}}>
            {s.games.map((g,i)=><span key={i} style={{fontSize:9,padding:"2px 6px",borderRadius:4,background:g.won0?"rgba(59,130,246,.2)":"rgba(239,68,68,.2)",color:g.won0?"#60a5fa":"#f87171"}}>{g.score}</span>)}
          </div>
        )}
        {s.done&&<div style={{fontSize:11,color:"#34d399",textAlign:"center"}}>✅ {[t0,t1][s.winner].name} 突破！</div>}
        {active&&(
          <button className="btn btn-gold" style={{width:"100%",marginTop:6}} onClick={()=>{
            const need2=seriesKey==="cs1_se"||seriesKey==="cs1_pa"?2:seriesKey==="jpSeries"?4:4;
            const nextPhaseBuilder=
              seriesKey==="cs1_se"?((w)=>({nextPhase:"cs1_pa",extra:{cs2_se:{...{label:"CSファイナルステージ（セ）",teams:[playoff.se1,w],wins:[1,0],adv:[1,0],games:[],done:false,winner:null}}}})):
              seriesKey==="cs1_pa"?((w)=>({nextPhase:"cs2_se",extra:{cs2_pa:{...{label:"CSファイナルステージ（パ）",teams:[playoff.pa1,w],wins:[1,0],adv:[1,0],games:[],done:false,winner:null}}}})):
              seriesKey==="cs2_se"?((w,s)=>({nextPhase:"cs2_pa",extra:{}})):
              seriesKey==="cs2_pa"?((w,s)=>{
                const seChamp=playoff.cs2_se?[playoff.cs2_se.teams[0],playoff.cs2_se.teams[1]][playoff.cs2_se.winner]:playoff.se1;
                return{nextPhase:"jpSeries",extra:{jpSeries:{label:"日本シリーズ",teams:[seChamp,w],wins:[0,0],adv:[0,0],games:[],done:false,winner:null}}};
              }):
              seriesKey==="jpSeries"?((w)=>({nextPhase:"champion",extra:{champion:w}})):null;
            simOneGame(seriesKey,need2,nextPhaseBuilder?((w,sNew)=>nextPhaseBuilder(w,sNew)):null);
          }}>
            {isMyGame(seriesKey)?"⚾ 試合を行う（自動シム）":"⚾ 試合を進める"}
          </button>
        )}
      </div>
    );
  };

  if(phase==="champion"&&playoff.champion){
    const champ=playoff.champion;
    const isMe=champ.id===myId;
    return(
      <div className="app"><div style={{maxWidth:580,margin:"0 auto",padding:"40px 20px",textAlign:"center"}}>
        <div style={{fontSize:64,marginBottom:10}}>🏆</div>
        <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:48,color:"#f5c842",letterSpacing:".1em",marginBottom:8}}>{year}年 日本一！</div>
        <div style={{fontSize:20,color:champ.color,fontWeight:700,marginBottom:4}}>{champ.emoji} {champ.name}</div>
        {isMe&&<div style={{fontSize:16,color:"#34d399",margin:"12px 0"}}>おめでとうございます！日本一達成！🎊</div>}
        {!isMe&&<div style={{fontSize:13,color:"#94a3b8",margin:"12px 0"}}>あなたのチームは今年の頂点には届きませんでした。</div>}
        <button className="btn btn-gold" style={{padding:"12px 36px",marginTop:16}} onClick={onFinish}>⚾ 引退フェーズへ →</button>
      </div></div>
    );
  }

  return(
    <div className="app"><div style={{maxWidth:580,margin:"0 auto",padding:"20px"}}>
      <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:32,color:"#f5c842",letterSpacing:".1em",marginBottom:16,textAlign:"center"}}>🏆 {year}年 ポストシーズン</div>
      {simMsg&&<div style={{padding:"8px 12px",borderRadius:6,background:"rgba(245,200,66,.08)",border:"1px solid rgba(245,200,66,.2)",fontSize:11,color:"#f5c842",marginBottom:10,textAlign:"center"}}>{simMsg}</div>}
      <button className="bsm bga" style={{width:"100%",padding:"8px 0",marginBottom:10,fontSize:11}} onClick={simAllRemaining}>
        ⚡ 全試合まとめてオートシム
      </button>
      {renderSeries("cs1_se",2)}
      {renderSeries("cs1_pa",2)}
      {playoff.cs2_se&&renderSeries("cs2_se",4)}
      {playoff.cs2_pa&&renderSeries("cs2_pa",4)}
      {playoff.jpSeries&&renderSeries("jpSeries",4)}
    </div></div>
  );
}
