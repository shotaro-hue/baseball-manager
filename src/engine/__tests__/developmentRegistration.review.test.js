import { expect, it } from 'vitest';
import { developmentFixture } from './fixtures/developmentWorld';
import { pendingDevelopmentFixture } from './fixtures/pendingDevelopmentWorld';
import { economyPolicy, renewalEnvelope } from './fixtures/economyWorld';
import { claim, own, player, protect, run, settle, spring, terms } from './faPersonnelFixtures';
import { createAnnualNewGameWorld, fromAnnualState, toAnnualState, reduceEconomyCommand } from '../contractEconomy';
import { developmentRequest, previewDevelopmentRegistration, reduceDevelopmentRequest } from '../developmentRegistration';
import { validateEconomySave } from '../economyPersistence';
import { quoteAnnualSpendingPlan } from '../annualSpending';

const send = (world, transaction) => {
  const result = reduceEconomyCommand(world, { saveId: world.saveId, epoch: world.contractEconomy.epoch,
    baseRevision: world.contractEconomy.revision, transaction });
  expect(result.ok, result.error).toBe(true); return result.world;
};

// Club 1: b + one rookie + one incoming FA + reserve (personnel compensation).
// All pending histories are created through the real transaction reducer.
function mixedWorld(occupied) {
  let state = claim(run(protect(), settle()), 'incoming', 2, {}, 'A', 1);
  state = run(state, { id: 'settle-incoming', type: 'settle-fa-compensation', proposalId: 'incoming', teamId: 2, method: 'cash-only' });
  state.draftContext = { draftPool: [player('rookie', { salary: 600 })], drafted: { rookie: 1 }, confirmedPicks: {} };
  state = run(state, { id: 'reserve-rookie', type: 'reserve-rookie', proposal: { id: 'rookie-offer', type: 'sign', teamId: 1,
    effectiveDate: '2027-02-01', contract: terms('rookie', { agreementPhase: 'offseason', termYears: 1, annualSalaryManYen: 600 }) } });
  // Retained draft results for a departing player must not reserve a second slot.
  state.draftContext.draftPool.push(player('reserve'));
  state.draftContext.drafted.reserve = 0;
  // A duplicate accepted rookie snapshot must also reserve only one slot.
  state.draftContext.draftPool.push({ ...state.draftContext.draftPool[0] });
  own(state, 0, 1, { isIkusei: true, 育成: true, salary: 240 },
    { signedSeason: 2027, registrationType: 'development', annualSalaryManYen: 240 });
  for (let i = 4; i < occupied; i++) own(state, `filler-${i}`, 1);
  state = spring(state);
  const teams = state.teams.map(t => ({ ...t, players: t.players.map(p => ({ ...p, contractYearsLeft: 3 })),
    farm: t.farm.map(p => ({ ...p, contractYearsLeft: 3 })) }));
  const policy = economyPolicy(teams, 2027, 200000);
  const world = createAnnualNewGameWorld({ teams, faPool: [], myId: 1, saveId: 'development-review', season: 2027,
    policy, randomRoot: { algorithmVersion: 1, seed: 'development-review' } });
  world.offseasonPlan = { year: 2027, draftResult: { pool: state.draftContext.draftPool, drafted: state.draftContext.drafted } };
  Object.assign(world.contractEconomy.engine,
    Object.fromEntries(['transactions', 'acquisitions', 'faProtectionLists', 'faPersonnelMoves', 'faCompensationStandings'].map(k => [k, state[k]])),
    { spending: { ...state.spending, authorizations: [...state.spending.authorizations.filter(a => a.season === 2026), ...policy.authorizations] } });
  // Imported historical ledger has no native initial-sign birth evidence.
  delete world.contractEconomy.engine.faExerciseOrigins; delete world.contractEconomy.faExerciseBirth;
  world.contractEconomy.budgetPolicies = world.contractEconomy.engine.spending.authorizations.map(({ teamId, season, approvedManYen }) =>
    ({ teamId, season, approvedManYen, policyVersion: 'explicit-test-policy' }));
  return fromAnnualState(world, toAnnualState(world));
}

const joins = {
  rookie: { id: 'join-rookie', type: 'join-rookie', proposalId: 'rookie-offer' },
  fa: { id: 'join-fa', type: 'join-fa', proposalId: 'incoming' },
  personnel: { id: 'join-personnel', type: 'join-fa-personnel', proposalId: 'bid' },
};

