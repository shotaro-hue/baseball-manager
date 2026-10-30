import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useGameState } from './useGameState';
import { TEAM_DEFS } from '../constants';

const mocks=vi.hoisted(()=>({persist:vi.fn(),generate:vi.fn(),foreign:vi.fn(),schedule:vi.fn(),trigger:vi.fn(),queue:vi.fn()}));
vi.mock('../engine/bootstrapTeams',()=>({createInitialTeams:(...args)=>mocks.generate(...args),createInitialTeamsAsync:async(...args)=>mocks.generate(...args)}));
vi.mock('../engine/saveload',()=>({hasSave:()=>false,getSaveQueueSnapshot:()=>mocks.queue(),getAutoSaveIntervalMs:()=>Infinity,enqueueSaveGame:async(state,options)=>options?.initialCareerLogs ? mocks.persist(options.initialCareerLogs) : {ok:true}}));
vi.mock('../engine/player',()=>({generateForeignFaPool:()=>mocks.foreign()}));
vi.mock('../engine/scheduleGen',async original=>({...await original(),generateSeasonSchedule:(...args)=>mocks.schedule(...args),calcAllStarTriggerDay:()=>mocks.trigger()}));
vi.mock('../engine/battedBallArchive',()=>({getBattedBallQueueStatus:()=>({failedRecords:0}),flushBattedBallQueue:async()=>({ok:true})}));
const scheduleActual=await vi.importActual('../engine/scheduleGen');
let view,gs;
const initial=()=>TEAM_DEFS.map(t=>({...t,wins:0,losses:0,draws:0,players:[{id:'p'+t.id,name:t.name,isPitcher:false,stats:{},careerLog:[{year:2024,stats:{HR:1}}]}],farm:[],lineup:[],rotation:[]}));
beforeEach(async()=>{
  vi.clearAllMocks();mocks.queue.mockReturnValue({isSaving:false});mocks.generate.mockImplementation(initial);mocks.persist.mockResolvedValue({ok:true});mocks.foreign.mockReturnValue([]);mocks.schedule.mockImplementation((year,teams)=>scheduleActual.generateSeasonSchedule(year,teams));mocks.trigger.mockReturnValue(72);
  function Harness(){gs=useGameState();return null;}
  await act(async()=>{view=create(React.createElement(Harness));});
});
for(const phase of ['generate','trigger'])it('releases pending state and permits retry after '+phase+' throws',async()=>{
  vi.spyOn(console,'error').mockImplementation(()=>{});
  mocks[phase].mockImplementationOnce(()=>{throw new Error(phase+' failed');});
  await act(async()=>{await gs.handleSelect(TEAM_DEFS[0].id);});
  expect(gs.screen).toBe('title');expect(gs.teams).toEqual([]);expect(gs.myId).toBeNull();
  expect(gs.newGameInitializationStatus).toBe('error');expect(gs.isNewGameInitializing()).toBe(false);
  expect(mocks.persist).not.toHaveBeenCalled();
  await act(async()=>{await gs.handleSelect(TEAM_DEFS[0].id);});
  expect(gs.newGameInitializationStatus).toBe('ready');expect(gs.screen).toBe('hub');
});
afterEach(()=>{act(()=>view.unmount());vi.restoreAllMocks();});
it('uses the explicitly imported master even when old teams are still in memory',async()=>{
 await act(async()=>{gs.setTeams(initial());});
 const master={schemaVersion:1,players:[{playerId:'external'}]};
 await act(async()=>{await gs.handleSelect(0,master);});
 expect(mocks.generate).toHaveBeenCalledWith(master,{localImport:true});
 expect(gs.newGameInitializationStatus).toBe('ready');
});
it('publishes pending before generation, blocks a second selection, and stays on title until persistence succeeds',async()=>{
  let resolve,started;const writingStarted=new Promise(r=>{started=r;});
  mocks.persist.mockImplementation(()=>{started();return new Promise(r=>{resolve=r;});});
  let pending;act(()=>{pending=gs.handleSelect(TEAM_DEFS[0].id);gs.handleSelect(TEAM_DEFS[1].id);});
  expect(gs.newGameInitializationStatus).toBe('initializing');
  expect(mocks.generate).not.toHaveBeenCalled();
  await act(async()=>{await writingStarted;});
  expect(gs.screen).toBe('title');expect(gs.teams).toEqual([]);
  expect(gs.isNewGameInitializing()).toBe(true);
  await act(async()=>{resolve({ok:true});await pending;});
  expect(gs.screen).toBe('hub');expect(gs.myId).toBe(TEAM_DEFS[0].id);
  expect(gs.newGameInitializationStatus).toBe('ready');
  expect(gs.isNewGameInitializing()).toBe(false);
  expect(gs.teams).toHaveLength(12);expect(mocks.generate).toHaveBeenCalledTimes(1);
});
it('reports an initial history write failure without partial state and permits a complete retry',async()=>{
  vi.spyOn(console,'error').mockImplementation(()=>{});
  mocks.persist.mockResolvedValueOnce({ok:false,reason:'indexeddb_write_failed'});
  await act(async()=>{await gs.handleSelect(TEAM_DEFS[0].id);});
  expect(gs.screen).toBe('title');expect(gs.teams).toEqual([]);expect(gs.myId).toBeNull();
  expect(gs.newGameInitializationStatus).toBe('error');expect(gs.newGameInitializationError).toMatch(/保存/);
  expect(gs.isNewGameInitializing()).toBe(false);
  await act(async()=>{await gs.handleSelect(TEAM_DEFS[1].id);});
  expect(gs.newGameInitializationError).toBeNull();expect(gs.newGameInitializationStatus).toBe('ready');
  expect(gs.teams).toHaveLength(12);expect(gs.myId).toBe(TEAM_DEFS[1].id);expect(gs.screen).toBe('hub');
  expect(gs.schedule).toEqual(scheduleActual.generateSeasonSchedule(gs.year,gs.teams));
  const ids=gs.teams.flatMap(t=>t.players.map(p=>p.id));expect(new Set(ids).size).toBe(ids.length);
});
it('does not publish teams or enter home when final schedule preparation fails',async()=>{
  vi.spyOn(console,'error').mockImplementation(()=>{});
  mocks.schedule.mockImplementationOnce(()=>{throw new Error('schedule failed');});
  await act(async()=>{await gs.handleSelect(TEAM_DEFS[0].id);});
  expect(gs.screen).toBe('title');expect(gs.teams).toEqual([]);expect(gs.myId).toBeNull();
  expect(gs.newGameInitializationStatus).toBe('error');expect(gs.newGameInitializationError).toMatch(/再試行/);
  expect(mocks.persist).not.toHaveBeenCalled();
});

it.each([true,false])('refreshes a stale saving snapshot after initial persistence settles (ok=%s)',async ok=>{
  act(()=>view.unmount());
  mocks.queue.mockReturnValue({isSaving:true,hasQueuedSave:false});
  function Harness(){gs=useGameState();return null;}
  await act(async()=>{view=create(React.createElement(Harness));});
  expect(gs.saveQueueState.isSaving).toBe(true);
  mocks.queue.mockReturnValue({isSaving:false,hasQueuedSave:false});
  mocks.persist.mockResolvedValueOnce({ok,reason:ok?undefined:'indexeddb_write_failed'});
  if(!ok)vi.spyOn(console,'error').mockImplementation(()=>{});
  await act(async()=>{await gs.handleSelect(TEAM_DEFS[0].id);});
  expect(gs.saveQueueState.isSaving).toBe(false);
  expect(gs.screen).toBe(ok?'hub':'title');
  expect(gs.saveResult).toBeNull();
});
