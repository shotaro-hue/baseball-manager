import React,{useState,useRef,useEffect} from 'react';
import {Button,DataTableFrame} from './design-system/primitives';
import {talkCooldown} from './farmDevelopmentDisplay';
import {settingNumber} from './rosterSettingMetrics';
import {TALK_COOLDOWN_DAYS} from '../constants';
import './farm-development.css';

const OPTIONS=[
 {type:'praise',label:'激励する',aria:'を激励する',desc:'変化量 +5〜+15'},
 {type:'playing_time',label:'出場について',aria:'と出場について話す',desc:'出場少：+8〜+15 / 多：+3〜+8'},
 {type:'contract',label:'契約について',aria:'と契約について話す',desc:'既存の年俸判定：+5〜+12 / +2〜+6'},
 {type:'trade_rumor',label:'噂を否定する',aria:'の噂を否定する',desc:'海外志向が高い：−5〜+3 / その他：+2〜+8'},
];
export function PlayerTalkPanel({team,gameDay=0,onPlayerTalk,onPlayerClick}) {
 const [talkingId,setTalkingId]=useState(null),submitted=useRef(false),opener=useRef(null);
 const root=useRef(null),pendingFocus=useRef(null);
 useEffect(()=>{
  if(pendingFocus.current===null)return;
  const id=pendingFocus.current;pendingFocus.current=null;
  const row=Array.from(root.current?.querySelectorAll('tr[data-player-id]')||[]).find(n=>n.dataset.playerId===String(id));
  const name=row?.querySelector('.settings-player');
  if(name&&!name.disabled)name.focus({preventScroll:true});
  else root.current?.querySelector('[data-ds="table"]')?.focus({preventScroll:true});
 },[team,talkingId]);
 const close=()=>{setTalkingId(null);opener.current?.focus?.({preventScroll:true});};
 return <section className="card roster-settings-ui player-talk" data-ds="player-talk" aria-label="選手コミュニケーション" ref={root}>
  <header className="farm-development-heading"><h2>選手コミュニケーション</h2><p>対象：一軍選手。モラルが低い選手から確認する。</p></header>
  <p>同じ選手と話した後は、進行カウンターで{TALK_COOLDOWN_DAYS}試合分の間隔が必要です。</p>
  <DataTableFrame label="一軍選手のモラルと会話操作" className="farm-development-table talk-table">
   <table><thead><tr><th scope="col">選手・モラル</th><th scope="col">会話</th></tr></thead><tbody>
    {[...team.players].sort((a,b)=>(a.morale??70)-(b.morale??70)).map(p=>{
     const left=talkCooldown(p,gameDay),isOpen=talkingId===p.id&&left===0;
     return <tr key={p.id} data-player-id={p.id}><td>
      <button type="button" className="settings-player" aria-label={`${p.name}の選手詳細を開く`} disabled={!onPlayerClick} onClick={()=>onPlayerClick?.(p,team.name)}>{p.name}</button>
      <p>{p.pos} / {settingNumber(p.age)}歳{p.isForeign?' · 外国人':''}</p>
      <p className="talk-morale">モラル {Number.isFinite(p.morale)?p.morale:'— 未記録'}</p>
     </td><td>
      {left>0?<p className="farm-warning">あと{left}試合で会話可能</p>:<Button variant="secondary" aria-label={`${p.name}と話す`} disabled={!onPlayerTalk} aria-expanded={isOpen} onClick={event=>{
       if(isOpen){close();return;}submitted.current=false;opener.current=event?.currentTarget;setTalkingId(p.id);
      }}>話す</Button>}
      {isOpen&&<div className="talk-options" onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}}}>
       <p>{p.name}への会話を選択。選択すると実行されます。</p>
       {OPTIONS.map(opt=><Button key={opt.type} variant="secondary" aria-label={`${p.name}${opt.aria}`} onClick={()=>{
        if(submitted.current||talkCooldown(p,gameDay)>0||!onPlayerTalk)return;
        submitted.current=true;pendingFocus.current=p.id;onPlayerTalk(p.id,opt.type);close();
       }}><span>{opt.label}<small>{opt.desc}</small></span></Button>)}
       <Button variant="secondary" onClick={close}>会話を閉じる</Button>
      </div>}
     </td></tr>;
    })}
   </tbody></table>
  </DataTableFrame>
  {!team.players.length&&<p className="farm-empty">一軍選手なし</p>}
  <p className="farm-talk-note">変化量は既存処理の乱数範囲です。モラルは0〜100の範囲に収まり、最終値は実行後の一覧と通知で確認できます。保存状態は画面上部で確認してください。</p>
 </section>;
}
