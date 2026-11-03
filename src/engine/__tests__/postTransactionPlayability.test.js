import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { assessPostTransactionPlayability } from '../postTransactionPlayability';
import { validateTeamRoster } from '../rosterAutomation';
import { selectFarmTeam } from '../farmSelection';
import { freezeEconomy } from './fixtures/economyWorld';
import { createInitialTeams } from '../bootstrapTeams';

// Two disjoint nine-batter lineups, each with a real catcher, and two pitchers.
function minimalTeam() {
  const players = Array.from({ length: 20 }, (_, id) => ({ id, name: `P${id}`, isPitcher: id >= 18,
    pos: id >= 18 ? '投手' : id % 9 === 0 ? '捕手' : '一塁手',
    injuryDaysLeft: 0, registrationCooldownDays: 0, salary: 1000, contractYearsLeft: 2 }));
  return { id: 0, budget: 1234, players: [...players.slice(0, 9), players[18]],
    farm: [...players.slice(9, 18), players[19]] };
}
const assess = t => assessPostTransactionPlayability(t, { round: 100 });
const owned = t => [...t.players, ...t.farm];
function prove(result, source) {
  expect(result.ok, JSON.stringify(result.reasons)).toBe(true);
  expect(validateTeamRoster(result.team).valid).toBe(true);
  expect(selectFarmTeam(result.team, { round: 100 }).status).toBe('ready');
  expect(owned(result.team).sort((a, b) => String(a.id).localeCompare(String(b.id))))
    .toEqual(owned(source).sort((a, b) => String(a.id).localeCompare(String(b.id))));
}

describe('post-transaction simultaneous playability', () => {
  it('proves a minimal simultaneous allocation, including ID zero, without mutation', () => {
    const t = freezeEconomy(minimalTeam()), before = structuredClone(t);
    prove(assess(t), t);
    expect(t).toEqual(before);
    expect(assess(JSON.parse(JSON.stringify(t)))).toEqual(assess(t));
  });

  it.each([
    ['catcher', t => { t.farm[0].pos = '一塁手'; }],
    ['pitcher', t => { t.farm = t.farm.filter(p => !p.isPitcher); }],
    ['batter', t => { t.farm.splice(1, 1); }],
    ['injured catcher', t => { t.farm[0].injuryDaysLeft = 1; }],
    ['retired catcher', t => { t.farm[0].isRetired = true; }],
  ])('rejects a shortage of %s without changing the source', (_, edit) => {
    const t = minimalTeam(); edit(t); const before = structuredClone(t); freezeEconomy(t);
    const r = assess(t);
    expect(r.ok).toBe(false); expect(r.reasons.length).toBeGreaterThan(0); expect(r.team).toBeUndefined();
    expect(t).toEqual(before);
  });

  it.each(['isIkusei', '育成'])('uses %s catchers in the farm but never as active eligibility', flag => {
    const t = minimalTeam(); t.farm[0][flag] = true;
    prove(assess(t), t);
    t.players[0][flag] = true;
    expect(assess(t).ok).toBe(false);
  });

  it('respects existing farm recall cooldown while allowing active players to stay active', () => {
    const t = minimalTeam(); t.players.forEach(p => { p.registrationCooldownDays = 3; });
    prove(assess(t), t);
    t.players[0].isIkusei = true; t.farm[0].registrationCooldownDays = 3;
    expect(assess(t).ok).toBe(false);
    t.farm[0].registrationCooldownDays = 0;
    prove(assess(t), t);
  });

  it('can reallocate an active surplus catcher to the farm', () => {
    const t = minimalTeam(); t.players.push(t.farm.shift());
    prove(assess(t), t);
  });

  it('accepts a secondary-position catcher and rejects fabricated catcher coverage', () => {
    const t = minimalTeam(); t.farm[0].pos = '一塁手'; t.farm[0].positions = { 捕手: 10 };
    prove(assess(t), t);
    t.farm[0].positions.捕手 = 0;
    expect(assess(t).ok).toBe(false);
  });

  it('does not impose a full 31-player roster or the strategic catcher target', () => {
    const t = minimalTeam(); const r = assess(t);
    expect(r.ok).toBe(true); expect(r.team.players).toHaveLength(10);
  });

  it('chooses domestic alternatives rather than rejecting a foreign-heavy input lineup', () => {
    const t = minimalTeam(); t.players.slice(0, 5).forEach(p => { p.isForeign = true; });
    prove(assess(t), t);
    owned(t).filter(p => !p.isPitcher).forEach(p => { p.isForeign = true; });
    expect(assess(t).ok).toBe(false);
  });

  it.each([
    t => { t.farm[0].id = 0; }, t => { t.farm[0].id = '0'; },
    t => { delete t.players[0].isPitcher; }, t => { t.farm[0].injuryDaysLeft = -1; },
    t => { t.farm[0].registrationCooldownDays = 'oops'; },
    t => { t.farm[0].registrationCooldownDays = -1; },
  ])('fails closed on malformed ownership or eligibility data', edit => {
    const t = minimalTeam(); edit(t); expect(assess(t).ok).toBe(false);
  });

  it.each([undefined, 0, 144, 1.5])('requires a real valid farm round (%s)', round => {
    expect(assessPostTransactionPlayability(minimalTeam(), { round }).ok).toBe(false);
  });

  it('checks actual game fixture rosters, with a paired catcher-loss rejection', () => {
    const fixture = JSON.parse(gunzipSync(readFileSync(new URL('../../../e2e/fixtures/new-game.json.gz', import.meta.url))));
    for (const t of fixture.teams) {
      const source = freezeEconomy(structuredClone(t)); prove(assess(source), source);
      const noCatchers = structuredClone(t);
      for (const p of owned(noCatchers)) {
        if (!p.isPitcher) { if (p.pos === '捕手') p.pos = '一塁手'; p.positions = { ...p.positions, 捕手: 0 }; }
      }
      expect(assess(noCatchers).ok).toBe(false);
    }
  });

  it('accepts current bundled new-game rosters and preserves every source player', () => {
    for (const t of createInitialTeams()) prove(assess(freezeEconomy(t)), t);
  });
});
