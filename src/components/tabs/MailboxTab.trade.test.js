import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';
import { MailboxTab } from './MailboxTab';
let view;
afterEach(() => { if(view) act(() => view.unmount()); view=null; });
it('keeps a rejected trade mail actionable instead of locally marking it resolved', () => {
  const onAction = vi.fn(() => false);
  const mail = { id: 'trade', type: 'trade', title: '取引テスト', body: '', offer: { from: {name:'相手'}, want:[], offer:[], cash:0 } };
  act(() => { view=create(React.createElement(MailboxTab, {mailbox:[mail],onRead:()=>{},onAction,teams:[],myTeam:{id:0},gameDay:1})); });
  const text=n=>typeof n==='string'?n:(n.children||[]).map(text).join('');
  const row=view.root.findAll(n=>n.type==='div'&&n.props.onClick).find(n=>text(n).includes('取引テスト'));
  act(()=>row.props.onClick());
  const accept=view.root.findAllByType('button').find(n=>text(n).includes('承諾する'));
  act(()=>accept.props.onClick());
  expect(text(view.root)).not.toContain('対応済み');
  expect(view.root.findAllByType('button').some(n=>text(n).includes('承諾する'))).toBe(true);
});
