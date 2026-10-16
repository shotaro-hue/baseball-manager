import React from 'react';
import {act,create} from 'react-test-renderer';
import {afterEach,expect,it,vi} from 'vitest';
import {DraftLotteryScreen,DraftScreen} from './Draft';
import {newDraftRules} from '../engine/draftConference';
const team={id:0,name:'自球団',players:[],farm:[],wins:0};
const players=Array.from({length:24},(_,id)=>({id,name:`候補${id}`,pos:'捕手',age:22,potential:70,salary:500,batting:{contact:60,power:60,eye:60,defense:60,catching:60,arm:60}}));
const views=[],text=n=>typeof n==='string'?n:(n?.children||[]).map(text).join('');
const button=(v,label)=>v.root.findAllByType('button').find(b=>text(b)===label);
function mount(C,props={}){let v;act(()=>{v=create(React.createElement(C,{teams:[team],myId:0,year:2026,pool:players,rules:newDraftRules(),onDone:vi.fn(),onDraftDone:vi.fn(),...props}));});views.push(v);return v;}
function click(v,label){act(()=>button(v,label).props.onClick());}
afterEach(()=>{views.splice(0).forEach(v=>act(()=>v.unmount()));vi.useRealTimers();vi.restoreAllMocks();});
it('confirms selection end before the first bid, never reopening through full auto or reload',()=>{
 const changed=vi.fn(),done=vi.fn(),v=mount(DraftLotteryScreen,{onStateChange:changed,onDone:done});
 click(v,'選択を終了する');expect(changed.mock.lastCall[0].endedTeams).toEqual({});
 expect(text(v.toJSON())).toContain('この年のドラフトには再参加できません');
 click(v,'指名を続ける');expect(button(v,'選択を終了する')).toBeDefined();
 click(v,'選択を終了する');click(v,'選択終了を確定');
 expect(changed.mock.lastCall[0].endedTeams).toEqual({0:'manual'});
 const saved=JSON.parse(JSON.stringify(changed.mock.lastCall[0]));
 const restored=mount(DraftLotteryScreen,{savedState:saved,onDone:done});
 click(restored,'2巡目以降へ →');
 expect(done.mock.lastCall[0]).toEqual({});expect(done.mock.lastCall[2]).toEqual({0:'manual'});
});
for(const count of [1,6])it(`ends permanently after ${count} nominations and saves the exact cursor and pool`,()=>{
 const pool=players.map(p=>p.id===0?{...p,_drafted:true,_r1winner:0}:p);
 const savedState={pickIdx:count-1,drafted:Object.fromEntries(pool.slice(1,count).map(p=>[p.id,0])),log:pool.slice(1,count).map((p,i)=>({team:0,player:p.id,round:i+2})),scoutPt:0};
 const changed=vi.fn(),v=mount(DraftScreen,{pool,savedState,onStateChange:changed});
 expect(text(v.toJSON())).toContain(`当年指名 ${count}/10人`);
 click(v,'選択を終了する');click(v,'選択終了を確定');
 expect(changed.mock.lastCall[0].endedTeams).toEqual({0:'manual'});
 expect(changed.mock.lastCall[0].drafted).toEqual(savedState.drafted);
 const restored=mount(DraftScreen,{pool,savedState:changed.mock.lastCall[0]});
 expect(text(restored.toJSON())).toContain('ドラフト終了');
});
it('refused nominations still stop at ten even with roster slots and candidates remaining',()=>{
 const pool=players.map(p=>p.id===0?{...p,_drafted:true,_r1winner:0}:p);
 const changed=vi.fn();const v=mount(DraftScreen,{pool,savedState:{pickIdx:8,drafted:Object.fromEntries(pool.slice(1,10).map(p=>[p.id,'refused'])),log:pool.slice(1,10).map((p,i)=>({team:0,player:p.id,round:i+2,refused:true}))},onStateChange:changed});
 expect(text(v.toJSON())).toContain('ドラフト終了');
 expect(changed.mock.lastCall[0].endedTeams).toEqual({0:'pick-limit'});
 expect(Object.values(changed.mock.lastCall[0].drafted)).toHaveLength(9);
});
it('new conference supports the tenth manual pick while unversioned saved conferences still finish at six',()=>{
 vi.spyOn(Math,'random').mockReturnValue(.5);
 for(const [rules,count] of [[newDraftRules(),9],[undefined,5]]){
  const pool=players.map(p=>p.id===0?{...p,_drafted:true,_r1winner:0}:p),changed=vi.fn();
  const v=mount(DraftScreen,{rules,pool,savedState:{pickIdx:count-1,drafted:Object.fromEntries(pool.slice(1,count).map(p=>[p.id,0])),log:pool.slice(1,count).map((p,i)=>({team:0,player:p.id,round:i+2}))},onStateChange:changed});
  act(()=>v.root.findAllByType('button').find(b=>b.props['aria-label']===`候補${count}を指名`).props.onClick());
  click(v,'指名内容を確認');click(v,'指名を確定');
  expect(changed.mock.lastCall[0].done).toBe(true);expect(changed.mock.lastCall[0].drafted[count]).toBe(0);
 }
});
