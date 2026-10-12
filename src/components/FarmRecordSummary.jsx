import React, {useState} from 'react';
import {selectFarmPlayer,selectFarmTeams} from '../engine/farmSelectors';
import {selectFarmYears,selectFarmRecord} from '../engine/farmRankings';
import {fmtAvg} from '../utils';
import {DataTableFrame} from './design-system/primitives';
import './farm-records.css';

export function FarmRecordScope({state={},teamId,year=state.year}) {
 const c=selectFarmRecord(state,year);
 if(!c)return <p className="farm-note">二軍実測：未記録</p>;
 const row=selectFarmTeams(state,{year}).find(t=>t.teamId===teamId);
 return <p className="farm-note">
  {c.year}年（{c.year===state.year?'今季':'過年度'}） 二軍実測（簡易試合モデル）・{c.startRound>1?`${c.startRound}試合目からの途中記録`:'開幕から記録'}
  {row&&<>・予定消化{row.scheduled}／実施{row.played}／未実施{row.unplayed}</>}
 </p>;
}
export function FarmRecordSummary({state={},player,playerId=player?.id,compact=false,year=state.year,detail=false}) {
 const r=selectFarmPlayer(state,playerId,{year});
 const legacy=r.legacy.entries.length>0||(!state.farmCompetition&&player?.stats2!=null);
 const keys=Object.keys(r.batting||r.pitching||{});
 return <div className="farm-record-summary" data-ds="farm-record">
  {r.status==='unrecorded'?<span>二軍実測：未記録</span>:<>
   {!compact&&<span>{r.year}年 二軍実測・球団間合計（{r.partial?`${r.startRound}試合目からの途中記録`:'開幕から記録'}）<br/></span>}
   {r.batting?<span>{r.batting.PA}打席／{r.batting.AB}打数・打率 {r.AVG===null?'—':fmtAvg(r.batting.H,r.batting.AB)}・{r.batting.HR}本塁打</span>
    :<span>{r.pitching.G}登板・{r.IP}回・防御率 {r.ERA===null?'—':r.ERA.toFixed(2)}・{r.pitching.W}勝</span>}
  </>}
  {detail&&r.status==='measured'&&<dl className="farm-stat-list">
   {Object.entries(r.batting||r.pitching).map(([key,value])=><React.Fragment key={key}>
    <dt>{key==='G'&&r.pitching?'登板':FARM_STAT_LABELS[key]||key}</dt><dd>{value}</dd>
   </React.Fragment>)}
  </dl>}
  {detail&&r.status==='measured'&&r.teams.length>0&&<details className="farm-stints"><summary>球団別内訳</summary>
   <p className="farm-note">上の数値は両リーグ・球団間合計。下の各行は当該年度の実績球団別です。</p>
   <DataTableFrame label="二軍球団別内訳。横にスクロールできます" className="farm-table-wrap">
    <table className="farm-table"><thead><tr><th scope="col">実績球団</th><th scope="col">リーグ</th>{r.pitching&&<th scope="col">投球回</th>}{keys.map(k=><th scope="col" key={k}>{k==='G'&&r.pitching?'登板':FARM_STAT_LABELS[k]||k}</th>)}</tr></thead><tbody>
    {r.teams.map(t=>{const stint=selectFarmPlayer(state,playerId,{year,teamId:t.teamId,league:t.league}),s=stint.batting||stint.pitching;return <tr key={`${t.teamId}-${t.league}`}>
     <td>{selectFarmRecord(state,year)?.teams.find(x=>x.teamId===t.teamId)?.name??String(t.teamId)}</td><td>{t.league==='セ'?'イースタン':'ウエスタン'}</td>{r.pitching&&<td data-number>{stint.IP}</td>}{keys.map(k=><td data-number data-metric={k} key={k}>{s[k]}</td>)}
    </tr>;})}
    </tbody></table>
   </DataTableFrame>
  </details>}
  {legacy&&<div className="farm-note">旧推定（年度不明・実測と合算なし）</div>}
  {!compact&&legacy&&<details><summary>旧推定の保存値を見る</summary>
   {(r.legacy.entries.length?r.legacy.entries:[{stats:player?.stats2}]).map((entry,i)=><p key={i}>
    {['PA','AB','H','HR','IP','ER','W'].filter(k=>entry.stats?.[k]!=null).map(k=>`${k} ${entry.stats[k]}`).join('・')}
   </p>)}
  </details>}
  {!compact&&r.status==='measured'&&<p className="farm-note">—：分母不足で算出不可。0は記録済み。{r.pitching?'セーブ・ホールドは未対応。':'犠打・犠飛は簡易モデル上0。'}</p>}
 </div>;
}

export const FARM_STAT_LABELS={G:'出場',GS:'先発',PA:'打席',AB:'打数',H:'安打',D:'二塁打',T:'三塁打',HR:'本塁打',BB:'四球',HBP:'死球',K:'三振',RBI:'打点',R:'得点',SF:'犠飛（モデル上0）',SH:'犠打（モデル上0）',outs:'投球アウト数',BF:'対戦打者',Hp:'被安打',Kp:'奪三振',BBp:'与四球',HBPp:'与死球',HRp:'被本塁打',Rallowed:'失点',ER:'自責点',W:'勝',L:'敗',QS:'QS'};
export function FarmPlayerHistory({state={},player,playerId=player?.id,initialYear=null}) {
 const years=selectFarmYears(state),[selectedYear,setYear]=useState(initialYear);
 const year=years.includes(selectedYear)?selectedYear:years[0]??state.year;
 return <div className="farm-player-history" data-ds="farm-record">
  {years.length>0&&<label>年度 <select aria-label="選手二軍年度" value={year} onChange={e=>setYear(Number(e.target.value))}>
   {years.map(y=><option key={y} value={y}>{y}年</option>)}
  </select></label>}
  <FarmRecordScope state={state} year={year}/>
  <FarmRecordSummary state={state} player={player} playerId={playerId} year={year} detail/>
 </div>;
}
