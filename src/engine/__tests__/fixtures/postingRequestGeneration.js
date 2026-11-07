import { postingWinter } from './postingDepartures';
import { playableClub } from './inSeasonDepartures';
import { createInitialTeams } from '../../bootstrapTeams';

export function requestGenerationWorld({ realRoster = false, interested = true, natural = false } = {}) {
  const w = postingWinter(realRoster ? { teams: createInitialTeams() } : { years: 3, teams: [playableClub(), playableClub(1)].map(t => ({ ...t, players: t.players.map(p => ({ ...p, contractYearsLeft: 3 })), farm: t.farm.map(p => ({ ...p, contractYearsLeft: 3 })) })) });
  for (const t of w.teams) for (const p of [...t.players, ...t.farm]) {
    p.postingRequested = false;
    if (!natural) { p.personality = { ...p.personality, overseas: interested ? 100 : 0 }; p.morale = 30; }
  }
  w.contractEconomy.randomRoot.seed = 'request-generation';
  return w;
}
