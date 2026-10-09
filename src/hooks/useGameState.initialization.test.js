import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useGameState } from './useGameState';
import { TEAM_DEFS } from '../constants';

const mocks=vi.hoisted(()=>({persist:vi.fn(),generate:vi.fn(),foreign:vi.fn(),schedule:vi.fn(),trigger:vi.fn()}));
vi.mock('../engine/bootstrapTeams',()=>({createInitialTeams:()=>mocks.generate(),createInitialTeamsAsync:async()=>mocks.generate()}));
vi.mock('../engine/saveload',()=>({hasSave:()=>false,getSaveQueueSnapshot:()=>({isSaving:false}),getAutoSaveIntervalMs:()=>Infinity,enqueueSaveGame:async()=>({ok:true}),initializeCareerLogsInIndexedDb:(rows)=>mocks.persist(rows)}));
vi.mock('../engine/player',()=>({generateForeignFaPool:()=>mocks.foreign()}));
vi.mock('../engine/scheduleGen',()=>({generateSeasonSchedule:()=>mocks.schedule(),calcAllStarTriggerDay:()=>mocks.trigger()}));
vi.mock('../engine/battedBallArchive',()=>({getBattedBallQueueStatus:()=>({failedRecords:0}),flushBattedBallQueue:async()=>({ok:true})}));
let view,gs;
const initial=()=>TEAM_DEFS.map(t=>({...t,players:[{id:'p'+t.id,name:t.name,stats:{},careerLog:[{year:2024,stats:{HR:1}}]}],farm:[],lineup:[],rotation:[]}));
beforeEach(async()=>{
  vi.clearAllMocks();mocks.generate.mockImplementation(initial);mocks.persist.mockResolvedValue({ok:true});mocks.foreign.mockReturnValue([]);mocks.schedule.mockReturnValue({1:{matchups:[]}});mocks.trigger.mockReturnValue(72);
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
  expect(gs.schedule).toEqual({1:{matchups:[]}});
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