it.each([
  [], ['rookie'], ['fa'], ['personnel'], ['rookie', 'fa'], ['rookie', 'personnel'], ['fa', 'personnel'], ['rookie', 'fa', 'personnel'],
].flatMap(joined => [69, 70].map(occupied => ({ joined, occupied }))))('agrees with engine at the mixed pending/joined boundary: %j', ({ joined, occupied }) => {
  let world = mixedWorld(occupied);
  for (const kind of joined) world = send(world, joins[kind]);
  expect(validateEconomySave(world)).toBe('annual');
  const before = JSON.stringify(world), preview = previewDevelopmentRegistration(world, 0);
  const result = reduceDevelopmentRequest(world, developmentRequest(world, 0));
  expect(preview.ok, preview.error).toBe(occupied === 69);
  expect(result.ok, result.error).toBe(occupied === 69);
  if (occupied === 69) {
    expect(preview.occupiedCount).toBe(69);
    const team = result.world.teams.find(t => t.id === 1);
    expect(team.farm.find(p => p.id === 0)).toMatchObject({ isIkusei: false, salary: 420 });
    expect(validateEconomySave(result.world)).toBe('annual');
  } else expect(result.world).toBe(world);
  expect(JSON.stringify(world)).toBe(before);
});

it.each(['fa', 'personnel'])('counts a %s join once after roster adoption', kind => {
  let world = pendingDevelopmentFixture(kind);
  const before = previewDevelopmentRegistration(world, 0).occupiedCount;
  world = send(world, { ...joins[kind], proposalId: 'bid' });
  expect(validateEconomySave(world)).toBe('annual');
  expect(previewDevelopmentRegistration(world, 0).occupiedCount).toBe(kind === 'fa' ? 3 : 2);
  expect(previewDevelopmentRegistration(world, 0).occupiedCount).toBe(before);
});

it('excludes the candidate and counts only an unowned controlled rookie reservation', () => {
  for (const development of [false, true]) {
    let world = developmentFixture();
    world.offseasonPlan = { year: 2026, draftResult: { pool: [player('rookie', { isIkusei: development })], drafted: { rookie: 0 } } };
    world = fromAnnualState(world, toAnnualState(world));
    expect(previewDevelopmentRegistration(world, 0).occupiedCount).toBe(development ? 1 : 2);
  }
});

it('rejects the quoted request after another real contract changes budget/revision', () => {
  const world = developmentFixture(), request = developmentRequest(world, 0);
  expect(previewDevelopmentRegistration(world, 0).ok).toBe(true);
  const command = renewalEnvelope(world);
  command.transaction.proposal.contract.playerId = 'active-0';
  const changed = reduceEconomyCommand(world, command);
  expect(changed.ok, changed.error).toBe(true);
  const remaining = w => quoteAnnualSpendingPlan(toAnnualState(w).spending).find(r => r.teamId === 0 && r.season === 2027).remainingManYen;
  expect(remaining(changed.world)).toBe(remaining(world) - 1180);
  const snapshot = JSON.stringify(changed.world), result = reduceDevelopmentRequest(changed.world, request);
  expect(result).toMatchObject({ ok: false, world: changed.world });
  expect(result.error).toContain('状態が変更');
  expect(JSON.stringify(changed.world)).toBe(snapshot);
  expect(previewDevelopmentRegistration(changed.world, 0).ok).toBe(true);
});

it.each(['salary', 'term', 'capacity', 'deadline', 'epoch'])('rechecks %s after a successful quote', change => {
  const before = developmentFixture({ count: change === 'capacity' ? 69 : 1 });
  const request = developmentRequest(before, 0);
  expect(previewDevelopmentRegistration(before, 0).ok).toBe(true);
  let current = change === 'capacity' ? developmentFixture({ count: 70 }) : structuredClone(before);
  const record = current.contractEconomy.engine.spending.ledger.records.find(r => r.contract.playerId === 0);
  if (change === 'salary') record.contract.annualSalaryManYen = 600;
  if (change === 'term') { record.contract.termYears = 2; record.contract.endSeason = 2027; }
  if (change === 'deadline') {
    current.contractEconomy.clock.date = '2026-08-01'; current.schedule[1].date = { month: 8, day: 1 };
  }
  if (change === 'epoch') current.contractEconomy.epoch = 'new-epoch';
  // Contract/roster writes advance revision; clock-only changes are checked again by the reducer.
  if (['salary', 'term', 'capacity'].includes(change)) current.contractEconomy.revision++;
  current = fromAnnualState(current, toAnnualState(current));
  expect(validateEconomySave(current)).toBe('annual');
  const snapshot = JSON.stringify(current), result = reduceDevelopmentRequest(current, request);
  expect(result).toMatchObject({ ok: false, world: current });
  expect(JSON.stringify(current)).toBe(snapshot);
  const preview = previewDevelopmentRegistration(current, 0);
  if (change === 'salary') expect(preview).toMatchObject({ ok: true, salary: 600 });
  if (change === 'term') expect(preview).toMatchObject({ ok: true, endSeason: 2027 });
  if (['capacity', 'deadline'].includes(change)) expect(preview.ok).toBe(false);
});
