import { renewalEligible, ownedPlayers } from './renewalRules';
import { marketNeeds } from '../components/hub/faMarket';
import { OFFSEASON_SAVE_SCREENS } from './offseasonResume';

export const renewalFinished = status => ['signed', 'released', 'free', 'fa'].includes(status);
export const sumRecorded = values => values.every(Number.isFinite) ? values.reduce((a, b) => a + b, 0) : null;
// Only planning snapshots are compacted. Live player/career records remain.
export function planningPlayer(player) {
  const numericStats = stats => Object.fromEntries(Object.entries(stats || {}).filter(([, value]) => typeof value === 'number'));
  return { ...player, stats: numericStats(player.stats), playoffStats: numericStats(player.playoffStats),
    careerLog: [], recentCareerLog: (player.recentCareerLog || []).map(row => ({ ...row, stats: numericStats(row.stats) })) };
}
export function compactRenewalSession(session) {
  return session && { ...session, entries: session.entries.map(e => ({ ...e, player: planningPlayer(e.player) })) };
}
export function reconcileRenewalSession(session, team, year, previous) {
  if (!session) return session;
  return { ...session, entries: session.entries.map(e => {
    const live = ownedPlayers(team).find(p => p.id === e.player.id);
    if (live?.contractSignedYear === year) return { ...e, status: 'signed', terms: { salary: live.salary, years: live.contractYears } };
    const prior = previous?.entries.find(p => p.player.id === e.player.id);
    if (!live && !renewalFinished(e.status)) return { ...e, status: renewalFinished(prior?.status) ? prior.status : 'released' };
    return e;
  }) };
}
export function planningSummary(team, plan, year) {
  const owned = [...(team?.players || []), ...(team?.farm || [])];
  const entries = plan?.session?.entries || [];
  const intents = plan?.intents || [];
  const pending = owned.filter(p => renewalEligible(p, year) && !renewalFinished(entries.find(e => e.player.id === p.id)?.status));
  const releaseCandidates = owned.filter(p => renewalEligible(p, year) && intents.some(i => i.id === p.id && i.value === 'release'));
  const kept = owned.filter(p => !releaseCandidates.some(x => x.id === p.id));
  const salary = p => p.contractSignedYear === year ? p.salary : entries.find(e => e.player.id === p.id)?.terms?.salary ?? p.salary;
  return { owned: owned.length, active: team?.players?.length ?? 0, farm: team?.farm?.length ?? 0,
    projectedCount: kept.length, releaseCandidates, pending,
    payroll: sumRecorded(owned.map(salary)), projectedPayroll: sumRecorded(kept.map(salary)),
    budget: Number.isFinite(team?.budget) ? team.budget : null,
    positions: [...new Set(kept.map(p => p.isPitcher ? p.subtype || p.pos || '投手' : p.pos || '未記録'))].map(pos => ({ pos, count: kept.filter(p => (p.isPitcher ? p.subtype || p.pos || '投手' : p.pos || '未記録') === pos).length })),
    needs: marketNeeds({ ...team, players: (team?.players || []).filter(p => !releaseCandidates.some(x => x.id === p.id)), farm: team?.farm || [] }) };
}
export function planningResumeScreen(plan, year, myId) {
  if (plan?.version !== 1 || plan.year !== year || plan.myId !== myId) return 'hub';
  if (OFFSEASON_SAVE_SCREENS.has(plan.resumeScreen)) {
    const screen = plan.resumeScreen;
    if (screen === 'playoff' || screen === 'retire_phase') {
      if (plan.stage !== 'postseason' || !plan.playoff?.se1 || !plan.playoff?.pa1
        || !plan.playoff.cs1_se || !plan.playoff.cs1_pa) return 'hub';
      if (screen === 'retire_phase' && !plan.playoff.champion) return 'playoff';
    }
    if (['draft_preview', 'draft_lottery', 'draft', 'draft_review'].includes(screen)
      && !Array.isArray(plan.draftPool)) return plan.stage === 'results' ? 'waiver_result' : 'hub';
    if (screen === 'draft_review' && !plan.draftResult) return 'draft';
    if (screen === 'spring_training' && !plan.spring) return plan.draftResult ? 'draft_review' : 'waiver_result';
    return screen;
  }
  return ['planning', 'open'].includes(plan.stage) ? 'offseason_planning' : plan.stage === 'results' ? 'waiver_result' : 'hub';
}
