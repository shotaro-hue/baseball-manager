import React from 'react';
import {create,act} from 'react-test-renderer';
import {it,expect,vi,afterEach,beforeEach} from 'vitest';
import {IDBFactory} from 'fake-indexeddb';
import {readFileSync} from 'node:fs';import {gunzipSync} from 'node:zlib';
import {useGameState} from './useGameState';import {useOffseason} from './useOffseason';
import {saveGame,loadGame} from '../engine/saveload';
import {generateSeasonSchedule} from '../engine/scheduleGen';import {migrateFarmCompetition} from '../engine/farmMigration';
import {prepareFarmProgress,finishFarmProgress} from '../engine/farmProgression';
vi.mock('../engine/battedBallArchive',()=>({getBattedBallQueueStatus:()=>({failedRecords:0}),flushBattedBallQueue:async()=>({ok:true})}));
let rows,view,gs,os;
const state=(day=1)=>{const s=JSON.parse(gunzipSync(readFileSync(new URL('../../e2e/fixtures/new-game.json.gz',import.meta.url))));
 // Career payloads have separate boundary coverage in careerPersistence.integration.
 s.teams=s.teams.map(t=>({...t,wins:day-1,losses:0,draws:0,players:t.players.map(p=>({...p,recentCareerLog:[],careerLog:[]})),farm:t.farm.map(p=>({...p,recentCareerLog:[],careerLog:[]}))}));s.gameDay=day;s.schedule=generateSeasonSchedule(s.year,s.teams);return migrateFarmCompetition(s);};
beforeEach(()=>{rows=new Map();vi.stubGlobal('indexedDB',new IDBFactory());vi.stubGlobal('localStorage',{getItem:k=>rows.get(k)??null,setItem:(k,v)=>rows.set(k,String(v)),removeItem:k=>rows.delete(k)});});
afterEach(()=>{if(view)act(()=>view.unmount());view=null;vi.restoreAllMocks();vi.unstubAllGlobals();});
function mount(s){function Harness(){gs=useGameState();os=useOffseason(gs);return null;}
 act(()=>{view=create(React.createElement(Harness));});act(()=>{gs.applyProgressCandidate(s);gs.setSchedule(s.schedule);gs.hydrateLargeSaveData({seasonHistory:s.seasonHistory});gs.hydrateMatchHistory(s);gs.setScreen('spring_training');});}
it('manual save retains an adopted farm round after failure, and retries without re-simulation',async()=>{
 const old=state();await saveGame(old);mount(old);
 const p=prepareFarmProgress(old,old.teams,1),next={...old,gameDay:2,farmCompetition:p.competition,teams:finishFarmProgress(old.teams,p,1).map(t=>({...t,draws:1}))};
 act(()=>{gs.applyProgressCandidate(next);});const write=localStorage.setItem;
 vi.spyOn(localStorage,'setItem').mockImplementation((k,v)=>{if(k==='baseball_manager_v1')throw new Error('write');write(k,v);});
 await act(async()=>expect((await gs.handleSave({silent:true})).ok).toBe(false));
 expect(gs.farmCompetition).toEqual(next.farmCompetition);expect(gs.gameDay).toBe(2);expect((await loadGame()).gameDay).toBe(1);
 vi.restoreAllMocks();await act(async()=>expect((await gs.handleSave({silent:true})).ok).toBe(true));
 const loaded=await loadGame();expect(loaded.farmCompetition).toEqual(next.farmCompetition);expect(loaded.gameDay).toBe(2);
});
it('actual annual save failure preserves the old year; retry saves distinct schedules, farm archive and reset workload',async()=>{
 const previous=state(143),progress=prepareFarmProgress(previous,previous.teams,143);
 const old={...previous,gameDay:144,farmCompetition:progress.competition,teams:finishFarmProgress(previous.teams,progress,143).map(t=>({...t,wins:143}))};old.teams[0].farm[0].recentPitchingDays=[142,143];await saveGame(old);mount(old);
 const write=localStorage.setItem;vi.spyOn(localStorage,'setItem').mockImplementation((k,v)=>{if(k==='baseball_manager_v1')throw new Error('write');write(k,v);});
 await act(async()=>expect(await os.handleNextYear()).toBe(false));
 expect(gs.year).toBe(old.year);expect(gs.farmCompetition).toEqual(old.farmCompetition);expect(gs.schedule).toEqual(old.schedule);expect((await loadGame()).year).toBe(old.year);
 vi.restoreAllMocks();await act(async()=>expect(await os.handleNextYear()).toBe(true));
 const loaded=await loadGame();expect(gs.year).toBe(old.year+1);expect(loaded.farmCompetition.nextRound).toBe(1);
 expect(loaded.seasonHistory.farmArchives[0]).toMatchObject({year:old.year,startRound:143});
 expect(loaded.seasonHistory.farmArchives[0].players).toEqual(old.farmCompetition.players);
 expect(loaded.schedule).toEqual(gs.schedule);expect(loaded.schedule).not.toEqual(old.schedule);
 expect(loaded.scheduleArchive.at(-1)).toMatchObject({year:old.year,schedule:old.schedule});
 expect(loaded.teams[0].farm[0].recentPitchingDays).toEqual([]);expect(gs.getSeasonHistory().farmArchives).toEqual(loaded.seasonHistory.farmArchives);
});
