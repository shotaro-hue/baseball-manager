import { expect, it } from 'vitest';
import { qualifiedPostingWorld, marketResult } from './fixtures/postingMarketResults';
import { approvedPostingWorld, qualificationCommand, legacyQualificationWorld } from './fixtures/postingQualifications';
import { postingWinter, postingCommand } from './fixtures/postingDepartures';
import { postingRequest, postingDecision } from './fixtures/postingApplications';
import { completion } from './fixtures/postingIncome';
import { playableClub, nextSeasonForDepartureTest } from './fixtures/inSeasonDepartures';
import { freezeEconomy, renewalEnvelope } from './fixtures/economyWorld';
import { createSeasonContract } from '../seasonContract';
import { contractLiabilityRows } from '../contractLedger';
import { gamePostingQualificationFacts } from '../postingQualificationSnapshot';
import { reduceEconomyCommand, quoteEconomyCommand, toAnnualState, fromAnnualState } from '../contractEconomy';
import { validateEconomySave, economyOverwriteIssue } from '../economyPersistence';
import { postingApplicationViews } from '../annualPostingApplications';
import { envelope } from './fixtures/faDeclarations';
import { reduceRenewalRequest, renewalRequest } from '../renewalDecisions';

const engine = w => w.contractEconomy.engine;
const json = w => JSON.parse(JSON.stringify(w));
const apply = (w, c) => { const r = reduceEconomyCommand(w, c); expect(r.ok, r.error).toBe(true); return r.world; };
const deny = (w, c) => {
  const before = structuredClone(w); freezeEconomy(w);
  expect(quoteEconomyCommand(w, c).ok).toBe(false);
  expect(reduceEconomyCommand(w, c)).toMatchObject({ ok: false, world: w }); expect(w).toEqual(before);
};
const renewal = w => {
  const c = renewalEnvelope(w);
  c.transaction.proposal.contract = createSeasonContract({ ...c.transaction.proposal.contract, agreementPhase: 'offseason' });
  return c;
};

it.each(['retain', 'waive'])('links approved request, qualification, final contract, departure and income atomically (%s)', settlement => {
  const w = qualifiedPostingWorld(), before = structuredClone(w), c = marketResult(w, 'signed', { id: 0, settlement,
    ...(settlement === 'waive' ? { terminationAgreementId: 0 } : {}) });
  expect(quoteEconomyCommand(freezeEconomy(w), c).ok).toBe(true);
  const next = apply(w, c), result = engine(next).postingMarketResults[0];
  expect(result).toMatchObject({ id: 0, requestId: 'request', qualificationId: 'qualification', outcome: 'signed',
    season: 2026, teamId: 0, playerId: 0, sourceContractId: before.teams[0].players[0].contractId,
    resolvedDate: '2026-12-01', completionId: JSON.stringify([0, 'posting-completion']) });
  expect(JSON.parse(result.sourceKey)).toEqual([w.saveId, w.contractEconomy.epoch, 'posting-market', 'request']);
  expect(next.teams[0].players.some(p => p.id === 0)).toBe(false);
  expect(next.teams[0].history.filter(p => p.postingDepartureId)).toHaveLength(1);
  expect(engine(next).postingDepartures).toHaveLength(1);
  expect(next.contractEconomy.incomeReceipts[0]).toMatchObject({ amountManYen: 253125, budgetAllocation: { season: 2027, amountManYen: 253125 } });
  expect(engine(next).spending.authorizations.find(a => a.teamId === 0 && a.season === 2027).approvedManYen).toBe(1253125);
  expect(engine(next).spending.authorizations.find(a => a.teamId === 0 && a.season === 2028).approvedManYen).toBe(1000000);
  expect(contractLiabilityRows(engine(next).spending.ledger).filter(r => r.season <= 2026))
    .toEqual(contractLiabilityRows(engine(w).spending.ledger).filter(r => r.season <= 2026));
  for (const k of ['randomRoot', 'budgetPolicies', 'clock', 'decisions']) expect(next.contractEconomy[k]).toEqual(before.contractEconomy[k]);
  expect(postingApplicationViews(toAnnualState(next))[0].status).toBe('signed');
  expect(engine(next).postingQualifications).toEqual(engine(w).postingQualifications);
  expect(w).toEqual(before); expect(validateEconomySave(json(next))).toBe('annual');
  expect(fromAnnualState(next, toAnnualState(next)).contractEconomy).toEqual(next.contractEconomy);
  expect(economyOverwriteIssue(w, next)).toBeNull();
  expect(reduceEconomyCommand(json(next), c)).toMatchObject({ ok: true, replayed: true });
});

