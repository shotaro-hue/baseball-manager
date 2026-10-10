import React,{useState} from 'react';
import {act,create} from 'react-test-renderer';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {IDBFactory} from 'fake-indexeddb';
import {useGameState} from './useGameState';
import {useOffseason} from './useOffseason';
import {saveGame,loadGame,loadPlayerCareerLogById,initializeCareerLogsInIndexedDb} from '../engine/saveload';
import {emptyStats} from '../engine/playerCore';
const entry=year=>({year,teamId:0,teamName:'球団',stats:{HR:2}});
const player=()=>({id:'same',name:'選手',age:26,pos:'捕手',condition:70,salary:1000,contractYearsLeft:3,stats:{...emptyStats(),PA:600,HR:4},playoffStats:emptyStats(),careerLog:[entry(2020)],recentCareerLog:[entry(2020)]});
const team=()=>({id:0,name:'球団',budget:10000,players:[player()],farm:[],lineup:['same'],rotation:[]});
vi.mock('../engine/bootstrapTeams',()=>({createInitialTeamsAsync:async()=>[{id:0,name:'球団',players:[{id:'same',name:'選手',careerLog:[{year:2024,teamId:0,teamName:'球団',stats:{HR:9}}]}],farm:[]}]}));
vi.mock('../engine/player',()=>({generateForeignFaPool:()=>[],developPlayers:players=>({players,summary:{}}),rollRetire:()=>false}));
vi.mock('../engine/scheduleGen',()=>({generateSeasonSchedule:()=>({}),calcAllStarTriggerDay:()=>50}));
vi.mock('../engine/battedBallArchive',()=>({getBattedBallQueueStatus:()=>({failedRecords:0}),flushBattedBallQueue:async()=>({ok:true})}));
const primary='baseball_manager_v1';let rows,view,current;
const old=()=>({saveId:'old',teams:[team()],myId:0,year:2026,gameDay:143,news:[],mailbox:[],seasonHistory:{},gameResultsMap:{}});
beforeEach(()=>{rows=new Map();vi.stubGlobal('indexedDB',new IDBFactory());vi.stubGlobal('localStorage',{getItem:k=>rows.get(k)??null,setItem:(k,v)=>rows.set(k,String(v)),removeItem:k=>rows.delete(k)});});
afterEach(()=>{if(view)act(()=>view.unmount());view=null;vi.restoreAllMocks();vi.unstubAllGlobals();});
it('new game cannot publish before its first main commit, and cannot overwrite old career rows',async()=>{
 await initializeCareerLogsInIndexedDb([{playerId:'same',careerEntries:[entry(2020)]}]);await saveGame(old());const before=rows.get(primary);
 const set=localStorage.setItem;vi.spyOn(localStorage,'setItem').mockImplementation((k,v)=>{if(k===primary)throw new Error('body');set(k,v);});
 function Harness(){current=useGameState();return null;}
 await act(async()=>{view=create(React.createElement(Harness));});
 await act(async()=>{await current.handleSelect(0);});
 expect(current.screen).toBe('title');expect(current.newGameInitializationStatus).toBe('error');expect(rows.get(primary)).toBe(before);
 // Legacy rows are read-only migration inputs even when player IDs collide.
 expect(await loadPlayerCareerLogById('same')).toEqual([entry(2020)]);
 expect((await loadGame()).saveId).toBe('old');
 vi.restoreAllMocks();await act(async()=>{await current.handleSelect(0);});
 expect(current.screen).toBe('hub');expect(current.newGameInitializationStatus).toBe('ready');
 const next=await loadGame();expect(next.saveId).not.toBe('old');expect(next.myId).toBe(0);
 expect(await loadPlayerCareerLogById('same',next.saveId)).toEqual([{year:2024,teamId:0,teamName:'球団',stats:{HR:9}}]);
 expect(await loadPlayerCareerLogById('same')).toEqual([entry(2020)]);
});
it.each([false,true])('actual year transition commits entries with main, reports quota=%s, and preserves legacy rows on failure',async quota=>{
 await initializeCareerLogsInIndexedDb([{playerId:'same',careerEntries:[entry(2020)]}]);await saveGame(old());
 function Harness(){
  const [year,setYear]=useState(2026),[teams,setTeams]=useState([team()]),[screen,setScreen]=useState('spring_training');
  const [offseasonPlan,setOffseasonPlan]=useState({version:1,year:2026,myId:0,stage:'results'});
  const noop=()=>{};
  const gs={year,setYear,teams,setTeams,myId:0,myTeam:teams[0],screen,setScreen,offseasonPlan,setOffseasonPlan,faPool:[],
   getGameResultsMap:()=>({}),getSeasonHistory:()=>({}),notify:noop,setIsAutoSaveSuspended:noop,
   handleSave:options=>saveGame({...old(),...options.payload},{careerEntries:options.careerEntries}),
   ...Object.fromEntries(['setGameDay','setFaPool','setFaYears','setAllStarDone','setAllStarResult','setScheduleArchive','setGameResultsMap','setAllTeamResultsMap','setSchedule','setAllStarTriggerDay'].map(k=>[k,noop]))};
  current={gs,os:useOffseason(gs)};return null;
 }
 await act(async()=>{view=create(React.createElement(Harness));});
 const set=localStorage.setItem;vi.spyOn(localStorage,'setItem').mockImplementation((k,v)=>{if(k===primary)throw quota?new DOMException('full','QuotaExceededError'):new Error('body');set(k,v);});
 await act(async()=>expect(await current.os.handleNextYear()).toBe(false));
 expect(current.gs.year).toBe(2026);if(quota)expect(current.os.careerPersistenceError).toContain('容量');expect(await loadPlayerCareerLogById('same')).toEqual([entry(2020)]);
 expect((await loadGame()).year).toBe(2026);expect(await loadPlayerCareerLogById('same','old')).toEqual([entry(2020)]);
 vi.restoreAllMocks();await act(async()=>expect(await current.os.handleNextYear()).toBe(true));
 expect(current.gs.year).toBe(2027);expect((await loadGame()).year).toBe(2027);
 const career=await loadPlayerCareerLogById('same','old');expect(career.map(e=>e.year)).toEqual([2020,2026]);expect(career[1].stats.HR).toBe(4);
});

