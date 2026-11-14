import { closedPostseasonWorld } from './openOffseason';
import { openOffseasonRequest, reduceOpenOffseasonRequest } from '../../annualOpenOffseason';

// PR-C's real dated postseason and finance producers, with explicit test ages
// only in the tiny roster. This is not the unfinished annual match Worker.
export function yearEndReviewWorld(source) {
  const w = closedPostseasonWorld(source);
  if (!source) w.teams.forEach(t => t.players.forEach(p => {
    p.age = t.id < 2 ? 42 : 20; p.retireStyle = 100;
  }));
  const r = reduceOpenOffseasonRequest(w, openOffseasonRequest(w));
  if (!r.ok) throw Error(r.error);
  return r.world;
}
