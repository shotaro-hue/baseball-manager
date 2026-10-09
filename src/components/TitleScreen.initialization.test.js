import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';
import TitleScreen from './TitleScreen';
import { deleteSave } from '../engine/saveload';
vi.mock('../engine/saveload',()=>({getSaveMeta:()=>({teamName:'保存球団',year:2026,gameDay:1}),deleteSave:vi.fn()}));
let view;
afterEach(()=>{if(view)act(()=>view.unmount());view=null;vi.unstubAllGlobals();vi.clearAllMocks();});
it('announces pending and disables all title actions including resume and delete',async()=>{
  await act(async()=>{view=create(React.createElement(TitleScreen,{saveExists:true,initializationStatus:'initializing',isInitializationInProgress:()=>true}));});
  const root=view.root;
  expect(root.findByProps({role:'status'}).children.join('')).toMatch(/初期化中/);
  expect(root.findByProps({'data-testid':'new-game-initialization'}).props['aria-busy']).toBeUndefined();
  for (const grid of root.findAllByProps({className:'tgrid'})) expect(grid.props['aria-busy']).toBe(true);
  for(const button of root.findAllByType('button'))expect(button.props.disabled).toBe(true);
});
it('updates an existing live region outside every busy ancestor',()=>{
  act(()=>{view=create(React.createElement(TitleScreen,{saveExists:false,initializationStatus:'idle'}));});
  const status=view.root.findByProps({role:'status'});
  expect(status.children).toEqual([]);
  act(()=>{view.update(React.createElement(TitleScreen,{saveExists:false,initializationStatus:'initializing'}));});
  expect(view.root.findByProps({role:'status'})).toBe(status);
  for(let parent=status.parent;parent;parent=parent.parent)expect(parent.props['aria-busy']).not.toBe(true);
});
it('invalidates a deletion begun before a completed initialization',async()=>{
  let attempt=0;const onSaveDeleted=vi.fn();vi.stubGlobal('window',{confirm:()=>true});
  await act(async()=>{view=create(React.createElement(TitleScreen,{saveExists:true,initializationStatus:'idle',getInitializationAttempt:()=>attempt,isInitializationInProgress:()=>false,onSaveDeleted}));});
  const remove=view.root.findAllByType('button').find(b=>b.children.join('')==='削除');
  let deleting;act(()=>{deleting=remove.props.onClick();attempt++;});
  await act(async()=>{await deleting;});
  expect(deleteSave).not.toHaveBeenCalled();expect(onSaveDeleted).not.toHaveBeenCalled();
});
it('blocks stale load/delete/select callbacks while the synchronous initialization guard is locked',async()=>{
  const onLoad=vi.fn(),onSaveDeleted=vi.fn(),onSelectTeam=vi.fn(),confirm=vi.fn(()=>true);let locked=false;
  vi.stubGlobal('window',{confirm});
  await act(async()=>{view=create(React.createElement(TitleScreen,{saveExists:true,initializationStatus:'idle',isInitializationInProgress:()=>locked,onLoad,onSaveDeleted,onSelectTeam}));});
  const buttons=view.root.findAllByType('button');locked=true;
  await act(async()=>{for(const button of buttons)await button.props.onClick();});
  expect(onLoad).not.toHaveBeenCalled();expect(onSelectTeam).not.toHaveBeenCalled();
  expect(confirm).not.toHaveBeenCalled();expect(onSaveDeleted).not.toHaveBeenCalled();
});
it('shows failure and restores team selection on retry',()=>{
  const select=vi.fn();
  act(()=>{view=create(React.createElement(TitleScreen,{saveExists:false,initializationStatus:'error',initializationError:'保存失敗。再試行してください。',onSelectTeam:select}));});
  expect(view.root.findByProps({role:'alert'}).children.join('')).toContain('再試行');
  const button=view.root.findAllByType('button')[0];expect(button.props.disabled).toBe(false);
  act(()=>button.props.onClick());expect(select).toHaveBeenCalledTimes(1);
});
