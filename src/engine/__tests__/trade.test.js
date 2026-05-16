import { describe, it, expect } from 'vitest';
import { classifyTeam, generateCpuCpuTrade, evaluateFrontOfficePlan, evalTradeForCpu } from '../trade';

describe('classifyTeam', () => {
  const makeTeam = (id, wins, losses, league = 'セ') => ({
    id, wins, losses, league, players: [],
  });

  it('勝率56%以上はbuyer', () => {
    const teams = [
      makeTeam('t1', 56, 44),
      makeTeam('t2', 40, 60),
      makeTeam('t3', 50, 50),
      makeTeam('t4', 45, 55),
      makeTeam('t5', 42, 58),
      makeTeam('t6', 38, 62),
    ];
    expect(classifyTeam(teams[0], teams)).toBe('buyer');
  });

  it('勝率44%以下はseller', () => {
    const teams = [
      makeTeam('t1', 60, 40),
      makeTeam('t2', 55, 45),
      makeTeam('t3', 50, 50),
      makeTeam('t4', 45, 55),
      makeTeam('t5', 42, 58),
      makeTeam('t6', 38, 62),
    ];
    expect(classifyTeam(teams[4], teams)).toBe('seller');
  });

  it('中間はneutral', () => {
    const teams = [
      makeTeam('t1', 60, 40),
      makeTeam('t2', 55, 45),
      makeTeam('t3', 52, 48),
      makeTeam('t4', 50, 50),
      makeTeam('t5', 48, 52),
      makeTeam('t6', 45, 55),
    ];
    expect(classifyTeam(teams[2], teams)).toBe('neutral');
  });
});

describe('generateCpuCpuTrade', () => {
  it('buyer/seller が存在しない場合はnullを返す', () => {
    const teams = Array.from({ length: 6 }, (_, i) => ({
      id: `t${i}`,
      wins: 50,
      losses: 50,
      league: 'セ',
      players: [],
    }));
    expect(generateCpuCpuTrade(teams)).toBeNull();
  });
});

describe('evaluateFrontOfficePlan', () => {
  it('高勝率かつ好条件でcontendになる', () => {
    const team = {
      id: 'c1', league: 'セ', wins: 60, losses: 35, runDiff: 70, players: Array.from({ length: 20 }, (_, i) => ({ age: i < 8 ? 25 : 28, contractYearsLeft: 2 })),
      frontOfficePlan: { mode: 'neutral', updatedAtDay: 0 },
    };
    const others = [team, { id: 'c2', league: 'セ', wins: 52, losses: 43, players: [] }];
    const plan = evaluateFrontOfficePlan(team, others, 40);
    expect(plan.mode).toBe('contend');
  });

  it('低勝率かつ高齢化でrebuildになる', () => {
    const team = {
      id: 'r1', league: 'セ', wins: 35, losses: 60, runDiff: -80, players: Array.from({ length: 20 }, (_, i) => ({ age: i < 15 ? 32 : 24, contractYearsLeft: 1, core: i < 5 })),
      frontOfficePlan: { mode: 'neutral', updatedAtDay: 0 },
    };
    const others = [team, { id: 'r2', league: 'セ', wins: 58, losses: 37, players: [] }];
    const plan = evaluateFrontOfficePlan(team, others, 45);
    expect(plan.mode).toBe('rebuild');
  });
});

describe('evalTradeForCpu by mode', () => {
  it('同一条件でrebuildは若手受け取りを優先しやすい', () => {
    const rebuildTeam = { id: 't1', players: [], frontOfficePlan: { mode: 'rebuild' } };
    const contendTeam = { id: 't2', players: [], frontOfficePlan: { mode: 'contend' } };
    const give = [{ age: 34, potential: 55, contractYearsLeft: 1, batting: { contact: 60, power: 62, eye: 55, speed: 40, clutch: 50 } }];
    const receive = [{ age: 22, potential: 80, contractYearsLeft: 3, batting: { contact: 55, power: 58, eye: 52, speed: 65, clutch: 52 } }];
    const rebuildResult = evalTradeForCpu(rebuildTeam, give, receive, 0);
    const contendResult = evalTradeForCpu(contendTeam, give, receive, 0);
    expect(rebuildResult.diff).toBeLessThan(contendResult.diff);
  });
});
