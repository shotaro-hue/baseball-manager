import {readLocalPlayerMaster, MAX_LOCAL_MASTER_BYTES} from './localPlayerMaster';

// User-imported data stays on this origin, separate from game saves and backups.
const DATABASE='npb-player-master-v1', STORE='selection', KEY='opening-2026';
const MARKER='npb-local-player-master-selected';
// Avoid opening any database on the normal title/resume path. Only one byte is
// stored here; the potentially large roster lives exclusively in IndexedDB.
export function hasRememberedPlayerMaster(){
 try{return canRememberPlayerMaster()&&globalThis.localStorage?.getItem(MARKER)==='1';}catch{return false;}
}
export const canRememberPlayerMaster=()=>typeof globalThis.indexedDB?.open==='function';

function access(mode, operation) {
 return new Promise((resolve,reject)=>{
  if(!canRememberPlayerMaster())return reject(Error('このブラウザでは名簿を記憶できません'));
  let db,transaction,result,settled=false;
  const finish=(error)=>{
   if(settled)return;settled=true;clearTimeout(timer);db?.close();
   if(error)reject(error);else resolve(result);
  };
  const timer=setTimeout(()=>{try{transaction?.abort();}catch{}finish(Error('名簿の保存領域に接続できませんでした'));},3000);
  let request;
  try{request=indexedDB.open(DATABASE,1);}catch(e){finish(e);return;}
  request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE);};
  request.onerror=()=>finish(request.error||Error('名簿の保存領域を開けませんでした'));
  request.onblocked=()=>finish(Error('他のタブを閉じて名簿を再選択してください'));
  request.onsuccess=()=>{
   db=request.result;if(settled){db.close();return;}
   db.onversionchange=()=>db.close();
   try {
    transaction=db.transaction(STORE,mode);
    const action=operation(transaction.objectStore(STORE));
    action.onsuccess=()=>{result=action.result;};
    transaction.oncomplete=()=>finish();
    transaction.onerror=()=>finish(transaction.error||Error('名簿を記憶できませんでした'));
    transaction.onabort=()=>finish(transaction.error||Error('名簿の保存が中断されました'));
   }catch(e){finish(e);}
  };
 });
}

export async function loadRememberedPlayerMaster() {
 const text=await access('readonly',store=>store.get(KEY));
 if(text==null)return null;
 if(typeof text!=='string')throw Error('記憶した名簿が壊れています。標準名簿に戻すか、ファイルを選び直してください');
 return readLocalPlayerMaster({size:new TextEncoder().encode(text).byteLength,text:async()=>text});
}
export async function rememberPlayerMaster(master) {
 const text=JSON.stringify(master),size=new TextEncoder().encode(text).byteLength;
 if(size>MAX_LOCAL_MASTER_BYTES)throw Error('8MB以下の名簿JSONを選んでください');
 await readLocalPlayerMaster({size,text:async()=>text});
 await access('readwrite',store=>store.put(text,KEY));
 globalThis.localStorage.setItem(MARKER,'1');
}
export async function forgetPlayerMaster({deleteRequired=true}={}) {
 // Stop auto-selection first, even if deletion subsequently fails.
 globalThis.localStorage?.removeItem(MARKER);
 try {
  if(canRememberPlayerMaster())await access('readwrite',store=>store.delete(KEY));
  return true;
 }catch(error){
  // Selecting a new file must remain usable without persistent storage. This
  // fallback is safe only after the old automatic-selection marker was cleared.
  if(deleteRequired)throw error;
  return false;
 }
}
