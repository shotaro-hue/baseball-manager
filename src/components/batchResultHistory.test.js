import React from 'react';
import {act,create} from 'react-test-renderer';
import {afterEach,expect,it,vi} from 'vitest';
import {BatchResultScreen} from './BatchResult';
import BatchResultRoute from './screenRoutes/BatchResultRoute';
let view;
afterEach(()=>{act(()=>view?.unmount());view=null;vi.unstubAllGlobals();});
const content=node=>typeof node==='string'?node:(node.children||[]).map(content).join('');
const hr=(batId,batter)=>({result:'hr',scorer:true,batId,batter});
const out={result:'out',scorer:true,batter:'打者'};
const results=[{gameNo:1,score:{my:3,opp:1}},{gameNo:2,score:{my:4,opp:0}}];
function screen(map, rows=results){
 const pending=[];vi.stubGlobal('requestIdleCallback',cb=>{pending.push(cb);return pending.length;});vi.stubGlobal('cancelIdleCallback',()=>{});
 act(()=>{view=create(React.createElement(BatchResultScreen,{results:rows,getGameResult:result=>map[result.gameNo],onEnd:()=>{}}));});
 expect(content(view.root)).toContain('集計中');
 act(()=>pending.forEach(cb=>cb()));return content(view.root);
}
it('reads recorded game logs for lightweight batch summaries and aggregates by ID including zero',()=>{
 const rendered=screen({1:{log:[hr(0,'同名'),hr('a','別選手'),null,{...hr('enemy','相手'),scorer:false}]},2:{log:[hr(0,'同名'),hr('b','同名')]},99:{log:[hr(0,'同名')]} });
 const rows=view.root.findAll(node=>node.props.className==='batch-highlight-row').map(content);
 expect(rows).toEqual(['同名2本塁打','別選手1本塁打','同名1本塁打']);
 expect(rendered).toContain('ログ記録あり 2/2試合');
});
it('excludes opponent HR and malformed/missing identity entries',()=>{
 const rendered=screen({1:{log:[{...hr(0,'自球団'),scorer:false},hr(1,'自球団'),null,{}, {result:'hr',scorer:true}]},2:{log:[out]}});
 expect(rendered).toContain('自球団1本塁打');expect(view.root.findAll(node=>node.props.className==='batch-highlight-row')).toHaveLength(1);
});
it.each([
 [{1:{log:[out]},2:{log:[out]}},'ログ記録あり 2/2試合','本塁打なし'],
 [{},'ログ記録あり 0/2試合','未記録'],
 [{1:{log:[]},2:{log:'broken'}},'ログ記録あり 0/2試合','未記録'],
 [{1:{log:[hr(1,'打者')]}},'ログ記録あり 1/2試合','打者1本塁打'],
])('distinguishes zero, unavailable and partial recorded coverage', (map,coverage,message)=>{
 const rendered=screen(map);expect(rendered).toContain(coverage);expect(rendered).toContain(message);
});
it('keeps legacy name-only records separate from ID-keyed players',()=>{
 screen({1:{log:[hr(0,'同名'),hr(null,'同名')]},2:{log:[hr(null,'同名')]}});
 expect(view.root.findAll(node=>node.props.className==='batch-highlight-row').map(content)).toEqual(['同名2本塁打','同名1本塁打']);
});
it.each([
 [{result:'change'}], [{result:'not-a-result'}], [{result:'hr',scorer:true}],
 [{result:'out',scorer:true}], [{result:'hr',batter:'打者'}], [{result:'sb',scorer:true,batter:'打者',isStolenBase:true}],
].map(log=>[log]))('does not report measured zero for malformed-only or non-batting logs: %s',log=>{
 const rendered=screen({1:{log}});expect(rendered).toContain('未記録');expect(rendered).not.toContain('本塁打なし');
});
it('shows unresolved HR rather than zero when a valid out and an unidentifiable HR coexist',()=>{
 const rendered=screen({1:{log:[out,{result:'hr',scorer:true}]}});
 expect(rendered).toContain('本塁打数は未確認');expect(rendered).not.toContain('本塁打なし');
});
it('contains record aggregation errors without losing games or home navigation',()=>{
 const record={get log(){throw new Error('unreadable');}};
 const rendered=screen({1:record});expect(rendered).toContain('ハイライトの集計に失敗');
 expect(view.root.findAll(node=>node.props.className==='batch-game')).toHaveLength(2);
 expect(view.root.findAllByType('button').find(node=>content(node)==='ホームへ戻る').props.disabled).not.toBe(true);
});
it.each([{year:2027},{saveId:'other'},{myId:1},{sessionToken:3}])('does not mix stale batch details with a different current context: %s',change=>{
 const context={year:2026,saveId:'save',myId:0,sessionToken:2};
 const gs={screen:'batch_result',...context,...change,getProgressSessionToken:()=>change.sessionToken??2,getGameResultsMap:()=>({1:{log:[hr(1,'別年度の選手')]}})};
 let props;function Capture(p){props=p;return null;}
 act(()=>{view=create(React.createElement(BatchResultRoute,{gs,sf:{batchResults:results,batchContext:context},ScreenComponent:Capture}));});
 expect(props.canViewDetail(results[0])).toBe(false);expect(props.getGameResult(results[0])).toBeUndefined();
});
it('resolves only game numbers in this batch from the current year map',()=>{
 const context={year:2026,saveId:'save',myId:0,sessionToken:2};
 const record={log:[hr(0,'打者')]};const map={1:record,99:{log:[hr(3,'別バッチ')]}};
 let props;function Capture(p){props=p;return null;}
 act(()=>{view=create(React.createElement(BatchResultRoute,{gs:{screen:'batch_result',...context,getProgressSessionToken:()=>2,getGameResultsMap:()=>map},sf:{batchResults:results,batchContext:context},ScreenComponent:Capture}));});
 expect(props.getGameResult(results[0])).toBe(record);expect(props.getGameResult({gameNo:99})).toBeUndefined();
});
