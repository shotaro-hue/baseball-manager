import React from 'react';
import {act,create} from 'react-test-renderer';
import {afterEach,expect,it,vi} from 'vitest';
import {indexedDB,IDBKeyRange} from 'fake-indexeddb';
import {useGameState} from './useGameState';
const {gates}=vi.hoisted(()=>({gates:[]}));
vi.mock('../engine/saveload',()=>({hasSave:()=>true,getSaveQueueSnapshot:()=>({isSaving:false}),enqueueSaveGame:async()=>({ok:true})}));
vi.mock('../engine/baseballManagerDb',async importOriginal=>{
 const real=await importOriginal();
 return {...real,openBaseballManagerDb:async()=>{await new Promise((resolve,reject)=>gates.push({resolve,reject}));return real.openBaseballManagerDb();}};
});
let view,gs;
afterEach(()=>{act(()=>view?.unmount());view=null;gates.length=0;vi.unstubAllGlobals();});
it.each([false,true])('waits for every real archive chunk and reports a later chunk failure=%s',async fail=>{
 vi.resetModules();vi.stubGlobal('indexedDB',indexedDB);vi.stubGlobal('IDBKeyRange',IDBKeyRange);
 const archive=await import('../engine/battedBallArchive');
 function Harness(){gs=useGameState();return null;}
 await act(async()=>{view=create(React.createElement(Harness));});
 act(()=>{gs.setMyId(0);gs.setSaveId('multi-chunk');gs.setTeams([{id:0,players:[],farm:[]}]);});
 const record=id=>({id,saveId:'multi-chunk',year:2026,gameId:id,playerId:'batter',events:[{result:'hr',ev:160,la:27,sprayAngle:0}]});
 archive.enqueueBattedBallBatches([record('first')]);
 await vi.waitFor(()=>expect(gates).toHaveLength(1));archive.enqueueBattedBallBatches([record('second')]);
 let task;await act(async()=>{task=gs.handleSave({silent:true});});
 await act(async()=>{gates[0].resolve();});
 await vi.waitFor(()=>expect(gates).toHaveLength(2));await act(async()=>{});
 const earlyResult=gs.saveResult,earlySaving=gs.saveQueueState.isSaving;
 await act(async()=>{if(fail)gates[1].reject(new Error('second chunk failed'));else gates[1].resolve();await task;});
 await vi.waitFor(()=>expect(archive.getBattedBallQueueStatus().isWriting).toBe(false));
 expect(earlyResult).toBeNull();expect(earlySaving).toBe(true);
 expect(gs.saveResult).toMatchObject({ok:true,archive:{ok:!fail}});expect(gs.saveDirty).toBe(false);
});
