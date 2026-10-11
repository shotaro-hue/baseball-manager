import React from 'react';
import {selectFarmPlayer,selectFarmTeams} from '../engine/farmSelectors';
import {fmtAvg} from '../utils';

export function FarmRecordScope({state={},teamId}) {
 const c=state.farmCompetition;
 if(!c)return <p>二軍実測：未記録</p>;
 const row=selectFarmTeams(state).find(t=>t.teamId===teamId);
 return <p style={{fontSize:14,color:'#53657c',lineHeight:1.6,margin:'8px 0'}}>
  {c.year}年 二軍実測（簡易試合モデル）・{c.startRound>1?`${c.startRound}試合目からの途中記録`:'開幕から記録'}
  {row&&<>・予定消化{row.scheduled}／実施{row.played}／未実施{row.unplayed}</>}
 </p>;
}
export function FarmRecordSummary({state={},player,compact=false}) {
 const r=selectFarmPlayer(state,player.id);
 const legacy=r.legacy.entries.length>0||(!state.farmCompetition&&player.stats2!=null);
 return <div style={{fontSize:14,lineHeight:1.6,fontVariantNumeric:'tabular-nums',overflowWrap:'anywhere'}}>
  {r.status==='unrecorded'?<span>二軍実測：未記録</span>:<>
   {!compact&&<span>{r.year}年 二軍実測・球団間合計（{r.partial?`${r.startRound}試合目からの途中記録`:'開幕から記録'}）<br/></span>}
   {r.batting?<span>{r.batting.PA}打席／{r.batting.AB}打数・打率 {r.AVG===null?'—':fmtAvg(r.batting.H,r.batting.AB)}・{r.batting.HR}本塁打</span>
    :<span>{r.pitching.G}登板・{r.IP}回・防御率 {r.ERA===null?'—':r.ERA.toFixed(2)}・{r.pitching.W}勝</span>}
  </>}
  {legacy&&<div style={{color:'#53657c'}}>旧推定（年度不明・実測と合算なし）</div>}
  {!compact&&legacy&&<details><summary>旧推定の保存値を見る</summary>
   {(r.legacy.entries.length?r.legacy.entries:[{stats:player.stats2}]).map((entry,i)=><p key={i}>
    {['PA','AB','H','HR','IP','ER','W'].filter(k=>entry.stats?.[k]!=null).map(k=>`${k} ${entry.stats[k]}`).join('・')}
   </p>)}
  </details>}
  {!compact&&r.status==='measured'&&<p style={{color:'#53657c',margin:'4px 0'}}>—：分母不足で算出不可。0は記録済み。{r.pitching?'セーブ・ホールドは未対応。':'犠打・犠飛は簡易モデル上0。'}</p>}
 </div>;
}
