import { MAX_SHIHAKA_TOTAL, MIN_SALARY_SHIHAKA } from '../constants';
import { rng, rngf, clamp } from '../utils';
import { analyzeTeamNeeds } from './trade';
import { ownedPlayers } from './renewalRules';
import { isIkuseiPlayer } from './rosterAutomation';
import { draftPicksForTeam } from './offseasonResume';
import { evaluateOrganizationNeeds } from './organizationNeeds';

export const registeredDraftCount = team => ownedPlayers(team).filter(p => !isIkuseiPlayer(p)).length;
export const remainingDraftSlots = (team, pool = [], drafted = {}) => Math.max(0,
  MAX_SHIHAKA_TOTAL - registeredDraftCount(team) - draftPicksForTeam(pool, drafted, team.id).length);
export const draftRefused = (player, isMyTeam) => isMyTeam
  && rngf(0, 1) < clamp((player.potential - 70) / 200, 0, .15);
export const drawDraftWinner = teams => teams[rng(0, teams.length - 1)];
const pitcherRole = { '先発': 'starter', '中継ぎ': 'reliever', '抑え': 'closer' };

function uncoveredActiveShortage(role) {
  // Picks reserve future depth, not operating players. Suppress repeat drafting
  // for the part already planned; healthy farm depth can require a roster swap.
  return Math.max(0, role.activeShortage - role.availableFarmCount - role.acceptedPickCount);
}

function pitcherNeedBonus(player, report, amount) {
  const role = report.roles[pitcherRole[player.subtype]];
  if (!role) return 0;
  if (role.organizationShortage > 0) return amount;
  const age = player.age || 25;
  if (role.futureDepth && ((role.futureDepth.youngShortage > 0 && age <= 24)
    || (role.futureDepth.primeShortage > 0 && age <= 30))) return amount;
  // Owned but currently unavailable depth is weaker evidence for another draft
  // acquisition than an organization-wide gap. Eligibility is not readiness.
  return uncoveredActiveShortage(role) > 0 ? amount / 2 : 0;
}

export function chooseDraftProspect(team, pool, round = 1, acceptedPicks = [], draftContext = {}) {
  if (!pool.length) return null;
  // Preserve the accepted-array API. Real draft callers provide the canonical
  // pool/assignments so the evaluator can reject refusal and ownership conflict.
  const draftPool = draftContext.draftPool ?? acceptedPicks;
  const drafted = draftContext.drafted ?? Object.fromEntries(acceptedPicks
    .filter(p => p?.id != null && (!p._drafted || String(p._r1winner) === String(team.id)))
    .map(p => [p.id, team.id]));
  const organization = evaluateOrganizationNeeds(team, { ...draftContext, draftPool, drafted });
  const validatedIds = organization.ok ? new Set(organization.acceptedPickIds) : null;
  const ownedIds = new Set(ownedPlayers(team).map(p => p.id));
  const additions = draftPool.filter(p => {
    if (p?.id == null || ownedIds.has(p.id) || (validatedIds && !validatedIds.has(p.id))) return false;
    // An accepted ID may also occur on an earlier rejected record with another
    // role. Validate the record before deduplication, just as the report does.
    if (!draftPicksForTeam([p], drafted, team.id).length || drafted[p.id] === 'refused') return false;
    const firstOwner = p._drafted ? p._r1winner : null;
    const laterOwner = drafted[p.id];
    if (firstOwner != null && laterOwner != null && String(firstOwner) !== String(laterOwner)) return false;
    ownedIds.add(p.id);
    return true;
  });
  // Picks become owned only at the existing acquisition step. Project them
  // here so later rounds evaluate the needs they have already filled.
  const needs = analyzeTeamNeeds(additions.length
    ? { ...team, farm: [...(team.farm || []), ...additions] }
    : team, { includeFarmPitchers: true });
  const velocityNeed = needs.some(n => n.type === '投手陣の球威強化');
  const wantsPitcher = organization.ok ? velocityNeed || Object.values(organization.roles)
    .filter(r => ['starter', 'reliever', 'closer'].includes(r.role))
    .some(r => r.organizationShortage > 0 || uncoveredActiveShortage(r) > 0
      || (r.futureDepth && (r.futureDepth.youngShortage > 0 || r.futureDepth.primeShortage > 0)))
    : needs.some(n => /先発|中継ぎ|抑え|投手/.test(n.type));
  const first = round === 1;
  const pitchingBonus = first ? 26 : 24;
  const scored = pool.map((p, i) => ({ p, score: 100 - i * (first ? 3 : 2)
    + (p.isPitcher ? organization.ok
      ? Math.max(velocityNeed ? pitchingBonus : 0, pitcherNeedBonus(p, organization, pitchingBonus))
      : wantsPitcher ? pitchingBonus : 0
      : !wantsPitcher ? (first ? 16 : 14) : 0)
    + (needs.some(n => n.type.includes('捕手')) && !p.isPitcher && p.pos === '捕手' ? (first ? 18 : 16) : 0)
    + Math.round(needs[0]?.horizon === 'short' ? (p.readinessScore ?? 50) * .2 : (p.potential ?? 50) * .15)
    + (needs.some(n => /若手|将来/.test(n.type)) && (p.age || 22) <= 20 ? 10 : 0)
    + (!first && needs.some(n => n.type.includes('ミート')) && !p.isPitcher && (p.batting?.contact || 0) >= 65 ? 8 : 0)
  })).sort((a, b) => b.score - a.score);
  if (first && rng(0, 9) < 3 && scored.length > 1) return scored[rng(1, Math.min(3, scored.length - 1))].p;
  if (!first && rngf(0, 1) < .08 && pool.length > 6) return pool[rng(4, Math.min(8, pool.length - 1))];
  return scored[0].p;
}

