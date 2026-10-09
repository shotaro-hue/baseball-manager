import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from './App';
import { TEAM_DEFS } from './constants';
const mock=vi.hoisted(()=>({load:vi.fn(),generate:vi.fn(),schedule:vi.fn(),app:null}));
const teams=()=>TEAM_DEFS.map(t=>({...t,players:[],farm:[],lineup:[],rotation:[]}));
vi.mock('./engine/saveload',()=>({hasSave:()=>false,getSaveQueueSnapshot:()=>({isSaving:false}),getAutoSaveIntervalMs:()=>Infinity,enqueueSaveGame:async()=>({ok:true}),initializeCareerLogsInIndexedDb:async()=>({ok:true}),loadGame:()=>mock.load()}));
vi.mock('./engine/bootstrapTeams',()=>({createInitialTeams:()=>teams(),createInitialTeamsAsync:async()=>{mock.generate();return teams();}}));
vi.mock('./engine/player',()=>({generateForeignFaPool:()=>[]}));
vi.mock('./engine/scheduleGen',()=>({generateSeasonSchedule:()=>mock.schedule(),calcAllStarTriggerDay:()=>72}));
vi.mock('./engine/battedBallArchive',()=>({getBattedBallQueueStatus:()=>({failedRecords:0}),flushBattedBallQueue:async()=>({ok:true})}));
vi.mock('./hooks/useSeasonFlow',()=>({useSeasonFlow:()=>({setPlayoff:()=>{}})}));
vi.mock('./hooks/useOffseason',()=>({useOffseason:()=>({resetTransientOffseason:()=>{}})}));
vi.mock('./components/AppScreenRouter',()=>({default:({app})=>{mock.app=app;return null;}}));
vi.mock('./components/hub/HubShell',()=>({default:({app})=>{mock.app=app;return null;}}));
let view;
beforeEach(()=>{mock.load.mockReset();mock.schedule.mockReset().mockReturnValue([]);});
afterEach(()=>{act(()=>view.unmount());vi.clearAllMocks();vi.restoreAllMocks();});
it('invalidates an older load and waits for its possible legacy migration before generating new teams',async()=>{
  let resolve;mock.load.mockImplementation(()=>new Promise(r=>{resolve=r;}));
  await act(async()=>{view=create(React.createElement(App));});
  let loading;await act(async()=>{loading=mock.app.handleLoad();await Promise.resolve();});
  let initializing;act(()=>{initializing=mock.app.gs.handleSelect(TEAM_DEFS[1].id);});
  expect(mock.app.gs.newGameInitializationStatus).toBe('initializing');
  expect(mock.generate).not.toHaveBeenCalled();expect(mock.app.gs.myId).toBeNull();
  await act(async()=>{resolve({teams:teams(),myId:TEAM_DEFS[0].id,year:2025,gameDay:10,faPool:[],saveId:'old-save'});await loading;await initializing;});
  expect(mock.app.gs.myId).toBe(TEAM_DEFS[1].id);
  expect(mock.app.gs.saveId).not.toBe('old-save');expect(mock.app.gs.gameDay).toBe(1);
  expect(mock.app.gs.newGameInitializationStatus).toBe('ready');
});
for(const failure of ['read','preparation'])it('keeps title state intact when saved-game '+failure+' fails',async()=>{
  vi.spyOn(console,'error').mockImplementation(()=>{});
  if(failure==='read')mock.load.mockRejectedValue(new Error('IndexedDB read failed'));
  else{
    mock.load.mockResolvedValue({teams:teams(),myId:0,year:2025,gameDay:10,faPool:[]});
    mock.schedule.mockImplementation(()=>{throw new Error('saved schedule failed');});
  }
  await act(async()=>{view=create(React.createElement(App));});
  await act(async()=>{await mock.app.handleLoad();});
  expect(mock.app.gs.screen).toBe('title');expect(mock.app.gs.teams).toEqual([]);expect(mock.app.gs.myId).toBeNull();
  expect(mock.app.gs.notif).toMatchObject({type:'warn',msg:expect.stringContaining('読み込めませんでした')});
});
