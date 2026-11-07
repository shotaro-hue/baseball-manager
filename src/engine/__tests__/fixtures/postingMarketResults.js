import { approvedPostingWorld, qualificationCommand } from './postingQualifications';
import { gamePostingQualificationFacts } from '../../postingQualificationSnapshot';
import { reduceEconomyCommand } from '../../contractEconomy';
import { envelope } from './faDeclarations';

export function qualifiedPostingWorld(world) {
  const approved = approvedPostingWorld(world);
  const result = reduceEconomyCommand(approved, qualificationCommand(approved, {
    facts: gamePostingQualificationFacts(approved.teams[0].players[0], approved.year),
  }));
  if (!result.ok) throw new Error(result.error);
  return result.world;
}
export const marketResult = (world, outcome = 'signed', extra = {}) => envelope(world, {
  id: 'market', type: 'resolve-posting', requestId: 'request', qualificationId: 'qualification', outcome,
  ...(outcome === 'signed' ? { settlement: 'retain', overseasContract: { kind: 'major', guaranteedUsdCents: 10000000000 } } : {}),
  ...extra,
});
