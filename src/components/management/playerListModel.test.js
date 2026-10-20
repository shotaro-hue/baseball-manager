import { expect, it } from 'vitest';
import { contractEntries, filterPlayerEntries, rosterEntries } from './playerListModel';

const player = (id, extra = {}) => ({ id, name: `選手${id}`, pos: '捕手', age: 25, salary: 1000, contractYearsLeft: 1, ...extra });
const team = { id: 0, players: [player(0), player(1), player(2, { contractSignedYear: 2026 })], farm: [player(3), player(4, { 育成: true })] };

it('uses mutually exclusive actionable/waiting/signed/continuing states, ignoring other teams and years', () => {
  const mailbox = [
    { type: 'contract_decision_pending', decision: { playerId: 1, teamId: 0, offeredYear: 2026 } },
    { type: 'contract_decision_pending', decision: { playerId: 3, teamId: 0, offeredYear: 2025 } },
    { type: 'contract_decision_pending', decision: { playerId: 4, teamId: 9, offeredYear: 2026 } },
  ];
  const entries = contractEntries(team, mailbox, 2026);
  expect(entries.map(e => e.state)).toEqual(['actionable', 'waiting', 'signed', 'actionable', 'actionable']);
  expect(entries.filter(e => e.state === 'actionable')).toHaveLength(3);
  expect(rosterEntries(team).map(e => e.group)).toEqual(['active', 'active', 'active', 'farm', 'ikusei']);
});

it('searches normalized text, filters farm/ikusei separately, and sorts recorded amounts before missing/invalid values', () => {
  const entries = rosterEntries({ players: [player(0, { name: 'ＡＢＣ', salary: null }), player(1, { salary: 2000 }), player(2, { salary: '5' }), player(3, { salary: 0 })], farm: [player(4), player(5, { isIkusei: true })] });
  expect(filterPlayerEntries(entries, { search: 'abc' }).map(e => e.player.id)).toEqual([0]);
  expect(filterPlayerEntries(entries, { group: 'farm', position: '捕手' }).map(e => e.player.id)).toEqual([4]);
  expect(filterPlayerEntries(entries, { sort: 'salary-desc' }).map(e => e.player.id)).toEqual([1, 4, 5, 3, 0, 2]);
  expect(filterPlayerEntries(entries, { sort: 'salary-asc' }).map(e => e.player.id)).toEqual([3, 4, 5, 1, 0, 2]);
});

it('legacy dated mail uses its offered year when the explicit year is absent', () => {
  const mailbox = [
    { type: 'contract_decision_pending', dateLabel: '2025年 2日目', decision: { playerId: 0, teamId: 0 } },
    { type: 'contract_decision_pending', dateLabel: '2026年 2日目', decision: { playerId: 1, teamId: 0 } },
  ];
  expect(contractEntries(team, mailbox, 2026).slice(0, 2).map(e => e.state)).toEqual(['actionable', 'waiting']);
});
