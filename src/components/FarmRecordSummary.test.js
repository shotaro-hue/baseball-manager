import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {it,expect} from 'vitest';
import {FarmRecordSummary,FarmRecordScope} from './FarmRecordSummary';
import {teams} from '../engine/__tests__/farmFixtures';import {migrateFarmCompetition} from '../engine/farmMigration';
const state=(day=1)=>migrateFarmCompetition({teams:teams().map(t=>({...t,wins:day-1,losses:0,draws:0})),myId:0,saveId:'view',year:2026,gameDay:day,seasonHistory:{}});
const render=(s,p)=>renderToStaticMarkup(React.createElement(FarmRecordSummary,{state:s,player:p}));
it('distinguishes measured zero and undefined rates from missing records',()=>{
 const s=state(),p=s.teams[0].farm[0];expect(render(s,p)).toContain('0打席');expect(render(s,p)).toContain('打率 —');
 expect(render({},p)).toContain('未記録');expect(render({},p)).not.toContain('0打席');
 const pitcher=s.teams[0].farm.find(p=>p.isPitcher);expect(render(s,pitcher)).toContain('0.0回');expect(render(s,pitcher)).toContain('防御率 —');
});
it('shows year, partial start, actual/unplayed counts and legacy provenance without mixing',()=>{
 const s=state(51),p=s.teams[0].farm[0];s.farmCompetition.legacy.entries.push({playerId:p.id,stats:{PA:200,H:70},year:null});
 expect(renderToStaticMarkup(React.createElement(FarmRecordScope,{state:s,teamId:0}))).toContain('2026年');
 expect(renderToStaticMarkup(React.createElement(FarmRecordScope,{state:s,teamId:0}))).toContain('51試合目');
 expect(renderToStaticMarkup(React.createElement(FarmRecordScope,{state:s,teamId:0}))).toContain('実施0');
 expect(renderToStaticMarkup(React.createElement(FarmRecordScope,{state:s,teamId:0}))).toContain('未実施0');
 expect(render(s,p)).toContain('旧推定');expect(render(s,p)).toContain('年度不明');expect(render(s,p)).toContain('0打席');expect(render(s,p)).not.toContain('200打席');
 // Promotions retain zero records instead of switching to legacy stats2.
 s.teams[0].players.push(p);s.teams[0].farm=s.teams[0].farm.filter(x=>x.id!==p.id);expect(render(s,p)).toContain('0打席');
});
it('allows mobile farm records to be reached without opening advanced roster settings',async()=>{
 const {MobileRoster}=await import('./MobileRoster');const {create,act}=await import('react-test-renderer');
 const s=state(),team={...s.teams[0],lineup:[]};let view;
 act(()=>{view=create(React.createElement(MobileRoster,{team,farmState:s}));});
 const farm=view.root.findAllByType('button').find(b=>b.children.includes('二軍'));
 expect(farm).toBeDefined();act(()=>farm.props.onClick());
 expect(view.root.findAllByType(FarmRecordSummary)).toHaveLength(team.farm.length);act(()=>view.unmount());
});
it('uses captured provenance instead of labeling new-player empty stats2 as historical estimates',()=>{
 const s=state(),p={...s.teams[0].farm[0],stats2:{PA:0,H:0}};
 expect(render(s,p)).not.toContain('旧推定');expect(render({},p)).toContain('旧推定');
});
