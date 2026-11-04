import { reduceEconomyCommand } from '../../contractEconomy';
import { inSeasonWorld } from './inSeasonDepartures';
import { reserve, wrap } from './annualRetirements';

export function retirementIncomeWorld(options, reservationId = 0) {
  const w = inSeasonWorld(options), c = reserve(w, w.teams[0].players[0].id, { id: reservationId });
  const r = reduceEconomyCommand(w, c);
  if (!r.ok) throw new Error(r.error);
  return r.world;
}
export const retirementIncomeCommand = (w, extra = {}) => wrap(w, {
  id: 'ceremony', type: 'record-extraordinary-income', kind: 'retirement-game',
  reservationId: w.contractEconomy.engine.retirementReservations[0].id,
  amountManYen: 12345, ...extra,
});
