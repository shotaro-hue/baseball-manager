import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, expect, it } from 'vitest';
import HubTabsNav from './HubTabsNav';
import HubManagementTab from './HubManagementTab';
import { PRIMARY_SECTIONS } from './hubNavigation';

let view;
afterEach(() => { if (view) act(() => view.unmount()); });
const text = n => typeof n === 'string' ? n : (n?.children || []).map(text).join('');
it.each([{}, { scoutResults: [], scoutMissions: [] }, { scoutResults: [{ id: 'old' }] }, { scoutMissions: [{ id: 'pending' }] }])(
  'only exposes a read-only record link when saved records exist: %j', records => {
    const team = { id: 0, players: [], farm: [], ...records };
    const exists = (team.scoutResults?.length || team.scoutMissions?.length) > 0;
    act(() => { view = create(React.createElement(React.Fragment, null,
      React.createElement(HubTabsNav, { activeSection: PRIMARY_SECTIONS[4], tab: 'reinforcement', myTeam: team, tabBadges: { scout: { n: 1, label: '要対応' } } }),
      React.createElement(HubManagementTab, { team, recruitment: true })));
    });
    const links = view.root.findAllByType('button').filter(n => /スカウト/.test(text(n)));
    expect(links.map(text)).toEqual(exists ? ['旧スカウト記録', '旧スカウト記録'] : []);
    expect(text(view.root)).not.toContain('要対応');
  });

it('renders the legacy route directly without records and returns to recruitment', async () => {
  const { default: HubContentRouter } = await import('./HubContentRouter');
  const team = { id: 0, players: [], farm: [] }, destinations = [];
  const gs = { myTeam: team, teams: [team], myId: 0, year: 2026, gameDay: 1, schedule: [],
    getMailboxBySelector: () => [], getNewsBySelector: () => [], getUnreadMailboxCount: () => 0, getLatestNewsId: () => null };
  act(() => { view = create(React.createElement(HubContentRouter, {
    tab: 'scout', app: { gs, sf: {}, os: {} }, onTabChange: tab => destinations.push(tab),
  })); });
  expect(text(view.root)).toContain('旧スカウト記録はありません');
  act(() => view.root.findAllByType('button').find(n => text(n) === '補強トップへ').props.onClick());
  expect(destinations).toEqual(['reinforcement']);
});
