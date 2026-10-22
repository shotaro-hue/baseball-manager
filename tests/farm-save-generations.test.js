import { generateSeasonSchedule } from '../src/engine/scheduleGen';
import { beforeEach,afterEach,it,expect,vi } from 'vitest';
import { IDBFactory,IDBObjectStore } from 'fake-indexeddb';
import { saveGame,loadGame,enqueueSaveGame,getLastLoadResult } from '../src/engine/saveload';
import { readRootBody } from '../src/engine/saveRootBodies';
import { openBaseballManagerDb } from '../src/engine/baseballManagerDb';
import { migrateFarmCompetition,advanceFarmYear } from '../src/engine/farmMigration';
import { applyFarmRound } from '../src/engine/farmRecords';
import { simulateFarmRound } from '../src/engine/farmGame';
import { selectFarmTeams } from '../src/engine/farmSelectors';
import { teams } from '../src/engine/__tests__/farmFixtures';
const key='baseball_manager_v1',bk=key+'_bk1';let rows;
const source=(day=1)=>({saveId:'farm-save',year:2026,myId:0,gameDay:day,teams:teams().map(t=>({...t,wins:day-1,losses:0,draws:0})),seasonHistory:{awards:[]},news:[],mailbox:[]});
const initial=()=>migrateFarmCompetition(source());
const played=s=>({...s,gameDay:s.gameDay+1,teams:s.teams.map(t=>({...t,wins:t.wins+1})),farmCompetition:applyFarmRound(s.farmCompetition,
  simulateFarmRound({teams:s.teams,year:s.year,round:s.gameDay,saveId:s.saveId}),s.teams)});
const save=(s,o={})=>saveGame(s,{skipCompression:true,...o});
beforeEach(()=>{rows=new Map();vi.stubGlobal('indexedDB',new IDBFactory());vi.stubGlobal('localStorage',{
  getItem:k=>rows.get(k)??null,setItem:(k,v)=>rows.set(k,String(v)),removeItem:k=>rows.delete(k)});});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});

