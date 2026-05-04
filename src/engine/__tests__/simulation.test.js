import { describe, it, expect, vi } from 'vitest';
import {
  calcEffectiveFatigue,
  calcFatigue,
  matchupScore,
  initGameState,
  _generateContactEVLA_TEST,
  _getFenceDistanceBySpray_TEST,
  _adjustResultByPhysics_TEST,
  _resolveBattedBallOutcomeFromPhysics_TEST,
  _checkHomeRunByTrajectory_TEST,
} from '../simulation';
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
    const good = calcEffectiveFatigue(80, {
      pitching: { stamina: 60 },
      condition: 100,
    });
    const bad = calcEffectiveFatigue(80, {
      pitching: { stamina: 60 },
      condition: 30,
    });

    expect(bad).toBeGreaterThan(good);
  });

  it('pitcher が undefined でもクラッシュしない', () => {
    expect(() => calcEffectiveFatigue(50, undefined)).not.toThrow();
  });
});

describe('matchupScore', () => {
  it('打者能力が高ければスコアが正（打者有利）', () => {
    const strongBatter = { batting: { contact: 90, power: 90, eye: 90 } };
    const weakPitcher = { pitching: { velocity: 30, control: 30, breaking: 30 } };

    expect(matchupScore(strongBatter, weakPitcher)).toBeGreaterThan(0);
  });

  it('投手能力が高ければスコアが負（投手有利）', () => {
    const weakBatter = { batting: { contact: 30, power: 30, eye: 30 } };
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
        {
          id: 'b1',
          name: 'Batter',
          isPitcher: false,
          batting: { contact: 50, power: 50, eye: 50 },
        },
        {
          id: 'rp1',
          name: 'Reliever',
          isPitcher: true,
          subtype: '中継ぎ',
          pitching: { velocity: 50, control: 50, breaking: 50 },
        },
      ],
    };

    const oppTeam = {
      id: 'opp',
      lineup: ['ob1'],
      rotation: [],
      rotIdx: 0,
      players: [
        {
          id: 'ob1',
          name: 'Opp Batter',
          isPitcher: false,
          batting: { contact: 50, power: 50, eye: 50 },
        },
        {
          id: 'op1',
          name: 'Opp Pitcher',
          isPitcher: true,
          subtype: '中継ぎ',
          pitching: { velocity: 50, control: 50, breaking: 50 },
        },
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

    const sample = (batter) => {
      const values = Array.from({ length: 600 }, () => _generateContactEVLA_TEST(batter, pit).ev);
      return values.reduce((a, b) => a + b, 0) / values.length;
    };

    expect(sample(powerBat)).toBeGreaterThan(sample(contBat));
  });

  it('投手stuff=99 は stuff=1 よりEVを下げる', () => {
    const batter = { batting: { power: 70, contact: 50 } };
    const weakPit = { pitching: { velocity: 1, breaking: 1 } };
    const strongPit = { pitching: { velocity: 99, breaking: 99 } };

    const sample = (pitcher) => {
      const values = Array.from({ length: 600 }, () => _generateContactEVLA_TEST(batter, pitcher).ev);
      return values.reduce((a, b) => a + b, 0) / values.length;
    };

    expect(sample(strongPit)).toBeLessThan(sample(weakPit));
  });

  it('LA は仕様レンジ内に収まる', () => {
    const batter = { batting: { power: 70, contact: 50 } };
    const pit = { pitching: { velocity: 50, breaking: 50 } };

    const values = Array.from({ length: 200 }, () => _generateContactEVLA_TEST(batter, pit).la);

    expect(Math.min(...values)).toBeGreaterThanOrEqual(PHYSICS_BAT.LA.MIN);
    expect(Math.max(...values)).toBeLessThanOrEqual(PHYSICS_BAT.LA.MAX);
  });

  it('EV の最小値が EV.MIN 以上', () => {
    const batter = { batting: { power: 1, contact: 50 } };
    const pitcher = { pitching: { velocity: 99, breaking: 99 } };

    const minEv = Math.min(
      ...Array.from({ length: 500 }, () => _generateContactEVLA_TEST(batter, pitcher).ev)
    );

    expect(minEv).toBeGreaterThanOrEqual(PHYSICS_BAT.EV.MIN);
  });
});

describe('physics HR/D log correction helpers', () => {
  const stadium = { lf: 100, cf: 122, rf: 98 };

  it('spray angle でフェンス距離を選択する', () => {
    expect(_getFenceDistanceBySpray_TEST(stadium, 0)).toBe(100);
    expect(_getFenceDistanceBySpray_TEST(stadium, 45)).toBe(122);
    expect(_getFenceDistanceBySpray_TEST(stadium, 90)).toBe(98);
    expect(_getFenceDistanceBySpray_TEST(stadium, 22.5)).toBeGreaterThan(100);
    expect(_getFenceDistanceBySpray_TEST(stadium, 22.5)).toBeLessThan(122);
  });

  it('dist がフェンス未満のHRはログ上で2塁打に補正される', () => {
    expect(_adjustResultByPhysics_TEST('hr', 118, 45, stadium)).toBe('d');
  });
});

