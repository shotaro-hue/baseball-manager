import { describe, expect, it } from 'vitest';
import { createSeasonContract } from '../seasonContract';
import { createContractLedger, applyContractLedgerAction as apply, contractLiabilityRows as rows,
  validateContractLedger, closeContractLedgerThrough as close, isContractLedgerExtension } from '../contractLedger';

const proposal = ({ id = 'sign-1', contractId = 'c1', playerId = 0, teamId = 0,
  salary = 10000, years = 3, date = '2026-02-01', guaranteed = true } = {}) => ({ id, type: 'sign', teamId, effectiveDate: date,
  contract: createSeasonContract({ contractId, playerId, signedSeason: 2026, agreementPhase: 'preseason', purpose: 'acquisition',
    termYears: years, annualSalaryManYen: salary, guaranteed }) });
const transfer = (id, date, teamId = 0, toTeamId = 1) => ({ id, type: 'transfer', contractId: 'c1', teamId, toTeamId, effectiveDate: date });
const end = (id, date, reason = 'release', settlement = 'retain', teamId = 0) => ({ id, type: 'end', contractId: 'c1', teamId, effectiveDate: date, reason, settlement });
const amount = (ledger, teamId, season, kind) => rows(ledger).filter(r => r.teamId === teamId && r.season === season && (!kind || r.kind === kind)).reduce((n, r) => n + r.amountManYen, 0);
const opened = extra => apply(createContractLedger(), proposal(extra));

