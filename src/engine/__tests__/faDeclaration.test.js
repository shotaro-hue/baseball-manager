import { describe, expect, it, vi } from 'vitest';
import { assessFaDeclaration, faSeasonDraw, resolveOffseasonFaDeclarations } from '../faDeclaration';
import { cpuRenewContracts, calcPlayerDemand } from '../contract';
import { renewalEligible } from '../renewalRules';
import { addMarketSigning } from '../../components/hub/faMarket';
import { loadGame } from '../saveload';

const year = 2026;
const player = (id = 0, extra = {}) => ({ id, name: `選手${id}`, age: 30, pos: '外野手', salary: 21000,
  contractYearsLeft: 1, daysOnActiveRoster: 840, entryType: '大卒', trust: 50,
  personality: { money: 50, playing: 50, winning: 50, loyalty: 50, stability: 50, future: 50 },
  stats: { PA: 684, AB: 623, H: 184, BB: 45, HBP: 8, SF: 8, D: 10, T: 0, HR: 27, RBI: 83 }, ...extra });
const team = (id = 0, players = []) => ({ id, name: `球団${id}`, league: 'セ', city: '東京', wins: 70, losses: 70,
  budget: 1000000, players, farm: [], lineup: players.map(p => p.id), rotation: [] });
const lowDrawPlayer = t => {
  for (let id = 0; id < 10000; id++) if (faSeasonDraw(player(id), t, year) < .02) return player(id);
  throw new Error('no low season draw');
};

describe('common offseason expiry', () => {
  it('includes left=0/1, excludes multi-year, retired, unknown and this-year signed', () => {
    for (const left of [0, 1]) expect(renewalEligible(player(0, { contractYearsLeft: left }), year)).toBe(true);
    for (const extra of [{ contractYearsLeft: 2 }, { contractYearsLeft: undefined }, { contractYearsLeft: NaN }, { isRetired: true }, { _retireNow: true }, { contractSignedYear: year }]) expect(renewalEligible(player(0, extra), year)).toBe(false);
  });
  it('renews CPU left=1 once without changing multi-year contracts', () => {
    const cpu = team(1, [player(0), player(1, { contractYearsLeft: 2 })]);
    const result = cpuRenewContracts([team(), cpu], 0, [cpu], { year });
    expect(result.updatedTeams[1].players[0].contractSignedYear).toBe(year);
    expect(result.updatedTeams[1].players[1]).toEqual(cpu.players[1]);
    const repeated = cpuRenewContracts(result.updatedTeams, 0, result.updatedTeams, { year });
    expect(repeated.updatedTeams).toEqual(result.updatedTeams);
  });
});

