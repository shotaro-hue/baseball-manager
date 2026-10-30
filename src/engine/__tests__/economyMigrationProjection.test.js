import { contractEntries } from '../../components/management/playerListModel';
import { describe, expect, it } from 'vitest';
import { prepareEconomyMigration } from '../economyMigration';
import { createAnnualNewGameWorld, toAnnualState, fromAnnualState, reduceEconomyCommand, quoteEconomyCommand } from '../contractEconomy';
import { contractEmploymentAt, contractLiabilityRows } from '../contractLedger';
import { createSeasonContract } from '../seasonContract';
import { economyPolicy } from './fixtures/economyWorld';
import { json, freeze } from './faPersonnelFixtures';

const original = signed => ({ id: 'player-a', name: 'A', pos: '一塁手', salary: 1000,
  contractYears: 3, contractYearsLeft: 3, contractSignedYear: signed });
function fixture(signed = 2025) {
  const teams = Array.from({ length: 12 }, (_, id) => ({ id, budget: 12345,
    players: id === 0 ? [original(signed)] : id === 1 ? [{ ...original(2026), id: 'player-b', contractYears: 7, contractYearsLeft: 7 }] : [],
    farm: id === 0 ? [{ ...original(2026), id: 'development', isIkusei: true, 育成: true, ikuseiYears: 0, contractYears: 7, contractYearsLeft: 7 }] : [] }));
  const legacy = { saveId: 'real-legacy', year: 2026, phase: 'season', teams, faPool: [], mailbox: [], offseasonPlan: null };
  const before = json(legacy), result = prepareEconomyMigration(freeze(legacy), { season: 2026, stage: 'unstarted-offseason', legacyOffseasonStarted: false });
  expect(result.ok, JSON.stringify(result.issues)).toBe(true); expect(legacy).toEqual(before);
  // Explicit test envelope only; no production migration/rollover is enabled.
  const w = createAnnualNewGameWorld({ teams, faPool: [], myId: 0, saveId: legacy.saveId,
    season: 2026, policy: economyPolicy(teams), randomRoot: { algorithmVersion: 1, seed: 'legacy-fields' } });
  w.teams = json(teams); w.contractEconomy.engine.spending.ledger = result.candidate.ledger;
  w.contractEconomy.engine.spending.budgetSeason = 2027;
  w.contractEconomy.clock = { season: 2026, phase: 'offseason', date: '2026-12-01', offseasonTurn: 0 };
  return w;
}
const projection = w => fromAnnualState(w, toAnnualState(freeze(w)));
const at = (w, year, phase = 'preseason') => ({ ...json(w), year, gameDay: 1,
  schedule: [null, { date: { month: 7, day: 1 } }],
  contractEconomy: { ...json(w.contractEconomy), cycle: { ...w.contractEconomy.cycle, season: year },
    clock: { season: year, phase, date: `${year}-${phase === 'season' ? '07-01' : '02-01'}`, offseasonTurn: 0 },
    engine: { ...json(w.contractEconomy.engine), spending: { ...json(w.contractEconomy.engine.spending), budgetSeason: year } } } });
const player = (w, id = 'player-a') => w.teams.flatMap(t => [...t.players, ...t.farm]).find(p => p.id === id);
const ledger = w => w.contractEconomy.engine.spending.ledger;
const envelope = (w, transaction) => ({ saveId: w.saveId, epoch: w.contractEconomy.epoch, baseRevision: w.contractEconomy.revision, transaction });
function transact(w, transaction) {
  const before = json(w), command = envelope(w, transaction), preview = quoteEconomyCommand(freeze(w), command);
  expect(preview.ok, preview.error).toBe(true);
  const r = reduceEconomyCommand(w, command); expect(r.ok, r.error).toBe(true); expect(w).toEqual(before);
  const restored = json(r.world), replay = reduceEconomyCommand(restored, command);
  expect(replay.ok, replay.error).toBe(true); expect(replay.replayed).toBe(true); expect(replay.world).toBe(restored);
  return r.world;
}

