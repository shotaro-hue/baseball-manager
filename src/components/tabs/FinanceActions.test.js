import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';
import { FinanceTab } from './FinanceTab';
import { startClubFinance } from '../../engine/clubFinance';
let view;
afterEach(()=>{if(view)act(()=>view.unmount());view=null;});
const text=n=>typeof n==='string'?n:(n.children||[]).map(text).join('');
function setup(extra={}){
  const team=startClubFinance({id:0,name:'球団',budget:500000,wins:0,losses:0,players:[],farm:[],coaches:[],...extra},2026);
  const props={team,onTicketPriceChange:vi.fn(),onStadiumUpgrade:vi.fn()};
  act(()=>{view=create(React.createElement(FinanceTab,props));});
  return {props,change:value=>act(()=>view.root.findByType('input').props.onChange({target:{value}})),
    button:label=>view.root.findAllByType('button').find(b=>text(b)===label),
    update:team=>act(()=>view.update(React.createElement(FinanceTab,{...props,team}))) };
}
it('keeps price draft through blur and cancel and calls the existing handler only on explicit confirmation',()=>{
  const h=setup();
  // Club 0 defaults to 3,300 yen: verify a real price change, not a disabled no-op.
  const current = Number(view.root.findByType('input').props.value);
  const proposed = current === 3300 ? 3400 : 3300;
  h.change(String(proposed));
  expect(h.button('価格変更を確認').props.disabled).toBe(false);
  const input=view.root.findByType('input');
  act(()=>input.props.onBlur?.());expect(h.props.onTicketPriceChange).not.toHaveBeenCalled();
  act(()=>h.button('価格変更を確認').props.onClick());expect(text(view.root)).toContain('価格変更の確認');
  act(()=>h.button('価格の確認を閉じる').props.onClick());expect(view.root.findByType('input').props.value).toBe('3300');
  act(()=>h.button('価格変更を確認').props.onClick());const commit=h.button('この価格で確定').props.onClick;
  act(()=>{commit();commit();});expect(h.props.onTicketPriceChange).toHaveBeenCalledTimes(1);expect(h.props.onTicketPriceChange).toHaveBeenCalledWith(proposed);
});
it.each([
  ['自動価格', {}],
  ['手動設定価格', { customAvgTicketPrice: 2800 }],
])('does not submit an unchanged numeric %s even when formatted differently', (_name, extra) => {
  const h = setup(extra), initial = view.root.findByType('input').props.value;
  h.change(`0${initial}`);
  expect(view.root.findByType('input').props.value).toBe(`0${initial}`);
  expect(h.button('価格変更を確認').props.disabled).toBe(true);
  expect(h.button('この価格で確定')).toBeUndefined();
  expect(h.button('下書きを取り消す')).toBeTruthy();
  expect(text(view.root)).not.toContain('未確定');
  expect(h.props.onTicketPriceChange).not.toHaveBeenCalled();
});
it('disables and guards an open confirmation when the current price catches up with the draft', () => {
  const h = setup();
  h.change('3500');
  act(() => h.button('価格変更を確認').props.onClick());
  h.update({ ...h.props.team, customAvgTicketPrice: 3500 });
  const commit = h.button('この価格で確定');
  expect(commit.props.disabled).toBe(true);
  act(() => commit.props.onClick());
  expect(h.props.onTicketPriceChange).not.toHaveBeenCalled();
});
it.each(['','499','5001','2.5'])('blocks invalid draft %s without calling the handler',value=>{
  const h=setup();h.change(value);expect(text(view.root)).toContain('500〜5,000円の整数');
  expect(h.button('価格変更を確認').props.disabled).toBe(true);expect(h.props.onTicketPriceChange).not.toHaveBeenCalled();
});
it('does not lose an unsaved price when unrelated demand changes and rechecks latest investment budget',()=>{
  const h=setup();h.change('3500');
  act(()=>h.button('投資内容を確認').props.onClick());
  h.update({...h.props.team,budget:0,popularity:90});
  expect(view.root.findByType('input').props.value).toBe('3500');
  expect(h.button('この内容で投資を確定').props.disabled).toBe(true);
  expect(h.props.onStadiumUpgrade).not.toHaveBeenCalled();
});
it('cancels investment without state change and prevents double submission',()=>{
  const h=setup();act(()=>h.button('投資内容を確認').props.onClick());
  act(()=>h.button('投資の確認を閉じる').props.onClick());expect(h.props.onStadiumUpgrade).not.toHaveBeenCalled();
  act(()=>h.button('投資内容を確認').props.onClick());const commit=h.button('この内容で投資を確定').props.onClick;
  act(()=>{commit();commit();});expect(h.props.onStadiumUpgrade).toHaveBeenCalledTimes(1);
});
it('keeps legacy investment guidance distinct from the new +3.5 percent baseline',()=>{
  const team={id:0,name:'旧球団',budget:650000,wins:0,losses:0,popularity:50,stadiumLevel:0,players:[],farm:[]};
  act(()=>{view=create(React.createElement(FinanceTab,{team}));});
  expect(text(view.root)).not.toContain('改修1段階につき+3.5%');
  expect(text(view.root)).toContain('旧モデルの球場倍率');
});
