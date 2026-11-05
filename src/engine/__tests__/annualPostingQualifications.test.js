import { envelope } from './fixtures/faDeclarations';
import { expect, it } from 'vitest';
import { approvedPostingWorld, qualificationCommand, qualificationFacts, legacyQualificationWorld } from './fixtures/postingQualifications';
import { postingWinter, postingCommand } from './fixtures/postingDepartures';
import { postingRequest, postingDecision } from './fixtures/postingApplications';
import { completion } from './fixtures/postingIncome';
import { reduceEconomyCommand, quoteEconomyCommand, fromAnnualState, toAnnualState } from '../contractEconomy';
import { validateEconomySave, economyOverwriteIssue } from '../economyPersistence';
import { freezeEconomy } from './fixtures/economyWorld';
import { createInitialTeams } from '../bootstrapTeams';
import { createPostingQualificationProducer } from '../../data/postingQualificationFacts';
import { initializePlayerEligibility } from '../playerEligibility';
import { gamePostingQualificationFacts } from '../postingQualificationSnapshot';
import { inspectAnnualPostingQualifications } from '../annualPostingQualifications';
import { legacyQualificationFacts } from './fixtures/postingQualifications';

const engine = w => w.contractEconomy.engine;
const apply = (w, c) => { const r = reduceEconomyCommand(w, c); expect(r.ok, r.error).toBe(true); return r.world; };
const deny = (w, c) => {
  const before = structuredClone(w); freezeEconomy(w);
  expect(quoteEconomyCommand(w, c).ok).toBe(false);
  expect(reduceEconomyCommand(w, c)).toMatchObject({ ok: false, world: w }); expect(w).toEqual(before);
};

it('refuses fresh v1 unknown issuance and v2 facts contradicting the fixed player', () => {
  const w = approvedPostingWorld();
  deny(w, qualificationCommand(w, { facts: { ...legacyQualificationFacts(), professionalSeasons: null } }));
  const p = w.teams[0].players[0];
  const facts = gamePostingQualificationFacts({ ...p, birthDate: '1990-01-01', proStartYear: 2010 }, 2026);
  deny(w, qualificationCommand(w, { facts }));
});

it('records deterministic v2 game rules while retaining v1 snapshots and detached historical ownership', () => {
  const w = approvedPostingWorld();
  const player = initializePlayerEligibility({ ...w.teams[0].players[0], birthDate: '2000-01-01', proStartYear: 2021 }, { year: 2026 });
  const facts = gamePostingQualificationFacts(player, 2026);
  const next = apply(w, qualificationCommand(w, { facts }));
  expect(engine(next).postingQualifications[0].assessment).toMatchObject({ ruleVersion: 2, exemption: 'exempt', professionalYears: 6 });
  expect(validateEconomySave(JSON.parse(JSON.stringify(next)))).toBe('annual');
  const state = toAnnualState(next);
  state.teams[0].players = state.teams[0].players.filter(p => p.id !== player.id);
  expect(inspectAnnualPostingQualifications(state)).toEqual(engine(next).postingQualifications);
});

it('records an approved synthetic snapshot without granting a departure, changing finances or consuming RNG', () => {
  const w = approvedPostingWorld(), c = qualificationCommand(w), old = structuredClone(w), next = apply(freezeEconomy(w), c);
  const r = engine(next).postingQualifications[0];
  expect(quoteEconomyCommand(w, c).ok).toBe(true);
  expect(r).toMatchObject({ id: 'qualification', version: 1, requestId: 'request', season: 2026,
    teamId: 0, playerId: 0, sourceContractId: w.teams[0].players[0].contractId, recordedDate: '2026-12-01',
    assessment: { exemption: 'exempt', professionalYears: 6, ageYears: 26, ruleVersion: 2 } });
  expect(JSON.parse(r.sourceKey)).toEqual([w.saveId, w.contractEconomy.epoch, 'posting-qualification', 'request']);
  expect(next.teams).toEqual(old.teams); expect(next.faPool).toEqual(old.faPool);
  for (const key of ['spending', 'postingApplications']) expect(engine(next)[key]).toEqual(engine(old)[key]);
  for (const key of ['budgetPolicies', 'incomeReceipts', 'randomRoot', 'clock', 'decisions']) expect(next.contractEconomy[key]).toEqual(old.contractEconomy[key]);
  expect(w).toEqual(old); expect(next.contractEconomy.revision).toBe(w.contractEconomy.revision + 1);
  c.transaction.facts.birthDate.date = '1990-01-01'; expect(r.facts.birthDate.date).toBe('2000-01-01');
  expect(validateEconomySave(JSON.parse(JSON.stringify(next)))).toBe('annual');
  expect(fromAnnualState(next, toAnnualState(next)).contractEconomy).toEqual(next.contractEconomy);
  deny(next, postingCommand(next)); deny(next, completion(next));
});

it('replays the same ID and rejects a replacement ID, changed facts or stale new request', () => {
  const w = approvedPostingWorld(), c = qualificationCommand(w), next = apply(w, c);
  expect(reduceEconomyCommand(next, c)).toMatchObject({ ok: true, replayed: true, world: next });
  deny(next, qualificationCommand(next, { id: 'second' }));
  const changed = qualificationCommand(next); changed.transaction.facts.birthDate.date = '1990-01-01'; deny(next, changed);
  deny(w, { ...qualificationCommand(w), baseRevision: 0 });
});

