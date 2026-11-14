import { calcRetireWill } from './playerCore';
import { economyRandomContext } from './economyRandom';
import { rngf } from '../utils';

const stable = v => JSON.stringify(v, (_, x) => x && !Array.isArray(x) && typeof x === 'object'
  ? Object.fromEntries(Object.keys(x).sort().map(k => [k, x[k]])) : x);
const id = v => typeof v === 'string' && v.trim().length > 0 || Number.isSafeInteger(v) && v >= 0;
const order = (a, b) => stable(a) < stable(b) ? -1 : stable(a) > stable(b) ? 1 : 0;
const fail = () => { throw Error('12/1の期末引退判断・元選手・保存証跡を確認してください。'); };
const day = y => `${String(y).padStart(4, '0')}-12-01`;
export const yearEndRetirementsId = season => JSON.stringify(['year-end-retirements', season]);
export const isYearEndRetirementsCommand = c => c?.type === 'prepare-year-end-retirements';
export function requiresYearEndRetirements(world) {
  const e = world.contractEconomy;
  return e?.mode === 'annual' && e.cycle.transitionReceipts.some(r => r.kind === 'open-offseason' && r.season === world.year)
    && !e.engine.transactions.some(t => t.id === yearEndRetirementsId(world.year)
      || t.generatedPostingRequests?.season === world.year || t.annualPostingPhase?.season === world.year);
}
const reserveId = (operationId, row) => JSON.stringify([operationId, 'reserve', row.teamId, row.playerId]);
const finalizeId = reservationId => JSON.stringify(['year-end-retirement-finalize', reservationId]);

export function normalizeYearEndRetirements(c) {
  if (!c || !id(c.id) || !id(c.humanTeamId) || !isYearEndRetirementsCommand(c)
    || Object.keys(c).length !== 4 || !Array.isArray(c.decisions)) fail();
  const seen = new Set();
  const decisions = c.decisions.map(d => {
    if (!d || Object.keys(d).length !== 2 || !id(d.playerId) || !['accept', 'retain'].includes(d.choice)
      || seen.has(String(d.playerId))) fail();
    seen.add(String(d.playerId)); return { playerId: d.playerId, choice: d.choice };
  }).sort((a, b) => order(a.playerId, b.playerId));
  return { id: c.id, type: c.type, humanTeamId: c.humanTeamId, decisions };
}

// Store only inputs used by the existing score, not a second roster snapshot.
function inputsFor(p) {
  const fields = ['age', 'isPitcher', 'morale', 'contractYearsLeft', 'injuryDaysLeft', 'retireStyle'];
  return { ...Object.fromEntries(fields.filter(k => p[k] !== undefined).map(k => [k, p[k]])),
    stats: Object.fromEntries(['PA', 'BF'].filter(k => p.stats?.[k] !== undefined).map(k => [k, p.stats[k]])) };
}
export function yearEndRetirementCandidates(state, humanTeamId) {
  const reserved = new Set((state.retirementReservations ?? []).map(r => r.playerId));
  return state.teams.flatMap(t => [...t.players, ...t.farm].filter(p => Number.isFinite(p.age) && p.age >= 35
    && !p.isRetired && !p._retireNow && !reserved.has(p.id)
    && (t.id !== humanTeamId || calcRetireWill(p) >= 30)).map(p => ({
      teamId: t.id, playerId: p.id, name: p.name ?? String(p.id), inputs: inputsFor(p),
    }))).sort((a, b) => order([a.teamId, a.playerId], [b.teamId, b.playerId]));
}
function outcomeFor(state, row, season, humanTeamId, operationId, choice) {
  const context = economyRandomContext(state.economyRandomRoot, { ...state.economyIdentity, season,
    subjectId: row.playerId, operationId }, row.teamId === humanTeamId ? 'year-end-retain' : 'year-end-cpu-retire');
  if (row.teamId === humanTeamId) {
    if (choice === 'accept') return 'accepted';
    if (choice !== 'retain') fail();
    return rngf(0, 100, context) > (row.inputs.retireStyle ?? 50) ? 'retained' : 'retain_failed';
  }
  if (choice !== null) fail();
  return rngf(0, 100, context) < calcRetireWill(row.inputs) ? 'accepted' : 'continued';
}

