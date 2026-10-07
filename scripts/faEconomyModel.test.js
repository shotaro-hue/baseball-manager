import { it, expect } from 'vitest';
import { nextEconomyYear, collectEconomyDemands, createEconomyMarketEntries, economyPriceMismatches } from './faEconomyModel';
import { emptyStats } from '../src/engine/playerCore';
import { prepareOffseasonFreeAgent } from '../src/engine/offseasonMarket';
const p = (id, extra = {}) => ({ id, name: `選手${id}`, age: 25, pos: '外野手', salary: 1000,
  contractYearsLeft: 3, condition: 80, serviceYears: 2, daysOnActiveRoster: 10,
  stats: emptyStats(), playoffStats: emptyStats(), ...extra });
const team = (players = [], farm = []) => ({ id: 0, name: '旧球団', budget: 100000,
  wins: 70, losses: 73, players, farm, lineup: players.map(p => p.id), rotation: [], revenueThisSeason: 2000 });

it('uses the same contract-year rules for active and farm, and preserves unknown contract years', () => {
  const active = [p(1), p(2, { contractSignedYear: 2026 }), p(3, { contractYearsLeft: undefined })];
  const farm = [p(4), p(5, { contractSignedYear: 2026 }), p(6, { 育成: true, ikuseiYears: 2 })];
  const advanced = nextEconomyYear([team(active, farm)], 2026)[0];
  expect(advanced.players.map(p => p.contractYearsLeft)).toEqual([2, 3, undefined]);
  expect(advanced.farm.map(p => p.contractYearsLeft)).toEqual([2, 3, 2]);
  expect(advanced.farm[2]).toMatchObject({ ikuseiYears: 3, serviceYears: 2, daysOnActiveRoster: 10 });
  expect(advanced.budget).toBeGreaterThanOrEqual(0);
});

it('archives actual farm first-team stats without creating a season for an unplayed farm player', () => {
  const played = p(0, { stats: { ...emptyStats(), PA: 10, HR: 0 } });
  const next = nextEconomyYear([team([], [played, p(1)])], 2026)[0];
  expect(next.farm[0].recentCareerLog[0]).toMatchObject({ year: 2026, teamId: 0, stats: { PA: 10, HR: 0 } });
  expect(next.farm[1].recentCareerLog).toBeUndefined();
});

it('keeps a winter transfer season with its old club without adding a new-club zero row', () => {
  const departed = { ...p(0, { stats: { ...emptyStats(), PA: 50 } }), faEnteredYear: 2026,
    faOriginTeamId: 0, faOriginTeamName: '旧球団', faOriginRoster: 'farm' };
  const prepared = { ...prepareOffseasonFreeAgent(departed, 2026, 1), contractSignedYear: 2026 };
  const destination = { ...team([], [prepared]), id: 1, name: '新球団' };
  const next = nextEconomyYear([destination], 2026)[0].farm[0];
  expect(next.recentCareerLog).toHaveLength(1);
  expect(next.recentCareerLog[0]).toMatchObject({ teamId: 0, stats: { PA: 50 } });
});

it('includes farm and ikusei expiry in salary rows, but never labels ikusei FA-qualified', () => {
  const t = team([p(1, { contractYearsLeft: 1 })], [p(0, { contractYearsLeft: 1 }),
    p(2, { contractYearsLeft: 1, 育成: true, salary: 300, daysOnActiveRoster: 840 }), p(3)]);
  const rows = collectEconomyDemands([t], { year: 2026 });
  expect(rows.map(r => r.id)).toEqual([1, 0, 2]);
  expect(rows[1].roster).toBe('farm');
  expect(rows[2]).toMatchObject({ roster: 'farm', ikusei: true, qualified: false, decision: null });
  const entries = createEconomyMarketEntries([{ ...t.farm[0], salary: rows[1].demand, marketEntryReason: '国内FA宣言' }], [t], 2026);
  expect(entries[0]).toMatchObject({ faOriginTeamId: 0, faOriginRoster: 'farm', faEnteredYear: 2026 });
  expect(economyPriceMismatches(entries, rows)).toEqual([]);
  expect(() => createEconomyMarketEntries([p(99)], [t], 2026)).toThrow('旧所属');
});

it('distinguishes missing assessment rows from real market price mismatches', () => {
  const entries = [{ id: 0, salary: 1000, marketEntryReason: '国内FA宣言' }, { id: 1, salary: 2000, marketEntryReason: '国内FA宣言' }, { id: 2, salary: 300, marketEntryReason: '自由契約' }];
  const mismatch = economyPriceMismatches(entries, [{ id: 0, demand: 1500, previous: 900 }]);
  expect(mismatch).toHaveLength(2);
  expect(mismatch[0]).toMatchObject({ id: 0, reason: '市場価格と共有要求額の不一致', sharedDemand: 1500 });
  expect(mismatch[1]).toMatchObject({ id: 1, reason: '査定対象の欠落' });
});
