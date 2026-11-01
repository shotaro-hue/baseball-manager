import { expect, it } from 'vitest';
import { developmentFixture } from './fixtures/developmentWorld';
import { freezeEconomy } from './fixtures/economyWorld';
import { developmentRequest, reduceDevelopmentRequest, previewDevelopmentRegistration } from '../developmentRegistration';
import { fromAnnualState, toAnnualState, reduceEconomyCommand } from '../contractEconomy';
import { validateEconomySave } from '../economyPersistence';
import { createSeasonContract } from '../seasonContract';
import { pendingDevelopmentFixture } from './fixtures/pendingDevelopmentWorld';

const success = result => { expect(result.ok, result.error).toBe(true); return result.world; };
const reject = (w, request = developmentRequest(w, 0)) => {
  const snapshot = JSON.stringify(w), result = reduceDevelopmentRequest(freezeEconomy(w), request);
  expect(result.ok).toBe(false); expect(result.world).toBe(w); expect(JSON.stringify(w)).toBe(snapshot);
};

it.each([['fa', 3], ['personnel', 2]])('counts pending %s joins in the occupied slots before conversion', (kind, count) => {
  const w = pendingDevelopmentFixture(kind);
  expect(validateEconomySave(w)).toBe('annual');
  const preview = previewDevelopmentRegistration(w, 0);
  expect(preview.ok, preview.error).toBe(true);
  expect(preview.occupiedCount).toBe(count);
});

it.each([[240, 420, [322, 420, 420]], [600, 600, [600, 600, 600]]])('uses ledger salary %s, preserves end and guarantee, and round-trips projections', (salary, expected, costs) => {
  const w = freezeEconomy(developmentFixture({ salary })), snapshot = JSON.stringify(w);
  const preview = previewDevelopmentRegistration(w, 0); expect(preview.ok, preview.error).toBe(true);
  expect(preview.costs.map(r => r.amountManYen)).toEqual(costs); expect(preview.salary).toBe(expected);
  expect(preview.endSeason).toBe(2028); expect(JSON.stringify(w)).toBe(snapshot);
  const next = success(reduceDevelopmentRequest(w, developmentRequest(w, 0)));
  expect(next.teams[0].farm[0]).toMatchObject({ salary: expected, isIkusei: false, 育成: false, contractYears: 3, contractYearsLeft: 3, ikuseiYears: 0 });
  expect(next.contractEconomy.engine.spending.ledger.records.find(r => r.contract.playerId === 0).contract).toMatchObject({ endSeason: 2028, guaranteed: true });
  expect(validateEconomySave(JSON.parse(JSON.stringify(next)))).toBe('annual');
});
it.each(['2026-02-01', '2026-07-31'])('accepts registration on %s', date => {
  const w = developmentFixture({ date }); success(reduceDevelopmentRequest(w, developmentRequest(w, 0)));
});
it.each([69, 70])('checks the 70-player cap at %s existing controlled players', count => {
  const w = developmentFixture({ count });
  if (count === 69) expect(success(reduceDevelopmentRequest(w, developmentRequest(w, 0))).teams[0].farm[0].isIkusei).toBe(false);
  else reject(w);
});
it.each([{ isIkusei: false, 育成: true }, { isIkusei: true, 育成: false }])('accepts either old development flag and projects both consistently: %j', flags => {
  const w = developmentFixture(); Object.assign(w.teams[0].farm[0], flags);
  const next = success(reduceDevelopmentRequest(w, developmentRequest(w, 0)));
  expect(next.teams[0].farm[0]).toMatchObject({ isIkusei: false, 育成: false });
});
it.each([{ date: '2026-08-01' }, { playerId: 'other' }])('rejects unavailable registration %j', options => reject(developmentFixture(options)));
it.each([{ teamId: 1 }, { playerId: '0' }, { annualSalaryManYen: 0 }, { guaranteed: false }, { baseRevision: 1 }, { saveId: 'other' }, { epoch: 'other' }])('rejects unauthorized, stale or invented request fields %j', extra => {
  const w = developmentFixture(); reject(w, { ...developmentRequest(w, 0), ...extra });
});
it('rechecks every future budget and does not use the displayed legacy wallet', () => {
  let w = developmentFixture(); expect(previewDevelopmentRegistration(w, 0).ok).toBe(true);
  w.contractEconomy.engine.spending.authorizations.find(r => r.teamId === 0 && r.season === 2028).approvedManYen = 419;
  w.contractEconomy.budgetPolicies.find(r => r.teamId === 0 && r.season === 2028).approvedManYen = 419;
  w = fromAnnualState(w, toAnnualState(w)); w.teams[0].budget = 999999999;
  reject(w);
});
it('replays the original request after reload and rejects an unrelated stale request', () => {
  const w = developmentFixture(), request = developmentRequest(w, 0);
  const next = success(reduceDevelopmentRequest(w, request)), restored = JSON.parse(JSON.stringify(next));
  expect(reduceDevelopmentRequest(restored, request)).toMatchObject({ ok: true, world: restored, replayed: true });
  reject(restored, { ...request, playerId: 'missing' });
});
it.each([false, true])('rejects a pending/accepted future development renewal (accepted=%s)', accepted => {
  let w = developmentFixture();
  const record = w.contractEconomy.engine.spending.ledger.records.find(r => r.contract.playerId === 0);
  record.contract.termYears = 1; record.contract.endSeason = 2026;
  w = fromAnnualState(w, toAnnualState(w));
  const send = transaction => { w = success(reduceEconomyCommand(w, { saveId: w.saveId, epoch: w.contractEconomy.epoch, baseRevision: w.contractEconomy.revision, transaction })); };
  send({ id: 'renew-dev', type: 'offer-renewal', contractId: record.contract.contractId,
    proposal: { id: 'future-dev', type: 'sign', teamId: 0, effectiveDate: '2027-02-01',
      contract: createSeasonContract({ contractId: 'future-dev-contract', playerId: 0, signedSeason: 2026, agreementPhase: 'season',
        purpose: 'renewal', termYears: 1, annualSalaryManYen: 240, guaranteed: true, registrationType: 'development' }) } });
  if (accepted) send({ id: 'accept-dev', type: 'accept-renewal', proposalId: 'future-dev', contractId: record.contract.contractId });
  reject(w);
});
