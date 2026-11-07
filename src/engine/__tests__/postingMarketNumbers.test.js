import { expect, it } from 'vitest';
import { POSTING_NUMERIC_SCALE as S, postingPow2, postingLog2, postingAgeFactor,
  postingPriceUsd, postingScore, postingMoneyScore } from '../postingMarketNumbers';

it('evaluates posting-only powers and logarithms deterministically from exact rational operands', () => {
  expect(postingPow2(0n, 1n)).toBe(S);
  expect(postingPow2(-1n, 1n)).toBe(S / 2n);
  expect(postingPow2(3n, 1n)).toBe(8n * S);
  expect(postingLog2(1n, 1n)).toBe(0n);
  expect(postingLog2(1n, 2n)).toBe(-S);
  expect(postingLog2(8n, 1n)).toBe(3n * S);
  expect(postingScore(postingLog2(3n, 2n), S)).toBe(.584962500721);
  expect(postingScore(postingPow2(1n, 2n), S)).toBe(1.414213562373);
  expect(postingAgeFactor(0)).toBe(S); expect(postingAgeFactor(2)).toBe(8649n * S / 10000n);
});
it.each([[1024999999999n, 1000000n, 1000000], [1025000000000n, 1000000n, 1050000],
  [1025000000001n, 1000000n, 1050000]])('rounds the exact major price %s/%s at the half-unit boundary', (n, d, expected) => {
  expect(postingPriceUsd(n, d, 50000, 1000000, 35000000)).toBe(expected);
});
it.each([[499999n, 100n, 0], [500000n, 100n, 10000], [500001n, 100n, 10000]])('rounds the exact minor bonus %s/%s, including measured zero', (n, d, expected) => {
  expect(postingPriceUsd(n, d, 10000, 0, 6500000)).toBe(expected);
});
it.each([[599999999999994n, 10000000000000n, 59.999999999999], [599999999999996n, 10000000000000n, 60],
  [600000000000004n, 10000000000000n, 60], [600000000000006n, 10000000000000n, 60.000000000001]])(
  'uses the same twelve-decimal score for acceptance, storage and replay (%s/%s)', (n, d, expected) => {
    expect(postingScore(n, d)).toBe(expected);
  });
it('evaluates the reported moneyScore at its defined precision and retains zero/positive stay-free comparisons', () => {
  expect(postingMoneyScore(100000000, 5700)).toBe(84.898158061614);
  expect(postingMoneyScore(0, 0)).toBe(50); expect(postingMoneyScore(1, 0)).toBe(100);
});
