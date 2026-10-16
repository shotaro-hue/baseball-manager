import React,{useCallback,useState} from 'react';
import {Button} from './design-system/primitives';
import {useResultDialog} from './useResultDialog';

export default function DraftEndSelection({onEnd,disabled=false}) {
  const [confirm,setConfirm]=useState(false);
  const close=useCallback(()=>setConfirm(false),[]);
  const ref=useResultDialog(close,confirm);
  return <><Button variant="secondary" disabled={disabled} onClick={()=>setConfirm(true)}>選択を終了する</Button>
    {confirm&&<section ref={ref} className="draft-confirm" role="dialog" aria-modal="true" aria-label="選択終了の確認">
      <h2>今年の指名を終了しますか？</h2><p>確定済みの指名は保持します。この年のドラフトには再参加できません。</p>
      <div className="draft-actions"><Button variant="secondary" onClick={close}>指名を続ける</Button>
        <Button onClick={()=>{close();onEnd();}}>選択終了を確定</Button></div>
    </section>}</>;
}
