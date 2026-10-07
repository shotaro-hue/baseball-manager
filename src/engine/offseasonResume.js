export const OFFSEASON_SAVE_SCREENS = new Set(['offseason_planning', 'waiver_result', 'draft_preview',
  'draft_lottery', 'draft', 'draft_review', 'spring_training', 'new_season']);

const teamFields = ['activeTeams', 'lotteryTeams', 'allLotteryLosers'];
const playerFields = ['myPick', 'lotteryTarget'];
const pickFields = ['confirmedPicks', 'cpuPicks', 'resolvedPicks', 'round1Result'];
export function encodeLottery(state) {
  const out = { ...state };
  for (const key of teamFields) out[key] = (state[key] || []).map(t => t.id);
  for (const key of playerFields) out[key] = state[key]?.id ?? null;
  for (const key of pickFields) out[key] = state[key] == null ? null : Object.fromEntries(Object.entries(state[key]).map(([id, p]) => [id, p?.id ?? null]));
  out.lotteryResult = state.lotteryResult?.id ?? null;
  return out;
}
export function decodeLottery(state, teams, pool) {
  if (!state) return {};
  const out = { ...state };
  const player = id => pool.find(p => p.id === id) ?? null;
  const team = id => teams.find(t => t.id === id) ?? null;
  for (const key of teamFields) out[key] = (state[key] || []).map(team).filter(Boolean);
  for (const key of playerFields) out[key] = player(state[key]);
  for (const key of pickFields) out[key] = state[key] == null ? null : Object.fromEntries(Object.entries(state[key]).map(([id, pid]) => [id, player(pid)]));
  out.lotteryResult = team(state.lotteryResult);
  return out;
}
export function draftPicksForTeam(pool, drafted, teamId) {
  return pool.filter(p => (p._drafted && String(p._r1winner) === String(teamId))
    || (drafted?.[p.id] != null && String(drafted[p.id]) === String(teamId)));
}
