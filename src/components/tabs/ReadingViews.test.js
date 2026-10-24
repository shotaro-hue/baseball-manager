import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';
import { MailboxTab } from './MailboxTab';
import { NewsTab } from './NewsTab';
import { RecordsTab } from './RecordsTab';
import { AlumniTab } from './AlumniTab';
let view;
afterEach(() => { if (view) act(() => view.unmount()); view = null; });
const text = n => typeof n === 'string' ? n : (n?.children || []).map(text).join('');
const mount = (Component, props) => act(() => { view = create(React.createElement(Component, props)); });
const button = label => view.root.findAllByType('button').find(n => text(n).includes(label));
const click = label => act(() => button(label).props.onClick());
it('mail selection is a native action and reading never accepts the unresolved offer', () => {
  const onRead = vi.fn(), onAction = vi.fn();
  const mail = { id:'m', title:'未読の取引', type:'trade', read:false, resolved:false, body:'本文', offer:{want:[],offer:[],cash:0} };
  mount(MailboxTab, {mailbox:[mail], onRead, onAction});
  expect(button('未読の取引')).toBeTruthy();
  click('未読の取引');
  expect(onRead).toHaveBeenCalledWith('m'); expect(onAction).not.toHaveBeenCalled();
  expect(text(view.root)).toContain('要対応');
});
it('inbox bounds visible rows and permits access to the next page without changing mail', () => {
  const mailbox = Array.from({length:85}, (_, i) => ({id:String(i), title:`通知${i+1}号`, type:'info', read:false}));
  const before=structuredClone(mailbox);
  mount(MailboxTab,{mailbox,onRead:vi.fn(),onAction:vi.fn()});
  expect(text(view.root)).toContain('通知1号'); expect(text(view.root)).not.toContain('通知41号');
  click('次の40件'); expect(text(view.root)).toContain('通知41号'); expect(text(view.root)).not.toContain('通知1号');
  expect(mailbox).toEqual(before);
});
it('unread and actionable filters use independent persisted mail states', () => {
  mount(MailboxTab,{mailbox:[
    {id:'read',title:'既読で未解決',type:'posting_request',read:true,resolved:false},
    {id:'done',title:'既読で解決',type:'trade',read:true,resolved:true},
    {id:'unread',title:'未読のお知らせ',type:'info',read:false}
  ],onRead:vi.fn(),onAction:vi.fn()});
  expect(button('要対応')).toBeTruthy(); click('要対応');
  expect(text(view.root)).toContain('既読で未解決'); expect(text(view.root)).not.toContain('既読で解決'); expect(text(view.root)).not.toContain('未読のお知らせ');
  click('未読'); expect(text(view.root)).toContain('未読のお知らせ'); expect(text(view.root)).not.toContain('既読で未解決');
});
it('news choices are native buttons and rejected answers do not become answered', () => {
  const opt={text:'慎重に進める',popMod:0,moraleMod:0}, onInterview=vi.fn(()=>false);
  mount(NewsTab,{news:[{id:'n',type:'interview',headline:'今後の会見',question:'方針は？',options:[opt],answered:false}],onInterview});
  expect(button('今後の会見')).toBeTruthy(); click('今後の会見'); click('慎重に進める');
  expect(onInterview).toHaveBeenCalledWith('n',opt); expect(text(view.root.findByProps({className:'reading-detail'}))).not.toContain('回答済み');
});
it('historical titles show only the selected year and preserve tied winners and zero', () => {
  const history={standingsHistory:[
    {year:2025,titles:{central:{version:2,hr:{winners:[{name:'旧年度',value:9}]}}}},
    {year:2026,titles:{central:{version:2,hr:{winners:[{name:'同率甲',value:0},{name:'同率乙',value:0}]}}}}
  ]};
  mount(RecordsTab,{history}); click('タイトル歴代');
  expect(text(view.root)).toContain('同率甲'); expect(text(view.root)).toContain('同率乙'); expect(text(view.root)).toContain('0本');
  expect(text(view.root)).not.toContain('旧年度');
  const year=view.root.findByProps({'aria-label':'記録の年度'});act(()=>year.props.onChange({target:{value:'2025'}}));
  expect(text(view.root)).toContain('旧年度');expect(text(view.root)).not.toContain('同率甲');
});
it('a missing HR record does not hide a recorded zero strikeout season behind a no-record label', () => {
  mount(RecordsTab,{history:{records:{singleSeasonK:{value:0,playerName:'記録選手'}}}});click('通算記録');
  expect(text(view.root)).toContain('0K'); expect(text(view.root)).not.toContain('記録なし');
});
it('alumni list stays bounded with native access to older departed players', () => {
  const history=Array.from({length:75},(_,i)=>({id:String(i),name:`退団選手${i+1}号`,tenure:100-i,exitYear:2026,pos:'外野',exitReason:'引退'}));
  mount(AlumniTab,{myTeam:{id:0,history,players:[]},year:2026,saveId:'reading'});
  expect(text(view.root)).toContain('退団選手1号');expect(text(view.root)).not.toContain('退団選手41号');
  click('次の40件');expect(button('退団選手41号')).toBeTruthy();
});
it('keeps an older season MVP visible independently from the latest award winner', () => {
  mount(RecordsTab,{history:{awards:[{year:2026,mvp:{central:{name:'最新のMVP',OPS:0.9}}}],standingsHistory:[{year:2024,central:[],pacific:[],playerAwards:{mvpCentral:{name:'過年度のMVP'}}},{year:2025,central:[],pacific:[]}]}});
  click('年度別順位');
  const year=view.root.findByProps({'aria-label':'記録の年度'});act(()=>year.props.onChange({target:{value:'2024'}}));
  expect(text(view.root)).toContain('過年度のMVP');expect(text(view.root)).not.toContain('最新のMVP');
});
