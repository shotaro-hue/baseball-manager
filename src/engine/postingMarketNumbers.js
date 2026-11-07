// Posting numeric revision 2. Integer kernels use 30 decimal places; scores
// are rounded to 12 places BEFORE acceptance and persistence. No host libm.
export const POSTING_NUMERIC_SCALE = 10n ** 30n;
const S = POSTING_NUMERIC_SCALE, SCORE_SCALE = 10n ** 12n;
const LN2 = 693147180559945309417232121458n;
const fail = () => { throw Error('海外市場の数値表現を確認してください。'); };
const nearest = (n, d) => {
  if (d <= 0n) fail();
  const sign = n < 0n ? -1n : 1n, a = n * sign, q = a / d;
  return sign * (q + (2n * (a % d) >= d ? 1n : 0n));
};
const bytes = new DataView(new ArrayBuffer(8));
export function postingNumberRatio(value) {
  if (!Number.isFinite(value)) fail();
  bytes.setFloat64(0, value);
  const bits = bytes.getBigUint64(0), exponent = Number(bits >> 52n & 2047n);
  const mantissa = (bits & ((1n << 52n) - 1n)) + (exponent ? 1n << 52n : 0n);
  const n = bits >> 63n ? -mantissa : mantissa, shift = (exponent || 1) - 1023 - 52;
  return shift >= 0 ? [n << BigInt(shift), 1n] : [n, 1n << BigInt(-shift)];
}
export function postingPow2(n, d) {
  if (d <= 0n) fail();
  let whole = n / d;
  if (n < 0n && n % d) whole--;
  if (whole < -1024n) return 0n;
  if (whole > 1024n) fail();
  const x = (n - whole * d) * LN2 / d;
  let sum = S, term = S;
  for (let i = 1n; i <= 64n; i++) {
    term = term * x / (S * i); sum += term;
    if (!term) break;
  }
  return whole >= 0n ? sum << whole : nearest(sum, 1n << -whole);
}
export function postingLog2(n, d) {
  if (n <= 0n || d <= 0n) fail();
  let whole = 0n;
  while (n >= 2n * d) { d *= 2n; whole++; }
  while (n < d) { n *= 2n; whole--; }
  // ln(m) = 2 * (z + z^3/3 + ...), z=(m-1)/(m+1), 0 <= z < 1/3.
  const z = (n - d) * S / (n + d), z2 = z * z / S;
  let sum = 0n, power = z;
  for (let i = 1n; i <= 127n; i += 2n) {
    sum += power / i; power = power * z2 / S;
    if (!power) break;
  }
  return whole * S + 2n * sum * S / LN2;
}
export function postingAgeFactor(years) {
  if (!Number.isInteger(years) || years < 0) fail();
  let n = BigInt(years), factor = S, base = 93n * S / 100n;
  while (n) {
    if (n % 2n) factor = nearest(factor * base, S);
    base = nearest(base * base, S); n /= 2n;
  }
  return factor;
}
export function postingPriceUsd(n, d, unitUsd, minimumUsd, maximumUsd) {
  if (d <= 0n || n < 0n || ![unitUsd, minimumUsd, maximumUsd].every(Number.isSafeInteger)
    || unitUsd <= 0 || minimumUsd < 0 || maximumUsd < minimumUsd) fail();
  const lo = BigInt(minimumUsd) * d, hi = BigInt(maximumUsd) * d;
  const clamped = n < lo ? lo : n > hi ? hi : n;
  const amount = nearest(clamped, d * BigInt(unitUsd)) * BigInt(unitUsd);
  if (amount > BigInt(Number.MAX_SAFE_INTEGER)) fail();
  return Number(amount);
}
export function postingScore(n, d = 1n) {
  if (typeof n === 'number') [n, d] = postingNumberRatio(n);
  return Number(nearest(n * SCORE_SCALE, d)) / Number(SCORE_SCALE);
}
export function postingMoneyScore(overseasUsdCents, stayManYen) {
  if (stayManYen === 0) return overseasUsdCents > 0 ? 100 : 50;
  const log = postingLog2(BigInt(overseasUsdCents) * 150n + 15000n, BigInt(stayManYen) * 1000000n + 15000n);
  const score = 50n * S + 25n * log;
  return postingScore(score < 0n ? 0n : score > 100n * S ? 100n * S : score, S);
}
