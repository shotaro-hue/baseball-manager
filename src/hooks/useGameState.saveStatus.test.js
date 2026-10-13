import React from 'react';
import {act,create} from 'react-test-renderer';
import {afterEach,it,expect,vi} from 'vitest';
import {useGameState} from './useGameState';
import {enqueueSaveGame,getSaveQueueSnapshot} from '../engine/saveload';
import {flushBattedBallQueue} from '../engine/battedBallArchive';
vi.mock('../engine/saveload',()=>({hasSave:()=>true,getAutoSaveIntervalMs:()=>60000,getSaveQueueSnapshot:vi.fn(()=>({isSaving:false})),enqueueSaveGame:vi.fn(async()=>({ok:true}))}));
vi.mock('../engine/battedBallArchive',()=>({getBattedBallQueueStatus:()=>({failedRecords:0}),flushBattedBallQueue:vi.fn(async()=>({ok:true}))}));
let view,gs;
afterEach(()=>{if(view)act(()=>view.unmount());vi.clearAllMocks();getSaveQueueSnapshot.mockReturnValue({isSaving:false});});
async function setup(){function Harness(){gs=useGameState();return null;}await act(async()=>{view=create(React.createElement(Harness));});act(()=>{gs.setMyId(0);gs.setTeams([{id:0,players:[],farm:[]}]);});}
it('exposes actual manual results without inferring success from an idle queue',async()=>{
 await setup();expect(gs.saveResult).toBeNull();enqueueSaveGame.mockResolvedValueOnce({ok:false,reason:'save_failed'});
 await act(async()=>{await gs.handleSave({silent:true});});expect(gs.saveResult).toMatchObject({ok:false});expect(gs.saveDirty).toBe(true);
 await act(async()=>{await gs.handleSave({silent:true});});expect(gs.saveResult).toMatchObject({ok:true,archive:{ok:true}});expect(gs.saveDirty).toBe(false);
 act(()=>gs.resetSaveTracking());expect(gs.saveResult).toBeNull();
});
it('publishes saving after enqueue starts and keeps a failed save dirty',async()=>{
 await setup();let complete;getSaveQueueSnapshot.mockReturnValue({isSaving:true});enqueueSaveGame.mockImplementationOnce(()=>new Promise(resolve=>{complete=resolve;}));
 let task;await act(async()=>{task=gs.handleSave({silent:true});await Promise.resolve();});expect(gs.saveQueueState.isSaving).toBe(true);
 getSaveQueueSnapshot.mockReturnValue({isSaving:false});await act(async()=>{complete({ok:false});await task;});expect(gs.saveResult.ok).toBe(false);expect(gs.saveDirty).toBe(true);
});
it('keeps changes made during an actual successful in-flight request pending',async()=>{
 await setup();let complete;enqueueSaveGame.mockImplementationOnce(()=>new Promise(resolve=>{complete=resolve;}));
 let task;await act(async()=>{task=gs.handleSave({silent:true});await Promise.resolve();});
 act(()=>gs.setTeams([{id:0,players:[],farm:[],wins:1}]));
 await act(async()=>{complete({ok:true});await task;});expect(gs.saveResult.ok).toBe(true);expect(gs.saveDirty).toBe(true);
});
it('publishes saving synchronously before loading/enqueuing the save module',async()=>{
 await setup();let task;act(()=>{task=gs.handleSave({silent:true});});
 expect(gs.saveQueueState.isSaving).toBe(true);
 await act(async()=>{await task;});
});
it('waits for archive completion and reports partial history failure',async()=>{
 await setup();let finish;flushBattedBallQueue.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 let task;await act(async()=>{task=gs.handleSave({silent:true});});
 expect(gs.saveQueueState.isSaving).toBe(true);expect(gs.saveResult).toBeNull();
 await act(async()=>{finish({ok:false});await task;});
 expect(gs.saveResult).toMatchObject({ok:true,archive:{ok:false}});expect(gs.saveDirty).toBe(false);
});
it('does not let a late older archive result overwrite a newer save failure or clear its dirty state',async()=>{
 await setup();let finish;flushBattedBallQueue.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 let old;await act(async()=>{old=gs.handleSave({silent:true});});
 act(()=>gs.setTeams([{id:0,players:[],farm:[],wins:2}]));
 enqueueSaveGame.mockResolvedValueOnce({ok:false});
 await act(async()=>{await gs.handleSave({silent:true});});
 expect(gs.saveQueueState.isSaving).toBe(false);
 await act(async()=>{finish({ok:true});await old;});
 expect(gs.saveResult.ok).toBe(false);expect(gs.saveDirty).toBe(true);expect(gs.saveQueueState.isSaving).toBe(false);
});
it('preserves the real queue coalescing behavior for overlapping tracked requests',async()=>{
 await setup();const {createSaveRequestQueue}=await vi.importActual('../engine/saveload');
 let finish;const persisted=[];
 const queue=createSaveRequestQueue(async({state})=>{persisted.push(state.gameDay);if(persisted.length===1)await new Promise(resolve=>{finish=resolve;});return {ok:true};});
 enqueueSaveGame.mockImplementation(({...state},options)=>queue.enqueue({state,options}));getSaveQueueSnapshot.mockImplementation(()=>queue.getSnapshot());
 let first,second,third;await act(async()=>{first=gs.handleSave({silent:true,payload:{gameDay:2}});});
 await act(async()=>{second=gs.handleSave({silent:true,payload:{gameDay:3}});third=gs.handleSave({silent:true,payload:{gameDay:4}});});
 expect(gs.saveQueueState.hasQueuedSave).toBe(true);expect(gs.saveResult).toBeNull();
 await act(async()=>{finish();await Promise.all([first,second,third]);});
 expect(persisted).toEqual([2,4]);expect(gs.saveResult.ok).toBe(true);expect(gs.saveDirty).toBe(false);
 enqueueSaveGame.mockImplementation(async()=>({ok:true}));getSaveQueueSnapshot.mockImplementation(()=>({isSaving:false}));
});
it('ignores completion after a load resets the progress session and save tracking',async()=>{
 await setup();let finish;enqueueSaveGame.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 let old;await act(async()=>{old=gs.handleSave({silent:true});});
 act(()=>{gs.setSaveId('loaded');gs.resetSaveTracking();});
 await act(async()=>{finish({ok:true});await old;});
 expect(gs.saveResult).toBeNull();expect(gs.saveDirty).toBe(false);
});
it('does not enqueue an old session snapshot if a load occurs before the async module continuation',async()=>{
 await setup();let task;act(()=>{task=gs.handleSave({silent:true});gs.setSaveId('loaded');gs.resetSaveTracking();});
 await act(async()=>{await task;});expect(enqueueSaveGame).not.toHaveBeenCalled();expect(gs.saveResult).toBeNull();
});
it('forwards batch persistence options without replacing the dirty scope tracker',async()=>{
 await setup();await act(async()=>{await gs.handleSave({silent:true,payload:{gameDay:11,gameResultsMap:{10:{log:[]}}},saveOptions:{skipBackupRotation:true,preferMainSave:true}});});
 expect(enqueueSaveGame.mock.lastCall[1]).toMatchObject({skipBackupRotation:true,preferMainSave:true,dirtyScopes:expect.arrayContaining(['matchHistory'])});
});
