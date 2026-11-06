import { describe, it, expect } from 'vitest';
import { initializePlayerEligibility, getPlayerFaProgress, assessGamePostingQualification,
  accrueFaService, exerciseFaRights, completeFaRecontract, validatePlayerEligibility } from '../playerEligibility';

const player = (extra = {}) => ({ id: 0, age: 25, birthDate: '2001-06-01', entryType: '高卒',
  proStartYear: 2021, daysOnActiveRoster: 0, ...extra });
const init = (extra = {}, options = {}) => initializePlayerEligibility(player(extra), { year: 2026, ...options });

describe('elapsed completed professional seasons (game rule v2)', () => {
  it.each([[2021, 6, 'exempt'], [2022, 5, 'restricted'], [2027, 0, 'restricted']])('starts %s → %s at end 2026', (proStartYear, professionalYears, exemption) => {
    const p = init({ proStartYear });
    expect(assessGamePostingQualification(p, { signingDate: '2026-12-01', completedSeasonYear: 2026 }))
      .toMatchObject({ ruleVersion: 2, professionalYears, exemption });
  });
  it('uses actual birthdays and never prepays a season', () => {
    const p = init({ birthDate: '2001-12-02', proStartYear: 2020 });
    expect(assessGamePostingQualification(p, { signingDate: '2026-12-01', completedSeasonYear: 2026 }).exemption).toBe('restricted');
    expect(assessGamePostingQualification(p, { signingDate: '2026-12-02', completedSeasonYear: 2026 }).exemption).toBe('exempt');
    expect(assessGamePostingQualification(init(), { signingDate: '2026-09-01', completedSeasonYear: 2025 }).professionalYears).toBe(5);
    expect(() => assessGamePostingQualification(p, { signingDate: '2026-03-27', completedSeasonYear: 2027 })).toThrow();
  });
  it('does not depend on active/farm/development, games, moves, or serviceYears', () => {
    const p = init();
    for (const extra of [{ 育成: true }, { teamId: 7 }, { serviceYears: 0 }, { stats: { G: 0 } }])
      expect(assessGamePostingQualification({ ...p, ...extra }, { signingDate: '2026-12-01', completedSeasonYear: 2026 }).professionalYears).toBe(6);
    expect(initializePlayerEligibility(p, { year: 2027 })).toEqual(p);
  });
});

