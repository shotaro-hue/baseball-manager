import { expect, it } from 'vitest';

const module = () => import('../postingQualification').catch(() => ({}));
const facts = (extra = {}) => ({ version: 1, playerId: 0, sourcePlayerId: 'real-0',
  birthDate: { date: '2001-12-01', sourceIds: ['profile'] }, professionalSeasons: null, ...extra });
const pro = (years, coverage = 'partial', asOfDate = '2026-12-01') => ({ asOfDate, coverage,
  seasons: years.map(season => ({ season, sourceIds: ['season-' + season] })) });
const assess = async (e, date = '2026-12-01') => {
  const { assessPostingBonusPoolExemption } = await module(); expect(assessPostingBonusPoolExemption).toBeTypeOf('function');
  return assessPostingBonusPoolExemption(e, date);
};

it.each([
  ['2026-11-30', 'restricted', 24], ['2026-12-01', 'exempt', 25], ['2026-12-02', 'exempt', 25],
])('uses exact signing date %s at the 25th birthday', async (date, exemption, ageYears) => {
  const e = facts({ professionalSeasons: pro([2020, 2021, 2022, 2023, 2024, 2025], 'partial', '2026-01-01') });
  expect(await assess(e, date)).toMatchObject({ playerId: 0, exemption, ageYears, knownRecognizedSeasons: 6, signingDate: date });
});

it.each([['2025-02-28', 'restricted', 24], ['2025-03-01', 'exempt', 25]])(
  'uses civil dates for leap birthday %s', async (date, exemption, ageYears) => {
    const e = facts({ birthDate: { date: '2000-02-29', sourceIds: ['profile'] },
      professionalSeasons: pro([2019, 2020, 2021, 2022, 2023, 2024], 'partial', '2025-01-01') });
    expect(await assess(e, date)).toMatchObject({ exemption, ageYears });
  });

it.each([
  [null, 'unknown', null],
  [pro([], 'partial'), 'unknown', 0],
  [pro([], 'complete'), 'restricted', 0],
  [pro([2021, 2022, 2023, 2024, 2025], 'complete'), 'restricted', 5],
  [pro([2021, 2022, 2023, 2024, 2025]), 'unknown', 5],
  [pro([2020, 2021, 2022, 2023, 2024, 2025]), 'exempt', 6],
  [pro([2020, 2021, 2022, 2023, 2024, 2025], 'complete'), 'exempt', 6],
  [pro([2021, 2022, 2023, 2024, 2025], 'complete', '2026-11-30'), 'unknown', 5],
])('separates missing/partial/complete/stale pro evidence %j', async (professionalSeasons, exemption, knownRecognizedSeasons) => {
  expect(await assess(facts({ professionalSeasons }))).toMatchObject({ exemption, knownRecognizedSeasons });
});

it('does not invent unknown birthdays or treat failed conditions as permission', async () => {
  expect(await assess(facts({ birthDate: null, professionalSeasons: pro([2020, 2021, 2022, 2023, 2024, 2025]) })))
    .toMatchObject({ exemption: 'unknown', ageYears: null });
  expect(await assess(facts({ birthDate: null, professionalSeasons: pro([], 'complete') })))
    .toMatchObject({ exemption: 'restricted', ageYears: null, knownRecognizedSeasons: 0 });
  expect(await assess(facts({ birthDate: { date: '2005-01-01', sourceIds: ['profile'] } })))
    .toMatchObject({ exemption: 'restricted', knownRecognizedSeasons: null });
});

it.each([
  [1999, 'partial'], [2000, 'partial'], [1999, 'complete'], [2000, 'complete'],
])('rejects synthetic season %i at or before the birth year in %s evidence', async (season, coverage) => {
  const { normalizePostingQualificationEvidence, assessPostingBonusPoolExemption } = await module();
  const e = facts({ playerId: 'synthetic-birth-year-boundary', sourcePlayerId: null,
    birthDate: { date: '2000-12-31', sourceIds: ['synthetic-profile'] },
    professionalSeasons: pro([season, 2017, 2018, 2019, 2020, 2021], coverage) });
  expect(() => assessPostingBonusPoolExemption(e, '2026-12-01')).toThrow();
  expect(() => normalizePostingQualificationEvidence(e)).toThrow();
});

