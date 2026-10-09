import { describe, expect, it } from 'vitest';
import { contractPayroll } from '../contractPayroll';
const p = (id, salary, extra = {}) => ({ id, salary, ...extra });
const fixture = () => ({ players: [p(0, 100), p('a', 300)], farm: [p('b', 200), p('c', 50, { 育成: true })], scoutResults: [p('scout', 9999)], faPool: [p('fa', 9999)] });
const amounts = t => contractPayroll(t).groups.map(g => g.amount);
describe('contractPayroll', () => {
  it('sums active, farm and development once and excludes candidates', () => {
    const t = fixture(); t.farm.push(t.players[0], t.farm[1]);
    const r = contractPayroll(t);
    expect(amounts(t)).toEqual([400, 200, 50]); expect(r.total.amount).toBe(650);
    expect(r.total.amount).toBe(r.groups.reduce((n, g) => n + g.amount, 0));
    expect(r.total).toMatchObject({ count: 4, missing: 0, invalid: 0 });
    expect(r.leaders.map(e => e.player.id)).toEqual(['a', 'b', 0, 'c']);
  });
  it('uses development flag before physical roster and active before duplicate farm IDs', () => {
    const t = fixture(); t.players.push(p('d', 80, { 育成: true })); t.farm.push(p(0, 100));
    expect(amounts(t)).toEqual([400, 200, 130]);
  });
  it('promotion and demotion only move subtotals', () => {
    const t = fixture(), before = contractPayroll(t).total.amount;
    const promoted = { ...t, players: [...t.players, t.farm[0]], farm: t.farm.slice(1) };
    expect(amounts(promoted)).toEqual([600, 0, 50]); expect(contractPayroll(promoted).total.amount).toBe(before);
    const demoted = { ...t, players: t.players.slice(1), farm: [...t.farm, t.players[0]] };
    expect(amounts(demoted)).toEqual([300, 300, 50]); expect(contractPayroll(demoted).total.amount).toBe(before);
  });
  it('reflects new contract, signing and release without cached state', () => {
    const t = fixture(); t.players[0] = { ...t.players[0], salary: 150 };
    expect(contractPayroll(t).total.amount).toBe(700);
    t.farm.push(p('new', 70)); expect(contractPayroll(t).total.amount).toBe(770);
    t.players = t.players.slice(1); expect(contractPayroll(t).total.amount).toBe(620);
  });
  it.each([undefined, null])('reports missing salary %s separately from measured zero', salary => {
    const r = contractPayroll({ players: [p(0, 0), p(1, salary)] });
    expect(r.total).toMatchObject({ amount: 0, count: 2, missing: 1, invalid: 0 });
    expect(r.entries.map(e => e.salaryStatus)).toEqual(['recorded', 'missing']);
  });
  it.each([NaN, Infinity, -Infinity, -1, '100', '', true, {}])('reports invalid salary %s', salary => {
    expect(contractPayroll({ farm: [p(0, 100), p(1, salary)] }).total).toMatchObject({ amount: 100, missing: 0, invalid: 1 });
  });
  it('ranks six valid salaries descending, zero before missing, ties in roster order', () => {
    const t = { players: [p(0, null), p(1, 0), p(2, 200), p(3, 200)], farm: [p(4, 100), p(5, 600), p(6, 500), p(7, -1)] };
    expect(contractPayroll(t).leaders.map(e => e.player.id)).toEqual([5, 6, 2, 3, 4, 1]);
  });
  it('allows empty categories and legacy teams without farm', () => {
    expect(amounts({})).toEqual([0, 0, 0]); expect(contractPayroll({}).entries).toEqual([]);
    expect(amounts({ players: [p(0, 0)] })).toEqual([0, 0, 0]);
  });
  it('keeps distinct players without IDs and deduplicates shared object references', () => {
    const first = p(undefined, 10), second = p(undefined, 20);
    expect(contractPayroll({ players: [first, second], farm: [first] }).total.amount).toBe(30);
  });
  it('does not mutate frozen arrays or objects and JSON roundtrip preserves results', () => {
    const t = fixture(); for (const roster of [t.players, t.farm]) { roster.forEach(Object.freeze); Object.freeze(roster); } Object.freeze(t);
    const before = JSON.stringify(t), r = contractPayroll(t);
    expect(contractPayroll(JSON.parse(before))).toEqual(r); expect(JSON.stringify(t)).toBe(before);
  });
});
