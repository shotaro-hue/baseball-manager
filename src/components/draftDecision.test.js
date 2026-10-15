import React from 'react';
import {act,create} from 'react-test-renderer';
import {afterEach,expect,it,vi} from 'vitest';
import {DraftLotteryScreen,DraftScreen,DraftPreviewScreen,DraftReviewScreen} from './Draft';
import {ensureDraftEvaluation,rememberDraftReport} from '../engine/draftReports';
import DraftCandidates from './DraftCandidates';
const teams=[{id:0,name:'自球団',players:[],farm:[],wins:0},{id:1,name:'相手球団',players:[],farm:[],wins:1}];
const pool=Array.from({length:24},(_,id)=>({id,name:`候補${id}`,age:22,pos:'捕手',potential:88,
 batting:{contact:45,power:43,eye:48,speed:40,defense:82,catching:85,arm:75}}));
const views=[],text=n=>typeof n==='string'?n:(n.children||[]).map(text).join('');
const button=(v,name)=>v.root.findAllByType('button').find(b=>b.props['aria-label']===name || text(b)===name);
function mount(C,extra={}){let v;act(()=>{v=create(React.createElement(C,{teams,myId:0,year:2026,pool,onDone:vi.fn(),onDraftDone:vi.fn(),onStart:vi.fn(),...extra}));});views.push(v);return v;}
afterEach(()=>{views.splice(0).forEach(v=>act(()=>v.unmount()));vi.restoreAllMocks();});
it('shows a full first-round player report without leaving the nomination screen',()=>{
 const v=mount(DraftLotteryScreen);
 expect(text(v.toJSON())).toContain('追加調査');
 expect(button(v,'候補23のレポート')).toBeDefined();
 act(()=>button(v,'候補23のレポート').props.onClick());
 expect(text(v.toJSON())).toContain('自球団の見立て');
 expect(text(v.toJSON())).toContain('世間の評価');
 expect(text(v.toJSON())).toContain('捕球');
 expect(text(v.toJSON())).not.toContain('ポテンシャル 88');
});
it('requires explicit confirmation and stores a candidate outside the former top twenty',()=>{
 const changed=vi.fn();const v=mount(DraftLotteryScreen,{onStateChange:changed});
 act(()=>button(v,'候補23のレポート').props.onClick());
 expect(changed.mock.lastCall[0].phase).toBe('select');
 act(()=>button(v,'指名内容を確認').props.onClick());
 expect(changed.mock.lastCall[0].phase).toBe('select');
 act(()=>button(v,'指名を確定').props.onClick());
 expect(changed.mock.lastCall[0]).toMatchObject({phase:'announce',myPick:23});
});
it('compares two reports and scouts once without refilling legacy points',()=>{
 const changed=vi.fn();const v=mount(DraftScreen,{savedState:{scoutPt:0,scouted:[]},onStateChange:changed});
 act(()=>button(v,'候補23のレポート').props.onClick());
 expect(button(v,'候補23を追加調査（1ポイント）').props.disabled).toBe(true);
 act(()=>button(v,'比較に追加').props.onClick());
 act(()=>button(v,'候補22のレポート').props.onClick());
 expect(text(v.toJSON())).toContain('候補23との比較');
 expect(changed.mock.lastCall[0].scoutPt).toBe(0);
});
it('preview and review use observations and pick-time records rather than true potential grading',()=>{
 const evaluation=rememberDraftReport(ensureDraftEvaluation({teams,pool,year:2026,myId:0}),0);
 const preview=mount(DraftPreviewScreen,{evaluation});
 expect(text(preview.toJSON())).not.toContain('平均ポテンシャル');
 const v=mount(DraftReviewScreen,{evaluation,pool:pool.map(p=>({...p,potential:1})),drafted:{0:0}});
 expect(text(v.toJSON())).toContain('指名時のスカウト所見');
 expect(text(v.toJSON())).toContain(evaluation.snapshots[0].report.summary);
 expect(text(v.toJSON())).not.toContain('外れ候補');
});
it('concludes a depleted replacement first round without discarding other winners',()=>{
 const done=vi.fn();const v=mount(DraftLotteryScreen,{pool:[pool[0]],onDone:done,savedState:{
  phase:'select',hazureRound:1,activeTeams:[0],confirmedPicks:{1:0}}});
 expect(button(v,'候補が尽きたため結果へ')).toBeDefined();
 act(()=>button(v,'候補が尽きたため結果へ').props.onClick());
 expect(done.mock.lastCall[0]).toEqual({1:pool[0]});
});
it('does not invent pick-time evidence for a restored completed first round',()=>{
 const evaluation=ensureDraftEvaluation({teams,pool,year:2026,myId:0}),changed=vi.fn();
 const v=mount(DraftLotteryScreen,{evaluation,onEvaluationChange:changed,savedState:{phase:'done',confirmedPicks:{0:0}}});
 act(()=>v.root.findAllByType('button').find(b=>text(b).includes('2巡目以降')).props.onClick());
 expect(changed.mock.calls.every(([s])=>Object.keys(s.snapshots).length===0)).toBe(true);
});
it('focuses a remaining candidate when a viewed candidate disappears',()=>{
 const focus=vi.fn(),session=ensureDraftEvaluation({teams,pool,year:2026,myId:0});
 vi.stubGlobal('document',{getElementById:()=>null});
 let v;act(()=>{v=create(React.createElement(DraftCandidates,{pool,session,savedState:{selected:0}}),{
  createNodeMock:element=>element.props.className==='draft-candidate-scroll'?{scrollTop:0,querySelector:()=>({focus})}:{focus:()=>{}},
 });});views.push(v);
 act(()=>v.update(React.createElement(DraftCandidates,{pool:pool.slice(1),session,savedState:{selected:0}})));
 expect(focus).toHaveBeenCalledTimes(1);vi.unstubAllGlobals();
});
it('states that there is no next nomination instead of suggesting a player can be left for later',()=>{
 const session=ensureDraftEvaluation({teams,pool,year:2026,myId:0});
 const v=mount(DraftCandidates,{session,round:6,noNextPick:true,savedState:{selected:0}});
 expect(text(v.toJSON())).toContain('次の自球団指名はありません');
});
