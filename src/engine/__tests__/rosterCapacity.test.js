import { afterEach, expect, it, vi } from 'vitest';
import * as capacity from '../rosterCapacity';
import { remainingDraftSlots } from '../draftRules';
const club = (n=0) => ({id:0, players:[], farm:Array.from({length:n},(_,i)=>({id:`p${i}`}))});
const freeze = x => { if(x && typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);} return x; };
afterEach(()=>vi.restoreAllMocks());
it('counts both development flags independently of availability without mutations or random draws',()=>{
 const t=freeze({id:0,players:[{id:0},{id:'inj',injuryDaysLeft:20}],farm:[{id:'dev',isIkusei:true},{id:'reg',registrationCooldownDays:10,isForeign:true},{id:'dev2',育成:true}]});
 const random=vi.spyOn(Math,'random').mockImplementation(()=>{throw Error('random draw');});
 expect(capacity.controlledRosterCounts(t)).toEqual({controlledCount:3,developmentCount:2});
 expect(capacity.evaluateRosterCapacity(t)).toMatchObject({ok:true,remainingSlots:67,acceptedPickCount:0});
 expect(capacity.projectRosterCapacity(t,{releaseIds:['inj','dev','inj'],draftRemaining:2})).toMatchObject({remainingSlots:67,releaseControlledCount:1,projectedControlledCount:4});
 expect(random).not.toHaveBeenCalled();
});
it('reserves candidate ID zero once, releases refusal, and does not double count an acquired rookie',()=>{
 const t=club(69),p={id:0,_drafted:true,_r1winner:0};
 expect(capacity.evaluateRosterCapacity(t,{draftPool:[p,p]})).toMatchObject({ok:true,remainingSlots:0,acceptedPickIds:[0]});
 expect(capacity.evaluateRosterCapacity({...t,farm:[...t.farm,p]},{draftPool:[p]})).toMatchObject({controlledCount:70,remainingSlots:0,acceptedPickCount:0});
 expect(capacity.evaluateRosterCapacity(t,{draftPool:[p],drafted:{0:'refused'}})).toMatchObject({remainingSlots:1,acceptedPickCount:0});
 // Existing simple wrapper must use validated reservations, too.
 expect(remainingDraftSlots(t,[p],{0:'refused'})).toBe(1);
});
it('keeps a valid later duplicate after a conflicting record and excludes other owners',()=>{
 const t=club(), pool=[{id:'a',_drafted:true,_r1winner:1},{id:'a',pos:'捕手'},{id:'b'},{id:'c'}];
 const r=capacity.evaluateRosterCapacity(t,{draftPool:pool,drafted:{a:0,b:1,c:'refused'}});
 expect(r).toMatchObject({ok:true,acceptedPickIds:['a'],remainingSlots:69});
 expect(r.ignoredPickIds).toEqual(expect.arrayContaining([{id:'a',reason:'conflicting-owner'},{id:'b',reason:'other-team'},{id:'c',reason:'refused'}]));
});
it('reserves partial lottery wins and ignores stale lottery owners conflicting with canonical assignments',()=>{
 const t=club(69),pool=[{id:0}];
 expect(capacity.evaluateRosterCapacity(t,{draftPool:pool,confirmedPicks:{0:0}})).toMatchObject({acceptedPickIds:[0],remainingSlots:0});
 expect(capacity.evaluateRosterCapacity(t,{draftPool:pool,confirmedPicks:{0:0},drafted:{0:1}})).toMatchObject({acceptedPickCount:0,remainingSlots:1});
});
it.each([
 [{...club(),players:[{id:null}]}],
 [{...club(),players:[{id:0}],farm:[{id:0}]}],
 [{...club(),players:[{id:0}],farm:[{id:'0'}]}],
])('rejects missing, duplicate and assignment-key-colliding owned IDs',t=>{
 expect(capacity.evaluateRosterCapacity(t)).toMatchObject({ok:false,reason:'invalid-owned-ids'});
});
it('rejects cross-club duplicate ownership and candidate key collisions',()=>{
 const t={...club(),players:[{id:0}]};
 expect(capacity.evaluateRosterCapacity(t,{teams:[t,{id:1,players:[{id:0}]}]}).ok).toBe(false);
 expect(capacity.evaluateRosterCapacity(club(),{draftPool:[{id:0},{id:'0'}]})).toMatchObject({ok:false,reason:'invalid-draft-ids'});
});
it('projects only unique controlled releases and development conversions, never imaginary slots',()=>{
 const t={...club(69),farm:[...club(69).farm,{id:'d',isIkusei:true}]};
 expect(capacity.projectRosterCapacity(t,{releaseIds:['p0','p0','unknown'],conversionIds:['d','d','p1'],faRemaining:2})).toMatchObject({remainingSlots:1,releaseControlledCount:1,projectedControlledCount:71,projectedRemainingSlots:0,projectedOverBy:1});
 expect(capacity.projectRosterCapacity(t,{releaseIds:['d'],conversionIds:['d']})).toMatchObject({projectedControlledCount:69});
 for(const intent of [{faRemaining:-1},{draftRemaining:1.5},{faRemaining:NaN}]) expect(capacity.projectRosterCapacity(t,intent)).toEqual({ok:false,reason:'invalid-plan'});
});
it('reads only the current year saved canonical draft state without regenerating or changing it',()=>{
 const plan=freeze({year:2026,draftPool:[{id:'old'}],draftResult:{pool:[{id:0}],drafted:{0:0}},draftViews:{draft:{drafted:{old:0}},lottery:{confirmedPicks:{0:0}}}});
 expect(capacity.draftCapacityContext(plan,2026,[])).toEqual({teams:[],draftPool:[{id:0}],drafted:{0:0},confirmedPicks:{0:0}});
 expect(capacity.draftCapacityContext(plan,2027,[])).toEqual({teams:[],draftPool:[],drafted:{},confirmedPicks:{}});
});