it('persists independent root records plus shortage reasons with exact round and immutable queued snapshot',async()=>{
  const s=initial();s.teams[0].farm[0]={...s.teams[0].farm[0],pos:'一塁手',positions:{一塁手:100}};const next=played(s);
  expect((await save(s)).ok).toBe(true);
  const expected=structuredClone(next.farmCompetition),job=enqueueSaveGame(next,{skipCompression:true,dirtyScopes:[]});
  next.farmCompetition.players[0].name='mutated';expect((await job).ok).toBe(true);
  const loaded=await loadGame();expect(loaded.farmCompetition).toEqual(expected);expect(loaded.gameDay).toBe(2);
  const missing=loaded.farmCompetition.cards.find(c=>c.status==='unplayed');expect(missing.reasons[0].code).toBe('insufficient-catcher');
  const stand=selectFarmTeams(loaded);expect(stand.find(t=>t.teamId===0)).toMatchObject({scheduled:1,played:0,unplayed:1});
  expect(stand.find(t=>t.teamId===(missing.homeId===0?missing.awayId:missing.homeId)).unplayed).toBe(1);
});
it('rejects lost, corrupt and future root records before committing, preserving valid primary',async()=>{
  const s=initial();await save(s);const raw=rows.get(key);
  const lost={...s};delete lost.farmCompetition;expect((await save(lost)).ok).toBe(false);expect(rows.get(key)).toBe(raw);
  const missingBoth={...s};delete missingBoth.farmCompetition;delete missingBoth.farmCompetitionVersion;
  expect((await save(missingBoth)).ok).toBe(false);expect(rows.get(key)).toBe(raw);
  const bad=played(s);bad.farmCompetition.players[0].teams[0].batting.AB++;
  expect((await save(bad)).ok).toBe(false);expect(rows.get(key)).toBe(raw);
  const future=played(s);future.gameDay=1;future.teams=s.teams;
  expect((await save(future)).ok).toBe(false);expect(rows.get(key)).toBe(raw);
});
it('failed root write and retry never double apply records; backup retains its own round',async()=>{
  const s=initial();await save(s);const raw=rows.get(key),next=played(s),set=localStorage.setItem;
  vi.spyOn(localStorage,'setItem').mockImplementation((k,v)=>{if(k===key)throw Error('disk');set(k,v);});
  expect((await save(next)).ok).toBe(false);expect(rows.get(key)).toBe(raw);expect((await loadGame()).farmCompetition.nextRound).toBe(1);
  vi.restoreAllMocks();expect((await save(next)).ok).toBe(true);
  expect((await loadGame()).farmCompetition).toEqual(next.farmCompetition);
  rows.set(key,'corrupt');const recovered=await loadGame();expect(recovered.gameDay).toBe(1);expect(recovered.farmCompetition.nextRound).toBe(1);
  expect(getLastLoadResult().status).toBe('recovered');
});
it('corrupt/missing farm root field restores old root rather than accepting zeros or future records',async()=>{
  const s=initial();await save(s);await save(played(s));
  const primary=JSON.parse(await readRootBody(rows.get(key)));delete primary.farmCompetition;rows.set(key,JSON.stringify(primary));
  expect((await loadGame()).farmCompetition.nextRound).toBe(1);expect(getLastLoadResult().status).toBe('recovered');
});
it('year archive is forced dirty even with empty scopes; failed year save preserves old root and GC references',async()=>{
  const old=migrateFarmCompetition({...source(144),schedule:generateSeasonSchedule(2026,teams()),gameResultsMap:{143:{win:true}}});await save(old);
  const next=advanceFarmYear(old,{year:2027,nextSchedule:generateSeasonSchedule(2027,old.teams),teams:old.teams.map(t=>({...t,wins:0}))});
  const raw=rows.get(key),set=localStorage.setItem;
  vi.spyOn(localStorage,'setItem').mockImplementation((k,v)=>{if(k===key)throw Error('year-root');set(k,v);});
  expect((await save(next,{dirtyScopes:[]})).ok).toBe(false);expect(rows.get(key)).toBe(raw);
  const retained=await loadGame();expect(retained.year).toBe(2026);expect(retained.schedule).toEqual(old.schedule);expect(retained.scheduleArchive).toEqual([]);expect(retained.seasonHistory.farmArchives).toBeUndefined();
  vi.restoreAllMocks();expect((await save(next,{dirtyScopes:[]})).ok).toBe(true);
  const loaded=await loadGame();expect(loaded.year).toBe(2027);expect(loaded.seasonHistory.farmArchives).toHaveLength(1);expect(loaded.schedule).toEqual(generateSeasonSchedule(2027,old.teams));expect(loaded.scheduleArchive.at(-1)).toMatchObject({year:2026,schedule:old.schedule,gameResultsMap:old.gameResultsMap});
  const ref=JSON.parse(await readRootBody(rows.get(key))).saveManifest.chunks.seasonHistory;
  const db=await openBaseballManagerDb();await new Promise(res=>{const tx=db.transaction('save_chunks','readwrite');tx.objectStore('save_chunks').delete(ref.key);tx.oncomplete=res;});db.close();
  const backup=await loadGame();expect(backup.year).toBe(2026);expect(backup.farmCompetition.year).toBe(2026);
});
it('IDB abort of archive generation protects prior root and retries safely',async()=>{
  const old=migrateFarmCompetition(source(144));await save(old);
  const next=advanceFarmYear(old,{year:2027,nextSchedule:generateSeasonSchedule(2027,old.teams),teams:old.teams.map(t=>({...t,wins:0}))});
  let aborted=false;const add=IDBObjectStore.prototype.add;
  vi.spyOn(IDBObjectStore.prototype,'add').mockImplementation(function(...args){const req=add.apply(this,args);
    if(!aborted&&this.name==='save_chunks'){aborted=true;this.transaction.abort();}return req;});
  expect((await save(next,{dirtyScopes:[]})).ok).toBe(false);expect((await loadGame()).year).toBe(2026);
  vi.restoreAllMocks();expect((await save(next,{dirtyScopes:[]})).ok).toBe(true);expect((await loadGame()).seasonHistory.farmArchives).toHaveLength(1);
});
it.each(['inline','v5'])('legacy %s load alone writes nothing; explicit migration persists exact old stats2 separately',async format=>{
  const s=source(4);s.teams[0].farm[0].stats2={PA:100,H:31,IP:9.2};
  if(format==='inline')rows.set(key,JSON.stringify(s));
  else {
    await save(s);const root=JSON.parse(await readRootBody(rows.get(key)));root.saveDataVersion=5;root.saveManifest.version=5;
    delete root.saveManifest.chunks.careerLogs;
    const db=await openBaseballManagerDb();await new Promise(resolve=>{
      const tx=db.transaction('save_chunks','readwrite'),store=tx.objectStore('save_chunks');
      for(const ref of Object.values(root.saveManifest.chunks)){ref.version=5;const req=store.get(ref.key);req.onsuccess=()=>store.put({...req.result,version:5},ref.key);}
      tx.oncomplete=resolve;
    });db.close();rows.set(key,JSON.stringify(root));
  }
  const old=rows.get(key),loaded=await loadGame();expect(rows.get(key)).toBe(old);expect(loaded.farmCompetition).toBeUndefined();
  const migrated=migrateFarmCompetition(loaded);expect(rows.get(key)).toBe(old);expect(migrated.farmCompetition.startRound).toBe(4);
  expect((await save(migrated,{dirtyScopes:[]})).ok).toBe(true);
  const restored=await loadGame();expect(restored.farmCompetition.legacy.entries.find(e=>e.playerId===s.teams[0].farm[0].id).stats).toEqual({PA:100,H:31,IP:9.2});
  expect(restored.teams[0].farm[0].stats2).toEqual(s.teams[0].farm[0].stats2);
});

