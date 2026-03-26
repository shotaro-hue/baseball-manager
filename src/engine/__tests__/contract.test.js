import { describe, it, expect } from 'vitest';
import { getFaThreshold, evalOffer } from '../contract';

describe('getFaThreshold', () => {
  it('高卒（entryAge=18）は国内FA 8年', () => {
    expect(getFaThreshold({ entryAge: 18 })).toEqual({ domestic: 8, overseas: 9 });
  });
  it('高卒上限（entryAge=19）は国内FA 8年', () => {
    expect(getFaThreshold({ entryAge: 19 })).toEqual({ domestic: 8, overseas: 9 });
  });
  it('大卒（entryAge=22）は国内FA 7年', () => {
    expect(getFaThreshold({ entryAge: 22 })).toEqual({ domestic: 7, overseas: 9 });
  });
  it('社会人（entryAge=24）は国内FA 7年', () => {
    expect(getFaThreshold({ entryAge: 24 })).toEqual({ domestic: 7, overseas: 9 });
  });
  it('entryAge が未定義の場合は大卒扱い（7年）', () => {
    expect(getFaThreshold({})).toEqual({ domestic: 7, overseas: 9 });
  });
});

describe('evalOffer', () => {
  const basePlayer = {
    salary: 10000000,
    trust: 60,
    hometown: '東京',
    personality: { money: 50, winning: 50, playing: 50, hometown: 30, loyalty: 50, stability: 50, future: 50 },
  };
  const baseTeam = {
    id: 't1',
    league: 'セ',
    wins: 70,
    losses: 60,
    city: '大阪',
    lineup: [],
    players: Array.from({ length: 25 }, (_, i) => ({ id: `p${i}`, age: 26 })),
    budget: 999999999,
  };
  const allTeams = [baseTeam];

  it('現年俸の2倍オファーは moneyScore が高い', () => {
    const highOffer = { salary: 20000000, years: 1 };
    const lowOffer  = { salary: 5000000,  years: 1 };
    const high = evalOffer(basePlayer, highOffer, baseTeam, allTeams);
    const low  = evalOffer(basePlayer, lowOffer,  baseTeam, allTeams);
    expect(high.breakdown.money.score).toBeGreaterThan(low.breakdown.money.score);
  });
  it('3年契約は stability スコアが高い', () => {
    const multi = evalOffer(basePlayer, { salary: 10000000, years: 3 }, baseTeam, allTeams);
    const single = evalOffer(basePlayer, { salary: 10000000, years: 1 }, baseTeam, allTeams);
    expect(multi.breakdown.stability.score).toBeGreaterThan(single.breakdown.stability.score);
  });
  it('total は 0〜100 の範囲に収まる', () => {
    const result = evalOffer(basePlayer, { salary: 10000000, years: 1 }, baseTeam, allTeams);
    expect(result.total).toBeGreaterThanOrEqual(0);
    expect(result.total).toBeLessThanOrEqual(100);
  });
});
