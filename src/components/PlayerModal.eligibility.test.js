import React from 'react';
import { act, create } from 'react-test-renderer';
import { it, expect } from 'vitest';
import { PlayerModal } from './PlayerModal';
import { initializePlayerEligibility } from '../engine/playerEligibility';

const text = node => typeof node === 'string' ? node : (node.children || []).map(text).join('');
const player = (extra = {}, opening = null) => initializePlayerEligibility({
  id: 'detail', name: '資格表示', age: 25, birthDate: '2001-01-01', proStartYear: 2021,
  entryType: '高卒', daysOnActiveRoster: undefined, history: [{ year: 2025, G: 100 }], ...extra,
}, { year: 2026, opening });
const render = (p, props, check) => {
  const before = JSON.stringify(p); let view;
  act(() => { view = create(React.createElement(PlayerModal, { player: p, year: 2026, onClose() {}, ...props })); });
  try { check(text(view.root)); expect(JSON.stringify(p)).toBe(before); }
  finally { act(() => view.unmount()); }
};

it.each([false, true])('shows overseas FA progress for isForeign=%s with its day evidence', isForeign => {
  render(player({ isForeign }), {}, value => {
    expect(value).toContain('海外FA 最短あと9年（1189日）・推定');
    expect(value).toContain('登録日数の根拠：ゲーム推定');
  });
});
it('shows official domestic rights without presenting estimated overseas days as exact', () => {
  render(player({}, { qualified: 'domestic', sourceIds: ['https://npb.jp/announcement/2025/fa_qualified.html'] }), {}, value => {
    expect(value).toContain('国内FA資格あり（公式）');
    expect(value).not.toContain('国内FA資格あり（公式）・推定');
    expect(value).toContain('海外FA 最短あと9年（1189日）・推定');
  });
});
it.each([false, true])('shows acquired overseas rights even when no days remain, isForeign=%s', isForeign => {
  render(player({ isForeign }, { qualified: 'overseas' }), {}, value => {
    expect(value).toContain('海外FA資格あり（公式）');
    expect(value).not.toContain('海外FA 最短あと');
  });
});
it.each([2025, 2026])('shows fixed pro start and elapsed years at completed season %s, separate from tenure', completedSeasonYear => {
  render(player({ serviceYears: 1 }), { completedSeasonYear }, value => {
    expect(value).toContain('プロ入り年2021年');
    expect(value).toContain(`プロ経過年数${completedSeasonYear === 2025 ? 5 : 6}年（${completedSeasonYear}年終了時）`);
    expect(value).toContain('在籍1年');
  });
});
it('defaults to the previous completed season and identifies estimated start years', () => {
  const p = player({ proStartYear: undefined, draftYear: 2020 });
  render(p, {}, value => {
    expect(value).toContain('プロ入り年2021年（推定）');
    expect(value).toContain('プロ経過年数5年（2025年終了時）');
  });
});
it('keeps development players outside FA displays even with official rights', () => {
  render(player({ isIkusei: true, isForeign: true }, { qualified: 'overseas' }), {}, value => {
    expect(value).toContain('育成契約中・FA対象外');
    expect(value).not.toContain('海外FA資格あり');
    expect(value).not.toContain('海外FA 最短あと');
  });
});
