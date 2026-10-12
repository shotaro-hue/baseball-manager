import React from 'react';
import {act,create} from 'react-test-renderer';
import {afterEach,it,expect,vi} from 'vitest';
import {useGameState} from './useGameState';
import {enqueueSaveGame,getSaveQueueSnapshot} from '../engine/saveload';
vi.mock('../engine/saveload',()=>({hasSave:()=>true,getAutoSaveIntervalMs:()=>60000,getSaveQueueSnapshot:vi.fn(()=>({isSaving:false})),enqueueSaveGame:vi.fn(async()=>({ok:true}))}));
vi.mock('../engine/battedBallArchive',()=>({getBattedBallQueueStatus:()=>({failedRecords:0}),flushBattedBallQueue:async()=>({ok:true})}));
let view,gs;
afterEach(()=>{if(view)act(()=>view.unmount());vi.clearAllMocks();});
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