describe('FA qualified days and separate evidence', () => {
  it('keeps official domestic rights separate from an estimated overseas balance', () => {
    const p = init({ daysOnActiveRoster: undefined, history: [{ year: 2025, G: 100 }] }, {
      opening: { qualified: 'domestic', sourceIds: ['https://npb.jp/announcement/2025/fa_qualified.html'] },
    });
    expect(getPlayerFaProgress(p)).toMatchObject({ evidenceVersion: 1, estimated: true,
      basis: { kind: 'official' }, daysBasis: { kind: 'game-estimate', method: 'opening-registration-model-v2' },
      domestic: { eligible: true, remainingDays: 0 }, overseas: { eligible: false, remainingDays: 1189 } });
  });
  it.each([{ marketEntry: { kind: 'released' } }, { isWaiverReleased: true }])('does not consume FA rights again on a later release with stale declaration text %j', listing => {
    const p = exerciseFaRights(init({ daysOnActiveRoster: 1080 }), 2026);
    p.eligibility.fa.days += 300;
    const released = { ...p, isFA: true, marketEntryReason: '国内FA宣言', faEnteredYear: 2028, ...listing };
    const signed = completeFaRecontract(released, 2028);
    expect(signed.eligibility.fa.exerciseCount).toBe(1);
    expect(getPlayerFaProgress(signed).overseas.remainingDays).toBe(280);
  });
  it('estimates a missing draft year once from entry history, keeping pre-2007 college entrants on eight years', () => {
    const p = init({ age: 40, birthDate: '1985-06-01', entryType: '大卒', proStartYear: 2007, draftYear: undefined });
    p.eligibility.fa.days = 1015;
    expect(p.eligibility.entry.draftYear).toBe(2006);
    expect(getPlayerFaProgress(p).domestic).toMatchObject({ eligible: false, remainingDays: 145 });
  });
  it.each([['高卒', 2020, 1160], ['大卒', 2007, 1015], ['社会人', 2007, 1015], ['大卒', 2006, 1160], ['不明', 2020, 1160]])('uses %s draft %s threshold %s', (entryType, draftYear, required) => {
    const p = init({ entryType, draftYear, daysOnActiveRoster: undefined });
    p.eligibility.fa.days = required - 1;
    expect(getPlayerFaProgress(p).domestic).toEqual({ eligible: false, remainingDays: 1, years: 1 });
    p.eligibility.fa.days++;
    expect(getPlayerFaProgress(p).domestic.eligible).toBe(true);
    p.eligibility.fa.days = 1305;
    expect(getPlayerFaProgress(p).overseas.eligible).toBe(true);
  });
  it('migrates explicitly from 120 units and preserves the original fields and true zero', () => {
    const p = init({ daysOnActiveRoster: 839, serviceYears: 7, entryType: '大卒', draftYear: 2018 });
    expect(p.daysOnActiveRoster).toBe(839); expect(p.serviceYears).toBe(7);
    expect(p.eligibility.fa.days).toBeCloseTo(839 * 145 / 120);
    expect(p.eligibility.fa.basis.method).toBe('legacy-120-to-145');
    expect(getPlayerFaProgress(init({ daysOnActiveRoster: 0, serviceYears: 20 })).days).toBe(0);
    expect(initializePlayerEligibility(JSON.parse(JSON.stringify(p)), { year: 2030 })).toEqual(p);
  });
  it('estimates missing data deterministically without inventing education or measured zero', () => {
    const p = { id: 'missing', age: 30, serviceYears: 5, entryType: '不明', dataQuality: { serviceTime: 'game-baseline-unknown' }, daysOnActiveRoster: 0 };
    const a = initializePlayerEligibility(p, { year: 2026 }), b = initializePlayerEligibility(p, { year: 2026 });
    expect(a).toEqual(b); expect(a.entryType).toBe('不明'); expect(a.eligibility.entry.type).toBe('その他');
    expect(a.eligibility.fa.days).toBeGreaterThan(0); expect(getPlayerFaProgress(a).recorded).toBe(true);
    expect(a.eligibility.fa.basis.kind).toBe('game-estimate'); expect(a.birthDate).toBe('1996-03-27');
    expect(p).not.toHaveProperty('eligibility');
  });
  it('does not invent a legacy acquired-right event from serviceYears when the original counter was zero', () => {
    const p = init({ entryType: '不明', serviceYears: 7, daysOnActiveRoster: 0,
      dataQuality: { serviceTime: 'game-baseline-unknown' } });
    expect(p.eligibility.fa.grants.domestic).toBe(false);
    expect(getPlayerFaProgress(p).domestic.eligible).toBe(false);
    expect(p.eligibility.fa.qualificationBasis.kind).toBe('game-estimate');
  });
  it('retains official held rights independently of estimated days, then reacquires overseas at 580', () => {
    let p = init({}, { opening: { qualified: 'overseas', exercises: [], sourceIds: ['https://npb.jp/announcement/2025/fa_qualified.html'] } });
    expect(p.eligibility.fa.days).toBe(0);
    expect(getPlayerFaProgress(p)).toMatchObject({ domestic: { eligible: true }, overseas: { eligible: true } });
    p = exerciseFaRights(p, 2026);
    expect(getPlayerFaProgress(p)).toMatchObject({ domestic: { eligible: false, remainingDays: 580 }, overseas: { eligible: false, remainingDays: 580 } });
    p.eligibility.fa.days += 579; expect(getPlayerFaProgress(p).overseas.eligible).toBe(false);
    p.eligibility.fa.days++; expect(getPlayerFaProgress(p).overseas.eligible).toBe(true);
    expect(exerciseFaRights(p, 2026)).toEqual(p);
  });
  it('rejects future opening facts and malformed introduced state', () => {
    expect(() => init({}, { opening: { knownBy: '2026-10-01', qualified: 'domestic' } })).toThrow();
    const p = init(); p.eligibility.fa.days = -1;
    expect(() => validatePlayerEligibility(p)).toThrow();
    expect(() => initializePlayerEligibility(p, { year: 2026 })).toThrow();
  });
  it.each([
    p => { delete p.eligibility.fa.exerciseBasis; },
    p => { p.eligibility.fa.exerciseBasis.coverage = 'unknown'; },
    p => { p.eligibility.proStart.knownBy = 'not-a-date'; },
    p => { p.eligibility.fa.season.year = 9999; },
    p => { p.eligibility.fa.season.creditedDays = 145; },
  ])('rejects uncertified exercise history and invalid introduced provenance/calendar %j', edit => {
    const p = init(); edit(p); expect(() => validatePlayerEligibility(p, { year: 2026 })).toThrow();
  });
});

describe('143 game-day conversion and portable deduplication', () => {
  it('credits 145 for a full year, carries partial years, and rejects duplicate credits across trades', () => {
    let p = init();
    for (let gameDay = 1; gameDay <= 143; gameDay++) {
      p = accrueFaService(p, { year: 2026, gameDay });
      expect(accrueFaService({ ...p, teamId: 11 }, { year: 2026, gameDay }).eligibility).toEqual(p.eligibility);
    }
    expect(p.eligibility.fa.days).toBe(145); expect(p.eligibility.fa.season.creditedDays).toBe(145);
    expect(accrueFaService(p, { year: 2026, gameDay: 144 })).toEqual(p);
    const next = accrueFaService(p, { year: 2027, gameDay: 1 }); expect(next.eligibility.fa.days).toBe(146);
    expect(accrueFaService(next, { year: 2026, gameDay: 1 })).toEqual(next);
  });
  it('does not backfill deregistered days or development registration', () => {
    let p = init();
    for (const gameDay of [1, 2, 100, 101, 143]) p = accrueFaService(p, { year: 2026, gameDay });
    expect(p.eligibility.fa.days).toBe(6);
    expect(accrueFaService({ ...p, isIkusei: true }, { year: 2026, gameDay: 142 }).eligibility).toEqual(p.eligibility);
  });
});
