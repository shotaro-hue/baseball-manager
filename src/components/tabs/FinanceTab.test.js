import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it } from 'vitest';
import { FinanceTab } from './FinanceTab';
const p = (id, salary, extra={}) => ({id,name:`選手${id}`,salary,pos:'外野',contractYearsLeft:1,...extra});
const team = () => ({id:0,wins:0,losses:0,budget:500000,coaches:[],players:[p('low',100),p('high',500)],farm:[p('farm',900),p('dev',300,{育成:true})]});
const text = node => typeof node==='string'?node:Array.isArray(node)?node.map(text).join(' '):node?text(node.children):'';
function freeze(value) { if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value; }
function render(t) {let view;act(()=>{view=create(React.createElement(FinanceTab,{team:t}));});return view;}
describe('FinanceTab payroll',()=>{
  it('includes farm and development annual contracts with matching breakdown and rank',()=>{
    const view=render(team());const out=text(view.toJSON());
    expect(out).toContain('選手契約年俸（年額）');expect(out).toContain('一軍支配下');expect(out).toContain('二軍支配下');expect(out).toContain('育成');expect(out).toContain('1,800万円');
    expect(out).toContain('選手farm');expect(out.indexOf('選手farm')).toBeLessThan(out.indexOf('選手high'));
    act(()=>view.unmount());
  });
  it('renders deep-frozen data without changing the roster',()=>{
    const t=freeze(team());const before=JSON.stringify(t);let view;
    expect(()=>{view=render(t);}).not.toThrow();expect(JSON.stringify(t)).toBe(before);act(()=>view?.unmount());
  });
  it('keeps mutable team unchanged through rendering and re-rendering',()=>{
    const t=team(),before=structuredClone(t);const view=render(t);
    act(()=>view.update(React.createElement(FinanceTab,{team:t})));
    expect(t).toEqual(before);act(()=>view.unmount());
  });
  it('shows recorded zero separately from missing and invalid annual salaries',()=>{
    const t=team();t.players=[p('zero',0),p('missing',undefined),p('invalid',-1)];t.farm=[];
    const view=render(t),out=text(view.toJSON());
    expect(out).toContain('0万円');expect(out).toContain('未記録');expect(out).toContain('不正値');expect(out).toContain('確認済み分');act(()=>view.unmount());
  });
});
it('derives updated payroll after the same team reference changes',()=>{
  const t=team(),view=render(t);expect(text(view.toJSON())).toContain('1,800万円');
  t.players[0]={...t.players[0],salary:200};
  act(()=>view.update(React.createElement(FinanceTab,{team:t})));
  expect(text(view.toJSON())).toContain('1,900万円');act(()=>view.unmount());
});
