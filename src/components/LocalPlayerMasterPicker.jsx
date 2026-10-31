import {useRef,useState} from 'react';
import {readLocalPlayerMaster} from '../data/localPlayerMaster';

export default function LocalPlayerMasterPicker({disabled,onChange,onBusy}) {
 const [master,setMaster]=useState(null),[error,setError]=useState('');
 const epoch=useRef(0);
 const select=async event=>{
  const file=event.target.files?.[0];if(!file||disabled)return;
  const attempt=++epoch.current;onBusy(true);setError('');
  // Invalid replacement must not silently leave the old selection active.
  setMaster(null);onChange(null);
  try {
   const next=await readLocalPlayerMaster(file);if(attempt!==epoch.current)return;
   setMaster(next);onChange(next);
  }catch(e){if(attempt===epoch.current)setError(e.message);}
  finally{event.target.value='';if(attempt===epoch.current)onBusy(false);}
 };
 return <details style={{textAlign:'left',margin:'12px 0',maxWidth:'100%'}}>
  <summary>選手名簿ファイルを使う（新規ゲーム）</summary>
  <p style={{fontSize:12}}>利用できる名簿JSONを選択してください。読み込んだ選手はこの端末の新規ゲームに使用します。</p>
  <input aria-label="選手名簿JSON" type="file" accept=".json,application/json" disabled={disabled} onChange={select} style={{maxWidth:'100%'}} />
  {master&&<p role="status" style={{fontSize:12}}>{master.asOf}：実在{master.players.length}名（育成{master.players.filter(p=>p.registration==='development').length}名）。年俸・契約・適性・外国人枠・FA日数には未確認値やゲーム設定を含む場合があります。</p>}
  {error&&<p role="alert" style={{color:'#f87171',fontSize:12,overflowWrap:'anywhere'}}>{error}</p>}
  {master&&<button type="button" className="btn" disabled={disabled} onClick={()=>{epoch.current++;setMaster(null);setError('');onChange(null);}}>標準名簿に戻す</button>}
 </details>;
}