// All first-round nominations are independent; only winners leave the pool.
export function autoFirstRound(teams, pool) {
  const confirmed = {};
  let active = teams.filter(t => remainingDraftSlots(t) > 0);
  while (active.length) {
    const used = new Set(Object.values(confirmed).map(p => p.id));
    const available = pool.filter(p => !p._drafted && !used.has(p.id));
    if (!available.length) break;
    const groups = new Map();
    for (const team of active) {
      const player = chooseDraftProspect(team, available, 1, [], { teams });
      if (!groups.has(player.id)) groups.set(player.id, { player, teams: [] });
      groups.get(player.id).teams.push(team);
    }
    const losers = [];
    for (const { player, teams: nominees } of groups.values()) {
      const winner = nominees.length === 1 ? nominees[0] : drawDraftWinner(nominees);
      confirmed[winner.id] = player;
      losers.push(...nominees.filter(t => t.id !== winner.id));
    }
    active = losers;
  }
  return confirmed;
}

export function applyDraftAcquisitions(teams, pool, drafted, year) {
  const fail = error => ({ ok: false, error });
  if (!Array.isArray(pool) || !drafted || typeof drafted !== 'object') return fail('ドラフト結果が無効です');
  const ids = pool.map(p => p?.id);
  if (ids.some(id => id == null) || new Set(ids).size !== ids.length) return fail('候補IDが未記録または重複しています');
  const assignments = new Map(teams.map(t => [String(t.id), []]));
  const owned = new Set(teams.flatMap(t => ownedPlayers(t).map(p => p.id)));
  for (const p of pool) {
    const first = p._drafted ? p._r1winner : null;
    const later = drafted[p.id];
    if (first != null && later != null && String(first) !== String(later)) return fail('当選球団が競合しています');
    const owner = later ?? first;
    if (owner == null || owner === 'refused') continue;
    if (!assignments.has(String(owner))) return fail('指名球団が見つかりません');
    if (!owned.has(p.id)) assignments.get(String(owner)).push(p);
  }
  for (const team of teams) {
    if (registeredDraftCount(team) + assignments.get(String(team.id)).length > MAX_SHIHAKA_TOTAL)
      return fail(`支配下登録枠（${MAX_SHIHAKA_TOTAL}人）を超えます`);
  }
  return { ok: true, teams: teams.map(t => {
    const picks = assignments.get(String(t.id));
    return !picks.length ? t : { ...t, farm: [...(t.farm || []), ...picks.map(p => ({ ...p,
      育成: false, isIkusei: false, salary: Math.max(MIN_SALARY_SHIHAKA, Number.isFinite(p.salary) ? p.salary : MIN_SALARY_SHIHAKA),
      contractYears: 1, contractYearsLeft: 1, contractSignedYear: year, ikuseiYears: 0 }))] };
  }) };
}