describe('immutable contract liability boundaries', () => {
  it('quotes a July three-year acquisition by year without changing its annual salary', () => {
    const ledger = opened({ date: '2026-07-01' });
    expect([2026, 2027, 2028].map(y => amount(ledger, 0, y))).toEqual([5000, 10000, 10000]);
    expect(ledger.records[0].contract.annualSalaryManYen).toBe(10000);
    expect(validateContractLedger(ledger)).toBe(true);
  });
  it('moves only the unelapsed liability and keeps the original expiry', () => {
    const before = opened(), copy = structuredClone(before), ledger = apply(before, transfer('t1', '2026-07-16'));
    expect([amount(ledger, 0, 2026), amount(ledger, 1, 2026)]).toEqual([5484, 4516]);
    expect([amount(ledger, 0, 2027), amount(ledger, 1, 2027), amount(ledger, 1, 2028)]).toEqual([0, 10000, 10000]);
    expect(ledger.records[0].contract.endSeason).toBe(2028);
    expect(before).toEqual(copy);
  });
  it('handles repeated same-day transfers without charging an intermediate club', () => {
    let ledger = opened({ salary: 55 });
    ledger = apply(ledger, transfer('t1', '2026-07-01'));
    ledger = apply(ledger, transfer('t2', '2026-07-01', 1, 2));
    ledger = apply(ledger, transfer('t3', '2026-07-16', 2, 0));
    expect([amount(ledger, 0, 2026), amount(ledger, 1, 2026), amount(ledger, 2, 2026)]).toEqual([53, 0, 2]);
    expect(rows(ledger).some(r => r.teamId === 1)).toBe(false);
  });
  it('amends only future salary periods and preserves the signed terms', () => {
    let ledger = opened({ salary: 240 });
    ledger = apply(ledger, { id: 'raise', type: 'increase', contractId: 'c1', teamId: 0, effectiveDate: '2026-07-16', annualSalaryManYen: 420 });
    expect([2026, 2027, 2028].map(y => amount(ledger, 0, y))).toEqual([322, 420, 420]);
    expect(ledger.records[0].contract.annualSalaryManYen).toBe(240);
  });
  it('keeps a guaranteed release as debt after employment ends', () => {
    let ledger = opened();
    ledger = apply(ledger, transfer('t1', '2026-07-01'));
    ledger = apply(ledger, end('release', '2026-07-16', 'release', 'retain', 1));
    expect(amount(ledger, 0, 2026, 'salary')).toBe(5000);
    expect(amount(ledger, 1, 2026, 'salary')).toBe(484);
    expect(amount(ledger, 1, 2026, 'guarantee')).toBe(4516);
    expect(amount(ledger, 1, 2027, 'guarantee')).toBe(10000);
    expect(amount(ledger, 1, 2028, 'guarantee')).toBe(10000);
    expect(() => apply(ledger, transfer('t2', '2026-07-20', 1, 2))).toThrow();
  });
  it('requires an explicit settlement and cannot waive a guaranteed club release', () => {
    const ledger = opened();
    expect(() => apply(ledger, end('bad', '2026-07-16', 'release', 'waive'))).toThrow();
    expect(() => apply(ledger, { ...end('bad', '2026-07-16', 'retirement'), settlement: undefined })).toThrow();
  });
  it('retains seven-year debt and transfer/end identities after JSON reload', () => {
    const before = opened({ years: 7 });
    const moved = apply(before, transfer('t1', '2026-07-01'));
    const action = end('release', '2026-07-16', 'release', 'retain', 1);
    const after = apply(moved, action), loaded = JSON.parse(JSON.stringify(after));
    expect(rows(loaded)).toEqual(rows(after));
    expect(loaded.records[0].contract).toEqual(before.records[0].contract);
    expect(loaded.records[0].changes).toEqual([transfer('t1', '2026-07-01'), action]);
    expect(apply(loaded, action)).toBe(loaded);
    expect([amount(loaded, 0, 2026, 'salary'), amount(loaded, 1, 2026, 'salary'), amount(loaded, 1, 2026, 'guarantee')])
      .toEqual([5000, 484, 4516]);
    expect([2027, 2028, 2029, 2030, 2031, 2032].map(y => amount(loaded, 1, y, 'guarantee')))
      .toEqual([10000, 10000, 10000, 10000, 10000, 10000]);
    expect(isContractLedgerExtension(moved, loaded)).toBe(true);
    expect(before.records[0].changes).toEqual([]);
  });
  it.each(['retirement', 'posting'])('honors an explicit %s waiver without refunding elapsed salary', reason => {
    const ledger = apply(opened(), end('e1', '2026-07-16', reason, 'waive'));
    expect(amount(ledger, 0, 2026)).toBe(5484);
    expect(amount(ledger, 0, 2027)).toBe(0);
    expect(amount(ledger, 0, 2028)).toBe(0);
  });
  it('keeps retained retirement obligations and permits non-guaranteed release waivers', () => {
    expect(amount(apply(opened(), end('e1', '2026-07-16', 'retirement', 'retain')), 0, 2027, 'guarantee')).toBe(10000);
    expect(amount(apply(opened({ guaranteed: false }), end('e1', '2026-07-16', 'release', 'waive')), 0, 2026)).toBe(5484);
  });
  it('blocks overlapping employment but permits a new deal after guaranteed release', () => {
    const first = opened();
    const second = proposal({ id: 'sign-2', contractId: 'c2', teamId: 1, date: '2026-07-16', years: 1 });
    expect(() => apply(first, second)).toThrow();
    const ledger = apply(apply(first, end('e1', '2026-07-16')), second);
    expect(amount(ledger, 0, 2026)).toBe(10000);
    expect(amount(ledger, 1, 2026)).toBe(4516);
  });
  it('rejects duplicate contract IDs, stale owners, out-of-order actions and salary cuts', () => {
    const ledger = apply(opened(), transfer('t1', '2026-07-16'));
    const copy = JSON.stringify(ledger);
    for (const action of [proposal({ id: 's2', playerId: 2 }), transfer('t2', '2026-07-20'), transfer('t2', '2026-07-01', 1, 2),
      { id: 'r1', type: 'increase', contractId: 'c1', teamId: 1, effectiveDate: '2026-07-20', annualSalaryManYen: 100 }]) {
      expect(() => apply(ledger, action)).toThrow();
    }
    expect(JSON.stringify(ledger)).toBe(copy);
  });
  it('enforces July 31 for both transfers and acquisitions, independently of salary accrual', () => {
    expect(() => opened({ date: '2026-07-31' })).not.toThrow();
    expect(() => opened({ date: '2026-08-01' })).toThrow();
    expect(() => apply(opened(), transfer('t', '2026-07-31'))).not.toThrow();
    expect(() => apply(opened(), transfer('t', '2026-08-01'))).toThrow();
  });
  it('is replay-safe across JSON reload and protects identical IDs with changed payloads', () => {
    const p = proposal(), t = transfer(0, '2026-07-16');
    const ledger = JSON.parse(JSON.stringify(apply(apply(createContractLedger(), p), t)));
    expect(apply(ledger, structuredClone(p))).toBe(ledger);
    expect(apply(ledger, { effectiveDate: t.effectiveDate, toTeamId: 1, teamId: 0, contractId: 'c1', type: 'transfer', id: 0 })).toBe(ledger);
    expect(() => apply(ledger, { ...t, toTeamId: 2 })).toThrow();
  });
  it('closes years without losing costs, allows replay, and rejects new backdated actions', () => {
    const p = proposal();
    const before = apply(createContractLedger(), p), ledger = close(before, 2026);
    expect(rows(ledger)).toEqual(rows(before));
    expect(close(ledger, 2026)).toBe(ledger);
    expect(apply(ledger, p)).toBe(ledger);
    expect(() => close(ledger, 2025)).toThrow();
    expect(() => apply(ledger, transfer('old', '2026-07-31'))).toThrow();
    expect(amount(apply(ledger, transfer('future', '2027-07-01')), 1, 2027)).toBe(5000);
  });
  it('recognizes only append-only extensions and never accepts erased or rewritten debt', () => {
    const before = opened(), after = apply(before, end('e1', '2026-07-16'));
    expect(isContractLedgerExtension(before, after)).toBe(true);
    expect(isContractLedgerExtension(after, before)).toBe(false);
    expect(isContractLedgerExtension(after, createContractLedger())).toBe(false);
    const changed = structuredClone(before); changed.records[0].contract.annualSalaryManYen = 1;
    expect(isContractLedgerExtension(before, changed)).toBe(false);
  });
  it('does not treat a new closed-year change or signing as an extension of a closed snapshot', () => {
    const open = opened(), before = close(open, 2026);
    const changedPast = close(apply(open, transfer('past', '2026-07-16')), 2026);
    expect(isContractLedgerExtension(before, changedPast)).toBe(false);
    const newPast = close(apply(open, proposal({ id: 's2', contractId: 'c2', playerId: 1 })), 2026);
    expect(isContractLedgerExtension(before, newPast)).toBe(false);
  });
  it('retains recorded zeros and all seven years, and rejects incomplete ledger records', () => {
    const ledger = opened({ contractId: 0, teamId: 0, salary: 0, years: 7 });
    expect(rows(ledger).map(r => r.amountManYen)).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(rows(ledger).map(r => r.season)).toEqual([2026, 2027, 2028, 2029, 2030, 2031, 2032]);
    for (const value of [null, {}, { ...ledger, version: 99 }, { ...ledger, closedThroughSeason: undefined }]) {
      expect(() => validateContractLedger(value)).toThrow();
    }
  });
});
