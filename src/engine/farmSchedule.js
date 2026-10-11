export const FARM_MODEL_VERSION = 'farm-pa-v1';
// Numbers first, then lexical strings: a total order even when valid ID types mix.
export const compareFarmIds = (a, b) => {
  if (typeof a !== typeof b) return typeof a === 'number' ? -1 : 1;
  return typeof a === 'number' ? a - b : a < b ? -1 : a > b ? 1 : 0;
};
export function assertFarmId(id) {
  if (!(typeof id === 'string' && id.length > 0) && !(typeof id === 'number' && Number.isSafeInteger(id))) {
    throw new Error('invalid farm ID');
  }
}

// Circle method, mirrored every five rounds. No dependency on active-game RNG.
export function createFarmSchedule(teams, year) {
  if (!Number.isSafeInteger(year) || year < 1 || !Array.isArray(teams) || teams.length !== 12) {
    throw new Error('invalid farm schedule input');
  }
  const ids = new Set();
  for (const team of teams) {
    assertFarmId(team?.id);
    if (ids.has(String(team.id))) throw new Error('duplicate team ID');
    ids.add(String(team.id));
    if (!['セ', 'パ'].includes(team.league)) throw new Error('invalid farm league');
  }
  const cards = [];
  for (const league of ['セ', 'パ']) {
    const group = teams.filter(t => t.league === league).sort((a,b) => compareFarmIds(a.id, b.id));
    if (group.length !== 6) throw new Error('farm league needs six teams');
    let ring = group.map(t => t.id);
    const cycle = [];
    for (let r = 0; r < 5; r++) {
      cycle.push(Array.from({ length: 3 }, (_, p) => {
        const pair = [ring[p], ring[5-p]];
        return (p === 0 ? r % 2 : p % 2) ? pair.reverse() : pair;
      }));
      ring = [ring[0], ring[5], ...ring.slice(1,5)];
    }
    for (let round = 1; round <= 143; round++) {
      const reverse = (Math.floor((round-1)/5) + year) % 2;
      cycle[(round-1)%5].forEach((pair, index) => {
        const [homeId, awayId] = reverse ? [...pair].reverse() : pair;
        cards.push({ id: JSON.stringify([year, round, league, index]), year, round, league, homeId, awayId });
      });
    }
  }
  return cards.sort((a,b) => a.round - b.round || (a.league === b.league ? 0 : a.league === 'セ' ? -1 : 1));
}

export function createFarmRng(seedParts) {
  let state = 2166136261;
  const key = JSON.stringify(seedParts);
  if (typeof key !== 'string') throw new Error('invalid farm seed');
  for (let i = 0; i < key.length; i++) state = Math.imul(state ^ key.charCodeAt(i), 16777619) >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let x = Math.imul(state ^ (state >>> 15), 1 | state);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
