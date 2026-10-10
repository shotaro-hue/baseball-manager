import {openBaseballManagerDb,BASEBALL_MANAGER_DB_STORES} from './baseballManagerDb';
import {getCareerEntryKey} from './careerStats';
import {readCareerGeneration,GENERATION_VERSION} from './saveGenerations';

function playersIn(state) {
  return [...(state.teams || []).flatMap(t=>[...(t.players || []),...(t.farm || []),...(t.history || [])]),...(state.faPool || [])];
}
export function captureInlineCareerLogs(state) {
  const logs=new Map();
  for(const player of playersIn(state)) {
    if(player?.id==null) continue;
    const id=String(player.id);
    logs.set(id,mergeEntries(logs.get(id)||[],[...(player.careerLog || []),...(player.recentCareerLog || [])]));
  }
  return structuredClone([...logs]);
}
function mergeEntries(a,b) {
  const entries=new Map();
  for(const row of [...a,...b]) {
    if (!row || !Number.isInteger(Number(row.year)) || Number(row.year)<=0 || Number(row.year)>9999) throw new Error('invalid_career_entry');
    entries.set(getCareerEntryKey(row),row);
  }
  return [...entries.values()].sort((a,b)=>Number(a.year)-Number(b.year));
}
async function readLegacy(ids) {
  const db=await openBaseballManagerDb();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(BASEBALL_MANAGER_DB_STORES.careerLogs,'readonly'),result=new Map();
    for(const id of ids) {
      const store=tx.objectStore(BASEBALL_MANAGER_DB_STORES.careerLogs),req=store.get(id);
      req.onsuccess=()=>{if(Array.isArray(req.result)) result.set(id,req.result);};
      // Very old inline migration wrote numeric IDs directly, including zero.
      if(Number.isFinite(Number(id)) && String(Number(id))===id) {
        const numeric=store.get(Number(id));numeric.onsuccess=()=>{if(!result.has(id) && Array.isArray(numeric.result))result.set(id,numeric.result);};
      }
    }
    tx.oncomplete=()=>{db.close();resolve(result);};
    tx.onabort=tx.onerror=()=>{db.close();reject(tx.error || new Error('legacy_career_read_failed'));};
  });
}
// undefined means reuse the verified committed reference, never the latest fixed key.
export async function prepareCareerData(state,previous,options={},legacyInline=[],sourceState=state) {
  const sameGame=previous?.saveId===state.saveId;
  const current=sameGame && previous?.saveDataVersion===GENERATION_VERSION;
  const initial=options.initialCareerLogs;
  const patches=options.careerEntries || [];
  if (current && initial===undefined && patches.length===0) return undefined;
  let data;
  if (current && initial===undefined) data=await readCareerGeneration(previous);
  else {
    const players=playersIn(sourceState),ids=[...new Set(players.filter(p=>p?.id!=null).map(p=>String(p.id)))];
    const adoptLegacy=sameGame && initial===undefined;
    const logs=adoptLegacy?await readLegacy(ids):new Map();
    if(adoptLegacy) for(const [id,entries] of legacyInline) logs.set(id,mergeEntries(logs.get(id)||[],entries));
    const initialIds=new Set();
    if(initial!==undefined) {
      if(!Array.isArray(initial)) throw new Error('invalid_initial_career_logs');
      for(const item of initial) {
        const id=String(item?.playerId ?? '');
        if(!id || !Array.isArray(item.careerEntries)) throw new Error('invalid_initial_career_log');
        logs.set(id,mergeEntries([],item.careerEntries));initialIds.add(id);
      }
    }
    for(const player of players) {
      if(player?.id==null) continue;
      const id=String(player.id);if(initialIds.has(id)) continue;
      logs.set(id,mergeEntries(logs.get(id)||[],[...(player.careerLog || []),...(player.recentCareerLog || [])]));
    }
    data={version:1,origin:adoptLegacy?'legacy-player-id':'game-initial-history',players:[...logs]};
  }
  const logs=new Map(data.players);
  for(const item of patches) {
    const id=String(item?.playerId ?? '');
    if(!id || !item.careerEntry) throw new Error('invalid_career_patch');
    logs.set(id,mergeEntries(logs.get(id)||[],[item.careerEntry]));
  }
  return {...data,players:[...logs]};
}
