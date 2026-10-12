import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect,vi} from 'vitest';
import HubShell from './HubShell';
import {regularSeasonRequest} from '../../engine/seasonProgress';
vi.mock('./HubContentRouter',()=>({default:()=>null}));

const team={id:0,name:'自軍',wins:0,losses:0,draws:0,players:[],farm:[]};
const opponent={...team,id:1,name:'相手'};
const schedule={1:{date:{month:3,day:27},matchups:[{homeId:0,awayId:1}]}};
const {default:HubContentRouter}=await vi.importActual('./HubContentRouter');
const base={getMailboxBySelector:()=>[],getNewsBySelector:()=>[],getUnreadMailboxCount:()=>0,getLatestNewsId:()=>null,getSeasonHistory:()=>({}),allTeamResultsMap:{},recentResults:[],myTeam:team,teams:[team,opponent],myId:0,year:2026,gameDay:1,schedule,gameResultsMap:{},tab:'schedule',tabBadges:{},setTab:()=>{}};
describe('HubShell non-home progression agrees with the home request',()=>{
 it.each([
  ['normal',{},true],
  ['missing schedule',{schedule:{}},false],
  ['duplicate result',{gameResultsMap:{1:{won:true}}},false],
  ['duplicate matchup',{schedule:{1:{matchups:[...schedule[1].matchups,...schedule[1].matchups]}}},false],
  ['cursor mismatch',{gameDay:2},false],
  ['season complete',{myTeam:{...team,wins:143},teams:[{...team,wins:143},opponent]},false],
  ['postseason',{offseasonPlan:{year:2026,myId:0,stage:'postseason'}},false],
 ])('%s: all three actions follow the same game state',(name,extra,enabled)=>{
  const gs={...base,...extra};
  expect(regularSeasonRequest(gs,1).count>0).toBe(enabled);
  const homeHtml=renderToStaticMarkup(React.createElement(HubContentRouter,{app:{gs,sf:{},os:{}},tab:'dashboard'}));
  const homeStart=homeHtml.match(/<button[^>]*>試合へ進む/)[0];
  expect(homeStart.includes('disabled')).toBe(!enabled);
  const html=renderToStaticMarkup(React.createElement(HubShell,{state:{gs},flows:{sf:{},os:{}},app:{gs,sf:{},os:{}}}));
  const panel=html.match(/<div class="flow-sim-panel home-sim-panel"[\s\S]*?<\/details>/)?.[0];
  expect(panel).toBeTruthy();
  expect((panel.match(/<button[^>]*disabled/g)||[]).length).toBe(enabled?0:3);
 });
});
