import { expect, it } from 'vitest';
import release from './playerMaster2026.release.json';
import { createInitialTeams } from '../engine/bootstrapTeams';

const module = () => import('./postingQualificationFacts').catch(() => ({}));
const assessor = async () => {
  const { assessPostingBonusPoolExemption } = await import('../engine/postingQualification').catch(() => ({}));
  expect(assessPostingBonusPoolExemption).toBeTypeOf('function'); return assessPostingBonusPoolExemption;
};
const lookupFor = async master => {
  const { createOpeningPostingQualificationLookup } = await module(); expect(createOpeningPostingQualificationLookup).toBeTypeOf('function');
  return createOpeningPostingQualificationLookup(master);
};
const small = () => ({ schemaVersion: 1, asOf: '2026-03-27',
  sources: [{ id: 'https://npb.jp/bis/players/123.html', url: 'https://npb.jp/bis/players/123.html' }],
  players: [{ playerId: 'npb:123', birthDate: '2001-12-01', sourceIds: ['https://npb.jp/bis/players/123.html'],
    history: [{ year: 2020 }, { year: 2021 }, { year: 2022 }, { year: 2023 }, { year: 2024 }, { year: 2025 }] }] });

it('classifies an actual generated young player while refusing to invent an adult exemption', async () => {
  const lookup = await lookupFor(), assess = await assessor();
  const teams = createInitialTeams(), players = teams.flatMap(t => [...t.players, ...t.farm]);
  const young = players.find(p => p.realPlayerId === 'npb:21625150'), adult = players.find(p => p.realPlayerId === 'npb:21325134');
  expect(young).toBeTruthy(); expect(adult).toBeTruthy(); const old = structuredClone(teams);
  expect(lookup(young).birthDate.date).toBe('2003-03-25');
  expect(assess(lookup(young), '2026-12-01')).toMatchObject({ exemption: 'restricted', ageYears: 23, knownRecognizedSeasons: null });
  expect(assess(lookup(adult), '2026-12-01')).toMatchObject({ exemption: 'unknown', ageYears: 31, knownRecognizedSeasons: null });
  expect(lookup(adult).professionalSeasons).toBeNull(); expect(teams).toEqual(old);
  expect(lookup({ ...young, name: 'other', age: 99, serviceYears: 99, isForeign: false })).toEqual(lookup(young));
});

it('reports all current master professional-season evidence as unrecorded, even with six history rows', async () => {
  const lookup = await lookupFor();
  for (const row of release.players) {
    const e = lookup({ id: row.playerId, realPlayerId: row.playerId });
    expect(e.birthDate.date).toBe(row.birthDate); expect(e.professionalSeasons).toBeNull();
  }
});

it.each([{ id: 0, age: 40, serviceYears: 20 }, { id: 0, realPlayerId: 'missing', birthDate: '1980-01-01' }])(
  'keeps unknown legacy/fictional identity unknown %j', async player => {
    const lookup = await lookupFor(), assess = await assessor();
    expect(assess(lookup(player), '2026-12-01')).toMatchObject({ exemption: 'unknown', ageYears: null, knownRecognizedSeasons: null });
  });

it('snapshots its source once and returns detached facts for stable JSON assessment', async () => {
  const master = small(), lookup = await lookupFor(master), player = { id: 0, realPlayerId: 'npb:123' }, before = lookup(player);
  master.players[0].birthDate = '1980-01-01'; master.players[0].sourceIds = [];
  const result = lookup(player); result.birthDate.date = '1990-01-01'; result.birthDate.sourceIds.push('changed');
  expect(lookup(player)).toEqual(before);
  expect((await assessor())(JSON.parse(JSON.stringify(before)), '2026-12-01')).toMatchObject({ exemption: 'unknown', ageYears: 25 });
});

it.each([
  m => { m.players.push(structuredClone(m.players[0])); },
  m => { m.players[0].birthDate = '2001-02-29'; },
  m => { m.players[0].sourceIds = []; },
  m => { m.sources = []; },
  m => { m.sources[0].url = 'https://example.org/profile'; },
  m => { m.players[0].playerId = 'npb:999'; },
  m => { m.schemaVersion = 2; },
])('rejects malformed/mismatched identified source rather than using game age', async edit => {
  const master = small(); edit(master);
  const { createOpeningPostingQualificationLookup } = await module(); expect(createOpeningPostingQualificationLookup).toBeTypeOf('function');
  expect(() => createOpeningPostingQualificationLookup(master)).toThrow();
});
