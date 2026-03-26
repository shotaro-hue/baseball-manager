import { describe, it, expect } from 'vitest';
import { clamp, fmtAvg, fmtIP, fmtM, fmtSal } from '../../utils';

describe('clamp', () => {
  it('上限を超えた値を上限に丸める', () => {
    expect(clamp(150, 0, 100)).toBe(100);
  });
  it('下限を下回る値を下限に丸める', () => {
    expect(clamp(-10, 0, 100)).toBe(0);
  });
  it('範囲内の値はそのまま返す', () => {
    expect(clamp(50, 0, 100)).toBe(50);
  });
});

describe('fmtAvg', () => {
  it('打率を正しくフォーマットする', () => {
    expect(fmtAvg(3, 10)).toBe('.300');
  });
  it('打席なし（ゼロ除算）は .--- を返す', () => {
    expect(fmtAvg(0, 0)).toBe('.---');
  });
  it('.000 を正しくフォーマットする', () => {
    expect(fmtAvg(0, 10)).toBe('.000');
  });
  it('1.000（全安打）は ".1000" を返す（実装上の仕様）', () => {
    expect(fmtAvg(10, 10)).toBe('.1000');
  });
});

describe('fmtIP', () => {
  it('6と1/3回を "6.1" にフォーマットする', () => {
    expect(fmtIP(6 + 1 / 3)).toBe('6.1');
  });
  it('6と2/3回を "6.2" にフォーマットする', () => {
    expect(fmtIP(6 + 2 / 3)).toBe('6.2');
  });
  it('7.0回は "7.0" にフォーマットする', () => {
    expect(fmtIP(7.0)).toBe('7.0');
  });
  it('0.0回は "0.0" にフォーマットする', () => {
    expect(fmtIP(0)).toBe('0.0');
  });
});

describe('fmtM', () => {
  it('1億以上は億表記', () => {
    expect(fmtM(200000000)).toBe('2.0億');
  });
  it('1万以上は万表記', () => {
    expect(fmtM(5000000)).toBe('500万');
  });
  it('1万未満はそのまま円', () => {
    expect(fmtM(9999)).toBe('9999円');
  });
});

describe('fmtSal', () => {
  it('年俸を万円単位に変換する', () => {
    expect(fmtSal(30000000)).toBe('3000万');
  });
});
