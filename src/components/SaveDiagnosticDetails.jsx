import {useState} from 'react';
import {collectSaveDiagnostics} from '../engine/saveDiagnostics';

export default function SaveDiagnosticDetails({result}) {
  const [report,setReport]=useState('');
  const [status,setStatus]=useState('');
  const [busy,setBusy]=useState(false);
  const copy=async()=>{
    if(busy)return;
    setBusy(true);
    try {
      const text=JSON.stringify(await collectSaveDiagnostics(result),null,2);
      setReport(text);
      try {await navigator.clipboard.writeText(text);setStatus('保存診断をコピーしました。');}
      catch {setStatus('下の診断を長押しして、すべて選択・コピーしてください。');}
    } finally {setBusy(false);}
  };
  return <details className="save-diagnostic-details" style={{maxWidth:'100%',overflowWrap:'anywhere'}}>
    <summary style={{minHeight:44,padding:'12px 0',cursor:'pointer'}}>保存エラーの詳細</summary>
    <p>セーブ本文や選手名を含まない容量・エラー情報です。</p>
    <button type="button" onClick={copy} disabled={busy} style={{minHeight:44,padding:'8px 12px'}}>保存診断をコピー</button>
    <p role="status">{status}</p>
    {report&&<textarea aria-label="保存診断（選択してコピーできます）" readOnly value={report} rows={8}
      onFocus={event=>event.target.select()} style={{width:'100%',maxWidth:'28rem',boxSizing:'border-box'}}/>}
  </details>;
}
