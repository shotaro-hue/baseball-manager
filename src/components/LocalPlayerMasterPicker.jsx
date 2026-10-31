import {useEffect,useRef,useState} from 'react';
import {readLocalPlayerMaster} from '../data/localPlayerMaster';
import {hasRememberedPlayerMaster,loadRememberedPlayerMaster,rememberPlayerMaster,forgetPlayerMaster} from '../data/rememberedPlayerMaster';

export default function LocalPlayerMasterPicker({disabled,onChange,onBusy}) {
 const [master,setMaster]=useState(null),[error,setError]=useState(''),[remembered,setRemembered]=useState(false);
 const [storageIssue,setStorageIssue]=useState(false);
 const epoch=useRef(0),busy=useRef(hasRememberedPlayerMaster()),callbacks=useRef({onChange,onBusy});
 callbacks.current={onChange,onBusy};
 const setBusy=value=>{busy.current=value;callbacks.current.onBusy(value);};
 useEffect(()=>{
  if(!hasRememberedPlayerMaster())return;
  const attempt=++epoch.current;setBusy(true);
  loadRememberedPlayerMaster().then(next=>{
   if(attempt!==epoch.current)return;
   if(!next)throw Error('記憶した名簿が見つかりません');
   setMaster(next);setRemembered(Boolean(next));callbacks.current.onChange(next);
  }).catch(()=>{
   if(attempt!==epoch.current)return;
   setStorageIssue(true);setError('記憶した名簿を読み込めませんでした。現在は標準名簿です。ファイルを選び直すか、標準名簿に戻してください。');
  }).finally(()=>{if(attempt===epoch.current)setBusy(false);});
  return ()=>{epoch.current++;};
 },[]);
 const select=async event=>{
  const target=event.target,file=target.files?.[0];if(!file||disabled||busy.current)return;
  const attempt=++epoch.current;setBusy(true);setError('');
  setMaster(null);setRemembered(false);callbacks.current.onChange(null);
  try {
   // An invalid replacement must not resurrect an older selection on reload.
   await forgetPlayerMaster({deleteRequired:false});
   const next=await readLocalPlayerMaster(file);if(attempt!==epoch.current)return;
   setMaster(next);callbacks.current.onChange(next);setStorageIssue(false);
   try {
    await rememberPlayerMaster(next);
    if(attempt===epoch.current)setRemembered(true);
   }catch {
    if(attempt===epoch.current){setStorageIssue(true);setError('今回の新規ゲームには使えますが、端末への記憶に失敗しました。次回はファイルを選び直してください。');}
   }
  }catch(e){if(attempt===epoch.current){setStorageIssue(true);setError(e.message);}}
  finally{target.value='';if(attempt===epoch.current)setBusy(false);}
 };
 const reset=async()=>{
  if(disabled||busy.current)return;
  const attempt=++epoch.current;setBusy(true);
  try {
   await forgetPlayerMaster();
   if(attempt!==epoch.current)return;
   setMaster(null);setRemembered(false);setStorageIssue(false);setError('');callbacks.current.onChange(null);
  }catch{if(attempt===epoch.current)setError('記憶した名簿を消去できませんでした。時間をおいて再試行してください。');}
  finally{if(attempt===epoch.current)setBusy(false);}
 };
 return <div style={{textAlign:'left',margin:'12px 0',maxWidth:'100%'}}>
  <details>
   <summary>{master?`新規ゲームの名簿：${master.players.length}名${remembered?'（記憶済み）':''}`:'選手名簿ファイルを使う（新規ゲーム）'}</summary>
   <p style={{fontSize:12}}>選んだ名簿をこの端末に記憶し、次回の新規ゲームにも使用します。既存セーブは変更しません。ブラウザのデータを削除すると、名簿の再選択が必要です。</p>
   <input aria-label="選手名簿JSON" type="file" accept=".json,application/json" disabled={disabled} onChange={select} style={{maxWidth:'100%'}} />
   {(master||storageIssue)&&<button type="button" className="btn" disabled={disabled} onClick={reset}>標準名簿に戻す</button>}
  </details>
  {master&&<p role="status" style={{fontSize:12}}>{master.asOf}：実在{master.players.length}名（育成{master.players.filter(p=>p.registration==='development').length}名）。年俸・契約・適性・外国人枠・FA日数には未確認値やゲーム設定を含む場合があります。</p>}
  {error&&<p role="alert" style={{color:'#f87171',fontSize:12,overflowWrap:'anywhere'}}>{error}</p>}
 </div>;
}
