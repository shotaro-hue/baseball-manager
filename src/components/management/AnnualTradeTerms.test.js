import React from 'react';
import { create } from 'react-test-renderer';
import { expect, it } from 'vitest';
import { AnnualTradeTerms } from './AnnualTradeTerms';

it('identifies an earlier paying club when a player moves more than once in a season', () => {
  const mine = { id: 0, name: '自球団' }, target = { id: 1, name: '相手球団' }, prior = { id: 2, name: '元球団' };
  const view = create(React.createElement(AnnualTradeTerms, { mine, target, preview: { ok: true,
    teams: [mine, target, prior], outgoing: [], incoming: [{ id: 'a', name: '移籍選手' }], contracts: [], rows: [],
    costs: [{ playerId: 'a', season: 2026, teamId: 2, amountManYen: 1000 }, { playerId: 'a', season: 2026, teamId: 1, amountManYen: 2000 }, { playerId: 'a', season: 2026, teamId: 0, amountManYen: 3000 }] } }));
  const cells = view.root.findAllByType('td').map(td => td.children.join(''));
  expect(cells).toEqual(['元球団', '1,000万円', '相手球団', '2,000万円', '自球団', '3,000万円']);
  view.unmount();
});
