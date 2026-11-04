import { applyContractLedgerAction, contractEmploymentAt } from './contractLedger';
import { employmentContractId } from './seasonContract';
import { parseContractDate } from './contractCalendar';
import { economyClockFor } from './economyCalendar';
import { removeDepartingPlayers } from './tradeTransaction';
import { appendCareerEntryToPlayer, makeCareerEntry } from './careerStats';
import { SEASON_GAMES } from '../constants';

const fail = (message = '引退予約・元契約・確定証跡を確認してください。') => { throw new Error(message); };
const id = n => (typeof n === 'string' && n.trim()) || (Number.isSafeInteger(n) && n >= 0);
const stable = value => JSON.stringify(value, (_, v) => v && !Array.isArray(v) && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
const day = (year, suffix) => `${String(year).padStart(4, '0')}-${suffix}`;
const players = team => [...team.players, ...team.farm];
export const isRetirementCommand = c => ['reserve-retirement', 'finalize-retirement'].includes(c?.type);
export function normalizeRetirementCommand(c) {
  const fields = c?.type === 'reserve-retirement' ? ['id', 'type', 'teamId', 'playerId', 'contractId']
    : c?.type === 'finalize-retirement' ? ['id', 'type', 'reservationId'] : null;
  if (!fields || !c || Object.keys(c).some(k => !fields.includes(k))
    || fields.some(k => k !== 'type' && !id(c[k]))) fail();
  return Object.fromEntries(fields.map(k => [k, c[k]]));
}

function sourceFor(state, r) {
  const source = state.spending.ledger.records.find(s => employmentContractId(s.contract) === r.sourceContractId);
  if (!source) fail();
  const final = r.finalization;
  const original = { ...source, changes: source.changes.filter(a => a.id !== final?.endAction?.id) };
  if (stable(original) !== stable(r.sourceRecord)) fail();
  const employment = contractEmploymentAt({ ...state.spending.ledger, records: [r.sourceRecord] }, r.notifiedDate)[0];
  if (!employment || employment.teamId !== r.teamId || employment.contract.playerId !== r.playerId) fail();
  return employment;
}
function assertNoPromise(state, playerId) {
  if (state.spending.reservations.some(h => h.proposal.contract.playerId === playerId))
    fail('未回答の正式留保を解決してから引退予約してください。');
  if (state.spending.ledger.records.some(r => r.contract.playerId === playerId && r.effectiveDate > state.date
    && contractEmploymentAt(state.spending.ledger, r.effectiveDate).some(e => employmentContractId(e.contract) === employmentContractId(r.contract))))
    fail('受諾済み将来契約があるため引退予約・確定できません。');
}
function retirementEnd(r) {
  return r.sourceRecord.contract.endSeason === r.season ? null : {
    id: JSON.stringify([r.id, 'retirement-end']), type: 'end', contractId: r.sourceContractId,
    teamId: r.teamId, effectiveDate: r.effectiveDate, reason: 'retirement', settlement: 'retain',
  };
}
function finalizationFor(r, c, player, teamName) {
  // This boundary precedes annual growth/archive. Reusing an already archived
  // season would double the summary; require that transition to be settled first.
  if ([...(player.careerLog ?? []), ...(player.recentCareerLog ?? [])].some(e => e.year === r.season && e.teamId === r.teamId))
    fail('当年度career記録が既に存在します。年度処理の順序を確認してください。');
  const careerEntry = makeCareerEntry(player.stats, player.playoffStats, r.season, r.teamId, teamName);
  const history = { ...appendCareerEntryToPlayer(player, careerEntry), isRetired: true, _retireNow: true,
    exitYear: r.season, exitReason: '引退', tenure: player.serviceYears || 1, retirementReservationId: r.id };
  return { id: c.id, reservationId: r.id, player: structuredClone(player), teamName, careerEntry, history, endAction: retirementEnd(r) };
}

// Optional in old v2 saves; populated only by these common commands. No engine
// clock or schedule is saved. Current players may keep playing/changing stats.
export function inspectAnnualRetirements(state) {
  const reservations = state.retirementReservations ?? [];
  if (!Array.isArray(reservations) || (state.version !== 2 && reservations.length)) fail();
  const seen = new Set(), people = new Set(), finals = new Set(), provenEnds = new Set(), departures = [];
  for (const r of reservations) {
    if (!r || ![r.id, r.teamId, r.playerId, r.sourceContractId].every(id)
      || seen.has(String(r.id)) || people.has(String(r.playerId)) || !Number.isInteger(r.season) || r.season < 1 || r.season > state.season
      || parseContractDate(r.notifiedDate).year !== r.season || r.notifiedDate >= r.effectiveDate
      || r.effectiveDate !== day(r.season, '12-01') || !Number.isSafeInteger(r.gameDay) || r.gameDay < 1 || r.gameDay > SEASON_GAMES
      || (r.season === state.season && (r.notifiedDate > state.date || !['season', 'offseason'].includes(state.phase)
        || (state.phase === 'season' && (!Number.isSafeInteger(state.gameDay) || state.gameDay < r.gameDay || state.gameDay > SEASON_GAMES))))) fail();
    seen.add(String(r.id)); people.add(String(r.playerId));
    const { finalization, ...reservation } = r;
    const c = normalizeRetirementCommand({ id: r.id, type: 'reserve-retirement', teamId: r.teamId, playerId: r.playerId, contractId: r.sourceContractId });
    const receipts = state.transactions.filter(t => t.id === r.id), receipt = receipts[0];
    if (receipts.length !== 1 || receipt.signature !== stable(c) || stable(receipt.retirementReservation) !== stable(reservation)) fail();
    sourceFor(state, r);
    const team = state.teams.find(t => t.id === r.teamId);
    if (!team) fail();
    if (!finalization) {
      if (r.season !== state.season) fail('未確定の引退予約があります。年度更新前に確定してください。');
      const player = players(team).find(p => p.id === r.playerId);
      if (!player || player.isRetired || player._retireNow) fail();
      assertNoPromise(state, r.playerId);
      continue;
    }
    if (r.season === state.season && (state.phase !== 'offseason' || state.date < r.effectiveDate)) fail();
    const f = finalization, command = normalizeRetirementCommand({ id: f.id, type: 'finalize-retirement', reservationId: r.id });
    const finalReceipts = state.transactions.filter(t => t.id === f.id);
    if (finals.has(String(f.id)) || String(f.id) === String(r.id) || finalReceipts.length !== 1
      || finalReceipts[0].signature !== stable(command) || stable(finalReceipts[0].retirement) !== stable(f)
      || f.player?.id !== r.playerId || f.player.isRetired || f.player._retireNow
      || stable(finalizationFor(r, command, f.player, f.teamName)) !== stable(f)) fail();
    finals.add(String(f.id));
    if (state.teams.some(t => players(t).some(p => p.id === r.playerId)) || state.faPool.some(p => p.id === r.playerId)) fail();
    const history = team.history?.filter(p => p.retirementReservationId === r.id) ?? [];
    if (history.length !== 1 || stable(history[0]) !== stable(f.history)) fail();
    assertNoPromise(state, r.playerId);
    if (f.endAction) {
      const record = state.spending.ledger.records.find(s => employmentContractId(s.contract) === r.sourceContractId);
      if (!record.changes.some(a => stable(a) === stable(f.endAction))) fail();
      provenEnds.add(stable(f.endAction));
    }
    departures.push({ season: r.season, teamId: r.teamId, sourceContractId: r.sourceContractId, player: f.player });
  }
  for (const t of state.transactions) {
    let c; try { c = JSON.parse(t.signature); } catch { /* legacy opaque signature */ }
    if ((c?.type === 'reserve-retirement' || t.retirementReservation !== undefined) && !seen.has(String(t.id))) fail();
    if ((c?.type === 'finalize-retirement' || t.retirement !== undefined) && !finals.has(String(t.id))) fail();
  }
  for (const team of state.teams) for (const p of team.history ?? []) {
    if (p.retirementReservationId !== undefined && !reservations.some(r => r.id === p.retirementReservationId && r.finalization && r.teamId === team.id)) fail();
  }
  if (state.version === 2) for (const s of state.spending.ledger.records) for (const a of s.changes) {
    if (a.type === 'end' && a.reason === 'retirement' && !provenEnds.has(stable(a))) fail();
  }
  return departures;
}

export function inspectRetirementCalendar(world) {
  for (const r of world.contractEconomy.engine.retirementReservations ?? []) {
    const schedules = r.season === world.year ? [world.schedule]
      : (world.scheduleArchive ?? []).filter(a => a?.year === r.season && a.schedule != null).map(a => a.schedule);
    for (const schedule of schedules) if (economyClockFor({ season: r.season, phase: 'season', schedule, gameDay: r.gameDay }).date !== r.notifiedDate) fail();
  }
}

// Reject conflicting operations before they rewrite contracts/holds. Replay is
// checked by the caller first. No conflict is silently resolved or cancelled.
export function assertRetirementCommandCompatible(state, c) {
  if (isRetirementCommand(c)) return;
  const hold = state.spending.reservations.find(h => h.proposal.id === c.proposalId);
  const affected = [c.playerId, c.proposal?.contract.playerId, hold?.proposal.contract.playerId,
    ...(c.outgoingIds ?? []), ...(c.incomingIds ?? [])];
  if ((state.retirementReservations ?? []).some(r => affected.includes(r.playerId)))
    fail('引退予約済みの選手に対する契約・退団・移籍・支配下転換は未対応です。');
}

export function createAnnualRetirement(state, c, signature) {
  if (state.version !== 2) fail();
  const reservations = state.retirementReservations ?? [];
  if (c.type === 'reserve-retirement') {
    if (state.phase !== 'season' || !Number.isSafeInteger(state.gameDay) || state.gameDay < 1 || state.gameDay > SEASON_GAMES
      || state.date >= day(state.season, '12-01') || reservations.some(r => r.playerId === c.playerId)) fail();
    const team = state.teams.find(t => t.id === c.teamId), player = team && players(team).find(p => p.id === c.playerId);
    if (!player || player.isRetired || player._retireNow) fail();
    assertNoPromise(state, c.playerId);
    const source = state.spending.ledger.records.find(r => employmentContractId(r.contract) === c.contractId);
    const r = { id: c.id, season: state.season, teamId: c.teamId, playerId: c.playerId, sourceContractId: c.contractId,
      sourceRecord: structuredClone(source), notifiedDate: state.date, gameDay: state.gameDay, effectiveDate: day(state.season, '12-01') };
    sourceFor(state, r);
    return { ...state, retirementReservations: [...reservations, r], transactions: [...state.transactions,
      { id: c.id, signature, retirementReservation: structuredClone(r) }] };
  }
  const r = reservations.find(r => r.id === c.reservationId);
  if (!r || r.finalization || state.phase !== 'offseason' || state.season !== r.season || state.date !== r.effectiveDate) fail();
  assertNoPromise(state, r.playerId);
  const team = state.teams.find(t => t.id === r.teamId), player = players(team).find(p => p.id === r.playerId);
  const finalization = finalizationFor(r, c, player, team.name ?? '');
  const ledger = finalization.endAction ? applyContractLedgerAction(state.spending.ledger, finalization.endAction) : state.spending.ledger;
  return { ...state, spending: { ...state.spending, ledger },
    retirementReservations: reservations.map(row => row === r ? { ...r, finalization } : row),
    teams: state.teams.map(t => t === team ? { ...removeDepartingPlayers(t, new Set([r.playerId])),
      history: [...(t.history ?? []), finalization.history] } : t),
    transactions: [...state.transactions, { id: c.id, signature, retirement: structuredClone(finalization) }] };
}

// Called only after validateEconomySave, before staging the new save generation.
// Observe the committed root's independent metadata: current-format caches do
// not retain the full world, and a caller may have mutated a loaded object.
export function retirementCareerEntries(world, previous) {
  if (world.contractEconomy?.mode !== 'annual') return [];
  const finalized = (world.contractEconomy.engine.retirementReservations ?? []).filter(r => r.finalization);
  if (!finalized.length) return [];
  const before = previous?.saveId !== world.saveId ? undefined : previous.economySave
    ? JSON.parse(previous.economySave.terms) : previous.contractEconomy;
  const committed = new Set(before?.epoch === world.contractEconomy.epoch
    ? (before.engine?.retirementReservations ?? []).filter(r => r.finalization).map(r => r.finalization.id) : []);
  return finalized.filter(r => !committed.has(r.finalization.id)).map(r => ({
    playerId: String(r.playerId), careerEntry: structuredClone(r.finalization.careerEntry),
  }));
}
