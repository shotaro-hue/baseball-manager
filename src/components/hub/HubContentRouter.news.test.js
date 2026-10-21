import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, expect, it } from 'vitest';
import HubContentRouter from './HubContentRouter';

const transfers = [
  { id: 'old', year: 2025, day: 12, headline: '昨季の移籍', playersIn: ['選手A'], playersOut: ['選手B'], cash: 0 },
  { id: 'now', year: 2026, day: 4, headline: '今季の移籍', playersIn: ['選手C'], playersOut: [], cash: 500 },
];
let view;
afterEach(() => { if (view) act(() => view.unmount()); view = null; });
function render(history) {
  const team = { id: 0, players: [], farm: [], coaches: [] };
  const gs = { myTeam: team, myId: 0, teams: [team], year: 2026, gameDay: 1, faPool: [],
    seasonHistory: { transfers: [] }, getSeasonHistory: () => history,
    getMailboxBySelector: () => [], getNewsBySelector: () => [], getUnreadMailboxCount: () => 0, getLatestNewsId: () => null };
  act(() => { view = create(React.createElement(HubContentRouter, { tab: 'news', app: { gs, sf: {}, os: {} } })); });
}
const text = () => JSON.stringify(view.toJSON());
it('renders saved transfers from the current selector and filters by year', () => {
  render({ transfers });
  expect(text()).toContain('昨季の移籍'); expect(text()).toContain('今季の移籍');
  expect(text()).toContain('選手A'); expect(text()).toContain('選手C');
  const filter = view.root.findByType('select');
  act(() => filter.props.onChange({ target: { value: '2025' } }));
  expect(text()).toContain('昨季の移籍'); expect(text()).not.toContain('今季の移籍');
  act(() => filter.props.onChange({ target: { value: '2026' } }));
  expect(text()).toContain('今季の移籍'); expect(text()).not.toContain('昨季の移籍');
  act(() => filter.props.onChange({ target: { value: 'all' } }));
  expect(text()).toContain('昨季の移籍'); expect(text()).toContain('今季の移籍');
});
it('shows an empty state when no transfers have been saved', () => {
  render({}); expect(text()).toContain('この年度の移籍ログはまだありません');
  expect(view.root.findAllByType('option')).toHaveLength(1);
});
