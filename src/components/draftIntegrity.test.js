import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';
import { DraftLotteryScreen, DraftScreen } from './Draft';
vi.mock('../engine/trade', () => ({ analyzeTeamNeeds: () => [] }));
vi.mock('./ui', () => ({ OV: () => null, HandBadge: () => null }));
const candidate = id => ({ id, name: `候補${id}`, pos: '捕手', age: 22, potential: 100, salary: 500,
  batting: { contact: 60, power: 60, eye: 60, speed: 60 } });
const team = (id, count = 0) => ({ id, name: `球団${id}`, wins: id, emoji: '⚾', color: '#2465ac',
  players: [], farm: Array.from({ length: count }, (_, i) => ({ id: `owned-${id}-${i}` })) });
const text = n => typeof n === 'string' ? n : (n.children || []).map(text).join('');
const views=[];
function mount(C, props) { let v; act(() => { v=create(React.createElement(C,{ myId:0,year:2026,...props })); }); views.push(v); return v; }
function click(v,label) { act(()=>v.root.findAllByType('button').find(b=>text(b).includes(label)).props.onClick()); }
function tick(ms=1000) { act(()=>vi.advanceTimersByTime(ms)); }
afterEach(()=>{ views.splice(0).forEach(v=>act(()=>v.unmount()));vi.useRealTimers();vi.restoreAllMocks(); });
it('full-auto first round skips clubs at 70 and permits a club with 69',()=>{
  const done=vi.fn(); const v=mount(DraftLotteryScreen,{teams:[team(0,70),team(1,69)],pool:[candidate(0),candidate(1)],onDone:done});
  click(v,'全ドラフト自動'); expect(done).toHaveBeenCalledTimes(1);
  expect(Object.keys(done.mock.lastCall[0])).toEqual(['1']);
});
it('full-auto first round resolves equal nominations by lottery instead of awarding the first club',()=>{
  vi.spyOn(Math,'random').mockReturnValue(.9);
  const done=vi.fn(); const v=mount(DraftLotteryScreen,{teams:[team(0),team(1)],pool:[candidate(0)],onDone:done});
  click(v,'全ドラフト自動'); expect(done.mock.lastCall[0][1]?.id).toBe(0); expect(done.mock.lastCall[0][0]).toBeUndefined();
});
it('manual first round lets a full user club skip and CPU clubs continue',()=>{
  vi.useFakeTimers(); const changed=vi.fn(); const v=mount(DraftLotteryScreen,{teams:[team(0,70),team(1)],pool:[candidate(0)],onDone:vi.fn(),onStateChange:changed});
  click(v,'発表を見る'); tick(2000); expect(changed.mock.lastCall[0].phase).toBe('done'); expect(changed.mock.lastCall[0].confirmedPicks).toEqual({1:0});
});
it('later automatic user picks retain the same refusal rule as explicit picks',()=>{
  vi.useFakeTimers();vi.spyOn(Math,'random').mockReturnValue(0);const changed=vi.fn();
  mount(DraftScreen,{teams:[team(0)],pool:[candidate(0)],autoSkip:true,onDraftDone:vi.fn(),onStateChange:changed});tick(30);
  expect(changed.mock.lastCall[0].drafted).toEqual({0:'refused'});expect(changed.mock.lastCall[0].log[0].refused).toBe(true);
});
for(const auto of [false,true]) it(`later rounds skip full user and CPU clubs without acquiring players (auto ${auto})`,()=>{
  vi.useFakeTimers();const changed=vi.fn();mount(DraftScreen,{teams:[team(0,70),team(1,70)],pool:[candidate(0)],autoSkip:auto,onDraftDone:vi.fn(),onStateChange:changed});
  for(let i=0;i<14;i++)tick(400);
  expect(changed.mock.lastCall[0].done).toBe(true);expect(changed.mock.lastCall[0].drafted).toEqual({});
});
it('finishes a resumed manual user turn when first-round nominations exhausted the pool',()=>{
 const changed=vi.fn();mount(DraftScreen,{teams:[team(0)],pool:[{...candidate(0),_drafted:true,_r1winner:0}],onDraftDone:vi.fn(),onStateChange:changed});
 expect(changed.mock.lastCall[0].done).toBe(true);
});
it('finishes manually when the CPU takes the last candidate immediately before the user turn',()=>{
 vi.useFakeTimers();const changed=vi.fn();mount(DraftScreen,{teams:[team(0),team(1)],pool:[candidate(0)],savedState:{pickIdx:1},onDraftDone:vi.fn(),onStateChange:changed});tick(350);
 expect(changed.mock.lastCall[0].done).toBe(true);expect(changed.mock.lastCall[0].drafted).toEqual({0:1});
});
