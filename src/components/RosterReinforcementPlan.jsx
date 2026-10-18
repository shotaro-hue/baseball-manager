import React,{useState} from 'react';
import {Button} from './design-system/primitives';
import {useResultDialog} from './useResultDialog';
import {newReinforcementPlan,reinforcementProjection} from '../engine/rosterPlanning';
import {isIkuseiPlayer} from '../engine/rosterCapacity';
import {ownedPlayers} from '../engine/renewalRules';

function EditPlan({team,plan,year,teams,onSave,onClose}){
 const [value,setValue]=useState(()=>plan.reinforcements||newReinforcementPlan(team,year));
 const [error,setError]=useState(''),ref=useResultDialog(onClose,true);
 const set=(key,raw)=>setValue(prev=>({...prev,[key]:raw===''?'':Number(raw)}));
 const save=()=>{
  const candidate={...value,draftGoal:value.draftGoal===''?null:value.draftGoal,faGoal:value.faGoal===''?null:value.faGoal};
  if(!reinforcementProjection(team,{...plan,reinforcements:candidate},year,teams).ok){setError('予定人数を整数で指定してください。ドラフトは0〜10人、FAは0〜70人です。');return;}
  onSave(candidate);onClose();
 };
 return <div className="planning-overlay"><section className="planning-dialog" data-ds="planning-dialog" data-reinforcement-dialog role="dialog" aria-modal="true" aria-labelledby="reinforcement-title" ref={ref}>
  <h2 id="reinforcement-title" tabIndex={0}>補強予定</h2><p>当年の合計予定です。獲得・指名済みの人数は、残りの予定から差し引きます。</p>
  <div style={{display:'grid',gap:12}}>{[['draftGoal','ドラフト予定人数',10],['faGoal','FA予定人数',70]].map(([key,label,max])=><label key={key}>{label}<input style={{display:'block',width:'100%',boxSizing:'border-box'}} aria-label={label} type="number" inputMode="numeric" min={0} max={max} value={value[key]} onChange={e=>set(key,e.target.value)}/></label>)}</div>
  <fieldset><legend>育成から支配下登録する予定</legend>{ownedPlayers(team).filter(isIkuseiPlayer).map(p=><label style={{display:'block'}} key={p.id}><input type="checkbox" checked={value.conversionIds.includes(p.id)} onChange={e=>setValue(prev=>({...prev,conversionIds:e.target.checked?[...prev.conversionIds,p.id]:prev.conversionIds.filter(id=>id!==p.id)}))}/>{p.name}</label>)}{!ownedPlayers(team).some(isIkuseiPlayer)&&<p>対象の育成選手はいません。</p>}</fieldset><p>育成昇格は予定のみです。実際の支配下登録は編成画面で別途行います。</p>
  <p>通常65〜67人、途中補強用に3枠を残すのが目安です。70人までの獲得は可能です。予定だけで契約・放出・支配下登録は実行しません。</p>
  {error&&<p role="alert">{error}</p>}<div className="planning-actions"><Button variant="secondary" onClick={onClose}>変更せず戻る</Button><Button onClick={save}>予定を保存</Button></div>
 </section></div>;
}
export default function RosterReinforcementPlan({team,plan,year,teams,onSave}){
 const [open,setOpen]=useState(false),projection=reinforcementProjection(team,plan,year,teams);
 return <div className="planning-note" data-reinforcement-plan>
  {projection.ok&&projection.recorded?<p>補強予定の残り：ドラフト{projection.draftRemaining}人 · FA{projection.faRemaining}人 · 育成昇格{projection.conversionRemaining}人</p>:<p>{projection.recorded?'補強予定を確認してください':'補強予定は未設定です'}</p>}
  <Button variant="secondary" onClick={()=>setOpen(true)}>補強予定を編集</Button>
  {open&&<EditPlan {...{team,plan,year,teams,onSave}} onClose={()=>setOpen(false)}/>}
 </div>;
}
