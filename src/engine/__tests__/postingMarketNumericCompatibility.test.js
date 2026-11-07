import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { validateEconomySave } from '../economyPersistence';
import { reduceEconomyCommand } from '../contractEconomy';
import { postingMathWorld } from './fixtures/postingMarketResults';
import { envelope } from './fixtures/faDeclarations';
import { freezeEconomy } from './fixtures/economyWorld';

const legacy = JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/postingMathV1.json.gz', import.meta.url))));
const command = w => envelope(w, { id: 'generated', type: 'run-posting-market', requestId: 'request' });
const generated = () => { const w = postingMathWorld(), r = reduceEconomyCommand(w, command(w)); expect(r.ok, r.error).toBe(true); return r.world; };
const evaluation = w => w.contractEconomy.engine.transactions.at(-1).generatedPostingMarket.evaluation;

it.each(['v8', 'jsc', 'threshold-v8', 'threshold-jsc'])('reads the captured %s version1 counterexample without changing any saved evidence or economic result', engine => {
  const w = structuredClone(legacy[engine]), before = JSON.stringify(w);
  expect(validateEconomySave(freezeEconomy(w))).toBe('annual');
  expect(JSON.stringify(w)).toBe(before);
  expect(reduceEconomyCommand(w, command(postingMathWorld()))).toMatchObject({ ok: true, replayed: true, world: w });
  const signed = engine !== 'threshold-jsc';
  expect(w.contractEconomy.incomeReceipts).toHaveLength(signed ? 1 : 0); expect(w.contractEconomy.engine.postingDepartures ?? []).toHaveLength(signed ? 1 : 0);
});
it('generates the counterexample with a new numeric version while keeping its exact contract, result, departure, income, allowance and revision', () => {
  const w = generated(), old = structuredClone(legacy.v8), comparable = JSON.parse(JSON.stringify(w));
  expect(evaluation(w)).toMatchObject({ version: 2, policyVersion: 'posting-mlb-scale-v1', outcome: 'signed',
    offer: { kind: 'major', years: 1, guaranteedUsdCents: 100000000 },
    acceptance: { moneyScore: 84.898158061614, score: 93.969447418484 } });
  expect(w.contractEconomy.revision).toBe(3);
  expect(w.contractEconomy.incomeReceipts[0]).toMatchObject({ amountManYen: 3000,
    budgetAllocation: { season: 2027, amountManYen: 3000 } });
  delete comparable.contractEconomy.engine.transactions.at(-1).generatedPostingMarket.evaluation;
  delete old.contractEconomy.engine.transactions.at(-1).generatedPostingMarket.evaluation;
  expect(comparable).toEqual(old);
});
it.each(['money', 'score', 'amount', 'outcome', 'root', 'qualification', 'child'])('keeps version1 %s corruption rejected', field => {
  const w = structuredClone(legacy.v8), e = evaluation(w);
  if (field === 'money') e.acceptance.moneyScore += 1e-8;
  if (field === 'score') e.acceptance.score += 1e-8;
  if (field === 'amount') e.offer.guaranteedUsdCents++;
  if (field === 'outcome') e.outcome = 'declined';
  if (field === 'root') w.contractEconomy.randomRoot.seed += '-changed';
  if (field === 'qualification') w.contractEconomy.engine.transactions.at(-1).generatedPostingMarket.qualificationId = 'wrong';
  if (field === 'child') w.contractEconomy.engine.postingMarketResults[0].id = 'wrong';
  expect(() => validateEconomySave(w)).toThrow();
});
it('strictly rejects even a last-bit change in a version2 score rather than accepting legacy tolerance for new data', () => {
  const w = generated(); evaluation(w).acceptance.moneyScore += 2 ** -45;
  expect(() => validateEconomySave(w)).toThrow();
});
it.each([['threshold-v8', 'threshold-jsc'], ['threshold-jsc', 'threshold-v8']])(
  'binds the legacy money witness to its exact saved score and outcome (%s)', (from, other) => {
    const w = structuredClone(legacy[from]);
    evaluation(w).acceptance.moneyScore = evaluation(legacy[other]).acceptance.moneyScore;
    expect(() => validateEconomySave(w)).toThrow();
  });
