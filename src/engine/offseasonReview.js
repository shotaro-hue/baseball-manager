import { ownedPlayers } from './renewalRules';

export const waiverEligible = p => Number.isFinite(p.contractYearsLeft) && p.contractYearsLeft <= 1 && !p.isRetired;
export function pruneRosterReferences(team, removedIds) {
  return Object.fromEntries(['lineup', 'lineupNoDh', 'lineupDh', 'rotation'].filter(key => Array.isArray(team[key])).map(key => [key, team[key].filter(id => !removedIds.has(id))]));
}
export function releaseWaiverPlayers(team, ids, year, popularityPenalty, salaryThreshold) {
  const removed = new Set(ids);
  const players = ownedPlayers(team).filter(p => removed.has(p.id));
  let popularity = team.popularity ?? 50;
  for (const p of players) if ((p.salary ?? 0) > salaryThreshold) popularity = Math.min(100, Math.max(0, popularity + popularityPenalty));
  return { ...team, players: team.players.filter(p => !removed.has(p.id)), farm: (team.farm || []).filter(p => !removed.has(p.id)), ...pruneRosterReferences(team, removed), popularity,
    history: [...(team.history || []), ...players.map(p => {
      const joinYear = Number(p.careerLogSummary?.firstYear || p.recentCareerLog?.[0]?.year || 0);
      return { ...p, exitYear: year, exitReason: '戦力外', tenure: joinYear > 0 ? year - joinYear + 1 : 1 };
    })] };
}
