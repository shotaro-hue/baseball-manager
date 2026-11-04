import { expect, it } from 'vitest';
import { postingWinter, postingCommand } from './fixtures/postingDepartures';
import { completion } from './fixtures/postingIncome';
import { envelope } from './fixtures/faDeclarations';
import { freezeEconomy, economyPolicy, renewalEnvelope } from './fixtures/economyWorld';
import { reduceEconomyCommand, quoteEconomyCommand, toAnnualState, fromAnnualState, createAnnualNewGameWorld } from '../contractEconomy';
import { validateEconomySave, economyOverwriteIssue } from '../economyPersistence';
import { createInitialTeams } from '../bootstrapTeams';
import { isIkuseiPlayer } from '../rosterCapacity';
import { playableClub, inSeasonWorld, nextSeasonForDepartureTest } from './fixtures/inSeasonDepartures';
import { reserve, winter } from './fixtures/annualRetirements';
import { reduceRenewalRequest, renewalRequest } from '../renewalDecisions';
import { createSeasonContract } from '../seasonContract';
import { postingApplicationViews } from '../annualPostingApplications';

const engine = w => w.contractEconomy.engine;
const request = (w, extra = {}, teamId = 0, playerId = 0) => envelope(w, { id: 'request', type: 'request-posting', teamId, playerId,
  contractId: [...w.teams.find(t => t.id === teamId).players, ...w.teams.find(t => t.id === teamId).farm].find(p => p.id === playerId)?.contractId, ...extra });
const decide = (w, decision = 'approve', extra = {}) => envelope(w, { id: 'decision', type: 'decide-posting', requestId: 'request', decision, ...extra });
const apply = (w, c) => { const r = reduceEconomyCommand(w, c); expect(r.ok, r.error).toBe(true); return r.world; };
const deny = (w, c) => { const before = structuredClone(w); freezeEconomy(w); expect(quoteEconomyCommand(w, c).ok).toBe(false);
  expect(reduceEconomyCommand(w, c)).toMatchObject({ ok: false, world: w }); expect(w).toEqual(before); };
const renewal = w => { const c = renewalEnvelope(w); c.transaction.proposal.contract = createSeasonContract({ ...c.transaction.proposal.contract, agreementPhase: 'offseason' }); return c; };
const views = w => postingApplicationViews(toAnnualState(w));

it.each(['approve', 'reject'])('records explicit wish and exactly one GM %s without altering money or employment', decision => {
  const w = postingWinter(); w.teams[0].players[0].postingRequested = false;
  const c = request(w, { id: 0 }), first = apply(freezeEconomy(w), c);
  expect(quoteEconomyCommand(w, c).ok).toBe(true);
  expect(views(first)).toEqual([expect.objectContaining({ id: 0, status: 'pending', playerId: 0, teamId: 0, season: 2026 })]);
  expect(first.teams[0].players[0].postingRequested).toBe(true);
  const d = decide(first, decision, { requestId: 0 }), next = apply(first, d);
  expect(views(next)[0].status).toBe(decision === 'approve' ? 'approved' : 'rejected');
  expect(engine(next).spending).toEqual(engine(w).spending);
  expect(next.contractEconomy.incomeReceipts).toEqual(w.contractEconomy.incomeReceipts);
  expect(next.contractEconomy.budgetPolicies).toEqual(w.contractEconomy.budgetPolicies);
  expect(next.teams).toEqual(first.teams); expect(next.faPool).toEqual(w.faPool);
  expect(validateEconomySave(JSON.parse(JSON.stringify(next)))).toBe('annual');
  expect(economyOverwriteIssue(first, next)).toBeNull();
  expect(reduceEconomyCommand(next, c)).toMatchObject({ ok: true, replayed: true, world: next });
  expect(reduceEconomyCommand(next, d)).toMatchObject({ ok: true, replayed: true, world: next });
  deny(next, decide(next, decision, { id: 'again', requestId: 0 }));
  deny(next, decide(next, decision === 'approve' ? 'reject' : 'approve', { requestId: 0 }));
  deny(next, request(next, { id: 'another' }));
  deny(next, postingCommand(next)); deny(next, completion(next));
});

