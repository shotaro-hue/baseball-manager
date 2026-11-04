import { faWinter, declaration, envelope } from './faDeclarations';
import { reduceEconomyCommand } from '../../contractEconomy';

export function overseasMarket(options) {
  const w = faWinter(options), result = reduceEconomyCommand(w, declaration(w, 0, { kind: 'overseas-fa' }));
  if (!result.ok) throw new Error(result.error);
  return result.world;
}
export function overseasDeparture(w, overrides = {}) {
  const d = w.contractEconomy.engine.faDeclarations.find(d => d.kind === 'overseas-fa');
  return envelope(w, { id: 'overseas-' + d.player.id, type: 'depart-overseas', teamId: d.teamId,
    playerId: d.player.id, declarationId: d.id, marketEntryId: d.marketEntry.id, ...overrides });
}
