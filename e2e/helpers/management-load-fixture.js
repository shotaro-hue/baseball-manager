import { managementFixture } from './management-fixture.js';

// Fixed, valid ownership; stress market/report sizes, never generated at runtime.
export function managementLoadFixture() {
  const f = managementFixture();
  for (const team of f.fixture.teams) {
    const base = team.players[0];
    while (team.players.length + team.farm.length < 70) {
      const index = team.players.length + team.farm.length;
      team.farm.push({ ...structuredClone(base), id: `load-${team.id}-${index}`, name: `二軍候補${index}`, 育成: index >= 65, isIkusei: index >= 65 });
    }
    for (const p of [...team.players, ...team.farm]) { p.contractYearsLeft = 1; p.contractSignedYear = null; }
  }
  f.mine.scoutResults = Array.from({ length: 120 }, (_, i) => ({ ...structuredClone(f.scout), id: `load-scout-${i}`, name: `調査候補${String(i).padStart(3, '0')}`, salary: 1000 + i * 100 }));
  f.fixture.faPool = Array.from({ length: 240 }, (_, i) => ({ ...structuredClone(f.scout), id: `load-fa-${i}`, name: `市場候補${String(i).padStart(3, '0')}`, salary: 1000 + i * 100, isFA: true, isForeign: false }));
  return f;
}
