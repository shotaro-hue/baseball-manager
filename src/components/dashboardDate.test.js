import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { DashboardTab } from './DashboardTab';

describe('dashboard current-game identity', () => {
  const team = { id: 0, name: 'MY', league: 'C', players: [], farm: [], wins: 0, losses: 0 };
  const teams = [team, { ...team, id: 1, name: 'CURRENT' }, { ...team, id: 2, name: 'TOMORROW' }];
  const day = (date, opponent) => ({ date, matchups: [{ homeId: 0, awayId: opponent }] });
  const schedule = { 1: day({ month: 3, day: 27 }, 1), 2: day({ month: 3, day: 28 }, 2), 143: day({ month: 9, day: 13 }, 1) };
  const render = gameDay => renderToStaticMarkup(React.createElement(DashboardTab, { myTeam: team, teams, schedule, gameDay, recentResults: [], faPool: [], onTabSwitch: () => {} }));
  it('shows the opening day, opponent and game number without adding a day', () => {
    const html = render(1);
    expect(html).toContain('3/27 Game 1');
    expect(html).toContain('CURRENT');
    expect(html).not.toContain('TOMORROW');
  });
  it('moves to the next scheduled game after progression', () => {
    const html = render(2);
    expect(html).toContain('3/28 Game 2');
    expect(html).toContain('TOMORROW');
  });
  it('retains the final scheduled game', () => expect(render(143)).toContain('9/13 Game 143'));
  it('does not invent a fixture after the season', () => expect(render(144)).toContain('No scheduled game'));
});
