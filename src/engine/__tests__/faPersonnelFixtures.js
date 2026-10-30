import { expect } from 'vitest';
import { createSeasonContract } from '../seasonContract';
import { createContractLedger, applyContractLedgerAction } from '../contractLedger';
import { applyAnnualTransaction } from '../annualTransactions';

export const json = x => JSON.parse(JSON.stringify(x));
export const player = (id, extra = {}) => ({ id, name: String(id), pos: '一塁手', salary: 1000, ...extra });
export const terms = (id, extra = {}) => createSeasonContract({ contractId: `c-${id}`, playerId: id, signedSeason: 2026,
  agreementPhase: 'preseason', purpose: 'acquisition', termYears: 3, annualSalaryManYen: 1000,
  guaranteed: true, registrationType: 'controlled', ...extra });
export function own(s, id, teamId = 0, extra = {}, contract = {}) {
  const c = terms(id, contract); s.teams.find(t => t.id === teamId).farm.push(player(id, extra));
  s.spending.ledger = applyContractLedgerAction(s.spending.ledger, { id: `sign-${id}`, type: 'sign', teamId,
    effectiveDate: `${c.startSeason}-02-01`, contract: c }); return s;
}
export function fixture() {
  const s = { version: 1, season: 2026, phase: 'offseason', date: '2026-12-05', transactions: [],
    teams: [0, 1, 2, 3].map(id => ({ id, league: id === 2 ? 'パ' : 'セ', budget: 999, players: [], farm: [] })), faPool: [],
    draftContext: { draftPool: [], drafted: {}, confirmedPicks: {} },
    rosterRequirements: [0, 1, 2, 3].flatMap(teamId => [2026, 2027, 2028, 2029, 2030].map(season => ({ teamId, season, requiredControlledCount: 0 }))),
    spending: { version: 1, budgetSeason: 2027, ledger: createContractLedger(), reservations: [], resolvedReservations: [], oneOffCosts: [],
      authorizations: [0, 1, 2, 3].flatMap(teamId => [2026, 2027, 2028, 2029, 2030].map(season => ({ teamId, season, approvedManYen: 200000, minimumRosterReserveManYen: 0 }))) },
    faCompensationStandings: [{ season: 2026, teams: [0, 1, 2, 3].map(teamId => ({ teamId, league: teamId === 2 ? 'パ' : 'セ', wins: 80 - teamId * 10, losses: 60 + teamId * 10 })) }] };
  own(s, 'a'); own(s, 'reserve'); own(s, 'other'); own(s, 'b', 1); own(s, 'c', 2); own(s, 'd', 3);
  s.teams[0].players.push(s.teams[0].farm.shift()); return s;
}
export const success = result => { expect(result.ok, result.error).toBe(true); return result.state; };
export const run = (s, command) => success(applyAnnualTransaction(s, command));
export function claim(s = fixture(), id = 'bid', originTeamId = 1, basis = {}, rank = 'A', teamId = 0) {
  const p = player(`fa-${id}`, { isFA: true, entryType: '高卒', daysOnActiveRoster: 1080,
    marketEntry: { id: `market-${id}`, kind: 'domestic-fa', enteredDate: '2026-11-01', originTeamId, compensationRank: rank,
      compensationBasis: { previousAnnualSalaryManYen: 10000, exercise: 'first', ...basis } } });
  s = { ...s, faPool: [...s.faPool, p] };
  const proposal = { id, type: 'sign', teamId, offeredDate: s.date, effectiveDate: '2027-02-01', marketEntry: json(p.marketEntry),
    contract: terms(p.id, { contractId: `new-${id}`, agreementPhase: 'offseason' }) };
  s = run(s, { id: `offer-${id}`, type: 'offer-fa', proposal });
  return run(s, { id: `accept-${id}`, type: 'accept-fa', proposalId: id });
}
export const protect = (s = claim(), proposalId = 'bid', ids = ['a']) => run(s,
  { id: `protect-${proposalId}`, type: 'submit-fa-protection', proposalId, teamId: 0, protectedPlayerIds: ids });
export const choice = (proposalId = 'bid', teamId = 1, playerId = 'reserve') => ({ proposalId, teamId, playerId });
export const settle = (selections = [choice()], id = 'personnel') => ({ id, type: 'settle-fa-personnel', selections });
export const spring = s => ({ ...s, season: 2027, phase: 'preseason', date: '2027-02-01' });
export const freeze = x => { if (x && typeof x === 'object') { Object.values(x).forEach(freeze); Object.freeze(x); } return x; };
