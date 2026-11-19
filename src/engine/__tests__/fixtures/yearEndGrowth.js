import { yearEndReviewWorld } from './yearEndRetirements';
import { wrap } from './annualRetirements';
import { reduceEconomyCommand, toAnnualState } from '../../contractEconomy';
import { yearEndRetirementCandidates, yearEndRetirementsId } from '../../annualYearEndRetirements';
export function growthSource(source) {
  const w = yearEndReviewWorld(source);
  const decisions = yearEndRetirementCandidates(toAnnualState(w), w.myId).filter(p => p.teamId === w.myId).map(p => ({ playerId: p.playerId, choice: 'accept' }));
  const r = reduceEconomyCommand(w, wrap(w, { id: yearEndRetirementsId(w.year), type: 'prepare-year-end-retirements', humanTeamId: w.myId, decisions }));
  if (!r.ok) throw Error(r.error);
  if (!source) for (const t of r.world.teams) for (const p of [...t.players,...t.farm]) {
    p.potential = 90;
    p.batting = Object.fromEntries(['contact','power','eye','speed','arm','defense','stealSkill','baseRunning','clutch'].map(k=>[k,60]));
  }
  return r.world;
}
export const growthCommand = w => wrap(w, { id: JSON.stringify(['year-end-growth', w.year]), type: 'prepare-year-end-growth',
  playerIds: w.teams.flatMap(t => [...t.players, ...t.farm]).filter(p => !p.isRetired && !p._retireNow).map(p => p.id).sort((a,b) => JSON.stringify(a) < JSON.stringify(b) ? -1 : JSON.stringify(a) > JSON.stringify(b) ? 1 : 0) });
