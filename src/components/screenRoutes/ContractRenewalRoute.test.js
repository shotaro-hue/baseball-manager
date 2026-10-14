import React from 'react';
import { act, create } from 'react-test-renderer';
import { it, expect, vi } from 'vitest';
import ContractRenewalRoute from './ContractRenewalRoute';

it('connects standalone session and selection to the existing offseason plan fields', () => {
  const session = { baseline: 1000, others: [], entries: [] };
  const gs = { screen: 'contract_renewal_phase', offseasonPlan: { version: 1, year: 2026, myId: 0, session, renewalView: { selectedId: 0, filter: 'pending' } }, setOffseasonPlan: vi.fn() };
  let props, view; function Screen(value) { props = value; return null; }
  act(() => { view = create(React.createElement(ContractRenewalRoute, { gs, os: {}, myId: 0, year: 2026, ScreenComponent: Screen })); });
  expect(props.savedSession).toEqual(session); expect(props.savedView).toEqual(gs.offseasonPlan.renewalView);
  act(() => props.onViewChange({ selectedId: 1, filter: 'all' }));
  expect(gs.setOffseasonPlan.mock.calls[0][0](gs.offseasonPlan)).toMatchObject({ renewalView: { selectedId: 1, filter: 'all' }, session });
  act(() => props.onSessionChange({ ...session, baseline: 2000 }));
  expect(gs.setOffseasonPlan.mock.calls[1][0](gs.offseasonPlan)).toMatchObject({ session: { ...session, baseline: 2000 } });
  act(() => view.unmount());
});

it('moves a free-contract player to market with the right reason and removes roster references', () => {
  const player = { id: 0, name: '選手0', age: 25 };
  const team = { players: [player], lineup: [0, 1], rotation: [0] };
  const gs = { screen: 'contract_renewal_phase', teams: [team], upd: vi.fn(), setFaPool: vi.fn(), addToHistory: vi.fn(), addNews: vi.fn(), notify: vi.fn() };
  let screenProps; let view;
  function Screen(props) { screenProps = props; return null; }
  act(() => { view = create(React.createElement(ContractRenewalRoute, { gs, os: {}, myTeam: team, myId: 0, year: 2026, ScreenComponent: Screen })); });
  screenProps.onRelease(0, 'salary_cut');
  expect(gs.upd.mock.calls[0][1](team)).toMatchObject({ players: [], lineup: [1], rotation: [] });
  expect(gs.setFaPool.mock.calls[0][0]([])[0]).toMatchObject({ id: 0, contractYearsLeft: 0, departureReason: 'salary_cut' });
  expect(gs.addToHistory).toHaveBeenCalledWith(0, player, '自由契約（減額制限超過）');
  expect(gs.addNews.mock.calls[0][0].body).toContain('FA権の行使ではありません');
  act(() => view.unmount());
});