it.each(['no-offer', 'declined'])('records %s without financial or roster changes and permits ordinary renewal', outcome => {
  const w = qualifiedPostingWorld(postingWinter({ years: 1 })), c = marketResult(w, outcome), next = apply(freezeEconomy(w), c);
  expect(next.teams).toEqual(w.teams); expect(next.faPool).toEqual(w.faPool);
  expect(engine(next).spending).toEqual(engine(w).spending);
  for (const k of ['randomRoot', 'incomeReceipts', 'budgetPolicies', 'decisions']) expect(next.contractEconomy[k]).toEqual(w.contractEconomy[k]);
  expect(postingApplicationViews(toAnnualState(next))[0].status).toBe(outcome);
  expect(apply(next, renewal(next))).toBeDefined();
  expect(reduceEconomyCommand(json(next), c)).toMatchObject({ ok: true, replayed: true });
  deny(json(next), marketResult(next, outcome, { id: 'second' }));
  deny(json(next), postingRequest(next, { id: 'again' }));
  deny(json(next), completion(next)); deny(json(next), postingCommand(next));
});

it('requires approval and the matching v2 qualification before any market result', () => {
  for (const w of [postingWinter(), approvedPostingWorld(), legacyQualificationWorld(0), legacyQualificationWorld(1)])
    deny(w, marketResult(w));
  const w = postingWinter(), pending = apply(w, postingRequest(w));
  deny(pending, marketResult(pending, 'no-offer'));
  deny(apply(pending, postingDecision(pending, 'reject')), marketResult(pending, 'declined'));
});

it.each([{ requestId: 'absent' }, { qualificationId: 'absent' }, { requestId: 0 }, { outcome: 'unknown' }, { playerId: 0 },
  { settlement: 'waive' }, { terminationAgreementId: 0 }, { overseasContract: { kind: 'major', guaranteedUsdCents: 0 } }])(
  'rejects invalid or contradictory result input %j', extra => { const w = qualifiedPostingWorld(); deny(w, marketResult(w, 'signed', extra)); });
it.each([{ overseasContract: { kind: 'minor', signingBonusUsdCents: 0 } }, { settlement: 'retain' }, { terminationAgreementId: 0 }])(
  'rejects final contract and settlement fields on an unsuccessful outcome %j', extra => {
    const w = qualifiedPostingWorld(); deny(w, marketResult(w, 'no-offer', extra));
  });

it('requires current identity, revision, source employment and no competing future commitment', () => {
  const w = qualifiedPostingWorld();
  for (const extra of [{ saveId: 'other' }, { epoch: 'other' }, { baseRevision: 0 }]) deny(json(w), { ...marketResult(w), ...extra });
  const retired = json(w); retired.teams[0].players[0].isRetired = true; deny(retired, marketResult(retired));
  const wrongDate = json(w); wrongDate.contractEconomy.clock.date = '2026-12-02'; deny(wrongDate, marketResult(wrongDate));
  const next = apply(w, marketResult(w));
  deny(json(next), marketResult(next, 'signed', { overseasContract: { kind: 'major', guaranteedUsdCents: 200 } }));
  deny(json(next), marketResult(next, 'signed', { id: 'second' }));
});

it('rejects restricted major contracts and accepts a zero-bonus minor without changing the fee policy', () => {
  let w = approvedPostingWorld(postingWinter({ years: 1 })); w.teams[0].players[0].proStartYear = 2024;
  w = apply(w, qualificationCommand(w, { facts: gamePostingQualificationFacts(w.teams[0].players[0], 2026) }));
  expect(engine(w).postingQualifications[0].assessment.exemption).toBe('restricted');
  deny(json(w), marketResult(w));
  const next = apply(w, marketResult(w, 'signed', { overseasContract: { kind: 'minor', signingBonusUsdCents: 0 } }));
  expect(next.contractEconomy.incomeReceipts[0].amountManYen).toBe(0);
  expect(engine(next).spending.ledger).toEqual(engine(w).spending.ledger);
});

