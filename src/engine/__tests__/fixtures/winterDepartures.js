import { employmentContractId } from '../../seasonContract';
import { economyFixture } from './economyWorld';
import { fromAnnualState, toAnnualState } from '../../contractEconomy';

export function winter(years = 1) {
  const w = economyFixture();
  w.contractEconomy.clock = { season: 2026, phase: 'offseason', date: '2026-12-01', offseasonTurn: 0 };
  const s = w.contractEconomy.engine.spending, c = s.ledger.records[0].contract;
  c.termYears = years; c.endSeason = 2025 + years;
  s.budgetSeason = 2027;
  s.renewalPlans = years === 1 ? [{ teamId: 0, playerId: 0, sourceContractId: c.contractId,
    season: 2027, amountManYen: 1200, basis: 'recorded-plan' }] : [];
  w.teams[0].players[0].stats = { hr: 20 };
  w.teams[0].lineup = [0]; w.teams[0].rotation = [0];
  w.teams[0].fieldingDh = { 0: '一塁手' };
  w.teams[0].pitchingPattern = { closerId: 0, middleOrder: [0] };
  return fromAnnualState(w, toAnnualState(w));
}
export function departureCommand(w, reason = 'expiry', overrides = {}) {
  return { saveId: w.saveId, epoch: w.contractEconomy.epoch, baseRevision: w.contractEconomy.revision,
    transaction: { id: 'departure-0', type: 'enter-market', teamId: 0, playerId: 0,
      contractId: employmentContractId(w.contractEconomy.engine.spending.ledger.records[0].contract), reason, ...overrides } };
}