it('actual retirement stages final entries until main commit and keeps them through a failed save retry',async()=>{
 await saveGame(old());const before=rows.get(primary);
 function Harness(){const gs=useGameState();current={gs,os:useOffseason(gs)};return null;}
 await act(async()=>{view=create(React.createElement(Harness));});
 await act(async()=>{
  current.gs.setTeams([team()]);current.gs.setMyId(0);current.gs.setSaveId('old');
  current.gs.setYear(2026);current.gs.setScreen('retire_phase');current.gs.setIsAutoSaveSuspended(true);
 });
 await act(async()=>expect(await current.os.handleRetirePhaseNext({same:'accepted'})).toBe(true));
 expect(current.gs.teams[0].history.map(p=>p.id)).toContain('same');
 expect(rows.get(primary)).toBe(before);
 expect((await loadPlayerCareerLogById('same','old')).map(e=>e.year)).toEqual([2020]);
 const set=localStorage.setItem;vi.spyOn(localStorage,'setItem').mockImplementation((k,v)=>{if(k===primary)throw new Error('body');set(k,v);});
 await act(async()=>expect((await current.gs.handleSave({payload:{}})).ok).toBe(false));
 expect(rows.get(primary)).toBe(before);
 expect((await loadGame()).teams[0].players.map(p=>p.id)).toContain('same');
 expect((await loadPlayerCareerLogById('same','old')).map(e=>e.year)).toEqual([2020]);
 vi.restoreAllMocks();await act(async()=>expect((await current.gs.handleSave({payload:{}})).ok).toBe(true));
 expect((await loadGame()).teams[0].history.map(p=>p.id)).toContain('same');
 const career=await loadPlayerCareerLogById('same','old');expect(career.map(e=>e.year)).toEqual([2020,2026]);expect(career[1].stats.HR).toBe(4);
 await act(async()=>expect((await current.gs.handleSave({payload:{}})).ok).toBe(true));
 expect(await loadPlayerCareerLogById('same','old')).toEqual(career);
});

it('initial quota reports capacity shortage and preserves the existing committed game',async()=>{
 await saveGame(old());const before=rows.get(primary),set=localStorage.setItem;
 vi.spyOn(localStorage,'setItem').mockImplementation((k,v)=>{if(k===primary)throw new DOMException('full','QuotaExceededError');set(k,v);});
 function Harness(){current=useGameState();return null;}
 await act(async()=>{view=create(React.createElement(Harness));});
 await act(async()=>{await current.handleSelect(0);});
 expect(current.screen).toBe('title');expect(current.newGameInitializationError).toContain('容量');
 expect(rows.get(primary)).toBe(before);expect((await loadGame()).saveId).toBe('old');
 expect((await loadPlayerCareerLogById('same','old')).map(e=>e.year)).toEqual([2020]);
});
it('initial auxiliary metadata failure publishes the committed game and explains the warning',async()=>{
 await saveGame(old());const set=localStorage.setItem;
 vi.spyOn(localStorage,'setItem').mockImplementation((k,v)=>{if(k==='baseball_manager_v1_meta')throw new Error('meta');set(k,v);});
 function Harness(){current=useGameState();return null;}
 await act(async()=>{view=create(React.createElement(Harness));});
 await act(async()=>{await current.handleSelect(0);});
 expect(current.screen).toBe('hub');expect(current.newGameInitializationStatus).toBe('ready');
 expect(current.notif?.msg).toContain('球団データは保存しました');
 const saved=await loadGame();expect(saved.saveId).not.toBe('old');
 expect((await loadPlayerCareerLogById('same',saved.saveId)).map(e=>e.year)).toEqual([2024]);
});
