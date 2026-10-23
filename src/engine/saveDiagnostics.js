import {openBaseballManagerDb,BASEBALL_MANAGER_DB_STORES} from './baseballManagerDb';

// Local, bounded metadata only. Never include payloads, IDs, exception messages,
// stacks or player/club data; diagnostics are not sent to a server.
const exceptionNames = new Set(['Error', 'TypeError', 'RangeError', 'DataCloneError',
  'QuotaExceededError', 'SecurityError', 'AbortError', 'UnknownError', 'InvalidStateError',
  'TransactionInactiveError', 'ConstraintError', 'NotFoundError', 'VersionError', 'NotAllowedError', 'StorageUpgradeBlockedError', 'StorageOpenTimeoutError']);

export function saveFailure(reason, { step, api, error, queue, quota = false } = {}) {
  let storage = { rootBytes: null, backupBytes: null };
  try {
    const size = key => (localStorage.getItem(key)?.length ?? 0) * 2;
    storage = { rootBytes: size('baseball_manager_v1'),
      backupBytes: size('baseball_manager_v1_bk1') + size('baseball_manager_v1_bk2') };
  } catch { /* Storage access itself may be the failure. */ }
  const diagnostics = { version: 1, reason, quota: quota || error?.name === 'QuotaExceededError', step, api,
    exceptionName: exceptionNames.has(error?.name) ? error.name : error ? 'Error' : null,
    queue: { isSaving: Boolean(queue?.isSaving), hasQueuedSave: Boolean(queue?.hasQueuedSave) }, storage };
  console.warn('[SaveDiagnostic]', diagnostics);
  return { ok: false, quota: quota || error?.name === 'QuotaExceededError', reason, diagnostics };
}

const reasons = new Set(['invalid_state','sanitize_state_failed','storage_read_failed','stale_save','farm_payload_missing',
  'indexeddb_write_failed','serialization_failed','compression_failed','quota_exceeded','storage_write_failed','save_conflict',
  'save_failed','save_lock_failed','save_lock_unavailable','snapshot_failed','save_verification_failed','session_changed','transition_in_progress',
  'storage_upgrade_blocked','storage_version_outdated','storage_open_timeout','archive_receipt_missing']);
const steps = new Set(['validate_state','validate_previous','prepare_generation','serialize_state','compress_state','prepare_root_body',
  'verify_root','prepare_rotation','commit_root','snapshot','observe_root','check_conflict','save','acquire_lock']);
const apis = new Set(['saveGame','validateFarmSaveState','localStorage.getItem','localStorage.setItem','IndexedDB','JSON.stringify','LZString.compressToUTF16','CompressionStream','structuredClone','navigator.locks.request']);
const number = n => Number.isFinite(n) && n >= 0 ? n : null;

export async function collectSaveDiagnostics(result) {
  const d = result?.diagnostics;
  const report = {version:2,reason:reasons.has(result?.reason ?? d?.reason) ? result?.reason ?? d.reason : 'unknown_save_failure',
    step:steps.has(d?.step)?d.step:null,api:apis.has(d?.api)?d.api:null,
    exceptionName:exceptionNames.has(d?.exceptionName)?d.exceptionName:null,dirty:typeof d?.dirty==='boolean'?d.dirty:null,
    queue:{isSaving:Boolean(d?.queue?.isSaving),hasQueuedSave:Boolean(d?.queue?.hasQueuedSave)},
    localStorage:{available:false},indexedDB:{available:false},originEstimate:null};
  try {
    let totalBytes=0;
    for(let i=0;i<localStorage.length;i++) {
      const key=localStorage.key(i);totalBytes+=(key.length+(localStorage.getItem(key)?.length??0))*2;
    }
    const bytes=k=>(localStorage.getItem(k)?.length??0)*2;
    report.localStorage={available:true,unit:'UTF16-estimate',totalBytes,primaryBytes:bytes('baseball_manager_v1'),
      backup1Bytes:bytes('baseball_manager_v1_bk1'),backup2Bytes:bytes('baseball_manager_v1_bk2')};
  } catch { /* No key names or exception bodies enter the report. */ }
  try {
    const estimate=await globalThis.navigator?.storage?.estimate?.();
    if(estimate) report.originEstimate={usage:number(estimate.usage),quota:number(estimate.quota)};
  } catch { /* Optional origin-wide estimate, not the localStorage quota. */ }
  try {
    const db=await openBaseballManagerDb();
    report.indexedDB=await new Promise((resolve,reject)=>{
      const names=Object.values(BASEBALL_MANAGER_DB_STORES).filter(name=>db.objectStoreNames.contains(name)),tx=db.transaction(names,'readonly'),stores={};
      for(const name of names) {
        const summary={rows:0,jsonBytes:0,rootBodies:0,generations:0,rootBodyBytes:0,generationBytes:0,scopeBytes:{}};stores[name]=summary;
        const req=tx.objectStore(name).openCursor();
        req.onsuccess=()=>{const cursor=req.result;if(!cursor)return;summary.rows++;
          let bytes=null;try{bytes=JSON.stringify(cursor.value).length*2;}catch{summary.jsonBytes=null;}
          if(summary.jsonBytes!==null&&bytes!==null)summary.jsonBytes+=bytes;
          if(String(cursor.key).startsWith('root-body:')){summary.rootBodies++;summary.rootBodyBytes+=bytes??0;}
          if(String(cursor.key).startsWith('generation:')){summary.generations++;summary.generationBytes+=bytes??0;}
          const scope=cursor.value?.scope;
          if(['news','mailbox','seasonHistory','matchHistory','careerLogs'].includes(scope))summary.scopeBytes[scope]=(summary.scopeBytes[scope]??0)+(bytes??0);
          cursor.continue();};
      }
      tx.oncomplete=()=>{db.close();resolve({available:true,unit:'JSON-UTF16-estimate',stores});};
      tx.onabort=tx.onerror=()=>{db.close();reject(tx.error);};
    });
  } catch { /* Storage denial must still leave a copyable report. */ }
  return report;
}
