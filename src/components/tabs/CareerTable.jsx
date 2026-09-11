import React, { useEffect, useState } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { fmtAvg, fmtIP } from '../../utils';
import { saberBatter, saberPitcher } from '../../engine/sabermetrics';
import { emptyStats } from '../../engine/playerCore';
import { mergeCareerLogWithCurrentSeason } from '../../engine/careerStats';

let careerSaveModulePromise = null;

function loadCareerSaveModule() {
  if (!careerSaveModulePromise) careerSaveModulePromise = import('../../engine/saveload');
  return careerSaveModulePromise;
}

export function CareerTable({player,year,teamId,teamName,includeCurrentSeason=true}){
  const [mode,setMode]=useState("regular");
  const [metricKey,setMetricKey]=useState(player.isPitcher?"ERA":"HR");
  const [log,setLog]=useState([]);
  const [isLoading,setIsLoading]=useState(true);

  useEffect(()=>{
    let alive=true;
    const load=async()=>{
      setIsLoading(true);
      try{
        const mod = await loadCareerSaveModule();
        const detailLog=await mod.loadPlayerCareerLogById(String(player?.id||""));
        const fallbackRecentLog = Array.isArray(player?.recentCareerLog) ? player.recentCareerLog : [];
        const nextLog = Array.isArray(detailLog) && detailLog.length > 0 ? detailLog : fallbackRecentLog;
        if(alive) setLog(nextLog);
      }catch(e){
        console.warn("careerLog詳細の読み込みに失敗しました:",e);
        const fallbackRecentLog = Array.isArray(player?.recentCareerLog) ? player.recentCareerLog : [];
        if(alive) setLog(fallbackRecentLog);
      }finally{
        if(alive) setIsLoading(false);
      }
    };
    load();
    return()=>{alive=false;};
  },[player?.id,player?.recentCareerLog]);

  if(isLoading) return <div style={{marginTop:8,fontSize:10,color:"#94a3b8"}}>成績を読み込み中...</div>;
  const displayLog=mergeCareerLogWithCurrentSeason(log,{
    include:includeCurrentSeason,
    year,
    teamId,
    teamName,
    stats:player?.stats,
    playoffStats:player?.playoffStats,
  });
  if(displayLog.length===0) return null;
  const hasPlayoff=displayLog.some(r=>{const ps=r.playoffStats||emptyStats();return ps.PA>0||ps.BF>0||ps.IP>0;});
  const ip=player.isPitcher;

  // 各年のデータ取得
  const getS=(row)=>mode==="playoff"?(row.playoffStats||emptyStats()):(row.stats||emptyStats());
  // compact形式では未保存の率指標も0になるため、正の実測値だけを保存値として扱う。
  // 実測0はカウント値から再計算しても0のままなので表示結果は変わらない。
  const hasStoredRate=(s,key)=>Number(s?.[key])>0;
  const batterRate=(s,key)=>hasStoredRate(s,key)?Number(s[key]):saberBatter(s)[key];
  const pitcherRate=(s,key)=>hasStoredRate(s,key)?Number(s[key]):saberPitcher(s)[key];

  // ⑥ キャリア推移グラフ用指標定義
  const BATTER_METRICS=[
    {key:"HR",  label:"本塁打", get:s=>s.HR,    isCount:true},
    {key:"RBI", label:"打点",   get:s=>s.RBI,   isCount:true},
    {key:"AVG", label:"打率",   get:s=>batterRate(s,"AVG")},
    {key:"OPS", label:"OPS",   get:s=>batterRate(s,"OPS")},
    {key:"wOBA",label:"wOBA",  get:s=>saberBatter(s).wOBA},
    {key:"WAR", label:"WAR",   get:s=>saberBatter(s).WAR},
  ];
  const PITCHER_METRICS=[
    {key:"ERA", label:"防御率", get:s=>pitcherRate(s,"ERA")},
    {key:"W",   label:"勝利",   get:s=>s.W,     isCount:true},
    {key:"WHIP",label:"WHIP",  get:s=>pitcherRate(s,"WHIP")},
    {key:"K",   label:"奪三振", get:s=>s.Kp,   isCount:true},
    {key:"FIP", label:"FIP",   get:s=>saberPitcher(s).FIP},
    {key:"WAR", label:"WAR",   get:s=>saberPitcher(s).WAR},
  ];
  const metrics=ip?PITCHER_METRICS:BATTER_METRICS;
  const activeMet=metrics.find(m=>m.key===metricKey)||metrics[0];
  const chartData=[...displayLog].map(row=>{const s=getS(row);return{year:row.year,value:activeMet.get(s)};});

  // 通算計算
  const sumK=(k)=>displayLog.reduce((a,r)=>a+(getS(r)[k]||0),0);
  const totals={PA:sumK("PA"),AB:sumK("AB"),H:sumK("H"),D:sumK("D"),T:sumK("T"),HR:sumK("HR"),RBI:sumK("RBI"),BB:sumK("BB"),K:sumK("K"),HBP:sumK("HBP"),SF:sumK("SF"),SH:sumK("SH"),SB:sumK("SB"),BF:sumK("BF"),W:sumK("W"),L:sumK("L"),SV:sumK("SV"),IP:sumK("IP"),Kp:sumK("Kp"),ER:sumK("ER"),BBp:sumK("BBp"),HBPp:sumK("HBPp"),Hp:sumK("Hp"),HRp:sumK("HRp")};
  const hasTotals=ip?(totals.BF>0||totals.IP>0):(totals.PA>0);
  const weightedRate=(key,weightKey,getFallback)=>{
    let weighted=0;let weightTotal=0;
    displayLog.forEach(row=>{const s=getS(row);const weight=Number(s?.[weightKey])||0;if(weight<=0)return;const rate=hasStoredRate(s,key)?Number(s[key]):getFallback(s);weighted+=rate*weight;weightTotal+=weight;});
    return weightTotal>0?weighted/weightTotal:0;
  };
  const totalOBP=weightedRate("OBP","PA",s=>saberBatter(s).OBP);
  const totalSLG=weightedRate("SLG","AB",s=>saberBatter(s).SLG);
  const totalOPS=totalOBP+totalSLG;
  const totalERA=weightedRate("ERA","IP",s=>saberPitcher(s).ERA);
  const totalWHIP=weightedRate("WHIP","IP",s=>saberPitcher(s).WHIP);

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
      {displayLog.length>=2&&(
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
              <tr><th>年度</th><th>チーム</th><th>防御率</th><th>勝</th><th>負</th><th>S</th><th>回</th><th>K</th><th>WHIP</th></tr>
            </thead>
            <tbody>
              {[...displayLog].reverse().map((row,ri)=>{
                const s=getS(row);
                if(mode==="playoff"&&s.BF===0&&s.IP===0) return null;
                return(
                  <tr key={row.year+"-p-"+ri}>
                    <td className="mono" style={{color:"#f5c842"}}>{row.year}</td>
                    <td className="mono" style={{color:"#94a3b8",maxWidth:60,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{row.teamName||""}</td>
                    <td className="mono">{pitcherRate(s,"ERA")}</td>
                    <td className="mono" style={{color:"#34d399"}}>{s.W}</td>
                    <td className="mono" style={{color:"#f87171"}}>{s.L}</td>
                    <td className="mono">{s.SV}</td>
                    <td className="mono">{fmtIP(s.IP)}</td>
                    <td className="mono">{s.Kp}</td>
                    <td className="mono">{pitcherRate(s,"WHIP")}</td>
                  </tr>
                );
              })}
              {hasTotals&&(
                <tr style={{background:"rgba(245,200,66,.06)",fontWeight:700}}>
                  <td style={{color:"#f5c842",fontSize:9}}>通算</td>
                  <td></td>
                  <td className="mono">{totalERA>0?totalERA.toFixed(2):"---"}</td>
                  <td className="mono" style={{color:"#34d399"}}>{totals.W}</td>
                  <td className="mono" style={{color:"#f87171"}}>{totals.L}</td>
                  <td className="mono">{totals.SV}</td>
                  <td className="mono">{fmtIP(totals.IP)}</td>
                  <td className="mono">{totals.Kp}</td>
                  <td className="mono">{totalWHIP>0?totalWHIP.toFixed(2):"---"}</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
        {ip&&totals.PA>0&&(
          <table className="tbl" style={{fontSize:9,width:"100%",marginTop:8}}>
            <thead><tr><th>年度</th><th>打席</th><th>打数</th><th>打率</th><th>安打</th><th>犠打</th></tr></thead>
            <tbody>
              {[...displayLog].reverse().map((row,ri)=>{const s=getS(row);if(s.PA===0)return null;return(
                <tr key={row.year+"-pb-"+ri}><td className="mono" style={{color:"#f5c842"}}>{row.year}</td><td className="mono">{s.PA}</td><td className="mono">{s.AB}</td><td className="mono">{fmtAvg(s.H,s.AB)}</td><td className="mono">{s.H}</td><td className="mono">{s.SH||0}</td></tr>
              );})}
              <tr style={{background:"rgba(245,200,66,.06)",fontWeight:700}}><td style={{color:"#f5c842",fontSize:9}}>通算</td><td className="mono">{totals.PA}</td><td className="mono">{totals.AB}</td><td className="mono">{fmtAvg(totals.H,totals.AB)}</td><td className="mono">{totals.H}</td><td className="mono">{totals.SH}</td></tr>
            </tbody>
          </table>
        )}
        {!ip&&(
          <table className="tbl" style={{fontSize:9,width:"100%"}}>
            <thead>
              <tr><th>年度</th><th>チーム</th><th>打席</th><th>打率</th><th>HR</th><th>打点</th><th>盗塁</th><th>OPS</th></tr>
            </thead>
            <tbody>
              {[...displayLog].reverse().map((row,ri)=>{
                const s=getS(row);
                if(mode==="playoff"&&s.PA===0) return null;
                return(
                  <tr key={row.year+"-b-"+ri}>
                    <td className="mono" style={{color:"#f5c842"}}>{row.year}</td>
                    <td className="mono" style={{color:"#94a3b8",maxWidth:60,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{row.teamName||""}</td>
                    <td className="mono">{s.PA}</td>
                    <td className="mono">{fmtAvg(s.H,s.AB)}</td>
                    <td className="mono" style={{color:s.HR>=20?"#f5c842":undefined}}>{s.HR}</td>
                    <td className="mono">{s.RBI}</td>
                    <td className="mono">{s.SB}</td>
                    <td className="mono">{batterRate(s,"OPS")>0?batterRate(s,"OPS").toFixed(3):"---"}</td>
                  </tr>
                );
              })}
              {hasTotals&&(
                <tr style={{background:"rgba(245,200,66,.06)",fontWeight:700}}>
                  <td style={{color:"#f5c842",fontSize:9}}>通算</td>
                  <td></td>
                  <td className="mono">{totals.PA}</td>
                  <td className="mono">{fmtAvg(totals.H,totals.AB)}</td>
                  <td className="mono" style={{color:totals.HR>=200?"#f5c842":undefined}}>{totals.HR}</td>
                  <td className="mono">{totals.RBI}</td>
                  <td className="mono">{totals.SB}</td>
                  <td className="mono">{totalOPS>0?totalOPS.toFixed(3):"---"}</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