describe('independent FA declaration', () => {
  it('excludes ineligible/unknown/recorded-zero days, foreigners, ikusei and ongoing contracts', () => {
    for (const extra of [{ daysOnActiveRoster: 839 }, { daysOnActiveRoster: undefined, serviceYears: undefined }, { daysOnActiveRoster: 0, serviceYears: 10 }, { isForeign: true }, { 育成: true }, { contractYearsLeft: 2 }, { isRetired: true }, { contractSignedYear: year }]) expect(assessFaDeclaration(player(0, extra), team(), year)).toBeNull();
    expect(assessFaDeclaration(player(0, { daysOnActiveRoster: undefined, serviceYears: 7 }), team(), year)).not.toBeNull();
  });
  it('keeps overseas hopeful policy unchanged', () => {
    expect(assessFaDeclaration(player(0, { personality: { overseas: 70 } }), team(), year)).toBeNull();
  });
  it('raises market interest for lack of playing time and distrust, not missing appearances', () => {
    const p = player(); const t = team();
    const base = assessFaDeclaration(p, t, year);
    expect(assessFaDeclaration({ ...p, stats: { PA: 0 } }, t, year).probability).toBeGreaterThan(base.probability);
    expect(assessFaDeclaration({ ...p, trust: 0 }, t, year).probability).toBeGreaterThan(base.probability);
    expect(assessFaDeclaration({ ...p, stats: {} }, t, year).probability).toBe(base.probability);
    expect(assessFaDeclaration({ ...p, personality: { ...p.personality, loyalty: 100, stability: 100 } }, t, year).probability).toBeLessThan(base.probability);
  });
  it('holds the season decision through reload, stat changes and unrelated random draws', () => {
    const p = player(); const t = team(); const first = assessFaDeclaration(p, t, year);
    for (let i = 0; i < 100; i++) Math.random();
    expect(assessFaDeclaration(JSON.parse(JSON.stringify(p)), t, year)).toEqual(first);
    expect(assessFaDeclaration({ ...p, trust: 0, faDeclarationDecision: first }, t, year)).toEqual(first);
    expect(faSeasonDraw(p, t, year + 1)).not.toBe(first.draw);
    expect(faSeasonDraw(player('0'), t, year)).not.toBe(first.draw);
  });
  it('allows affordable players from BOTH user and CPU clubs to declare before renewal', () => {
    const mine = team(0); const cpu = team(1);
    mine.players = [lowDrawPlayer(mine)]; cpu.players = [lowDrawPlayer(cpu)];
    mine.lineup = [mine.players[0].id]; cpu.lineup = [cpu.players[0].id];
    const original = JSON.stringify([mine, cpu]);
    const result = resolveOffseasonFaDeclarations([mine, cpu], year);
    expect(result.newFaPlayers).toHaveLength(2);
    expect(result.updatedTeams.every(t => !t.players.length && !t.lineup.length)).toBe(true);
    expect(result.newFaPlayers.map(p => p.faOriginTeamId)).toEqual([0, 1]);
    expect(result.newFaPlayers[0].salary).toBe(calcPlayerDemand(mine.players[0]).demandSalary);
    expect(result.newFaPlayers[0].marketLastStats).toEqual(mine.players[0].stats);
    expect(result.newFaPlayers[0].faDeclarationDecision.declared).toBe(true);
    expect(JSON.stringify([mine, cpu])).toBe(original);
    expect(resolveOffseasonFaDeclarations(result.updatedTeams, year).newFaPlayers).toHaveLength(0);
  });
  it('does not force every eligible player into the market or retain everyone', () => {
    const t = team(); t.players = Array.from({ length: 1000 }, (_, id) => player(id));
    const r = resolveOffseasonFaDeclarations([t], year);
    expect(r.newFaPlayers.length).toBeGreaterThan(40);
    expect(r.newFaPlayers.length).toBeLessThan(150);
  });
  it('permits declaration-and-stay without losing or double-archiving this season', () => {
    const t = team(); t.players = [lowDrawPlayer(t)];
    const result = resolveOffseasonFaDeclarations([t], year);
    const signed = addMarketSigning(result.updatedTeams[0], result.newFaPlayers[0], result.newFaPlayers[0].salary, 1, year, 'offseason');
    expect(signed.players[0].stats).toEqual(t.players[0].stats);
    expect(signed.players[0].faArchivedYear).toBeUndefined();
    expect(renewalEligible(signed.players[0], year)).toBe(false);
    expect(signed.budget).toBe(t.budget - result.newFaPlayers[0].salary);
  });
  it('preserves season decisions and actual registration zero through real save migration', async () => {
    const t = team(); const p = player(0); const decision = assessFaDeclaration(p, t, year);
    const saved = { teams: [team(0, [{ ...p, daysOnActiveRoster: 0, faDeclarationDecision: decision }])],
      myId: 0, year, gameDay: 143, faPool: [{ ...p, isFA: true, faDeclarationDecision: decision }], saveDataVersion: 2 };
    vi.stubGlobal('localStorage', { getItem: key => key === 'baseball_manager_v1' ? JSON.stringify(saved) : null });
    try {
      const loaded = await loadGame();
      expect(loaded.teams[0].players[0].faDeclarationDecision).toEqual(decision);
      expect(loaded.teams[0].players[0].daysOnActiveRoster).toBe(0);
      expect(loaded.faPool[0].faDeclarationDecision).toEqual(decision);
    } finally { vi.unstubAllGlobals(); }
  });
});
