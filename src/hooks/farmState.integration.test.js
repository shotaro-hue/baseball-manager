import React from 'react';import {create,act} from 'react-test-renderer';
import {it,expect} from 'vitest';
import {gameStateReducer,G} from './gameStateReducer';import {useGameState} from './useGameState';
import {teams} from '../engine/__tests__/farmFixtures';import {createFarmCompetition} from '../engine/farmRecords';
import {prepareFarmProgress,finishFarmProgress} from '../engine/farmProgression';
const initial=()=>{const ts=teams().map(t=>({...t,wins:0,losses:0,draws:0}));return {teams:ts,myId:0,saveId:'atomic',year:2026,gameDay:1,farmCompetitionVersion:1,farmCompetition:createFarmCompetition({teams:ts,saveId:'atomic',year:2026})};};
it('adopts teams, round and farm records in one reducer action',()=>{
 const s=initial(),p=prepareFarmProgress(s,s.teams,1),next={...s,gameDay:2,farmCompetition:p.competition,teams:finishFarmProgress(s.teams,p,1).map(t=>({...t,wins:1}))};
 const result=gameStateReducer(s,{type:G.APPLY_PROGRESS,candidate:next});expect(result.gameDay).toBe(2);expect(result.farmCompetition.nextRound).toBe(2);expect(result.teams).toEqual(next.teams);expect(s.gameDay).toBe(1);
});
it('rejects a candidate after a roster edit or loaded identity change, leaving the current ledger untouched',()=>{
 let gs;function Harness(){gs=useGameState();return null;}let view;act(()=>{view=create(React.createElement(Harness));});
 const s=initial();act(()=>{gs.applyProgressCandidate(s);});const token=gs.getProgressToken();
 act(()=>{gs.setTeams(s.teams.map(t=>({...t,name:'edited'})));});
 act(()=>{expect(gs.applyProgressCandidate({...s,gameDay:2},{baseToken:token})).toBe(false);});expect(gs.gameDay).toBe(1);expect(gs.farmCompetition.nextRound).toBe(1);
 const oldToken=gs.getProgressToken();act(()=>{gs.setSaveId('loaded-other');});
 act(()=>{expect(gs.applyProgressCandidate(s,{baseToken:oldToken})).toBe(false);});expect(gs.saveId).toBe('loaded-other');act(()=>view.unmount());
});
it('changes load-session epoch on same-ID loads, but keeps it stable during ordinary candidate adoption',()=>{
 let gs;function Harness(){gs=useGameState();return null;}let view;act(()=>{view=create(React.createElement(Harness));});
 const s=initial();act(()=>gs.applyProgressCandidate(s));const session=gs.getProgressSessionToken();
 act(()=>gs.applyProgressCandidate(s));expect(gs.getProgressSessionToken()).toBe(session);
 act(()=>gs.setSaveId(s.saveId));expect(gs.getProgressSessionToken()).toBe(session+1);act(()=>view.unmount());
});