it.each([{ contractId: 'wrong' }, { teamId: 1 }, { playerId: 1 }, { id: '' }, { chance: .9 }, { playerId: '0' }])('rejects malformed request %j', extra => {
  const w = postingWinter(); deny(w, request(w, extra));
});
it.each([{ decision: 'accept' }, { requestId: 'absent' }, { teamId: 0 }, { id: '' }])('rejects malformed decision %j', extra => {
  const w = apply(postingWinter(), request(postingWinter())); deny(w, decide(w, 'approve', extra));
});
it('rejects wrong clock, development, pending renewal, retired and ID type collision', () => {
  let w = postingWinter(); w.contractEconomy.clock.date = '2026-12-02'; deny(w, request(w));
  w = postingWinter(); w.teams[0].players[0].isRetired = true; deny(w, request(w));
  const club = playableClub(); club.players[0].isIkusei = true;
  w = postingWinter({ teams: [club, playableClub(1)] }); deny(w, request(w));
  w = postingWinter({ years: 1 }); const held = apply(w, renewal(w)); deny(held, request(held));
  w = postingWinter(); const first = apply(w, request(w, { id: 0 })); deny(first, decide(first, 'approve', { id: '0', requestId: 0 }));
});
it('rejects stale command and prevents active requests from conflicting with renewals or departures', () => {
  const w = postingWinter({ years: 1 }), c = request(w), first = apply(w, c);
  deny(first, { ...decide(first), baseRevision: 0 });
  deny(first, renewal(first)); deny(first, postingCommand(first));
  const rejected = apply(first, decide(first, 'reject'));
  expect(reduceEconomyCommand(rejected, renewal(rejected)).ok).toBe(true);
});
it('keeps missing old extension readable and does not change old explicit completion', () => {
  const w = postingWinter(); expect(engine(w)).not.toHaveProperty('postingApplications');
  expect(validateEconomySave(w)).toBe('annual'); expect(reduceEconomyCommand(w, completion(w)).ok).toBe(true);
});
it.each([
  w => { engine(w).postingApplications.pop(); },
  w => { engine(w).transactions.pop(); },
  w => { engine(w).postingApplications[0].sourceContractId = 'wrong'; },
  w => { engine(w).postingApplications[1].decision = 'reject'; },
  w => { engine(w).postingApplications.push({ ...engine(w).postingApplications[0], id: 'forged' }); },
])('rejects orphan, forged and duplicate evidence after JSON', edit => {
  const w = postingWinter(), first = apply(w, request(w)), bad = JSON.parse(JSON.stringify(apply(first, decide(first)))); edit(bad);
  expect(() => validateEconomySave(bad)).toThrow();
});
it('preserves published application history even when both event and receipt are deleted', () => {
  const w = postingWinter(), first = apply(w, request(w)), bad = structuredClone(first);
  engine(bad).postingApplications = []; engine(bad).transactions = []; bad.contractEconomy.revision++;
  expect(economyOverwriteIssue(first, bad)).toBe('economy_history_conflict');
});
it('accepts an actual initial controlled roster request, rejects an actual development roster request', () => {
  const teams = createInitialTeams(), policy = economyPolicy(teams, 2026, 10000000);
  let w = createAnnualNewGameWorld({ teams, faPool: [], myId: teams[0].id, saveId: 'actual', season: 2026,
    policy, randomRoot: { algorithmVersion: 1, seed: 'actual' } });
  w.contractEconomy.clock = { season: 2026, phase: 'offseason', date: '2026-12-01', offseasonTurn: 0 };
  w.contractEconomy.cycle = { season: 2026, stage: 'offseason-open', transitionReceipts: [] };
  engine(w).spending.budgetSeason = 2027;
  const tail = economyPolicy(teams, 2027, 10000000), last = rows => rows.filter(r => r.season === 2034);
  engine(w).spending.authorizations.push(...last(tail.authorizations)); engine(w).rosterRequirements.push(...last(tail.rosterRequirements));
  w.contractEconomy.budgetPolicies.push(...last(tail.budgetPolicies)); w = fromAnnualState(w, toAnnualState(w));
  const controlled = w.teams[0].players.find(p => !isIkuseiPlayer(p)), development = w.teams.flatMap(t => [...t.players, ...t.farm].filter(isIkuseiPlayer).map(p => ({ t, p })))[0];
  expect(development).toBeDefined();
  deny(structuredClone(w), request(w, {}, development.t.id, development.p.id));
  const next = apply(w, request(w, {}, 0, controlled.id));
  expect(views(next)[0].status).toBe('pending'); expect(validateEconomySave(JSON.parse(JSON.stringify(next)))).toBe('annual');
});