it.each(['partial', 'complete'])('accepts synthetic seasons after the birth year in %s evidence', async coverage => {
  // Synthetic boundary data only; this is not a real player's season certificate.
  const { normalizePostingQualificationEvidence } = await module();
  const e = facts({ playerId: 'synthetic-birth-year-boundary', sourcePlayerId: null,
    birthDate: { date: '2000-12-31', sourceIds: ['synthetic-profile'] },
    professionalSeasons: pro([2001, 2017, 2018, 2019, 2020, 2021], coverage) });
  expect(normalizePostingQualificationEvidence(e).professionalSeasons.seasons.map(r => r.season))
    .toEqual([2001, 2017, 2018, 2019, 2020, 2021]);
  expect(await assess(e)).toMatchObject({ exemption: 'exempt', ageYears: 25, knownRecognizedSeasons: 6 });
});

it.each([
  { version: 2 }, { playerId: null }, { age: 99 }, { serviceYears: 99 }, { isForeign: false },
  { birthDate: undefined }, { birthDate: { date: '2001-02-29', sourceIds: ['profile'] } },
  { birthDate: { date: '2001-12-01', sourceIds: [] } },
  { birthDate: { date: '2001-12-01', sourceIds: ['profile', 'profile'] } },
  { birthDate: { date: '2001-12-01', sourceIds: ['profile'], age: 25 } },
  { professionalSeasons: pro([2020, 2021, 2022, 2023, 2024, 2024]) },
  { professionalSeasons: pro([2027]) }, { professionalSeasons: pro([2000]) },
  { professionalSeasons: pro([2020], 'unknown') },
  { professionalSeasons: pro([2020], 'partial', '2026-12-02') },
  { professionalSeasons: { asOfDate: '2026-12-01', coverage: 'partial', seasons: [{ season: 2020, sourceIds: [] }] } },
])('rejects malformed or fabricated evidence fields %j', async extra => {
  const { assessPostingBonusPoolExemption } = await module(); expect(assessPostingBonusPoolExemption).toBeTypeOf('function');
  expect(() => assessPostingBonusPoolExemption(facts(extra), '2026-12-01')).toThrow();
});

it.each(['2026-2-01', '2026-02-30', '0000-12-01', '2000-12-01', null])('rejects invalid/before-birth signing date %s', async date => {
  const { assessPostingBonusPoolExemption } = await module(); expect(assessPostingBonusPoolExemption).toBeTypeOf('function');
  expect(() => assessPostingBonusPoolExemption(facts(), date)).toThrow();
});

it('normalizes detached evidence and reproduces identical JSON without changing inputs', async () => {
  const { normalizePostingQualificationEvidence } = await module(); expect(normalizePostingQualificationEvidence).toBeTypeOf('function');
  const e = facts({ professionalSeasons: pro([2025, 2023, 2021, 2024, 2022, 2020]) });
  e.professionalSeasons.seasons[0].sourceIds = ['z', 'a']; const old = structuredClone(e);
  const n = normalizePostingQualificationEvidence(e);
  expect(n.professionalSeasons.seasons.map(r => r.season)).toEqual([2020, 2021, 2022, 2023, 2024, 2025]);
  expect(n.professionalSeasons.seasons.at(-1).sourceIds).toEqual(['a', 'z']); expect(e).toEqual(old);
  const result = await assess(n); expect(await assess(JSON.parse(JSON.stringify(n)))).toEqual(result);
  n.professionalSeasons.seasons[0].sourceIds.push('changed'); expect(e).toEqual(old);
});

it.each([
  e => { e.professionalSeasons.seasons = Array(6); },
  e => { e.professionalSeasons.seasons.length = 6; },
  e => { e.birthDate.sourceIds = Array(1); },
  e => { e.professionalSeasons.seasons[0].sourceIds = Array(1); },
])('rejects missing array elements instead of counting holes as documented seasons/sources', async edit => {
  const { assessPostingBonusPoolExemption } = await module(); expect(assessPostingBonusPoolExemption).toBeTypeOf('function');
  const e = facts({ professionalSeasons: pro([2021, 2022, 2023, 2024, 2025]) }); edit(e);
  expect(() => assessPostingBonusPoolExemption(e, '2026-12-01')).toThrow();
});
