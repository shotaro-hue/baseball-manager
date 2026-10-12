import React from 'react';
import {create,act} from 'react-test-renderer';
import {it,expect,vi,afterEach} from 'vitest';
import {FarmRankings} from './FarmRankings';
import {FarmRecordSummary,FarmPlayerHistory} from './FarmRecordSummary';
import {StatsTab} from './tabs/StatsTab';
import {record} from '../engine/__tests__/farmRankingFixtures';
const views=[];
afterEach(()=>views.splice(0).forEach(v=>act(()=>v.unmount())));
const text=n=>n==null?'':typeof n==='object'?(Array.isArray(n)?n:n.children||[]).map(text).join(''):String(n);
const mount=(C,props)=>{let v;act(()=>v=create(React.createElement(C,props)));views.push(v);return v;};
const change=(v,label,value)=>act(()=>v.root.findByProps({'aria-label':label}).props.onChange({target:{value}}));
const state=()=>({year:2027,farmCompetition:{...record(),year:2027,nextRound:11},seasonHistory:{farmArchives:[record()]},teams:[{id:8,name:'現在球団',farm:[{id:0,name:'現在名',isPitcher:false,batting:{power:66},stats2:{HR:99}}]}]});
const clickName=(v,name)=>act(()=>v.root.findAllByType('button').find(b=>text(b)===name).props.onClick({currentTarget:null}));
it('provides opt-in DES-01 ranking and accessible kind tabs while preserving farm qualification for count metrics',()=>{
 const v=mount(FarmRankings,{state:state()});
 expect(v.root.findByProps({'aria-label':'二軍ランキング'}).props['data-ds']).toBe('farm-rankings');
 expect(v.root.findAllByProps({role:'tab'})).toHaveLength(2);
 const panel=v.root.findByProps({role:'tabpanel'});expect(panel.props['aria-labelledby']).toBe(v.root.findAllByProps({role:'tab'}).find(t=>t.props['aria-selected']).props.id);
 change(v,'二軍順位指標','HR');
 act(()=>v.root.findByProps({'aria-label':'規定到達者のみ'}).props.onChange({target:{checked:true}}));
 const table=v.root.findByProps({'aria-label':'二軍選手ランキング。横にスクロールできます'});
 expect(text(table)).not.toContain('規定未達');expect(text(table)).toContain('退団打者');
});
it('keeps exact selected ranking values, ties, measured zero and unavailable denominators distinct',()=>{
 const s=state(),before=JSON.stringify(s),v=mount(FarmRankings,{state:s});
 const table=()=>v.root.findByProps({'aria-label':'二軍選手ランキング。横にスクロールできます'});
 expect(text(table().findAllByType('tr').at(-1))).toContain('— 算出不可');
 change(v,'二軍順位指標','HR');
 const rows=table().findAllByType('tr').slice(1);expect(text(rows[0].findAllByType('td')[0])).toBe('1');expect(text(rows[1].findAllByType('td')[0])).toBe('1');
 expect(text(rows.at(-1))).toContain('0');expect(JSON.stringify(s)).toBe(before);
});
it('opens saved annual record first and sends the actual current player and current team to existing detail',()=>{
 const s=state(),open=vi.fn(),v=mount(FarmRankings,{state:s,onPlayerClick:open});
 change(v,'二軍年度','2026');clickName(v,'退団打者');
 const detail=v.root.findByProps({'aria-label':'二軍記録詳細'});
 expect(text(detail)).toContain('2026年');expect(text(detail)).toContain('両リーグ');
 act(()=>detail.findByProps({'aria-label':'現在の選手詳細を開く'}).props.onClick());
 expect(open).toHaveBeenCalledWith(s.teams[0].farm[0],'現在球団','stats');
 expect(text(detail)).toContain('西A');expect(open.mock.calls[0][0]).toBe(s.teams[0].farm[0]);
});
it('keeps departed players read-only and lets selected record change year without generating abilities',()=>{
 const open=vi.fn(),v=mount(FarmRankings,{state:state(),onPlayerClick:open});clickName(v,'同率打者');
 expect(v.root.findAllByProps({'aria-label':'現在の選手詳細を開く'})).toHaveLength(0);
 expect(text(v.root.findByProps({'aria-label':'二軍記録詳細'}))).toContain('読取専用');
 change(v,'選手二軍年度','2026');expect(text(v.root.findByProps({'aria-label':'二軍記録詳細'}))).toContain('2026年');expect(open).not.toHaveBeenCalled();
});
it('renders full saved stint statistics separately from all-club totals including outs-based innings',()=>{
 const v=mount(FarmRecordSummary,{state:state(),player:{id:4},year:2026,detail:true});
 const table=v.root.findByProps({'aria-label':'二軍球団別内訳。横にスクロールできます'});
 expect(text(table)).toContain('自責点');expect(text(table)).toContain('5.0');
 expect(text(table.findAllByProps({'data-metric':'ER'})[0])).toBe('0');
});
it('forwards current-player opening through StatsTab farm entry and keeps record years controlled',()=>{
 const open=vi.fn(),s=state(),v=mount(StatsTab,{teams:[{id:0,name:'球団',players:[],farm:[]}],myId:0,farmState:s,onPlayerClick:open});
 act(()=>v.root.findAllByType('button').find(b=>text(b)==='二軍').props.onClick());
 expect(v.root.findByType(FarmRankings).props.onPlayerClick).toBe(open);
 const history=mount(FarmPlayerHistory,{state:s,player:{id:0},initialYear:2026});
 expect(history.root.findByProps({'aria-label':'選手二軍年度'}).props.value).toBe(2026);
});
