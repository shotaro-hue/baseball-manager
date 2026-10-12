import React, {useId,useMemo,useState} from 'react';
import {fmtIP} from '../../utils';
import {seasonParticipants} from '../../engine/seasonParticipants';
import {stableSort} from '../../engine/analysisComparison';
import {firstTeamMetric} from '../firstTeamStatsMetrics';
import {detailNumber,firstTeamScope} from '../playerDetailMetrics';
import {Button,DataTableFrame} from '../design-system/primitives';
import '../league-rankings.css';

const LEAGUES=['全体','セ','パ'];
const column=(key,label,{asc=false,isRate=false,advanced=false}={})=>({key,label,asc,isRate,advanced});
const BATTER_COLS=[
  column('OPS','OPS',{isRate:true}),column('AVG','打率',{isRate:true}),column('HR','本塁打'),column('RBI','打点'),column('PA','打席'),column('WAR','WAR',{isRate:true}),
  column('SB','盗塁',{advanced:true}),column('wOBA','wOBA',{isRate:true,advanced:true}),column('wRCp','wRC+',{isRate:true,advanced:true}),column('ISO','ISO',{isRate:true,advanced:true}),column('BBpct','四球率',{isRate:true,advanced:true}),column('Kpct','三振率',{asc:true,isRate:true,advanced:true}),
];
const PITCHER_COLS=[
  column('ERA','防御率',{asc:true,isRate:true}),column('IP','投球回'),column('WHIP','WHIP',{asc:true,isRate:true}),column('Kp','奪三振'),column('W','勝'),column('WAR','WAR',{isRate:true}),
  column('SV','S',{advanced:true}),column('HLD','H',{advanced:true}),column('QS','QS',{advanced:true}),column('FIP','FIP',{asc:true,isRate:true,advanced:true}),column('Kpct','三振率',{isRate:true,advanced:true}),column('BBpct','四球率',{asc:true,isRate:true,advanced:true}),
];
// Preserve the existing list's progressive qualification rules; award rules are separate.
function calcQualified(gameDay) {
  const played=Math.max(1,gameDay-1);
  return {pa:Math.max(10,Math.floor(played*3.1)),ip:Math.max(5,played)};
}

