import { expect, it } from 'vitest';
import { evaluateCpuPosting } from '../cpuPosting';
const facts = { teamId: 1, playerId: 'p', sourceContractId: 'source', season: 2026, ageYears: 27,
  endSeason: 2028, mode: 'neutral', role: '捕手', minimumDepth: 3, remainingDepth: 3,
  value: 65, replacementValue: 65, core: false };
it.each([
  [{ remainingDepth: 2 }, 'reject', 'role-depth'],
  [{ core: true }, 'reject', 'controlled-core'],
  [{}, 'approve', 'replacement-covered'],
  [{ replacementValue: 60 }, 'reject', 'retain-strength'],
  [{ replacementValue: 60, ageYears: 30, endSeason: 2026 }, 'approve', 'expiring-veteran'],
  [{ core: true, replacementValue: 60, ageYears: 30, mode: 'rebuild' }, 'approve', 'rebuild-veteran'],
])('separates the club judgement %j from the player wish and market', (extra, decision, reason) => {
  expect(evaluateCpuPosting({ ...facts, ...extra })).toEqual({ decision, reason });
});
