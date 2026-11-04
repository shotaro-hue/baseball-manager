import { describe, expect, it } from 'vitest';
const module = () => import('../postingIncome').catch(() => ({}));

describe('recorded posting contract money', () => {
  it.each([
    ['major', 2_500_000_000, 500_000_000, 75000],
    ['major', 5_000_000_000, 937_500_000, 140625],
    ['major', 10_000_000_000, 1_687_500_000, 253125],
    ['major', 2_500_000_020, 500_000_004, 75000],
    ['minor', 650_000_000, 162_500_000, 24375],
    ['minor', 2, 1, 0],
    ['minor', 0, 0, 0],
  ])('calculates %s %d cents without floating conversion', async (kind, value, feeUsdCents, amountManYen) => {
    const { quotePostingIncome } = await module(); expect(quotePostingIncome).toBeTypeOf('function');
    const contract = { kind, [kind === 'major' ? 'guaranteedUsdCents' : 'signingBonusUsdCents']: value };
    expect(quotePostingIncome(Object.freeze(contract))).toMatchObject({ feeUsdCents, amountManYen,
      policy: { version: 1, fxYenPerUsd: 150, allocationPercent: 100, rounding: 'floor-man-yen', feeRounding: 'half-up-cent' } });
  });
  it.each([null, {}, { kind: 'major', guaranteedUsdCents: 0 }, { kind: 'major', guaranteedUsdCents: -1 },
    { kind: 'major', guaranteedUsdCents: 1.2 }, { kind: 'major', guaranteedUsdCents: Number.MAX_SAFE_INTEGER + 1 },
    { kind: 'minor', signingBonusUsdCents: 10, majorTerms: true }, { kind: 'major', guaranteedUsdCents: 10, options: 1 },
    { kind: 'other', guaranteedUsdCents: 10 }])('rejects unrecorded or unsupported monetary terms %j', async contract => {
    const { quotePostingIncome } = await module(); expect(quotePostingIncome).toBeTypeOf('function');
    expect(() => quotePostingIncome(contract)).toThrow();
  });
});
