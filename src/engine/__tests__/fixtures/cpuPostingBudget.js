import { requestGenerationWorld } from './postingRequestGeneration';
import { fromAnnualState, toAnnualState } from '../../contractEconomy';
import { playableClub } from './inSeasonDepartures';
import { postingWinter } from './postingDepartures';

// All 21 CPU players have guaranteed contracts through 2028. Only two peers
// want to leave; either can be replaced on the field, but needs 420万円/year.
export function cpuPostingBudgetWorld({ headroom = 0, season = 2028, interestedIds = ['club-1-0', 'club-1-4'], expiringPeer = false } = {}) {
  let w;
  if (expiringPeer) {
    const teams = [playableClub(), playableClub(1)];
    for (const t of teams) for (const p of [...t.players, ...t.farm]) p.contractYearsLeft = p.id === 'club-1-5' ? 1 : 3;
    w = postingWinter({ teams }); w.contractEconomy.randomRoot.seed = 'request-generation';
  } else w = requestGenerationWorld();
  for (const t of w.teams) for (const p of [...t.players, ...t.farm]) {
    p.personality = { ...p.personality, overseas: t.id === 0 || interestedIds.includes(p.id) ? 100 : 0 };
    p.morale = 30;
  }
  for (const list of [w.contractEconomy.engine.spending.authorizations, w.contractEconomy.budgetPolicies])
    list.find(r => r.teamId === 1 && r.season === season).approvedManYen = 21000 + headroom;
  w.contractEconomy.engine.rosterRequirements.find(r => r.teamId === 1 && r.season === season).requiredControlledCount = 21;
  return fromAnnualState(w, toAnnualState(w));
}
