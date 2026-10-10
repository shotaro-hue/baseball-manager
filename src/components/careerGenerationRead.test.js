import React from 'react';
import {act,create} from 'react-test-renderer';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {IDBFactory} from 'fake-indexeddb';
import {CareerTable} from './tabs/CareerTable';
import {saveGame} from '../engine/saveload';
const player={id:'same',name:'選手',isPitcher:false,recentCareerLog:[]};
const state=saveId=>({saveId,year:2026,gameDay:1,myId:0,teams:[{id:0,name:'球団',players:[player],farm:[]}],seasonHistory:{},news:[],mailbox:[],gameResultsMap:{}});
let view;
async function render(props) {
 await act(async()=>{view=create(React.createElement(CareerTable,props));});
 for(let i=0;i<40 && JSON.stringify(view.toJSON()).includes('成績を読み込み中');i++)
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,5));});
 expect(JSON.stringify(view.toJSON())).not.toContain('成績を読み込み中');
}
beforeEach(()=>{const rows=new Map();vi.stubGlobal('indexedDB',new IDBFactory());vi.stubGlobal('localStorage',{getItem:k=>rows.get(k)??null,setItem:(k,v)=>rows.set(k,String(v)),removeItem:k=>rows.delete(k)});});
afterEach(()=>{if(view)act(()=>view.unmount());view=null;vi.restoreAllMocks();vi.unstubAllGlobals();});
it('career detail reads the committed saveId history for colliding player IDs',async()=>{
 await saveGame(state('a'),{initialCareerLogs:[{playerId:'same',careerEntries:[{year:2024,stats:{HR:7}}]}]});
 await saveGame(state('b'),{initialCareerLogs:[{playerId:'same',careerEntries:[{year:2023,stats:{HR:9}}]}]});
 await render({player,saveId:'b',year:2026,includeCurrentSeason:false});
 const content=JSON.stringify(view.toJSON());expect(content).toContain('2023');expect(content).not.toContain('2024');
});
it('unavailable saveId reports incomplete detail instead of reading another game',async()=>{
 await saveGame(state('b'));
 await render({player,saveId:'a',year:2026,includeCurrentSeason:false});
 expect(JSON.stringify(view.toJSON())).toContain('読み込めません');
});
