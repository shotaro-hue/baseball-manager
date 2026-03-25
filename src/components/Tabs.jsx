import React, { useState } from "react";
import { ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis,
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { MAX_ROSTER, MAX_FARM, MAX_外国人_一軍, PVAL_DEFS, ACCEPT_THRESHOLD, SCOUT_REGIONS, IS_HIT } from '../constants';
import { fmtAvg, fmtPct, fmtSal, fmtM, fmtIP, scoutNoise } from '../utils';
import { saberBatter, saberPitcher } from '../engine/sabermetrics';
import { evalOffer } from '../engine/contract';
import { tradeValue, evalTradeForCpu, analyzeTeamNeeds } from '../engine/trade';
import { calcRevenue } from '../engine/finance';
import { OV, CondBadge, HandBadge, PersonalityView, ThCell } from './ui';
import { emptyStats } from '../engine/player';


export function StatsTab({teams,myId}){
  const [view,setView]=useState("batter");
  const [selId,setSelId]=useState(null);
  const [openTip,setOpenTip]=useState(null);
  const myTeam=teams.find(t=>t.id===myId);
  const batters=myTeam.players.filter(p=>!p.isPitcher);
  const pitchers=myTeam.players.filter(p=>p.isPitcher);
  const sel=myTeam.players.find(p=>p.id===selId);
  const radar=sel?(sel.isPitcher?[
    {s:"球速",v:sel.pitching.velocity},
    {s:"制球",v:sel.pitching.control},
    {s:"変化球",v:sel.pitching.breaking},
    {s:"球種",v:sel.pitching.variety},
    {s:"ピンチ",v:sel.pitching.clutchP},
    {s:"スタミナ",v:sel.pitching.stamina},
  ]:[
    {s:"ミート",v:sel.batting.contact},
    {s:"長打",v:sel.batting.power},
    {s:"走力",v:sel.batting.speed},
    {s:"選球",v:sel.batting.eye},
    {s:"クラッチ",v:sel.batting.clutch},
    {s:"変化球",v:sel.batting.breakingBall},
  ]):[];
  return(
    <div>
      <div className="tabs">
        {[["batter","🏏 打者"],["pitcher","⚾ 投手"]].map(([k,l])=>(
          <button key={k} onClick={()=>{setSelId(null);setView(k);}} className={`tab ${view===k?"on":""}`}>{l}</button>
        ))}
      </div>
      {sel&&(
        <div className="card" style={{marginBottom:10}}>
          <div className="fsb" style={{marginBottom:8}}>
            <div><span style={{fontWeight:700,fontSize:15}}>{sel.name}</span><span style={{fontSize:11,color:"#374151",marginLeft:8}}>{sel.pos}/{sel.age}歳</span></div>
            <button className="bsm bgr" onClick={()=>setSelId(null)}>✕</button>
          </div>
          <div className="g2">
            <ResponsiveContainer width="100%" height={170}><RadarChart data={radar}><PolarGrid stroke="rgba(255,255,255,.07)"/><PolarAngleAxis dataKey="s" tick={{fill:"#374151",fontSize:10}}/><Radar dataKey="v" stroke="#f5c842" fill="#f5c842" fillOpacity={0.13}/></RadarChart></ResponsiveContainer>
            <div style={{fontSize:11}}>
              {sel.isPitcher?(()=>{const sp=saberPitcher(sel.stats);return[["防御率",sp.ERA],["WHIP",sp.WHIP],["FIP",sp.FIP],["xFIP",sp.xFIP],["三振率",fmtPct(sp.Kpct)],["四球率",fmtPct(sp.BBpct)],["WAR",sp.WAR]].map(([l,v])=><div key={l} className="fsb" style={{padding:"4px 0",borderBottom:"1px solid rgba(255,255,255,.03)"}}><span style={{color:"#374151"}}>{l}</span><span className="mono" style={{color:"#94a3b8"}}>{v}</span></div>);})():(()=>{const sb=saberBatter(sel.stats);return[["打率",fmtAvg(sel.stats.H,sel.stats.AB)],["OPS",sb.OPS.toFixed(3)],["wOBA",sb.wOBA.toFixed(3)],["wRC+",sb.wRCp],["ISO",sb.ISO.toFixed(3)],["四球率",fmtPct(sb.BBpct)],["三振率",fmtPct(sb.Kpct)],["打球速度",sb.EVavg>0?sb.EVavg+"km/h":"---"],["WAR",sb.WAR]].map(([l,v])=><div key={l} className="fsb" style={{padding:"4px 0",borderBottom:"1px solid rgba(255,255,255,.03)"}}><span style={{color:"#374151"}}>{l}</span><span className="mono" style={{color:"#94a3b8"}}>{v}</span></div>);})()}
            </div>
          </div>
          <CareerTable player={sel}/>
        </div>
      )}
      {view==="batter"&&(
        <div className="card">
          <div className="card-h">打者成績 — クリックで詳細</div>
          <div style={{overflowX:"auto"}}>
            <table className="tbl">
              <thead><tr>
  <th>選手</th>
  <ThCell label="打席"   openLabel={openTip} onOpen={setOpenTip}/>
  <ThCell label="打率"   openLabel={openTip} onOpen={setOpenTip}/>
  <ThCell label="OPS"   openLabel={openTip} onOpen={setOpenTip}/>
  <ThCell label="wOBA"  openLabel={openTip} onOpen={setOpenTip}/>
  <ThCell label="wRC+"  openLabel={openTip} onOpen={setOpenTip}/>
  <ThCell label="ISO"   openLabel={openTip} onOpen={setOpenTip}/>
  <ThCell label="BABIP" openLabel={openTip} onOpen={setOpenTip}/>
  <ThCell label="四球率" openLabel={openTip} onOpen={setOpenTip}/>
  <ThCell label="三振率" openLabel={openTip} onOpen={setOpenTip}/>
  <ThCell label="打球速度" openLabel={openTip} onOpen={setOpenTip}/>
  <ThCell label="打球角度" openLabel={openTip} onOpen={setOpenTip}/>
  <ThCell label="WAR"   openLabel={openTip} onOpen={setOpenTip}/>
  <th>本塁打</th>
  <th>打点</th>
  <th>盗塁</th>
</tr></thead>
              <tbody>
                {batters.sort((a,b)=>saberBatter(b.stats).OPS-saberBatter(a.stats).OPS).map(p=>{const sb=saberBatter(p.stats);return(
                  <tr key={p.id} style={{cursor:"pointer"}} onClick={()=>setSelId(p.id)}>
                    <td style={{fontWeight:700,fontSize:12,color:selId===p.id?"#f5c842":undefined}}>{p.name}</td>
                    <td className="mono">{p.stats.PA}</td>
                    <td className="mono">{fmtAvg(p.stats.H,p.stats.AB)}</td>
                    <td className="mono" style={{color:sb.OPS>=.850?"#34d399":sb.OPS>=.700?"#f5c842":undefined}}>{sb.OPS>0?sb.OPS.toFixed(3):"---"}</td>
                    <td className="mono">{sb.wOBA>0?sb.wOBA.toFixed(3):"---"}</td>
                    <td className="mono" style={{color:sb.wRCp>=130?"#34d399":sb.wRCp>=100?"#f5c842":sb.wRCp>0?"#f87171":undefined}}>{sb.wRCp!=null?sb.wRCp:"---"}</td>
                    <td className="mono">{sb.ISO>0?sb.ISO.toFixed(3):"---"}</td>
                    <td className="mono">{sb.BABIP>0?sb.BABIP.toFixed(3):"---"}</td>
                    <td className="mono">{sb.BBpct>0?fmtPct(sb.BBpct):"---"}</td>
                    <td className="mono" style={{color:sb.Kpct>0.25?"#f87171":sb.Kpct<0.15?"#34d399":undefined}}>{sb.Kpct>0?fmtPct(sb.Kpct):"---"}</td>
                    <td className="mono" style={{color:sb.EVavg>=145?"#34d399":sb.EVavg>=130?"#f5c842":undefined}}>{sb.EVavg>0?sb.EVavg.toFixed(1):"---"}</td>
                    <td className="mono">{sb.LAavg!=null?sb.LAavg.toFixed(1):"---"}</td>
                    <td className="mono" style={{color:sb.WAR>=4?"#34d399":sb.WAR>=2?"#f5c842":sb.WAR<0?"#f87171":undefined}}>{sb.WAR!=null?sb.WAR:"---"}</td>
                    <td className="mono" style={{color:p.stats.HR>=20?"#f5c842":undefined}}>{p.stats.HR}</td>
                    <td className="mono">{p.stats.RBI}</td>
                    <td className="mono" style={{color:p.stats.SB>=20?"#34d399":undefined}}>{p.stats.SB}{p.stats.CS>0&&<span style={{fontSize:9,color:"#f87171",marginLeft:2}}>({p.stats.CS})</span>}</td>
                  </tr>
                );})}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {view==="pitcher"&&(
        <div className="card">
          <div className="card-h">投手成績</div>
          <div style={{overflowX:"auto"}}>
            <table className="tbl">
              <thead><tr>
  <th>選手</th>
  <th>役割</th>
  <th>勝</th>
  <th>敗</th>
  <th title="セーブ">S</th>
  <th title="ホールド">H</th>
  <th title="クオリティスタート">QS</th>
  <ThCell label="投球回"  openLabel={openTip} onOpen={setOpenTip}/>
  <ThCell label="防御率"  openLabel={openTip} onOpen={setOpenTip}/>
  <ThCell label="WHIP"   openLabel={openTip} onOpen={setOpenTip}/>
  <ThCell label="FIP"    openLabel={openTip} onOpen={setOpenTip}/>
  <ThCell label="xFIP"   openLabel={openTip} onOpen={setOpenTip}/>
  <ThCell label="三振率"  openLabel={openTip} onOpen={setOpenTip}/>
  <ThCell label="四球率"  openLabel={openTip} onOpen={setOpenTip}/>
  <ThCell label="WAR"    openLabel={openTip} onOpen={setOpenTip}/>
</tr></thead>
              <tbody>
                {pitchers.sort((a,b)=>saberPitcher(a.stats).ERA-saberPitcher(b.stats).ERA).map(p=>{const sp=saberPitcher(p.stats);return(
                  <tr key={p.id} style={{cursor:"pointer"}} onClick={()=>setSelId(p.id)}>
                    <td style={{fontWeight:700,fontSize:12,color:selId===p.id?"#f5c842":undefined}}>{p.name}<HandBadge p={p}/></td>
                    <td style={{fontSize:10,color:"#374151"}}>{p.subtype}</td>
                    <td className="mono" style={{color:"#34d399"}}>{p.stats.W}</td><td className="mono" style={{color:"#f87171"}}>{p.stats.L}</td>
                    <td className="mono" style={{color:p.stats.SV>0?"#34d399":undefined}}>{p.stats.SV||"-"}</td>
                    <td className="mono" style={{color:p.stats.HLD>0?"#60a5fa":undefined}}>{p.stats.HLD||"-"}</td>
                    <td className="mono" style={{color:p.stats.QS>0?"#f5c842":undefined}}>{p.stats.QS||"-"}</td>
                    <td className="mono">{p.stats.IP>0?fmtIP(p.stats.IP):"---"}</td>
                    <td className="mono" style={{color:sp.WHIP>0&&sp.WHIP<1.0?"#34d399":sp.WHIP<1.3?"#f5c842":sp.WHIP<1.5?"#94a3b8":"#f87171"}}>{sp.WHIP>0?sp.WHIP:"---"}</td>
                    <td className="mono" style={{color:sp.FIP<3?"#34d399":sp.FIP<4?"#f5c842":sp.FIP>0?"#f87171":undefined}}>{sp.FIP>0?sp.FIP:"---"}</td>
                    <td className="mono">{sp.xFIP>0?sp.xFIP:"---"}</td>
                    <td className="mono" style={{color:sp.Kpct>=0.30?"#34d399":undefined}}>{sp.Kpct>0?fmtPct(sp.Kpct):"---"}</td>
                    <td className="mono" style={{color:sp.BBpct<=0.05?"#34d399":sp.BBpct>=0.12?"#f87171":undefined}}>{sp.BBpct>0?fmtPct(sp.BBpct):"---"}</td>
                    <td className="mono" style={{color:sp.WAR>=3?"#34d399":sp.WAR>=1?"#f5c842":sp.WAR<0?"#f87171":undefined}}>{sp.WAR!==0?sp.WAR:"---"}</td>
                  </tr>
                );})}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
/* ═══════════════════════════════════════════════
   STANDINGS TAB
═══════════════════════════════════════════════ */

export function FinanceTab({team,onStadiumUpgrade,gameDay}){
  const rev=calcRevenue(team);
  const lvl=team.stadiumLevel??0;
  const UPGRADE_COSTS=[5000000,10000000,20000000];
  const MULT_LABELS=["1.0x","1.25x","1.6x","2.0x"];
  const STAR_LABELS=["★☆☆","★★☆","★★★","★★★+"];
  const nextCost=lvl<3?UPGRADE_COSTS[lvl]:null;
  const revThisSeason=team.revenueThisSeason??0;
  const gamesPlayed=(gameDay||1)-1;
  const projected=gamesPlayed>0?Math.round(revThisSeason/gamesPlayed*143):0;
  return(
    <div>
      <div className="g2">
        <div className="card">
          <div className="card-h">収入（試合ごと）</div>
          {[["チケット",fmtM(rev.ticket)],["スポンサー",fmtM(rev.sponsor)],["グッズ",fmtM(rev.merch)]].map(([l,v])=>(
            <div key={l} className="fsb" style={{padding:"7px 0",borderBottom:"1px solid rgba(255,255,255,.03)"}}><span style={{fontSize:11,color:"#4b5563"}}>{l}</span><span className="mono" style={{color:"#34d399"}}>{v}</span></div>
          ))}
          <div className="fsb" style={{padding:"8px 0",marginTop:4}}><span style={{fontWeight:700}}>合計</span><span className="mono" style={{color:"#34d399",fontSize:14}}>{fmtM(rev.ticket+rev.sponsor+rev.merch)}</span></div>
        </div>
        <div className="card">
          <div className="card-h">支出</div>
          {[["選手年俸",fmtM(team.players.reduce((s,p)=>s+p.salary,0))],["コーチ",fmtM(team.coaches.reduce((s,c)=>s+c.salary,0))]].map(([l,v])=>(
            <div key={l} className="fsb" style={{padding:"7px 0",borderBottom:"1px solid rgba(255,255,255,.03)"}}><span style={{fontSize:11,color:"#4b5563"}}>{l}</span><span className="mono" style={{color:"#f87171"}}>{v}</span></div>
          ))}
        </div>
      </div>
      <div className="card">
        <div className="card-h">📈 シーズン収益サマリー</div>
        {[["シーズン累計",fmtM(revThisSeason)],["投資済み球場レベル",`Lv${lvl} ${STAR_LABELS[lvl]} (${MULT_LABELS[lvl]})`],["シーズン収入予測",gamesPlayed>0?fmtM(projected):"計算中..."]].map(([l,v])=>(
          <div key={l} className="fsb" style={{padding:"7px 0",borderBottom:"1px solid rgba(255,255,255,.03)"}}><span style={{fontSize:11,color:"#4b5563"}}>{l}</span><span className="mono" style={{color:"#34d399"}}>{v}</span></div>
        ))}
      </div>
      <div className="card">
        <div className="card-h">🏟️ 球場投資</div>
        <div className="fsb" style={{marginBottom:8}}><span style={{fontSize:12}}>現在: Lv{lvl} {STAR_LABELS[lvl]}</span><span style={{fontSize:11,color:"#34d399"}}>チケット {MULT_LABELS[lvl]}</span></div>
        {lvl<3?(<>
          <div style={{fontSize:11,color:"#4b5563",marginBottom:8}}>Lv{lvl+1}アップグレード: {fmtM(nextCost)}<span style={{fontSize:10,color:"#34d399",marginLeft:6}}>→ {MULT_LABELS[lvl+1]}</span></div>
          <button className="btn btn-gold" style={{width:"100%",opacity:(team.budget??0)>=nextCost?1:0.4}} disabled={(team.budget??0)<nextCost} onClick={onStadiumUpgrade}>🏗️ Lv{lvl+1}に投資する ({fmtM(nextCost)})</button>
        </>):(
          <div style={{fontSize:12,color:"#f5c842",textAlign:"center",padding:"8px 0"}}>✅ 球場は最高レベルです</div>
        )}
      </div>
      <div className="card">
        <div className="card-h">予算 / 年俸上位</div>
        <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:24,color:"#60a5fa",marginBottom:12}}>{fmtM(team.budget)}</div>
        {team.players.sort((a,b)=>b.salary-a.salary).slice(0,6).map(p=>(
          <div key={p.id} className="fsb" style={{padding:"5px 0",borderBottom:"1px solid rgba(255,255,255,.025)"}}><span style={{fontSize:12}}>{p.name} <span style={{fontSize:10,color:"#374151"}}>{p.pos}/{p.contractYearsLeft}年</span></span><span className="mono" style={{color:"#f5c842"}}>{fmtSal(p.salary)}</span></div>
        ))}
      </div>
    </div>
  );
}
/* ═══════════════════════════════════════════════
   RESULT SCREEN
═══════════════════════════════════════════════ */

export function ContractTab({team,allTeams,onOffer,onRelease}){
  const [selId,setSelId]=useState(null);
  const [offerSal,setOfferSal]=useState(0);
  const [offerYrs,setOfferYrs]=useState(1);
  const expiring=team.players.filter(p=>p.contractYearsLeft<=1);
  const sel=team.players.find(p=>p.id===selId);
  const preview=sel?evalOffer(sel,{salary:offerSal*10000,years:offerYrs},team,allTeams):null;
  const ac=preview?.total>=ACCEPT_THRESHOLD?"#34d399":preview?.total>=40?"#f5c842":"#f87171";
  return(
    <div>
      <div className="card">
        <div className="card-h">契約満了選手 ({expiring.length}人)</div>
        {expiring.length===0&&<p style={{color:"#2a3a4c",fontSize:12}}>今季満了の選手はいません</p>}
        <div style={{overflowX:"auto"}}>{expiring.length>0&&(
          <table className="tbl">
            <thead><tr><th>選手名</th><th>守備</th><th>年齢</th><th>現年俸</th><th>残年数</th><th></th></tr></thead>
            <tbody>{expiring.map(p=>(
              <tr key={p.id} style={{background:selId===p.id?"rgba(245,200,66,.04)":undefined}}>
                <td style={{fontWeight:700,cursor:"pointer",color:selId===p.id?"#f5c842":undefined}} onClick={()=>{setSelId(p.id);setOfferSal(Math.round(p.salary/10000));setOfferYrs(1);}}>{p.name}</td>
                <td style={{fontSize:10,color:"#374151"}}>{p.pos}</td><td className="mono">{p.age}</td>
                <td className="mono">{fmtSal(p.salary)}</td>
                <td className="mono" style={{color:p.contractYearsLeft===0?"#f87171":"#f5c842"}}>{p.contractYearsLeft}年</td>
                <td><button className="bsm bgr" onClick={()=>onRelease(p.id)}>放出</button></td>
              </tr>
            ))}</tbody>
          </table>
        )}</div>
      </div>
      {sel&&(
        <div className="card">
          <div className="card-h">{sel.name} — 契約交渉</div>
          <div className="g2">
            <div><div style={{fontSize:11,color:"#374151",marginBottom:6}}>選手の価値観</div><PersonalityView p={sel}/></div>
            <div>
              <div style={{marginBottom:10}}>
                <label style={{fontSize:11,color:"#4b5563",display:"block",marginBottom:4}}>年俸（万円）</label>
                <input type="number" value={offerSal} onChange={e=>setOfferSal(Number(e.target.value))} style={{background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.1)",borderRadius:6,padding:"6px 10px",color:"#e0d4bf",fontFamily:"'Share Tech Mono',monospace",width:"100%"}}/>
                <div style={{fontSize:10,color:"#374151",marginTop:2}}>現在値: {fmtSal(sel.salary)}</div>
              </div>
              <div style={{marginBottom:12}}>
                <label style={{fontSize:11,color:"#4b5563",display:"block",marginBottom:4}}>契約年数</label>
                <div style={{display:"flex",gap:6}}>{[1,2,3,4,5].map(y=><button key={y} className={`bsm ${offerYrs===y?"bgy":"bgb"}`} onClick={()=>setOfferYrs(y)}>{y}年</button>)}</div>
              </div>
              {preview&&(
                <div style={{background:"rgba(0,0,0,.3)",borderRadius:8,padding:10,marginBottom:10}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                    <div className="score-ring" style={{borderColor:ac,color:ac,width:46,height:46,fontSize:16}}>{preview.total}</div>
                    <div style={{fontSize:12,fontWeight:700,color:ac}}>{preview.total>=ACCEPT_THRESHOLD?"✅ 受諾見込み":preview.total>=40?"⚠️ 微妙":"❌ 拒否の可能性大"}</div>
                  </div>
                  {Object.entries(preview.breakdown).map(([k,v])=>{const def=PVAL_DEFS.find(d=>d.k===k);return(<div key={k} style={{display:"flex",alignItems:"center",gap:5,marginBottom:2}}><span style={{fontSize:9,color:"#374151",width:80}}>{def?.lbl}</span><div style={{flex:1,height:4,background:"rgba(255,255,255,.06)",borderRadius:2,overflow:"hidden"}}><div style={{height:"100%",width:`${v.score}%`,background:def?.color||"#60a5fa"}}/></div><span style={{fontFamily:"monospace",fontSize:10,color:"#374151",width:22}}>{v.score}</span><span style={{fontSize:9,color:"#1e2d3d",width:28}}>×{v.weight}</span></div>);})}
                </div>
              )}
              <button className="btn btn-gold" style={{width:"100%"}} onClick={()=>onOffer(sel.id,offerSal*10000,offerYrs)}>オファーを送る</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
/* ═══════════════════════════════════════════════
   FINANCE TAB
═══════════════════════════════════════════════ */

export function NewsTab({news,onInterview}){
  const [sel,setSel]=useState(null);
  const [answered,setAnswered]=useState({});
  const icon=t=>t==="game"?"⚾":t==="trade"?"🔄":t==="draft"?"📋":t==="interview"?"🎤":t==="season"?"🏆":"📰";
  const col=t=>t==="game"?"#60a5fa":t==="trade"?"#f97316":t==="draft"?"#a78bfa":t==="interview"?"#f5c842":t==="season"?"#34d399":"#94a3b8";
  const handleAnswer=(newsId,opt)=>{
    onInterview(newsId,opt);
    setAnswered(prev=>({...prev,[newsId]:opt}));
    setSel(prev=>prev?{...prev,_answered:opt}:null);
  };
  return(
    <div style={{display:"grid",gridTemplateColumns:sel?"1fr 1fr":"1fr",gap:8}}>
      <div className="card" style={{padding:"10px"}}>
        <div className="card-h">📰 スポーツニュース</div>
        {news.length===0&&<p style={{fontSize:11,color:"#374151",padding:"12px 0"}}>試合を進めるとニュースが届きます</p>}
        {[...news].sort((a,b)=>b.timestamp-a.timestamp).map(n=>{
          const needsAnswer=n.type==="interview"&&!answered[n.id];
          return(<div key={n.id} onClick={()=>setSel(n)} style={{padding:"8px 10px",marginBottom:4,borderRadius:6,cursor:"pointer",background:sel?.id===n.id?"rgba(245,200,66,.08)":needsAnswer?"rgba(245,200,66,.03)":"rgba(255,255,255,.02)",border:sel?.id===n.id?"1px solid rgba(245,200,66,.3)":needsAnswer?"1px solid rgba(245,200,66,.15)":"1px solid rgba(255,255,255,.04)"}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
              <span style={{fontSize:11,color:col(n.type)}}>{icon(n.type)}</span>
              {needsAnswer&&<span style={{fontSize:8,background:"#f5c842",color:"#000",borderRadius:4,padding:"1px 5px",fontWeight:700}}>回答待ち</span>}
              <span style={{fontSize:11,fontWeight:needsAnswer?700:400,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{n.headline}</span>
            </div>
            <div style={{fontSize:9,color:"#374151",paddingLeft:18}}>{n.source} · {n.dateLabel}</div>
          </div>);
        })}
      </div>
      {sel&&(
        <div className="card" style={{padding:"12px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <span style={{fontSize:10,color:col(sel.type),fontWeight:700}}>{icon(sel.type)} {sel.source}</span>
            <button className="bsm bga" onClick={()=>setSel(null)}>✕</button>
          </div>
          <div style={{fontWeight:700,fontSize:13,lineHeight:1.5,marginBottom:4}}>{sel.headline}</div>
          <div style={{fontSize:9,color:"#374151",marginBottom:10}}>{sel.dateLabel}</div>
          <div style={{fontSize:12,color:"#e0d4bf",lineHeight:1.8,marginBottom:12,whiteSpace:"pre-wrap"}}>{sel.body}</div>
          {sel.type==="interview"&&!answered[sel.id]&&!sel._answered&&(
            <div style={{borderTop:"1px solid rgba(255,255,255,.08)",paddingTop:10}}>
              <div style={{fontSize:11,color:"#f5c842",fontWeight:700,marginBottom:8}}>🎤 記者: 「{sel.question}」</div>
              <div style={{fontSize:10,color:"#374151",marginBottom:8}}>あなたの回答を選んでください（球団人気・選手モラルに影響）</div>
              {sel.options.map((opt,i)=>(
                <div key={i} onClick={()=>handleAnswer(sel.id,opt)} style={{padding:"10px",marginBottom:6,borderRadius:6,cursor:"pointer",background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.08)"}}>
                  <div style={{fontSize:11,color:"#e0d4bf",marginBottom:3}}>{opt.text}</div>
                  <div style={{fontSize:9,color:"#374151"}}>人気 {opt.popMod>=0?"+":""}{opt.popMod} ／ モラル {opt.moraleMod>=0?"+":""}{opt.moraleMod}</div>
                </div>
              ))}
            </div>
          )}
          {(answered[sel.id]||sel._answered)&&sel.type==="interview"&&(
            <div style={{borderTop:"1px solid rgba(255,255,255,.08)",paddingTop:10}}>
              <div style={{fontSize:10,color:"#374151",marginBottom:4}}>あなたの回答：</div>
              <div style={{fontSize:11,color:"#f5c842",fontStyle:"italic",lineHeight:1.6}}>{(answered[sel.id]||sel._answered)?.text}</div>
              <div style={{fontSize:9,color:"#34d399",marginTop:6}}>人気 {(answered[sel.id]||sel._answered)?.popMod>=0?"+":""}{(answered[sel.id]||sel._answered)?.popMod} ／ モラル {(answered[sel.id]||sel._answered)?.moraleMod>=0?"+":""}{(answered[sel.id]||sel._answered)?.moraleMod}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
/* ═══════════════════════════════════════════════
   MAILBOX SYSTEM
═══════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════
   RETIRE MODAL
═══════════════════════════════════════════════ */

export function MailboxTab({mailbox, onRead, onAction, teams, myTeam, onTrade}){
  const [selected, setSelected] = useState(null);
  const unread = mailbox.filter(m=>!m.read).length;

  const handleSelect = (m) => {
    setSelected(m);
    if(!m.read) onRead(m.id);
  };

  const typeIcon = t => t==="trade"?"🔄":t==="info"?"📋":t==="scout"?"🔍":"📨";
  const typeColor = t => t==="trade"?"#f97316":t==="info"?"#60a5fa":t==="scout"?"#a78bfa":"#94a3b8";

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
          {selected.resolved&&<div style={{textAlign:"center",fontSize:11,color:"#374151",padding:"8px"}}>対応済み</div>}
        </div>
      )}
    </div>
  );
}


export function TradeTab({myTeam,teams,onTrade,cpuOffers,onAcceptOffer,onDeclineOffer,deadlinePassed=false}){
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
                    <div className="fsb"><span style={{fontSize:11,fontWeight:sel?700:400}}>{p.name}</span>{fmtV(tradeValue(p))}</div>
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
                    <div className="fsb"><span style={{fontSize:11,fontWeight:sel?700:400}}>{p.name}</span>{fmtV(tradeValue(p))}</div>
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


export function AlumniTab({myTeam}){
  const [selId,setSelId]=React.useState(null);
  const history=(myTeam&&myTeam.history)||[];
  const current=(myTeam&&myTeam.players)||[];
  // 在籍中 + 退団者を在籍年数順（功労者順）でソート
  const exitBadgeColor=(r)=>r==="引退"?"#94a3b8":r==="トレード"?"#f97316":r==="戦力外"?"#f87171":r==="FA移籍"?"#a78bfa":"#374151";
  const allHistory=[...history].sort(function(a,b){return(b.tenure||0)-(a.tenure||0);});
  const sel=allHistory.find(function(p){return p.id===selId;})||current.find(function(p){return p.id===selId;});
  return(
    <div>
      <div className="card">
        <div className="card-h">📖 歴代選手 ({allHistory.length}人 退団)</div>
        {allHistory.length===0&&<div style={{fontSize:11,color:"#374151",padding:"8px 0"}}>まだ退団・引退選手はいません</div>}
        <div style={{maxHeight:340,overflowY:"auto"}}>
          {allHistory.map(function(p){return(
            <div key={p.id+"-"+p.exitYear} onClick={()=>setSelId(selId===p.id?null:p.id)} style={{padding:"7px 4px",borderBottom:"1px solid rgba(255,255,255,.04)",cursor:"pointer",background:selId===p.id?"rgba(245,200,66,.06)":undefined}}>
              <div className="fsb">
                <div>
                  <span style={{fontSize:12,fontWeight:700,color:"#e0d4bf"}}>{p.name}</span>
                  <span style={{fontSize:10,color:"#374151",marginLeft:6}}>{p.pos}</span>
                  <span style={{fontSize:9,color:exitBadgeColor(p.exitReason),marginLeft:6,padding:"1px 5px",border:"1px solid",borderColor:exitBadgeColor(p.exitReason),borderRadius:3}}>{p.exitReason}</span>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:9,color:"#374151"}}>{p.exitYear}年退団</div>
                  <div style={{fontSize:9,color:"#94a3b8"}}>{p.tenure||0}年在籍</div>
                </div>
              </div>
            </div>
          );})}
        </div>
      </div>
      {sel&&(
        <div className="card">
          <div className="fsb" style={{marginBottom:8}}>
            <div>
              <span style={{fontWeight:700,fontSize:15}}>{sel.name}</span>
              <span style={{fontSize:11,color:"#94a3b8",marginLeft:6}}>{sel.pos} / {sel.age}歳</span>
              {sel.exitReason&&<span style={{fontSize:10,color:exitBadgeColor(sel.exitReason),marginLeft:6}}>{sel.exitReason}</span>}
            </div>
            <button className="bsm bga" onClick={()=>setSelId(null)}>✕</button>
          </div>
          <CareerTable player={sel}/>
        </div>
      )}
    </div>
  );
}


export function CareerTable({player}){
  const [mode,setMode]=useState("regular");
  const [metricKey,setMetricKey]=useState(player.isPitcher?"ERA":"HR");

  const log=player.careerLog||[];
  if(log.length===0) return null;
  const hasPlayoff=log.some(r=>{const ps=r.playoffStats||emptyStats();return ps.PA>0||ps.BF>0;});
  const ip=player.isPitcher;

  // 各年のデータ取得
  const getS=(row)=>mode==="playoff"?(row.playoffStats||emptyStats()):(row.stats||emptyStats());

  // ⑥ キャリア推移グラフ用指標定義
  const BATTER_METRICS=[
    {key:"HR",  label:"本塁打", get:s=>s.HR,    isCount:true},
    {key:"RBI", label:"打点",   get:s=>s.RBI,   isCount:true},
    {key:"AVG", label:"打率",   get:s=>saberBatter(s).AVG},
    {key:"OPS", label:"OPS",   get:s=>saberBatter(s).OPS},
    {key:"wOBA",label:"wOBA",  get:s=>saberBatter(s).wOBA},
    {key:"WAR", label:"WAR",   get:s=>saberBatter(s).WAR},
  ];
  const PITCHER_METRICS=[
    {key:"ERA", label:"防御率", get:s=>saberPitcher(s).ERA},
    {key:"W",   label:"勝利",   get:s=>s.W,     isCount:true},
    {key:"WHIP",label:"WHIP",  get:s=>saberPitcher(s).WHIP},
    {key:"K",   label:"奪三振", get:s=>s.Kp,   isCount:true},
    {key:"FIP", label:"FIP",   get:s=>saberPitcher(s).FIP},
    {key:"WAR", label:"WAR",   get:s=>saberPitcher(s).WAR},
  ];
  const metrics=ip?PITCHER_METRICS:BATTER_METRICS;
  const activeMet=metrics.find(m=>m.key===metricKey)||metrics[0];
  const chartData=[...log].map(row=>{const s=getS(row);return{year:row.year,value:activeMet.get(s)};});

  // 通算計算
  const sumK=(k)=>log.reduce((a,r)=>a+(getS(r)[k]||0),0);
  const totals={PA:sumK("PA"),AB:sumK("AB"),H:sumK("H"),HR:sumK("HR"),RBI:sumK("RBI"),SB:sumK("SB"),BF:sumK("BF"),W:sumK("W"),L:sumK("L"),SV:sumK("SV"),IP:sumK("IP"),Kp:sumK("Kp"),ER:sumK("ER"),BB:sumK("BB"),HRA:sumK("HRA")};
  const hasTotals=ip?(totals.BF>0):(totals.PA>0);

  return(
    <div style={{marginTop:8,background:"rgba(0,0,0,.2)",borderRadius:6,padding:"8px 10px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
        <div style={{fontSize:10,color:"#f5c842",fontWeight:700}}>📅 年度別成績</div>
        {hasPlayoff&&(
          <div style={{display:"flex",gap:4}}>
            <button onClick={()=>setMode("regular")} style={{padding:"2px 8px",fontSize:9,borderRadius:3,border:"none",cursor:"pointer",background:mode==="regular"?"#f5c842":"rgba(255,255,255,.08)",color:mode==="regular"?"#0f1923":"#94a3b8"}}>レギュラー</button>
            <button onClick={()=>setMode("playoff")} style={{padding:"2px 8px",fontSize:9,borderRadius:3,border:"none",cursor:"pointer",background:mode==="playoff"?"#a78bfa":"rgba(255,255,255,.08)",color:mode==="playoff"?"#fff":"#94a3b8"}}>ポスト</button>
          </div>
        )}
      </div>
      {log.length>=2&&(
        <div style={{marginBottom:10}}>
          <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:6}}>
            {metrics.map(m=>(
              <button key={m.key} onClick={()=>setMetricKey(m.key)} style={{fontSize:9,padding:"2px 7px",borderRadius:10,cursor:"pointer",background:metricKey===m.key?"rgba(245,200,66,.15)":"transparent",color:metricKey===m.key?"#f5c842":"#6b7280",border:metricKey===m.key?"1px solid rgba(245,200,66,.5)":"1px solid rgba(255,255,255,.08)"}}>
                {m.label}
              </button>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={120}>
            <LineChart data={chartData} margin={{top:4,right:8,bottom:0,left:-20}}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.05)"/>
              <XAxis dataKey="year" tick={{fill:"#6b7280",fontSize:9}}/>
              <YAxis tick={{fill:"#6b7280",fontSize:9}} width={36}/>
              <Tooltip contentStyle={{background:"#0b1c30",border:"1px solid rgba(245,200,66,.3)",borderRadius:6,fontSize:10}} labelStyle={{color:"#f5c842"}} itemStyle={{color:"#c0cfe0"}} formatter={v=>[typeof v==="number"?(activeMet.isCount?String(v):v.toFixed(3)):v,activeMet.label]}/>
              <Line type="monotone" dataKey="value" stroke="#f5c842" strokeWidth={2} dot={{r:3,fill:"#f5c842"}} activeDot={{r:5}}/>
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <div style={{overflowX:"auto"}}>
        {ip&&(
          <table className="tbl" style={{fontSize:9,width:"100%"}}>
            <thead>
              <tr><th>年度</th><th>防御率</th><th>勝</th><th>負</th><th>S</th><th>回</th><th>K</th><th>WHIP</th></tr>
            </thead>
            <tbody>
              {[...log].reverse().map((row,ri)=>{
                const s=getS(row);
                if(mode==="playoff"&&s.BF===0) return null;
                const sp=saberPitcher(s);
                return(
                  <tr key={row.year+"-p-"+ri}>
                    <td className="mono" style={{color:"#f5c842"}}>{row.year}</td>
                    <td className="mono">{sp.ERA}</td>
                    <td className="mono" style={{color:"#34d399"}}>{s.W}</td>
                    <td className="mono" style={{color:"#f87171"}}>{s.L}</td>
                    <td className="mono">{s.SV}</td>
                    <td className="mono">{fmtIP(s.IP)}</td>
                    <td className="mono">{s.Kp}</td>
                    <td className="mono">{sp.WHIP}</td>
                  </tr>
                );
              })}
              {hasTotals&&(
                <tr style={{background:"rgba(245,200,66,.06)",fontWeight:700}}>
                  <td style={{color:"#f5c842",fontSize:9}}>通算</td>
                  <td className="mono">{saberPitcher(totals).ERA}</td>
                  <td className="mono" style={{color:"#34d399"}}>{totals.W}</td>
                  <td className="mono" style={{color:"#f87171"}}>{totals.L}</td>
                  <td className="mono">{totals.SV}</td>
                  <td className="mono">{fmtIP(totals.IP)}</td>
                  <td className="mono">{totals.Kp}</td>
                  <td className="mono">{saberPitcher(totals).WHIP}</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
        {!ip&&(
          <table className="tbl" style={{fontSize:9,width:"100%"}}>
            <thead>
              <tr><th>年度</th><th>打席</th><th>打率</th><th>HR</th><th>打点</th><th>盗塁</th><th>OPS</th></tr>
            </thead>
            <tbody>
              {[...log].reverse().map((row,ri)=>{
                const s=getS(row);
                if(mode==="playoff"&&s.PA===0) return null;
                const sb=saberBatter(s);
                return(
                  <tr key={row.year+"-b-"+ri}>
                    <td className="mono" style={{color:"#f5c842"}}>{row.year}</td>
                    <td className="mono">{s.PA}</td>
                    <td className="mono">{fmtAvg(s.H,s.AB)}</td>
                    <td className="mono" style={{color:s.HR>=20?"#f5c842":undefined}}>{s.HR}</td>
                    <td className="mono">{s.RBI}</td>
                    <td className="mono">{s.SB}</td>
                    <td className="mono">{sb.OPS.toFixed(3)}</td>
                  </tr>
                );
              })}
              {hasTotals&&(
                <tr style={{background:"rgba(245,200,66,.06)",fontWeight:700}}>
                  <td style={{color:"#f5c842",fontSize:9}}>通算</td>
                  <td className="mono">{totals.PA}</td>
                  <td className="mono">{fmtAvg(totals.H,totals.AB)}</td>
                  <td className="mono" style={{color:totals.HR>=200?"#f5c842":undefined}}>{totals.HR}</td>
                  <td className="mono">{totals.RBI}</td>
                  <td className="mono">{totals.SB}</td>
                  <td className="mono">{saberBatter(totals).OPS.toFixed(3)}</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
/* ═══════════════════════════════════════════════
   ALUMNI TAB
═══════════════════════════════════════════════ */




const TRAINING_OPTIONS=[["","バランス"],["contact","ミート"],["power","長打"],["eye","選球"],["speed","走力"],["arm","肩"],["defense","守備"],["velocity","球速"],["control","制球"],["breaking","変化球"],["stamina","スタミナ"]];

const MoralBadge=({v})=>{const m=v||70;const icon=m>=75?"😊":m>=50?"😐":"😟";const col=m>=75?"#34d399":m>=50?"#f5c842":"#f87171";return <span style={{fontSize:10,color:col}}>{icon}{m}</span>;};

export function RosterTab({team,onToggle,onSetStarter,onPromo,onDemo,onSetTrainingFocus,onConvertIkusei,onMoveRotation,onRemoveFromRotation,onSetPitchingPattern}){
  const [view,setView]=useState("batters");
  const batters=team.players.filter(p=>!p.isPitcher);
  const pitchers=team.players.filter(p=>p.isPitcher);
  const liMap={};team.lineup.forEach((id,i)=>liMap[id]=i+1);
  const injured=team.players.filter(p=>(p.injuryDaysLeft??0)>0);
  return(
    <div>
      {injured.length>0&&(
        <div className="card" style={{marginBottom:8,background:"rgba(248,113,113,.06)",border:"1px solid rgba(248,113,113,.2)"}}>
          <div className="card-h" style={{color:"#f87171"}}>🤕 負傷者リスト ({injured.length}人)</div>
          {injured.map(p=>(
            <div key={p.id} style={{fontSize:11,padding:"3px 0",color:"#94a3b8",display:"flex",justifyContent:"space-between"}}>
              <span>{p.name} <span style={{color:"#f87171"}}>[{p.injury}]</span></span>
              <span>残{p.injuryDaysLeft}試合</span>
            </div>
          ))}
        </div>
      )}
      <div style={{display:"flex",gap:6,marginBottom:10}}>
        {[["batters","🏏 野手"],["pitchers","⚾ 投手"],["farm","🌿 二軍"],["pattern","📋 継投"]].map(([k,l])=>(
          <button key={k} onClick={()=>setView(k)} className={`tab ${view===k?"on":""}`} style={{flex:0,padding:"6px 14px"}}>{l}</button>
        ))}
        <span className="chip cy" style={{marginLeft:"auto",alignSelf:"center"}}>一軍 {team.players.length}/{MAX_ROSTER}</span>
        <span className="chip cb" style={{alignSelf:"center"}}>外国人 {team.players.filter(p=>p.isForeign).length}/{MAX_外国人_一軍}</span>
      </div>
      {view==="batters"&&(
        <div className="card">
          <div className="card-h">打線設定 ({team.lineup.length}/9)</div>
          <div style={{overflowX:"auto"}}>
            <table className="tbl">
              <thead><tr><th>#</th><th>選手名</th><th>守備</th><th>年齢</th><th>ミート</th><th>長打</th><th>走力</th><th>選球</th><th>クラッチ</th><th>変化球</th><th>状態</th><th>モラル</th><th>打率</th><th>HR</th><th>OPS</th><th>強化</th><th></th></tr></thead>
              <tbody>
                {batters.map(p=>{const inL=team.lineup.includes(p.id);const sb=saberBatter(p.stats);const isInj=(p.injuryDaysLeft??0)>0;return(
                  <tr key={p.id} style={isInj?{opacity:.55}:undefined}>
                    <td>{inL?<span className="lnb">{liMap[p.id]}</span>:<span style={{color:"#1e2d3d"}}>—</span>}</td>
                    <td style={{fontWeight:inL?700:400,color:inL?"#e0d4bf":"#374151"}}>{p.name}{p.isForeign&&<span className="chip cb" style={{marginLeft:4,fontSize:8}}>外</span>}{isInj&&<span style={{marginLeft:4,fontSize:9,color:"#f87171"}}>🤕{p.injuryDaysLeft}</span>}</td>
                    <td style={{fontSize:10,color:"#374151"}}>{p.pos}</td><td className="mono" style={{color:"#374151"}}>{p.age}</td>
                    <td><OV v={p.batting.contact}/></td><td><OV v={p.batting.power}/></td><td><OV v={p.batting.speed}/></td><td><OV v={p.batting.eye}/></td>
                    <td><OV v={p.batting.clutch}/></td><td><OV v={p.batting.breakingBall}/></td>
                    <td><CondBadge p={p}/></td>
                    <td><MoralBadge v={p.morale}/></td>
                    <td className="mono">{fmtAvg(p.stats.H,p.stats.AB)}</td>
                    <td className="mono" style={{color:p.stats.HR>=20?"#f5c842":undefined}}>{p.stats.HR}</td>
                    <td className="mono" style={{color:sb.OPS>=.850?"#34d399":sb.OPS>=.700?"#f5c842":undefined}}>{sb.OPS>0?sb.OPS.toFixed(3):"---"}</td>
                    <td><select style={{fontSize:9,background:"#0d1b2a",color:"#94a3b8",border:"1px solid #1e3a5f",borderRadius:3,padding:"1px 2px"}} value={p.trainingFocus||""} onChange={e=>onSetTrainingFocus&&onSetTrainingFocus(p.id,e.target.value||null)}>{TRAINING_OPTIONS.filter(([k])=>!["velocity","control","breaking","stamina"].includes(k)).map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></td>
                    <td><button className={`bsm ${inL?"bgr":"bga"}`} onClick={()=>!isInj&&onToggle(p.id)} disabled={isInj}>{inL?"外す":"入れる"}</button> <button className="bsm bgr" onClick={()=>onDemo(p.id)}>↓</button></td>
                  </tr>
                );})}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {view==="pitchers"&&(
        <div className="card">
          <div className="card-h">投手陣</div>
          <div style={{overflowX:"auto"}}>
            <table className="tbl">
              <thead><tr><th></th><th>選手名</th><th>役割</th><th>年齢</th><th>球速</th><th>制球</th><th>スタミナ</th><th>変化球</th><th>球種</th><th>ピンチ</th><th>状態</th><th>モラル</th><th>防御率</th><th>WHIP</th><th>勝</th><th>敗</th><th></th></tr></thead>
              <tbody>
                {pitchers.map(p=>{const inR=team.rotation.includes(p.id);const sp=saberPitcher(p.stats);return(
                  <tr key={p.id}>
                    <td>{inR&&<span style={{fontSize:9,color:"#f5c842",background:"rgba(245,200,66,.1)",padding:"1px 5px",borderRadius:3}}>先発</span>}</td>
                    <td style={{fontWeight:700,fontSize:12}}>{p.name}<HandBadge p={p}/>{(p.injuryDaysLeft??0)>0&&<span style={{marginLeft:4,fontSize:9,color:"#f87171"}}>🤕{p.injuryDaysLeft}</span>}</td>
                    <td style={{fontSize:10,color:"#374151"}}>{p.subtype}</td><td className="mono" style={{color:"#374151"}}>{p.age}</td>
                    <td><OV v={p.pitching.velocity}/></td><td><OV v={p.pitching.control}/></td><td><OV v={p.pitching.stamina}/></td><td><OV v={p.pitching.breaking}/></td>
                    <td><OV v={p.pitching.variety}/></td><td><OV v={p.pitching.clutchP}/></td>
                    <td><CondBadge p={p}/></td>
                    <td><MoralBadge v={p.morale}/></td>
                    <td className="mono" style={{color:sp.ERA>0&&sp.ERA<3?"#34d399":sp.ERA<4?"#f5c842":sp.ERA>0?"#f87171":undefined}}>{sp.ERA>0?sp.ERA:"---"}</td>
                    <td className="mono" style={{color:sp.WHIP>0&&sp.WHIP<1.0?"#34d399":sp.WHIP<1.3?"#f5c842":sp.WHIP<1.5?"#94a3b8":"#f87171"}}>{sp.WHIP>0?sp.WHIP:"---"}</td>
                    <td className="mono" style={{color:"#34d399"}}>{p.stats.W}</td><td className="mono" style={{color:"#f87171"}}>{p.stats.L}</td>
                    <td><select style={{fontSize:9,background:"#0d1b2a",color:"#94a3b8",border:"1px solid #1e3a5f",borderRadius:3,padding:"1px 2px"}} value={p.trainingFocus||""} onChange={e=>onSetTrainingFocus&&onSetTrainingFocus(p.id,e.target.value||null)}>{TRAINING_OPTIONS.filter(([k])=>!["contact","power","eye","speed","arm","defense"].includes(k)).map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></td>
                    <td><button className="bsm bgb" onClick={()=>onSetStarter(p.id)}>先発へ</button> <button className="bsm bgr" onClick={()=>onDemo(p.id)}>↓</button></td>
                  </tr>
                );})}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {view==="farm"&&(
        <div className="card">
          <div className="card-h">二軍 ({team.farm.length}/{MAX_FARM})</div>
          <div style={{overflowX:"auto"}}>
            <table className="tbl">
              <thead><tr><th>選手名</th><th>守備</th><th>年齢</th><th>育成年</th><th>潜在</th><th>主要能力</th><th>状態</th><th></th></tr></thead>
              <tbody>
                {team.farm.map(p=>(
                  <tr key={p.id}>
                    <td style={{fontWeight:600,fontSize:12}}>{p.name}{p.育成&&<span style={{fontSize:9,color:"#a78bfa",marginLeft:4}}>[育{p.ikuseiYears||0}年]</span>}</td>
                    <td style={{fontSize:10,color:"#374151"}}>{p.pos}</td><td className="mono" style={{color:"#374151"}}>{p.age}</td>
                    <td className="mono" style={{color:p.育成?"#a78bfa":"#1e2d3d",fontSize:10}}>{p.育成?(p.ikuseiYears||0)+"年":"—"}</td>
                    <td><OV v={p.potential}/></td>
                    <td><OV v={p.isPitcher?p.pitching.velocity:p.batting.contact}/></td>
                    <td><CondBadge p={p}/></td>
                    <td style={{display:"flex",gap:4}}>
                      {p.育成
                        ?<button className="bsm" style={{background:"rgba(167,139,250,.15)",border:"1px solid rgba(167,139,250,.4)",color:"#a78bfa",fontSize:9,padding:"2px 6px",borderRadius:4,cursor:"pointer",whiteSpace:"nowrap"}} onClick={()=>onConvertIkusei&&onConvertIkusei(p.id)}>支配下登録</button>
                        :<button className="bsm bga" onClick={()=>onPromo(p.id)}>↑一軍</button>
                      }
                    </td>
                  </tr>
                ))}
                {team.farm.length===0&&<tr><td colSpan={8} style={{color:"#1e2d3d",padding:"16px",textAlign:"center"}}>二軍選手なし</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {view==="pattern"&&(()=>{
        const pattern=team.pitchingPattern??{closerId:null,setupId:null,middleOrder:[]};
        const rotPitchers=team.rotation.map(id=>team.players.find(p=>p.id===id)).filter(Boolean);
        const nonRotPitchers=pitchers.filter(p=>!team.rotation.includes(p.id));
        const closerP=pitchers.find(p=>p.id===pattern.closerId);
        const setupP=pitchers.find(p=>p.id===pattern.setupId);
        const middleOrder=pattern.middleOrder??[];
        const orderedBullpen=[
          ...middleOrder.map(id=>pitchers.find(p=>p.id===id)).filter(Boolean),
          ...nonRotPitchers.filter(p=>!middleOrder.includes(p.id)),
        ];
        const moveMiddle=(pid,dir)=>{
          const arr=[...middleOrder];
          const i=arr.indexOf(pid);
          if(i<0){onSetPitchingPattern&&onSetPitchingPattern({middleOrder:[...arr,pid]});return;}
          const j=i+dir;if(j<0||j>=arr.length)return;
          [arr[i],arr[j]]=[arr[j],arr[i]];
          onSetPitchingPattern&&onSetPitchingPattern({middleOrder:arr});
        };
        const addToMiddle=pid=>{if(!middleOrder.includes(pid))onSetPitchingPattern&&onSetPitchingPattern({middleOrder:[...middleOrder,pid]});};
        const removeFromMiddle=pid=>onSetPitchingPattern&&onSetPitchingPattern({middleOrder:middleOrder.filter(id=>id!==pid)});
        const cardStyle={background:"rgba(14,27,46,.6)",border:"1px solid #1e3a5f",borderRadius:6,padding:"10px 12px",flex:1,minWidth:140};
        const rowStyle={display:"flex",alignItems:"center",gap:6,padding:"5px 0",borderBottom:"1px solid rgba(30,58,95,.4)"};
        const btnSm={fontSize:10,padding:"1px 6px",borderRadius:3,cursor:"pointer",background:"rgba(30,58,95,.6)",border:"1px solid #1e3a5f",color:"#94a3b8"};
        return(
          <div>
            <div className="card" style={{marginBottom:8}}>
              <div className="card-h">先発ローテーション ({rotPitchers.length}/6)</div>
              {rotPitchers.map((p,i)=>(
                <div key={p.id} style={rowStyle}>
                  <span style={{fontSize:10,color:"#374151",width:16,textAlign:"right"}}>{i+1}</span>
                  <span style={{flex:1,fontWeight:600,fontSize:12}}>{p.name}</span>
                  <span style={{fontSize:9,color:"#94a3b8"}}>スタミナ</span><span style={{fontSize:11,color:"#f5c842",fontFamily:"monospace"}}>{p.pitching?.stamina??50}</span>
                  <span style={{fontSize:9,color:"#94a3b8",marginLeft:4}}>Cond</span><span style={{fontSize:11,color:(p.condition??70)>=80?"#34d399":(p.condition??70)>=60?"#f5c842":"#f87171",fontFamily:"monospace"}}>{p.condition??70}</span>
                  <button style={btnSm} onClick={()=>onMoveRotation&&onMoveRotation(p.id,-1)} disabled={i===0}>↑</button>
                  <button style={btnSm} onClick={()=>onMoveRotation&&onMoveRotation(p.id,1)} disabled={i===rotPitchers.length-1}>↓</button>
                  <button style={{...btnSm,color:"#f87171"}} onClick={()=>onRemoveFromRotation&&onRemoveFromRotation(p.id)}>✕</button>
                </div>
              ))}
              {rotPitchers.length<6&&nonRotPitchers.length>0&&(
                <div style={{marginTop:6}}>
                  <select style={{fontSize:10,background:"#0d1b2a",color:"#94a3b8",border:"1px solid #1e3a5f",borderRadius:3,padding:"3px 6px"}}
                    value="" onChange={e=>{if(e.target.value)onSetStarter&&onSetStarter(e.target.value);}}>
                    <option value="">＋ 先発追加...</option>
                    {nonRotPitchers.map(p=><option key={p.id} value={p.id}>{p.name}（{p.subtype}）</option>)}
                  </select>
                </div>
              )}
              {rotPitchers.length===0&&<div style={{color:"#374151",fontSize:11,padding:"8px 0"}}>先発投手が未設定です</div>}
            </div>
            <div className="card" style={{marginBottom:8}}>
              <div className="card-h">指名投手</div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {[
                  {key:"closerId",label:"🔒 抑え（9回）",current:closerP,otherId:pattern.setupId},
                  {key:"setupId",label:"⚙️ セットアッパー（8回）",current:setupP,otherId:pattern.closerId},
                ].map(({key,label,current,otherId})=>(
                  <div key={key} style={cardStyle}>
                    <div style={{fontSize:9,color:"#374151",marginBottom:4,letterSpacing:".1em"}}>{label}</div>
                    <select style={{fontSize:11,background:"#0d1b2a",color:"#e0d4bf",border:"1px solid #1e3a5f",borderRadius:3,padding:"3px 6px",width:"100%"}}
                      value={pattern[key]??""} onChange={e=>onSetPitchingPattern&&onSetPitchingPattern({[key]:e.target.value||null})}>
                      <option value="">指名なし（自動）</option>
                      {pitchers.map(p=><option key={p.id} value={p.id} disabled={p.id===otherId}>{p.name}（{p.subtype}）</option>)}
                    </select>
                    {current&&(
                      <div style={{marginTop:6,display:"flex",gap:8,fontSize:10}}>
                        <span style={{color:"#94a3b8"}}>球速</span><span style={{color:"#e0d4bf",fontFamily:"monospace"}}>{current.pitching?.velocity??50}</span>
                        <span style={{color:"#94a3b8"}}>制球</span><span style={{color:"#e0d4bf",fontFamily:"monospace"}}>{current.pitching?.control??50}</span>
                        <span style={{color:"#94a3b8"}}>Cond</span><span style={{color:(current.condition??70)>=80?"#34d399":(current.condition??70)>=60?"#f5c842":"#f87171",fontFamily:"monospace"}}>{current.condition??70}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className="card">
              <div className="card-h">中継ぎ優先順 <span style={{fontSize:9,color:"#374151",fontWeight:400}}>（上から順に登板 / リスト外はスコア自動選択）</span></div>
              {orderedBullpen.map((p,i)=>{
                const inOrder=middleOrder.includes(p.id);
                const isCloser=p.id===pattern.closerId;
                const isSetup=p.id===pattern.setupId;
                const orderIdx=middleOrder.indexOf(p.id);
                return(
                  <div key={p.id} style={{...rowStyle,opacity:isCloser||isSetup?0.5:1}}>
                    <span style={{fontSize:10,color:inOrder?"#f5c842":"#374151",width:16,textAlign:"right",fontFamily:"monospace"}}>{inOrder?orderIdx+1:"—"}</span>
                    <span style={{flex:1,fontWeight:600,fontSize:12}}>{p.name}</span>
                    <span style={{fontSize:9,color:"#374151"}}>{p.subtype}</span>
                    <span style={{fontSize:9,color:"#94a3b8",marginLeft:4}}>St</span><span style={{fontSize:10,color:"#e0d4bf",fontFamily:"monospace"}}>{p.pitching?.stamina??50}</span>
                    {isCloser&&<span style={{fontSize:9,color:"#f5c842",background:"rgba(245,200,66,.1)",padding:"1px 5px",borderRadius:3}}>抑え指名</span>}
                    {isSetup&&<span style={{fontSize:9,color:"#60a5fa",background:"rgba(96,165,250,.1)",padding:"1px 5px",borderRadius:3}}>セットアッパー指名</span>}
                    {!isCloser&&!isSetup&&(<>
                      {inOrder?(
                        <>
                          <button style={btnSm} onClick={()=>moveMiddle(p.id,-1)} disabled={orderIdx===0}>↑</button>
                          <button style={btnSm} onClick={()=>moveMiddle(p.id,1)} disabled={orderIdx===middleOrder.length-1}>↓</button>
                          <button style={{...btnSm,color:"#f87171"}} onClick={()=>removeFromMiddle(p.id)}>✕</button>
                        </>
                      ):(
                        <button style={{...btnSm,color:"#34d399"}} onClick={()=>addToMiddle(p.id)}>＋優先</button>
                      )}
                    </>)}
                  </div>
                );
              })}
              {orderedBullpen.length===0&&<div style={{color:"#374151",fontSize:11,padding:"8px 0"}}>ブルペン投手なし</div>}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
/* ═══════════════════════════════════════════════
   TOOLTIP COMPONENT
═══════════════════════════════════════════════ */


export function StandingsTab({teams,myId}){
  const myLeague=teams.find(t=>t.id===myId)?.league;
  const [lg,setLg]=useState(myLeague||"セ");
  const sorted=[...teams.filter(t=>t.league===lg)].sort((a,b)=>{const pa=a.wins/Math.max(1,a.wins+a.losses),pb=b.wins/Math.max(1,b.wins+b.losses);return pb-pa||(b.rf-b.ra)-(a.rf-a.ra);});
  const top=sorted[0];
  return(
    <div>
      <div style={{display:"flex",gap:6,marginBottom:10}}>{["セ","パ"].map(l=><button key={l} onClick={()=>setLg(l)} className={`tab ${lg===l?"on":""}`} style={{flex:0,padding:"6px 18px"}}>{l}リーグ</button>)}</div>
      <div className="card"><div style={{overflowX:"auto"}}>
        <table className="tbl">
          <thead><tr><th>順位</th><th>チーム</th><th>試合</th><th style={{color:"#34d399"}}>勝</th><th style={{color:"#f87171"}}>敗</th><th>勝率</th><th>G差</th><th>得点</th><th>失点</th><th>得失差</th></tr></thead>
          <tbody>{sorted.map((t,i)=>{
            const g=t.wins+t.losses+t.draws;
            const gb=i===0?"—":(((top.wins-t.wins)+(t.losses-top.losses))/2).toFixed(1);
            const isMe=t.id===myId;
            return(<tr key={t.id} style={{background:isMe?"rgba(245,200,66,.04)":undefined}}>
              <td><span className="mono" style={{color:i===0?"#ffd700":i===1?"#94a3b8":i===2?"#b45309":"#1e2d3d",fontWeight:700,fontSize:15}}>{i+1}</span></td>
              <td><span style={{color:t.color,marginRight:5}}>{t.emoji}</span><span style={{fontWeight:isMe?700:400,color:isMe?"#f5c842":undefined}}>{t.name}{isMe&&" ★"}</span></td>
              <td className="mono">{g}</td><td className="mono" style={{color:"#34d399"}}>{t.wins}</td><td className="mono" style={{color:"#f87171"}}>{t.losses}</td>
              <td className="mono">{t.wins+t.losses>0?"."+String(Math.round(t.wins/(t.wins+t.losses)*1000)).padStart(3,"0"):"---"}</td>
              <td className="mono" style={{color:"#374151"}}>{gb}</td>
              <td className="mono">{t.rf}</td><td className="mono">{t.ra}</td>
              <td className="mono" style={{color:(t.rf-t.ra)>0?"#34d399":(t.rf-t.ra)<0?"#f87171":"#374151"}}>{(t.rf-t.ra)>0?"+":""}{t.rf-t.ra}</td>
            </tr>);
          })}</tbody>
        </table>
      </div></div>
    </div>
  );
}
/* ═══════════════════════════════════════════════
   RECORDS TAB — シーズン表彰・歴代記録・殿堂
═══════════════════════════════════════════════ */

export function RecordsTab({ history }) {
  const { awards = [], records = {}, hallOfFame = [], championships = [], standingsHistory = [] } = history || {};
  const latest = awards.length > 0 ? awards[awards.length - 1] : null;

  const topCareerHR = Object.values(records.careerHR || {}).sort((a, b) => b.value - a.value).slice(0, 5);
  const topCareerW  = Object.values(records.careerW  || {}).sort((a, b) => b.value - a.value).slice(0, 5);

  return (
    <div>
      {latest && (
        <div className="card" style={{ marginBottom: 10 }}>
          <div className="card-h">🏆 {latest.year}年シーズン表彰</div>
          {latest.mvp && (
            <div style={{ fontSize: 12, padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,.05)" }}>
              <span style={{ color: "#f5c842", fontWeight: 700 }}>MVP</span>
              <span style={{ marginLeft: 10, color: "#e0d4bf" }}>{latest.mvp.name}</span>
              <span style={{ marginLeft: 6, fontSize: 10, color: "#94a3b8" }}>({latest.mvp.teamName}) OPS {latest.mvp.OPS?.toFixed(3)} WAR {latest.mvp.WAR?.toFixed(1)}</span>
            </div>
          )}
          {latest.sawamura && (
            <div style={{ fontSize: 12, padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,.05)" }}>
              <span style={{ color: "#60a5fa", fontWeight: 700 }}>沢村賞</span>
              <span style={{ marginLeft: 10, color: "#e0d4bf" }}>{latest.sawamura.name}</span>
              <span style={{ marginLeft: 6, fontSize: 10, color: "#94a3b8" }}>({latest.sawamura.teamName}) {latest.sawamura.W}勝 ERA {latest.sawamura.ERA}</span>
            </div>
          )}
          {latest.rookie && (
            <div style={{ fontSize: 12, padding: "4px 0" }}>
              <span style={{ color: "#34d399", fontWeight: 700 }}>新人王</span>
              <span style={{ marginLeft: 10, color: "#e0d4bf" }}>{latest.rookie.name}</span>
              <span style={{ marginLeft: 6, fontSize: 10, color: "#94a3b8" }}>({latest.rookie.teamName})</span>
            </div>
          )}
        </div>
      )}

      <div className="card" style={{ marginBottom: 10 }}>
        <div className="card-h">📜 歴代シーズン記録</div>
        {records.singleSeasonHR && (
          <div style={{ fontSize: 11, padding: "3px 0", borderBottom: "1px solid rgba(255,255,255,.04)", display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#94a3b8" }}>シーズン本塁打</span>
            <span style={{ color: "#f5c842", fontWeight: 700 }}>{records.singleSeasonHR.value}本 {records.singleSeasonHR.playerName}</span>
          </div>
        )}
        {records.singleSeasonAVG && (
          <div style={{ fontSize: 11, padding: "3px 0", borderBottom: "1px solid rgba(255,255,255,.04)", display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#94a3b8" }}>シーズン打率</span>
            <span style={{ color: "#f5c842", fontWeight: 700 }}>.{String(Math.round(records.singleSeasonAVG.value * 1000)).padStart(3,"0")} {records.singleSeasonAVG.playerName}</span>
          </div>
        )}
        {records.singleSeasonK && (
          <div style={{ fontSize: 11, padding: "3px 0", display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#94a3b8" }}>シーズン奪三振</span>
            <span style={{ color: "#f5c842", fontWeight: 700 }}>{records.singleSeasonK.value}K {records.singleSeasonK.playerName}</span>
          </div>
        )}
        {!records.singleSeasonHR && <div style={{ fontSize: 11, color: "#374151" }}>記録なし（1シーズン終了後に更新されます）</div>}
      </div>

      {topCareerHR.length > 0 && (
        <div className="card" style={{ marginBottom: 10 }}>
          <div className="card-h">💪 通算本塁打ランキング</div>
          {topCareerHR.map((r, i) => (
            <div key={i} style={{ fontSize: 11, padding: "3px 0", borderBottom: "1px solid rgba(255,255,255,.04)", display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#94a3b8" }}><span style={{ color: i===0?"#ffd700":i===1?"#c0c0c0":i===2?"#b45309":"#374151", marginRight: 6, fontWeight: 700 }}>{i+1}.</span>{r.playerName}</span>
              <span style={{ color: "#f5c842", fontWeight: 700 }}>{r.value}本</span>
            </div>
          ))}
        </div>
      )}

      {standingsHistory.length > 0 && (
        <div className="card">
          <div className="card-h">📊 年度別最終順位</div>
          {[...standingsHistory].reverse().map(snap => (
            <div key={snap.year} style={{marginBottom:14}}>
              <div style={{fontWeight:700,fontSize:12,marginBottom:6,color:"#f5c842"}}>{snap.year}年</div>
              {[["セ",snap.central],["パ",snap.pacific]].map(([lg,ranking])=>(
                <div key={lg} style={{marginBottom:8}}>
                  <div style={{fontSize:10,color:"#94a3b8",marginBottom:3}}>{lg}リーグ</div>
                  {(ranking||[]).map((t,i)=>(
                    <div key={t.id} className="fsb" style={{fontSize:11,padding:"2px 0"}}>
                      <span>{i+1}位 {t.emoji} {t.name}</span>
                      <span style={{color:"#94a3b8"}}>{t.wins}勝{t.losses}敗<span style={{marginLeft:6,fontSize:9}}>{t.rf}得/{t.ra}失</span></span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {championships.length > 0 && (
        <div className="card" style={{ marginBottom: 10 }}>
          <div className="card-h">🏆 優勝履歴</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {[...championships].reverse().map((c, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", borderRadius: 6, background: "rgba(245,200,66,.06)", border: "1px solid rgba(245,200,66,.15)" }}>
                <span style={{ fontSize: 18 }}>🏆</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#f5c842" }}>{c.year}年 日本シリーズ制覇</div>
                  <div style={{ fontSize: 10, color: "#94a3b8" }}>{c.championName} vs {c.opponent}（{c.seriesResult}）</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {hallOfFame.length > 0 && (
        <div className="card">
          <div className="card-h">🏛 球団殿堂</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 8 }}>
            {hallOfFame.map((h, i) => (
              <div key={i} style={{ padding: "8px 10px", borderRadius: 6, background: "rgba(245,200,66,.05)", border: "1px solid rgba(245,200,66,.12)" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#f5c842", marginBottom: 2 }}>{h.playerName}</div>
                <div style={{ fontSize: 9, color: "#94a3b8", marginBottom: 4 }}>{h.inductYear}年度殿堂入り</div>
                {h.careerHR > 0 && <div style={{ fontSize: 10, color: "#e0d4bf" }}>通算{h.careerHR}本塁打</div>}
                {h.careerW  > 0 && <div style={{ fontSize: 10, color: "#e0d4bf" }}>通算{h.careerW}勝</div>}
                {h.careerPA > 0 && <div style={{ fontSize: 10, color: "#94a3b8" }}>{h.careerPA}打席</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {awards.length > 1 && (
        <div className="card" style={{ marginTop: 10 }}>
          <div className="card-h">📅 歴代MVP</div>
          {[...awards].reverse().map((a, i) => a.mvp && (
            <div key={i} style={{ fontSize: 11, padding: "3px 0", borderBottom: "1px solid rgba(255,255,255,.04)", display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#374151" }}>{a.year}年</span>
              <span style={{ color: "#e0d4bf" }}>{a.mvp.name} <span style={{ color: "#94a3b8", fontSize: 10 }}>({a.mvp.teamName})</span></span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
