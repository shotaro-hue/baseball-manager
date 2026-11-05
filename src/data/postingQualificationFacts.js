import release from './playerMaster2026.release.json';
import { parseContractDate } from '../engine/contractCalendar';
import { normalizePostingQualificationEvidence } from '../engine/postingQualification';
import { buildPostingQualificationSnapshot } from '../engine/postingQualificationSnapshot';

const fail = () => { throw new Error('開幕名簿のポスティング資格根拠・固定IDを確認してください。'); };
const id = v => (typeof v === 'string' && v.trim()) || (Number.isSafeInteger(v) && v >= 0);

// Build once for a batch; snapshot the few required facts, not full biographies.
// Opening performance history is deliberately not recognized-season evidence.
export function createOpeningPostingQualificationLookup(master = release) {
  if (!master || master.schemaVersion !== 1 || !Array.isArray(master.players) || !Array.isArray(master.sources)) fail();
  parseContractDate(master.asOf);
  const sourceIndex = new Map(), people = new Map();
  for (const s of master.sources) {
    if (!s || typeof s.id !== 'string' || !s.id.trim() || sourceIndex.has(s.id)) fail();
    sourceIndex.set(s.id, s);
  }
  for (const row of master.players) {
    if (!row || typeof row.playerId !== 'string' || !row.playerId.trim() || people.has(row.playerId)) fail();
    let birthDate = null;
    if (row.birthDate != null) {
      parseContractDate(row.birthDate);
      const npbId = /^npb:(\d+)$/.exec(row.playerId)?.[1], profile = `https://npb.jp/bis/players/${npbId}.html`;
      if (!npbId || row.birthDate > master.asOf || !Array.isArray(row.sourceIds)
        || !row.sourceIds.includes(profile) || sourceIndex.get(profile)?.url !== profile) fail();
      birthDate = { date: row.birthDate, sourceIds: [profile] };
    }
    people.set(row.playerId, normalizePostingQualificationEvidence({ version: 1, playerId: row.playerId,
      sourcePlayerId: row.playerId, birthDate, professionalSeasons: null }));
  }
  return player => {
    if (!player || !id(player.id)) fail();
    const fact = people.get(player.realPlayerId) ?? { version: 1, sourcePlayerId: null, birthDate: null, professionalSeasons: null };
    return normalizePostingQualificationEvidence({ ...fact, playerId: player.id });
  };
}

// Preserve opening birth ownership; recognition must be explicitly supplied by
// a documented source or a future finalized-year producer, not performance rows.
export function createPostingQualificationProducer(master = release) {
  const lookup = createOpeningPostingQualificationLookup(master), openingDate = master.asOf;
  return (player, professionalSeasons = null) => buildPostingQualificationSnapshot(
    { ...lookup(player), sourcePlayerId: player.realPlayerId ?? null, professionalSeasons }, professionalSeasons?.asOfDate ?? openingDate).facts;
}
