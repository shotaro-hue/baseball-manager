import React, { useState } from "react";
import { PVAL_DEFS, ACCEPT_THRESHOLD } from '../../constants';
import { fmtSal } from '../../utils';
import { evalOffer } from '../../engine/contract';
import { PersonalityView } from '../ui';

function getReactionTone(total){
  if(total >= ACCEPT_THRESHOLD + 10) return "excited";
  if(total >= ACCEPT_THRESHOLD) return "positive";
  if(total >= 55) return "consider";
  if(total >= 40) return "tough";
  return "reject";
}

function makeNegotiationChat(player, offerSal, offerYrs, preview){
  if(!player || !preview) return [];
  const tone = getReactionTone(preview.total);
  const delta = offerSal - (player.salary || 0);
  const deltaText = delta >= 0 ? `+${fmtSal(delta)}` : `-${fmtSal(Math.abs(delta))}`;
  const salaryScore = preview?.breakdown?.money?.score ?? 0;
  const yearScore = preview?.breakdown?.stability?.score ?? 0;
  const rivalScore = preview?.breakdown?.market?.score ?? 0;

  const opening = {
    gm: `来季は ${offerYrs}年 / ${fmtSal(offerSal)} で残留してほしい。現状年俸から${deltaText}の提示だ。`,
    player: `${player.name}「提示ありがとうございます。条件、しっかり確認します。」`,
  };

  const reactions = {
    excited: [
      `${player.name}「この条件なら前向きです！チームへの思いに応えたいです。」`,
      `代理人「年俸評価(${salaryScore})・契約安定(${yearScore})ともに高水準。合意は目前です。」`,
    ],
    positive: [
      `${player.name}「かなり良い条件ですね。細部がまとまれば決められそうです。」`,
      `代理人「市場評価(${rivalScore})と比べても悪くありません。前向きに進めましょう。」`,
    ],
    consider: [
      `${player.name}「気持ちはありますが、もう一声あると安心できます。」`,
      `代理人「単年リスクと市場価格の差が気になります。条件調整の余地があります。」`,
    ],
    tough: [
      `${player.name}「正直、迷います…。この条件では決断が難しいです。」`,
      `代理人「提示は把握しましたが、評価が不足しています。再提示を推奨します。」`,
    ],
    reject: [
      `${player.name}「この条件では厳しいです。納得できません。」`,
      `代理人「現時点では合意困難です。年俸か年数の大幅見直しが必要です。」`,
    ],
  };

  return [
    { speaker: "GM", text: opening.gm, align: "right", color: "#60a5fa" },
    { speaker: player.name, text: opening.player, align: "left", color: "#f5c842" },
    ...reactions[tone].map((text, idx)=>({
      speaker: idx === 0 ? player.name : "代理人",
      text,
      align: "left",
      color: idx === 0 ? "#f5c842" : "#c084fc",
    })),
  ];
}