import { marketRosterError, marketPlacement } from '../marketRoster';
import { addMarketSigning, validateMarketContract } from '../../components/hub/faMarket';
import { registrationPreview, promotionReasons } from '../../components/farmDevelopmentDisplay';
import { applyDraftAcquisitions } from '../draftRules';
it('uses both development flags for market eligibility and placement at the controlled cap',()=>{
 const t={...club(70),budget:10000}, dev={id:'dev',isIkusei:true,salary:240};
 expect(marketRosterError(t,dev)).toBeNull();expect(marketPlacement(t,dev).farm).toBe(true);
 expect(addMarketSigning(t,dev,240,1,2026).farm).toHaveLength(71);
 expect(marketRosterError(t,{id:'new'})).toContain('70');
});
it('blocks FA and registration when the last free slot is reserved by an accepted rookie',()=>{
 const t={...club(69),budget:10000},p={id:'new',salary:500},draftContext={draftPool:[{id:0}],drafted:{0:0}};
 expect(marketRosterError(t,p,[t],draftContext)).toContain('70');
 expect(validateMarketContract({team:t,pool:[p],player:p,salary:500,years:1,gameDay:1,teams:[t],draftContext})).toContain('70');
 expect(addMarketSigning(t,p,500,1,2026,'season',draftContext)).toBe(t);
 const dev={id:'dev',isIkusei:true,salary:240},withDev={...t,farm:[...t.farm,dev]};
 expect(registrationPreview(withDev,dev,draftContext).reasons).toContain('支配下上限に到達');
 expect(promotionReasons(withDev,dev)).toContain('先に支配下登録が必要');
});
it('rejects draft application with invalid ownership and treats refused first-round picks as unaccepted',()=>{
 const t=club(69),p={id:0,_drafted:true,_r1winner:0};
 expect(applyDraftAcquisitions([t],[p],{0:'refused'},2026)).toMatchObject({ok:true});
 expect(applyDraftAcquisitions([{...t,players:[t.farm[0]]}],[p],{},2026).ok).toBe(false);
});
import { IDBFactory } from 'fake-indexeddb';
import { saveGame, loadGame } from '../saveload';
it('preserves old draft state, ownership and career history through real save/load without saving derived counts',async()=>{
 const rows=new Map();vi.stubGlobal('indexedDB',new IDBFactory());vi.stubGlobal('localStorage',{getItem:k=>rows.get(k)??null,setItem:(k,v)=>rows.set(k,String(v)),removeItem:k=>rows.delete(k)});
 try{
 const t={...club(69),history:[{id:'past',exitYear:2025}],farm:[...club(69).farm,{id:'dev',isIkusei:true,recentCareerLog:[{year:2025,teamId:1,stats:{H:0}}]}]};
 const state={teams:[t],myId:0,year:2026,gameDay:144,saveId:'capacity',offseasonPlan:{version:1,year:2026,myId:0,stage:'results',resumeScreen:'draft',draftPool:[{id:0}],draftViews:{draft:{pickIdx:4,drafted:{0:0},done:false}}}};
 const before=capacity.evaluateRosterCapacity(t,capacity.draftCapacityContext(state.offseasonPlan,2026,state.teams));
 expect((await saveGame(state)).ok).toBe(true);const loaded=await loadGame();
 expect(capacity.evaluateRosterCapacity(loaded.teams[0],capacity.draftCapacityContext(loaded.offseasonPlan,2026,loaded.teams))).toEqual(before);
 expect(loaded.teams[0].farm.map(p=>p.id)).toEqual(t.farm.map(p=>p.id));expect(loaded.teams[0].history).toEqual(t.history);
 expect(loaded.teams[0].farm.at(-1).recentCareerLog).toEqual(t.farm.at(-1).recentCareerLog);
 expect(loaded.offseasonPlan).toEqual(state.offseasonPlan);expect(loaded.teams[0]).not.toHaveProperty('capacity');
 expect(capacity.evaluateRosterCapacity(loaded.teams[0],capacity.draftCapacityContext(loaded.offseasonPlan,2027,loaded.teams)).remainingSlots).toBe(1);
 }finally{vi.unstubAllGlobals();}
});
it('rejects incoming FA assignment-key collisions before ownership, money or history changes',()=>{
 const t={...club(),players:[{id:0}],budget:10000,history:[{id:'past'}]},p={id:'0',salary:500};
 const before=JSON.stringify(t);expect(marketRosterError(t,p)).not.toBeNull();expect(addMarketSigning(t,p,500,1,2026)).toBe(t);
 expect(JSON.stringify(t)).toBe(before);
});
it('uses current ownership when a market state updater receives an older league snapshot',()=>{
 const p={id:'owned',salary:500},t={...club(),players:[p],budget:10000,history:[]},stale={...t,players:[]};
 expect(marketRosterError(t,p,[stale])).not.toBeNull();
 expect(addMarketSigning(t,p,500,1,2026,'season',{teams:[stale]})).toBe(t);
 expect(t.budget).toBe(10000);expect(t.players).toEqual([p]);expect(t.history).toEqual([]);
});
