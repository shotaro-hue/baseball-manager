import { inSeasonWorld } from './inSeasonDepartures';
import { winter } from './annualRetirements';
import { envelope } from './faDeclarations';

export function postingWinter(options) {
  const w = inSeasonWorld(options); w.teams[0].players[0].postingRequested = true;
  return winter(w);
}
export function postingCommand(w, overrides = {}, teamId = w.teams[0].id, playerId = 0) {
  const team = w.teams.find(t => t.id === teamId), p = [...team.players, ...team.farm].find(p => p.id === playerId);
  return envelope(w, { id: 'post-' + playerId, type: 'end-contract', reason: 'posting', teamId, playerId,
    contractId: p?.contractId, settlement: 'retain', ...overrides });
}