export function ContractTab({team,allTeams,onOffer,onRelease}){
  const [selId,setSelId]=useState(null);
  const [offerSal,setOfferSal]=useState(0);
  const [offerYrs,setOfferYrs]=useState(1);
  const [negotiationLogs, setNegotiationLogs] = useState({});
  const [offerRounds, setOfferRounds] = useState({});
  const expiring=team.players.filter(p=>p.contractYearsLeft<=1);
  const sel=team.players.find(p=>p.id===selId);
  const salaryOptions=sel
    ? Array.from(new Set([
        2000, 3000, 5000,
        Math.max(1000, Math.round(sel.salary * 0.8 / 100) * 100),
        Math.max(1000, Math.round(sel.salary / 100) * 100),
        Math.max(1000, Math.round(sel.salary * 1.2 / 100) * 100),
        Math.max(1000, Math.round(sel.salary * 1.5 / 100) * 100),
        Math.max(1000, Math.round(sel.salary * 2.0 / 100) * 100),
      ])).sort((a,b)=>a-b)
    : [];
  const preview=sel?evalOffer(sel,{salary:offerSal,years:offerYrs},team,allTeams):null;
  const previewChat = sel ? makeNegotiationChat(sel, offerSal, offerYrs, preview) : [];
  const chat = sel ? (negotiationLogs[sel.id] || previewChat) : [];
  const currentRound = sel ? (offerRounds[sel.id] || 0) : 0;
  const ac=preview?.total>=ACCEPT_THRESHOLD?"#34d399":preview?.total>=40?"#f5c842":"#f87171";

  const appendOfferRally = () => {
    if(!sel || !preview) return;
    const tone = getReactionTone(preview.total);
    const nextRound = (offerRounds[sel.id] || 0) + 1;
    const roundLabel = `第${nextRound}ラリー`;
    const desiredSalary = Math.max(1000, Math.round((sel.salary || 0) * (tone === "reject" ? 1.5 : tone === "tough" ? 1.3 : tone === "consider" ? 1.2 : 1.05) / 100) * 100);
    const desiredYears = tone === "reject" ? Math.max(offerYrs, 3) : tone === "tough" ? Math.max(offerYrs, 2) : offerYrs;

    const rally = [
      { speaker: "GM", text: `${roundLabel}：${offerYrs}年 / ${fmtSal(offerSal)} を正式提示する。`, align: "right", color: "#60a5fa" },
      { speaker: sel.name, text: `${sel.name}「条件を受け取りました。率直に返答します。」`, align: "left", color: "#f5c842" },
      { speaker: "代理人", text: tone === "excited" || tone === "positive"
        ? `代理人「かなり前向きです。このままなら合意できる見込みです。」`
        : `代理人「現時点では ${desiredYears}年 / ${fmtSal(desiredSalary)} 付近が妥結ラインです。」`, align: "left", color: "#c084fc" },
      { speaker: sel.name, text: tone === "excited" || tone === "positive"
        ? `${sel.name}「次の提示で最終判断できます。」`
        : `${sel.name}「もう少し条件が上がれば、残留を真剣に考えます。」`, align: "left", color: "#f5c842" },
    ];

    setNegotiationLogs(prev => ({
      ...prev,
      [sel.id]: [...(prev[sel.id] || previewChat), ...rally],
    }));
    setOfferRounds(prev => ({ ...prev, [sel.id]: nextRound }));
  };

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
                <td style={{fontWeight:700,cursor:"pointer",color:selId===p.id?"#f5c842":undefined}} onClick={()=>{setSelId(p.id);setOfferSal(Math.max(1000,Math.round(p.salary/100)*100));setOfferYrs(1);}}>{p.name}</td>
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
                <label style={{fontSize:11,color:"#4b5563",display:"block",marginBottom:4}}>年俸オファー</label>
                <select value={offerSal} onChange={e=>setOfferSal(Number(e.target.value)||0)} style={{background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.1)",borderRadius:6,padding:"6px 10px",color:"#e0d4bf",fontFamily:"'Share Tech Mono',monospace",width:"100%"}}>
                  {salaryOptions.map(v=><option key={v} value={v} style={{background:"#0b1220"}}>{fmtSal(v)}</option>)}
                </select>
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
              {chat.length>0&&(
                <div style={{background:"rgba(15,23,42,.6)",border:"1px solid rgba(148,163,184,.2)",borderRadius:8,padding:10,marginBottom:10}}>
                  <div style={{fontSize:10,color:"#94a3b8",marginBottom:8,letterSpacing:".08em"}}>NEGOTIATION TALK {currentRound>0?`/ ${currentRound} ROUNDS`:""}</div>
                  <div style={{display:"flex",flexDirection:"column",gap:7}}>
                    {chat.map((line,idx)=>(
                      <div key={`${line.speaker}-${idx}`} style={{display:"flex",justifyContent:line.align==="right"?"flex-end":"flex-start"}}>
                        <div style={{maxWidth:"92%",background:line.align==="right"?"rgba(37,99,235,.2)":"rgba(30,41,59,.9)",border:`1px solid ${line.color}55`,borderRadius:10,padding:"7px 9px"}}>
                          <div style={{fontSize:9,color:line.color,fontWeight:700,marginBottom:2}}>{line.speaker}</div>
                          <div style={{fontSize:11,color:"#e2e8f0",lineHeight:1.45}}>{line.text}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div style={{display:"grid",gap:8}}>
                <button className="btn btn-gold" style={{width:"100%"}} onClick={appendOfferRally}>オファーを送る（会話）</button>
                <button className="btn" style={{width:"100%"}} onClick={()=>onOffer(sel.id,offerSal,offerYrs)}>この条件で最終オファー</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
