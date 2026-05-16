import { describe, expect, it } from 'vitest';
import { quickSimGame } from '../simulation';

function buildTeam(id, prefix) {
  return {
    id,
    name: prefix,
    short: prefix,
    lineup: ['b1', 'b2', 'b3'],
    rotation: ['p1'],
    rotIdx: 0,
    players: [
      { id: 'b1', name: `${prefix} Batter 1`, isPitcher: false, pos: 'CF', batting: { contact: 55, power: 45, eye: 50, speed: 55 } },
      { id: 'b2', name: `${prefix} Batter 2`, isPitcher: false, pos: 'SS', batting: { contact: 52, power: 44, eye: 52, speed: 54 } },
      { id: 'b3', name: `${prefix} Batter 3`, isPitcher: false, pos: '1B', batting: { contact: 58, power: 51, eye: 48, speed: 42 } },
      { id: 'p1', name: `${prefix} Pitcher`, isPitcher: true, subtype: '先発', pitching: { velocity: 55, control: 52, breaking: 53, stamina: 60 } },
      { id: 'rp1', name: `${prefix} Reliever`, isPitcher: true, subtype: '中継ぎ', pitching: { velocity: 53, control: 50, breaking: 51, stamina: 40 } },
    ],
  };
}

describe('quickSimGame fast mode', () => {
  it('can skip full logs while keeping summary payloads', () => {
    const result = quickSimGame(buildTeam('home', 'HOME'), buildTeam('away', 'AWAY'), {
      simulationMode: 'fast',
      includeLog: false,
      includePhysics: false,
      includeCrossParkAnalysis: false,
    });

    expect(result.score).toEqual(expect.objectContaining({ my: expect.any(Number), opp: expect.any(Number) }));
    expect(result.inningSummary).toEqual(expect.any(Array));
    expect(result.highlights).toEqual(expect.any(Array));
    expect(result.log).toEqual([]);
  });
});
