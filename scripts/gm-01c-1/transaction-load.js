// Synthetic API load, not live UI or device performance.
import { createSeasonContract } from '../../src/engine/seasonContract';
import { createContractLedger, applyContractLedgerAction } from '../../src/engine/contractLedger';

export function createTransactionLoad() {
  let ledger = createContractLedger();
  const teams = Array.from({ length: 12 }, (_, teamId) => ({ id: teamId, budget: 1000000, players: [],
    farm: Array.from({ length: 65 }, (_, i) => {
      const id = `p-${teamId}-${i}`;
      const contract = createSeasonContract({ contractId: `c-${id}`, playerId: id, signedSeason: 2026,
        agreementPhase: 'preseason', purpose: 'acquisition', termYears: 7, annualSalaryManYen: 1000, guaranteed: true });
      ledger = applyContractLedgerAction(ledger, { id: `sign-${id}`, type: 'sign', teamId, effectiveDate: '2026-02-01', contract });
      return { id, name: id, pos: '一塁手', salary: 1000 };
    }) }));
  const authorizations = teams.flatMap(t => Array.from({ length: 7 }, (_, i) => ({ teamId: t.id, season: 2026 + i,
    approvedManYen: 1000000, minimumRosterReserveManYen: 0 })));
  const state = { version: 1, season: 2026, phase: 'season', date: '2026-07-01', teams, faPool: [],
    draftContext: { draftPool: [], drafted: {}, confirmedPicks: {} }, transactions: [],
    rosterRequirements: authorizations.map(a => ({ teamId: a.teamId, season: a.season, requiredControlledCount: 67 })),
    spending: { version: 1, budgetSeason: 2026, ledger, authorizations, reservations: [], resolvedReservations: [], oneOffCosts: [] } };
  const command = { id: 'benchmark-trade', type: 'trade', fromId: 0, toId: 1,
    outgoingIds: ['p-0-0'], incomingIds: ['p-1-0'], cashManYen: 0, mode: 'cashless-trade' };
  return { state, command };
}

export function measureQuotes(quote, scenario, samples = 5) {
  const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } };
  freeze(scenario);
  const before = JSON.stringify(scenario), times = [];
  let rows;
  for (let i = 0; i <= samples; i++) {
    const start = performance.now();
    const result = quote(scenario.state, scenario.command);
    const ms = performance.now() - start;
    if (!result.ok || result.state !== undefined || result.replayed !== false || result.rows.length !== 84
      || result.rows.some(r => r.salaryManYen !== 65000 || r.minimumRosterReserveManYen !== 840
        || r.reservedManYen !== 0 || r.remainingManYen !== 934160))
      throw new Error(`Invalid synthetic quote: ${JSON.stringify(result)}`);
    const serialized = JSON.stringify(result.rows);
    if (rows !== undefined && rows !== serialized) throw new Error('Repeated quote rows changed');
    rows = serialized;
    if (JSON.stringify(scenario) !== before || scenario.state.transactions.length !== 0)
      throw new Error('Quote mutated its input or committed a receipt');
    if (i > 0) times.push(ms); // One untimed warm-up, same input object each time.
  }
  const sorted = [...times].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return { samplesMs: times, medianMs: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
    minMs: sorted[0], maxMs: sorted.at(-1), rows, inputUnchanged: true, committedReceipts: 0 };
}
