import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, it, expect, vi } from 'vitest';
import { ContractRenewalPhaseScreen } from './Screens';
import { calcPlayerDemand } from '../engine/contract';
import { emptyStats } from '../engine/playerCore';

const text = n => typeof n === 'string' ? n : (n.children || []).map(text).join('');
const p = { id: 0, name: '若手打者', age: 23, pos: '外野', salary: 600, contractYearsLeft: 1, personality: { money: 50 }, stats: { ...emptyStats(), PA: 550, AB: 480, H: 180, D: 35, T: 3, HR: 25, BB: 60, HBP: 5, SF: 5 } };
const t = { id: 0, league: 'セ', name: '球団', city: '東京', wins: 80, losses: 60, players: [p], lineup: [0] };
function setup() {
  const onSign = vi.fn(); const demand = calcPlayerDemand(p); let view;
  act(() => { view = create(React.createElement(ContractRenewalPhaseScreen, { teams: [t], myId: 0, year: 2026, demands: { 0: demand }, onSign, onNext: vi.fn(), onRelease: vi.fn() })); });
  const row = view.root.findAllByType('button').find(n => n.props['aria-label'] === `${p.name}の契約更改`);
  act(() => row.props.onClick());
  return { view, onSign, demand };
}
const send = view => act(() => view.root.findAllByType('button').find(n => text(n) === 'オファーを出す').props.onClick());

describe('salary demand in renewal screen', () => {
  it('loads player ID 0 demand, exposes reasons, and signs at the requested salary', () => {
    const { view, onSign, demand } = setup();
    expect(Number(view.root.findByType('input').props.value)).toBe(demand.demandSalary);
    expect(text(view.root)).toContain('要求年俸の理由');
    expect(text(view.root)).toContain('野手の出場量・今季成績');
    send(view);
    expect(onSign).toHaveBeenCalledWith(0, demand.demandSalary, 1, expect.any(Number), expect.any(Number));
    act(() => view.unmount());
  });
  it('does not sign a manually entered offer below the floor', () => {
    const { view, onSign } = setup();
    act(() => view.root.findByType('input').props.onChange({ target: { value: '100' } }));
    send(view);
    expect(onSign).not.toHaveBeenCalled();
    expect(text(view.root)).toContain('提示下限または契約年数');
    act(() => view.unmount());
  });
});
