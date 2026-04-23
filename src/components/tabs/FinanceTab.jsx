import React from "react";
import { fmtSal } from '../../utils';
import { calcRevenue } from '../../engine/finance';

export function FinanceTab({team,onStadiumUpgrade,gameDay,onPlayerClick}){
  const rev=calcRevenue(team);
  const lvl=team.stadiumLevel??0;
  const UPGRADE_COSTS=[5000000,10000000,20000000];
  const MULT_LABELS=["1.0x","1.25x","1.6x","2.0x"];
  const STAR_LABELS=["★☆☆","★★☆","★★★","★★★+"];
  const nextCost=lvl<3?UPGRADE_COSTS[lvl]:null;
  const revThisSeason=team.revenueThisSeason??0;
  const gamesPlayed=(gameDay||1)-1;
  const projected=gamesPlayed>0?Math.round(revThisSeason/gamesPlayed*143):0;
  const annualSponsor = rev.sponsor * 143;
  const annualMerch = rev.merch * 143;
  return(
    <div>
      <div className="g2">
        <div className="card">
          <div className="card-h">収入（試合ごと）</div>
          {[["チケット売上",fmtSal(rev.ticket)],["平均単価",`${rev.avgTicketPrice.toLocaleString()}円/枚`],["観客動員",`${rev.attendance.toLocaleString()}人`]].map(([l,v])=>(
            <div key={l} className="fsb" style={{padding:"7px 0",borderBottom:"1px solid rgba(255,255,255,.03)"}}><span style={{fontSize:11,color:"#4b5563"}}>{l}</span><span className="mono" style={{color:"#34d399"}}>{v}</span></div>
          ))}
        </div>
        <div className="card">
          <div className="card-h">収入（年間見込み）</div>
          {[["スポンサー",fmtSal(annualSponsor)],["グッズ",fmtSal(annualMerch)],["年間合計",fmtSal(annualSponsor+annualMerch)]].map(([l,v])=>(
            <div key={l} className="fsb" style={{padding:"7px 0",borderBottom:"1px solid rgba(255,255,255,.03)"}}><span style={{fontSize:11,color:"#4b5563"}}>{l}</span><span className="mono" style={{color:"#34d399"}}>{v}</span></div>
          ))}
        </div>
      </div>
      <div className="card">
        <div className="card-h">支出</div>
        {[["選手年俸",fmtSal(team.players.reduce((s,p)=>s+p.salary,0))],["コーチ",fmtSal(team.coaches.reduce((s,c)=>s+c.salary,0))]].map(([l,v])=>(
          <div key={l} className="fsb" style={{padding:"7px 0",borderBottom:"1px solid rgba(255,255,255,.03)"}}><span style={{fontSize:11,color:"#4b5563"}}>{l}</span><span className="mono" style={{color:"#f87171"}}>{v}</span></div>
        ))}
      </div>
      <div className="card">
        <div className="card-h">📊 ファン感情</div>
        <div className="fsb" style={{padding:"7px 0"}}>
          <span style={{fontSize:11,color:"#4b5563"}}>ファン人気</span>
          <span className="mono" style={{color:"#f5c842"}}>{team.popularity??50}/100</span>
        </div>
        <div style={{background:"rgba(255,255,255,.05)",borderRadius:4,height:8,margin:"4px 0 10px"}}>
          <div style={{width:`${team.popularity??50}%`,height:"100%",borderRadius:4,background:(team.popularity??50)>=70?"#34d399":(team.popularity??50)>=40?"#f5c842":"#f87171"}}/>
        </div>
        {(team.winStreak??0)>=2&&<div style={{fontSize:12,color:"#34d399"}}>🔥 {team.winStreak}連勝中</div>}
        {(team.loseStreak??0)>=2&&<div style={{fontSize:12,color:"#f87171"}}>📉 {team.loseStreak}連敗中</div>}
        <div style={{fontSize:11,color:"#4b5563",marginTop:6}}>
          {(team.winStreak??0)>=3?"↑↑ 人気急上昇":(team.winStreak??0)>=1?"↑ 上昇中":(team.loseStreak??0)>=3?"↓↓ 人気急落中":(team.loseStreak??0)>=1?"↓ 下降中":"→ 安定"}
        </div>
      </div>
      <div className="card">
        <div className="card-h">📈 シーズン収益サマリー</div>
        {[["シーズン累計",fmtSal(revThisSeason)],["投資済み球場レベル",`Lv${lvl} ${STAR_LABELS[lvl]} (${MULT_LABELS[lvl]})`],["シーズン収入予測",gamesPlayed>0?fmtSal(projected):"計算中..."]].map(([l,v])=>(
          <div key={l} className="fsb" style={{padding:"7px 0",borderBottom:"1px solid rgba(255,255,255,.03)"}}><span style={{fontSize:11,color:"#4b5563"}}>{l}</span><span className="mono" style={{color:"#34d399"}}>{v}</span></div>
        ))}
      </div>
      <div className="card">
        <div className="card-h">🏟️ 球場投資</div>
        <div className="fsb" style={{marginBottom:8}}><span style={{fontSize:12}}>現在: Lv{lvl} {STAR_LABELS[lvl]}</span><span style={{fontSize:11,color:"#34d399"}}>チケット {MULT_LABELS[lvl]}</span></div>
        {lvl<3?(<>
          <div style={{fontSize:11,color:"#4b5563",marginBottom:8}}>Lv{lvl+1}アップグレード: {fmtSal(nextCost)}<span style={{fontSize:10,color:"#34d399",marginLeft:6}}>→ {MULT_LABELS[lvl+1]}</span></div>
          <button className="btn btn-gold" style={{width:"100%",opacity:(team.budget??0)>=nextCost?1:0.4}} disabled={(team.budget??0)<nextCost} onClick={onStadiumUpgrade}>🏗️ Lv{lvl+1}に投資する ({fmtSal(nextCost)})</button>
        </>):(
          <div style={{fontSize:12,color:"#f5c842",textAlign:"center",padding:"8px 0"}}>✅ 球場は最高レベルです</div>
        )}
      </div>
      <div className="card">
        <div className="card-h">予算 / 年俸上位</div>
        <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:24,color:"#60a5fa",marginBottom:12}}>{fmtSal(team.budget)}</div>
        {team.players.sort((a,b)=>b.salary-a.salary).slice(0,6).map(p=>(
          <div key={p.id} className="fsb" style={{padding:"5px 0",borderBottom:"1px solid rgba(255,255,255,.025)"}}><span style={{fontSize:12,cursor:"pointer"}} onClick={()=>onPlayerClick?.(p,team.name)}><span style={{color:"#60a5fa"}}>{p.name}</span> <span style={{fontSize:10,color:"#374151"}}>{p.pos}/{p.contractYearsLeft}年</span></span><span className="mono" style={{color:"#f5c842"}}>{fmtSal(p.salary)}</span></div>
        ))}
      </div>
    </div>
  );
}
