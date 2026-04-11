import { describe, it, expect } from 'vitest';
import { calcEffectiveFatigue, calcFatigue, matchupScore, initGameState } from '../simulation';
import { applyGameStatsFromLog } from '../postGame';
import { emptyStats } from '../player';

describe('calcFatigue', () => {
  it('投球数0のときは疲労0', () => {
    expect(calcFatigue(0, 50)).toBe(0);
  });
  it('スタミナが高いほど疲労が低い', () => {
    const lowStamina = calcFatigue(100, 30);
    const highStamina = calcFatigue(100, 80);
    expect(highStamina).toBeLessThan(lowStamina);
  });
  it('疲労値は 0〜100 の範囲に収まる', () => {
    const fatigue = calcFatigue(9999, 1);
    expect(fatigue).toBeGreaterThanOrEqual(0);
    expect(fatigue).toBeLessThanOrEqual(100);
  });
});

describe('calcEffectiveFatigue', () => {
  it('コンディション100・スタミナ高めで疲労が低い', () => {
    const pitcher = { pitching: { stamina: 80 }, condition: 100 };
    const fatigue = calcEffectiveFatigue(80, pitcher);
    expect(fatigue).toBeGreaterThanOrEqual(0);
    expect(fatigue).toBeLessThanOrEqual(100);
  });
  it('コンディションが低いほど疲労が高い', () => {
    const good = calcEffectiveFatigue(80, { pitching: { stamina: 60 }, condition: 100 });
    const bad  = calcEffectiveFatigue(80, { pitching: { stamina: 60 }, condition: 30 });
    expect(bad).toBeGreaterThan(good);
  });
  it('pitcher が undefined でもクラッシュしない', () => {
    expect(() => calcEffectiveFatigue(50, undefined)).not.toThrow();
  });
});

describe('matchupScore', () => {
  it('打者能力が高ければスコアが正（打者有利）', () => {
    const strongBatter = { batting: { contact: 90, power: 90, eye: 90 } };
    const weakPitcher  = { pitching: { velocity: 30, control: 30, breaking: 30 } };
    expect(matchupScore(strongBatter, weakPitcher)).toBeGreaterThan(0);
  });
  it('投手能力が高ければスコアが負（投手有利）', () => {
    const weakBatter   = { batting: { contact: 30, power: 30, eye: 30 } };
    const strongPitcher = { pitching: { velocity: 90, control: 90, breaking: 90 } };
    expect(matchupScore(weakBatter, strongPitcher)).toBeLessThan(0);
  });
  it('打者・投手が undefined でも 0 を返す', () => {
    expect(matchupScore(undefined, undefined)).toBe(0);
  });
});

describe('applyGameStatsFromLog — 盗塁BF除外', () => {
  it('isStolenBase:true のイベントは投手の BF にカウントされない', () => {
    const pitcher = { id: 'p1', isPitcher: true, stats: emptyStats() };
    const players = [pitcher];
    const log = [
      { scorer: false, pitcherId: 'p1', result: 'k', rbi: 0 },
      { scorer: false, pitcherId: 'p1', result: 'sb', isStolenBase: true, rbi: 0 },
    ];

    const updated = applyGameStatsFromLog(players, log, true);
    expect(updated[0].stats.BF).toBe(1);
    expect(updated[0].stats.Kp).toBe(1);
  });
});

describe('initGameState — rotation 空時のフォールバック', () => {
  it('rotation が空でも isPitcher な選手が myPitcher に設定される', () => {
    const myTeam = {
      id: 'my',
      lineup: ['b1'],
      rotation: [],
      rotIdx: 0,
      players: [
        { id: 'b1', name: 'Batter', isPitcher: false, batting: { contact: 50, power: 50, eye: 50 } },
        { id: 'rp1', name: 'Reliever', isPitcher: true, subtype: '中継ぎ', pitching: { velocity: 50, control: 50, breaking: 50 } },
      ],
    };
    const oppTeam = {
      id: 'opp',
      lineup: ['ob1'],
      rotation: [],
      rotIdx: 0,
      players: [
        { id: 'ob1', name: 'Opp Batter', isPitcher: false, batting: { contact: 50, power: 50, eye: 50 } },
        { id: 'op1', name: 'Opp Pitcher', isPitcher: true, subtype: '中継ぎ', pitching: { velocity: 50, control: 50, breaking: 50 } },
      ],
    };

    const gs = initGameState(myTeam, oppTeam);
    expect(gs.myPitcher).toBeDefined();
    expect(gs.myPitcher.id).toBe('rp1');
  });
});
