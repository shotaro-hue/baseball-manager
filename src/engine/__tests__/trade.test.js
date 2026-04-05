import { describe, it, expect } from 'vitest';
import { classifyTeam, generateCpuCpuTrade } from '../trade';

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
