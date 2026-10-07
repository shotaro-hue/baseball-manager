import { describe, expect, it } from 'vitest';
import { contractSnapshot, resolveContractReplies } from '../contractReplies';
import { MIN_SALARY_IKUSEI, MIN_SALARY_SHIHAKA } from '../../constants';

const p = extra => ({ id: 0, name: '選手0', salary: 1000, contractYearsLeft: 1, stats: { HR: 0 }, ...extra });
const team = (farm = false, extra = {}) => ({ id: 0, players: farm ? [] : [p(extra)], farm: farm ? [p(extra)] : [], lineup: [0], lineupDh: [0], rotation: [0] });
const mail = (accepted = true, extra = {}) => ({ id: 'mail', type: 'contract_decision_pending', resolved: false, deliverOnDay: 2,
  decision: { playerId: 0, playerName: '選手0', salary: 1200, years: 2, accepted, ...extra } });

describe('normal contract replies', () => {
  it.each([false, true])('拒否後も一軍・二軍の所属と契約を維持する（farm=%s）', farm => {
    const before = team(farm), result = resolveContractReplies(before, [mail(false)], 2, 2026);
    expect(result.team).toBe(before);
    expect(result.replies[0]).toMatchObject({ id: 'mail', type: 'contract_reply', resolved: true, resolution: 'rejected' });
    expect(result.replies[0].body).toContain('所属と現契約は維持');
  });
  it.each([false, true])('ID 0の契約を同じフィールドで更新し、再処理しない（farm=%s）', farm => {
    const before = team(farm), pending = mail(true), result = resolveContractReplies(before, [pending], 2, 2026);
    expect((farm ? result.team.farm : result.team.players)[0]).toMatchObject({ salary: 1200, contractYears: 2, contractYearsLeft: 2, contractSignedYear: 2026 });
    expect(result.team.lineup).toEqual([0]);
    expect(resolveContractReplies(result.team, result.replies, 3, 2026).replies).toEqual([]);
    const repeated = resolveContractReplies(result.team, [pending], 3, 2026);
    expect(repeated.team).toBe(result.team);
    expect(repeated.replies[0].resolution).toBe('cancelled');
    expect(before.players.concat(before.farm)[0].salary).toBe(1000);
  });
  it('回答日前には何も変更しない', () => {
    const before = team(), result = resolveContractReplies(before, [mail()], 1, 2026);
    expect(result.team).toBe(before); expect(result.replies).toEqual([]);
  });
  it('年度が変わった回答予定は古い配信日まで待たず取り消す', () => {
    const before = team(), pending = { ...mail(true, { offeredYear: 2026 }), deliverOnDay: 145 };
    const result = resolveContractReplies(before, [pending], 1, 2027);
    expect(result.team).toBe(before); expect(result.replies[0].resolution).toBe('cancelled');
  });
  it('移籍済み・再契約済み・年度変更・契約変更のメールは取り消す', () => {
    for (const [before, pending] of [
      [{ id: 0, players: [], farm: [] }, mail()],
      [team(false, { contractSignedYear: 2026 }), mail()],
      [team(), mail(true, { offeredYear: 2025 })],
      [team(), { ...mail(), dateLabel: '2025年 2日目' }],
      [team(), mail(true, { teamId: 1 })],
      [team(), mail(true, { contractSnapshot: contractSnapshot(p({ salary: 900 })) })],
      [team(false, { contractYearsLeft: 3 }), mail()],
    ]) {
      const result = resolveContractReplies(before, [pending], 2, 2026);
      expect(result.team).toBe(before); expect(result.replies[0].resolution).toBe('cancelled');
    }
  });
  it('最低年俸・年数・育成満了を検証するが、減額制限を超えても合意なら成立する', () => {
    for (const [extra, terms] of [
      [{}, { salary: MIN_SALARY_SHIHAKA - 1 }], [{}, { salary: NaN }], [{}, { years: 0 }], [{}, { years: 1.5 }], [{}, { years: 8 }],
      [{ 育成: true, ikuseiYears: 2 }, { years: 2 }], [{ 育成: true }, { salary: MIN_SALARY_IKUSEI - 1 }],
    ]) expect(resolveContractReplies(team(false, extra), [mail(true, terms)], 2, 2026).replies[0].resolution).toBe('cancelled');
    expect(resolveContractReplies(team(false, { salary: 20000 }), [mail(true, { salary: 5000 })], 2, 2026).replies[0].resolution).toBe('signed');
  });
  it('同じ選手への複数の旧回答を順に評価し、二重契約しない', () => {
    const result = resolveContractReplies(team(), [mail(), { ...mail(true, { salary: 2000 }), id: 'old' }], 2, 2026);
    expect(result.replies.map(m => m.resolution)).toEqual(['signed', 'cancelled']);
    expect(result.team.players[0].salary).toBe(1200);
  });
  it('条件欠落メールも消さずに解決済みとして残す', () => {
    const result = resolveContractReplies(team(), [{ ...mail(), decision: null }], 2, 2026);
    expect(result.replies[0]).toMatchObject({ id: 'mail', resolved: true, resolution: 'cancelled' });
  });
});
