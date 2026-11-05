import { expect, it } from 'vitest';
import { approvedPostingWorld, qualificationCommand, qualificationFacts } from './fixtures/postingQualifications';
import { postingWinter, postingCommand } from './fixtures/postingDepartures';
import { postingRequest, postingDecision } from './fixtures/postingApplications';
import { completion } from './fixtures/postingIncome';
import { envelope } from './fixtures/faDeclarations';
import { reduceEconomyCommand, quoteEconomyCommand, fromAnnualState, toAnnualState } from '../contractEconomy';
import { validateEconomySave, economyOverwriteIssue } from '../economyPersistence';
import { freezeEconomy } from './fixtures/economyWorld';
import { createInitialTeams } from '../bootstrapTeams';
import { createPostingQualificationProducer } from '../../data/postingQualificationFacts';

const engine = w => w.contractEconomy.engine;
const apply = (w, c) => { const r = reduceEconomyCommand(w, c); expect(r.ok, r.error).toBe(true); return r.world; };
const deny = (w, c) => {
  const before = structuredClone(w); freezeEconomy(w);
  expect(quoteEconomyCommand(w, c).ok).toBe(false);
  expect(reduceEconomyCommand(w, c)).toMatchObject({ ok: false, world: w }); expect(w).toEqual(before);
};

it('records an approved synthetic snapshot without granting a departure, changing finances or consuming RNG', () => {
  const w = approvedPostingWorld(), c = qualificationCommand(w), old = structuredClone(w), next = apply(freezeEconomy(w), c);
  const r = engine(next).postingQualifications[0];
  expect(quoteEconomyCommand(w, c).ok).toBe(true);
  expect(r).toMatchObject({ id: 'qualification', version: 1, requestId: 'request', season: 2026,
    teamId: 0, playerId: 0, sourceContractId: w.teams[0].players[0].contractId, recordedDate: '2026-12-01',
    assessment: { exemption: 'exempt', knownRecognizedSeasons: 6, ageYears: 26, ruleVersion: 1 } });
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

it.each([
  [null, 'unknown', null],
  [{ asOfDate: '2026-12-01', coverage: 'complete', ruleId: 'synthetic-v1', seasons: [] }, 'restricted', 0],
  [{ asOfDate: '2026-11-30', coverage: 'complete', ruleId: 'synthetic-v1', seasons: [] }, 'unknown', 0],
])('preserves missing, complete-zero and stale snapshots %j', (professionalSeasons, exemption, knownRecognizedSeasons) => {
  const w = approvedPostingWorld(), next = apply(w, qualificationCommand(w, { facts: { ...qualificationFacts(), professionalSeasons } }));
  expect(engine(next).postingQualifications[0].assessment).toMatchObject({ exemption, knownRecognizedSeasons });
});

it.each([
  w => { engine(w).postingQualifications[0].assessment.exemption = 'restricted'; },
  w => { engine(w).postingQualifications[0].facts.professionalSeasons.seasons[0].confirmedDate = '9999-12-01'; },
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
  const rewritten = apply(w, qualificationCommand(w, { facts }));
  changed.contractEconomy = rewritten.contractEconomy; changed.contractEconomy.revision++;
  expect(validateEconomySave(changed)).toBe('annual'); expect(economyOverwriteIssue(next, changed)).toBe('economy_history_conflict');
});

it('leaves old annual saves without the optional collection readable', () => {
  const w = postingWinter(); expect(engine(w)).not.toHaveProperty('postingQualifications');
  expect(validateEconomySave(w)).toBe('annual'); expect(reduceEconomyCommand(w, completion(w)).ok).toBe(true);
});

it('uses actual generated real-player identities and birth facts while keeping recognized seasons unknown', () => {
  let w = postingWinter({ teams: createInitialTeams() }); const produce = createPostingQualificationProducer();
  for (const [i, realPlayerId, exemption] of [[0, 'npb:21625150', 'restricted'], [1, 'npb:21325134', 'unknown']]) {
    const team = w.teams.find(t => [...t.players, ...t.farm].some(p => p.realPlayerId === realPlayerId));
    const p = [...team.players, ...team.farm].find(p => p.realPlayerId === realPlayerId), requestId = 'real-request-' + i;
    w = apply(w, envelope(w, { id: requestId, type: 'request-posting', teamId: team.id, playerId: p.id, contractId: p.contractId }));
    w = apply(w, envelope(w, { id: 'real-approve-' + i, type: 'decide-posting', requestId, decision: 'approve' }));
    w = apply(w, qualificationCommand(w, { id: 'real-qualification-' + i, requestId, facts: produce(p) }));
    expect(engine(w).postingQualifications.at(-1).assessment).toMatchObject({ exemption, knownRecognizedSeasons: null });
  }
  expect(validateEconomySave(JSON.parse(JSON.stringify(w)))).toBe('annual');
});
