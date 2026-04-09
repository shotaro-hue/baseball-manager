import React, { useState } from "react";
import { ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis } from "recharts";
import { fmtAvg, fmtPct, fmtIP } from '../../utils';
import { saberBatter, saberPitcher } from '../../engine/sabermetrics';
import { ThCell, HandBadge } from '../ui';
import { CareerTable } from './CareerTable';

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
              {sel.isPitcher?(()=>{const sp=saberPitcher(sel.stats);return[["防御率",sp.ERA],["奪三振",sel.stats.Kp],["WHIP",sp.WHIP],["FIP",sp.FIP],["xFIP",sp.xFIP],["三振率",fmtPct(sp.Kpct)],["四球率",fmtPct(sp.BBpct)],["WAR",sp.WAR]].map(([l,v])=><div key={l} className="fsb" style={{padding:"4px 0",borderBottom:"1px solid rgba(255,255,255,.03)"}}><span style={{color:"#374151"}}>{l}</span><span className="mono" style={{color:"#94a3b8"}}>{v}</span></div>);})():(()=>{const sb=saberBatter(sel.stats);return[["打率",fmtAvg(sel.stats.H,sel.stats.AB)],["OPS",sb.OPS.toFixed(3)],["wOBA",sb.wOBA.toFixed(3)],["wRC+",sb.wRCp],["ISO",sb.ISO.toFixed(3)],["四球率",fmtPct(sb.BBpct)],["三振率",fmtPct(sb.Kpct)],["打球速度",sb.EVavg>0?sb.EVavg+"km/h":"---"],["WAR",sb.WAR]].map(([l,v])=><div key={l} className="fsb" style={{padding:"4px 0",borderBottom:"1px solid rgba(255,255,255,.03)"}}><span style={{color:"#374151"}}>{l}</span><span className="mono" style={{color:"#94a3b8"}}>{v}</span></div>);})()}
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
  <th title="奪三振">K</th>
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
                    <td className="mono" style={{color:sp.ERA>0&&sp.ERA<2.5?"#34d399":sp.ERA<3.5?"#f5c842":sp.ERA>0?"#f87171":undefined}}>{sp.ERA>0?sp.ERA:"---"}</td>
                    <td className="mono" style={{color:p.stats.Kp>=150?"#34d399":p.stats.Kp>=100?"#f5c842":undefined}}>{p.stats.Kp||"-"}</td>
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
