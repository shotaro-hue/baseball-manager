import { describe, it, expect } from 'vitest';
import { calcEffectiveFatigue, calcFatigue, matchupScore, initGameState, _generateContactEVLA_TEST, _getFenceDistanceBySpray_TEST, _adjustResultByPhysics_TEST } from '../simulation';
import { applyGameStatsFromLog } from '../postGame';
import { emptyStats } from '../player';
import { PHYSICS_BAT } from '../../constants';

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


describe('generateContactEVLA', () => {
  it('パワー打者(power=99)は平均EV > コンタクト打者(power=30)', () => {
    const powerBat = { batting: { power: 99, contact: 50 } };
    const contBat = { batting: { power: 30, contact: 80 } };
    const pit = { pitching: { velocity: 50, breaking: 50 } };

    const sample = (batter) => Array.from({ length: 200 }, () => _generateContactEVLA_TEST(batter, pit).ev)
      .reduce((a, b) => a + b, 0) / 200;

    expect(sample(powerBat)).toBeGreaterThan(sample(contBat));
  });

  it('投手stuff=99 は stuff=1 よりEVを下げる', () => {
    const batter = { batting: { power: 70, contact: 50 } };
    const weakPit = { pitching: { velocity: 1, breaking: 1 } };
    const strongPit = { pitching: { velocity: 99, breaking: 99 } };

    const sample = (pitcher) => Array.from({ length: 200 }, () => _generateContactEVLA_TEST(batter, pitcher).ev)
      .reduce((a, b) => a + b, 0) / 200;

    expect(sample(strongPit)).toBeLessThan(sample(weakPit));
  });

  it('power=70 の打者は平均LA > power=30 の打者', () => {
    const highPower = { batting: { power: 70, contact: 50 } };
    const lowPower = { batting: { power: 30, contact: 80 } };
    const pit = { pitching: { velocity: 50, breaking: 50 } };

    const sample = (batter) => Array.from({ length: 200 }, () => _generateContactEVLA_TEST(batter, pit).la)
      .reduce((a, b) => a + b, 0) / 200;

    expect(sample(highPower)).toBeGreaterThan(sample(lowPower));
  });

  it('EV の最小値が EV_FLOOR 以上', () => {
    const batter = { batting: { power: 1, contact: 50 } };
    const pitcher = { pitching: { velocity: 99, breaking: 99 } };
    const minEv = Math.min(...Array.from({ length: 500 }, () => _generateContactEVLA_TEST(batter, pitcher).ev));
    expect(minEv).toBeGreaterThanOrEqual(PHYSICS_BAT.EV_FLOOR);
  });
});


describe('physics HR/D log correction helpers', () => {
  const stadium = { lf: 100, cf: 122, rf: 98 };

  it('spray angle でフェンス距離を選択する', () => {
    expect(_getFenceDistanceBySpray_TEST(stadium, 20)).toBe(100);
    expect(_getFenceDistanceBySpray_TEST(stadium, 45)).toBe(122);
    expect(_getFenceDistanceBySpray_TEST(stadium, 70)).toBe(98);
  });

  it('dist がフェンス未満のHRはログ上で2塁打に補正される', () => {
    expect(_adjustResultByPhysics_TEST('hr', 118, 45, stadium)).toBe('d');
  });

  it('dist がフェンス+8以上の2塁打はログ上でHRに補正される', () => {
    expect(_adjustResultByPhysics_TEST('d', 130, 45, stadium)).toBe('hr');
  });
});
