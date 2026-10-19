import React, { useEffect, useState } from "react";
import { fmtSal } from '../../utils';
import { calcRevenue } from '../../engine/finance';
import { SEASON_GAMES, FINANCE_TICKET_LEVEL_MULT } from '../../constants';
import { calcClubGameFinance, forecastClubFinance, stadiumUpgradeCosts } from '../../engine/clubFinance';
import { regularSeasonProgress } from '../../engine/seasonProgress';
import { contractPayroll } from '../../engine/contractPayroll';
import './finance-payroll.css';

export function FinanceTab({team,onStadiumUpgrade,onTicketPriceChange,gameDay,onPlayerClick,schedule}){
  const forecast=forecastClubFinance(team,schedule);
  const quote=forecast?calcClubGameFinance(team,true,Math.min(SEASON_GAMES,forecast.gamesPlayed+1)):null;
  const rev=quote?{...quote,...quote.income}:calcRevenue(team);
  const payroll=contractPayroll(team);
  const payrollAmount = group => group.missing + group.invalid > 0
    ? `確認済み ${fmtSal(group.amount)}（集計不完全）` : fmtSal(group.amount);
  const unrecorded = group => [group.missing > 0 && `未記録${group.missing}人`, group.invalid > 0 && `不正値${group.invalid}人`].filter(Boolean).join('・');
  const [ticketPriceInput,setTicketPriceInput]=useState(String(team.customAvgTicketPrice??rev.avgTicketPrice));
  useEffect(()=>{
    setTicketPriceInput(String(team.customAvgTicketPrice??rev.avgTicketPrice));
  },[team.customAvgTicketPrice,rev.avgTicketPrice]);
  const lvl=team.stadiumLevel??0;
  const UPGRADE_COSTS=stadiumUpgradeCosts(team);
  const MULT_LABELS=forecast?["基準","基準単価+3.5%","基準単価+7%","基準単価+10.5%"]:FINANCE_TICKET_LEVEL_MULT.map(n=>`${n}x`);
  const STAR_LABELS=["★☆☆","★★☆","★★★","★★★+"];
  const nextCost=lvl<3?UPGRADE_COSTS[lvl]:null;
  const revThisSeason=team.revenueThisSeason??0;
  const progress=regularSeasonProgress(team);
  const gamesPlayed=forecast?.gamesPlayed??(progress.valid?progress.playedGames:0);
  const projected=gamesPlayed>0?Math.round(revThisSeason/gamesPlayed*SEASON_GAMES):null;
  const fmtRange=(min,max)=>min===max?fmtSal(min):`${fmtSal(min)} 〜 ${fmtSal(max)}`;
  const amount = r => fmtRange(r.min,r.max);
  const annualRows=forecast?Object.entries({ticket:'チケット売上',food:'飲食',merch:'物販',sponsor:'スポンサー',broadcast:'放映権',membership:'会員'})
    .map(([key,label])=>[label,amount(forecast.income[key])]):[['チケット売上',fmtSal(rev.ticket*SEASON_GAMES)],['スポンサー',fmtSal(rev.sponsor*SEASON_GAMES)],['グッズ',fmtSal(rev.merch*SEASON_GAMES)]];
  annualRows.push(['年間合計',forecast?amount(forecast.revenue):fmtSal((rev.ticket+rev.sponsor+rev.merch)*SEASON_GAMES)]);
  const applyTicketPrice=()=>{
    const next=Math.round(Number(ticketPriceInput));
    if(!Number.isFinite(next)) return;
    onTicketPriceChange?.(next);
  };
  return(
    <div className="finance-tab">
      <p className="finance-payroll-note">{forecast?'球団別の動員基準と推定値による簡易収支です。編成予算は現金残高ではありません。':'旧モデルの収入を表示しています。翌年度から新しい収支モデルへ切り替わります。'}</p>
      <div className="g2">
        <div className="card">
          <div className="card-h">{forecast?'主催試合の収入（現在条件）':'収入（試合ごと）'}</div>
          {[["チケット売上",fmtSal(rev.ticket)],["平均単価",`${rev.avgTicketPrice.toLocaleString()}円/枚`],["観客動員",`${rev.attendance.toLocaleString()}人`]].map(([l,v])=>(
            <div key={l} className="fsb" style={{padding:"7px 0",borderBottom:"1px solid rgba(255,255,255,.03)"}}><span style={{fontSize:11,color:"#4b5563"}}>{l}</span><span className="mono" style={{color:"#34d399"}}>{v}</span></div>
          ))}
        </div>
        <div className="card">
          <div className="card-h">{forecast?`年間売上見込み / 主催${forecast.homeGames.min===forecast.homeGames.max?forecast.homeGames.min:`${forecast.homeGames.min}〜${forecast.homeGames.max}`}試合`:'年間見込み / 旧モデル・出場143試合換算'}</div>
          {forecast&&<p className="finance-payroll-note">実施{gamesPlayed}試合の実績＋残り試合の予測。{forecast.completeSchedule?'実際の日程を使用。':'日程未確認のため主催試合数は概算。'}</p>}
          {annualRows.map(([l,v])=>(
            <div key={l} className="fsb" style={{padding:"7px 0",borderBottom:"1px solid rgba(255,255,255,.03)"}}><span style={{fontSize:11,color:"#4b5563"}}>{l}</span><span className="mono" style={{color:"#34d399"}}>{v}</span></div>
          ))}
        </div>
      </div>
      {forecast&&<section className="card finance-payroll" aria-label="運営費と編成予算">
        <h2 className="card-h">運営費と編成予算</h2>
        <dl className="finance-payroll-breakdown">
          {[
            ['年間運営費の見込み',amount(forecast.operatingCosts)],
            ['選手給与前の運営差額',amount(forecast.operatingSurplus)],
            ['契約年俸差引後（参考）',payroll.total.missing+payroll.total.invalid?'年俸の確認が必要':fmtRange(forecast.operatingSurplus.min-payroll.total.amount,forecast.operatingSurplus.max-payroll.total.amount)],
            ['編成予算の残枠',fmtSal(team.budget)],
          ].map(([label,value])=><div className="finance-payroll-row" key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
        </dl>
        <p className="finance-payroll-note">運営費は球場・興行・飲食物販原価・一般運営を自動計上。選手給与は別枠です。売上から運営費を引いた差額を編成予算へ反映し、翌年度はオーナー配分と契約年俸から予算を再設定します。契約年俸差引後の額は利益の参考値で、支払済み額ではありません。</p>
      </section>}
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
        {[["シーズン累計",fmtSal(revThisSeason)],["投資済み球場レベル",`Lv${lvl} ${STAR_LABELS[lvl]} (${MULT_LABELS[lvl]})`],["シーズン収入予測",forecast?amount(forecast.revenue):projected!==null?fmtSal(projected):"計算中..."]].map(([l,v])=>(
          <div key={l} className="fsb" style={{padding:"7px 0",borderBottom:"1px solid rgba(255,255,255,.03)"}}><span style={{fontSize:11,color:"#4b5563"}}>{l}</span><span className="mono" style={{color:"#34d399"}}>{v}</span></div>
        ))}
      </div>
      <div className="card">
        <div className="card-h">🏟️ 球場投資</div>
        {forecast&&Number(team.customAvgTicketPrice)>0&&<p className="finance-payroll-note">手動設定中のチケット価格は維持されます。</p>}
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
