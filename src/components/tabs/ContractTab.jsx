import React, { useState } from "react";
import { PVAL_DEFS, ACCEPT_THRESHOLD } from '../../constants';
import { fmtSal } from '../../utils';
import { evalOffer } from '../../engine/contract';
import { PersonalityView } from '../ui';

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