describe('physicsMeta integration', () => {
  const batter = { batting: { power: 70, contact: 60 } };
  const pitcher = { pitching: { velocity: 60, breaking: 60 } };
  const stadium = { lf: 100, cf: 122, rf: 100 };

  it('同一入力で physicsMeta.distance が一致する（再現性）', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);

    try {
      const fixedOptions = { config: { evNoise: 0, laNoise: 0 } };

      const a = _resolveBattedBallOutcomeFromPhysics_TEST(
        batter,
        pitcher,
        stadium,
        { windOut: 0 },
        fixedOptions
      );

      const b = _resolveBattedBallOutcomeFromPhysics_TEST(
        batter,
        pitcher,
        stadium,
        { windOut: 0 },
        fixedOptions
      );

      expect(a.physicsMeta.distance).toBe(b.physicsMeta.distance);
    } finally {
      randomSpy.mockRestore();
    }
  });

  it('physicsMeta に quality / fenceDistance / hrCheck / isHrByTrajectory が含まれる', () => {
    const resolved = _resolveBattedBallOutcomeFromPhysics_TEST(
      batter,
      pitcher,
      stadium,
      { windOut: 0 },
      { config: { evNoise: 0, laNoise: 0 } }
    );

    expect(['weak', 'normal', 'solid', 'hard', 'barrel']).toContain(resolved.physicsMeta.quality);
    expect(typeof resolved.physicsMeta.fenceDistance).toBe('number');
    expect(typeof resolved.physicsMeta.isHrByTrajectory).toBe('boolean');
    expect(typeof resolved.physicsMeta.hrCheck).toBe('object');
    expect(typeof resolved.physicsMeta.hrCheck?.isHomeRun).toBe('boolean');
    expect(typeof resolved.physicsMeta.hrCheck?.fenceDistance).toBe('number');
  });

  it('向かい風/追い風で平均飛距離が逆方向に変化する（±2m許容）', () => {
    const sampleAverageDistance = (windOut) => {
      const distances = Array.from({ length: 80 }, () => {
        return _resolveBattedBallOutcomeFromPhysics_TEST(
          batter,
          pitcher,
          stadium,
          { windOut },
          { config: { evNoise: 0, laNoise: 0 } }
        ).physicsMeta.distance;
      });

      return distances.reduce((sum, distance) => sum + distance, 0) / distances.length;
    };

    // windOut > 0 を外野方向への追い風、windOut < 0 を向かい風として検証する。
    const headwindAverage = sampleAverageDistance(-10);
    const tailwindAverage = sampleAverageDistance(10);
    
    expect(tailwindAverage).toBeGreaterThanOrEqual(headwindAverage + 2);
  });
});

describe('checkHomeRunByTrajectory', () => {
  const buildPoints = (xValues, yValues) => xValues.map((x, idx) => [x, yValues[idx]]);

  it('飛距離がフェンス超過でも壁高未満なら非HR', () => {
    const points = buildPoints([0, 122, 126, 132], [1.0, 3.2, 2.8, 0]);
    const result = _checkHomeRunByTrajectory_TEST(points, 122, 3.5);

    expect(result.isHomeRun).toBe(false);
  });

  it('フェンス地点で壁高超えかつ3m奥でも浮いていればHR', () => {
    const points = buildPoints([0, 122, 125, 132], [1.0, 3.9, 0.8, 0]);
    const result = _checkHomeRunByTrajectory_TEST(points, 122, 3.5);

    expect(result.isHomeRun).toBe(true);
  });

  it('フェンス手前で着地している打球は非HR', () => {
    const points = buildPoints([0, 90, 118], [1.0, 2.0, 0]);
    const result = _checkHomeRunByTrajectory_TEST(points, 122, 3.5);

    expect(result.isHomeRun).toBe(false);
  });

  it('同一打球でも壁高が高い球場ではHRになりにくい', () => {
    const points = buildPoints([0, 122, 125, 132], [1.0, 4.1, 0.7, 0]);
    const lowWall = _checkHomeRunByTrajectory_TEST(points, 122, 1.0);
    const highWall = _checkHomeRunByTrajectory_TEST(points, 122, 5.0);

    expect(lowWall.isHomeRun).toBe(true);
    expect(highWall.isHomeRun).toBe(false);
  });
});
