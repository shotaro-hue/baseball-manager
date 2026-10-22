import {it,expect,vi,afterEach} from 'vitest';
import {IDBFactory} from 'fake-indexeddb';
import * as diagnostics from '../src/engine/saveDiagnostics';
import {openBaseballManagerDb} from '../src/engine/baseballManagerDb';
afterEach(()=>vi.unstubAllGlobals());
it('provides copyable numeric storage detail without secret keys, IDs, payloads, or exception messages',async()=>{
  expect(typeof diagnostics.collectSaveDiagnostics).toBe('function');
  const data=new Map([['baseball_manager_v1','12345'],['PRIVATE_OTHER_KEY','PRIVATE_BODY']]);
  vi.stubGlobal('localStorage',{get length(){return data.size;},key:i=>[...data.keys()][i],getItem:k=>data.get(k)??null});
  vi.stubGlobal('indexedDB',new IDBFactory());
  const db=await openBaseballManagerDb();await new Promise(resolve=>{const tx=db.transaction('save_chunks','readwrite');
    tx.objectStore('save_chunks').put({version:1,payload:'PRIVATE_BODY'},'root-body:PRIVATE');
    tx.objectStore('save_chunks').put({scope:'news',data:['PRIVATE_BODY']},'generation:PRIVATE');tx.oncomplete=resolve;});db.close();
  vi.stubGlobal('navigator',{storage:{estimate:async()=>({usage:12345,quota:99999,private:'PRIVATE'}),persisted:async()=>false}});
  const result=await diagnostics.collectSaveDiagnostics({reason:'quota_exceeded',diagnostics:{step:'commit_root',api:'localStorage.setItem',exceptionName:'QuotaExceededError',dirty:true,exceptionMessage:'PRIVATE',saveId:'PRIVATE',queue:{isSaving:false}}});
  expect(result).toMatchObject({reason:'quota_exceeded',step:'commit_root',exceptionName:'QuotaExceededError',dirty:true,
    localStorage:{primaryBytes:10,totalBytes:expect.any(Number)},originEstimate:{usage:12345,quota:99999},indexedDB:{stores:expect.any(Object)}});
  expect(JSON.stringify(result)).not.toContain('PRIVATE');
  expect(result.indexedDB.stores.save_chunks).toMatchObject({rows:2,rootBodies:1,generations:1,rootBodyBytes:expect.any(Number),generationBytes:expect.any(Number),scopeBytes:{news:expect.any(Number)}});
});
it('reports inaccessible storage without throwing or echoing hostile fields',async()=>{
  expect(typeof diagnostics.collectSaveDiagnostics).toBe('function');
  vi.stubGlobal('localStorage',{get length(){throw new DOMException('PRIVATE','SecurityError');},getItem(){throw new Error('PRIVATE');}});
  vi.stubGlobal('indexedDB',undefined);vi.stubGlobal('navigator',{storage:{estimate:async()=>{throw new Error('PRIVATE')}}});
  const result=await diagnostics.collectSaveDiagnostics({reason:'PRIVATE',diagnostics:{step:'PRIVATE',api:'PRIVATE',exceptionName:'PRIVATE'}});
  expect(JSON.stringify(result)).not.toContain('PRIVATE');expect(result.localStorage.available).toBe(false);
});
