import { MAX_ROSTER, MIN_ACTIVE_CATCHERS, MIN_TOTAL_BY_POS } from '../constants';
import { canAddToActiveRoster, isIkuseiPlayer } from './rosterAutomation';
import { evaluateRosterCapacity } from './rosterCapacity';
import { tradeValue } from './trade';

// Existing analyzeTeamNeeds minima, plus one fielder per required position.
const roles = [
  ['starter', '先発', true, 4, 4],
  ['reliever', '中継ぎ', true, 3, 3],
  ['closer', '抑え', true, 1, 1],
  ['catcher', '捕手', false, MIN_ACTIVE_CATCHERS, MIN_TOTAL_BY_POS['捕手']],
  ['shortstop', '遊撃手', false, 1, MIN_TOTAL_BY_POS['遊撃手']],
  ['secondBase', '二塁手', false, 1, MIN_TOTAL_BY_POS['二塁手']],
  ['thirdBase', '三塁手', false, 1, MIN_TOTAL_BY_POS['三塁手']],
];
const shortage = (minimum, count) => Math.max(0, minimum - count);

/** Pure, derived organization report. Farm availability means registration
 * eligibility, not ability readiness. Picks contribute only projected depth.
 * See docs/organization-needs.md for counts, scope and unassessed rules. */
export function evaluateOrganizationNeeds(team, options = {}) {
  const capacity = evaluateRosterCapacity(team, options);
  if (!capacity.ok) return capacity;
  const accepted = capacity.acceptedPicks;
  const active = team.players || [], farm = team.farm || [];
  const registeredCount = capacity.controlledCount;
  const report = roles.map(([role, label, isPitcher, activeMinimum, organizationMinimum]) => {
    const matches = p => Boolean(p.isPitcher) === isPitcher && (isPitcher ? p.subtype : p.pos) === label;
    const first = active.filter(matches), second = farm.filter(matches), picks = accepted.filter(matches);
    const organization = [...first, ...second, ...picks];
    const activeCount = first.filter(p => canAddToActiveRoster(p, [])).length;
    const availableFarmCount = second.filter(p => canAddToActiveRoster(p, [])).length;
    const directlyPromotableFarmCount = active.length < MAX_ROSTER
      ? second.filter(p => canAddToActiveRoster(p, active)).length : 0;
    const activeShortage = shortage(activeMinimum, activeCount);
    const depthCount = role === 'catcher'
      ? [...first, ...second].filter(p => !isIkuseiPlayer(p)).length + picks.length : organization.length;
    const organizationShortage = shortage(organizationMinimum, depthCount);
    const futureDepth = role === 'starter' ? {
      // Same age/default/minimum rules as analyzeTeamNeeds; no ability cutoff.
      youngCount: organization.filter(p => (p.age || 25) <= 24).length,
      primeCount: organization.filter(p => (p.age || 25) <= 30).length,
      youngValue: organization.filter(p => (p.age || 25) <= 24).reduce((sum, p) => sum + tradeValue(p), 0),
    } : null;
    if (futureDepth) {
      futureDepth.youngShortage = shortage(2, futureDepth.youngCount);
      futureDepth.primeShortage = shortage(3, futureDepth.primeCount);
    }
    const reasons = [];
    if (activeShortage) reasons.push('active-operating-shortage');
    if (activeShortage && availableFarmCount) reasons.push('eligible-farm-promotion');
    if (activeShortage && availableFarmCount > directlyPromotableFarmCount) reasons.push('farm-promotion-requires-roster-change');
    if (organizationShortage) reasons.push('organization-depth-shortage');
    if (picks.length) reasons.push('accepted-picks-project-depth-only');
    if (!futureDepth) reasons.push('future-depth-unassessed');
    else if (futureDepth.youngShortage || futureDepth.primeShortage) reasons.push('future-starter-depth-shortage');
    const classification = activeShortage
      ? availableFarmCount ? 'active-shortage-with-farm'
        : organizationShortage ? 'organization-shortage' : 'active-shortage-unavailable-depth'
      : organizationShortage ? 'organization-shortage'
        : futureDepth && (futureDepth.youngShortage || futureDepth.primeShortage) ? 'future-depth-shortage' : 'covered';
    return [role, { role, label, activeMinimum, organizationMinimum, activeCount,
      ownedActiveCount: first.length, farmCount: second.filter(p => !isIkuseiPlayer(p)).length,
      developmentCount: [...first, ...second].filter(isIkuseiPlayer).length,
      availableFarmCount, directlyPromotableFarmCount, ownedCount: first.length + second.length,
      acceptedPickCount: picks.length, organizationCount: organization.length,
      activeShortage, organizationShortage, futureDepth, classification, reasons }];
  });
  return { ok: true, teamId: team.id, registeredCount, acceptedPickCount: accepted.length,
    acceptedPickIds: accepted.map(p => p.id), remainingActiveSlots: Math.max(0, MAX_ROSTER - active.length),
    remainingRegisteredSlots: capacity.remainingSlots,
    roles: Object.fromEntries(report) };
}
