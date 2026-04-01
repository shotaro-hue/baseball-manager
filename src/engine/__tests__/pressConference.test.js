import { describe, it, expect } from 'vitest';
import { calcPressDelta, pressCycleIndex, pickQuestion, PRESS_QUESTIONS } from '../pressConference';

describe('calcPressDelta', () => {
  it('popMod と moraleMod をそのまま返す', () => {
    const choice = { popMod: 5, moraleMod: 8, text: 'テスト', label: 'A' };
    expect(calcPressDelta(choice)).toEqual({ popDelta: 5, moraleDelta: 8 });
  });

  it('マイナス値も正しく返す', () => {
    const choice = { popMod: -2, moraleMod: -4, text: 'テスト', label: 'B' };
    expect(calcPressDelta(choice)).toEqual({ popDelta: -2, moraleDelta: -4 });
  });

  it('choice が null のとき { 0, 0 } を返す', () => {
    expect(calcPressDelta(null)).toEqual({ popDelta: 0, moraleDelta: 0 });
  });

  it('choice が undefined のとき { 0, 0 } を返す', () => {
    expect(calcPressDelta(undefined)).toEqual({ popDelta: 0, moraleDelta: 0 });
  });

  it('popMod/moraleMod が未定義でも { 0, 0 } を返す', () => {
    expect(calcPressDelta({ text: 'テスト', label: 'C' })).toEqual({ popDelta: 0, moraleDelta: 0 });
  });
});

describe('pressCycleIndex', () => {
  it('gameDay 1 はインデックス 0', () => {
    expect(pressCycleIndex(1)).toBe(0);
  });

  it('gameDay 15 はインデックス 0（同じ週）', () => {
    expect(pressCycleIndex(15)).toBe(0);
  });

  it('gameDay 16 はインデックス 1（次の周期）', () => {
    expect(pressCycleIndex(16)).toBe(1);
  });

  it('インターバルを変更できる', () => {
    expect(pressCycleIndex(20, 10)).toBe(1);
    expect(pressCycleIndex(21, 10)).toBe(2);
  });
});

describe('pickQuestion', () => {
  it('戻り値は PRESS_QUESTIONS のいずれかである', () => {
    const q = pickQuestion(1);
    expect(PRESS_QUESTIONS).toContain(q);
  });

  it('異なる gameDay で異なる質問が返り得る', () => {
    const ids = new Set(
      Array.from({ length: PRESS_QUESTIONS.length }, (_, i) => pickQuestion(i * 15 + 1).id)
    );
    // 全5種類の質問が一巡する
    expect(ids.size).toBe(PRESS_QUESTIONS.length);
  });

  it('各質問には2つ以上の選択肢がある', () => {
    PRESS_QUESTIONS.forEach(q => {
      expect(q.choices.length).toBeGreaterThanOrEqual(2);
    });
  });
});
