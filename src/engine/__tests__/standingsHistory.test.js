import { expect, it } from 'vitest';
import { rankLeague, standingsContext } from '../standings';

const teams = [{ id: 0, league: 'パ', wins: 1, losses: 1, draws: 0 },
  { id: 1, league: 'パ', wins: 1, losses: 1, draws: 0 },
  { id: 6, league: 'セ', wins: 1, losses: 1, draws: 0 }];
const history = { standingsHistory: [
  { year: 2024, pacific: [{ id: 0 }, { id: 1 }] },
  { year: 2025, pacific: [{ id: 1 }, { id: 0 }] },
] };
const records = { 0: { 1: { oppId: 1, myScore: 1, oppScore: 0 }, 2: { oppId: 6, myScore: 0, oppScore: 1 } },
  1: { 1: { oppId: 0, myScore: 0, oppScore: 1 }, 2: { oppId: 6, myScore: 1, oppScore: 0 } } };

it('uses the complete Pacific head-to-head ahead of last year and leaves all inputs untouched', () => {
  const before = structuredClone({ teams, history, records });
  const result = rankLeague(teams, 'パ', standingsContext(history, records, 2026));
  expect(result.teams.map(t => t.id)).toEqual([0, 1]);
  expect(result.warnings).toEqual([]);
  expect({ teams, history, records }).toEqual(before);
});

it.each([undefined, {}, { 0: records[0] }, { ...records, 1: { 1: records[1][1] } }])(
  'keeps the latest previous-year fallback for absent or incomplete old histories: %j', records => {
    const result = rankLeague(teams, 'パ', standingsContext(history, records, 2026));
    expect(result.teams.map(t => t.id)).toEqual([1, 0]);
    expect(result.warnings.join()).toContain('成績が不足');
  });

it('keeps the warned ID fallback when neither complete records nor last-year standings exist', () => {
  const result = rankLeague([...teams].reverse(), 'パ', standingsContext({}, {}, 2026));
  expect(result.teams.map(t => t.id)).toEqual([0, 1]);
  expect(result.warnings.join()).toContain('前年順位が未記録');
});
