import React,{useState,useMemo} from 'react';
import {selectFarmYears,selectFarmRanking,selectFarmRecord,calcMeasuredFarmAwards,FARM_RANKING_METRICS} from '../engine/farmRankings';
import {FarmRecordSummary,FARM_STAT_LABELS} from './FarmRecordSummary';
import {fmtAvg} from '../utils';
const labels={...FARM_STAT_LABELS,AVG:'打率',ERA:'防御率',outs:'投球回'};
const valueFor=(r,metric)=>metric==='AVG'?(r.value===null?'—':fmtAvg(r.stats.H,r.stats.AB)):metric==='ERA'?(r.value===null?'—':r.value.toFixed(2)):metric==='outs'?r.IP:r.value;
function FarmUnplayedReasons({record,league,teamId}) {
 if(!record.cards)return <p className="flow-muted">過年度の未実施理由は未記録です。</p>;
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

export function FarmRankings({state={}}) {
 const years=selectFarmYears(state),[selectedYear,setYear]=useState(null),[league,setLeague]=useState('セ'),[club,setClub]=useState('all');
 const [kind,setKind]=useState('batting'),[metric,setMetric]=useState('AVG'),[qualifiedOnly,setQualified]=useState(false),[selected,setSelected]=useState(null);
 const year=years.includes(selectedYear)?selectedYear:years[0]??state.year,record=selectFarmRecord(state,year);
 const clubs=(record?.teams||[]).filter(t=>t.league===league),teamId=clubs.find(t=>String(t.teamId)===club)?.teamId;
 const ranking=useMemo(()=>selectFarmRanking(state,{year,league,teamId,kind,metric,qualifiedOnly}),[state,year,league,teamId,kind,metric,qualifiedOnly]);
 const change=(setter,value)=>{setter(value);setSelected(null);};
 if(!record)return <section aria-label="二軍ランキング"><h2>二軍成績</h2><p>二軍実測：未記録。旧推定はランキングに含めません。</p></section>;
 const awards=state.seasonHistory?.awards?.find(a=>a.year===year)?.farmAwards??calcMeasuredFarmAwards(record,year);
 const leagueAwards=league==='セ'?awards.eastern:awards.western;
 return <section aria-label="二軍ランキング">
  <h2>二軍成績・ランキング</h2>
  <p className="flow-muted">{year}年・{ranking.partial?`${ranking.startRound}試合目からの途中記録`:'開幕から記録'}・簡易試合モデル。現在所属によらず当該球団の実績を集計します。</p>
  <div className="stats-toolbar" style={{gap:12,flexWrap:'wrap'}}>
   <label>年度 <select aria-label="二軍年度" value={year} onChange={e=>change(setYear,Number(e.target.value))}>{years.map(y=><option key={y} value={y}>{y}年</option>)}</select></label>
   <label>リーグ <select aria-label="二軍リーグ" value={league} onChange={e=>{change(setLeague,e.target.value);setClub('all');}}><option value="セ">イースタン</option><option value="パ">ウエスタン</option></select></label>
   <label>球団 <select aria-label="二軍球団" value={teamId===undefined?'all':club} onChange={e=>change(setClub,e.target.value)}><option value="all">リーグ全体</option>{clubs.map(t=><option key={t.teamId} value={String(t.teamId)}>{t.name}</option>)}</select></label>
  </div>
  <div className="stats-toolbar" style={{gap:12,flexWrap:'wrap'}}>
   <label>種別 <select aria-label="二軍成績種別" value={kind} onChange={e=>{change(setKind,e.target.value);setMetric(e.target.value==='batting'?'AVG':'ERA');}}><option value="batting">打撃</option><option value="pitching">投球</option></select></label>
   <label>並び順 <select aria-label="二軍順位指標" value={metric} onChange={e=>change(setMetric,e.target.value)}>{FARM_RANKING_METRICS[kind].map(k=><option key={k} value={k}>{labels[k]}</option>)}</select></label>
   {kind==='batting'&&<label><input type="checkbox" checked={qualifiedOnly} onChange={e=>change(setQualified,e.target.checked)}/> 規定到達者のみ</label>}
  </div>
  <p>規定打席{ranking.minPA}（リーグ最多実施{ranking.maxPlayed}試合×3.1切上げ・ゲーム内規定）。率の分母0は—、同率は同順位です。</p>
  <div className="stats-table-wrap" role="region" tabIndex={0} aria-label="二軍球団実施状況。横にスクロールできます">
   <table className="tbl stats-table"><thead><tr>{['球団','予定消化','実施','未実施','勝','敗','引分'].map(k=><th key={k}>{k}</th>)}</tr></thead>
    <tbody>{ranking.standings.filter(t=>teamId===undefined||t.teamId===teamId).map(t=><tr key={t.teamId}><td>{t.name}</td>{['scheduled','played','unplayed','W','L','T'].map(k=><td key={k}>{t[k]}</td>)}</tr>)}</tbody>
   </table>
  </div>
  <FarmUnplayedReasons record={record} league={league} teamId={teamId}/>
  <div className="stats-table-wrap" role="region" tabIndex={0} aria-label="二軍選手ランキング。横にスクロールできます">
   <table className="tbl stats-table"><thead><tr><th>順位</th><th>選手</th><th>{labels[metric]}</th><th>{kind==='batting'?'打席':'登板'}</th><th>実績球団</th>{kind==='batting'&&<th>規定</th>}</tr></thead>
    <tbody>{ranking.rows.length===0?<tr><td colSpan={kind==='batting'?6:5}>対象の選手はいません。</td></tr>:ranking.rows.map(r=><tr key={r.playerId}>
     <td>{r.rank??'—'}</td><td><button className="tab" onClick={()=>setSelected(r)}>{r.name}</button></td><td className="mono">{valueFor(r,metric)}</td><td>{kind==='batting'?r.stats.PA:r.stats.G}</td><td>{r.teamName}</td>{kind==='batting'&&<td>{r.qualified?'到達':'未達'}</td>}
    </tr>)}</tbody>
   </table>
  </div>
  {selected&&<section aria-label="二軍記録詳細" style={{borderTop:'1px solid var(--detail-border)',marginTop:16,paddingTop:12}}>
   <h3>{selected.name}・{year}年二軍実測</h3><button className="tab" onClick={()=>setSelected(null)}>記録詳細を閉じる</button>
   <p>球団別：{selected.teamName}。以下は当該年度の球団間合計（両リーグ）です。</p>
   <FarmRecordSummary state={state} player={{id:selected.playerId,name:selected.name,isPitcher:!!selected.pitching}} year={year} detail/>
  </section>}
  <h3>年間表彰（リーグ全体）</h3>
  {awards.status!=='complete'?<p>{awards.reason||'保存済み表彰は未確定です。'}</p>:<dl>
   {['batting','hr','wins'].map((k,i)=><React.Fragment key={k}><dt>{['首位打者','本塁打王','最多勝'][i]}</dt><dd>{leagueAwards?.[k]?(leagueAwards[k].winners||[leagueAwards[k]]).map(p=>`${p.name}（${p.teamName}）`).join('／'):'該当なし'}</dd></React.Fragment>)}
  </dl>}
  <p className="flow-muted">セーブ・ホールドは非対応。犠打・犠飛はモデル上0。旧推定との合算は行いません。</p>
 </section>;
}
