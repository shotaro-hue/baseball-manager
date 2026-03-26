import React, { useState } from "react";
import { CareerTable } from './CareerTable';

export function AlumniTab({myTeam}){
  const [selId,setSelId]=useState(null);
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
