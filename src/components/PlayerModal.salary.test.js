import React from 'react';
import { act, create } from 'react-test-renderer';
import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { ContractTab } from './tabs/ContractTab';
import { PlayerModal } from './PlayerModal';
const fixture = JSON.parse(gunzipSync(readFileSync(new URL('../../e2e/fixtures/new-game.json.gz', import.meta.url))));
const text = node => typeof node === 'string' ? node : (node.children || []).map(text).join('');
it('distinguishes unverified real-world pay and pre-game service time from game settings',()=>{
 const player={...fixture.teams[0].farm.find(p=>!p.isPitcher),daysOnActiveRoster:2,serviceYears:0,dataQuality:{salary:'game-assumption-ambiguous-legacy',contract:'legacy-unverified',serviceTime:'game-baseline-unknown'}};
 let view;act(()=>{view=create(React.createElement(PlayerModal,{player,initialSection:'profile',onClose:()=>{}}));});
 try {const value=text(view.root);expect(value).toContain('ゲーム設定');expect(value).toContain('開始前のFA登録日数は未確認');expect(value).not.toContain('国内FA 最短あと');}
 finally {act(()=>view.unmount());}
});
it('does not label a negotiated game salary as an opening-day media estimate',()=>{
 const player={...fixture.teams[0].farm.find(p=>!p.isPitcher),salary:1200,contractSignedYear:2026,
   dataQuality:{salary:'reported',contract:'game-assumption'},openingContractEvidence:{annualSalaryManYen:1000}};
 let view;act(()=>{view=create(React.createElement(PlayerModal,{player,initialSection:'profile',onClose:()=>{}}));});
 try {expect(text(view.root)).not.toContain('報道推定');expect(text(view.root)).not.toContain('実際の終了年は未確認');}
 finally {act(()=>view.unmount());}
});
it('identifies an assumed end year separately from a reported annual salary',()=>{
 const player={...fixture.teams[0].farm.find(p=>!p.isPitcher),dataQuality:{salary:'reported',contract:'game-assumption'}};
 let view;act(()=>{view=create(React.createElement(PlayerModal,{player,initialSection:'profile',onClose:()=>{}}));});
 try {expect(text(view.root)).toContain('報道推定');expect(text(view.root)).toContain('実際の終了年は未確認');}
 finally {act(()=>view.unmount());}
});
it.each([{育成:true,isIkusei:false},{育成:false,isIkusei:true}])('shows the development contract category instead of FA eligibility in player details: %j',flags=>{
  const player={...fixture.teams[0].farm.find(p=>!p.isPitcher),...flags,daysOnActiveRoster:1080};
  let view;act(()=>{view=create(React.createElement(PlayerModal,{player,initialSection:'profile',onClose:()=>{}}));});
  try{
    expect(text(view.root)).toContain('育成契約中・FA対象外');
    expect(text(view.root)).not.toContain('国内FA資格あり');
    expect(view.root.findAllByType('span').some(n=>text(n)==='育成')).toBe(true);
  }finally{act(()=>view.unmount());}
});
it.each([{育成:true,isIkusei:false},{育成:false,isIkusei:true}])('keeps an expired development player identifiable as a free contract in details: %j',flags=>{
  const player={...fixture.teams[0].farm.find(p=>!p.isPitcher),...flags,isFA:true,departureReason:'ikusei_expiry',daysOnActiveRoster:1080};
  let view;act(()=>{view=create(React.createElement(PlayerModal,{player,initialSection:'profile',onClose:()=>{}}));});
  try{expect(text(view.root)).toContain('自由契約（育成）');expect(text(view.root)).not.toContain('育成契約中');expect(text(view.root)).not.toContain('FA中');}
  finally{act(()=>view.unmount());}
});
it.each([[null,'— 未記録'],[undefined,'— 未記録'],[-1,'— 不正値'],['100','— 不正値'],[0,'0万円']])('opens salary leader with %s safely and preserves the original player', (salary, label) => {
  const p = Object.freeze({ ...fixture.teams[0].farm.find(p => !p.isPitcher), id: 0, salary, name: '年俸確認選手' });
  const team = { id: 0, name: '球団', players: [], farm: [p], coaches: [], wins: 0, losses: 0, budget: 1000 };
  const before = JSON.stringify(team); let view, selected;
  act(() => { view = create(React.createElement(ContractTab, { team, year: 2026, onPlayerClick: player => {
    selected = player;
    view.update(React.createElement(PlayerModal, { player, teamName: team.name, initialSection: 'profile', onClose: () => {} }));
  } })); });
  const payroll = view.root.findAllByType('details').find(n => n.props.onToggle);
  act(() => payroll.props.onToggle({ currentTarget: { open: true } }));
  act(() => view.root.findAllByType('button').find(n => text(n) === p.name).props.onClick());
  expect(selected).toBe(p); expect(text(view.root)).toContain(`年俸${label}`);
  expect(JSON.stringify(team)).toBe(before);
  act(() => view.unmount());
});
