import { useState } from "react";
import { TEAM_DEFS, ACCEPT_THRESHOLD, CPU_RENEWAL_ROUNDS,
  NEGOTIATION_MORALE_ACCEPT_BONUS, NEGOTIATION_MORALE_CUT_PENALTY,
  NEGOTIATION_MORALE_ROUND_HIT, NEGOTIATION_TRUST_HAPPY, NEGOTIATION_TRUST_HOLDOUT } from '../constants';
import { fmtSal, fmtM, fmtAvg, clamp } from '../utils';
import { calcRetireWill } from '../engine/player';
import { evalOffer, getFaThreshold } from '../engine/contract';
import { OV, CondBadge, HandBadge } from './ui';



export function ModeSelectScreen({myTeam,oppTeam,gameDay,onSelect,onBack}){
  return(
    <div className="app">
      <div className="mode-wrap">
        <div style={{marginBottom:6,fontSize:11,color:"#374151",letterSpacing:".2em"}}>第{gameDay}戦</div>
        <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:36,color:"#f5c842",letterSpacing:".1em",marginBottom:4}}>
          vs {oppTeam?.name}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:28}}>
          <span style={{fontSize:22}}>{myTeam?.emoji}</span>
          <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:16,color:"#374151"}}>vs</span>
          <span style={{fontSize:22}}>{oppTeam?.emoji}</span>
        </div>

        <div style={{display:"grid",gap:14,width:"100%",maxWidth:520,marginBottom:8}}>
          <div
            className="mode-card tactical"
            role="button"
            tabIndex={0}
            onClick={()=>onSelect?.("tactical")}
            onKeyDown={(event)=>{
              if(event.key!=="Enter"&&event.key!==" ") return;
              event.preventDefault();
              onSelect?.("tactical");
            }}
          >
            <div style={{fontSize:42,marginBottom:10}}>🎮</div>
            <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:28,color:"#f5c842",letterSpacing:".1em",marginBottom:6}}>
              戦術モード
            </div>
            <div style={{fontSize:12,color:"#4b5563",lineHeight:1.6}}>
              既存の TacticalGame 画面【＝打席ごとの指示ができる対戦UI】を利用して試合を進行します。<br/>
              継投・代打・作戦を手動で判断したい場合はこちらを選択してください。
            </div>
          </div>

          <div
            className="mode-card auto"
            role="button"
            tabIndex={0}
            onClick={()=>onSelect?.("auto")}
            onKeyDown={(event)=>{
              if(event.key!=="Enter"&&event.key!==" ") return;
              event.preventDefault();
              onSelect?.("auto");
            }}
          >
            <div style={{fontSize:42,marginBottom:10}}>⚡</div>
            <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:28,color:"#34d399",letterSpacing:".1em",marginBottom:6}}>
              オートシムモード
            </div>
            <div style={{fontSize:12,color:"#4b5563",lineHeight:1.6}}>
              既存の試合進行画面【＝現在の標準UI】で結果を確認。<br/>
              試合は自動で進み、シーズン運営に集中できます。
            </div>
          </div>
        </div>

        <button onClick={onBack} style={{background:"transparent",border:"none",color:"#374151",cursor:"pointer",fontSize:12,marginTop:4}}>
          ← ハブに戻る
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   ROSTER TAB (simplified for space)
═══════════════════════════════════════════════ */

