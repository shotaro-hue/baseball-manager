import { describe, expect, it } from 'vitest';
import { retirementIncomeWorld, retirementIncomeCommand } from './fixtures/retirementIncome';
import { atDate, playableClub, nextSeasonForDepartureTest } from './fixtures/inSeasonDepartures';
import { finish, winter } from './fixtures/annualRetirements';
import { freezeEconomy } from './fixtures/economyWorld';
import { completion } from './fixtures/postingIncome';
import { quoteEconomyCommand, reduceEconomyCommand } from '../contractEconomy';
import { validateEconomySave } from '../economyPersistence';
import { contractLiabilityRows } from '../contractLedger';
import { createInitialTeams } from '../bootstrapTeams';
import { quoteAnnualBudgetPolicy } from '../annualBudgetPolicy';

const json = w => JSON.parse(JSON.stringify(w));
const engine = w => w.contractEconomy.engine;
const apply = (w, c = retirementIncomeCommand(w)) => {
  const r = reduceEconomyCommand(w, c); expect(r.ok, r.error).toBe(true); return r.world;
};
const deny = (w, c) => {
  const old = structuredClone(w); freezeEconomy(w);
  expect(quoteEconomyCommand(w, c).ok).toBe(false);
  expect(reduceEconomyCommand(w, c)).toMatchObject({ ok: false, world: w }); expect(w).toEqual(old);
};