export function* createYearEndRetirementsSteps(state, c, signature, applySteps) {
  if (state.version !== 2 || state.phase !== 'offseason' || state.date !== day(state.season) || state.gameDay !== 144
    || c.id !== yearEndRetirementsId(state.season) || !state.teams.some(t => t.id === c.humanTeamId)
    || state.transactions.some(t => t.generatedPostingRequests?.season === state.season || t.annualPostingPhase?.season === state.season)) fail();
  const candidates = yearEndRetirementCandidates(state, c.humanTeamId);
  const mine = candidates.filter(r => r.teamId === c.humanTeamId);
  if (mine.length !== c.decisions.length || mine.some(r => !c.decisions.some(d => d.playerId === r.playerId))) fail();
  const rows = candidates.map(row => {
    const choice = row.teamId === c.humanTeamId ? c.decisions.find(d => d.playerId === row.playerId).choice : null;
    const outcome = outcomeFor(state, row, state.season, c.humanTeamId, c.id, choice);
    return { ...row, choice, outcome, reservationId: ['accepted', 'retain_failed'].includes(outcome) ? reserveId(c.id, row) : null };
  });
  let result = { state };
  const createdReservationIds = [], finalizedReservationIds = [], finalizationIds = [];
  for (const r of rows.filter(r => r.reservationId !== null)) {
    const team = result.state.teams.find(t => t.id === r.teamId), p = [...team.players, ...team.farm].find(p => p.id === r.playerId);
    result = yield* applySteps(result.state, { id: r.reservationId, type: 'reserve-year-end-retirement',
      teamId: r.teamId, playerId: r.playerId, contractId: p.contractId });
    createdReservationIds.push(r.reservationId);
  }
  const pending = (result.state.retirementReservations ?? []).filter(r => r.season === state.season && !r.finalization)
    .sort((a, b) => order(a.id, b.id));
  for (const r of pending) {
    const id = finalizeId(r.id);
    result = yield* applySteps(result.state, { id, type: 'finalize-retirement', reservationId: r.id });
    finalizedReservationIds.push(r.id); finalizationIds.push(id);
  }
  const g = { version: 1, season: state.season, date: state.date, humanTeamId: c.humanTeamId, candidates: rows,
    createdReservationIds, finalizedReservationIds, finalizationIds };
  return { ...result, replayed: false, state: { ...result.state,
    transactions: [...result.state.transactions, { id: c.id, signature, yearEndRetirements: g }] } };
}

