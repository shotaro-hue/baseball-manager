import { requestGenerationWorld } from './postingRequestGeneration';
import { reduceEconomyCommand, fromAnnualState, toAnnualState } from '../../contractEconomy';
import { atDate } from './inSeasonDepartures';
import { winter, wrap } from './annualRetirements';

// Real reserve-retirement commands, then the existing explicit winter fixture.
// This does not stand in for the unfinished annual Worker/calendar producer.
export function offseasonPostingWorld(options = {}) {
  let w = options.baseWorld ?? requestGenerationWorld(options);
  w.contractEconomy.engine.spending.budgetSeason = w.year;
  w = atDate(w, `${w.year}-09-01`);
  w = fromAnnualState(w, toAnnualState(w));
  for (const teamId of w.teams.slice(0, 2).map(t => t.id)) {
    const t = w.teams.find(t => t.id === teamId);
    const p = t.id === w.myId ? t.farm[0] : t.players[0];
    p.stats = { G: 80, HR: 17 };
    const r = reduceEconomyCommand(w, wrap(w, { id: 'off-retire-' + t.id, type: 'reserve-retirement',
      teamId: t.id, playerId: p.id, contractId: p.contractId }));
    if (!r.ok) throw Error(r.error);
    w = r.world;
    const current = w.teams.find(t => t.id === teamId);
    const played = [...current.players, ...current.farm].find(x => x.id === p.id);
    played.stats = { G: 130, HR: 27 }; played.playoffStats = { G: 8, HR: 3 };
  }
  return winter(w);
}
