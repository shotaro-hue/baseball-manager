// Overseas FA exits consume the proven declaration's market entry. They do not
// terminate employment again, generate NPB compensation, or book posting income.
const fail = () => { throw new Error('海外FA離脱の宣言・市場・確定証跡を確認してください。'); };
const id = value => (typeof value === 'string' && value.trim()) || (Number.isSafeInteger(value) && value >= 0);
const stable = value => JSON.stringify(value, (_, v) => v && !Array.isArray(v) && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
const records = state => state.overseasDepartures === undefined ? [] : state.overseasDepartures;
export const isOverseasDepartureCommand = c => c?.type === 'depart-overseas';
export function normalizeOverseasDeparture(c) {
  const fields = ['id', 'type', 'teamId', 'playerId', 'declarationId', 'marketEntryId'];
  if (!isOverseasDepartureCommand(c) || fields.some(k => k !== 'type' && !id(c[k]))
    || Object.keys(c).some(k => !fields.includes(k))) fail();
  return Object.fromEntries(fields.map(k => [k, c[k]]));
}
function recordFor(state, c) {
  const declarations = state.faDeclarations ?? [];
  if (!Array.isArray(declarations)) fail();
  const d = declarations.find(d => d.id === c.declarationId);
  if (!d || d.kind !== 'overseas-fa' || d.marketEntry?.kind !== 'overseas-fa'
    || d.teamId !== c.teamId || d.player?.id !== c.playerId || d.marketEntry.id !== c.marketEntryId
    || d.sourceRecord?.contract?.endSeason !== d.season) fail();
  return { id: c.id, season: d.season, kind: 'overseas-fa', teamId: d.teamId, playerId: d.player.id,
    declarationId: d.id, sourceContractId: d.sourceContractId, marketEntryId: d.marketEntry.id,
    notifiedDate: d.notifiedDate, effectiveDate: d.effectiveDate };
}
const refersTo = (hold, d) => hold.proposal?.marketEntry?.id === d.marketEntryId;

// Called once by the FA declaration inspection, before it grants an exemption
// from the live-listing check. The declaration itself still proves employment,
// eligibility, ranking, exercise history and the original club history.
export function inspectAnnualOverseasDepartures(state) {
  const list = records(state), seen = new Set(), entries = new Set();
  if (!Array.isArray(list) || (list.length && state.version !== 2)) fail();
  for (const d of list) {
    if (!d || !id(d.id) || seen.has(String(d.id)) || entries.has(d.marketEntryId)
      || !Number.isInteger(d.season) || d.season < 1 || d.season > state.season
      || (d.season === state.season && (state.phase !== 'offseason' || d.notifiedDate > state.date))) fail();
    seen.add(String(d.id)); entries.add(d.marketEntryId);
    const receipts = state.transactions.filter(r => r.id === d.id), receipt = receipts[0];
    let c; try { c = normalizeOverseasDeparture(JSON.parse(receipt?.signature)); } catch { fail(); }
    if (receipts.length !== 1 || c.id !== d.id || receipt.signature !== stable(c)
      || stable(d) !== stable(recordFor(state, c)) || stable(receipt.overseasDeparture) !== stable(d)) fail();
    if (state.faPool.some(p => p.marketEntry?.id === d.marketEntryId)
      || state.spending.reservations.some(h => refersTo(h, d))
      || state.spending.resolvedReservations.some(h => h.resolution === 'accepted' && refersTo(h, d))) fail();
  }
  for (const r of state.transactions) {
    let c; try { c = JSON.parse(r.signature); } catch { /* opaque v1 receipts */ }
    if ((isOverseasDepartureCommand(c) || r.overseasDeparture !== undefined) && !seen.has(String(r.id))) fail();
  }
  return list;
}

export function createOverseasDeparture(state, c, signature) {
  const d = recordFor(state, c);
  if (state.version !== 2 || state.phase !== 'offseason' || d.season !== state.season || state.date !== d.notifiedDate
    || records(state).some(r => r.marketEntryId === d.marketEntryId)) fail();
  const p = state.faPool.find(p => p.id === c.playerId && p.marketEntry?.id === c.marketEntryId);
  if (!p || p.faDeclarationId !== c.declarationId
    || state.teams.some(t => [...t.players, ...t.farm].some(p => p.id === c.playerId))
    || state.spending.reservations.some(h => h.proposal.contract.playerId === c.playerId)
    || state.spending.resolvedReservations.some(h => h.resolution === 'accepted' && refersTo(h, d))) fail();
  return { ...state, faPool: state.faPool.filter(player => player !== p), overseasDepartures: [...records(state), d],
    transactions: [...state.transactions, { id: c.id, signature, overseasDeparture: structuredClone(d) }] };
}
