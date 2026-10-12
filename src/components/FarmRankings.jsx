import React,{useState,useMemo,useId,useRef,useEffect} from 'react';
import {selectFarmYears,selectFarmRanking,selectFarmRecord,calcMeasuredFarmAwards,FARM_RANKING_METRICS} from '../engine/farmRankings';
import {FarmPlayerHistory,FARM_STAT_LABELS} from './FarmRecordSummary';
import {Button,DataTableFrame,StateLabel} from './design-system/primitives';
import './farm-records.css';
import {fmtAvg} from '../utils';
const labels={...FARM_STAT_LABELS,AVG:'打率',ERA:'防御率',outs:'投球回'};
const valueFor=(r,metric)=>r.value===null?'— 算出不可':metric==='AVG'?fmtAvg(r.stats.H,r.stats.AB):metric==='ERA'?r.value.toFixed(2):metric==='outs'?r.IP:r.value;
const recorded=value=>value==null?'— 未記録':value;
function FarmUnplayedReasons({record,league,teamId}) {
 if(!record.cards)return <p className="farm-note">過年度の未実施理由は未記録です。</p>;
 const counts=new Map(),labels={'insufficient-catcher':'捕手不足','insufficient-batters':'健康な野手不足','insufficient-pitchers':'健康な投手不足'};
 for(const card of record.cards.filter(c=>c.status==='unplayed'&&c.league===league&&(teamId===undefined||c.homeId===teamId||c.awayId===teamId))) {
  for(const r of card.reasons) {
   const key=JSON.stringify([r.teamId,r.code,r.available,r.required]),entry=counts.get(key)||{...r,count:0};
   entry.count++;counts.set(key,entry);
  }
 }
 return <details><summary>未実施理由</summary>{counts.size>0?<ul>{[...counts].map(([key,r])=><li key={key}>
  {record.teams.find(t=>t.teamId===r.teamId)?.name??String(r.teamId)}：{labels[r.code]??r.code}（{r.available}/{r.required}）・{r.count}カード
 </li>)}</ul>:<p>選択範囲の未実施はありません。</p>}</details>;
}

