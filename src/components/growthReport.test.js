import React from 'react';
import {act,create} from 'react-test-renderer';
import {afterEach,expect,it,vi} from 'vitest';
import {GrowthSummaryScreen} from './OffseasonReviewScreens';
const text=n=>typeof n==='string'?n:(n.children||[]).map(text).join('');
const p=(id,extra={})=>({id,name:`選手${id}`,age:24,pos:'捕手',batting:{contact:0,power:60,speed:40},...extra});
const before=p(0),current={...before,batting:{contact:6,power:64,speed:43}};
const growth=p(1),decline=p(2,{age:35});
const summary={breakout:[{p:before,diff:13}],growth:[{p:growth,diff:7}],decline:[{p:decline,diff:-9}]};
const views=[];
afterEach(()=>{for(const v of views.splice(0))act(()=>v.unmount());vi.restoreAllMocks();});
function setup(extra={}){
 let props={summary,teams:[{id:0,name:'球団',players:[current,{...growth,batting:{contact:0,power:64,speed:43}},{...decline,batting:{contact:0,power:57,speed:34}}],farm:[]}],myId:0,year:2026,saveId:'report',onNext:vi.fn(),...extra};let view;
 act(()=>{view=create(React.createElement(GrowthSummaryScreen,props));});views.push(view);
 const button=label=>view.root.findAllByType('button').find(n=>n.props['aria-label']===label||text(n)===label);
 const click=label=>{expect(button(label),`missing action: ${label}`).toBeTruthy();act(()=>button(label).props.onClick());};
 const update=changes=>act(()=>{props={...props,...changes};view.update(React.createElement(GrowthSummaryScreen,props));});
 const list=()=>{const n=view.root.findAllByProps({'aria-label':'成長記録一覧'})[0];expect(n,'growth list').toBeTruthy();return n;};
 return{view,button,click,update,list,get props(){return props;}};
}
it('shows a concise list with two main changes and defers ability tables until selecting a player',()=>{
 const ui=setup();expect(ui.view.root.findAllByProps({'aria-label':'選手0の能力変化'})).toHaveLength(0);
 const row=ui.button('選手0の能力変化を確認');expect(row).toBeTruthy();expect(text(row)).toContain('ミート +6');expect(text(row)).toContain('長打 +4');expect(text(row)).not.toContain('走力');expect(text(row.parent.parent)).toContain('+13pt');
 ui.click('選手0の能力変化を確認');expect(ui.view.root.findAllByProps({'aria-label':'選手0の能力変化'})).toHaveLength(1);
 const rows=ui.view.root.findAllByType('tr');expect(text(rows.find(r=>text(r).startsWith('ミート')))).toContain('06+6');expect(text(rows.find(r=>text(r).startsWith('走力')))).toContain('4043+3');
});
it('filters recorded upward and downward groups without changing data and restores the filter after detail',()=>{
 const ui=setup();const signature=JSON.stringify(ui.props);
 ui.click('上昇の記録');expect(text(ui.list())).toContain('選手0');expect(text(ui.list())).toContain('選手1');expect(text(ui.list())).not.toContain('選手2');
 ui.click('選手0の能力変化を確認');ui.click('成長一覧に戻る');expect(ui.button('上昇の記録').props['aria-pressed']).toBe(true);
 ui.click('下降の記録');expect(text(ui.list())).toContain('選手2');expect(text(ui.list())).not.toContain('選手0');expect(text(ui.list())).toContain('起用見直し候補');expect(JSON.stringify(ui.props)).toBe(signature);
});
it('retains zero and missing before/current values in a selected player comparison',()=>{
 const ui=setup({teams:[{id:0,name:'球団',players:[{...before,batting:{contact:0,power:62,arm:50}}],farm:[]}],summary:{breakout:[],growth:[{p:before,diff:2}],decline:[]}});
 ui.click('選手0の能力変化を確認');const rows=ui.view.root.findAllByType('tr');expect(text(rows.find(r=>text(r).startsWith('ミート')))).toContain('000');expect(text(rows.find(r=>text(r).startsWith('肩')))).toContain('未記録50未記録');expect(text(rows.find(r=>text(r).startsWith('走力')))).toContain('40未記録未記録');
});
it('uses current farm or FA records by ID 0 and never fabricates current values for a missing player',()=>{
 const ui=setup({teams:[{id:0,name:'球団',players:[],farm:[current]}]});ui.click('選手0の能力変化を確認');expect(text(ui.view.root.findByProps({'aria-label':'選手0の能力変化'}))).toContain('06+6');
 ui.update({teams:[{id:0,name:'球団',players:[],farm:[]}],faPool:[current]});expect(text(ui.view.root.findByProps({'aria-label':'選手0の能力変化'}))).toContain('06+6');
 ui.update({faPool:[]});expect(text(ui.view.root.findByProps({'aria-label':'選手0の能力変化'}))).toContain('0未記録未記録');
});
it('keeps available groups when another group is unrecorded and does not call it zero or unchanged',()=>{
 const ui=setup({summary:{breakout:[],growth:[{p:before,diff:0}],decline:null}});expect(text(ui.list())).toContain('選手0');expect(text(ui.list())).toContain('0pt');expect(text(ui.view.root)).toContain('未記録');expect(text(ui.view.root)).not.toContain('大きな変化はありません');
 ui.update({summary:{breakout:[],growth:[],decline:[]}});expect(text(ui.view.root)).toContain('大きな変化はありません');
 ui.update({summary:null});expect(text(ui.view.root)).toContain('成長結果が未記録');expect(text(ui.view.root)).not.toContain('大きな変化はありません');
});
it('keeps an orphan growth record visible without creating a fake selectable player',()=>{
 const ui=setup({summary:{breakout:[],growth:[{p:null,diff:4}],decline:[]}});expect(text(ui.list())).toContain('選手情報未記録');expect(text(ui.list())).toContain('+4pt');expect(ui.list().findAllByType('button')).toHaveLength(0);
});
it('resets selection for another report identity and returns to the list when the record disappears',()=>{
 const ui=setup();ui.click('選手0の能力変化を確認');ui.update({summary:{breakout:[],growth:[],decline:[]}});expect(ui.view.root.findAllByProps({'aria-label':'選手0の能力変化'})).toHaveLength(0);
 ui.update({summary});ui.click('選手0の能力変化を確認');ui.update({year:2027});expect(ui.view.root.findAllByProps({'aria-label':'選手0の能力変化'})).toHaveLength(0);
});
it('closes an embedded report without advancing the existing offseason phase',()=>{
 const onClose=vi.fn();const ui=setup({embedded:true,onClose});ui.click('編成に戻る');expect(onClose).toHaveBeenCalledTimes(1);expect(ui.props.onNext).not.toHaveBeenCalled();
});
it('distinguishes an empty recorded filter from missing data in an unrelated group',()=>{
 const ui=setup({summary:{breakout:[],growth:[],decline:null}});ui.click('上昇の記録');expect(text(ui.list())).toContain('この条件の成長記録はありません');expect(text(ui.list())).not.toContain('未記録');
 ui.update({summary:{breakout:null,growth:[],decline:[]}});ui.click('下降の記録');expect(text(ui.list())).toContain('この条件の成長記録はありません');expect(text(ui.list())).not.toContain('未記録');
});
it('clears an old detail when switching the displayed group',()=>{
 const ui=setup();ui.click('選手0の能力変化を確認');ui.click('下降の記録');expect(ui.view.root.findAllByProps({'aria-label':'選手0の能力変化'})).toHaveLength(0);expect(text(ui.list())).toContain('選手2');
});
