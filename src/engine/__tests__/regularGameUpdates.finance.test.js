import { describe, expect, it } from 'vitest';
import { TEAM_DEFS } from '../../constants';
import { startClubFinance, calcClubGameFinance, validateClubFinance } from '../clubFinance';
import { applyRegularSeasonTeamUpdate } from '../regularGameUpdates';

const rules = {
  tickPositionTraining: players => players,
  tickInjuries: players => players,
  checkForInjuries: () => [],
};
const beforeGame = (id = 0, extra = {}) => startClubFinance({
  ...TEAM_DEFS[id], players: [], farm: [], coaches: [], wins: 4, losses: 4,
  draws: 0, popularity: 42, stadiumLevel: 1, ...extra,
}, 2026);
const result = { score: { my: 7, opp: 2 }, log: [] };

describe('FIX-M2: finance uses pre-game conditions for actual receipts', () => {
  it.each([0, 500, 5000])('a home game with ticket setting %s follows the pre-game quote', ticketPrice => {
    const pre = beforeGame(0, { customAvgTicketPrice: ticketPrice });
    const quote = calcClubGameFinance(pre, true, 1);
    const { team: after } = applyRegularSeasonTeamUpdate(pre, result,
      { isFirstTeam: true, isHomeTeam: true, gameDay: 1, year: 2026 }, rules);
    expect(after.wins).toBe(pre.wins + 1);
    expect(after.popularity).not.toBe(pre.popularity);
    // Very low ticket prices may fill the park before/after the game;
    // use the unsaturated high-price case to prove the demand ordering.
    if (ticketPrice === 5000) {
      expect(calcClubGameFinance({ ...after, clubFinance: pre.clubFinance }, true, 1).attendance)
        .not.toBe(quote.attendance);
    }
    expect(after.clubFinance.income).toEqual(quote.income);
    expect(after.clubFinance.costs).toEqual(quote.costs);
    expect(after.budget).toBe(pre.budget + quote.operatingSurplus);
    expect(after.clubFinance.postedRounds).toEqual([1]);
    expect(validateClubFinance(after.clubFinance)).toBe(true);
    expect(pre.clubFinance.postedRounds).toEqual([]);
  });

  it.each([
    [true, false], [false, true], [false, false],
  ])('separates perspective %s from actual hosting %s', (isFirstTeam, isHomeTeam) => {
    const pre = beforeGame(1);
    const quote = calcClubGameFinance(pre, isHomeTeam, 1);
    const { team: after } = applyRegularSeasonTeamUpdate(pre, result,
      { isFirstTeam, isHomeTeam, gameDay: 1, year: 2026 }, rules);
    expect(after.clubFinance.income).toEqual(quote.income);
    expect(after.clubFinance.costs).toEqual(quote.costs);
    expect(after.clubFinance.homeGames).toBe(Number(isHomeTeam));
    expect(after.clubFinance.awayGames).toBe(Number(!isHomeTeam));
    expect(after.budget - pre.budget).toBe(quote.operatingSurplus);
  });

  it('does not change the historical calculation for a ledger-free legacy team', () => {
    const legacy = beforeGame(); delete legacy.clubFinance;
    const { team: after } = applyRegularSeasonTeamUpdate(legacy, result,
      { isFirstTeam: true, isHomeTeam: true, gameDay: 1, year: 2026 }, rules);
    expect(after.clubFinance).toBeUndefined();
    expect(after.wins).toBe(legacy.wins + 1);
    expect(after.revenueThisSeason).toBeGreaterThan(0);
  });
});