it('rejects retirement reservations and accepted future renewals, without inferring eligibility from serviceYears', () => {
  const season = inSeasonWorld(), reserved = apply(season, reserve(season));
  const retired = winter(reserved); deny(retired, request(retired));
  const w = postingWinter({ years: 1 }), offered = apply(w, renewal(w));
  const promised = apply(offered, envelope(offered, { id: 'accept', type: 'accept-renewal', proposalId: 'renewal', contractId: w.teams[0].players[0].contractId }));
  deny(promised, request(promised));
  const unknown = postingWinter(); delete unknown.teams[0].players[0].age; delete unknown.teams[0].players[0].serviceYears;
  expect(views(apply(unknown, request(unknown)))[0].status).toBe('pending');
});
it('rejects an unresolved human renewal before recording a request', () => {
  const w = postingWinter({ years: 1 });
  const pending = reduceRenewalRequest(w, renewalRequest(w, { type: 'offer', playerId: 0, salary: 1200, years: 1 }));
  expect(pending.ok, pending.error).toBe(true); deny(pending.world, request(pending.world));
});
it('retains a rejected application after a legitimate winter departure and replays its decision', () => {
  const w = postingWinter({ years: 1 }), first = apply(w, request(w)), c = decide(first, 'reject'), rejected = apply(first, c);
  const departed = apply(rejected, envelope(rejected, { id: 'expire', type: 'enter-market', reason: 'expiry', teamId: 0, playerId: 0, contractId: w.teams[0].players[0].contractId }));
  expect(validateEconomySave(JSON.parse(JSON.stringify(departed)))).toBe('annual');
  expect(reduceEconomyCommand(departed, c)).toMatchObject({ ok: true, replayed: true });
});
it('retains rejected historical requests across years and blocks an unresolved application from rolling forward', () => {
  const teams = [playableClub(), playableClub(1)]; teams.forEach(t => [...t.players, ...t.farm].forEach(p => { p.contractYearsLeft = 3; }));
  const w = postingWinter({ teams }), first = apply(w, request(w)), rejected = apply(first, decide(first, 'reject'));
  expect(() => nextSeasonForDepartureTest(first)).toThrow();
  const next = nextSeasonForDepartureTest(rejected);
  expect(validateEconomySave(JSON.parse(JSON.stringify(next)))).toBe('annual');
  expect(views(next)[0].status).toBe('rejected');
});
it('accepts a controlled farm request and keeps all placements, health and morale', () => {
  const w = postingWinter(), p = w.teams[0].farm[0], before = structuredClone(w.teams[0]);
  const next = apply(w, request(w, {}, 0, p.id));
  expect(next.teams[0].players).toEqual(before.players);
  expect(next.teams[0].farm).toEqual(before.farm.map(v => v.id === p.id ? { ...v, postingRequested: true } : v));
  expect(next.teams[0].lineup).toEqual(before.lineup);
});
