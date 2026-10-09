import React, { useEffect, useState } from "react";
import { fmtSal } from '../../utils';
import { calcRevenue } from '../../engine/finance';
import { SEASON_GAMES } from '../../constants';
import { contractPayroll } from '../../engine/contractPayroll';
import './finance-payroll.css';

export function FinanceTab({team,onStadiumUpgrade,onTicketPriceChange,gameDay,onPlayerClick}){
  const rev=calcRevenue(team);
  const payroll=contractPayroll(team);
  const payrollAmount = group => group.missing + group.invalid > 0
    ? `確認済み ${fmtSal(group.amount)}（集計不完全）` : fmtSal(group.amount);
  const unrecorded = group => [group.missing > 0 && `未記録${group.missing}人`, group.invalid > 0 && `不正値${group.invalid}人`].filter(Boolean).join('・');
  const [ticketPriceInput,setTicketPriceInput]=useState(String(team.customAvgTicketPrice??rev.avgTicketPrice));
  useEffect(()=>{
    setTicketPriceInput(String(team.customAvgTicketPrice??rev.avgTicketPrice));
  },[team.customAvgTicketPrice,rev.avgTicketPrice]);
  const lvl=team.stadiumLevel??0;
  const UPGRADE_COSTS=[5000000,10000000,20000000];
  const MULT_LABELS=["1.0x","1.25x","1.6x","2.0x"];
  const STAR_LABELS=["★☆☆","★★☆","★★★","★★★+"];
  const nextCost=lvl<3?UPGRADE_COSTS[lvl]:null;
  const revThisSeason=team.revenueThisSeason??0;
  const gamesPlayed=(gameDay||1)-1;
  const HOME_GAMES_MIN = Math.floor(SEASON_GAMES / 2);
  const HOME_GAMES_MAX = Math.ceil(SEASON_GAMES / 2);
  const projectedMin=gamesPlayed>0?Math.round(revThisSeason/gamesPlayed*HOME_GAMES_MIN):0;
  const projectedMax=gamesPlayed>0?Math.round(revThisSeason/gamesPlayed*HOME_GAMES_MAX):0;
  const annualTicketMin = rev.ticket * HOME_GAMES_MIN;
  const annualTicketMax = rev.ticket * HOME_GAMES_MAX;
  const annualSponsorMin = rev.sponsor * HOME_GAMES_MIN;
  const annualSponsorMax = rev.sponsor * HOME_GAMES_MAX;
  const annualMerchMin = rev.merch * HOME_GAMES_MIN;
  const annualMerchMax = rev.merch * HOME_GAMES_MAX;
  const fmtRange=(min,max)=>`${fmtSal(min)} 〜 ${fmtSal(max)}`;
  const applyTicketPrice=()=>{
    const next=Math.round(Number(ticketPriceInput));
    if(!Number.isFinite(next)) return;
    onTicketPriceChange?.(next);
  };
  return(
    <div className="finance-tab">
      <div className="g2">
        <div className="card">
          <div className="card-h">収入（試合ごと）</div>
          {[["チケット売上",fmtSal(rev.ticket)],["平均単価",`${rev.avgTicketPrice.toLocaleString()}円/枚`],["観客動員",`${rev.attendance.toLocaleString()}人`]].map(([l,v])=>(
            <div key={l} className="fsb" style={{padding:"7px 0",borderBottom:"1px solid rgba(255,255,255,.03)"}}><span style={{fontSize:11,color:"#4b5563"}}>{l}</span><span className="mono" style={{color:"#34d399"}}>{v}</span></div>
          ))}
        </div>
        <div className="card">
          <div className="card-h">収入（年間見込み / 本拠地71〜72試合）</div>
          {[["チケット売上",fmtRange(annualTicketMin,annualTicketMax)],["スポンサー",fmtRange(annualSponsorMin,annualSponsorMax)],["グッズ",fmtRange(annualMerchMin,annualMerchMax)],["年間合計",fmtRange(annualTicketMin+annualSponsorMin+annualMerchMin,annualTicketMax+annualSponsorMax+annualMerchMax)]].map(([l,v])=>(
            <div key={l} className="fsb" style={{padding:"7px 0",borderBottom:"1px solid rgba(255,255,255,.03)"}}><span style={{fontSize:11,color:"#4b5563"}}>{l}</span><span className="mono" style={{color:"#34d399"}}>{v}</span></div>
          ))}
        </div>
      </div>
      <div className="card">
        <div className="card-h">🎫 チケット価格調整</div>
        <div style={{fontSize:11,color:"#4b5563",marginBottom:8}}>平均価格を上げると動員が下がり、下げると動員が上がります。</div>
        <div className="fsb" style={{gap:8,alignItems:"center"}}>
          <input value={ticketPriceInput} onChange={e=>setTicketPriceInput(e.target.value.replace(/[^\d]/g,''))} onBlur={applyTicketPrice} style={{flex:1,background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.12)",color:"#e5e7eb",padding:"8px 10px",borderRadius:6}} />
          <button className="btn" onClick={applyTicketPrice}>反映</button>
        </div>
        <div style={{fontSize:11,color:"#4b5563",marginTop:6}}>設定範囲: 500〜5,000円</div>
      </div>
      <section className="card finance-payroll" aria-label="選手契約年俸（年額）">
        <h2 className="card-h">選手契約年俸（年額）</h2>
        <p className="finance-payroll-note">現在所属する選手の契約年俸です。支払済み額ではありません。</p>
        <dl className="finance-payroll-breakdown">
          {[...payroll.groups, { ...payroll.total, category: 'total', label: '合計' }].map(group => (
            <div key={group.category} data-payroll-category={group.category} className="finance-payroll-row">
              <dt>{group.label} <span className="finance-payroll-count">{group.count}人</span></dt>
              <dd><span className="mono">{payrollAmount(group)}</span>{unrecorded(group) && <small>{unrecorded(group)}</small>}</dd>
            </div>
          ))}
        </dl>
        {payroll.total.missing + payroll.total.invalid > 0 && <p className="finance-payroll-warning" role="status">年俸が未記録・不正な選手を含むため、合計は確認できた年俸のみです。</p>}
      </section>
      <div className="card">
        <div className="card-h">コーチ給与（参考）</div>
        <div className="fsb" style={{padding:"7px 0"}}><span style={{fontSize:11,color:"#4b5563"}}>契約給与・支払済み額ではありません</span><span className="mono" style={{color:"#f87171"}}>{fmtSal(team.coaches.reduce((s,c)=>s+c.salary,0))}</span></div>
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
        {[["シーズン累計",fmtSal(revThisSeason)],["投資済み球場レベル",`Lv${lvl} ${STAR_LABELS[lvl]} (${MULT_LABELS[lvl]})`],["シーズン収入予測",gamesPlayed>0?fmtRange(projectedMin,projectedMax):"計算中..."]].map(([l,v])=>(
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
      <div className="card finance-payroll">
        <div className="card-h">予算 / 年俸上位</div>
        <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:24,color:"#095cc7",marginBottom:12}}>{fmtSal(team.budget)}</div>
        <section className="finance-payroll" aria-label="年俸上位（所属選手）">
          <p className="finance-payroll-note">一軍・二軍・育成の所属選手 / 年額上位6人</p>
          {payroll.leaders.length === 0 && <p className="finance-payroll-note">所属選手はいません</p>}
          {payroll.leaders.map((entry, index) => {
            const p = entry.player;
            return <div key={index} className="finance-payroll-row finance-payroll-leader">
              <div><button type="button" className="finance-payroll-player" onClick={()=>onPlayerClick?.(p,team.name)}>{p.name}</button><span className="finance-payroll-note">{entry.label} / {p.pos} / {p.contractYearsLeft}年</span></div>
              <span className="mono">{entry.salaryStatus === 'recorded' ? fmtSal(p.salary) : entry.salaryStatus === 'missing' ? '未記録' : '不正値'}</span>
            </div>;
          })}
        </section>
      </div>
    </div>
  );
}
