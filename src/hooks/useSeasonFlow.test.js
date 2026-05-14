import { describe, expect, it } from 'vitest';
import { buildSafeGameResult } from './useSeasonFlow';

describe('buildSafeGameResult', () => {
  it('normalizes tactical game results for post-game handling', () => {
    const oppTeam = { id: 'opp', name: 'Opponents' };
    const result = buildSafeGameResult(
      {
        score: { my: 5, opp: 3 },
      },
      {
        oppTeam,
        gameNo: 12,
        source: 'tactical',
      },
    );

    expect(result.won).toBe(true);
    expect(result.drew).toBe(false);
    expect(result.log).toEqual([]);
    expect(result.inningSummary).toEqual([]);
    expect(result.oppTeam).toBe(oppTeam);
    expect(result.gameNo).toBe(12);
    expect(result._source).toBe('tactical');
  });
});
