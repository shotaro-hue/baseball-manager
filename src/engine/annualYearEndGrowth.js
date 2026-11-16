import { contractEmploymentAt } from './contractLedger';
import { employmentContractId } from './seasonContract';
import { developPlayers } from './player';
import { calculateSalaryDemand } from './salaryDemand';
import { economyRandomContext } from './economyRandom';
import { yearEndRetirementsId } from './annualYearEndRetirements';

const stable = v => JSON.stringify(v, (_, x) => x && !Array.isArray(x) && typeof x === 'object'
  ? Object.fromEntries(Object.keys(x).sort().map(k => [k, x[k]])) : x);
const id = v => typeof v === 'string' && v.trim().length > 0 || Number.isSafeInteger(v) && v >= 0;
const order = (a,b) => stable(a) < stable(b) ? -1 : stable(a) > stable(b) ? 1 : 0;
const pick = (o, keys) => Object.fromEntries(keys.filter(k => o?.[k] !== undefined).map(k => [k, o[k]]));
const fail = () => { throw Error('年度末成長・要求年俸の保存元・順序・証跡を確認してください。'); };
const day = y => `${String(y).padStart(4, '0')}-12-01`;
export const yearEndGrowthId = season => JSON.stringify(['year-end-growth', season]);
export const isYearEndGrowthCommand = c => c?.type === 'prepare-year-end-growth';
export function hasSeasonPosting(state, season) {
  return state.transactions.some(t => t.generatedPostingRequests?.season === season || t.annualPostingPhase?.season === season || t.annualOffseasonPosting?.season === season)
    || ['postingApplications', 'postingMarketResults', 'postingDepartures'].some(k => (state[k] ?? []).some(r => r.season === season));
}
export function requiresYearEndGrowth(world) {
  const e = world.contractEconomy;
  return e?.mode === 'annual' && e.cycle.transitionReceipts.some(r => r.kind === 'open-offseason' && r.season === world.year)
    && !e.engine.transactions.some(t => t.id === yearEndGrowthId(world.year)) && !hasSeasonPosting(e.engine, world.year);
}
export const growthPlayerIds = state => state.teams.flatMap(t => [...t.players, ...t.farm])
  .filter(p => !p.isRetired && !p._retireNow).map(p => p.id).sort(order);
export function normalizeYearEndGrowth(c) {
  if (!isYearEndGrowthCommand(c) || !id(c.id) || Object.keys(c).length !== 3 || !Array.isArray(c.playerIds)
    || c.playerIds.some(p => !id(p)) || new Set(c.playerIds.map(String)).size !== c.playerIds.length) fail();
  return { id: c.id, type: c.type, playerIds: [...c.playerIds].sort(order) };
}

