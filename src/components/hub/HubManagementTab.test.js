import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { act, create } from 'react-test-renderer';
import { expect, it, vi } from 'vitest';
import HubManagementTab from './HubManagementTab';
const team = { id: 0, name: '球団', budget: -10, players: [{id:1,salary:100}], farm: [{id:2,salary:200},{id:3,salary:50,育成:true}], popularity:0, ownerTrust:0 };
it('shows budget, all-owned payroll and shared controlled-slot counts without treating missing as zero', () => {
  const html = renderToStaticMarkup(React.createElement(HubManagementTab,{team,capacityContext:{teams:[team]}}));
  for(const s of ['契約年俸総額 / 年','350万円','支配下登録','残り登録枠','68','-10万円','オーナー信頼度','0 / 100']) expect(html).toContain(s);
  const missing={...team,popularity:undefined,ownerTrust:undefined};
  expect(renderToStaticMarkup(React.createElement(HubManagementTab,{team:missing}))).toContain('未記録');
});
it('offers actionable delivered proposals rather than counting expiring contracts as pending',()=>{
  const navigate=vi.fn(),open=vi.fn();let view;
  act(()=>{view=create(React.createElement(HubManagementTab,{team,onNavigate:navigate,onOpen:open,notifications:{trades:2,posting:1,management:3}}));});
  const text=n=>typeof n==='string'?n:(n.children||[]).map(text).join('');
  const b=view.root.findAllByType('button').find(b=>text(b)==='トレード提案 2件を確認');
  expect(b).toBeTruthy();act(()=>b.props.onClick());expect(open).toHaveBeenCalledWith('trade');
  act(()=>view.root.findAllByType('button').find(b=>text(b)==='ポスティング申請 1件を確認').props.onClick());
  expect(open).toHaveBeenCalledWith('mailbox');act(()=>view.unmount());
});
it('uses current accepted draft reservations and distinguishes invalid ownership from zero space',()=>{
  const props={team,capacityContext:{teams:[team],draftPool:[{id:4}],drafted:{4:0}}};
  const html=renderToStaticMarkup(React.createElement(HubManagementTab,props));
  expect(html).toContain('受諾済み・未所属 1人');expect(html).toContain('67');
  props.capacityContext.teams=[team,{id:1,players:[{id:1}]}];
  expect(renderToStaticMarkup(React.createElement(HubManagementTab,props))).toContain('算出不可');
});
