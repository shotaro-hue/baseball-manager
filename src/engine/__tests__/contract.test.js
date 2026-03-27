import { describe, it, expect } from 'vitest';
import { getFaThreshold, evalOffer } from '../contract';

describe('getFaThreshold', () => {
  it('高卒は国内FA 960日 (8年×120)', () => {
    expect(getFaThreshold({ entryType: '高卒' })).toEqual({ domestic: 960, overseas: 1080 });
  });
  it('外国人は国内FA 960日', () => {
    expect(getFaThreshold({ entryType: '外国人' })).toEqual({ domestic: 960, overseas: 1080 });
  });
  it('大卒は国内FA 840日 (7年×120)', () => {
    expect(getFaThreshold({ entryType: '大卒' })).toEqual({ domestic: 840, overseas: 1080 });
  });
  it('社会人は国内FA 840日', () => {
    expect(getFaThreshold({ entryType: '社会人' })).toEqual({ domestic: 840, overseas: 1080 });
  });
  it('entryType 未定義の場合は大卒扱い（840日）', () => {
    expect(getFaThreshold({})).toEqual({ domestic: 840, overseas: 1080 });
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
