import { it, expect } from 'vitest';
import { faWinter, declaration } from './fixtures/faDeclarations';
import { initializePlayerEligibility } from '../playerEligibility';
import { reduceEconomyCommand } from '../contractEconomy';
import { validateEconomySave } from '../economyPersistence';
import frozen from './fixtures/preFixV2FaEvidence.json';

it('issues separate day evidence for new certificates while retaining frozen pre-fix v2 JSON/replay', () => {
  const old = structuredClone(frozen.world), before = JSON.stringify(old);
  expect(validateEconomySave(old)).toBe('annual');
  expect(reduceEconomyCommand(old, frozen.command)).toMatchObject({ ok: true, replayed: true });
  expect(JSON.stringify(old)).toBe(before);
  const w = faWinter(), original = w.teams[0].players[0];
  w.teams[0].players[0] = initializePlayerEligibility({ ...original, daysOnActiveRoster: undefined }, {
    year: 2026, opening: { qualified: 'domestic', sourceIds: ['https://npb.jp/announcement/2025/fa_qualified.html'] },
  });
  const command = declaration(w), result = reduceEconomyCommand(w, command);
  expect(result.ok, result.error).toBe(true);
  expect(result.world.contractEconomy.engine.faDeclarations[0].eligibility).toMatchObject({
    evidenceVersion: 1, estimated: true, basis: { kind: 'official' }, daysBasis: { kind: 'game-estimate' },
  });
  expect(validateEconomySave(JSON.parse(JSON.stringify(result.world)))).toBe('annual');
  for (const world of [old, result.world]) {
    const forged = structuredClone(world), d = forged.contractEconomy.engine.faDeclarations[0];
    d.eligibility.estimated = !d.eligibility.estimated;
    // Even rewriting the redundant receipt must not bypass evidence validation.
    forged.contractEconomy.engine.transactions.find(t => t.id === d.id).faDeclaration = structuredClone(d);
    expect(() => validateEconomySave(forged)).toThrow();
  }
});
