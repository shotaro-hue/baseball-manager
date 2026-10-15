import React from 'react';
import {act,create} from 'react-test-renderer';
import {expect,it,vi} from 'vitest';
import {useDraftEvaluation} from './useDraftEvaluation';
import {scoutDraftCandidate} from '../engine/draftReports';
const pool=Array.from({length:15},(_,id)=>({id,pos:'捕手',age:22,potential:75,batting:{contact:50}}));
it('commits one scouting charge even when the same handler runs twice before rendering',()=>{
  let result;const changed=vi.fn();
  function Host(){result=useDraftEvaluation({teams:[{id:0}],pool,myId:0,year:2026,started:true,onEvaluationChange:changed});return null;}
  let v;act(()=>{v=create(React.createElement(Host));});
  const id=pool.find(p=>!result.session.scouted.includes(p.id)).id;
  act(()=>{result.update(s=>scoutDraftCandidate(s,pool,id));result.update(s=>scoutDraftCandidate(s,pool,id));});
  expect(result.session.points).toBe(4);
  expect(changed.mock.lastCall[0].points).toBe(4);
  act(()=>v.unmount());
});
it('does not add new automatic reports or refill points in an old later-round save',()=>{
  let result;function Host(){result=useDraftEvaluation({teams:[{id:0}],pool,myId:0,year:2026,started:true,savedState:{scouted:[0],scoutPt:0}});return null;}
  let v;act(()=>{v=create(React.createElement(Host));});
  expect(result.session.points).toBe(0);expect(result.session.scouted).toEqual([0]);
  act(()=>v.unmount());
});
it('rejects a supplied session from another year even when its allocation is locked',()=>{
  let result;function Host(props){result=useDraftEvaluation({teams:[{id:0}],pool,myId:0,started:true,...props});return null;}
  let v;act(()=>{v=create(React.createElement(Host,{year:2026}));});
  const old=result.session;
  act(()=>v.update(React.createElement(Host,{year:2027,evaluation:old})));
  expect(result.session.year).toBe(2027);
  act(()=>v.unmount());
});
