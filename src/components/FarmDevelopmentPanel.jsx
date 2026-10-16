import { evaluateRosterCapacity, isIkuseiPlayer } from '../engine/rosterCapacity';
import { RosterCapacitySummary } from './RosterCapacitySummary';
import React,{useState,useRef,useCallback} from 'react';
import {Button,DataTableFrame} from './design-system/primitives';
import {FarmRecordScope,FarmRecordSummary} from './FarmRecordSummary';
import {useResultDialog} from './useResultDialog';
import {settingNumber} from './rosterSettingMetrics';
import {promotionReasons,registrationPreview} from './farmDevelopmentDisplay';
import {DEV_GOALS_BATTER,DEV_GOALS_PITCHER,MAX_ROSTER,MAX_SHIHAKA_TOTAL} from '../constants';
import {fmtSal} from '../utils';
import './farm-development.css';

const money=v=>Number.isFinite(v)?fmtSal(v):'— 未記録';
function RegistrationDialog({team,player,onClose,onConfirm,draftContext}) {
 const close=useCallback(()=>onClose(),[onClose]);
 const ref=useResultDialog(close,true),submitted=useRef(false);
 const preview=registrationPreview(team,player,draftContext);
 return <div className="farm-confirm-overlay">
  <div className="farm-registration-dialog" data-ds="farm-registration" role="dialog" aria-modal="true" aria-label="支配下登録の確認" ref={ref}>
   <h2>支配下登録の確認</h2><p><strong>{player.name}</strong> · {team.name}</p>
   <dl><dt>支配下人数</dt><dd>{preview.count == null ? '未確認' : `${preview.count} → ${preview.count+1}`}  / {MAX_SHIHAKA_TOTAL}人</dd>
    <dt>現在年俸（年額）</dt><dd>{money(player.salary)}</dd><dt>登録後年俸（年額）</dt><dd>{money(preview.salary)}</dd>
    <dt>予算からの差額控除</dt><dd>{money(preview.difference)}</dd><dt>登録後の予算</dt><dd>{money(preview.remaining)}</dd>
    <dt>登録後の契約</dt><dd>1年・残り1年、育成年数0年</dd></dl>
   <p>二軍の支配下選手になります。一軍昇格は登録後に別操作で行います。確定後、この画面から登録を取り消す操作はありません。</p>
   {preview.reasons.length>0&&<p role="alert">{preview.reasons.join(' / ')}</p>}
   <div className="farm-dialog-actions"><Button variant="secondary" onClick={onClose}>戻る</Button>
    <Button disabled={preview.reasons.length>0||!onConfirm} onClick={()=>{
     if(submitted.current||preview.reasons.length||!onConfirm)return;
     submitted.current=true;onConfirm(player.id);onClose();
    }}>登録を確定</Button></div>
  </div>
 </div>;
}
export function FarmDevelopmentPanel({team,farmState,onSetDevGoal,onPlayerClick,onPromo,onConvertIkusei,draftContext={}}) {
 const [confirmId,setConfirmId]=useState(null);
 const closeConfirmation=useCallback(()=>setConfirmId(null),[]);
 const confirming=team.farm.find(p=>p.id===confirmId);
 const eligible=team.farm.filter(p=>!isIkuseiPlayer(p)&&(p.injuryDaysLeft??0)===0&&(p.registrationCooldownDays??0)===0);
 const recommendations=team.players.length<MAX_ROSTER?eligible.slice().sort((a,b)=>(b.potential??50)-(a.potential??50)).slice(0,3):[];
 const capacity=evaluateRosterCapacity(team,draftContext);
 return <section className="card roster-settings-ui farm-development" data-ds="farm-development" aria-label="二軍育成・起用">
  <header className="farm-development-heading"><h2>二軍育成・起用（{team.farm.length}人）</h2><p>目標と記録を確認して、一軍への起用を判断する。</p></header>
  <p className="farm-capacity">一軍 {team.players.length}/{MAX_ROSTER}人</p>
  <RosterCapacitySummary capacity={capacity} className="farm-capacity"/>
  <FarmRecordScope state={farmState} teamId={team.id}/>
  {recommendations.length>0&&<p className="farm-recommendation">一軍枠に空き（{MAX_ROSTER-team.players.length}枠）· 昇格推薦：{recommendations.map(p=>p.name).join('、')}<small>既存の潜在能力順。実行可否は各選手の表示を確認してください。</small></p>}
  <DataTableFrame label="二軍育成・起用一覧。横にスクロールできます" className="farm-development-table">
   <table><thead><tr><th scope="col">選手・状態</th><th scope="col">育成目標・起用・二軍実測</th></tr></thead><tbody>
    {team.farm.map(p=>{
     const promotion=promotionReasons(team,p),registration=registrationPreview(team,p,draftContext);
     const goals=p.isPitcher?DEV_GOALS_PITCHER:DEV_GOALS_BATTER;
     const goalLabel=goals.find(g=>g.key===(p.devGoal||''))?.label;
     return <tr key={p.id} data-player-id={p.id}><td>
      <button type="button" className="settings-player" aria-label={`${p.name}の選手詳細を開く`} disabled={!onPlayerClick} onClick={()=>onPlayerClick?.(p,team.name)}>{p.name}</button>
      <p>{p.isPitcher?p.subtype||'投手':p.pos} · {settingNumber(p.age)}歳</p>
      <p>{isIkuseiPlayer(p)?`育成契約 · ${p.ikuseiYears??0}年`:'二軍支配下'}</p>
      <p>潜在 {settingNumber(p.potential)}<br/>{p.isPitcher?'球速能力':'ミート'} {settingNumber(p.isPitcher?p.pitching?.velocity:p.batting?.contact)}</p>
      <p>状態 {settingNumber(p.condition)}</p>
      {(p.injuryDaysLeft??0)>0&&<p className="farm-warning">負傷中 · 残{p.injuryDaysLeft}試合</p>}
      {(p.registrationCooldownDays??0)>0&&<p className="farm-warning">再登録まで{p.registrationCooldownDays}日</p>}
     </td><td>
      <label className="farm-goal-label">育成目標<select aria-label={`${p.name}の育成目標`} value={p.devGoal||''} disabled={!onSetDevGoal} onChange={e=>onSetDevGoal?.(p.id,e.target.value||null)}>{goals.map(g=><option key={g.key} value={g.key}>{g.label}</option>)}</select></label>
      <p className="farm-current-goal">現在：{goalLabel??'不明な保存設定'}</p>
      <div className="farm-row-actions">{isIkuseiPlayer(p)
       ?<Button aria-label={`${p.name}を支配下登録する`} disabled={registration.reasons.length>0||!onConvertIkusei} onClick={()=>setConfirmId(p.id)}>支配下登録</Button>
       :<Button aria-label={`${p.name}を一軍へ`} disabled={promotion.length>0||!onPromo} onClick={()=>{if(!promotion.length)onPromo?.(p.id);}}>一軍へ</Button>}</div>
      {(isIkuseiPlayer(p)?registration.reasons:promotion).length>0&&<p className="farm-warning">{(isIkuseiPlayer(p)?registration.reasons:promotion).join(' / ')}</p>}
      <div className="farm-row-record"><FarmRecordSummary state={farmState} player={p} compact/></div>
     </td></tr>;
    })}
   </tbody></table>
  </DataTableFrame>
  {!team.farm.length&&<p className="farm-empty">二軍選手なし</p>}
  <details className="farm-help"><summary>記録と操作の見方</summary><p>二軍実測は年度・記録開始時点を確認してください。一軍成績や旧推定とは合算しません。数値0は記録済み、分母不足の「—」は算出不可。育成目標は実データへの反映後に表示が切り替わります。保存状態は画面上部で確認してください。</p></details>
  {isIkuseiPlayer(confirming)&&<RegistrationDialog team={team} player={confirming} draftContext={draftContext} onClose={closeConfirmation} onConfirm={onConvertIkusei}/>}
 </section>;
}
