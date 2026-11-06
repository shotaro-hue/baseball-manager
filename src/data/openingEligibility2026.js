import journal from './openingEligibility2026.json';
import release from './playerMaster2026.release.json';
import { parseContractDate } from '../engine/contractCalendar';

export function validateOpeningFaFacts(input) {
  const fail = () => { throw new Error('2026開幕前のFA公式資格・行使記録を確認してください。'); };
  if (input?.version !== 1 || input.asOf !== '2026-03-27' || input.qualifiedDate !== '2025-10-22'
    || !Array.isArray(input.qualified) || !Array.isArray(input.exercises) || !Array.isArray(input.sources)) fail();
  const ids = new Set(), events = new Set();
  for (const r of input.qualified) {
    if (!/^npb:\d{8}$/.test(r.playerId) || ids.has(r.playerId) || !['domestic', 'overseas'].includes(r.kind)) fail();
    ids.add(r.playerId);
  }
  for (const r of input.exercises) {
    parseContractDate(r.npbAgreementDate);
    const key = JSON.stringify([r.playerId, r.season]);
    if (!/^npb:\d{8}$/.test(r.playerId) || ![2024, 2025].includes(r.season) || events.has(key)
      || r.npbAgreementDate > input.asOf || Number(r.npbAgreementDate.slice(0, 4)) < r.season) fail();
    events.add(key);
  }
  for (const s of input.sources) {
    parseContractDate(s.knownBy); parseContractDate(s.checkedOn);
    if (!/^https:\/\/npb.jp\/announcement\/202[45]\/fa_(qualified|filed).html$/.test(s.url) || s.knownBy > input.asOf) fail();
  }
  for (const e of input.entryFacts ?? []) {
    parseContractDate(e.knownBy); parseContractDate(e.checkedOn);
    if (!/^npb:\d{8}$/.test(e.playerId) || !['高卒', '大卒', '社会人', '外国人'].includes(e.entryType)
      || !Number.isInteger(e.proStartYear) || e.proStartYear > 2026 || e.proStartYear < 1900 || e.knownBy > input.asOf
      || !Array.isArray(e.sourceIds) || !e.sourceIds.includes(`https://npb.jp/bis/players/${e.playerId.slice(4)}.html`)) fail();
  }
}
validateOpeningFaFacts(journal);

export const OPENING_FA_FACTS = journal;
const qualified = new Map(journal.qualified.map(r => [r.playerId, r.kind]));
const openingPopulation = new Set(release.players.map(p => p.playerId));
const entries = new Map((journal.entryFacts ?? []).map(p => [p.playerId, p]));
const exercises = new Map();
for (const row of journal.exercises) exercises.set(row.playerId, [...(exercises.get(row.playerId) ?? []), row.season]);

// New-game only. Runtime saves never look up today's or this opening's roster.
// The classification default is explicit game data, never an age-derived degree.
export function openingEligibilityFacts(player) {
  const playerId = player.playerId ?? player.realPlayerId;
  const past = exercises.get(playerId) ?? [];
  const filed2025 = past.includes(2025);
  const sourceIds = ['https://npb.jp/announcement/2025/fa_qualified.html',
    ...past.map(y => `https://npb.jp/announcement/${y}/fa_filed.html`)];
  const drafted = Number.isInteger(player.draftYear);
  const profile = /^npb:\d+$/.test(playerId ?? '') ? `https://npb.jp/bis/players/${playerId.slice(4)}.html` : null;
  const explicitStart = Number.isInteger(player.proStartYear) ? player.proStartYear : null;
  const entry = entries.get(playerId);
  return { knownBy: '2026-03-27', listChecked: openingPopulation.has(playerId),
    ...(qualified.has(playerId) && !filed2025 ? { qualified: qualified.get(playerId) } : {}),
    exercises: past, sourceIds,
    ...(explicitStart !== null ? { proStartYear: explicitStart, proStartKind: player.proStartEvidence?.kind ?? 'game-history',
      proStartMethod: player.proStartEvidence?.method ?? 'provided-first-pro-year',
      proStartSourceIds: player.proStartEvidence?.sourceIds ?? player.sourceIds ?? [] } : drafted ? { draftYear: player.draftYear, proStartYear: player.draftYear + 1,
      proStartKind: 'game-estimate', proStartMethod: 'documented-npb-draft-following-season-unverified-first-pro',
      proStartSourceIds: profile ? [profile] : [] } : {}),
    ...(entry && player.proStartEvidence?.kind !== 'official' ? { entryType: entry.entryType, entrySourceIds: entry.sourceIds, proStartYear: entry.proStartYear,
      proStartKind: 'official', proStartMethod: 'individually-reviewed-profile-and-entry-season', proStartSourceIds: entry.sourceIds } : {}),
    birthSourceIds: profile && (player.sourceIds ?? player.sourceRefs ?? []).includes(profile) ? [profile] : [],
  };
}
