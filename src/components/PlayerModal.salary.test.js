import React from 'react';
import { act, create } from 'react-test-renderer';
import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { FinanceTab } from './tabs/FinanceTab';
import { PlayerModal } from './PlayerModal';
const fixture = JSON.parse(gunzipSync(readFileSync(new URL('../../e2e/fixtures/new-game.json.gz', import.meta.url))));
const text = node => typeof node === 'string' ? node : (node.children || []).map(text).join('');
it.each([[null,'未記録'],[undefined,'未記録'],[-1,'不正値'],['100','不正値'],[0,'0万円']])('opens salary leader with %s safely and preserves the original player', (salary, label) => {
  const p = Object.freeze({ ...fixture.teams[0].farm.find(p => !p.isPitcher), id: 0, salary, name: '年俸確認選手' });
  const team = { id: 0, name: '球団', players: [], farm: [p], coaches: [], wins: 0, losses: 0, budget: 1000 };
  const before = JSON.stringify(team); let view, selected;
  act(() => { view = create(React.createElement(FinanceTab, { team, onPlayerClick: player => {
    selected = player;
    view.update(React.createElement(PlayerModal, { player, teamName: team.name, initialSection: 'profile', onClose: () => {} }));
  } })); });
  act(() => view.root.findAllByType('button').find(n => text(n) === p.name).props.onClick());
  expect(selected).toBe(p); expect(text(view.root)).toContain(`年俸${label}`);
  expect(JSON.stringify(team)).toBe(before);
  act(() => view.unmount());
});
