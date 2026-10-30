import { describe, expect, it } from 'vitest';
import { auditPlayerMaster, normalizedName, rosterKey, AS_OF } from './audit-player-master.mjs';
import { NPB2025_ROSTERS, MULTI_YEAR_CONTRACT_END_YEAR_BY_PLAYER } from '../src/data/npb2025.js';
import { TEAM_DEFS } from '../src/constants.js';

describe('2026 opening roster source audit', () => {
  it('keeps 12 distinct team IDs with no false completion claim', () => {
    const report = auditPlayerMaster();
    expect(report.asOf).toBe(AS_OF);
    expect(report.teams).toHaveLength(12);
    expect(report.currentCount).toBe(445);
    expect(report.development).toBe(0);
    expect(report.referenceCount).toBeNull();
    expect(report.counts['post-opening-performance']).toBe(445);
    expect(report.counts['missing-history']).toBeGreaterThan(0);
  });

  it('applies each present multi-year contract using the actual team mapping', () => {
    const report = auditPlayerMaster();
    expect(report.counts['contract-year-not-applied'] ?? 0).toBe(0);
    expect(report.matchedContracts).toBeGreaterThanOrEqual(35);
    for (const [key, year] of MULTI_YEAR_CONTRACT_END_YEAR_BY_PLAYER) {
      const [teamName, playerName] = key.split('::');
      const team = TEAM_DEFS.find(t => t.name === teamName);
      expect(team).toBeDefined();
      const entries = [...NPB2025_ROSTERS[team.id].batters, ...NPB2025_ROSTERS[team.id].pitchers];
      const found = entries.find(p => p.name === playerName);
      if (found) expect(found.contractEndYear).toBe(year);
    }
  });

  it('normalizes Japanese names for matching but does not merge across teams', () => {
    expect(normalizedName('山田　哲人')).toBe('山田哲人');
    expect(rosterKey(1, '山田　哲人')).not.toBe(rosterKey(3, '山田 哲人'));
  });

  it('detects unknown player, incorrect registration and wrong-team mapping', () => {
    const base = Array.from({ length: 810 }, (_, i) => ({
      teamId: i % 12, name: `架空照合${i}`, registration: i === 0 ? 'development' : 'controlled',
    }));
    const real = NPB2025_ROSTERS[0].batters[0];
    base[0] = { teamId: 0, name: real.name, registration: 'development' };
    const report = auditPlayerMaster(undefined, { scope: 'all', asOf: AS_OF, players: base });
    expect(report.missing.length).toBeGreaterThan(700);
    expect(report.mismatched).toEqual(expect.arrayContaining([
      expect.objectContaining({teamId:0,name:real.name,expectedRegistration:'development'}),
    ]));
    expect(report.unexpected.length).toBeGreaterThan(0);
  });

  it('refuses invalid reference year, incomplete population and duplicate names', () => {
    expect(() => auditPlayerMaster(undefined, {scope:'all',asOf:'2026-10-31',players:[]})).toThrow(/2026-03-27/);
    expect(() => auditPlayerMaster(undefined, {scope:'all',asOf:AS_OF,players:[]})).toThrow(/800/);
    const players = Array.from({length:800},(_,i)=>({teamId: i%12,name:`照合${i}`,registration:'controlled'}));
    players[1]={...players[0]};
    expect(() => auditPlayerMaster(undefined, {scope:'all',asOf:AS_OF,players})).toThrow(/duplicate/);
  });
});
