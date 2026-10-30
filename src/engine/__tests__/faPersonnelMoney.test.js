import { describe, expect, it } from 'vitest';
import * as spending from '../annualSpending';
import { faCashCompensationManYen, faCashCompensationCosts } from '../faCompensation';
import { fixture, claim, json } from './faPersonnelFixtures';

describe('FA personnel reduced cash obligations', () => {
  it.each([['A', 'first', 5001], ['B', 'first', 4001], ['A', 'repeat', 2501], ['B', 'repeat', 2001]])(
    '%s %s uses the previous salary and rounds up exactly once', (rank, exercise, expected) => {
      const s = claim(fixture(), 'bid', 1, { exercise, previousAnnualSalaryManYen: 10001 }, rank);
      const p = s.spending.resolvedReservations[0].proposal;
      expect(faCashCompensationManYen(p, 'player-and-cash')).toBe(expected);
      expect(faCashCompensationCosts(p, 'player-and-cash').map(c => c.amountManYen)).toEqual([expected, -expected]);
    });
  it('settles a reduced obligation without granting a second spending allowance', () => {
    const s = claim(), snapshot = json(s.spending);
    expect(typeof spending.settleFaPersonnelCompensation).toBe('function');
    const next = spending.settleFaPersonnelCompensation(s.spending,
      { proposalId: 'bid', teamId: 1, chosenDate: s.date, playerId: 'reserve', transactionId: 'move' });
    expect(s.spending).toEqual(snapshot);
    expect(next.faCompensations[0]).toEqual({ proposalId: 'bid', resolution: 'player-and-cash', teamId: 1,
      chosenDate: s.date, playerId: 'reserve', transactionId: 'move' });
    expect(next.oneOffCosts.map(c => c.amountManYen)).toEqual([5000, -5000]);
    expect(spending.assessAnnualSpendingChange(snapshot, next).ok).toBe(true);
    expect(() => spending.quoteAnnualSpendingPlan({ ...next, oneOffCosts: next.oneOffCosts.slice(1) })).toThrow();
    const changed = json(next); changed.faCompensations[0].playerId = null;
    expect(() => spending.quoteAnnualSpendingPlan(changed)).toThrow();
    expect(() => spending.settleFaCashCompensation(next, { proposalId: 'bid', teamId: 1, chosenDate: s.date })).toThrow();
  });
});
