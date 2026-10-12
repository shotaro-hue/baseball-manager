import React from 'react';
import {act,create} from 'react-test-renderer';
import {describe,it,expect,vi} from 'vitest';
import {LeaderboardTab} from './tabs/LeaderboardTab';
import {emptyStats} from '../engine/playerCore';

const text=n=>typeof n==='string'?n:(n?.children||[]).map(text).join('');
const player=(id,stats={},extra={})=>({id,name:`選手${id}`,stats:{...emptyStats(),PA:10,AB:10,IP:5,BF:15,...stats},...extra});
const team=(id,players=[],farm=[],league='セ')=>({id,name:`球団${id}`,short:`球団${id}`,league,players,farm});
function render(teams,props={}) {let v;act(()=>{v=create(React.createElement(LeaderboardTab,{teams,myId:0,year:2026,...props}));});return v;}
const rows=v=>v.root.findAllByProps({className:'interactive-player-row'});
const click=(v,label)=>act(()=>v.root.findAllByType('button').find(n=>text(n)===label||n.props['aria-label']===label).props.onClick());

describe('league ranking record scope and operations',()=>{
  it('preserves original raw innings ordering without changing displayed innings precision',()=>{
    const v=render([team(0,[player('lower',{IP:5+1/3},{isPitcher:true}),player('higher',{IP:5+1/3+1e-12},{isPitcher:true})])]);
    click(v,'投手');click(v,'投球回で並び替え');
    expect(text(rows(v)[0])).toContain('選手higher');
    expect(rows(v).map(r=>text(r.findByProps({'data-metric':'IP'})))).toEqual(['5.1','5.1']);
    v.unmount();
  });
  it('labels current first-team year, minimum appearances and current club while retaining demoted records',()=>{
    const p=player('farm',{}, {stats2:{HR:99}}), v=render([team(0,[],[p])]);
    expect(text(v.toJSON())).toContain('一軍・2026年');
    expect(text(v.toJSON())).toContain('最低打席10');
    expect(text(rows(v)[0])).toContain('二軍所属');
    expect(text(v.toJSON())).toContain('球団は現在所属');
    v.unmount();
  });
  it('keeps incomplete OPS unrecorded and out of the leading-player summary, with missing last in both directions',()=>{
    const v=render([team(0,[player('missing',{}, {stats:{PA:10}}),player('zero')])]);
    expect(text(rows(v)[0])).toContain('選手zero');
    expect(text(rows(v)[1])).toContain('— 未記録');
    const summaries=v.root.findAllByProps({'aria-label':'並び順の先頭3選手'});
    expect(text(summaries[0])).not.toContain('選手missing');
    click(v,'OPSで並び替え'); expect(text(rows(v)[1])).toContain('選手missing');
    v.unmount();
  });
  it('keeps zero denominators distinct and ranks negative WAR without fabricating values',()=>{
    const v=render([team(0,[player('denom',{AB:0}),player('negative'),player('missing',{}, {stats:{PA:10}})])]);
    expect(text(rows(v).find(n=>text(n).includes('選手denom')))).toContain('— 算出不可');
    click(v,'WARで並び替え');
    expect(text(rows(v)[0])).toContain('選手negative');
    expect(text(rows(v).at(-1))).toContain('選手missing');
    expect(text(v.toJSON())).not.toContain('NaN');
    v.unmount();
  });
  it('retains original minimum and progressive qualification conditions and makes count-sort exemption explicit',()=>{
    const v=render([team(0,[player('below',{PA:9}),player('minimum'),player('qualified',{PA:27})])],{gameDay:10});
    expect(rows(v)).toHaveLength(2);
    act(()=>v.root.findByProps({'aria-label':'規定達成のみ'}).props.onChange({target:{checked:true}}));
    expect(rows(v)).toHaveLength(1); expect(text(rows(v)[0])).toContain('選手qualified');
    click(v,'本塁打で並び替え'); expect(rows(v)).toHaveLength(2);
    expect(text(v.toJSON())).toContain('計数指標では規定条件を適用しません');
    v.unmount();
  });
  it('filters leagues, preserves sort when switching detail columns, opens and compares without mutations',()=>{
    const p=player('other',{HR:3}), teams=[team(0,[player('mine')]),team(1,[],[p],'パ')], before=JSON.stringify(teams), open=vi.fn(),compare=vi.fn();
    const v=render(teams,{onPlayerClick:open,onToggleCompare:compare});
    click(v,'パリーグ'); click(v,'本塁打で並び替え'); click(v,'詳細指標');click(v,'主要指標');
    expect(rows(v)).toHaveLength(1);
    act(()=>rows(v)[0].props.onClick()); expect(open.mock.calls[0][0].id).toBe(p.id);expect(open.mock.calls[0].slice(1)).toEqual(['球団1','battedBall']);
    act(()=>v.root.findByProps({'aria-label':'選手otherを比較へ追加'}).props.onClick({stopPropagation(){}}));
    expect(compare.mock.calls[0][0].id).toBe(p.id);
    expect(JSON.stringify(teams)).toBe(before);v.unmount();
  });
  it('shows an empty-state reason and reset action when minimum eligibility has no matches',()=>{
    const v=render([team(0,[player('below',{PA:9})])]);
    expect(text(v.toJSON())).toContain('この条件に該当する選手はいません');
    expect(v.root.findAllByType('button').some(n=>text(n)==='条件を戻す')).toBe(true);
    v.unmount();
  });
});