describe('retirement-game extraordinary income', () => {
  it.each([0, 12345])('records %s man-yen once without granting spending permission or changing employment', amountManYen => {
    const w = retirementIncomeWorld(), c = retirementIncomeCommand(w, { id: 0 === amountManYen ? 'zero' : 'event', amountManYen });
    const old = structuredClone(w); freezeEconomy(w);
    expect(quoteEconomyCommand(w, c).ok).toBe(true); expect(w).toEqual(old);
    const next = apply(w, c);
    expect(next.contractEconomy.incomeReceipts).toHaveLength(1);
    expect(next.contractEconomy.incomeReceipts[0]).toMatchObject({ version: 1, kind: 'retirement-game',
      retirementReservationId: 0, season: 2026, teamId: 0, playerId: 0, amountManYen,
      phase: 'season', recordedDate: '2026-07-16', gameDay: 100 });
    expect(next.contractEconomy.incomeReceipts[0]).not.toHaveProperty('budgetAllocation');
    expect(next.teams).toEqual(w.teams); expect(engine(next).spending).toEqual(engine(w).spending);
    expect(next.contractEconomy.budgetPolicies).toEqual(w.contractEconomy.budgetPolicies);
    expect(contractLiabilityRows(engine(next).spending.ledger)).toEqual(contractLiabilityRows(engine(w).spending.ledger));
    expect(engine(next)).not.toHaveProperty('incomeReceipts'); expect(engine(next)).not.toHaveProperty('gameDay');
    expect(validateEconomySave(json(next))).toBe('annual');
    expect(reduceEconomyCommand(json(next), c)).toMatchObject({ ok: true, replayed: true });
    deny(json(next), retirementIncomeCommand(next, { id: 'other' }));
    deny(json(next), { ...c, transaction: { ...c.transaction, amountManYen: amountManYen + 1 } });
  });

  it('accepts command ID0 independently of reservation ID0', () => {
    const w = retirementIncomeWorld(undefined, 'notice'); expect(apply(w, retirementIncomeCommand(w, { id: 0 })).contractEconomy.incomeReceipts).toHaveLength(1);
  });

  it.each([{ amountManYen: undefined }, { amountManYen: null }, { amountManYen: -1 },
    { amountManYen: 0.5 }, { amountManYen: Number.MAX_SAFE_INTEGER + 1 }, { amountManYen: '12345' },
    { kind: 'other' }, { reservationId: 'missing' }, { teamId: 1 }, { playerId: 1 },
    { gameDay: 99 }, { date: '2026-07-15' }, { budgetAllocation: { season: 2027, amountManYen: 12345 } }])(
    'rejects invalid command %j without mutation', extra => {
      const w = retirementIncomeWorld(); deny(w, retirementIncomeCommand(w, extra));
    });

  it('requires a pending reservation in the current season', () => {
    const w = retirementIncomeWorld(), c = retirementIncomeCommand(w);
    const noReservation = json(w); engine(noReservation).retirementReservations = []; engine(noReservation).transactions = [];
    deny(noReservation, { ...c, baseRevision: noReservation.contractEconomy.revision });
    const off = winter(w); deny(off, retirementIncomeCommand(off));
    const finalized = apply(off, finish(off)); deny(finalized, retirementIncomeCommand(finalized));
  });

  it('retains income and replay after finalization and year advance without using later health', () => {
    const teams = [playableClub(), playableClub(1)];
    teams.forEach(t => [...t.players, ...t.farm].forEach(p => { p.contractYearsLeft = 4; }));
    const w = retirementIncomeWorld({ teams, years: 4 }), c = retirementIncomeCommand(w), n = apply(w, c);
    const off = winter(n), done = apply(off, finish(off)), later = nextSeasonForDepartureTest(done);
    later.teams[0].players[0].injuryDaysLeft = 100;
    expect(later.contractEconomy.incomeReceipts).toEqual(n.contractEconomy.incomeReceipts);
    expect(validateEconomySave(json(later))).toBe('annual');
    expect(reduceEconomyCommand(later, c)).toMatchObject({ ok: true, replayed: true });
  });

  it.each([
    ['amount', w => { w.contractEconomy.incomeReceipts[0].amountManYen++; }],
    ['amount missing', w => { delete w.contractEconomy.incomeReceipts[0].amountManYen; }],
    ['income missing', w => { w.contractEconomy.incomeReceipts = []; }],
    ['receipt missing', w => { engine(w).transactions.pop(); }],
    ['duplicate source', w => { w.contractEconomy.incomeReceipts.push(structuredClone(w.contractEconomy.incomeReceipts[0])); }],
    ['wrong club', w => { w.contractEconomy.incomeReceipts[0].teamId = 1; }],
    ['allocation', w => { w.contractEconomy.incomeReceipts[0].budgetAllocation = { season: 2027, amountManYen: 12345 }; }],
    ['round', w => { w.contractEconomy.incomeReceipts[0].gameDay = 99; }],
    ['date', w => { w.contractEconomy.incomeReceipts[0].recordedDate = '2026-07-15'; }],
  ])('rejects tampered %s on JSON reload', (_, edit) => {
    const w = json(apply(retirementIncomeWorld())); edit(w); expect(() => validateEconomySave(freezeEconomy(w))).toThrow();
  });

  it('validates event round/date against current and available archived schedules', () => {
    const teams = [playableClub(), playableClub(1)];
    teams.forEach(t => [...t.players, ...t.farm].forEach(p => { p.contractYearsLeft = 4; }));
    const w = retirementIncomeWorld({ teams, years: 4 }), now = atDate(w, '2026-07-17', 101), n = apply(now);
    const bad = json(n); bad.contractEconomy.incomeReceipts[0].gameDay = 100;
    expect(() => validateEconomySave(bad)).toThrow();
    const missing = json(n); delete missing.schedule[101]; expect(() => validateEconomySave(missing)).toThrow();
    const off = winter(n), later = nextSeasonForDepartureTest(apply(off, finish(off)));
    expect(validateEconomySave(json(later))).toBe('annual');
    const past = json(later); past.contractEconomy.incomeReceipts[0].gameDay = 100;
    expect(() => validateEconomySave(past)).toThrow();
    const unavailable = json(later); unavailable.scheduleArchive = [];
    expect(validateEconomySave(unavailable)).toBe('annual');
  });

  it('coexists with posting fee allocation without reclassifying or spending this income', () => {
    let w = retirementIncomeWorld(); w.teams[0].farm[0].postingRequested = true;
    const next = apply(w), off = winter(next), id = off.teams[0].farm[0].id;
    const posted = apply(off, completion(off, {}, 0, id));
    expect(posted.contractEconomy.incomeReceipts.map(r => r.kind)).toEqual(['retirement-game', 'posting']);
    expect(validateEconomySave(json(posted))).toBe('annual');
    expect(engine(posted).spending.authorizations.find(r => r.teamId === 0 && r.season === 2027).approvedManYen).toBe(1253125);
  });

  it('leaves ordinary annual budget quotes unchanged', () => {
    const w = retirementIncomeWorld(), next = apply(w);
    const policy = { policyVersion: 'test', allocationPercent: 100, smoothingYears: 1, maxChangePercent: 10,
      forecasts: w.teams.flatMap(t => Array.from({ length: 8 }, (_, i) => ({ teamId: t.id, season: 2026 + i,
        source: 'profile', operatingSurplusesManYen: [1000000], supportManYen: 0, previousApprovedManYen: null }))) };
    expect(quoteAnnualBudgetPolicy(next, policy)).toEqual(quoteAnnualBudgetPolicy(w, policy));
  });

  it('uses real generated player/contract data for success and missing-reservation refusal', () => {
    const w = retirementIncomeWorld({ teams: createInitialTeams() }), c = retirementIncomeCommand(w);
    const bad = json(w); bad.contractEconomy.engine.retirementReservations = []; bad.contractEconomy.engine.transactions = [];
    deny(bad, c); const next = apply(w, c);
    expect(validateEconomySave(json(next))).toBe('annual'); expect(next.teams).toEqual(w.teams);
  });
});
