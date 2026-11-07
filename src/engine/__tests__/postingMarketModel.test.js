import { expect, it, vi } from 'vitest';
import { evaluatePostingMarket } from '../postingMarketModel';
import { postingMathWorld } from './fixtures/postingMarketResults';
import { postingMarketInputs } from '../postingMarketInputs';
import { qualifiedPostingWorld } from './fixtures/postingMarketResults';
import { toAnnualState } from '../contractEconomy';

const root = { algorithmVersion: 1, seed: 'model-test' };
const scope = { saveId: 'save', epoch: 'epoch', season: 2026, subjectId: 0, operationId: 'request' };
function inputs(extra = {}) {
  const f = postingMarketInputs(toAnnualState(qualifiedPostingWorld()), 'request');
  return { ...f, ...extra };
}
const cases = (f, n = 80) => Array.from({ length: n }, (_, i) => evaluatePostingMarket(f, { ...root, seed: `case-${i}` }, scope));
it('reproduces offers and decisions exactly after JSON roundtrip without using global random', () => {
  const f = inputs(); const before = JSON.stringify(f), first = evaluatePostingMarket(f, root, scope);
  const global = vi.spyOn(Math, 'random').mockImplementation(() => { throw Error('global random consumed'); });
  try { expect(evaluatePostingMarket(JSON.parse(before), JSON.parse(JSON.stringify(root)), { ...scope })).toEqual(first); }
  finally { global.mockRestore(); }
  expect(JSON.stringify(f)).toBe(before);
});
it('prices older talent with a shorter guarantee and keeps an absent record distinct from a no-appearance record', () => {
  const young = inputs({ ageYears: 26, abilities: { contact: 72, power: 72, eye: 72 }, potential: { recorded: false, value: null } });
  const a = cases(young), b = cases({ ...young, ageYears: 36 });
  const i = a.findIndex((r, i) => r.offer?.kind === 'major' && b[i].offer?.kind === 'major');
  expect(i).toBeGreaterThanOrEqual(0); expect(a[i].offer.years).toBeGreaterThan(b[i].offer.years);
  expect(a[i].offer.guaranteedUsdCents).toBeGreaterThan(b[i].offer.guaranteedUsdCents);
  const zero = structuredClone(young); zero.performance[0].stats.PA = 0;
  zero.performance[0].assessment = { role: '野手', workload: 0, quality: 0, value: 0 };
  expect(cases(zero).map(r => r.assessment)).toEqual(a.map(r => r.assessment));
});
it('prices the same talent independently of its NPB salary and retained debt', () => {
  const f = inputs({ abilities: { contact: 75, power: 80, eye: 75 } });
  const expensive = { ...f, npb: { ...f.npb, annualSalaryManYen: 50000 } };
  const a = evaluatePostingMarket(f, root, scope), b = evaluatePostingMarket(expensive, root, scope);
  expect(a.offer).toEqual(b.offer); expect(a.assessment).toEqual(b.assessment);
});
it('uses plausible major guarantee scales with bounded terms, allowing no offer or a refusal', () => {
  const f = inputs({ abilities: { contact: 85, power: 85, eye: 85 }, personality: {
    ...inputs().personality, overseas: { recorded: true, value: 100 }, loyalty: { recorded: true, value: 0 }, stability: { recorded: true, value: 0 } } });
  const rows = cases(f);
  expect(rows.some(r => r.outcome === 'signed')).toBe(true);
  for (const r of rows.filter(r => r.offer?.kind === 'major')) {
    expect(r.offer.guaranteedUsdCents).toBeGreaterThanOrEqual(100000000);
    expect(r.offer.guaranteedUsdCents).toBeLessThanOrEqual(32500000000);
    expect(r.offer.years).toBeGreaterThanOrEqual(1); expect(r.offer.years).toBeLessThanOrEqual(12);
  }
});
it('keeps restricted players on minor offers with a signing bonus, never a major guarantee', () => {
  const f = inputs({ exemption: 'restricted', ageYears: 23, abilities: { contact: 90, power: 90, eye: 90 } });
  const rows = cases(f);
  expect(rows.some(r => r.offer)).toBe(true);
  for (const r of rows.filter(r => r.offer)) {
    expect(r.offer.kind).toBe('minor'); expect(r.offer.guaranteedUsdCents).toBeUndefined();
    expect(r.offer.signingBonusUsdCents).toBeLessThanOrEqual(650000000);
  }
});
it('keeps no-offer and declined distinct rather than forcing acceptance after an offer', () => {
  const f = inputs({ abilities: { contact: 80, power: 80, eye: 80 }, personality: {
    ...inputs().personality, overseas: { recorded: true, value: 0 }, money: { recorded: true, value: 0 },
    loyalty: { recorded: true, value: 100 }, stability: { recorded: true, value: 100 } } });
  const rows = cases(f, 200);
  expect(rows.some(r => r.outcome === 'no-offer')).toBe(true);
  expect(rows.some(r => r.outcome === 'declined')).toBe(true);
  expect(rows.some(r => r.outcome === 'signed')).toBe(false);
});
it('does not turn an unrecorded overseas preference into a measured zero or mutate it', () => {
  const f = inputs(), before = structuredClone(f), r = evaluatePostingMarket(f, root, scope);
  expect(r.preference.source).toBe('game-estimate'); expect(f).toEqual(before);
  const explicit = evaluatePostingMarket({ ...f, personality: { ...f.personality, overseas: { recorded: true, value: 0 } } }, root, scope);
  expect(explicit.preference).toEqual({ source: 'recorded', value: 0 });
});
it('cancels shared retained commitments from the stay comparison without treating unknown guarantee as true', () => {
  const f = inputs();
  const r = cases({ ...f, npb: { ...f.npb, guaranteeStatus: 'unknown' } }).find(r => r.acceptance);
  expect(r.acceptance.retainedComparableManYen).toBeGreaterThan(0);
  expect(r.acceptance.stayUncontractedManYen).toBe(f.npb.annualSalaryManYen * Math.max(0, r.offer.years - 2));
});
it.each(['ability', 'salary', 'performance', 'root'])('rejects unsupported/corrupt source %s', field => {
  const f = inputs(); let r = root;
  if (field === 'ability') f.abilities.power = null;
  if (field === 'salary') f.npb.annualSalaryManYen = -1;
  if (field === 'performance') f.performance[0].stats.PA = -1;
  if (field === 'root') r = { ...root, algorithmVersion: 2 };
  expect(() => evaluatePostingMarket(f, r, scope)).toThrow();
});
// At this comparison moneyScore=100, so score=52.5 + .4*overseas.
it.each([[18.749999999998, 'declined', 59.999999999999], [18.749999999999, 'signed', 60],
  [18.75, 'signed', 60], [18.750000000002, 'signed', 60.000000000001]])(
  'uses its saved twelve-decimal score at the acceptance threshold (overseas=%s)', (overseas, outcome, score) => {
    const w = qualifiedPostingWorld(postingMathWorld()), f = postingMarketInputs(toAnnualState(w), 'request');
    f.npb.endSeason = 2027;
    f.personality.overseas.value = overseas; f.personality.loyalty.value = 50;
    const r = evaluatePostingMarket(f, w.contractEconomy.randomRoot, { saveId: w.saveId, epoch: w.contractEconomy.epoch,
      season: 2026, subjectId: 0, operationId: 'request' });
    expect(r.outcome).toBe(outcome);
    expect(r.acceptance.score).toBe(score);
    expect(r.outcome === 'signed').toBe(r.acceptance.score >= 60);
    expect(JSON.parse(JSON.stringify(r)).acceptance.score).toBe(r.acceptance.score);
  });