export function LeaderboardTab({teams,myId,gameDay=1,year,onPlayerClick,onToggleCompare,comparePlayerIds=[]}) {
  const id=useId();
  const [view,setView]=useState('batter'),[league,setLeague]=useState('全体'),[sortKey,setSortKey]=useState('OPS'),[sortAsc,setSortAsc]=useState(false),[qualifiedOnly,setQualifiedOnly]=useState(false),[advanced,setAdvanced]=useState(false);
  const cols=view==='batter'?BATTER_COLS:PITCHER_COLS;
  const sortCol=cols.find(c=>c.key===sortKey)||cols[0];
  const qualified=useMemo(()=>calcQualified(gameDay),[gameDay]);
  const allPlayers=useMemo(()=>teams.flatMap(t=>seasonParticipants(t).map(p=>({...p,_teamName:t.name,_teamShort:t.short||t.name,_league:t.league,_isMyTeam:t.id===myId,_membership:t.farm?.some(f=>f.id===p.id)?'二軍所属':'一軍所属'}))),[teams,myId]);
  const filtered=useMemo(()=>allPlayers.filter(p=>{
    const counter=view==='batter'?'PA':'IP',minimum=view==='batter'?10:5;
    return Boolean(p.isPitcher)===(view==='pitcher')&&Number.isFinite(p.stats?.[counter])&&p.stats[counter]>=minimum&&(league==='全体'||p._league===league)&&(!qualifiedOnly||!sortCol.isRate||p.stats[counter]>=(view==='batter'?qualified.pa:qualified.ip));
  }),[allPlayers,view,league,qualifiedOnly,sortCol.isRate,qualified]);
  const sorted=useMemo(()=>stableSort(filtered,p=>{
    const value=firstTeamMetric(p,sortCol.key).value;
    // Keep this list's original raw-IP ordering; display still uses fmtIP.
    return sortCol.key==='IP'&&value!=null?p.stats.IP:value;
  },sortAsc?'asc':'desc'),[filtered,sortCol,sortAsc]);
  const top3=sorted.filter(p=>firstTeamMetric(p,sortCol.key).value!=null).slice(0,3);
  const displayed=[sortCol,...cols.filter(c=>c.key!==sortCol.key&&(advanced||!c.advanced))];
  const leagueLabel=league==='全体'?'全球団':`${league}リーグ`;
  const sortLabel=`${sortCol.label} ${sortAsc?'昇順':'降順'}`;
  const qualifiedLabel=view==='batter'?`規定打席: ${qualified.pa}`:`規定投球回: ${fmtIP(qualified.ip)}`;
  const openPlayer=p=>onPlayerClick?.(p,p._teamName,p.isPitcher?'stats':'battedBall');
  const changeView=v=>{setView(v);setSortKey(v==='batter'?'OPS':'ERA');setSortAsc(v==='pitcher');};
  const chooseSort=key=>{const c=cols.find(c=>c.key===key);if(c){setSortKey(key);setSortAsc(c.asc);}};
  const handleSort=c=>{if(sortKey===c.key)setSortAsc(a=>!a);else chooseSort(c.key);};
  const tabKey=(event,v)=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?'batter':event.key==='End'?'pitcher':v==='batter'?'pitcher':'batter';changeView(next);document.getElementById(`${id}-${next}`)?.focus();}};
  const reset=()=>{setLeague('全体');setQualifiedOnly(false);changeView('batter');};
  return <section className="calm-detail detail-leaders league-rankings" data-ds="league-rankings" aria-label="一軍リーグランキング">
    <header className="league-heading"><h1>リーグ成績</h1><p>{firstTeamScope(year)} · {leagueLabel}</p></header>
    <p className="league-note">球団は現在所属。二軍所属の一軍出場者も含み、二軍実測・旧推定は合算しません。</p>
    <div className="league-toolbar">
      <div className="league-tabs" role="tablist" aria-label="成績種別">{[['batter','打者'],['pitcher','投手']].map(([key,label])=><button type="button" key={key} id={`${id}-${key}`} role="tab" aria-label={key==='batter'?'打者':'投手'} aria-selected={view===key} aria-controls={`${id}-panel`} tabIndex={view===key?0:-1} onKeyDown={e=>tabKey(e,key)} onClick={()=>changeView(key)}>{label}</button>)}</div>
      <div className="league-filters" role="group" aria-label="リーグ">{LEAGUES.map(l=><Button key={l} variant="secondary" aria-pressed={league===l} onClick={()=>setLeague(l)}>{l==='全体'?'全体':`${l}リーグ`}</Button>)}</div>
    </div>
    <div className="league-controls">
      <label className="league-sort-select">順位指標<select aria-label="順位指標" value={sortKey} onChange={e=>chooseSort(e.target.value)}>{cols.map(c=><option key={c.key} value={c.key}>{c.label}</option>)}</select></label>
      <Button variant="secondary" aria-label="並び順を反転" onClick={()=>setSortAsc(a=>!a)}>{sortAsc?'昇順 ▲':'降順 ▼'}</Button>
      <div className="league-column-toggle" role="group" aria-label="表示する指標"><Button variant="secondary" aria-pressed={!advanced} onClick={()=>setAdvanced(false)}>主要指標</Button><Button variant="secondary" aria-pressed={advanced} onClick={()=>setAdvanced(true)}>詳細指標</Button></div>
    </div>
    <label className="league-qualified"><input type="checkbox" aria-label="規定達成のみ" checked={qualifiedOnly} disabled={!sortCol.isRate} onChange={e=>setQualifiedOnly(e.target.checked)} />規定達成のみ{sortCol.isRate&&<span>（{qualifiedLabel}）</span>}</label>
    <p className="league-criteria">{view==='batter'?'最低打席10':'最低投球回5.0'} · {sortLabel} · {filtered.length}人{qualifiedOnly&&sortCol.isRate?' · 規定達成者のみ':''}{!sortCol.isRate&&' · 計数指標では規定条件を適用しません'}</p>
    <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${view}`}>
      <div className="league-table-heading"><h2>{leagueLabel} {view==='batter'?'打者':'投手'} ランキング</h2><span>{sortLabel} · 見出しから並び替え</span></div>
      {sorted.length===0?<div className="league-empty"><p>この条件に該当する選手はいません。最低出場条件・リーグ・規定条件を確認してください。</p><Button variant="secondary" onClick={reset}>条件を戻す</Button></div>:<DataTableFrame stickyColumn={1} className="detail-table-scroll" label="成績表。横にスクロールできます">
        <table className="tbl league-table"><thead><tr><th scope="col">選手／表示順</th>{displayed.map(c=><th key={c.key} scope="col" aria-sort={c.key===sortKey?(sortAsc?'ascending':'descending'):undefined}><button type="button" className="table-sort-button" aria-label={`${c.label}で並び替え`} onClick={()=>handleSort(c)}>{c.label}{c.key===sortKey&&<span aria-hidden="true">{sortAsc?' ▲':' ▼'}</span>}</button></th>)}{onToggleCompare&&<th scope="col">比較</th>}</tr></thead>
        <tbody>{sorted.map((p,i)=><tr key={p.id} className="interactive-player-row" aria-label={`${p.name}の詳細を開く`} data-compared={comparePlayerIds.includes(p.id)||undefined} onClick={()=>openPlayer(p)} onKeyDown={e=>{if((!e.target||e.target===e.currentTarget)&&(e.key==='Enter'||e.key===' ')){e.preventDefault();openPlayer(p);}}}>
          <td><button type="button" className="league-player-button" aria-label={`${p.name}の詳細を開く`} onClick={e=>{e.stopPropagation();openPlayer(p);}}><strong>{firstTeamMetric(p,sortKey).value!=null?`${i+1} · `:'— · '}{p.name}{p._isMyTeam?' · 自':''}</strong><small>{p._teamShort} · {p._league} · {p._membership}</small><small>{(p.isPitcher?p.subtype||p.pos:p.pos)||'役割未記録'} · 状態 {detailNumber(p.condition)}{p.injuryDaysLeft>0?` · 負傷中 残${p.injuryDaysLeft}試合`:''}</small></button></td>
          {displayed.map(c=><td data-number data-metric={c.key} key={c.key}>{firstTeamMetric(p,c.key).display}</td>)}
          {onToggleCompare&&<td><Button variant="secondary" className="compare-add-button" aria-pressed={comparePlayerIds.includes(p.id)} aria-label={`${p.name}を比較${comparePlayerIds.includes(p.id)?'から外す':'へ追加'}`} onClick={e=>{e.stopPropagation();onToggleCompare(p,p._teamName);}}>{comparePlayerIds.includes(p.id)?'比較中':'＋比較'}</Button></td>}
        </tr>)}</tbody></table>
      </DataTableFrame>}
    </div>
    <details className="league-help"><summary>記録・条件の見方</summary><p>今季の一軍記録。最低出場条件と、進行日を基準にした一覧の規定条件を適用します。表彰の条件は別です。実測0を数値、未記録・分母0の算出不可を理由で表示。欠測は両方向とも末尾です。選手名から詳細へ、比較は表の末尾または詳細から追加できます。</p></details>
    {top3.length>0&&<details className="league-leading"><summary>{sortLabel} · 先頭3選手</summary><div className="league-leading-list" aria-label="並び順の先頭3選手">{top3.map((p,i)=><button key={p.id} type="button" onClick={()=>openPlayer(p)} aria-label={`${p.name}の詳細を開く`}><span>{i+1} · {p.name}</span><small>{p._teamName} · {p._membership}</small><strong>{firstTeamMetric(p,sortCol.key).display}</strong></button>)}</div></details>}
  </section>;
}
