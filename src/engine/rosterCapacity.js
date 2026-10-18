import { MAX_SHIHAKA_TOTAL } from '../constants';
import { ownedPlayers } from './renewalRules';
import { draftPicksForTeam } from './offseasonResume';

export const isIkuseiPlayer = player => Boolean(player?.育成 || player?.isIkusei);
export function controlledRosterCounts(team) {
  const owned = ownedPlayers(team), developmentCount = owned.filter(isIkuseiPlayer).length;
  return { controlledCount: owned.length - developmentCount, developmentCount };
}
const sameClub = (a, b) => a != null && b != null && String(a) === String(b);
const keyCollision = ids => {
  const keys = new Map();
  for (const id of ids) {
    const key = String(id);
    if (keys.has(key) && keys.get(key) !== id) return true;
    keys.set(key, id);
  }
  return false;
};

/** Derived ownership and accepted-but-unowned reservations. Never edits a save. */
export function evaluateRosterCapacity(team, { teams = [team], draftPool = [], drafted = {}, confirmedPicks = {} } = {}) {
  if (!team || !Array.isArray(teams) || !Array.isArray(draftPool) || !drafted || !confirmedPicks)
    return { ok: false, reason: 'invalid-capacity-input' };
  const league = [team, ...teams.filter(t => !sameClub(t?.id, team.id))];
  const ownedIds = league.flatMap(ownedPlayers).map(p => p?.id);
  if (ownedIds.some(id => id == null) || new Set(ownedIds).size !== ownedIds.length || keyCollision(ownedIds))
    return { ok: false, reason: 'invalid-owned-ids' };
  if (keyCollision([...ownedIds, ...draftPool.filter(p => p?.id != null).map(p => p.id)]))
    return { ok: false, reason: 'invalid-draft-ids' };
  const owned = new Set(ownedIds), acceptedPickIds = [], acceptedPicks = [], ignoredPickIds = [];
  const firstCandidates = new Set(draftPicksForTeam(draftPool.filter(Boolean), drafted, team.id));
  for (const p of draftPool) {
    const id = p?.id;
    const ignore = reason => ignoredPickIds.push({ id, reason });
    if (id == null) { ignore('missing-id'); continue; }
    const first = p._drafted ? p._r1winner : null, later = drafted[id];
    const lotteryOwners = Object.entries(confirmedPicks).filter(([, pid]) => pid === id).map(([owner]) => owner);
    if (later === 'refused') { ignore('refused'); continue; }
    if (first != null && later != null && !sameClub(first, later)) { ignore('conflicting-owner'); continue; }
    const canonical = later ?? first;
    // Canonical pool/results supersede a stale partial lottery snapshot.
    const owner = canonical ?? (lotteryOwners.length === 1 ? lotteryOwners[0] : null);
    if (canonical == null && lotteryOwners.length > 1) { ignore('conflicting-owner'); continue; }
    if (!firstCandidates.has(p) && !sameClub(owner, team.id)) { ignore(owner == null ? 'unassigned' : 'other-team'); continue; }
    if (!sameClub(owner, team.id)) { ignore('other-team'); continue; }
    if (owned.has(id)) { ignore('already-owned'); continue; }
    // Validate each record before deduplication: a rejected duplicate cannot win.
    if (acceptedPickIds.includes(id)) { ignore('duplicate'); continue; }
    acceptedPickIds.push(id);
    acceptedPicks.push(p);
  }
  const counts = controlledRosterCounts(team), occupied = counts.controlledCount + acceptedPickIds.length;
  return { ok: true, ...counts, acceptedPickCount: acceptedPickIds.length, acceptedPickIds, acceptedPicks, ignoredPickIds,
    remainingSlots: Math.max(0, MAX_SHIHAKA_TOTAL - occupied), overBy: Math.max(0, occupied - MAX_SHIHAKA_TOTAL) };
}

export function projectRosterCapacity(team, { releaseIds = [], draftRemaining = 0, faRemaining = 0, conversionIds = [] } = {}, options = {}) {
  if (![draftRemaining, faRemaining].every(n => Number.isInteger(n) && n >= 0)
    || !Array.isArray(releaseIds) || !Array.isArray(conversionIds)) return { ok: false, reason: 'invalid-plan' };
  const actual = evaluateRosterCapacity(team, options);
  if (!actual.ok) return actual;
  const releases = new Set(releaseIds), conversions = new Set(conversionIds), owned = ownedPlayers(team);
  const releaseControlledCount = owned.filter(p => releases.has(p.id) && !isIkuseiPlayer(p)).length;
  const conversionCount = owned.filter(p => conversions.has(p.id) && !releases.has(p.id) && isIkuseiPlayer(p)).length;
  const projectedControlledCount = actual.controlledCount - releaseControlledCount + actual.acceptedPickCount
    + draftRemaining + faRemaining + conversionCount;
  return { ...actual, releaseControlledCount, projectedControlledCount,
    projectedRemainingSlots: Math.max(0, MAX_SHIHAKA_TOTAL - projectedControlledCount),
    projectedOverBy: Math.max(0, projectedControlledCount - MAX_SHIHAKA_TOTAL) };
}

export function draftCapacityContext(plan, year, teams = []) {
  if (!plan || plan.year !== year) return { teams, draftPool: [], drafted: {}, confirmedPicks: {} };
  return { teams, draftPool: plan.draftResult?.pool ?? plan.draftPool ?? [],
    evaluation:plan.draftEvaluation,cpuOpportunityPlanning:plan.cpuOpportunityPlanning,
    drafted: plan.draftResult?.drafted ?? plan.draftViews?.draft?.drafted ?? {},
    confirmedPicks: plan.draftViews?.lottery?.confirmedPicks ?? {} };
}
