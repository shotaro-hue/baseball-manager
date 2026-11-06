import { it, expect } from 'vitest';
import journal from './openingEligibility2026.json';
import { validateOpeningFaFacts, openingEligibilityFacts } from './openingEligibility2026';
import { initializePlayerEligibility } from '../engine/playerEligibility';

it('accepts only pre-opening official qualifications and exercise agreements with stable IDs', () => {
  expect(() => validateOpeningFaFacts(journal)).not.toThrow();
  for (const edit of [j => { j.asOf = '2026-11-01'; }, j => { j.qualifiedDate = '2026-10-19'; },
    j => { j.exercises[0].season = 2026; }, j => { j.exercises[0].npbAgreementDate = '2026-04-01'; },
    j => { j.sources[0].knownBy = '2026-10-19'; }, j => { j.sources[0].url = 'https://npb.jp/announcement/2026/fa_qualified.html'; },
    j => { j.qualified[0].playerId = '坂本 勇人'; }, j => { j.qualified.push(j.qualified[0]); }]) {
    const changed = structuredClone(journal); edit(changed); expect(() => validateOpeningFaFacts(changed)).toThrow();
  }
});
it('prefers individually confirmed profile/entry facts over the draft-year estimate', () => {
  expect(openingEligibilityFacts({ playerId: 'npb:41545153', draftYear: 2020 }))
    .toMatchObject({ entryType: '大卒', proStartYear: 2021, proStartKind: 'official' });
  const p = initializePlayerEligibility({ id: 0, age: 27, daysOnActiveRoster: 0 },
    { opening: openingEligibilityFacts({ playerId: 'npb:41545153', draftYear: 2020 }) });
  expect(p.eligibility.entry.basis.sourceIds).toEqual(['https://npb.jp/bis/players/41545153.html']);
});