export function FarmRankings({state={},onPlayerClick}) {
 const id=useId(),opener=useRef(null),closeButton=useRef(null);
 const years=selectFarmYears(state),[selectedYear,setYear]=useState(null),[league,setLeague]=useState('セ'),[club,setClub]=useState('all');
 const [kind,setKind]=useState('batting'),[metric,setMetric]=useState('AVG'),[qualifiedOnly,setQualified]=useState(false),[selected,setSelected]=useState(null),[advanced,setAdvanced]=useState(false);
 const year=years.includes(selectedYear)?selectedYear:years[0]??state.year,record=selectFarmRecord(state,year);
 const clubs=(record?.teams||[]).filter(t=>t.league===league),teamId=clubs.find(t=>String(t.teamId)===club)?.teamId;
 const ranking=useMemo(()=>selectFarmRanking(state,{year,league,teamId,kind,metric,qualifiedOnly}),[state,year,league,teamId,kind,metric,qualifiedOnly]);
 const change=(setter,value)=>{setter(value);setSelected(null);};
 useEffect(()=>{if(selected)closeButton.current?.focus();},[selected]);
 const openRecord=(row,event)=>{opener.current={node:event?.currentTarget,scroll:typeof window==='undefined'?0:window.scrollY};setSelected(row);};
 const closeRecord=()=>{setSelected(null);opener.current?.node?.focus({preventScroll:true});if(typeof window!=='undefined')window.scrollTo({top:opener.current?.scroll??0});};
 const changeKind=value=>{change(setKind,value);setMetric(value==='batting'?'AVG':'ERA');};
 const tabKey=(event,value)=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const next=event.key==='Home'?'batting':event.key==='End'?'pitching':value==='batting'?'pitching':'batting';changeKind(next);if(typeof document!=='undefined')document.getElementById(`${id}-${next}`)?.focus();};
 if(!record)return <section className="farm-rankings" data-ds="farm-rankings" aria-label="二軍ランキング"><header className="farm-heading"><h2>二軍成績</h2></header><p className="farm-empty">二軍実測：未記録。旧推定はランキングに含めません。</p></section>;
 const savedAwards=state.seasonHistory?.awards?.find(a=>a.year===year)?.farmAwards;
 // Old pending snapshots are placeholders; resolve them for display only.
 const awards=savedAwards?.status==='pending'||savedAwards==null?calcMeasuredFarmAwards(record,year):savedAwards;
 const leagueAwards=league==='セ'?awards.eastern:awards.western;
 const awardReason=awards.reason==='二軍年間表彰は全round記録後に確定'?'年度終了時に確定します。':awards.reason;
 const currentTeam=selected&&(state.teams||[]).find(t=>[...(t.players||[]),...(t.farm||[])].some(p=>p.id===selected.playerId));
 const livePlayer=currentTeam&&[...(currentTeam.players||[]),...(currentTeam.farm||[])].find(p=>p.id===selected.playerId);
 const extraMetrics=advanced?FARM_RANKING_METRICS[kind].filter(k=>k!==metric&&k!==(kind==='batting'?'PA':'G')):[];
 const columnCount=(kind==='batting'?6:5)+extraMetrics.length;
 return <section className="farm-rankings" data-ds="farm-rankings" aria-label="二軍ランキング">
  <header className="farm-heading"><h2>二軍成績・ランキング</h2><p>二軍実測 · {year}年（{year===state.year?'今季':'過年度'}） · {league==='セ'?'イースタン':'ウエスタン'}</p></header>
  <p className="farm-note">{ranking.partial?`${ranking.startRound}試合目からの途中記録`:'開幕から記録'} · 簡易試合モデル。現在所属によらず当該球団の実績を集計します。</p>
  <div className="farm-filters">
   <label>年度 <select aria-label="二軍年度" value={year} onChange={e=>change(setYear,Number(e.target.value))}>{years.map(y=><option key={y} value={y}>{y}年</option>)}</select></label>
   <label>リーグ <select aria-label="二軍リーグ" value={league} onChange={e=>{change(setLeague,e.target.value);setClub('all');}}><option value="セ">イースタン</option><option value="パ">ウエスタン</option></select></label>
   <label>球団 <select aria-label="二軍球団" value={teamId===undefined?'all':club} onChange={e=>change(setClub,e.target.value)}><option value="all">リーグ全体</option>{clubs.map(t=><option key={t.teamId} value={String(t.teamId)}>{t.name}</option>)}</select></label>
  </div>
  <div className="farm-toolbar">
   <div className="farm-tabs" role="tablist" aria-label="二軍成績種別">{[['batting','打撃'],['pitching','投球']].map(([key,label])=><button type="button" key={key} id={`${id}-${key}`} role="tab" aria-controls={`${id}-panel`} aria-selected={kind===key} tabIndex={kind===key?0:-1} onKeyDown={e=>tabKey(e,key)} onClick={()=>changeKind(key)}>{label}</button>)}</div>
   <div className="farm-column-toggle"><Button variant="secondary" aria-pressed={!advanced} onClick={()=>setAdvanced(false)}>主要指標</Button><Button variant="secondary" aria-pressed={advanced} onClick={()=>setAdvanced(true)}>詳細指標</Button></div>
  </div>
  <div className="farm-controls"><label>順位指標<select aria-label="二軍順位指標" value={metric} onChange={e=>change(setMetric,e.target.value)}>{FARM_RANKING_METRICS[kind].map(k=><option key={k} value={k}>{labels[k]}</option>)}</select></label>
   {kind==='batting'&&<label className="farm-qualified"><input type="checkbox" aria-label="規定到達者のみ" checked={qualifiedOnly} onChange={e=>change(setQualified,e.target.checked)}/> 規定到達者のみ</label>}
  </div>
  <p className="farm-criteria">{labels[metric]} {metric==='ERA'?'昇順':'降順'} · {ranking.rows.length}人{kind==='batting'&&` · 規定打席${ranking.minPA}（最多実施${ranking.maxPlayed}試合）`}</p>
  <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${kind}`}>
  <DataTableFrame className="farm-table-wrap" stickyColumn={2} label="二軍選手ランキング。横にスクロールできます">
   <table className="farm-table farm-ranking-table" style={advanced?{minWidth:256+(columnCount-3)*110}:undefined}><thead><tr><th scope="col">順位</th><th scope="col">選手</th><th scope="col" aria-sort={metric==='ERA'?'ascending':'descending'}>{labels[metric]}</th><th scope="col">{kind==='batting'?'打席':'登板'}</th><th scope="col">実績球団</th>{kind==='batting'&&<th scope="col">規定</th>}{extraMetrics.map(k=><th scope="col" key={k}>{labels[k]}</th>)}</tr></thead>
    <tbody>{ranking.rows.length===0?<tr><td colSpan={columnCount}>対象の選手はいません。条件を変更してください。</td></tr>:ranking.rows.map(r=><tr key={r.playerId} data-selected={selected?.playerId===r.playerId||undefined}>
     <td data-number>{r.rank??'—'}</td><td><button type="button" className="farm-player-button" onClick={e=>openRecord(r,e)} aria-expanded={selected?.playerId===r.playerId} aria-controls={selected?.playerId===r.playerId?`${id}-record`:undefined}>{r.name}</button></td><td className="farm-primary-value" data-number data-metric={metric}>{valueFor(r,metric)}</td><td data-number>{kind==='batting'?r.stats.PA:r.stats.G}</td><td>{r.teamName}</td>{kind==='batting'&&<td>{r.qualified?'到達':'未達'}</td>}{extraMetrics.map(k=><td data-number data-metric={k} key={k}>{valueFor({...r,value:k==='AVG'?r.AVG:k==='ERA'?r.ERA:r.stats[k]},k)}</td>)}
    </tr>)}</tbody>
   </table>
  </DataTableFrame>
  </div>
  {selected&&<section className="farm-selected-record" id={`${id}-record`} aria-label="二軍記録詳細" onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();closeRecord();}}}>
   <h3>{selected.name}・二軍年度別記録</h3><button type="button" data-ds="button" data-variant="secondary" ref={closeButton} onClick={closeRecord}>記録詳細を閉じる</button>
   <p className="farm-note">ランキングの選択範囲：{selected.teamName}。以下は選択年度の球団間合計（両リーグ）と球団別内訳です。</p>
   <FarmPlayerHistory key={`${selected.playerId}-${year}`} state={state} playerId={selected.playerId} player={livePlayer} initialYear={year}/>
   {livePlayer&&onPlayerClick?<div className="farm-current-link"><p>現在所属：{currentTeam.name}。現在の能力・起用は選手詳細で確認できます。</p><Button variant="secondary" aria-label="現在の選手詳細を開く" onClick={()=>onPlayerClick(livePlayer,currentTeam.name,'stats')}>現在の選手詳細へ</Button></div>:<p className="farm-note">保存された二軍記録の読取専用表示です。{!livePlayer&&'現在所属の選手データはありません。'}</p>}
  </section>}
  <details className="farm-help"><summary>記録・規定・操作の見方</summary><p>規定打席{ranking.minPA}（リーグ最多実施{ranking.maxPlayed}試合×3.1切上げ・ゲーム内規定）。二軍は計数指標にも規定フィルタを適用します。投手の規定フィルタはありません。</p><p>実測0は数値、率の分母0は— 算出不可。未記録・旧推定は実測ランキングに含めません。同率は同順位です。選手名から年度別記録を確認できます。表だけを横にスクロールできます。閲覧で編成は変更されません。</p></details>
  <details className="farm-status"><summary>球団別の実施状況</summary>
  <DataTableFrame className="farm-table-wrap" label="二軍球団実施状況。横にスクロールできます">
   <table className="farm-table"><thead><tr>{['球団','予定消化','実施','未実施','勝','敗','引分'].map(k=><th scope="col" key={k}>{k}</th>)}</tr></thead>
    <tbody>{ranking.standings.filter(t=>teamId===undefined||t.teamId===teamId).map(t=><tr key={t.teamId}><td>{t.name}</td>{['scheduled','played','unplayed','W','L','T'].map(k=><td data-number key={k}>{recorded(t[k])}</td>)}</tr>)}</tbody>
   </table>
  </DataTableFrame>
  <FarmUnplayedReasons record={record} league={league} teamId={teamId}/>
  </details>
  <section className="farm-awards"><h3>年間表彰（リーグ全体）</h3>
  {awards.status!=='complete'?<p><StateLabel>{awards.status==='partial'?'途中記録':'未確定'}</StateLabel> {awardReason||'保存済み表彰は未確定です。'}</p>:<dl>
   {['batting','hr','wins'].map((k,i)=><React.Fragment key={k}><dt>{['首位打者','本塁打王','最多勝'][i]}</dt><dd>{leagueAwards?.[k]?(leagueAwards[k].winners||[leagueAwards[k]]).map(p=>`${p.name}（${p.teamName}）`).join('／'):'該当なし'}</dd></React.Fragment>)}
  </dl>}
  </section>
  <p className="farm-note">セーブ・ホールドは非対応。犠打・犠飛はモデル上0。旧推定との合算は行いません。</p>
 </section>;
}
