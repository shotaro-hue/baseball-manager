import { afterEach, expect, it, vi } from 'vitest';
import { economyRandomContext } from '../economyRandom';
import { rng, rngf } from '../../utils';

const root = Object.freeze({ algorithmVersion: 1, seed: 'posting-test-seed' });
const scope = Object.freeze({ saveId: 'save', epoch: 'epoch', season: 2026, subjectId: 0, operationId: 'request' });
const draws = (context, n = 4) => Array.from({ length: n }, () => rngf(0, 1, context));
afterEach(() => vi.restoreAllMocks());
it('pins the version-one stream and separates roots with a different seed', () => {
  const first = draws(economyRandomContext(root, scope, 'posting:price'));
  expect(first).toEqual([2962145790, 113770821, 1691714016, 468044735].map(n => n / 4294967296));
  expect(draws(economyRandomContext({ ...root, seed: 'other' }, scope, 'posting:price'))).not.toEqual(first);
});
it('rebuilds the same named draws after serialization without consuming the legacy random stream', () => {
  const global = vi.spyOn(Math, 'random').mockImplementation(() => { throw Error('legacy RNG consumed'); });
  const first = draws(economyRandomContext(root, scope, 'posting:price'));
  expect(draws(economyRandomContext(JSON.parse(JSON.stringify(root)), JSON.parse(JSON.stringify(scope)), 'posting:price'))).toEqual(first);
  expect(new Set(first).size).toBe(4); expect(first.every(n => n >= 0 && n < 1)).toBe(true);
  expect(global).not.toHaveBeenCalled();
});
it('keeps another player and another purpose independent of evaluation order and skipped draws', () => {
  const first = draws(economyRandomContext(root, scope, 'posting:price'));
  draws(economyRandomContext(root, scope, 'posting:interest'), 30);
  draws(economyRandomContext(root, { ...scope, subjectId: 1 }, 'posting:price'), 20);
  expect(draws(economyRandomContext(root, scope, 'posting:price'))).toEqual(first);
});
it.each(['saveId', 'epoch', 'season', 'subjectId', 'operationId'])('separates the scope field %s', field => {
  const first = draws(economyRandomContext(root, scope, 'posting:price'));
  const value = typeof scope[field] === 'number' ? scope[field] + 1 : scope[field] + '-other';
  expect(draws(economyRandomContext(root, { ...scope, [field]: value }, 'posting:price'))).not.toEqual(first);
});
it('preserves typed ID zero, delimiter boundaries and scope key-order independence', () => {
  const first = draws(economyRandomContext(root, scope, 'posting:price'));
  expect(draws(economyRandomContext(root, Object.fromEntries(Object.entries(scope).reverse()), 'posting:price'))).toEqual(first);
  expect(draws(economyRandomContext(root, { ...scope, subjectId: '0' }, 'posting:price'))).not.toEqual(first);
  expect(draws(economyRandomContext(root, { ...scope, epoch: 'a|b', operationId: 'c' }, 'price')))
    .not.toEqual(draws(economyRandomContext(root, { ...scope, epoch: 'a', operationId: 'b|c' }, 'price')));
});
it.each([
  [{ ...root, algorithmVersion: 2 }, scope, 'price'], [{ ...root, seed: '' }, scope, 'price'],
  [root, { ...scope, season: 0 }, 'price'], [root, { ...scope, subjectId: null }, 'price'],
  [root, { ...scope, operationId: '' }, 'price'], [root, scope, ''],
])('rejects an unsupported or incomplete random identity %#', (r, s, p) => {
  expect(() => economyRandomContext(r, s, p)).toThrow();
});
it('retains legacy range behavior while allowing an explicit context', () => {
  vi.spyOn(Math, 'random').mockReturnValue(.5);
  expect(rng(2, 6)).toBe(4); expect(rngf(2, 6)).toBe(4);
  expect(rng(2, 6, { random: () => 0 })).toBe(2);
  expect(rng(2, 6, { random: () => 1 - Number.EPSILON })).toBe(6);
  expect(rngf(2, 6, { random: () => .25 })).toBe(3);
  const context = { value: .25, random() { return this.value; } };
  expect(rngf(2, 6, context)).toBe(3);
  expect(() => rngf(2, 6, {})).toThrow();
});
