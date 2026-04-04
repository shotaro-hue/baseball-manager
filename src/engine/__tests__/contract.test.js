import { describe, it, expect } from 'vitest';
import { getFaThreshold, evalOffer, processCpuFaBids } from '../contract';

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

describe('processCpuFaBids foreign roster constraint', () => {
  const mkPitcher = (id) => ({
    id, name: `P-${id}`, age: 28, pos: '先発', isPitcher: true, isForeign: true, salary: 5000000,
    personality: { money: 50, winning: 50, playing: 50, hometown: 30, loyalty: 50, stability: 50, future: 50 },
    trust: 60, hometown: '東京', pitching: { velocity: 72, control: 70, breaking: 68, stamina: 67, clutchP: 60 }, subtype: '先発',
  });
  const mkBatter = (id) => ({
    id, name: `B-${id}`, age: 28, pos: '一塁手', isPitcher: false, isForeign: true, salary: 5000000,
    personality: { money: 50, winning: 50, playing: 50, hometown: 30, loyalty: 50, stability: 50, future: 50 },
    trust: 60, hometown: '東京', batting: { contact: 72, power: 70, eye: 68, speed: 60, clutch: 62 },
  });

  it('外国人投手4人目になる入札はfarmに配置される', () => {
    const cpu = {
      id: 1, name: 'CPU', emoji: '🤖', league: 'セ', wins: 60, losses: 60, city: '東京', budget: 999999999,
      lineup: [], farm: [], players: [mkPitcher('a'), mkPitcher('b'), mkPitcher('c')],
    };
    const my = { id: 0, name: 'ME', league: 'セ', wins: 60, losses: 60, city: '大阪', budget: 999999999, lineup: [], farm: [], players: [] };
    const target = mkPitcher('target');
    const res = processCpuFaBids([my, cpu], 0, [target], [my, cpu]);
    const updatedCpu = res.updatedTeams.find(t => t.id === 1);
    expect(updatedCpu.players.some(p => p.id === 'target')).toBe(false);
    expect((updatedCpu.farm || []).some(p => p.id === 'target')).toBe(true);
  });

  it('4人目でも投打バランスを満たす場合は一軍登録される', () => {
    const cpu = {
      id: 1, name: 'CPU', emoji: '🤖', league: 'セ', wins: 60, losses: 60, city: '東京', budget: 999999999,
      lineup: [], farm: [], players: [mkPitcher('a'), mkPitcher('b'), mkBatter('c')],
    };
    const my = { id: 0, name: 'ME', league: 'セ', wins: 60, losses: 60, city: '大阪', budget: 999999999, lineup: [], farm: [], players: [] };
    const target = mkPitcher('target');
    const res = processCpuFaBids([my, cpu], 0, [target], [my, cpu]);
    const updatedCpu = res.updatedTeams.find(t => t.id === 1);
    expect(updatedCpu.players.some(p => p.id === 'target')).toBe(true);
    expect((updatedCpu.farm || []).some(p => p.id === 'target')).toBe(false);
  });
});


describe('processCpuFaBids multi-signing', () => {
  const mkBatter = (id, salary = 4200000, age = 25) => ({
    id, name: `B-${id}`, age, pos: '左翼手', isPitcher: false, isForeign: false, salary,
    batting: { contact: 65, power: 60, eye: 55, speed: 50, arm: 50, defense: 50,
      catching: 0, stealSkill: 0, baseRunning: 0, clutch: 50, vsLeft: 50, breakingBall: 50, stamina: 50, recovery: 50 },
    personality: { money: 50, winning: 50, playing: 50, hometown: 30, loyalty: 50, stability: 50, future: 50 },
    trust: 60, hometown: '東京',
  });
  const mkStarter = (id, salary = 4200000) => ({
    id, name: `P-${id}`, age: 28, pos: '先発', isPitcher: true, subtype: '先発', isForeign: false, salary,
    pitching: { velocity: 65, control: 60, stamina: 60, breaking: 55, variety: 50,
      sharpness: 50, tempo: 50, clutchP: 50, recovery: 50, durability: 50 },
    personality: { money: 50, winning: 50, playing: 50, hometown: 30, loyalty: 50, stability: 50, future: 50 },
    trust: 60, hometown: '東京',
  });

  it('CPU チームが予算内で2名を獲得できる', () => {
    const cpu = {
      id: 1, name: 'CPU', league: 'セ', wins: 70, losses: 70, city: '東京',
      budget: 20000000, lineup: [], farm: [],
      players: [mkStarter('s1'), mkStarter('s2'), mkStarter('s3')],
    };
    const my = { id: 0, name: 'ME', league: 'セ', wins: 60, losses: 60, city: '大阪', budget: 0, lineup: [], farm: [], players: [] };
    const fa1 = mkStarter('fa1', 4200000);
    const fa2 = mkBatter('fa2', 4200000);
    const res = processCpuFaBids([my, cpu], 0, [fa1, fa2], [my, cpu]);
    const updatedCpu = res.updatedTeams.find((t) => t.id === 1);
    expect(updatedCpu.players.length).toBeGreaterThanOrEqual(5);
    expect(res.news.length).toBeGreaterThanOrEqual(2);
  });

  it('ロスター MAX_ROSTER(28) 到達で獲得を停止する', () => {
    const players = Array.from({ length: 28 }, (_, i) => mkBatter(`p${i}`));
    const cpu = {
      id: 1, name: 'CPU', league: 'セ', wins: 70, losses: 70, city: '東京',
      budget: 99999999, lineup: [], farm: [], players,
    };
    const my = { id: 0, name: 'ME', league: 'セ', wins: 60, losses: 60, city: '大阪', budget: 0, lineup: [], farm: [], players: [] };
    const res = processCpuFaBids([my, cpu], 0, [mkBatter('faX')], [my, cpu]);
    const updatedCpu = res.updatedTeams.find((t) => t.id === 1);
    expect(updatedCpu.players.length).toBe(28);
  });

  it('先発不足チームが先発投手を野手より優先して獲得する', () => {
    const cpu = {
      id: 1, name: 'CPU', league: 'セ', wins: 50, losses: 50, city: '東京',
      budget: 10000000, lineup: [], farm: [],
      players: [mkStarter('s1'), mkStarter('s2')],
    };
    const my = { id: 0, name: 'ME', league: 'セ', wins: 60, losses: 60, city: '大阪', budget: 0, lineup: [], farm: [], players: [] };
    const starter = mkStarter('faS', 5000000);
    const batter = mkBatter('faB', 4200000);
    const res = processCpuFaBids([my, cpu], 0, [batter, starter], [my, cpu]);
    const updatedCpu = res.updatedTeams.find((t) => t.id === 1);
    const signedIds = updatedCpu.players.map((p) => p.id);
    expect(signedIds).toContain('faS');
  });
});