it('requires an approved current application and exact runtime/source identities', () => {
  const w = postingWinter(); deny(w, qualificationCommand(w));
  const pending = apply(w, postingRequest(w)); deny(pending, qualificationCommand(pending));
  const rejected = apply(pending, postingDecision(pending, 'reject')); deny(rejected, qualificationCommand(rejected));
  for (const extra of [{ playerId: '0' }, { sourcePlayerId: 'wrong-source' }]) {
    const approved = approvedPostingWorld(); deny(approved, qualificationCommand(approved, { facts: { ...qualificationFacts(), ...extra } }));
  }
  const approved = approvedPostingWorld(); deny(approved, qualificationCommand(approved, { requestId: 'absent' }));
  deny(approved, qualificationCommand(approved, { score: 100 }));
  deny(approved, { ...qualificationCommand(approved), saveId: 'other-save' });
  deny(approved, { ...qualificationCommand(approved), epoch: 'other-epoch' });
});

it.each([[0, 'unknown', null], [1, 'restricted', 0], [2, 'unknown', 0]])(
  'restores/replays frozen v1 missing, zero and stale history %s', (index, exemption, knownRecognizedSeasons) => {
  const next = legacyQualificationWorld(index), record = engine(next).postingQualifications[0];
  expect(validateEconomySave(JSON.parse(JSON.stringify(next)))).toBe('annual');
  expect(record.assessment).toMatchObject({ exemption, knownRecognizedSeasons, ruleVersion: 1 });
  const receipt = engine(next).transactions.at(-1), command = JSON.parse(receipt.signature);
  expect(reduceEconomyCommand(next, envelope(next, command))).toMatchObject({ ok: true, replayed: true });
  const bad = structuredClone(next); engine(bad).postingQualifications[0].assessment.exemption = 'forged';
  expect(() => validateEconomySave(bad)).toThrow();
});

it.each([
  w => { engine(w).postingQualifications[0].assessment.exemption = 'restricted'; },
  w => { engine(w).postingQualifications[0].facts.proStart.year = 9999; },
  w => { engine(w).postingQualifications[0].sourceKey = 'wrong'; },
  w => { engine(w).postingQualifications[0].recordedDate = '2026-11-30'; },
  w => { engine(w).postingQualifications[0].sourceContractId = 'wrong'; },
  w => { engine(w).postingQualifications[0].requestId = 'wrong'; },
  w => { engine(w).postingQualifications.push({ ...engine(w).postingQualifications[0], id: 'duplicate' }); },
  w => { engine(w).transactions.pop(); },
  w => { delete engine(w).postingQualifications; },
  w => { engine(w).postingQualifications = null; },
  w => { w.teams[0].players[0].realPlayerId = 'changed-source'; },
])('rejects unpaired, forged and substituted snapshot evidence after JSON reload', edit => {
  const w = approvedPostingWorld(), next = apply(w, qualificationCommand(w)), bad = JSON.parse(JSON.stringify(next)); edit(bad);
  expect(() => validateEconomySave(bad)).toThrow();
});

it('retains published history even when both snapshots and signatures are deleted or consistently rewritten', () => {
  const w = approvedPostingWorld(), c = qualificationCommand(w), next = apply(w, c), deleted = structuredClone(next);
  delete engine(deleted).postingQualifications; engine(deleted).transactions.pop(); deleted.contractEconomy.revision++;
  expect(validateEconomySave(deleted)).toBe('annual'); expect(economyOverwriteIssue(next, deleted)).toBe('economy_history_conflict');
  const changed = structuredClone(next), facts = qualificationFacts(); facts.birthDate.date = '1990-01-01';
  const corrected = structuredClone(w); corrected.teams[0].players[0].birthDate = '1990-01-01';
  const rewritten = apply(corrected, qualificationCommand(corrected, { facts }));
  changed.contractEconomy = rewritten.contractEconomy; changed.contractEconomy.revision++;
  expect(validateEconomySave(changed)).toBe('annual'); expect(economyOverwriteIssue(next, changed)).toBe('economy_history_conflict');
});

it('leaves old annual saves without the optional collection readable', () => {
  const w = postingWinter(); expect(engine(w)).not.toHaveProperty('postingQualifications');
  expect(validateEconomySave(w)).toBe('annual'); expect(reduceEconomyCommand(w, completion(w)).ok).toBe(true);
});

it('uses actual generated real-player identities and birth facts with deterministic game years', () => {
  let w = postingWinter({ teams: createInitialTeams() }); const produce = createPostingQualificationProducer();
  for (const [i, realPlayerId, exemption] of [[0, 'npb:21625150', 'restricted'], [1, 'npb:21325134', 'exempt']]) {
    const team = w.teams.find(t => [...t.players, ...t.farm].some(p => p.realPlayerId === realPlayerId));
    const p = [...team.players, ...team.farm].find(p => p.realPlayerId === realPlayerId), requestId = 'real-request-' + i;
    w = apply(w, envelope(w, { id: requestId, type: 'request-posting', teamId: team.id, playerId: p.id, contractId: p.contractId }));
    w = apply(w, envelope(w, { id: 'real-approve-' + i, type: 'decide-posting', requestId, decision: 'approve' }));
    w = apply(w, qualificationCommand(w, { id: 'real-qualification-' + i, requestId, facts: produce(p, 2026) }));
    expect(engine(w).postingQualifications.at(-1).assessment).toMatchObject({ exemption, ruleVersion: 2 });
  }
  expect(validateEconomySave(JSON.parse(JSON.stringify(w)))).toBe('annual');
});
