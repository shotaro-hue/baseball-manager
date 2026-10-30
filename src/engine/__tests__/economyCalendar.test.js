import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { TEAM_DEFS } from '../../constants';
import { economyClockFor, validateEconomyClock } from '../economyCalendar';
import { registrationDateAllowed } from '../contractCalendar';
import { generateSeasonSchedule } from '../scheduleGen';
import { contractEconomyMode, reduceEconomyCommand } from '../contractEconomy';
import { simulateSeasonBatch } from '../../workers/seasonBatchCore';
import { gameStateReducer, G } from '../../hooks/gameStateReducer';
import { economyFixture, renewalEnvelope, freezeEconomy } from './fixtures/economyWorld';

const schedule = generateSeasonSchedule(2026, TEAM_DEFS);
const seasonClock = (gameDay, dates = schedule) => economyClockFor({ season: 2026, phase: 'season', gameDay, schedule: dates });
const atRound = gameDay => {
  const world = economyFixture();
  world.schedule = schedule; world.gameDay = gameDay;
  world.contractEconomy.clock = seasonClock(gameDay);
  world.contractEconomy.cycle.stage = 'playing';
  return world;
};
const adopt = (before, world) => gameStateReducer(before, { type: G.APPLY_ECONOMY_WORLD, world,
  expected: { saveId: before.saveId, epoch: before.contractEconomy.epoch, baseRevision: before.contractEconomy.revision } });
const nextRevision = (before, world) => ({ ...world, contractEconomy: { ...world.contractEconomy, revision: before.contractEconomy.revision + 1 } });

describe('regular-season calendar boundary', () => {
  it('uses the actual 143rd official date and never treats appended All-Star rows as round 144/145', () => {
    expect(schedule[143].gameNo).toBe(143);
    expect(schedule[143].date.month).toBeGreaterThan(7);
    expect(seasonClock(143).date).toBe(`2026-${String(schedule[143].date.month).padStart(2, '0')}-${String(schedule[143].date.day).padStart(2, '0')}`);
    for (const gameDay of [144, 145]) {
      expect(schedule[gameDay]).toMatchObject({ gameNo: null, isAllStar: true, date: { month: 7 } });
      expect(() => seasonClock(gameDay)).toThrow();
    }
  });

  it.each([
    ['All-Star inside the official range', s => { s[1] = { ...s[1], isAllStar: true }; }],
    ['different game number', s => { s[1] = { ...s[1], gameNo: 2 }; }],
    ['unknown date', s => { delete s[1].date; }],
  ])('rejects %s without a round-based date fallback', (_, edit) => {
    const dates = structuredClone(schedule); edit(dates);
    expect(() => seasonClock(1, dates)).toThrow();
  });

  it('reaches gameDay 144 through the real final-game batch and closes annual contracts until a dated transition exists', () => {
    const snapshot = JSON.parse(gunzipSync(readFileSync(new URL('../../../e2e/fixtures/new-game.json.gz', import.meta.url))));
    snapshot.teams = snapshot.teams.map(t => ({ ...t, wins: 142, losses: 0, draws: 0 }));
    Object.assign(snapshot, { gameDay: 143, year: 2026, schedule, allStarDone: true, faPool: [] });
    const result = simulateSeasonBatch({ snapshot, count: 1 });
    expect(result.nextState.gameDay).toBe(144); expect(result.shouldEnterPlayoff).toBe(true);
    const world = atRound(143);
    world.gameDay = result.nextState.gameDay;
    world.contractEconomy.clock.date = `2026-07-${String(schedule[144].date.day).padStart(2, '0')}`;
    world.contractEconomy.cycle.stage = 'postseason';
    const loaded = freezeEconomy(JSON.parse(JSON.stringify(world)));
    expect(() => contractEconomyMode(loaded)).toThrow();
    const rejected = reduceEconomyCommand(loaded, renewalEnvelope(loaded));
    expect(rejected.ok).toBe(false); expect(rejected.world).toBe(loaded);
  }, 30000);

  it('keeps the July 31 / August 1 registration boundary after JSON reload', () => {
    for (const [month, day, expected] of [[7, 31, true], [8, 1, false]]) {
      const world = economyFixture(); world.schedule = [null, { gameNo: 1, date: { month, day } }];
      world.contractEconomy.clock = seasonClock(1, world.schedule);
      for (const input of [world, JSON.parse(JSON.stringify(world))]) {
        expect(validateEconomyClock(input)).toBe(true);
        expect(registrationDateAllowed(2026, input.contractEconomy.clock.date)).toBe(expected);
      }
    }
  });
});

describe('atomic economy clock transitions', () => {
  it('rejects a correctly revisioned candidate that goes back to an earlier valid schedule date', () => {
    const before = freezeEconomy(atRound(143)), earlier = nextRevision(before, atRound(1));
    expect(contractEconomyMode(earlier)).toBe('annual'); // Each snapshot is valid in isolation.
    for (const input of [before, freezeEconomy(JSON.parse(JSON.stringify(before)))]) {
      const snapshot = structuredClone(input);
      expect(adopt(input, earlier)).toBe(input); expect(input).toEqual(snapshot);
    }
  });

  it('allows forward dates and the explicit offseason boundary, but rejects reverse phases or offseason turns', () => {
    const before = freezeEconomy(atRound(142)), last = nextRevision(before, atRound(143));
    const finished = adopt(before, last);
    expect(finished.gameDay).toBe(143); expect(finished.contractEconomy.revision).toBe(1);
    const offseason = structuredClone(finished);
    offseason.gameDay = 144;
    offseason.contractEconomy.clock = economyClockFor({ season: 2026, phase: 'offseason', offseasonTurn: 3 });
    offseason.contractEconomy.cycle.stage = 'offseason-open';
    offseason.contractEconomy.engine.spending.budgetSeason = 2027;
    const winter = adopt(finished, nextRevision(finished, offseason));
    expect(winter.contractEconomy.clock).toEqual({ season: 2026, phase: 'offseason', date: '2026-12-01', offseasonTurn: 3 });
    const loaded = freezeEconomy(JSON.parse(JSON.stringify(winter)));
    expect(validateEconomyClock(loaded)).toBe(true);
    expect(adopt(loaded, nextRevision(loaded, atRound(143)))).toBe(loaded);
    const earlierTurn = structuredClone(loaded); earlierTurn.contractEconomy.clock.offseasonTurn = 2;
    expect(adopt(loaded, nextRevision(loaded, earlierTurn))).toBe(loaded);
    const laterTurn = structuredClone(loaded); laterTurn.contractEconomy.clock.offseasonTurn = 4;
    expect(adopt(loaded, nextRevision(loaded, laterTurn)).contractEconomy.clock.offseasonTurn).toBe(4);
  });
});