export function ResultScreen({gsResult,myTeam,oppTeam,gameDay,onNext,nextLabel='次の試合へ →'}){
  const [activeTab,setActiveTab]=useState('bat');
  const won=gsResult.score.my>gsResult.score.opp;
  const drew=gsResult.score.my===gsResult.score.opp;
  const log=gsResult.log||[];
  const inningSummary=gsResult.inningSummary||[];

  // helpers
  const IS_HIT=(r)=>['s','d','t','hr'].includes(r);
  const IS_OUT=(r)=>['k','out','fo','go','sac','sf'].includes(r);
  const findPlayer=(team,id)=>team?.players?.find(p=>p.id===id)??team?.farm?.find(p=>p.id===id);
  const fmtIPlocal=(outs)=>{const f=Math.floor(outs/3),r=outs%3;return r===0?`${f}`:`${f}.${r}`;};
  const hrLabel=(rbi)=>({1:'ソロ',2:'2ラン',3:'3ラン',4:'満塁'}[rbi]||`${rbi}点本塁打`);
  const fmtSeasonAvg=(p)=>{
    if(!p?.stats)return'.---';
    const ab=p.stats.AB||0,h=p.stats.H||0;
    return ab===0?'.---':'.'+String(Math.round(h/ab*1000)).padStart(3,'0');
  };

  // line score
  const maxInning=Math.max(9,...inningSummary.map(e=>e.inning));
  const innings=Array.from({length:maxInning},(_,i)=>i+1);
  const myRunsByInn={},oppRunsByInn={};
  inningSummary.forEach(({inning,isTop,runs})=>{
    if(isTop)oppRunsByInn[inning]=runs; else myRunsByInn[inning]=runs;
  });
  const myHitsTotal=log.filter(e=>e.scorer&&IS_HIT(e.result)&&!e.isStolenBase).length;
  const oppHitsTotal=log.filter(e=>!e.scorer&&IS_HIT(e.result)&&!e.isStolenBase).length;

  // pitcher event streams
  const myPitchEvts=log.filter(e=>!e.scorer&&!e.isStolenBase&&e.pitcherId&&e.result&&e.result!=='change');
  const oppPitchEvts=log.filter(e=>!!e.scorer&&!e.isStolenBase&&e.pitcherId&&e.result&&e.result!=='change');
  const uniqueIds=(evts)=>{const seen=new Set(),out=[];evts.forEach(e=>{if(!seen.has(e.pitcherId)){seen.add(e.pitcherId);out.push(e.pitcherId);}});return out;};
  const myPitcherIds=uniqueIds(myPitchEvts);
  const oppPitcherIds=uniqueIds(oppPitchEvts);

  const buildPitcherStats=(evts,ids)=>{
    const m={};
    evts.forEach(e=>{
      if(!m[e.pitcherId])m[e.pitcherId]={outs:0,H:0,ER:0,K:0,BB:0,PC:0};
      const s=m[e.pitcherId];
      if(IS_OUT(e.result))s.outs++;
      if(IS_HIT(e.result))s.H++;
      if(e.result==='k')s.K++;
      if(e.result==='bb')s.BB++;
      if((e.rbi||0)>0)s.ER+=e.rbi;
      s.PC+=(e.pitches||0);
    });
    return ids.map(id=>({id,...(m[id]||{outs:0,H:0,ER:0,K:0,BB:0,PC:0})}));
  };
  const myPStats=buildPitcherStats(myPitchEvts,myPitcherIds);
  const oppPStats=buildPitcherStats(oppPitchEvts,oppPitcherIds);

  // responsible pitchers
  const myStarterOuts=myPStats[0]?.outs||0;
  const myWinnerId=won?(myStarterOuts>=15?myPitcherIds[0]:(myPitcherIds[1]||myPitcherIds[0])):null;
  const myLoserId=(!won&&!drew)?myPitcherIds[0]:null;
  const finalLead=gsResult.score.my-gsResult.score.opp;
  const mySaveSit=won&&finalLead>=1&&finalLead<=3;
  const mySaverId=(won&&mySaveSit&&myPitcherIds.length>=2&&myPitcherIds[myPitcherIds.length-1]!==myWinnerId)?myPitcherIds[myPitcherIds.length-1]:null;
  const oppStarterOuts=oppPStats[0]?.outs||0;
  const oppWinnerId=(!won&&!drew)?(oppStarterOuts>=15?oppPitcherIds[0]:(oppPitcherIds[1]||oppPitcherIds[0])):null;
  const oppLoserId=(won&&!drew)?oppPitcherIds[0]:null;
  const oppSaveSit=!won&&!drew&&Math.abs(finalLead)<=3;
  const oppSaverId=(!won&&oppSaveSit&&oppPitcherIds.length>=2&&oppPitcherIds[oppPitcherIds.length-1]!==oppWinnerId)?oppPitcherIds[oppPitcherIds.length-1]:null;

  const myPRole=(id)=>id===myWinnerId?'勝':id===myLoserId?'敗':id===mySaverId?'S':'';
  const oppPRole=(id)=>id===oppWinnerId?'勝':id===oppLoserId?'敗':id===oppSaverId?'S':'';

  // home runs
  const myHREvts=log.filter(e=>e.scorer&&e.result==='hr');
  const oppHREvts=log.filter(e=>!e.scorer&&e.result==='hr');

  // batter stats (this game, batting order)
  const buildBatStats=(evts)=>{
    const m={};
    const ordered=[];
    evts.filter(e=>e.batId&&e.result&&e.result!=='change'&&!e.isStolenBase).forEach(e=>{
      if(!m[e.batId]){m[e.batId]={name:e.batter||'',AB:0,H:0,HR:0,RBI:0};ordered.push(e.batId);}
      const s=m[e.batId];
      if(!['bb','hbp','sf'].includes(e.result))s.AB++;
      if(IS_HIT(e.result))s.H++;
      if(e.result==='hr')s.HR++;
      s.RBI+=(e.rbi||0);
    });
    return ordered.map(id=>({id,...m[id]}));
  };
  const myBatStats=buildBatStats(log.filter(e=>e.scorer));
  const oppBatStats=buildBatStats(log.filter(e=>!e.scorer));

  const resultColor=won?'var(--gold)':drew?'var(--blue)':'var(--red)';
  const resultLabel=won?'VICTORY':drew?'DRAW':'DEFEAT';

  const cellSt={textAlign:'center',padding:'5px 3px',fontFamily:"'Share Tech Mono',monospace"};
  const thSt={...cellSt,fontSize:9,color:'var(--dim)',fontWeight:400,padding:'3px 3px'};

  return(
    <div className="app">
      <div style={{maxWidth:520,margin:'0 auto',paddingBottom:60}}>

        {/* ── HEADER ── */}
        <div style={{background:'linear-gradient(180deg,rgba(4,16,28,.95) 0%,var(--card) 100%)',padding:'20px 16px 16px',textAlign:'center',borderBottom:'1px solid var(--border)'}}>
          <div style={{fontSize:10,color:'#94a3b8',letterSpacing:'.2em',marginBottom:10}}>第{gameDay}戦</div>
          <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8,marginBottom:12}}>
            <div style={{textAlign:'center',flex:1}}>
              <div style={{fontSize:30}}>{myTeam.emoji}</div>
              <div style={{fontSize:11,color:'var(--text)',marginTop:3,fontWeight:700}}>{myTeam.short}</div>
            </div>
            <div style={{textAlign:'center',minWidth:120}}>
              <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:52,lineHeight:1,letterSpacing:'.05em',color:resultColor}}>
                {gsResult.score.my}<span style={{fontSize:32,color:'var(--dim)',margin:'0 4px'}}>-</span>{gsResult.score.opp}
              </div>
              <div style={{fontSize:9,letterSpacing:'.25em',color:resultColor,marginTop:3}}>{resultLabel}</div>
            </div>
            <div style={{textAlign:'center',flex:1}}>
              <div style={{fontSize:30}}>{oppTeam.emoji}</div>
              <div style={{fontSize:11,color:'var(--text)',marginTop:3,fontWeight:700}}>{oppTeam.short}</div>
            </div>
          </div>
          <div style={{fontSize:11,color:'#94a3b8'}}>
            vs {oppTeam.name}　通算
            <span style={{color:'var(--green)',marginLeft:5}}>{myTeam.wins}勝</span>
            <span style={{color:'#4b5563',margin:'0 2px'}}>/</span>
            <span style={{color:'var(--red)'}}>{myTeam.losses}敗</span>
            {(myTeam.draws||0)>0&&<><span style={{color:'#4b5563',margin:'0 2px'}}>/</span><span style={{color:'var(--dim)'}}>{myTeam.draws}分</span></>}
          </div>
        </div>

        <div style={{padding:'12px 12px 0'}}>

          {/* ── LINE SCORE ── */}
          <div className="card" style={{padding:'10px 8px',overflowX:'auto'}}>
            <div style={{fontSize:9,color:'var(--dim)',letterSpacing:'.2em',marginBottom:8}}>SCORE BY INNING</div>
            <table style={{width:'100%',borderCollapse:'collapse',minWidth:280}}>
              <thead>
                <tr>
                  <th style={{...thSt,textAlign:'left',width:28}}></th>
                  {innings.map(i=><th key={i} style={{...thSt,minWidth:20}}>{i}</th>)}
                  <th style={{...thSt,borderLeft:'1px solid var(--border)',paddingLeft:6,fontWeight:700}}>計</th>
                  <th style={{...thSt}}>安</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{padding:'5px 2px',fontSize:11,fontWeight:700,color:oppTeam.color||'var(--text)',fontFamily:"'Share Tech Mono',monospace"}}>{oppTeam.short}</td>
                  {innings.map(i=>{const r=oppRunsByInn[i];return<td key={i} style={{...cellSt,fontSize:12,color:r>0?'var(--text)':'var(--dim)',fontWeight:r>0?700:400}}>{r!==undefined?r:''}</td>;})}
                  <td style={{...cellSt,fontSize:12,fontWeight:700,color:'var(--text)',borderLeft:'1px solid var(--border)',paddingLeft:6}}>{gsResult.score.opp}</td>
                  <td style={{...cellSt,fontSize:11,color:'var(--dim)'}}>{oppHitsTotal}</td>
                </tr>
                <tr>
                  <td style={{padding:'5px 2px',fontSize:11,fontWeight:700,color:myTeam.color||'var(--gold)',fontFamily:"'Share Tech Mono',monospace"}}>{myTeam.short}</td>
                  {innings.map(i=>{
                    const r=myRunsByInn[i];
                    const isX=r===undefined&&won&&i===maxInning&&oppRunsByInn[i]!==undefined;
                    return<td key={i} style={{...cellSt,fontSize:12,color:r>0?'var(--gold)':isX?'var(--dim)':'var(--dim)',fontWeight:r>0?700:400}}>{r!==undefined?r:isX?'X':''}</td>;
                  })}
                  <td style={{...cellSt,fontSize:12,fontWeight:700,color:'var(--gold)',borderLeft:'1px solid var(--border)',paddingLeft:6}}>{gsResult.score.my}</td>
                  <td style={{...cellSt,fontSize:11,color:'var(--dim)'}}>{myHitsTotal}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ── RESPONSIBLE PITCHERS ── */}
          {(myWinnerId||myLoserId||mySaverId||oppWinnerId||oppLoserId||oppSaverId)&&(
            <div className="card">
              <div className="card-h">責任投手</div>
              {[
                myWinnerId&&{label:'勝',color:'var(--green)',player:findPlayer(myTeam,myWinnerId),team:myTeam.short},
                oppWinnerId&&{label:'勝',color:'var(--green)',player:findPlayer(oppTeam,oppWinnerId),team:oppTeam.short},
                myLoserId&&{label:'敗',color:'var(--red)',player:findPlayer(myTeam,myLoserId),team:myTeam.short},
                oppLoserId&&{label:'敗',color:'var(--red)',player:findPlayer(oppTeam,oppLoserId),team:oppTeam.short},
                mySaverId&&{label:'S',color:'var(--blue)',player:findPlayer(myTeam,mySaverId),team:myTeam.short},
                oppSaverId&&{label:'S',color:'var(--blue)',player:findPlayer(oppTeam,oppSaverId),team:oppTeam.short},
              ].filter(Boolean).map((row,i)=>(
                <div key={i} className="fsb" style={{padding:'6px 0',borderBottom:'1px solid rgba(255,255,255,.04)'}}>
                  <div style={{display:'flex',alignItems:'center',gap:10}}>
                    <span style={{width:12,fontWeight:700,color:row.color,fontSize:11}}>{row.label}</span>
                    <span style={{fontSize:12,color:'var(--text)'}}>{row.player?.name||'?'}</span>
                  </div>
                  <span style={{fontSize:10,color:'var(--dim)'}}>【{row.team}】</span>
                </div>
              ))}
            </div>
          )}

          {/* ── HOME RUNS ── */}
          {(myHREvts.length>0||oppHREvts.length>0)&&(
            <div className="card">
              <div className="card-h">本塁打</div>
              {[
                ...myHREvts.map(e=>({...e,teamShort:myTeam.short,teamColor:myTeam.color||'var(--gold)',isMy:true})),
                ...oppHREvts.map(e=>({...e,teamShort:oppTeam.short,teamColor:oppTeam.color||'var(--text)',isMy:false})),
              ].sort((a,b)=>a.inning-b.inning||(a.isTop?0:1)-(b.isTop?0:1)).map((e,i)=>(
                <div key={i} className="fsb" style={{padding:'5px 0',borderBottom:'1px solid rgba(255,255,255,.04)'}}>
                  <div style={{display:'flex',alignItems:'center',gap:6}}>
                    <span style={{fontSize:11,color:'var(--text)',fontWeight:700}}>{e.batter}</span>
                    <span style={{fontSize:10,color:'var(--red)'}}>本</span>
                  </div>
                  <span style={{fontSize:10,color:'var(--dim)'}}>{e.inning}回{e.isTop?'表':'裏'} {hrLabel(e.rbi)} <span style={{color:e.teamColor}}>【{e.teamShort}】</span></span>
                </div>
              ))}
            </div>
          )}

          {/* ── STATS TABS ── */}
          {log.length>0&&(
            <div className="card" style={{padding:0,overflow:'hidden'}}>
              <div style={{display:'flex',borderBottom:'1px solid var(--border)'}}>
                {[['bat','打者成績'],['pitch','投手成績']].map(([t,label])=>(
                  <button key={t} onClick={()=>setActiveTab(t)} style={{flex:1,padding:'10px 0',border:'none',background:activeTab===t?'rgba(245,200,66,.07)':'transparent',color:activeTab===t?'var(--gold)':'var(--dim)',fontSize:12,cursor:'pointer',borderBottom:activeTab===t?'2px solid var(--gold)':'2px solid transparent',transition:'.15s',fontFamily:"'Noto Sans JP',sans-serif"}}>
                    {label}
                  </button>
                ))}
              </div>
              <div style={{padding:'10px 8px'}}>
                {activeTab==='bat'&&(
                  <>
                    {[{team:myTeam,batters:myBatStats},{team:oppTeam,batters:oppBatStats}].map(({team,batters},ti)=>(
                      <div key={ti} style={{marginBottom:ti===0?14:0}}>
                        {ti>0&&<div style={{borderTop:'1px solid var(--border)',marginBottom:10}}/>}
                        <div style={{fontSize:10,fontWeight:700,color:team.color||'var(--text)',marginBottom:6}}>{team.short}</div>
                        <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
                          <thead>
                            <tr>
                              {['選手','打率','打','安','点','本'].map(h=><th key={h} style={{...thSt,textAlign:h==='選手'?'left':'center'}}>{h}</th>)}
                            </tr>
                          </thead>
                          <tbody>
                            {batters.map(b=>{
                              const p=findPlayer(team,b.id);
                              return(
                                <tr key={b.id} style={{borderBottom:'1px solid rgba(255,255,255,.03)'}}>
                                  <td style={{padding:'4px 2px',color:b.H>0?'var(--text)':'var(--dim)',maxWidth:80,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{b.name}</td>
                                  <td style={{...cellSt,fontSize:10,color:'#6b7280'}}>{fmtSeasonAvg(p)}</td>
                                  <td style={{...cellSt}}>{b.AB}</td>
                                  <td style={{...cellSt,color:b.H>0?'var(--green)':'var(--dim)',fontWeight:b.H>0?700:400}}>{b.H}</td>
                                  <td style={{...cellSt,color:b.RBI>0?'var(--gold)':'var(--dim)'}}>{b.RBI||0}</td>
                                  <td style={{...cellSt,color:b.HR>0?'var(--red)':'var(--dim)'}}>{b.HR||0}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </>
                )}
                {activeTab==='pitch'&&(
                  <>
                    {[{team:myTeam,pstats:myPStats,roleF:myPRole},{team:oppTeam,pstats:oppPStats,roleF:oppPRole}].map(({team,pstats,roleF},ti)=>(
                      <div key={ti} style={{marginBottom:ti===0?14:0}}>
                        {ti>0&&<div style={{borderTop:'1px solid var(--border)',marginBottom:10}}/>}
                        <div style={{fontSize:10,fontWeight:700,color:team.color||'var(--text)',marginBottom:6}}>{team.short}</div>
                        <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
                          <thead>
                            <tr>
                              {['選手','回','球','安','振','四','失'].map(h=><th key={h} style={{...thSt,textAlign:h==='選手'?'left':'center'}}>{h}</th>)}
                            </tr>
                          </thead>
                          <tbody>
                            {pstats.map(ps=>{
                              const p=findPlayer(team,ps.id);
                              const role=roleF(ps.id);
                              return(
                                <tr key={ps.id} style={{borderBottom:'1px solid rgba(255,255,255,.03)'}}>
                                  <td style={{padding:'4px 2px',color:'var(--text)'}}>
                                    {role&&<span style={{fontSize:9,fontWeight:700,marginRight:4,color:role==='勝'?'var(--green)':role==='敗'?'var(--red)':'var(--blue)'}}>{role}</span>}
                                    {p?.name||'?'}
                                  </td>
                                  <td style={{...cellSt,fontSize:10}}>{fmtIPlocal(ps.outs)}</td>
                                  <td style={{...cellSt,color:'var(--dim)'}}>{ps.PC||0}</td>
                                  <td style={{...cellSt,color:'var(--dim)'}}>{ps.H}</td>
                                  <td style={{...cellSt,color:'var(--dim)'}}>{ps.K}</td>
                                  <td style={{...cellSt,color:'var(--dim)'}}>{ps.BB}</td>
                                  <td style={{...cellSt,color:ps.ER>0?'var(--red)':'var(--dim)'}}>{ps.ER}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          )}

          <button className="btn btn-gold" style={{width:'100%',padding:'14px 0',fontSize:14,marginTop:10}} onClick={onNext}>
            {nextLabel}
          </button>

        </div>
      </div>
    </div>
  );
}
/* ═══════════════════════════════════════════════
   SEASON END
═══════════════════════════════════════════════ */




export function SeasonEndScreen({teams,myId,year,onToDraft}){
  const myLeague=teams.find(t=>t.id===myId)?.league;
  const sorted=[...teams.filter(t=>t.league===myLeague)].sort((a,b)=>b.wins-a.wins);
  const me=teams.find(t=>t.id===myId);
  const myRank=sorted.findIndex(t=>t.id===myId)+1;
  const isChamp=myRank===1;
  return(
    <div className="app">
      <div style={{maxWidth:580,margin:"0 auto",padding:"40px 20px",textAlign:"center"}}>
        <div style={{fontSize:48,marginBottom:10}}>{isChamp?"🏆":"📋"}</div>
        <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:52,color:isChamp?"#f5c842":"#94a3b8",letterSpacing:".1em"}}>{isChamp?`${year}年 優勝！`:`${year}年 終了`}</div>
        <p style={{color:"#4b5563",margin:"10px 0 20px"}}>{me?.name} — {myRank}位 {me?.wins}勝{me?.losses}敗</p>
        <div className="card" style={{textAlign:"left",marginBottom:20}}>
          {sorted.map((t,i)=>(
            <div key={t.id} className="fsb" style={{padding:"7px 0",borderBottom:"1px solid rgba(255,255,255,.04)",background:t.id===myId?"rgba(245,200,66,.04)":undefined}}>
              <div><span className="mono" style={{color:i===0?"#ffd700":i===1?"#94a3b8":i===2?"#b45309":"#1e2d3d",marginRight:10}}>{i+1}</span><span style={{color:t.color,marginRight:6}}>{t.emoji}</span><span style={{fontWeight:t.id===myId?700:400,color:t.id===myId?"#f5c842":undefined}}>{t.name}</span></div>
              <span className="mono"><span style={{color:"#34d399"}}>{t.wins}</span><span style={{color:"#374151"}}>/</span><span style={{color:"#f87171"}}>{t.losses}</span></span>
            </div>
          ))}
        </div>
        <button className="btn btn-gold" style={{padding:"12px 36px"}} onClick={onToDraft}>⚾ ドラフト会議へ →</button>
      </div>
    </div>
  );
}
/* ═══════════════════════════════════════════════
   STATS APPLY HELPER
   log の全打席を正確に選手statsへ反映する
═══════════════════════════════════════════════ */

export function RetirePhaseScreen({teams,myId,year,onNext}){
  const myTeam=teams.find(t=>t.id===myId);
  const [results,setResults]=useState({}); // {pid: "retained"|"retain_failed"|"accepted"}
  const candidates=myTeam.players.filter(p=>p.age>=35&&!p.isRetired);
  const rsLabel=(rs)=>rs===undefined?"---":rs>=70?"潔い引退型":rs<=30?"燃え尽き型":"普通型";
  const willLabel=(w)=>w>=70?"引退意欲：高":w>=40?"引退意欲：中":"引退意欲：低";

  const handleRetain=(p)=>{
    const success=Math.random()*100>(p.retireStyle||50);
    setResults(prev=>({...prev,[p.id]:success?"retained":"retain_failed"}));
  };
  const handleAccept=(p)=>{
    setResults(prev=>({...prev,[p.id]:"accepted"}));
  };

  const needsAction=candidates.filter(p=>calcRetireWill(p)>=30);
  const allDone=needsAction.every(p=>results[p.id]);

  // onNextに引退確定選手のIDセットを渡す
  const handleNext=()=>{
    const decisions={};
    Object.entries(results).forEach(function(e){decisions[e[0]]=e[1];});
    onNext(decisions);
  };

  return(
    <div className="app">
      <div style={{padding:"16px 14px 0"}}>
        <div style={{fontSize:11,color:"#94a3b8",letterSpacing:".1em",marginBottom:4}}>OFFSEASON</div>
        <div style={{fontSize:20,fontWeight:700,color:"#f5c842",marginBottom:16}}>⚾ 引退フェーズ — {year}年</div>
        {candidates.length===0&&(
          <div className="card" style={{textAlign:"center",padding:"32px 16px"}}>
            <div style={{fontSize:32,marginBottom:8}}>✅</div>
            <div style={{fontSize:13,color:"#94a3b8"}}>引退候補の選手はいません</div>
            <button className="btn btn-gold" style={{marginTop:16,padding:"10px 32px"}} onClick={()=>onNext({})}>次へ（戦力外フェーズ）→</button>
          </div>
        )}
        {candidates.map(p=>{
          const will=calcRetireWill(p);
          const res=results[p.id];
          const willColor=will>=70?"#f87171":will>=40?"#f5c842":"#34d399";
          return(
            <div key={p.id} className="card" style={{marginBottom:10}}>
              <div className="fsb" style={{marginBottom:4}}>
                <div>
                  <span style={{fontWeight:700,fontSize:14}}>{p.name}</span>
                  <span style={{fontSize:11,color:"#94a3b8",marginLeft:8}}>{p.age}歳 / {p.pos}</span>
                </div>
                <span style={{fontSize:10,color:"#a78bfa"}}>{rsLabel(p.retireStyle)}</span>
              </div>
              <div style={{fontSize:10,color:willColor,marginBottom:8}}>{willLabel(will)}</div>
              {will>=30&&!res&&(
                <div style={{display:"flex",gap:6}}>
                  <button className="bsm btn-gold" style={{flex:1,padding:"7px 0"}} onClick={()=>handleRetain(p)}>引き留める</button>
                  <button className="bsm bgr" style={{flex:1,padding:"7px 0"}} onClick={()=>handleAccept(p)}>引退を受け入れる</button>
                </div>
              )}
              {res==="retained"&&(
                <div style={{padding:"8px 10px",background:"rgba(52,211,153,.08)",borderRadius:6,fontSize:11,color:"#34d399"}}>
                  ✅ 引き留め成功！来季も続投します
                </div>
              )}
              {res==="retain_failed"&&(
                <div style={{padding:"8px 10px",background:"rgba(248,113,113,.08)",borderRadius:6,fontSize:11,color:"#f87171"}}>
                  ❌ 引き留め失敗…引退を決意しました
                </div>
              )}
              {res==="accepted"&&(
                <div style={{padding:"8px 10px",background:"rgba(148,163,184,.08)",borderRadius:6,fontSize:11,color:"#94a3b8"}}>
                  👋 引退を受け入れました。お疲れ様でした
                </div>
              )}
              {will<30&&(
                <div style={{fontSize:10,color:"#34d399"}}>現役続行意欲あり — 対応不要</div>
              )}
            </div>
          );
        })}
        {candidates.length>0&&(
          <button className="btn btn-gold" style={{width:"100%",padding:"12px 0",marginTop:8,opacity:allDone?1:0.5}} onClick={()=>{if(allDone)handleNext();}}>
            戦力外フェーズへ →
          </button>
        )}
      </div>
    </div>
  );
}
/* ═══════════════════════════════════════════════
   WAIVER PHASE SCREEN
═══════════════════════════════════════════════ */

export function WaiverPhaseScreen({teams,myId,year,onRelease,onNext}){
  const myTeam=teams.find(t=>t.id===myId);
  const [marked,setMarked]=useState([]);
  const toggle=(pid)=>setMarked(prev=>prev.includes(pid)?prev.filter(x=>x!==pid):[...prev,pid]);
  const candidates=myTeam.players.filter(p=>p.contractYearsLeft<=1&&!p.isRetired);
  const others=myTeam.players.filter(p=>p.contractYearsLeft>1&&!p.isRetired);
  return(
    <div className="app">
      <div style={{padding:"16px 14px 0"}}>
        <div style={{fontSize:11,color:"#94a3b8",letterSpacing:".1em",marginBottom:4}}>OFFSEASON</div>
        <div style={{fontSize:20,fontWeight:700,color:"#f5c842",marginBottom:4}}>✂️ 戦力外フェーズ — {year}年</div>
        <div style={{fontSize:11,color:"#94a3b8",marginBottom:16}}>契約満了・戦力外通告の処遇を決定してください。通告後は他球団と自由に交渉できる自由契約選手になります。</div>
        <div className="card" style={{marginBottom:10}}>
          <div className="card-h">契約満了・最終年選手（{candidates.length}人）</div>
          {candidates.length===0&&<div style={{fontSize:11,color:"#374151"}}>対象選手なし</div>}
          {candidates.map(p=>(
            <div key={p.id} className="fsb" style={{padding:"6px 0",borderBottom:"1px solid rgba(255,255,255,.04)"}}>
              <div>
                <span style={{fontSize:12,fontWeight:700}}>{p.name}</span>
                <span style={{fontSize:10,color:"#374151",marginLeft:6}}>{p.pos} / {p.age}歳</span>
                <span style={{fontSize:9,color:p.contractYearsLeft===0?"#f87171":"#94a3b8",marginLeft:6}}>{p.contractYearsLeft===0?"満了":"最終年"}</span>
              </div>
              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                <span style={{fontSize:10,color:"#f5c842"}}>{fmtSal(p.salary)}/年</span>
                <button className={"bsm "+(marked.includes(p.id)?"bgr":"bga")} onClick={()=>toggle(p.id)}>
                  {marked.includes(p.id)?"✓ 戦力外":"戦力外"}
                </button>
              </div>
            </div>
          ))}
        </div>
        {marked.length>0&&(
          <div className="card" style={{marginBottom:10,background:"rgba(248,113,113,.06)"}}>
            <div style={{fontSize:11,color:"#f87171",marginBottom:6}}>⚠️ 戦力外通告 {marked.length}人</div>
            {marked.map(pid=>{const p=myTeam.players.find(x=>x.id===pid);return p?(
              <div key={pid} style={{fontSize:11,color:"#94a3b8",padding:"2px 0"}}>{p.name}（{p.pos}/{p.age}歳）</div>
            ):null;})}
          </div>
        )}
        <button className="btn btn-gold" style={{width:"100%",padding:"12px 0",marginTop:8}} onClick={()=>onNext(marked)}>
          自由契約処理へ →
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   WAIVER RESULT SCREEN
   戦力外通告後の自由契約結果を表示
═══════════════════════════════════════════════ */
export function WaiverResultScreen({results,year,onNext}){
  const {claimed=[],unclaimed=[]}=results||{};
  return(
    <div className="app">
      <div style={{padding:"16px 14px 0"}}>
        <div style={{fontSize:11,color:"#94a3b8",letterSpacing:".1em",marginBottom:4}}>OFFSEASON</div>
        <div style={{fontSize:20,fontWeight:700,color:"#f5c842",marginBottom:4}}>📋 自由契約結果 — {year}年</div>
        <div style={{fontSize:11,color:"#94a3b8",marginBottom:16}}>戦力外通告選手の自由契約後の動向</div>
        {claimed.length>0&&(
          <div className="card" style={{marginBottom:10,background:"rgba(52,211,153,.05)",border:"1px solid rgba(52,211,153,.2)"}}>
            <div className="card-h" style={{color:"#34d399"}}>✅ 他球団へ入団（{claimed.length}人）</div>
            {claimed.map(({player:p,teamName,teamEmoji},i)=>(
              <div key={p.id} className="fsb" style={{padding:"6px 0",borderBottom:"1px solid rgba(255,255,255,.04)"}}>
                <div>
                  <span style={{fontWeight:700,fontSize:12}}>{p.name}</span>
                  <span style={{fontSize:10,color:"#94a3b8",marginLeft:6}}>{p.pos} / {p.age}歳</span>
                </div>
                <div style={{fontSize:11,color:"#34d399"}}>{teamEmoji} {teamName}へ</div>
              </div>
            ))}
          </div>
        )}
        {unclaimed.length>0&&(
          <div className="card" style={{marginBottom:10}}>
            <div className="card-h" style={{color:"#94a3b8"}}>🔓 自由契約（{unclaimed.length}人）</div>
            <div style={{fontSize:10,color:"#94a3b8",marginBottom:8}}>自由契約としてFA市場に残ります</div>
            {unclaimed.map(p=>(
              <div key={p.id} className="fsb" style={{padding:"5px 0",borderBottom:"1px solid rgba(255,255,255,.04)"}}>
                <div>
                  <span style={{fontSize:12,color:"#94a3b8"}}>{p.name}</span>
                  <span style={{fontSize:10,color:"#4b5563",marginLeft:6}}>{p.pos} / {p.age}歳</span>
                </div>
                <span style={{fontSize:10,color:"#4b5563"}}>{fmtSal(p.salary)}/年 → 自由契約</span>
              </div>
            ))}
          </div>
        )}
        {claimed.length===0&&unclaimed.length===0&&(
          <div className="card" style={{textAlign:"center",padding:"24px 16px",marginBottom:10}}>
            <div style={{fontSize:11,color:"#94a3b8"}}>戦力外通告の対象選手はいませんでした</div>
          </div>
        )}
        <button className="btn btn-gold" style={{width:"100%",padding:"12px 0",marginTop:8}} onClick={onNext}>
          ドラフトへ →
        </button>
      </div>
    </div>
  );
}


/* ═══════════════════════════════════════════════
   GROWTH SUMMARY SCREEN
   年度末の成長・劣化レポート
═══════════════════════════════════════════════ */

export function GrowthSummaryScreen({ summary, year, onNext }) {
  const { breakout = [], growth = [], decline = [] } = summary || {};
  const hasAny = breakout.length + growth.length + decline.length > 0;
  // 33歳以上の主力選手で衰退した選手を警告対象に
  const declineWarnings = decline.filter(item => item.p?.age >= 33 && Math.abs(item.diff) >= 5);
  return (
    <div className="app">
      <div style={{ padding: "16px 14px 0" }}>
        <div style={{ fontSize: 11, color: "#94a3b8", letterSpacing: ".1em", marginBottom: 4 }}>OFFSEASON</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#f5c842", marginBottom: 4 }}>📈 選手成長レポート — {year}年</div>
        <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 16 }}>今シーズン終了後の能力値変化です</div>

        {breakout.length > 0 && (
          <div className="card" style={{ marginBottom: 10, background: "rgba(251,191,36,.06)", border: "1px solid rgba(251,191,36,.2)" }}>
            <div className="card-h" style={{ color: "#f5c842" }}>🔥 ブレイクアウト</div>
            {breakout.map((item, i) => (
              <div key={i} style={{ fontSize: 12, padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                <span style={{ fontWeight: 700, color: "#e0d4bf" }}>{item.p.name}</span>
                <span style={{ fontSize: 10, color: "#94a3b8", marginLeft: 6 }}>{item.p.age}歳</span>
                <span style={{ fontSize: 11, color: "#f5c842", marginLeft: 8 }}>+{item.diff}pt 急成長</span>
              </div>
            ))}
          </div>
        )}

        {growth.length > 0 && (
          <div className="card" style={{ marginBottom: 10 }}>
            <div className="card-h" style={{ color: "#34d399" }}>📈 成長</div>
            {growth.map((item, i) => (
              <div key={i} style={{ fontSize: 11, padding: "3px 0", borderBottom: "1px solid rgba(255,255,255,.04)", display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#e0d4bf" }}>{item.p.name} <span style={{ color: "#94a3b8", fontSize: 10 }}>{item.p.age}歳</span></span>
                <span style={{ color: "#34d399" }}>+{item.diff}pt</span>
              </div>
            ))}
          </div>
        )}

        {decline.length > 0 && (
          <div className="card" style={{ marginBottom: 10 }}>
            <div className="card-h" style={{ color: "#f87171" }}>📉 下降</div>
            {decline.map((item, i) => (
              <div key={i} style={{ fontSize: 11, padding: "3px 0", borderBottom: "1px solid rgba(255,255,255,.04)", display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#94a3b8" }}>{item.p.name} <span style={{ fontSize: 10 }}>{item.p.age}歳</span></span>
                <span style={{ color: "#f87171" }}>{item.diff}pt</span>
              </div>
            ))}
          </div>
        )}

        {declineWarnings.length > 0 && (
          <div className="card" style={{ marginBottom: 10, background: "rgba(248,113,113,.06)", border: "1px solid rgba(248,113,113,.2)" }}>
            <div className="card-h" style={{ color: "#f87171" }}>⚠️ 衰退警告（33歳以上）</div>
            {declineWarnings.map((item, i) => (
              <div key={i} style={{ fontSize: 11, padding: "3px 0", borderBottom: "1px solid rgba(255,255,255,.04)", display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#e0d4bf" }}>{item.p.name} <span style={{ fontSize: 10, color: "#94a3b8" }}>{item.p.age}歳</span></span>
                <span style={{ color: "#f87171" }}>{item.diff}pt ⚠</span>
              </div>
            ))}
          </div>
        )}

        {!hasAny && (
          <div className="card" style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 12, color: "#374151" }}>今シーズンは大きな変化なし</div>
          </div>
        )}

        <button className="btn btn-gold" style={{ width: "100%", padding: "12px 0", marginTop: 8 }} onClick={onNext}>
          戦力外フェーズへ →
        </button>
      </div>
    </div>
  );
}


/* ═══════════════════════════════════════════════
   NEW SEASON SCREEN — 年度開幕インタースティシャル
═══════════════════════════════════════════════ */

const GOAL_DEFS = [
  { id: "champion", label: "日本一", desc: "日本シリーズ制覇を目指す", color: "#f5c842" },
  { id: "pennant", label: "ペナント優勝", desc: "リーグ1位・CS Final進出", color: "#60a5fa" },
  { id: "cs", label: "CS出場", desc: "リーグ上位3位以内に入る", color: "#34d399" },
  { id: "rebuild", label: "再建", desc: "借金なし・若手育成に専念", color: "#a78bfa" },
];

export function NewSeasonScreen({ year, info, developmentSummary, ownerGoal, onGoalSelect, onStart }) {
  const [selectedGoal, setSelectedGoal] = useState(ownerGoal || "cs");
  const retiredNames = info?.retiredNames || [];
  const draftCount = info?.draftCount || 0;
  const draftNames = info?.draftNames || [];
  const breakout = developmentSummary?.breakout || [];
  const topBreakout = breakout.slice(0, 3);

  return (
    <div className="app">
      <div style={{ padding: "24px 16px 0", display: "flex", flexDirection: "column", gap: 14 }}>
        {/* 年度バナー */}
        <div style={{ textAlign: "center", paddingBottom: 8 }}>
          <div style={{ fontSize: 11, color: "#94a3b8", letterSpacing: ".2em", marginBottom: 6 }}>SEASON START</div>
          <div style={{ fontFamily: "'Bebas Neue',cursive", fontSize: 48, color: "#f5c842", letterSpacing: ".1em", lineHeight: 1 }}>
            {year}
          </div>
          <div style={{ fontSize: 13, color: "#e0d4bf", marginTop: 4, letterSpacing: ".1em" }}>年シーズン 開幕</div>
        </div>

        {/* オフシーズンサマリー */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div className="card" style={{ textAlign: "center" }}>
            <div style={{ fontSize: 9, color: "#94a3b8", letterSpacing: ".1em", marginBottom: 4 }}>引退選手</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#f87171" }}>{retiredNames.length}</div>
            <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>名</div>
          </div>
          <div className="card" style={{ textAlign: "center" }}>
            <div style={{ fontSize: 9, color: "#94a3b8", letterSpacing: ".1em", marginBottom: 4 }}>ドラフト指名</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#60a5fa" }}>{draftCount}</div>
            <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>名</div>
          </div>
        </div>

        {/* 引退選手リスト */}
        {retiredNames.length > 0 && (
          <div className="card">
            <div className="card-h" style={{ color: "#f87171" }}>⬛ 引退</div>
            <div style={{ fontSize: 11, color: "#94a3b8" }}>{retiredNames.join("、")}</div>
          </div>
        )}

        {/* ドラフト新入団 */}
        {draftCount > 0 && (
          <div className="card">
            <div className="card-h" style={{ color: "#60a5fa" }}>⭐ ドラフト入団</div>
            <div style={{ fontSize: 11, color: "#94a3b8" }}>
              {draftNames.length > 0 ? draftNames.join("、") : ""}
              {draftCount > draftNames.length ? `ほか${draftCount - draftNames.length}名` : ""}
            </div>
          </div>
        )}

        {/* ブレイクスルー */}
        {topBreakout.length > 0 && (
          <div className="card" style={{ background: "rgba(251,191,36,.06)", border: "1px solid rgba(251,191,36,.2)" }}>
            <div className="card-h" style={{ color: "#f5c842" }}>⚡ ブレイクスルー</div>
            {topBreakout.map((item, i) => (
              <div key={i} style={{ fontSize: 11, padding: "3px 0", borderBottom: "1px solid rgba(255,255,255,.04)", display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#e0d4bf" }}>{item.p.name} <span style={{ fontSize: 10, color: "#94a3b8" }}>{item.p.age}歳</span></span>
                <span style={{ color: "#f5c842" }}>+{item.diff}pt</span>
              </div>
            ))}
          </div>
        )}

        {/* 今季オーナー目標 */}
        <div className="card" style={{ background: "rgba(245,200,66,.04)", border: "1px solid rgba(245,200,66,.15)" }}>
          <div className="card-h" style={{ color: "#f5c842" }}>🎯 今季オーナー目標を設定</div>
          <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 8 }}>目標の達成・未達でオーナー信頼度が変動し、翌年の予算に影響します</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {GOAL_DEFS.map(g => (
              <button key={g.id}
                onClick={() => setSelectedGoal(g.id)}
                style={{
                  background: selectedGoal === g.id ? `${g.color}18` : "rgba(255,255,255,.03)",
                  border: `1px solid ${selectedGoal === g.id ? g.color : "rgba(255,255,255,.08)"}`,
                  borderRadius: 6, padding: "8px 10px", cursor: "pointer", textAlign: "left",
                  transition: ".15s",
                }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: selectedGoal === g.id ? g.color : "#e5e7eb", marginBottom: 2 }}>{g.label}</div>
                <div style={{ fontSize: 10, color: "#6b7280" }}>{g.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <button
          className="btn btn-gold"
          style={{ width: "100%", padding: "16px 0", fontSize: 16, fontWeight: 700, marginTop: 8, letterSpacing: ".1em" }}
          onClick={() => { if (onGoalSelect) onGoalSelect(selectedGoal); onStart(); }}
        >
          ⚾ 開幕！
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────
   SPRING TRAINING SCREEN
───────────────────────────────────────────────── */

function campEventIcon(type) {
  if (type === "breakout") return "🔥";
  if (type === "struggle") return "❄️";
  if (type === "battle") return "⚔️";
  return "📋";
}

function campEventText(ev) {
  if (ev.type === "breakout")
    return `${ev.playerName}（${ev.pos}・${ev.age}歳）がキャンプで台頭、コンディション+${ev.delta}`;
  if (ev.type === "struggle")
    return `${ev.playerName}（${ev.pos}・${ev.age}歳）が調整遅れ、コンディション${ev.delta}`;
  if (ev.type === "battle")
    return `${ev.pos}争いは${ev.winner}が優位に。${ev.loser}は競争を続ける`;
  return "";
}

function playerOv(p) {
  if (!p) return 0;
  if (p.isPitcher) return Math.round(((p.pitching?.velocity || 50) + (p.pitching?.control || 50) + (p.pitching?.breaking || 50)) / 3);
  return Math.round(((p.batting?.contact || 50) + (p.batting?.power || 50) + (p.batting?.eye || 50) + (p.batting?.speed || 50)) / 4);
}

function CondBar({ old: oldC, next: newC }) {
  const delta = newC - oldC;
  const color = delta > 0 ? "#34d399" : delta < 0 ? "#f87171" : "#94a3b8";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
      <span style={{ color: "#94a3b8", minWidth: 24, textAlign: "right" }}>{oldC}</span>
      <span style={{ color: "#374151" }}>→</span>
      <span style={{ color, fontWeight: 700, minWidth: 24 }}>{newC}</span>
      {delta !== 0 && <span style={{ color, fontSize: 10 }}>({delta > 0 ? "+" : ""}{delta})</span>}
    </div>
  );
}

function PlayerCompareCard({ p, highlightWinner }) {
  const ov = playerOv(p);
  const s = p.stats || {};
  const bg = highlightWinner ? "rgba(52,211,153,.06)" : "rgba(255,255,255,.03)";
  const border = highlightWinner ? "1px solid rgba(52,211,153,.25)" : "1px solid rgba(255,255,255,.06)";
  return (
    <div style={{ flex: 1, borderRadius: 8, padding: "10px 12px", background: bg, border }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, color: "#e0d4bf" }}>
            {p.name}
            {p.isPitcher && <HandBadge p={p} />}
          </div>
          <div style={{ fontSize: 10, color: "#64748b" }}>{p.age}歳</div>
        </div>
        <OV v={ov} />
      </div>
      <div style={{ marginBottom: 6 }}>
        <CondBadge p={p} />
        <span style={{ fontSize: 10, color: "#94a3b8", marginLeft: 6 }}>
          → <span style={{ color: p.condChange >= 0 ? "#34d399" : "#f87171", fontWeight: 700 }}>{p.newCond}</span>
          {p.condChange !== 0 && <span style={{ color: p.condChange > 0 ? "#34d399" : "#f87171" }}> ({p.condChange > 0 ? "+" : ""}{p.condChange})</span>}
        </span>
      </div>
      {p.isPitcher ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4, fontSize: 10, color: "#94a3b8" }}>
          <div>W <span style={{ color: "#e0d4bf" }}>{s.W ?? 0}</span></div>
          <div>防御率 <span style={{ color: "#e0d4bf" }}>{s.IP ? ((s.ER ?? 0) / (s.IP / 9)).toFixed(2) : "-.--"}</span></div>
          <div>K <span style={{ color: "#e0d4bf" }}>{s.Kp ?? 0}</span></div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4, fontSize: 10, color: "#94a3b8" }}>
          <div>打率 <span style={{ color: "#e0d4bf" }}>{fmtAvg(s.AB ? s.H / s.AB : 0)}</span></div>
          <div>HR <span style={{ color: "#e0d4bf" }}>{s.HR ?? 0}</span></div>
          <div>打点 <span style={{ color: "#e0d4bf" }}>{s.RBI ?? 0}</span></div>
        </div>
      )}
      {highlightWinner && <div style={{ fontSize: 9, color: "#34d399", marginTop: 4 }}>◎ 開幕優勢</div>}
    </div>
  );
}

export function SpringTrainingScreen({ year, myTeam, springData, onComplete }) {
  const [tab, setTab] = useState("report");
  const { campEvents = [], conditionChanges = [], rosterBattles = [] } = springData || {};

  const condSorted = [...conditionChanges].sort((a, b) => b.delta - a.delta);
  const improved = condSorted.filter(c => c.delta > 0);
  const declined = condSorted.filter(c => c.delta < 0);

  return (
    <div className="app">
      <div style={{ maxWidth: 700, margin: "0 auto", padding: "16px 12px" }}>
        {/* ヘッダー */}
        <div style={{ textAlign: "center", marginBottom: 14 }}>
          <div style={{ fontFamily: "'Bebas Neue',cursive", fontSize: 36, color: "#34d399", letterSpacing: ".05em" }}>
            ⚾ {year}年 スプリングトレーニング
          </div>
          <div style={{ fontSize: 11, color: "#374151" }}>{myTeam?.name} — キャンプ最終報告</div>
        </div>

        {/* タブ */}
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          {[["report", "📋 キャンプレポート"], ["cond", "❤️ コンディション"], ["compare", "⚔️ 選手比較"]].map(([k, l]) => (
            <button key={k} className={"bsm " + (tab === k ? "bgb" : "bga")} style={{ flex: 1, padding: "7px 0", fontSize: 11 }} onClick={() => setTab(k)}>
              {l}
            </button>
          ))}
        </div>

        {/* キャンプレポートタブ */}
        {tab === "report" && (
          <>
            <div className="card" style={{ marginBottom: 10 }}>
              <div className="card-h">📅 キャンプ期間終了</div>
              <p style={{ color: "#94a3b8", fontSize: 12, margin: "4px 0" }}>
                全選手がキャンプを終え、開幕ロースターが固まりつつある。
                チームの状態を確認して最終的な編成を整えよう。
              </p>
            </div>
            {campEvents.length === 0 && (
              <div className="card"><div style={{ color: "#64748b", fontSize: 12 }}>特筆すべきイベントなし</div></div>
            )}
            {campEvents.map((ev, i) => (
              <div key={i} className="card" style={{
                marginBottom: 8,
                background: ev.type === "breakout" ? "rgba(52,211,153,.05)" : ev.type === "struggle" ? "rgba(248,113,113,.05)" : "rgba(96,165,250,.05)",
                border: `1px solid ${ev.type === "breakout" ? "rgba(52,211,153,.2)" : ev.type === "struggle" ? "rgba(248,113,113,.2)" : "rgba(96,165,250,.2)"}`,
              }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <span style={{ fontSize: 20 }}>{campEventIcon(ev.type)}</span>
                  <div>
                    <div style={{ fontSize: 12, color: "#e0d4bf", lineHeight: 1.6 }}>{campEventText(ev)}</div>
                    <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>
                      {ev.type === "breakout" ? "キャンプ台頭" : ev.type === "struggle" ? "調整遅れ" : "ポジション競争"}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </>
        )}

        {/* コンディションタブ */}
        {tab === "cond" && (
          <>
            {improved.length > 0 && (
              <div className="card" style={{ marginBottom: 10, background: "rgba(52,211,153,.04)", border: "1px solid rgba(52,211,153,.15)" }}>
                <div className="card-h" style={{ color: "#34d399" }}>↑ 状態上昇</div>
                {improved.map(c => (
                  <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                    <div style={{ fontSize: 12 }}>
                      <span style={{ color: "#e0d4bf", fontWeight: 600 }}>{c.name}</span>
                      <span style={{ color: "#64748b", fontSize: 10, marginLeft: 6 }}>{c.pos}・{c.age}歳</span>
                    </div>
                    <CondBar old={c.oldCond} next={c.newCond} />
                  </div>
                ))}
              </div>
            )}
            {declined.length > 0 && (
              <div className="card" style={{ marginBottom: 10, background: "rgba(248,113,113,.04)", border: "1px solid rgba(248,113,113,.15)" }}>
                <div className="card-h" style={{ color: "#f87171" }}>↓ 状態低下</div>
                {declined.map(c => (
                  <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                    <div style={{ fontSize: 12 }}>
                      <span style={{ color: "#e0d4bf", fontWeight: 600 }}>{c.name}</span>
                      <span style={{ color: "#64748b", fontSize: 10, marginLeft: 6 }}>{c.pos}・{c.age}歳</span>
                    </div>
                    <CondBar old={c.oldCond} next={c.newCond} />
                  </div>
                ))}
              </div>
            )}
            {improved.length === 0 && declined.length === 0 && (
              <div className="card"><div style={{ color: "#64748b", fontSize: 12 }}>コンディション変動なし</div></div>
            )}
          </>
        )}

        {/* 選手比較タブ */}
        {tab === "compare" && (
          <>
            {rosterBattles.length === 0 && (
              <div className="card"><div style={{ color: "#64748b", fontSize: 12 }}>ポジション競争なし（各ポジション1名）</div></div>
            )}
            {rosterBattles.map(({ pos, competitors }) => {
              const sorted = [...competitors].sort((a, b) => b.newCond - a.newCond);
              return (
                <div key={pos} className="card" style={{ marginBottom: 10 }}>
                  <div className="card-h">{pos} 争い</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {sorted.slice(0, 3).map((p, i) => (
                      <PlayerCompareCard key={p.id} p={p} highlightWinner={i === 0} />
                    ))}
                  </div>
                </div>
              );
            })}
          </>
        )}

        {/* キャンプ終了ボタン */}
        <button
          className="btn btn-gold"
          style={{ width: "100%", padding: "16px 0", fontSize: 16, fontWeight: 700, marginTop: 12, letterSpacing: ".1em" }}
          onClick={onComplete}
        >
          ⚾ キャンプ終了・開幕へ
        </button>
        <div style={{ textAlign: "center", marginTop: 6 }}>
          <button
            style={{ background: "none", border: "none", color: "#64748b", fontSize: 11, cursor: "pointer", padding: "4px 8px" }}
            onClick={onComplete}
          >
            スキップして開幕
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   CONTRACT RENEWAL PHASE SCREEN
   オフシーズン契約更改フェーズ: 対話形式で交渉
═══════════════════════════════════════════════ */

function buildAcceptText(sal) {
  const opts = [
    `「わかりました。${fmtSal(sal)}でお願いします。」`,
    `「その条件で契約させていただきます。」`,
    `「ありがとうございます。チームの期待に応えます。」`,
  ];
  return opts[Math.floor(Math.random() * opts.length)];
}

function buildCounterText(offered, counter) {
  return `「${fmtSal(offered)}では少し...${fmtSal(counter)}であれば前向きに考えます。」`;
}

function buildFaDeclareText() {
  return `「FA権を行使し、市場に出ることにします。お世話になりました。」`;
}

function buildFinalRejectText() {
  return `「申し訳ありませんが、この条件での更改は難しいです。」`;
}

function buildRetryText() {
  return `「一度持ち帰って検討します。日を改めてお話ししましょう。」`;
}

function calcCounterOffer(offered, demand, round) {
  const safeOffered = Number.isFinite(Number(offered)) ? Math.max(0, Math.round(Number(offered))) : 0;
  const safeDemand = Number.isFinite(Number(demand)) ? Math.max(0, Math.round(Number(demand))) : 0;
  const ratio = round === 1 ? 0.95 : 1.0;
  const demandBasedCounter = Math.round((safeDemand * ratio) / 100) * 100;
  // 提示済み金額より低い逆提案を防止する（最低+100万円）
  const floorFromOffer = safeOffered + 100;
  return Math.max(floorFromOffer, demandBasedCounter);
}

export function ContractRenewalPhaseScreen({ teams, myId, year, demands, onSign, onRelease, onNext }) {
  const myTeam = teams?.find(t => t.id === myId);
  const expiringPlayers = (myTeam?.players || []).filter(p => (p.contractYearsLeft ?? 99) <= 1 && !p.isRetired && !p._retireNow);

  const [selectedId, setSelectedId] = useState(null);
  const [offerSal, setOfferSal] = useState(0);
  const [offerYrs, setOfferYrs] = useState(1);
  const [dialogLogs, setDialogLogs] = useState({});
  const [settled, setSettled] = useState({});
  const [retryCount, setRetryCount] = useState({});

  const selectedPlayer = expiringPlayers.find(p => p.id === selectedId);
  const selectedDemand = selectedId ? (demands?.[selectedId] || {}) : {};

  const appendLog = (pid, entry) => {
    setDialogLogs(prev => ({ ...prev, [pid]: [...(prev[pid] || []), entry] }));
  };

  const handleSelect = (p) => {
    setSelectedId(p.id);
    const d = demands?.[p.id];
    setOfferSal(d?.demandSalary || p.salary);
    setOfferYrs(1);
  };

  const handleDialogOffer = () => {
    if (!selectedPlayer) return;
    const sanitizedOfferSal = Number.isFinite(Number(offerSal)) ? Math.round(Number(offerSal)) : 0;
    if (sanitizedOfferSal <= 0) return;
    const p = selectedPlayer;
    const { demandSalary = p.salary, minAcceptSalary = Math.round(p.salary * 0.6), resistanceFactor = 0.5 } = selectedDemand;
    const logs = dialogLogs[p.id] || [];
    const round = logs.filter(l => l.from === 'team').length + 1;

    appendLog(p.id, { from: 'team', text: `「${fmtSal(sanitizedOfferSal)}、${offerYrs}年ではいかがでしょうか？」`, salary: sanitizedOfferSal, years: offerYrs });

    if (settled[p.id]) return;

    const isDemandMet = sanitizedOfferSal >= demandSalary && offerYrs >= 1;
    const score = evalOffer(p, { salary: sanitizedOfferSal, years: offerYrs }, myTeam, teams).total;
    const acceptScore = round === 1
      ? ACCEPT_THRESHOLD + Math.round(resistanceFactor * 20)
      : ACCEPT_THRESHOLD;

    if (isDemandMet || score >= acceptScore) {
      const moraleDelta = sanitizedOfferSal >= demandSalary ? NEGOTIATION_MORALE_ACCEPT_BONUS
                        : sanitizedOfferSal < p.salary * 0.90 ? NEGOTIATION_MORALE_CUT_PENALTY : 0;
      const extraRounds = Math.max(0, round - 1);
      const finalMorale = clamp(moraleDelta + NEGOTIATION_MORALE_ROUND_HIT * extraRounds, -30, 10);
      const trustDelta  = round === 1 ? NEGOTIATION_TRUST_HAPPY : NEGOTIATION_TRUST_HOLDOUT;
      appendLog(p.id, { from: 'player', text: buildAcceptText(sanitizedOfferSal), accepted: true });
      setSettled(prev => ({ ...prev, [p.id]: 'signed' }));
      onSign(p.id, sanitizedOfferSal, offerYrs, finalMorale, trustDelta);
    } else if (round >= CPU_RENEWAL_ROUNDS) {
      const threshold = getFaThreshold(p);
      const days = p.daysOnActiveRoster ?? (p.serviceYears ?? 0) * 120;
      const isFA = days >= threshold.domestic;
      if (isFA) {
        appendLog(p.id, { from: 'player', text: buildFaDeclareText(), accepted: false });
        setSettled(prev => ({ ...prev, [p.id]: 'fa' }));
      } else {
        appendLog(p.id, { from: 'player', text: buildFinalRejectText(), accepted: false });
        appendLog(p.id, { from: 'player', text: buildRetryText(), accepted: false });
        setSettled(prev => ({ ...prev, [p.id]: 'cooldown' }));
      }
    } else {
      const counter = Math.max(minAcceptSalary, calcCounterOffer(sanitizedOfferSal, demandSalary, round));
      appendLog(p.id, { from: 'player', text: buildCounterText(sanitizedOfferSal, counter) });
      setOfferSal(counter);
    }
  };

  const canAdvance = expiringPlayers.every(p => {
    const status = settled[p.id];
    return status && status !== 'cooldown';
  });

  const handleRetryNegotiation = (player) => {
    if (!player) return;
    setRetryCount(prev => ({ ...prev, [player.id]: (prev[player.id] || 0) + 1 }));
    setSettled(prev => ({ ...prev, [player.id]: undefined }));
    setDialogLogs(prev => ({ ...prev, [player.id]: [] }));
    const d = demands?.[player.id];
    const nextOffer = Math.max(Math.round((d?.minAcceptSalary || player.salary * 0.6)), Math.round((d?.demandSalary || player.salary) * 0.95));
    setOfferSal(nextOffer);
  };

  const statusBadge = (p) => {
    const s = settled[p.id];
    if (s === 'signed')   return <span style={{ color: '#16a34a', fontWeight: 700 }}>✅ 合意</span>;
    if (s === 'fa')       return <span style={{ color: '#7c3aed', fontWeight: 700 }}>🚪 FA宣言</span>;
    if (s === 'cooldown') return <span style={{ color: '#f59e0b', fontWeight: 700 }}>⏳ 再交渉待ち</span>;
    if (s === 'released') return <span style={{ color: '#6b7280', fontWeight: 700 }}>📋 戦力外</span>;
    if ((dialogLogs[p.id] || []).length > 0) return <span style={{ color: '#d97706', fontWeight: 700 }}>💬 交渉中</span>;
    return <span style={{ color: '#6b7280' }}>📩 未交渉</span>;
  };

  return (
    <div className="app" style={{ padding: '16px 0', display: 'flex', flexDirection: 'column', height: '100vh', boxSizing: 'border-box' }}>
      <div style={{ padding: '0 16px 12px', borderBottom: '1px solid #e5e7eb' }}>
        <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 26, color: '#f5c842', letterSpacing: '.1em' }}>
          契約更改フェーズ
        </div>
        <div style={{ fontSize: 12, color: '#6b7280' }}>{year}年オフシーズン — 満了選手と年俸交渉を行ってください</div>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* 左: 選手リスト */}
        <div style={{ width: 200, borderRight: '1px solid #e5e7eb', overflowY: 'auto', padding: '8px 0', flexShrink: 0 }}>
          {expiringPlayers.length === 0 && (
            <div style={{ padding: '16px', color: '#6b7280', fontSize: 12 }}>満了選手なし</div>
          )}
          {expiringPlayers.map(p => (
            <div
              key={p.id}
              onClick={() => handleSelect(p)}
              style={{
                padding: '10px 12px',
                cursor: 'pointer',
                borderLeft: selectedId === p.id ? '3px solid #f5c842' : '3px solid transparent',
                background: selectedId === p.id ? '#fefce8' : 'transparent',
                borderBottom: '1px solid #f3f4f6',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 13 }}>{p.name}</div>
              <div style={{ fontSize: 11, color: '#6b7280' }}>{p.pos} {p.age}歳 / {fmtSal(p.salary)}</div>
              <div style={{ fontSize: 11, marginTop: 3 }}>{statusBadge(p)}</div>
              {settled[p.id] === 'cooldown' && (
                <button
                  onClick={(e) => { e.stopPropagation(); setSettled(prev => ({ ...prev, [p.id]: 'released' })); onRelease(p.id); }}
                  style={{ marginTop: 4, fontSize: 10, padding: '2px 6px', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 3, cursor: 'pointer', color: '#dc2626' }}
                >
                  戦力外
                </button>
              )}
              {settled[p.id] === 'cooldown' && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleRetryNegotiation(p); }}
                  style={{ marginTop: 4, marginLeft: 4, fontSize: 10, padding: '2px 6px', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 3, cursor: 'pointer', color: '#b45309' }}
                >
                  再交渉
                </button>
              )}
            </div>
          ))}
        </div>

        {/* 右: 交渉ダイアログ */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
          {!selectedPlayer ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: '#9ca3af', fontSize: 14 }}>
              左の選手を選択して交渉を開始
            </div>
          ) : (
            <>
              <div style={{ padding: '10px 16px', borderBottom: '1px solid #e5e7eb', background: '#f9fafb', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                <div>
                  <span style={{ fontWeight: 700, fontSize: 15 }}>{selectedPlayer.name}</span>
                  <span style={{ fontSize: 12, color: '#6b7280', marginLeft: 8 }}>{selectedPlayer.pos} {selectedPlayer.age}歳</span>
                </div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>現年俸: {fmtSal(selectedPlayer.salary)}</div>
                <div style={{ fontSize: 12, color: '#d97706', fontWeight: 600 }}>
                  要求推定: {fmtSal(selectedDemand.demandSalary || selectedPlayer.salary)}
                </div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>
                  morale {Math.round(selectedPlayer.morale ?? 70)} / trust {Math.round(selectedPlayer.trust ?? 50)} / 再交渉 {retryCount[selectedPlayer.id] || 0} 回
                </div>
              </div>

              <div style={{ padding: '8px 16px', borderBottom: '1px solid #e5e7eb', background: '#fff' }}>
                {selectedPlayer.isPitcher ? (
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: '#334155' }}>
                    <span>能力: 球速 {selectedPlayer.pitching?.velocity ?? 50} / 制球 {selectedPlayer.pitching?.control ?? 50} / 変化 {selectedPlayer.pitching?.breaking ?? 50} / スタミナ {selectedPlayer.pitching?.stamina ?? 50}</span>
                    <span>成績: 防御率 {(selectedPlayer.stats?.IP || 0) > 0 ? (((selectedPlayer.stats?.ER || 0) / ((selectedPlayer.stats?.IP || 1) / 9)).toFixed(2)) : '-.--'} / 勝 {selectedPlayer.stats?.W || 0} / S {selectedPlayer.stats?.SV || 0}</span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: '#334155' }}>
                    <span>能力: ミート {selectedPlayer.batting?.contact ?? 50} / 長打 {selectedPlayer.batting?.power ?? 50} / 選球 {selectedPlayer.batting?.eye ?? 50} / 走力 {selectedPlayer.batting?.speed ?? 50}</span>
                    <span>成績: 打率 {(selectedPlayer.stats?.AB || 0) > 0 ? fmtAvg(selectedPlayer.stats?.H || 0, selectedPlayer.stats?.AB || 0) : '.---'} / 本塁打 {selectedPlayer.stats?.HR || 0} / 打点 {selectedPlayer.stats?.RBI || 0} / OPS {(((selectedPlayer.stats?.AB || 0) > 0) ? (((selectedPlayer.stats?.H || 0) + (selectedPlayer.stats?.BB || 0)) / ((selectedPlayer.stats?.AB || 0) + (selectedPlayer.stats?.BB || 0))) : 0).toFixed(3)}</span>
                  </div>
                )}
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(dialogLogs[selectedPlayer.id] || []).length === 0 && (
                  <div style={{ color: '#9ca3af', fontSize: 12, textAlign: 'center', marginTop: 32 }}>
                    下のフォームからオファーを出してください
                  </div>
                )}
                {(dialogLogs[selectedPlayer.id] || []).map((log, i) => (
                  <div key={i} style={{ display: 'flex', flexDirection: log.from === 'team' ? 'row-reverse' : 'row', gap: 8, alignItems: 'flex-start' }}>
                    <div style={{ fontSize: 18, flexShrink: 0 }}>{log.from === 'team' ? '💬' : '🧢'}</div>
                    <div style={{
                      background: log.from === 'team' ? '#1e3a5f' : '#f3f4f6',
                      color: log.from === 'team' ? '#fff' : '#111',
                      borderRadius: 10,
                      padding: '8px 12px',
                      maxWidth: '75%',
                      fontSize: 13,
                      lineHeight: 1.5,
                    }}>
                      <div style={{ fontSize: 10, color: log.from === 'team' ? '#93c5fd' : '#6b7280', marginBottom: 3 }}>
                        {log.from === 'team' ? myTeam?.name : `${selectedPlayer.name}（代理人）`}
                      </div>
                      {log.text}
                    </div>
                  </div>
                ))}
              </div>

              {!settled[selectedPlayer.id] && (
                <div style={{ borderTop: '1px solid #e5e7eb', padding: '12px 16px', background: '#f9fafb', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>年俸</span>
                  <input
                    type="number"
                    value={offerSal}
                    onChange={e => setOfferSal(Number(e.target.value))}
                    step={100}
                    min={selectedDemand.minAcceptSalary || 420}
                    style={{ width: 90, padding: '4px 6px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13, textAlign: 'right' }}
                  />
                  <span style={{ fontSize: 12 }}>万円</span>
                  <span style={{ fontSize: 12, color: '#6b7280', marginLeft: 8 }}>年数</span>
                  <select
                    value={offerYrs}
                    onChange={e => setOfferYrs(Number(e.target.value))}
                    style={{ padding: '4px 6px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13 }}
                  >
                    <option value={1}>1年</option>
                    <option value={2}>2年</option>
                    <option value={3}>3年</option>
                  </select>
                  <button className="btn btn-primary" onClick={handleDialogOffer} style={{ padding: '6px 16px', fontSize: 13 }}>
                    オファーを出す
                  </button>
                  <button
                    onClick={() => { setSettled(prev => ({ ...prev, [selectedPlayer.id]: 'released' })); onRelease(selectedPlayer.id); }}
                    style={{ padding: '6px 12px', fontSize: 12, background: 'none', border: '1px solid #fca5a5', borderRadius: 4, color: '#dc2626', cursor: 'pointer' }}
                  >
                    戦力外
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div style={{ padding: '12px 16px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 12, color: '#6b7280' }}>
          {expiringPlayers.filter(p => settled[p.id] === 'signed').length} / {expiringPlayers.length} 名と合意
          {!canAdvance && <span style={{ marginLeft: 8, color: '#d97706' }}>— 全選手に対応後に次フェーズへ進めます</span>}
        </div>
        <button
          className="btn btn-gold"
          onClick={() => {
            const faDeclaredPlayerIds = expiringPlayers
              .filter(p => settled[p.id] === "fa")
              .map(p => p.id);
            onNext(faDeclaredPlayerIds);
          }}
          disabled={!canAdvance}
          style={{ padding: '10px 24px', fontSize: 14, fontWeight: 700, opacity: canAdvance ? 1 : 0.4, cursor: canAdvance ? 'pointer' : 'not-allowed' }}
        >
          CPU交渉・次フェーズへ →
        </button>
      </div>
    </div>
  );
}
