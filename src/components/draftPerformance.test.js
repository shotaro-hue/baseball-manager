import React from 'react';
import {act,create} from 'react-test-renderer';
import {afterEach,expect,it,vi} from 'vitest';
import DraftCandidates from './DraftCandidates';
import {ensureDraftEvaluation} from '../engine/draftReports';

let view;afterEach(()=>{if(view)act(()=>view.unmount());view=null;vi.useRealTimers();vi.unstubAllGlobals();});
function mount(savedState={}){
 const pool=Array.from({length:80},(_,id)=>({id,name:`候補${id}`,age:22,pos:'捕手',prospectType:'大卒',potential:60,batting:{}}));
 const session=ensureDraftEvaluation({teams:[{id:0}],pool,year:2026,myId:0}),changed=vi.fn();
 const list={scrollTop:savedState.listScroll||0,querySelector:()=>null},listeners={},heading={focus:vi.fn()};
 vi.stubGlobal('document',{addEventListener:(name,fn)=>{listeners[name]=fn;},removeEventListener:(name)=>{delete listeners[name];},getElementById:()=>null});
 act(()=>{view=create(React.createElement(DraftCandidates,{pool,session,savedState,onStateChange:changed}),{createNodeMock:el=>el.props.className==='draft-candidate-scroll'?list:el.type==='h2'&&el.props.tabIndex===-1?heading:{focus:()=>{},contains:()=>false}});});
 changed.mockClear();
 return {changed,list,listeners,heading,scroll(n){list.scrollTop=n;act(()=>view.root.findByProps({className:'draft-candidate-scroll'}).props.onScroll({currentTarget:list}));}};
}
it('persists settled scrolling once and captures the current position when opening immediately',()=>{
 vi.useFakeTimers();const {changed,list,scroll}=mount();
 for(let i=0;i<48;i++)scroll(i*80);
 expect(changed).not.toHaveBeenCalled();
 act(()=>vi.advanceTimersByTime(200));
 expect(changed).toHaveBeenCalledTimes(1);expect(changed.mock.lastCall[0].listScroll).toBe(3760);
 scroll(4200);
 act(()=>view.root.findByProps({id:'draft-candidate-50'}).props.onClick());
 expect(changed.mock.lastCall[0]).toMatchObject({selected:50,listScroll:4200});
 expect(list.scrollTop).toBe(4200);
});
it('flushes pending position before external save interaction and cancels unmounted timers',()=>{
 vi.useFakeTimers();const {changed,listeners,scroll}=mount({listScroll:300});
 scroll(900);act(()=>listeners.pointerdown({target:{}}));
 expect(changed.mock.lastCall[0].listScroll).toBe(900);
 changed.mockClear();scroll(1200);act(()=>view.unmount());view=null;
 act(()=>vi.advanceTimersByTime(300));expect(changed).not.toHaveBeenCalled();
});
it('resets the actual list position when filters change',()=>{
 vi.useFakeTimers();const {list,scroll,changed}=mount({listScroll:800});
 scroll(1200);act(()=>view.root.findByProps({'aria-label':'並び順'}).props.onChange({target:{value:'public'}}));
 expect(list.scrollTop).toBe(0);expect(changed.mock.lastCall[0]).toMatchObject({sort:'public',listScroll:0});
});
it('keeps desktop list scrolling made while a detail is open through compare and back',()=>{
 vi.useFakeTimers();const {list,scroll,changed}=mount({selected:0,listScroll:300});
 scroll(1800);
 const text=n=>typeof n==='string'?n:(n.children||[]).map(text).join('');
 act(()=>view.root.findAllByType('button').find(b=>text(b)==='比較に追加').props.onClick());
 expect(changed.mock.lastCall[0]).toMatchObject({compare:0,listScroll:1800});
 scroll(2400);
 act(()=>view.root.findAllByType('button').find(b=>text(b)==='候補一覧に戻る').props.onClick());
 expect(list.scrollTop).toBe(2400);expect(changed.mock.lastCall[0]).toMatchObject({selected:null,listScroll:2400});
});

it('resets a filtered desktop list while detail is open without refocusing its heading',()=>{
 vi.useFakeTimers();const {list,heading,changed}=mount({selected:0,listScroll:800});
 heading.focus.mockClear();
 act(()=>view.root.findByProps({'aria-label':'並び順'}).props.onChange({target:{value:'public'}}));
 expect(list.scrollTop).toBe(0);
 expect(heading.focus).not.toHaveBeenCalled();
 expect(changed.mock.lastCall[0]).toMatchObject({selected:0,sort:'public',listScroll:0});
});
