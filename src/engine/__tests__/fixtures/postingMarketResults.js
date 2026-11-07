import { approvedPostingWorld, qualificationCommand } from './postingQualifications';
import { gamePostingQualificationFacts } from '../../postingQualificationSnapshot';
import { reduceEconomyCommand } from '../../contractEconomy';
import { envelope } from './faDeclarations';
import { playableClub } from './inSeasonDepartures';
import { postingWinter } from './postingDepartures';

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

// The review counterexample: a real native ledger and the ordinary approved
// request path, before generating either a legacy or current numeric receipt.
export function postingMathWorld() {
  const teams = [playableClub(), playableClub(1)];
  Object.assign(teams[0].players[0], { salary: 5700, isPitcher: true, pos: '先発', subtype: '先発',
    pitching: { velocity: 65, control: 65, breaking: 65, stamina: 65 },
    personality: { overseas: 100, money: 50, loyalty: 0, stability: 0 }, stats: {} });
  const world = approvedPostingWorld(postingWinter({ teams, years: 1 }));
  world.contractEconomy.randomRoot.seed = 'review-math-6';
  return world;
}
