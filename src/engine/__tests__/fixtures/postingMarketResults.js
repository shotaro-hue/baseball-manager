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

// Controlled model scenarios; real-roster acceptance is tested separately with
// its actual birth/pro history. Seeds are fixed before the first publication.
export function generatedPostingWorld(outcome = 'signed', world) {
  const w = approvedPostingWorld(world), p = w.teams[0].players[0];
  w.contractEconomy.randomRoot.seed = outcome === 'no-offer' ? 'market-case-8' : 'market-case-0';
  p.batting = { ...p.batting, contact: 85, power: 85, eye: 85 };
  p.personality = { ...p.personality, overseas: outcome === 'declined' ? 0 : 100,
    loyalty: outcome === 'declined' ? 100 : 0, stability: outcome === 'declined' ? 100 : 0 };
  return w;
}
