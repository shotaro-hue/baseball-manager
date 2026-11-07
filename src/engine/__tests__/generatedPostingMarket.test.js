import { expect, it } from 'vitest';
import { approvedPostingWorld, qualificationCommand } from './fixtures/postingQualifications';
import { postingWinter } from './fixtures/postingDepartures';
import { postingUiWorld } from './fixtures/postingUi';
import { envelope } from './fixtures/faDeclarations';
import { reduceEconomyCommand, toAnnualState, fromAnnualState } from '../contractEconomy';
import { validateEconomySave, economyOverwriteIssue } from '../economyPersistence';
import { freezeEconomy } from './fixtures/economyWorld';
import { gamePostingQualificationFacts } from '../postingQualificationSnapshot';
import { generatedPostingWorld } from './fixtures/postingMarketResults';
import { playableClub, nextSeasonForDepartureTest } from './fixtures/inSeasonDepartures';
import { contractLiabilityRows } from '../contractLedger';
import { quoteAnnualSpendingPlan } from '../annualSpending';
import { isIkuseiPlayer } from '../rosterCapacity';
import { createInitialTeams } from '../bootstrapTeams';

const engine = w => w.contractEconomy.engine;
export const marketCommand = (w, extra = {}) => envelope(w, { id: 'generated', type: 'run-posting-market', requestId: 'request', ...extra });
const apply = (w, c = marketCommand(w)) => { const r = reduceEconomyCommand(w, c); expect(r.ok, r.error).toBe(true); return r.world; };
function world(seed = 'market-test', overseas = 100) {
  const w = approvedPostingWorld();
  w.contractEconomy.randomRoot.seed = seed;
  const p = w.teams[0].players[0]; p.batting = { ...p.batting, contact: 85, power: 85, eye: 85 };
  p.personality = { ...p.personality, overseas, loyalty: 0, stability: 0 };
  return w;
}
it('evaluates approved input and commits qualification, result and generated evidence at exactly one revision', () => {
  const w = world(), before = structuredClone(w), c = marketCommand(w);
  const next = apply(freezeEconomy(w), c), e = engine(next), parent = e.transactions.at(-1).generatedPostingMarket;
  expect(next.contractEconomy.revision).toBe(w.contractEconomy.revision + 1);
  expect(e.postingQualifications).toHaveLength(1); expect(e.postingMarketResults).toHaveLength(1);
  expect(parent.inputs.sourceContractId).toBe(w.teams[0].players[0].contractId);
  expect(parent.evaluation.outcome).toBe(e.postingMarketResults[0].outcome);
  expect(next.contractEconomy.randomRoot).toEqual(w.contractEconomy.randomRoot);
  expect(w).toEqual(before); expect(validateEconomySave(JSON.parse(JSON.stringify(next)))).toBe('annual');
  expect(economyOverwriteIssue(w, next)).toBeNull();
  expect(reduceEconomyCommand(next, c)).toMatchObject({ ok: true, replayed: true, world: next });
});
it('uses the same draws after retry or a different caller ID and uses an existing qualification', () => {
  const w = world(), a = apply(w), b = apply(w, marketCommand(w, { id: 'other' }));
  expect(engine(a).transactions.at(-1).generatedPostingMarket.evaluation).toEqual(engine(b).transactions.at(-1).generatedPostingMarket.evaluation);
  const q = apply(w, qualificationCommand(w)), next = apply(q);
  expect(engine(next).postingQualifications).toEqual(engine(q).postingQualifications);
  expect(engine(next).transactions.at(-1).generatedPostingMarket.qualificationCreated).toBe(false);
});
it.each([{ outcome: 'signed' }, { overseasContract: { kind: 'major', guaranteedUsdCents: 100 } }, { settlement: 'waive' }, { policyVersion: 'free' }])('rejects caller-supplied market or settlement policy %j', extra => {
  const w = world(), before = structuredClone(w), r = reduceEconomyCommand(freezeEconomy(w), marketCommand(w, extra));
  expect(r).toMatchObject({ ok: false, world: w }); expect(w).toEqual(before);
});
it('does not evaluate pending, rejected or already resolved requests', () => {
  const pending = postingUiWorld(); expect(reduceEconomyCommand(pending, marketCommand(pending)).ok).toBe(false);
  const w = apply(world()); expect(reduceEconomyCommand(w, marketCommand(w, { id: 'again' })).ok).toBe(false);
});
it.each(['evaluation', 'input', 'root', 'missing', 'signature', 'qualification'])('rejects corrupt generated evidence after serialization (%s)', field => {
  const w = apply(world()), bad = JSON.parse(JSON.stringify(w)), receipt = engine(bad).transactions.at(-1), g = receipt.generatedPostingMarket;
  if (field === 'evaluation') g.evaluation.preference.value++;
  if (field === 'input') g.inputs.abilities.power = null;
  if (field === 'root') bad.contractEconomy.randomRoot.seed += '-tampered';
  if (field === 'missing') delete receipt.generatedPostingMarket;
  if (field === 'signature') receipt.signature = receipt.signature.replace('run-posting-market', 'opaque');
  if (field === 'qualification') g.inputs.ageYears++;
  expect(() => validateEconomySave(bad)).toThrow();
});
it('uses actual opening-roster qualifications and abilities, preserving unknown overseas preferences', () => {
  let w = postingUiWorld({ realRoster: true });
  const development = [...w.teams[0].players, ...w.teams[0].farm].find(isIkuseiPlayer);
  expect(development).toBeDefined();
  expect(reduceEconomyCommand(w, envelope(w, { id: 'development', type: 'request-posting', teamId: w.myId,
    playerId: development.id, contractId: development.contractId })).ok).toBe(false);
  w = apply(w, envelope(w, { id: 'real-approval', type: 'decide-posting', requestId: 'request', decision: 'approve' }));
  const p = w.teams[0].players.find(p => p.id === engine(w).postingApplications[0].playerId), next = apply(w);
  const g = engine(next).transactions.at(-1).generatedPostingMarket;
  expect(g.inputs.sourcePlayerId).toBe(p.realPlayerId);
  expect(engine(next).postingQualifications[0].facts).toEqual(gamePostingQualificationFacts(p, 2026));
  expect(g.inputs.personality.overseas).toEqual({ recorded: false, value: null });
  expect(g.evaluation.preference.source).toBe('game-estimate'); expect(toAnnualState(next)).toBeDefined();
});
it.each(['signed', 'no-offer', 'declined'])('keeps generated %s, its inputs and old-scope replay across two historical seasons', outcome => {
  const teams = [playableClub(), playableClub(1)]; teams.forEach(t => [...t.players, ...t.farm].forEach(p => { p.contractYearsLeft = 4; }));
  const w = generatedPostingWorld(outcome, postingWinter({ teams, years: 4 })), c = marketCommand(w), next = apply(w, c);
  expect(engine(next).postingMarketResults[0].outcome).toBe(outcome);
  const later = nextSeasonForDepartureTest(nextSeasonForDepartureTest(next));
  expect(validateEconomySave(later)).toBe('annual'); expect(engine(later).transactions).toEqual(engine(next).transactions);
  expect(reduceEconomyCommand(later, c)).toMatchObject({ ok: true, replayed: true });
  if (outcome === 'signed') {
    const costs = contractLiabilityRows(engine(next).spending.ledger).filter(r => r.contractId === w.teams[0].players[0].contractId);
    expect(costs).toEqual(contractLiabilityRows(engine(w).spending.ledger).filter(r => r.contractId === w.teams[0].players[0].contractId)
      .map(r => ({ ...r, kind: r.season > 2026 ? 'guarantee' : 'salary' })));
  }
});
it('rejects a signed result that worsens a later budget without substituting another market outcome', () => {
  let w = generatedPostingWorld();
  engine(w).rosterRequirements.forEach(r => { r.requiredControlledCount = 21; });
  const rows = quoteAnnualSpendingPlan(toAnnualState(w).spending), row = rows.find(r => r.teamId === 0 && r.season === 2028);
  for (const a of [w.contractEconomy.budgetPolicies, engine(w).spending.authorizations]) a.find(r => r.teamId === 0 && r.season === 2028).approvedManYen -= row.remainingManYen;
  w = fromAnnualState(w, toAnnualState(w));
  expect(validateEconomySave(w)).toBe('annual');
  const before = structuredClone(w), r = reduceEconomyCommand(freezeEconomy(w), marketCommand(w));
  expect(r).toMatchObject({ ok: false, world: w }); expect(r.error).toMatch(/余力/); expect(w).toEqual(before);
});
it.each(['qualification', 'market-result'])('rejects a generated child ID collision (%s)', kind => {
  const w = world(); engine(w).transactions.push({ id: JSON.stringify(['generated', kind]), signature: 'old-opaque' });
  expect(validateEconomySave(w)).toBe('annual'); expect(reduceEconomyCommand(w, marketCommand(w)).ok).toBe(false);
});
it.each(['starter', 'relief'])('evaluates actual %s pitching abilities and saved performance through the native command', role => {
  let w = postingWinter({ teams: [createInitialTeams()[0]] });
  const p = [...w.teams[0].players, ...w.teams[0].farm].find(p => p.isPitcher && !isIkuseiPlayer(p)
    && (/抑え|中継ぎ|救援/.test(p.subtype || p.pos || '') ? 'relief' : 'starter') === role);
  expect(p).toBeDefined();
  for (const transaction of [
    { id: 'request', type: 'request-posting', teamId: w.myId, playerId: p.id, contractId: p.contractId },
    { id: 'approval', type: 'decide-posting', requestId: 'request', decision: 'approve' },
  ]) w = apply(w, envelope(w, transaction));
  const next = apply(w), g = engine(next).transactions.at(-1).generatedPostingMarket;
  expect(g.inputs.role).toBe(role); expect(g.inputs.sourcePlayerId).toBe(p.realPlayerId);
  for (const k of ['velocity', 'control', 'breaking', 'stamina']) expect(g.inputs.abilities[k]).toBe(p.pitching[k]);
  expect(g.inputs.performance.some(r => r.source === 'saved-career')).toBe(true);
  expect(validateEconomySave(next)).toBe('annual');
});
it('preserves a generated measured zero minor bonus with retained costs and a zero income receipt', () => {
  const w = generatedPostingWorld(), p = w.teams[0].players[0];
  Object.assign(p, { birthDate: '2003-01-01', proStartYear: 2024 });
  p.batting = { ...p.batting, contact: 0, power: 0, eye: 0 }; delete p.potential;
  w.contractEconomy.randomRoot.seed = 'market-case-162';
  const next = apply(w), g = engine(next).transactions.at(-1).generatedPostingMarket;
  expect(g.evaluation).toMatchObject({ outcome: 'signed', offer: { kind: 'minor', signingBonusUsdCents: 0 } });
  expect(engine(next).postingMarketResults[0].overseasContract).toEqual({ kind: 'minor', signingBonusUsdCents: 0 });
  expect(next.contractEconomy.incomeReceipts[0].amountManYen).toBe(0);
  expect(contractLiabilityRows(engine(next).spending.ledger).filter(r => r.season > 2026 && r.playerId === 0))
    .toEqual([{ teamId: 0, season: 2027, contractId: p.contractId, playerId: 0, kind: 'guarantee', amountManYen: 1000 },
      { teamId: 0, season: 2028, contractId: p.contractId, playerId: 0, kind: 'guarantee', amountManYen: 1000 }]);
});