// Historical observations, never a second live staff roster. Duplicate coaches
// deliberately retain the old developPlayers bonus rule.
export function growthCoachObservation(teams, season) {
  return teams.map(t => ({ teamId: t.id, coaches: (t.coaches ?? []).filter(c => c.season === undefined || c.season === season)
    .map(c => pick(c, ['type', 'bonus'])) })).sort((a,b) => order(a.teamId,b.teamId));
}
export function inspectGrowthCoaches(rows) {
  if (!Array.isArray(rows)) fail();
  const seen = new Set();
  for (const r of rows) {
    if (!r || Object.keys(r).length !== 2 || !id(r.teamId) || seen.has(String(r.teamId)) || !Array.isArray(r.coaches)) fail();
    seen.add(String(r.teamId));
    for (const c of r.coaches) if (!c || stable(pick(c, ['type', 'bonus'])) !== stable(c)
      || typeof c.type !== 'string' || c.bonus !== undefined && !Number.isFinite(c.bonus)) fail();
  }
}
const statKeys = ['PA','AB','H','BB','HBP','SF','D','T','HR','IP','ER','Kp','BBp','G','GS','SV','HLD'];
function inputsFor(p, season) {
  const logs = Array.isArray(p.recentCareerLog) && p.recentCareerLog.length ? p.recentCareerLog : p.careerLog ?? [];
  return { ...pick(p, ['id','age','potential','isPitcher','trainingFocus','growthPhase','peakAbilities','batting','pitching',
    'salary','contractId','pos','subtype','育成','isIkusei']), personality: pick(p.personality, ['money']), stats: pick(p.stats, statKeys),
    recentCareerLog: logs.filter(r => r.year < season && r.year >= season - 2).map(r => ({ year: r.year, stats: pick(r.stats, statKeys) })) };
}
export function growthContextFor(world) {
  const opening = world.contractEconomy.cycle.transitionReceipts.find(r => r.kind === 'open-offseason' && r.season === world.year);
  return { coaches: opening?.growthCoaches ?? growthCoachObservation(world.teams, world.year),
    teams: world.teams.map(t => pick(t, ['id','league','wins','losses'])).sort((a,b) => order(a.id,b.id)),
    ...pick({ awards: world.seasonHistory?.awards?.find(r => r.year === world.year),
      championship: world.seasonHistory?.championships?.find(r => r.year === world.year) }, ['awards','championship']) };
}
function resultsFor(state, inputs, context, season, operationId, teamId) {
  const random = economyRandomContext(state.economyRandomRoot, { ...state.economyIdentity, season, subjectId: inputs.id, operationId }, 'year-end-growth');
  const coaches = context.coaches.find(t => t.teamId === teamId)?.coaches;
  if (!coaches) fail();
  const developed = developPlayers([inputs], coaches, () => random).players[0];
  const growth = pick(developed, ['batting','pitching','growthPhase','peakAbilities']);
  const salary = calculateSalaryDemand(inputs, { ...context, year: season, team: context.teams.find(t => t.id === teamId) });
  return { growth, salary };
}
export function createYearEndGrowth(state, c, signature) {
  if (state.version !== 2 || state.phase !== 'offseason' || state.date !== day(state.season) || state.gameDay !== 144
    || c.id !== yearEndGrowthId(state.season) || hasSeasonPosting(state, state.season)
    || !state.transactions.some(t => t.id === yearEndRetirementsId(state.season))
    || (state.retirementReservations ?? []).some(r => r.season === state.season && !r.finalization)
    || stable(c.playerIds) !== stable(growthPlayerIds(state)) || !state.yearEndGrowthContext) fail();
  const context = structuredClone(state.yearEndGrowthContext), rows = [];
  const teams = state.teams.map(t => ({ ...t, ...Object.fromEntries(['players','farm'].map(roster => [roster, t[roster].map(p => {
    if (p.isRetired || p._retireNow) return p;
    const inputs = inputsFor(p, state.season);
    if (!Number.isFinite(inputs.age) || inputs.age < 0) fail();
    const result = resultsFor(state, inputs, context, state.season, c.id, t.id);
    rows.push({ teamId: t.id, playerId: p.id, roster, name: p.name ?? String(p.id), inputs, ...result });
    return { ...p, ...result.growth };
  })])) }));
  rows.sort((a,b) => order(a.playerId,b.playerId));
  return { ...state, teams, transactions: [...state.transactions, { id: c.id, signature,
    yearEndGrowth: { version: 1, season: state.season, date: state.date, context, rows } }] };
}
export function inspectYearEndGrowth(state) {
  for (const [index, t] of state.transactions.entries()) {
    let command; try { command = JSON.parse(t.signature); } catch { /* old opaque signature */ }
    if (!isYearEndGrowthCommand(command) && t.yearEndGrowth === undefined) continue;
    const c = normalizeYearEndGrowth(command), g = t.yearEndGrowth;
    if (!g || Object.keys(g).length !== 5 || g.version !== 1 || !Number.isInteger(g.season) || g.season < 1 || g.season > state.season
      || g.date !== day(g.season) || g.date > state.date || c.id !== t.id || c.id !== yearEndGrowthId(g.season)
      || t.signature !== stable(c) || !Array.isArray(g.rows) || !g.context || !Array.isArray(g.context.teams)
      || !state.transactions.slice(0,index).some(t => t.id === yearEndRetirementsId(g.season))
      || hasSeasonPosting({ ...state, transactions: state.transactions.slice(0,index), postingApplications: [], postingMarketResults: [], postingDepartures: [] }, g.season)
      || stable(g.rows.map(r => r.playerId)) !== stable(c.playerIds)) fail();
    inspectGrowthCoaches(g.context.coaches);
    // Reconstruct the historical population from the ledger and exits that
    // preceded this receipt, never from today's roster, age or performance.
    const prior = new Set(state.transactions.slice(0,index).map(t => t.id));
    const departed = new Set((state.retirementReservations ?? []).filter(r => r.season === g.season && prior.has(r.finalization?.id)).map(r => r.sourceContractId));
    for (const key of ['offseasonDepartures','faDeclarations','postingDepartures'])
      for (const r of state[key] ?? []) if (r.season === g.season && prior.has(r.id)) departed.add(r.sourceContractId);
    const employed = new Map(contractEmploymentAt(state.spending.ledger, `${String(g.season).padStart(4,'0')}-11-30`)
      .filter(e => !departed.has(employmentContractId(e.contract))).map(e => [e.contract.playerId,e]));
    if (stable([...employed.keys()].sort(order)) !== stable(c.playerIds)) fail();
    for (const row of g.rows) {
      const old = employed.get(row.playerId);
      if (!old || old.teamId !== row.teamId || employmentContractId(old.contract) !== row.inputs?.contractId
        || old.annualSalaryManYen !== row.inputs.salary || (old.registrationType === 'development') !== Boolean(row.inputs.育成 || row.inputs.isIkusei)) fail();
      if (!row || Object.keys(row).length !== 7 || !id(row.teamId) || row.inputs?.id !== row.playerId
        || typeof row.name !== 'string' || !['players','farm'].includes(row.roster)
        || !Number.isFinite(row.inputs.age) || row.inputs.age < 0
        || stable(inputsFor(row.inputs,g.season)) !== stable(row.inputs)
        || stable(resultsFor(state, row.inputs, g.context, g.season, t.id, row.teamId)) !== stable({ growth: row.growth, salary: row.salary })) fail();
    }
  }
}
export function savedYearEndSalary(world, playerId) {
  return world.contractEconomy?.engine.transactions.find(t => t.id === yearEndGrowthId(world.year))?.yearEndGrowth.rows.find(r => r.playerId === playerId)?.salary;
}

// Bind an observation copy to its immutable opening evidence at the full-world
// boundary. Old opening receipts have no observation and remain compatible.
export function inspectGrowthOpening(world) {
  const e = world.contractEconomy;
  for (const t of e.engine.transactions) if (t.yearEndGrowth) {
    const g = t.yearEndGrowth;
    const opening = e.cycle.transitionReceipts.find(r => r.kind === 'open-offseason' && r.season === g.season);
    if (!opening || opening.growthCoaches !== undefined && stable(opening.growthCoaches) !== stable(g.context.coaches)) fail();
  }
}
