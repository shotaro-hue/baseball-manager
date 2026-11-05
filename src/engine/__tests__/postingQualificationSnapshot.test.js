import { expect, it } from 'vitest';

const api = () => import('../postingQualificationSnapshot').catch(() => ({}));
const facts = (years = [2020, 2021, 2022, 2023, 2024, 2025], coverage = 'partial', asOfDate = '2026-12-01') => ({
  version: 1, playerId: 'synthetic-0', sourcePlayerId: null,
  birthDate: { date: '2000-01-01', sourceIds: ['synthetic-birth'] },
  professionalSeasons: { asOfDate, coverage, ruleId: 'synthetic-recognition-v1',
    seasons: years.map(season => ({ season, confirmedDate: `${season}-12-01`, sourceIds: [`synthetic-${season}`] })) },
});
const build = async (f, date = '2026-12-01') => {
  const { buildPostingQualificationSnapshot } = await api(); expect(buildPostingQualificationSnapshot).toBeTypeOf('function');
  return buildPostingQualificationSnapshot(f, date);
};

it('rejects January consumption of a current season confirmed later, but accepts its December confirmation', async () => {
  const f = facts([2021, 2022, 2023, 2024, 2025, 2026]);
  expect((await build(f)).assessment).toMatchObject({ exemption: 'exempt', knownRecognizedSeasons: 6 });
  f.professionalSeasons.asOfDate = '2026-01-01';
  const { buildPostingQualificationSnapshot } = await api();
  expect(() => buildPostingQualificationSnapshot(f, '2026-01-01')).toThrow();
});

it.each([
  [null, 'unknown', null], [facts([], 'partial').professionalSeasons, 'unknown', 0],
  [facts([], 'complete').professionalSeasons, 'restricted', 0],
  [facts([2021, 2022, 2023, 2024, 2025], 'complete').professionalSeasons, 'restricted', 5],
  [facts([2021, 2022, 2023, 2024, 2025], 'partial').professionalSeasons, 'unknown', 5],
  [facts([2021, 2022, 2023, 2024, 2025], 'complete', '2026-11-30').professionalSeasons, 'unknown', 5],
])('preserves missing/partial/complete/stale semantics %j', async (professionalSeasons, exemption, knownRecognizedSeasons) => {
  const r = await build({ ...facts(), professionalSeasons });
  expect(r.assessment).toMatchObject({ exemption, knownRecognizedSeasons });
});

it('uses explicit birthdays and never infers them from annual age', async () => {
  const f = facts(); f.birthDate = null;
  expect((await build(f)).assessment).toMatchObject({ exemption: 'unknown', ageYears: null, knownRecognizedSeasons: 6 });
  f.birthDate = { date: '2001-12-01', sourceIds: ['synthetic-birth'] };
  expect((await build(f, '2026-12-01')).assessment).toMatchObject({ exemption: 'exempt', ageYears: 25 });
  f.professionalSeasons.asOfDate = '2026-11-30';
  expect((await build(f, '2026-11-30')).assessment).toMatchObject({ exemption: 'restricted', ageYears: 24 });
});

it('snapshots sorted provenance and confirmation dates without mutating inputs and survives JSON', async () => {
  const f = facts([2025, 2024, 2023, 2022, 2021, 2020]); f.professionalSeasons.seasons[0].sourceIds = ['z', 'a'];
  const before = structuredClone(f), r = await build(f);
  expect(r.facts.professionalSeasons.seasons[0]).toEqual({ season: 2020, confirmedDate: '2020-12-01', sourceIds: ['synthetic-2020'] });
  expect(r.assessment.evidence.professionalSeasons.seasons.at(-1)).toEqual({ season: 2025, sourceIds: ['a', 'z'] });
  expect(r.assessment.ruleVersion).toBe(1); expect(f).toEqual(before);
  expect(await build(JSON.parse(JSON.stringify(r.facts)))).toEqual(r);
  f.professionalSeasons.seasons[0].confirmedDate = '9999-01-01';
  expect(r.facts.professionalSeasons.seasons.at(-1).confirmedDate).toBe('2025-12-01');
});

it.each([
  f => { f.professionalSeasons.ruleId = ''; },
  f => { f.professionalSeasons.ruleId = ' rule '; },
  f => { delete f.professionalSeasons.ruleId; },
  f => { f.professionalSeasons.seasons[0].confirmedDate = '2019-12-01'; },
  f => { f.professionalSeasons.seasons[0].confirmedDate = '2026-12-02'; },
  f => { f.professionalSeasons.seasons[0].confirmedDate = '2020-02-30'; },
  f => { delete f.professionalSeasons.seasons[0].confirmedDate; },
  f => { f.professionalSeasons.seasons[0].pending = true; },
  f => { f.professionalSeasons.seasons[0].sourceIds = []; },
  f => { f.professionalSeasons.seasons = Array(6); },
  f => { f.professionalSeasons.seasons.push({ ...f.professionalSeasons.seasons[0] }); },
  f => { f.professionalSeasons.asOfDate = '2026-12-02'; },
  f => { f.professionalSeasons.age = 26; },
  f => { f.serviceYears = 6; },
])('rejects malformed/unconfirmed producer facts', async edit => {
  const f = facts(); edit(f); const { buildPostingQualificationSnapshot } = await api();
  expect(buildPostingQualificationSnapshot).toBeTypeOf('function');
  expect(() => buildPostingQualificationSnapshot(f, '2026-12-01')).toThrow();
});
