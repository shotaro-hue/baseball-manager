import React from "react";
import { create, act } from "react-test-renderer";
import { it, expect } from "vitest";
import { FarmRankings } from "./FarmRankings";
import { FarmPlayerHistory } from "./FarmRecordSummary";
import { record } from "../engine/__tests__/farmRankingFixtures";
import { StatsTab } from "./tabs/StatsTab";
import { calcMeasuredFarmAwards } from "../engine/farmRankings";
const state = () => ({ year: 2027, teams: [], farmCompetition: { ...record(), year: 2027, nextRound: 5, startRound: 4, legacy: { entries: [{playerId:0,stats:{PA:100},year:null}] } }, seasonHistory: { farmArchives: [record()] } });
const flatten = n => n==null?'':typeof n==='object'?(Array.isArray(n)?n:n.children||[]).map(flatten).join(''):String(n);
const text = v => flatten(v.toJSON());
const freeze = value => { if(value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
it.each(['current','archive'])('displays measured annual winners over old pending awards from %s without mutating saved data', location => {
 const measured=record(), pending={status:'pending',reason:'旧未確定',eastern:{hr:null},western:{hr:null}};
 const s=freeze({year:location==='current'?2026:2027,teams:[],
  ...(location==='current'?{farmCompetition:measured}:{}),
  seasonHistory:{farmArchives:location==='archive'?[measured]:[],awards:[{year:2026,titles:{central:{hr:{name:'一軍受賞者'}}},farmAwards:pending}]}});
 const before=JSON.stringify(s);let v;
 act(()=>v=create(React.createElement(FarmRankings,{state:s})));
 // 10/31 and 20/62 are exactly tied, so both batting winners must remain visible.
 expect(v.root.findAllByType('dd').map(n=>n.children.join(''))).toEqual(['退団打者（東A／東B）／同率打者（東B）','退団打者（東A／東B）／同率打者（東B）','短回投手（東A）／同率投手（東B）']);
 act(()=>v.root.findByProps({'aria-label':'二軍リーグ'}).props.onChange({target:{value:'パ'}}));
 expect(v.root.findAllByType('dd').map(n=>n.children.join(''))).toEqual(['退団打者（西A）','退団打者（西A）','該当なし']);
 act(()=>v.unmount());expect(JSON.stringify(s)).toBe(before);expect(pending.status).toBe('pending');
});
it.each([{startRound:4,nextRound:144},{startRound:1,nextRound:143}])('does not award an incomplete measured year over old pending: %j', progress => {
 const s=freeze({year:2026,farmCompetition:{...record(),...progress},seasonHistory:{awards:[{year:2026,farmAwards:{status:'pending',reason:'旧未確定'}}]}});
 const before=JSON.stringify(s);let v;act(()=>v=create(React.createElement(FarmRankings,{state:s})));
 expect(v.root.findAllByType('dd')).toHaveLength(0);act(()=>v.unmount());expect(JSON.stringify(s)).toBe(before);
});
it.each(['complete','legacy'])('preserves saved %s awards even when measured winners differ', format => {
 const awards=calcMeasuredFarmAwards(record(),2026);awards.eastern.hr={name:'保存済み受賞者',teamName:'保存球団'};
 if(format==='legacy')delete awards.status;
 const s=freeze({year:2026,farmCompetition:record(),seasonHistory:{awards:[{year:2026,farmAwards:awards}]}});
 const before=JSON.stringify(s);let v;act(()=>v=create(React.createElement(FarmRankings,{state:s})));
 if(format==='complete')expect(v.root.findAllByType('dd')[1].children.join('')).toBe('保存済み受賞者（保存球団）');
 else expect(v.root.findAllByType('dd')).toHaveLength(0);
 act(()=>v.unmount());expect(JSON.stringify(s)).toBe(before);
});
it('does not turn legacy estimates and pending awards into measured annual winners',()=>{
 const s=freeze({year:2026,teams:[{farm:[{id:0,stats2:{PA:600,AB:500,H:400,HR:90}}]}],seasonHistory:{awards:[{year:2026,farmAwards:{status:'pending'}}]}});
 const before=JSON.stringify(s);let v;act(()=>v=create(React.createElement(FarmRankings,{state:s})));
 expect(text(v)).toContain('未記録');expect(v.root.findAllByType('dd')).toHaveLength(0);
 act(()=>v.unmount());expect(JSON.stringify(s)).toBe(before);
});
it('shows stored shortage causes, including opponent shortage for a selected club, and does not invent historical reasons',()=>{
 const s=state();s.farmCompetition.cards=[{league:'セ',homeId:0,awayId:1,status:'unplayed',reasons:[{teamId:0,code:'insufficient-catcher',available:0,required:1}]}];
 let v;act(()=>v=create(React.createElement(FarmRankings,{state:s})));
 act(()=>v.root.findByProps({'aria-label':'二軍球団'}).props.onChange({target:{value:'1'}}));
 expect(text(v)).toContain('東A：捕手不足（0/1）・1カード');
 act(()=>v.root.findByProps({'aria-label':'二軍年度'}).props.onChange({target:{value:'2026'}}));
 expect(text(v)).toContain('過年度の未実施理由は未記録');expect(text(v)).not.toContain('捕手不足（0/1）');act(()=>v.unmount());
});
it("switches year, league and club, and opens read-only retired record detail without invented player abilities", () => {
  let v;
  act(() => v = create(/* @__PURE__ */ React.createElement(FarmRankings, { state: state() })));
  expect(text(v)).toContain("途中記録");
  act(() => v.root.findByProps({ "aria-label": "二軍年度" }).props.onChange({ target: { value: "2026" } }));
  expect(text(v)).toContain("年間表彰");
  expect(text(v)).toContain("規定打席31");
  const ranking=v.root.findByProps({'aria-label':'二軍選手ランキング。横にスクロールできます'});
  expect(ranking.findAllByType('th').slice(0,3).map(th=>th.children.join(''))).toEqual(['順位','選手','打率']);
  act(() => v.root.findAllByType("button").find((b) => b.children.includes("退団打者")).props.onClick());
  const detail = v.root.findByProps({ "aria-label": "二軍記録詳細" });
  expect(detail.findAllByType("h3")[0].children.join("")).toContain("退団打者");
  expect(text(v)).toContain("球団間合計");
  expect(text(v)).not.toContain("契約年数");
  act(() => v.root.findByProps({ "aria-label": "二軍リーグ" }).props.onChange({ target: { value: "パ" } }));
  expect(text(v)).toContain("西A");
  expect(v.root.findAllByProps({ "aria-label": "二軍記録詳細" })).toHaveLength(0);
  act(() => v.root.findByProps({ "aria-label": "二軍球団" }).props.onChange({ target: { value: "6" } }));
  expect(text(v)).toContain("西A");
  act(() => v.unmount());
});
it("renders no measured records separately from zero and offers measured player years in the existing stats screen", () => {
  let v;
  act(() => v = create(/* @__PURE__ */ React.createElement(FarmRankings, { state: { year: 2026 } })));
  expect(text(v)).toContain("未記録");
  act(() => v.unmount());
  act(() => v = create(/* @__PURE__ */ React.createElement(FarmPlayerHistory, { state: state(), player: { id: 0, name: "退団打者", isPitcher: false } })));
  act(() => v.root.findByProps({ "aria-label": "選手二軍年度" }).props.onChange({ target: { value: "2026" } }));
  expect(text(v)).toContain("二軍実測");
  expect(text(v)).toContain("安打");
  expect(text(v)).toContain("球団別内訳");
  expect(text(v)).toContain("東A");
  expect(text(v)).toContain("西A");
  expect(text(v)).toContain("旧推定");
  act(() => v.unmount());
  act(() => v = create(/* @__PURE__ */ React.createElement(StatsTab, { teams: [{ id: 0, players: [], name: "球団" }], myId: 0, farmState: state() })));
  const entry = v.root.findAllByType("button").find((b) => b.children.includes("二軍"));
  expect(entry).toBeDefined();
  act(() => entry.props.onClick());
  expect(v.root.findAllByType(FarmRankings)).toHaveLength(1);
  act(() => v.unmount());
});