export function inspectYearEndRetirements(state) {
  const ts = new Map(state.transactions.map((t, i) => [t.id, { ...t, index: i }]));
  for (const t of state.transactions) {
    let c; try { c = JSON.parse(t.signature); } catch { /* old opaque signature */ }
    if (!isYearEndRetirementsCommand(c) && t.yearEndRetirements === undefined) continue;
    c = normalizeYearEndRetirements(c);
    const g = t.yearEndRetirements;
    if (!g || Object.keys(g).length !== 8 || g.version !== 1 || !Number.isInteger(g.season) || g.season < 1 || g.season > state.season
      || g.date !== day(g.season) || g.date > state.date || g.humanTeamId !== c.humanTeamId
      || c.id !== t.id || c.id !== yearEndRetirementsId(g.season) || t.signature !== stable(c)
      || !['candidates', 'createdReservationIds', 'finalizedReservationIds', 'finalizationIds'].every(k => Array.isArray(g[k]))) fail();
    const seen = new Set(), created = [], decisions = [];
    let prior;
    for (const row of g.candidates) {
      const key = [row.teamId, row.playerId];
      if (!row || Object.keys(row).length !== 7 || ![row.teamId, row.playerId].every(id)
        || !state.teams.some(t => t.id === row.teamId) || typeof row.name !== 'string'
        || seen.has(String(row.playerId)) || prior && order(prior, key) >= 0
        || !row.inputs || stable(inputsFor(row.inputs)) !== stable(row.inputs)
        || !Number.isFinite(row.inputs.age) || row.inputs.age < 35
        || row.teamId === g.humanTeamId && calcRetireWill(row.inputs) < 30
        || outcomeFor(state, row, g.season, g.humanTeamId, c.id, row.choice) !== row.outcome) fail();
      seen.add(String(row.playerId)); prior = key;
      if (row.teamId === g.humanTeamId) decisions.push({ playerId: row.playerId, choice: row.choice });
      const retires = ['accepted', 'retain_failed'].includes(row.outcome);
      if (row.reservationId !== (retires ? reserveId(c.id, row) : null)) fail();
      if (retires) {
        const r = (state.retirementReservations ?? []).find(r => r.id === row.reservationId);
        const reserve = ts.get(row.reservationId);
        if (!r || r.origin !== 'year-end' || r.season !== g.season || r.teamId !== row.teamId || r.playerId !== row.playerId
          || !r.finalization || stable(inputsFor(r.finalization.player)) !== stable(row.inputs)
          || !reserve || reserve.index >= ts.get(t.id).index) fail();
        created.push(row.reservationId);
      }
    }
    if (stable(decisions.sort((a, b) => order(a.playerId, b.playerId))) !== stable(c.decisions)
      || stable(created) !== stable(g.createdReservationIds)
      || g.finalizedReservationIds.length !== g.finalizationIds.length || new Set(g.finalizedReservationIds).size !== g.finalizedReservationIds.length) fail();
    let previous = -1;
    for (let i = 0; i < g.finalizedReservationIds.length; i++) {
      const r = (state.retirementReservations ?? []).find(r => r.id === g.finalizedReservationIds[i]);
      const f = ts.get(g.finalizationIds[i]);
      const source = r && ts.get(r.id);
      if (!r || r.season !== g.season || !f || f.id !== finalizeId(r.id) || r.finalization?.id !== f.id
        || !source || source.index >= f.index || f.index <= previous || f.index >= ts.get(t.id).index) fail();
      previous = f.index;
    }
    if (created.some(r => !g.finalizedReservationIds.includes(r))
      || state.transactions.some(other => (other.generatedPostingRequests?.season === g.season || other.annualPostingPhase?.season === g.season)
        && ts.get(other.id).index < ts.get(t.id).index)) fail();
  }
}

// Only complete worlds cross the adapter/save boundary. The shared projector
// also validates intermediate children while their aggregate parent is still
// being built, so reverse membership belongs here rather than in withFloors.
export function assertYearEndRetirementCoverage(state) {
  const parents = state.transactions.filter(t => t.yearEndRetirements);
  for (const r of state.retirementReservations ?? []) {
    if (r.origin === 'year-end') {
      const owners = parents.filter(t => t.yearEndRetirements.candidates.some(row => row.reservationId === r.id
        && row.playerId === r.playerId && row.teamId === r.teamId && ['accepted', 'retain_failed'].includes(row.outcome))
        && t.yearEndRetirements.createdReservationIds.includes(r.id));
      if (owners.length !== 1 || !r.finalization
        || !owners[0].yearEndRetirements.finalizedReservationIds.includes(r.id)
        || !owners[0].yearEndRetirements.finalizationIds.includes(r.finalization.id)) fail();
    }
    if (r.finalization?.id === finalizeId(r.id)
      && parents.filter(t => t.yearEndRetirements.finalizedReservationIds.includes(r.id)
        && t.yearEndRetirements.finalizationIds.includes(r.finalization.id)).length !== 1) fail();
  }
}