describe('real legacy fields through opening employment and native renewal', () => {
  it.each([2025, 2026])('preserves signed=%i evidence through projection, rollover, trade, conversion, renewal and reload', signed => {
    let w = projection(fixture(signed)), c = ledger(w).records.find(r => r.contract.playerId === 'player-a').contract;
    const last = signed === 2026 ? 2029 : 2028, future = last - 2026, evidence = json(c);
    expect(c).toMatchObject({ guaranteeStatus: 'unknown', endSeason: last, carriedFutureYears: future,
      sourceFields: { salary: 1000, contractYears: 3, contractYearsLeft: 3, contractSignedYear: signed } });
    expect(c).not.toHaveProperty('signedSeason'); expect(c).not.toHaveProperty('termYears');
    expect(player(w)).toMatchObject(original(signed));
    expect(contractLiabilityRows(ledger(w)).filter(r => r.playerId === 'player-a').map(r => [r.season, r.amountManYen]))
      .toEqual(Array.from({ length: future }, (_, i) => [2027 + i, 1000]));
    w = projection(at(w, 2027)); expect(player(w)).toMatchObject({ contractYears: 3, contractSignedYear: signed, contractYearsLeft: future });
    expect(contractEntries(w.teams[0], [], 2027).find(e => e.player.id === 'player-a').state).toBe('continuing');
    w = at(w, 2027, 'season');
    w = transact(w, { id: 'trade', type: 'trade', fromId: 0, toId: 1, outgoingIds: ['player-a'], incomingIds: ['player-b'], cashManYen: 0, mode: 'spend' });
    expect(w.teams[1].farm.concat(w.teams[1].players).some(p => p.id === 'player-a')).toBe(true);
    expect(player(w)).toMatchObject({ salary: 1000, contractYears: 3, contractSignedYear: signed, contractYearsLeft: future });
    expect(contractLiabilityRows(ledger(w)).filter(r => r.playerId === 'player-a' && r.season === 2027).map(r => [r.teamId, r.amountManYen])).toEqual([[0, 500], [1, 500]]);
    const dev = player(w, 'development'), devEvidence = json(ledger(w).records.find(r => r.contract.playerId === dev.id).contract);
    w = transact(w, { id: 'conversion', type: 'convert-to-controlled', teamId: 0, playerId: dev.id, contractId: dev.contractId, annualSalaryManYen: 1200 });
    expect(player(w, dev.id)).toMatchObject({ salary: 1200, contractYears: 7, contractSignedYear: 2026, contractYearsLeft: 7, isIkusei: false, 育成: false });
    expect(contractEmploymentAt(ledger(w), '2027-07-01').find(e => e.contract.playerId === dev.id)).toMatchObject({ teamId: 0, registrationType: 'controlled', annualSalaryManYen: 1200 });
    expect(contractLiabilityRows(ledger(w)).find(r => r.playerId === dev.id && r.season === 2027).amountManYen).toBe(1100);
    expect(ledger(w).records.find(r => r.contract.playerId === dev.id).contract).toEqual(devEvidence);
    w = projection(at(w, last, 'season')); expect(player(w).contractYearsLeft).toBe(1);
    expect(contractEntries(w.teams[1], [], last).find(e => e.player.id === 'player-a').state).toBe('actionable');
    const proposal = { id: 'renewal', type: 'sign', teamId: 1, effectiveDate: `${last + 1}-02-01`,
      contract: createSeasonContract({ contractId: 'native-a', playerId: 'player-a', signedSeason: last, agreementPhase: 'season', purpose: 'renewal', termYears: 2,
        annualSalaryManYen: 1500, guaranteed: true, registrationType: 'controlled' }) };
    w = transact(w, { id: 'offer-renewal', type: 'offer-renewal', contractId: c.openingId, proposal });
    w = transact(w, { id: 'accept-renewal', type: 'accept-renewal', contractId: c.openingId, proposalId: proposal.id });
    expect(player(w)).toMatchObject({ contractYears: 3, contractSignedYear: signed, contractYearsLeft: 1, salary: 1000 });
    expect(ledger(w).records.filter(r => r.contract.playerId === 'player-a')).toHaveLength(2);
    w = projection(at(w, last + 1));
    expect(player(w)).toMatchObject({ contractId: 'native-a', salary: 1500, contractYears: 2, contractYearsLeft: 2, contractSignedYear: last });
    expect(ledger(w).records.find(r => r.contract.openingId === c.openingId).contract).toEqual(evidence);
    expect(contractLiabilityRows(ledger(w)).filter(r => r.contractId === 'native-a').map(r => [r.teamId, r.season, r.amountManYen]))
      .toEqual([[1, last + 1, 1500], [1, last + 2, 1500]]);
    const restored = projection(json(w)); expect(restored).toEqual(w); expect(ledger(restored).records).toHaveLength(4);
    expect(contractEntries(restored.teams[1], [], last + 1).find(e => e.player.id === 'player-a').state).toBe('continuing');
  });
  it('reprojects recorded term/signature metadata from opening evidence instead of stale roster fields', () => {
    const w = fixture(); player(w).contractYears = 7; player(w).contractSignedYear = 2026;
    const next = projection(w);
    expect(player(next)).toMatchObject({ contractYears: 3, contractSignedYear: 2025 });
  });
  it('does not preserve unsupported term/signature fields when the opening evidence has neither', () => {
    const w = fixture(), c = ledger(w).records.find(r => r.contract.playerId === 'player-a').contract;
    delete c.sourceFields.contractYears; delete c.sourceFields.contractSignedYear;
    const next = projection(w);
    expect(player(next)).not.toHaveProperty('contractYears'); expect(player(next)).not.toHaveProperty('contractSignedYear');
    expect(player(next).contractYearsLeft).toBe(3); expect(c.guaranteeStatus).toBe('unknown');
  });
});
