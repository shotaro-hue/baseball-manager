import { expect, it } from 'vitest';
import { createContractLedger, applyContractLedgerAction, contractLiabilityRows } from '../contractLedger';
import { createSeasonContract } from '../seasonContract';

const source = () => applyContractLedgerAction(createContractLedger(), { id: 'sign', type: 'sign', teamId: 0,
  effectiveDate: '2025-02-01', contract: createSeasonContract({ contractId: 'c', playerId: 0, signedSeason: 2025,
    agreementPhase: 'preseason', purpose: 'acquisition', termYears: 3, annualSalaryManYen: 1000, guaranteed: true }) });
const end = agreedDate => ({ id: 'end', type: 'end', teamId: 0, contractId: 'c', reason: 'posting', settlement: 'waive',
  effectiveDate: '2027-02-01', terminationAgreement: { id: 0, agreedDate } });
it('records a December agreement for a February exit without changing past salary', () => {
  const before = source(), next = applyContractLedgerAction(before, end('2026-12-01'));
  expect(contractLiabilityRows(next)).toEqual(contractLiabilityRows(before).filter(r => r.season < 2027));
  expect(next.records[0].changes[0].terminationAgreement.agreedDate).toBe('2026-12-01');
  expect(applyContractLedgerAction(JSON.parse(JSON.stringify(next)), end('2026-12-01'))).toEqual(next);
});
it.each(['2024-12-01', '2027-02-02', '2026-02-30', undefined])('rejects an impossible agreement date %s', date => {
  expect(() => applyContractLedgerAction(source(), end(date))).toThrow();
});
it('requires a fresh agreement after the last change of payer or salary', () => {
  const changed = applyContractLedgerAction(source(), { id: 'raise', type: 'increase', teamId: 0, contractId: 'c',
    effectiveDate: '2026-07-16', annualSalaryManYen: 1600 });
  expect(() => applyContractLedgerAction(changed, end('2026-07-15'))).toThrow();
  expect(contractLiabilityRows(applyContractLedgerAction(changed, end('2026-12-01'))).every(r => r.season < 2027)).toBe(true);
});
