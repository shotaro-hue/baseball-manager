import { toAnnualState, fromAnnualState } from './contractEconomy';
import { economyClockFor, postseasonBoundaryDate, validateEconomyClock } from './economyCalendar';
import { parseContractDate } from './contractCalendar';
import { forecastNextAnnualBudget } from './annualBudgetForecast';
import { rankLeague, standingsContext } from './standings';
import { SEASON_GAMES } from '../constants';

const kind = 'open-offseason';
const counter = n => Number.isSafeInteger(n) && n >= 0;
const year = n => Number.isInteger(n) && n >= 1 && n < 9999;
const fail = () => { throw Error('オフ開始の保存元・閉幕日・予算承認・年度証跡を確認してください。'); };
const transitionId = (world, season) => JSON.stringify([world.saveId, world.contractEconomy.epoch, season, kind]);
const isBoundaryReceipt = r => {
  let id; try { id = JSON.parse(r?.id); } catch { /* Earlier opaque receipts stay compatible. */ }
  return r?.kind === kind || Array.isArray(id) && id.length === 4 && id[3] === kind;
};

// Qualification needs full match history/previous standings, which live
// outside the reducer's domain slice. Check at full-world preparation/save
// boundaries, never re-rank a partial reducer state with missing evidence.
export function inspectOffseasonQualification(world) {
  const e = world.contractEconomy;
  if (!(world.gameDay === SEASON_GAMES + 1 && e.clock.phase === 'season' && e.cycle.stage === 'postseason')
    && !e.cycle.transitionReceipts.some(r => r?.kind === kind && r.season === world.year)) return;
  const p = world.offseasonPlan?.playoff;
  const context = standingsContext(world.seasonHistory, world.allTeamResultsMap, world.year);
  for (const [league, first, series] of [['セ', p?.se1, p?.cs1_se], ['パ', p?.pa1, p?.cs1_pa]]) {
    const expected = rankLeague(world.teams, league, context).teams.slice(0, 3).map(t => t.id);
    const actual = [first?.id, ...(series?.teams ?? []).map(t => t.id)];
    if (JSON.stringify(actual) !== JSON.stringify(expected)) fail();
  }
}

// Optional in old saves. New receipts bind existing fields; no new envelope,
// forecast archive or clock phase is required.
export function inspectOpenOffseason(world) {
  const e = world.contractEconomy, seen = new Set();
  let previousRevision = -1;
  for (const r of e.cycle.transitionReceipts) {
    if (!isBoundaryReceipt(r)) continue;
    const fields = ['id', 'kind', 'version', 'season', 'closingDate', 'baseRevision', 'revision', 'budgetSeason', 'endSeason'];
    if (Object.keys(r).length !== fields.length || Object.keys(r).some(k => !fields.includes(k))
      || r.kind !== kind || r.version !== 1 || !year(r.season) || r.season > world.year
      || r.id !== transitionId(world, r.season) || seen.has(r.season)
      || !counter(r.baseRevision) || r.revision !== r.baseRevision + 1 || !counter(r.revision)
      || r.revision > e.revision || r.revision <= previousRevision
      || r.budgetSeason !== r.season + 1 || !Number.isInteger(r.endSeason)
      || r.endSeason < r.budgetSeason + 7 || r.endSeason > 9999) fail();
    const closing = parseContractDate(r.closingDate);
    if (closing.year !== r.season || closing.month >= 12) fail();
    if (r.season === world.year) {
      if (e.clock.phase !== 'offseason' || !['offseason-open', 'planning', 'ready-for-spring'].includes(e.cycle.stage)
        || e.engine.spending.budgetSeason !== r.budgetSeason || postseasonBoundaryDate(world) !== r.closingDate) fail();
      for (const t of world.teams) for (let s = r.budgetSeason; s <= r.endSeason; s++)
        for (const rows of [e.budgetPolicies, e.engine.spending.authorizations, e.engine.rosterRequirements])
          if (rows.filter(p => p.teamId === t.id && p.season === s).length !== 1) fail();
    }
    seen.add(r.season); previousRevision = r.revision;
  }
}

export function openOffseasonRequest(world) {
  toAnnualState(world);
  return { saveId: world.saveId, epoch: world.contractEconomy.epoch, baseRevision: world.contractEconomy.revision,
    season: world.year, teamId: world.myId, closingDate: postseasonBoundaryDate(world) };
}

// Prepare exactly one validated candidate. Only the existing commit barrier
// may publish and adopt it; quotation never mutates the current world.
export function reduceOpenOffseasonRequest(world, r) {
  try {
    const fields = ['saveId', 'epoch', 'baseRevision', 'season', 'teamId', 'closingDate'];
    if (!r || Object.keys(r).length !== fields.length || Object.keys(r).some(k => !fields.includes(k))) fail();
    toAnnualState(world);
    const e = world.contractEconomy;
    if (r.saveId !== world.saveId || r.epoch !== e.epoch || r.teamId !== world.myId || r.season !== world.year
      || !year(r.season) || !counter(r.baseRevision) || r.baseRevision > e.revision) fail();
    inspectOffseasonQualification(world);
    const id = transitionId(world, r.season), receipt = e.cycle.transitionReceipts.find(t => t?.id === id);
    if (receipt) {
      if (receipt.closingDate !== r.closingDate) fail();
      return { ok: true, world, replayed: true };
    }
    if (r.baseRevision !== e.revision || !counter(e.revision + 1) || e.clock.phase !== 'season'
      || e.cycle.stage !== 'postseason' || postseasonBoundaryDate(world) !== r.closingDate) fail();
    // No external history/policy/quote crosses this trust boundary. Missing
    // historical ledgers remain estimates under the recorded current policy.
    const forecast = forecastNextAnnualBudget(world), q = forecast.quote;
    const keepPast = rows => rows.filter(p => p.season <= world.year);
    const next = { ...world, offseasonPlan: { ...world.offseasonPlan, resumeScreen: 'retire_phase' }, contractEconomy: { ...e,
      revision: e.revision + 1, clock: economyClockFor({ season: world.year, phase: 'offseason', offseasonTurn: 0 }),
      cycle: { ...e.cycle, stage: 'offseason-open', transitionReceipts: [...e.cycle.transitionReceipts, {
        id, kind, version: 1, season: world.year, closingDate: r.closingDate, baseRevision: e.revision, revision: e.revision + 1,
        budgetSeason: forecast.budgetSeason, endSeason: forecast.endSeason }] },
      budgetPolicies: [...keepPast(e.budgetPolicies), ...q.budgetPolicies], engine: { ...e.engine,
        spending: { ...e.engine.spending, budgetSeason: forecast.budgetSeason,
          authorizations: [...keepPast(e.engine.spending.authorizations), ...q.authorizations] },
        rosterRequirements: [...keepPast(e.engine.rosterRequirements), ...q.rosterRequirements] } } };
    // This boundary has no draft transaction. Do not let the generic draft
    // projection add empty planning views to the retained postseason evidence.
    const projected = { ...fromAnnualState(next, toAnnualState(next)), offseasonPlan: next.offseasonPlan };
    validateEconomyClock(projected, world);
    return { ok: true, world: projected, replayed: false };
  } catch (error) { return { ok: false, world, replayed: false, error: error.message }; }
}
