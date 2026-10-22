import React from 'react';
import {it,expect,vi,afterEach} from 'vitest';
import {create,act} from 'react-test-renderer';
import HubHeader from './hub/HubHeader';
afterEach(()=>vi.unstubAllGlobals());
it('exposes a diagnostic copy action from the in-season save failure, with selectable fallback on clipboard denial',async()=>{
  vi.stubGlobal('navigator',{clipboard:{writeText:async()=>{throw new Error('denied');}}});
  let tree;act(()=>{tree=create(React.createElement(HubHeader,{myTeam:{name:'球団',wins:1,losses:1},year:2026,gameDay:106,remain:37,saveResult:{ok:false,reason:'quota_exceeded'}}));});
  const buttons=tree.root.findAllByType('button');const copy=buttons.find(b=>b.children.includes('保存診断をコピー'));
  expect(copy).toBeDefined();
  await act(async()=>{await copy.props.onClick();});
  const area=tree.root.findByType('textarea');expect(area.props.readOnly).toBe(true);expect(area.props.value).toContain('quota_exceeded');
  expect(JSON.stringify(tree.toJSON())).toContain('長押し');act(()=>tree.unmount());
});