it.each(['signed', 'no-offer', 'declined'])('retains %s and its historical qualification through two future seasons', outcome => {
  const teams = [playableClub(), playableClub(1)]; teams.forEach(t => [...t.players, ...t.farm].forEach(p => { p.contractYearsLeft = 4; }));
  const w = qualifiedPostingWorld(postingWinter({ teams, years: 4 })), c = marketResult(w, outcome), next = apply(w, c);
  const later = nextSeasonForDepartureTest(nextSeasonForDepartureTest(next));
  expect(validateEconomySave(json(later))).toBe('annual');
  expect(engine(later).postingMarketResults).toEqual(engine(next).postingMarketResults);
  expect(engine(later).postingQualifications).toEqual(engine(next).postingQualifications);
  expect(reduceEconomyCommand(later, c)).toMatchObject({ ok: true, replayed: true });
});

it.each([
  w => { engine(w).postingMarketResults.pop(); },
  w => { engine(w).transactions.pop(); },
  w => { engine(w).postingMarketResults[0].qualificationId = 'wrong'; },
  w => { engine(w).postingMarketResults[0].sourceKey = 'wrong'; },
  w => { engine(w).postingMarketResults[0].completionId = 'wrong'; },
  w => { engine(w).postingMarketResults[0].outcome = 'declined'; },
  w => { engine(w).postingMarketResults.push(engine(w).postingMarketResults[0]); },
  w => { engine(w).postingMarketResults = null; },
])('rejects missing, forged, duplicate and unpaired results after serialization', edit => {
  const w = qualifiedPostingWorld(), bad = json(apply(w, marketResult(w))); edit(bad);
  expect(() => validateEconomySave(bad)).toThrow();
});

it('keeps the old explicit completion boundary compatible without an application', () => {
  const w = postingWinter(); expect(engine(w)).not.toHaveProperty('postingMarketResults');
  expect(apply(w, completion(w))).toBeDefined();
  const q = qualifiedPostingWorld(); deny(q, completion(q));
});

it.each(['posting-completion', 'posting-departure', 'typed-parent'])('rejects parent/child transaction ID collisions (%s)', kind => {
  const w = qualifiedPostingWorld(), child = JSON.stringify(['market', 'posting-completion']);
  const id = kind === 'posting-completion' ? child : kind === 'posting-departure' ? JSON.stringify([child, 'posting-departure']) : 0;
  engine(w).transactions.push({ id, signature: 'opaque-old-receipt' });
  expect(validateEconomySave(w)).toBe('annual');
  deny(w, marketResult(w, 'signed', kind === 'typed-parent' ? { id: '0' } : {}));
});

it('keeps active applications incompatible with human/engine renewal offers', () => {
  const w = qualifiedPostingWorld(postingWinter({ years: 1 }));
  const before = structuredClone(w);
  expect(reduceRenewalRequest(w, renewalRequest(w, { type: 'offer', playerId: 0, salary: 1200, years: 1 })).ok).toBe(false);
  expect(w).toEqual(before); deny(w, renewal(w));
});

it.each(['no-offer', 'declined'])('allows natural expiry after %s while retaining historical qualification evidence', outcome => {
  const w = qualifiedPostingWorld(postingWinter({ years: 1 })), c = marketResult(w, outcome), next = apply(w, c);
  const departed = apply(next, envelope(next, { id: 'expire', type: 'enter-market', reason: 'expiry', teamId: 0,
    playerId: 0, contractId: w.teams[0].players[0].contractId }));
  expect(validateEconomySave(json(departed))).toBe('annual');
  expect(engine(departed).postingQualifications).toEqual(engine(w).postingQualifications);
  expect(reduceEconomyCommand(departed, c)).toMatchObject({ ok: true, replayed: true });
});
