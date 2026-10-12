import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {act,create} from 'react-test-renderer';
import {describe,it,expect,vi} from 'vitest';
import {MobileHome} from './MobileHome';
import {DashboardTab} from './DashboardTab';
import HubHeader from './hub/HubHeader';
import HubSimPanel from './hub/HubSimPanel';
const player={id:0,name:'選手0',condition:50,contractYearsLeft:1};
const team={id:0,name:'球団0',short:'自軍',league:'セ',wins:2,losses:1,draws:1,players:[player],farm:[],lineup:[0]};
const leader={...team,id:1,name:'球団1',short:'相手',wins:4,losses:0,draws:0,players:[]};
const schedule={5:{date:{month:4,day:1},matchups:[{homeId:0,awayId:1}]}};
const props={myTeam:team,teams:[team,leader],year:2026,gameDay:5,schedule,canSim:true,onTabSwitch:()=>{},recentResults:[{gameNo:4,won:true,myScore:4,oppScore:1,oppName:'球団1'}]};
const render=(Component,extra={})=>renderToStaticMarkup(React.createElement(Component,{...props,...extra}));
describe('UI-01B approved home hierarchy',()=>{
 it.each([['mobile',MobileHome],['desktop',DashboardTab]])('shows league metrics, next fixture, last result and actual alerts (%s)',(name,Component)=>{
  const html=render(Component);expect(html).toContain('data-ds="metrics"');expect(html).toContain('2−1−1');
  expect(html).toContain('1.5');expect(html).toContain('直近5試合');expect(html).toContain('次の対戦');
  expect(html).toContain('まとめて進める');expect(html).toContain('要確認');expect(html).toContain('4 − 1');
  expect(html).toContain('編成を見直す');
 });
 it.each([['mobile',MobileHome],['desktop',DashboardTab]])('explains disabled progression using the existing request reason (%s)',(name,Component)=>{
  expect(render(Component,{canSim:false,disableStart:true,simReason:'通常シーズンは終了しています。'})).toContain('通常シーズンは終了しています。');
 });
 it.each([['mobile',MobileHome],['desktop',DashboardTab]])('does not fabricate a fixture when schedule is absent (%s)',(name,Component)=>{
  expect(render(Component,{schedule:null,canSim:false,disableStart:true,simReason:'未実行の対戦日程を確認できません。'})).toContain('日程なし');
 });
 it('shows no scheduled date in the home header when a round is absent',()=>{
  expect(render(HubHeader,{home:true,schedule:null})).toContain('日程なし');
 });
 it('does not display healthy missing team records as measured zero',()=>{
  const html=render(MobileHome,{myTeam:{...team,wins:NaN}});expect(html).not.toContain('NaN');expect(html).toContain('算出不可');
 });
 it.each([
  [{saveDirty:false,saveQueueState:{isSaving:false}},'保存状態未確認'],
  [{saveDirty:true},'保存待ち'],
  [{saveDirty:true,saveQueueState:{isSaving:true}},'保存中'],
  [{saveDirty:false,saveResult:{ok:false}},'保存失敗'],
  [{saveDirty:false,saveResult:{ok:true}},'保存済み'],
  [{saveDirty:true,saveResult:{ok:true}},'保存待ち'],
  [{saveDirty:false,saveResult:{ok:true,archive:{ok:false}}},'保存済み・一部履歴は要確認'],
  [{saveDirty:false,saveResult:{ok:true,warnings:['metadata_failed']}},'保存済み・保存情報は要確認'],
 ])('only reports an actual successful save: %s',(extra,label)=>{
  const html=render(HubHeader,{home:true,...extra});expect(html).toContain(label);
  if(!label.startsWith('保存済み'))expect(html).not.toContain('保存済み');
 });
 it('keeps batch and season automation as separate settings and sends native actions',()=>{
  const onBatchSim=vi.fn(),onSeasonSim=vi.fn(),onStartGame=vi.fn();let view;
  act(()=>{view=create(React.createElement(HubSimPanel,{...props,remain:139,onBatchSim,onSeasonSim,onStartGame}));});
  const checkboxes=view.root.findAllByType('input');
  act(()=>checkboxes[0].props.onChange({target:{checked:true}}));
  act(()=>view.root.findAllByType('button')[1].props.onClick());
  act(()=>view.root.findAllByType('button')[2].props.onClick());
  expect(onBatchSim).toHaveBeenCalledWith(5,true);expect(onSeasonSim).toHaveBeenCalledWith(false);
  act(()=>view.root.findAllByType('button')[0].props.onClick());expect(onStartGame).toHaveBeenCalledOnce();
  expect(render(HubSimPanel,{remain:139})).not.toContain('linear-gradient');act(()=>view.unmount());
 });
});
