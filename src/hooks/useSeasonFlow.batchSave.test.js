import React from 'react';
import {act,create} from 'react-test-renderer';
import {afterEach,expect,it,vi} from 'vitest';
import {useSeasonFlow} from './useSeasonFlow';
import {TEAM_DEFS} from '../constants';
import {buildTeam} from '../engine/player';
import {generateSeasonSchedule} from '../engine/scheduleGen';
const {workers} = vi.hoisted(()=>({workers:[]}));
vi.mock('../workers/seasonBatchWorker?worker',()=>({default:class {
 constructor(){workers.push(this);} postMessage(message){this.message=message;} terminate(){}
}}));
let view,api;
afterEach(()=>{act(()=>view?.unmount());workers.length=0;});
it('routes one adopted batch through shared tracked saving with the actual state and history',async()=>{
 const teams=TEAM_DEFS.map(buildTeam),nextHistory={gameResultsMap:{1:{myScore:3,oppScore:1,log:[{result:'hr',scorer:true,batId:0,batter:'打者'}]}}};
 const gs={teams,myId:teams[0].id,myTeam:teams[0],saveId:'save',year:2026,gameDay:1,schedule:generateSeasonSchedule(2026,teams),
  getGameResultsMap:()=>({}),getSeasonHistory:()=>({}),getNewsBySelector:()=>[],getMailboxBySelector:()=>[],getScheduleArchive:()=>[],
  getProgressSessionToken:()=>2,getProgressToken:()=>1,applyProgressCandidate:()=>true,applyMatchResultPatch:()=>nextHistory,
  handleSave:vi.fn(async()=>({ok:true})),setSaveRevision:vi.fn(),setSaveExists:vi.fn(),setIsAutoSaveSuspended:vi.fn(),setScreen:vi.fn(),notify:vi.fn(),
  setNews:vi.fn(),setMailbox:vi.fn(),setSeasonHistory:vi.fn(),setFaPool:vi.fn()};
 function Harness(){api=useSeasonFlow(gs);return null;}
 act(()=>{view=create(React.createElement(Harness));});
 act(()=>{api.handleBatchSim(1);api.handleBatchSim(1);});
 expect(workers).toHaveLength(1);
 const nextState={teams,saveId:'save',myId:gs.myId,year:2026,gameDay:2,saveRevision:1,news:[],mailbox:[],seasonHistory:{},faPool:[]};
 const batchResults=[{gameNo:1,score:{my:3,opp:1}}];
 await act(async()=>{const worker=workers[0];worker.onmessage({data:{type:'DONE',payload:{taskId:worker.message.payload.taskId,result:{nextState,batchResults,batchMeta:{}}}}});});
 expect(gs.handleSave).toHaveBeenCalledTimes(1);
 expect(gs.handleSave.mock.calls[0][0]).toMatchObject({payload:{...nextState,...nextHistory},saveOptions:{skipBackupRotation:true,preferMainSave:true}});
 expect(api.batchResults).toBe(batchResults);
 expect(api.batchContext).toMatchObject({year:2026,saveId:'save',myId:gs.myId,sessionToken:2});
});
