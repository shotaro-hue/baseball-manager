import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';
import { useGameState } from './useGameState';
import { startClubFinance } from '../engine/clubFinance';
vi.mock('../engine/saveload',()=>({hasSave:()=>false,getAutoSaveIntervalMs:()=>30000,getSaveQueueSnapshot:()=>({isSaving:false})}));
let view,gs;
afterEach(()=>{if(view)act(()=>view.unmount());view=null;});
const roster=(n)=>({id:0,name:'球団',budget:10000,players:[],farm:[...Array.from({length:n},(_,i)=>({id:`p${i}`,salary:500})),{id:'dev',isIkusei:true,salary:240}],scoutResults:[{id:'scout',name:'新人',salary:500}],history:[]});
function setup(n=69,plan=null){function Harness(){gs=useGameState();return null;}act(()=>{view=create(React.createElement(Harness));});act(()=>{gs.setMyId(0);gs.setYear(2026);gs.setTeams([roster(n)]);gs.setOffseasonPlan(plan);});}
it('uses the same new-model upgrade cost and refuses repeated stale spending beyond the budget', () => {
 setup(); act(() => gs.setTeams([startClubFinance({ ...roster(69), budget: 110000, stadiumLevel: 0 }, 2026)]));
 const upgrade = gs.handleStadiumUpgrade;
 act(() => { upgrade(); upgrade(); });
 expect(gs.myTeam.stadiumLevel).toBe(1);
 expect(gs.myTeam.budget).toBe(10000);
});
it('blocks direct promotion of isIkusei-only players and clears both flags on conversion once',()=>{
 setup();act(()=>gs.promote('dev'));expect(gs.myTeam.players).toHaveLength(0);
 const convert=gs.convertIkusei;act(()=>{convert('dev');convert('dev');});
 expect(gs.myTeam.farm.find(p=>p.id==='dev')).toMatchObject({育成:false,isIkusei:false,salary:420});
 expect(gs.myTeam.budget).toBe(9820);expect(gs.myTeam.farm).toHaveLength(70);
});
it.each([{育成:true},{isIkusei:true}])('converts in the farm with a full active roster and promotes only after a separate vacancy: %j',flags=>{
 setup();
 const t=roster(69),controlled=t.farm.slice(0,69);
 act(()=>gs.setTeams([{...t,players:controlled.slice(0,28),farm:[...controlled.slice(28),{id:'dev',salary:240,...flags}]}]));
 const activeIds=gs.myTeam.players.map(p=>p.id),convert=gs.convertIkusei;
 act(()=>{convert('dev');convert('dev');});
 expect(gs.myTeam.players.map(p=>p.id)).toEqual(activeIds);
 expect(gs.myTeam.farm.find(p=>p.id==='dev')).toMatchObject({育成:false,isIkusei:false,salary:420});
 expect(gs.myTeam.budget).toBe(9820);
 act(()=>gs.promote('dev'));expect(gs.myTeam.players.map(p=>p.id)).toEqual(activeIds);
 const saved=JSON.parse(JSON.stringify(gs.myTeam));
 act(()=>gs.setTeams([{...saved,players:saved.players.slice(1),farm:[...saved.farm,saved.players[0]]}]));
 act(()=>gs.promote('dev'));
 expect(gs.myTeam.players).toHaveLength(28);expect(gs.myTeam.players.some(p=>p.id==='dev')).toBe(true);
 expect(gs.myTeam.farm.some(p=>p.id==='dev')).toBe(false);expect(gs.myTeam.budget).toBe(9820);
});
it('rechecks the latest roster and accepted draft reservations even through a stale conversion callback',()=>{
 setup(68);const old=gs.convertIkusei;
 act(()=>gs.setTeams([roster(70)]));act(()=>old('dev'));
 expect(gs.myTeam.farm.find(p=>p.id==='dev').isIkusei).toBe(true);expect(gs.myTeam.budget).toBe(10000);
 act(()=>{gs.setTeams([roster(69)]);gs.setOffseasonPlan({year:2026,draftPool:[{id:0,_drafted:true,_r1winner:0}]});});act(()=>gs.convertIkusei('dev'));
 expect(gs.myTeam.farm.find(p=>p.id==='dev').isIkusei).toBe(true);
});
it('rechecks scouting acquisitions against reserved and newly occupied slots',()=>{
 setup(69,{year:2026,draftPool:[{id:0,_drafted:true,_r1winner:0}]});act(()=>gs.signPlayer(0));
 expect(gs.myTeam.scoutResults).toHaveLength(1);expect(gs.myTeam.budget).toBe(10000);
 act(()=>gs.setOffseasonPlan(null));const sign=gs.signPlayer;act(()=>{sign(0);sign(0);});
 expect(gs.myTeam.farm.filter(p=>p.id==='scout')).toHaveLength(1);expect(gs.myTeam.budget).toBe(9500);
});
it('binds a repeated scouting action to its intended player rather than the next row at that index',()=>{
 setup(68);act(()=>gs.setTeams([{...roster(68),scoutResults:[{id:'A',name:'候補A',salary:500},{id:'B',name:'候補B',salary:600}]}]));
 const sign=gs.signPlayer;act(()=>{sign(0);sign(0);});
 expect(gs.myTeam.farm.filter(p=>['A','B'].includes(p.id)).map(p=>p.id)).toEqual(['A']);expect(gs.myTeam.budget).toBe(9500);expect(gs.myTeam.scoutResults.map(p=>p.id)).toEqual(['B']);
 act(()=>gs.signPlayer(0));expect(gs.myTeam.farm.filter(p=>['A','B'].includes(p.id)).map(p=>p.id)).toEqual(['A','B']);expect(gs.myTeam.budget).toBe(8900);
});
it.each([{育成:true},{isIkusei:true}])('allows the last real conversion slot despite an accepted development rookie: %j',flags=>{
 setup(69,{year:2026,draftPool:[{id:'dev-pick',_drafted:true,_r1winner:0,...flags}]});
 const convert=gs.convertIkusei;act(()=>{convert('dev');convert('dev');});
 expect(gs.myTeam.farm.find(p=>p.id==='dev')).toMatchObject({育成:false,isIkusei:false,salary:420});
 expect(gs.myTeam.budget).toBe(9820);
});