it('rejects a corrupted independent ledger and archive even if the raw JSON still parses',async()=>{
  const s=initial();await save(s);await save(played(s));
  const raw=JSON.parse(await readRootBody(rows.get(key)));raw.farmCompetition.usage.find(u=>u.recentPitching.length).recentPitching[0].BF++;
  rows.set(key,JSON.stringify(raw));expect((await loadGame()).farmCompetition.nextRound).toBe(1);
  const old=migrateFarmCompetition(source(144));
  expect((await save(old,{skipBackupRotation:true})).ok).toBe(true);
  const next=advanceFarmYear(old,{year:2027,nextSchedule:generateSeasonSchedule(2027,old.teams),teams:old.teams.map(t=>({...t,wins:0}))});
  await save(next);
  const header=JSON.parse(await readRootBody(rows.get(key)));header.farmCompetition.archiveSignature='incorrect';
  rows.set(key,JSON.stringify(header));expect((await loadGame()).year).toBe(2026);
});

it('recovery save preserves valid backup instead of rotating farm-corrupt primary',async()=>{
  const s=initial();await save(s);await save(played(s));
  const validBackup=rows.get(bk),primary=JSON.parse(await readRootBody(rows.get(key)));
  delete primary.farmCompetition;rows.set(key,JSON.stringify(primary));
  const recovered=await loadGame();expect(getLastLoadResult().status).toBe('recovered');
  rows.delete('baseball_manager_v1_last_rotate_at');
  expect((await save(recovered)).ok).toBe(true);expect(rows.get(bk)).toBe(validBackup);
  rows.set(key,'corrupt again');expect((await loadGame()).farmCompetition.nextRound).toBe(1);
});
