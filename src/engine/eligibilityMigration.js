import { initializePlayerEligibility, validatePlayerEligibility } from './playerEligibility';

// Optional player extension; never rewrite engine receipts, historical player
// snapshots, contracts, save identity, epoch, revision, clocks or RNG.
function completedFaCycles(world, player) {
  const engine = world.contractEconomy?.engine ?? world;
  const records = engine.faDeclarations ?? [];
  const accepted = engine.spending?.resolvedReservations ?? [];
  const acquisitions = engine.acquisitions ?? [];
  const joinedIds = new Set(acquisitions.filter(a => a.joinedDate).map(a => a.proposalId));
  const joinedEntries = new Set(accepted.filter(r => r.resolution === 'accepted' && joinedIds.has(r.proposal?.id))
    .map(r => r.proposal.marketEntry?.id));
  const events = records.filter(d => d.player.id === player.id && joinedEntries.has(d.marketEntry.id)).map(d => ({ id: d.id, season: d.season,
    baseline: d.player.eligibility?.fa.days ?? d.eligibility.days * 145 / 120,
    countAfter: d.exercise.countAfter, openingCount: d.player.eligibility?.fa.openingExerciseCount ?? 0 }));
  // Legacy live rosters have no common ledger. A recorded declaration followed
  // by current NPB ownership is the game history establishing a re-contract.
  if (world.teams?.some(t => [...(t.players ?? []), ...(t.farm ?? [])].some(p => p.id === player.id))) {
    for (const h of world.teams.flatMap(t => t.history ?? [])) {
      if (h.id !== player.id || !['FA宣言', '国内FA宣言', '海外FA宣言'].includes(h.exitReason)
        || !Number.isInteger(h.exitYear) || !Number.isFinite(h.daysOnActiveRoster)
        || events.some(e => e.season === h.exitYear)) continue;
      events.push({ id: JSON.stringify(['legacy-fa-history', player.id, h.exitYear]), season: h.exitYear,
        baseline: h.daysOnActiveRoster * 145 / 120, countAfter: null, openingCount: 0 });
    }
  }
  return events.sort((a, b) => a.season - b.season);
}

export function migratePlayerEligibility(p, world) {
    const year = world.year ?? world.season ?? 2026;
    if (p.eligibility !== undefined) { validatePlayerEligibility(p, { year }); return p; }
    const n = initializePlayerEligibility(p, { year });
    const fa = n.eligibility.fa;
    const events = completedFaCycles(world, p), last = events.at(-1);
    if (last) {
      fa.exerciseCount = Math.max(events.length, last.countAfter ?? 0);
      fa.openingExerciseCount = last.openingCount;
      fa.lastExerciseYear = last.season;
      fa.cycleStartDays = Math.min(fa.days, last.baseline);
      fa.grants = { domestic: false, overseas: false };
      fa.exerciseBasis = { kind: 'game-history', method: 'confirmed-npb-recontract-history',
        sourceIds: events.map(e => String(e.id)), coverage: p.realPlayerId || last.countAfter === null ? 'partial' : 'complete' };
      fa.qualificationBasis = { kind: 'game-history', method: 'legacy-consumed-fa-cycle', sourceIds: [String(last.id)] };
      // A later outstanding old declaration is already an immutable certificate,
      // even when today's rules would not issue it. Keep it until re-contract.
      const engine = world.contractEconomy?.engine ?? world;
      const current = (engine.faDeclarations ?? []).find(d => d.id === p.faDeclarationId && d.player.id === p.id);
      if (p.isFA && current && current.id !== last.id) {
        fa.grants = { domestic: Boolean(current.eligibility.domestic.eligible), overseas: Boolean(current.eligibility.overseas.eligible) };
        fa.qualificationBasis = { kind: 'game-history', method: 'preserved-confirmed-market-certificate', sourceIds: [String(current.id)] };
      }
    }
    // Prior legacy game-days were already included in the converted opening
    // balance. Mark the elapsed schedule to avoid replaying them after load.
    const elapsed = Math.min(143, Math.max(0, (world.gameDay ?? 1) - 1));
    fa.season = { year, processedDays: Array.from({ length: elapsed }, (_, i) => i + 1), creditedDays: Math.floor(elapsed * 145 / 143) };
    validatePlayerEligibility(n, { year });
    return n;
}

export function migrateEligibilityWorld(world) {
  const migrate = p => migratePlayerEligibility(p, world);
  return { ...world, teams: world.teams.map(t => ({ ...t, players: (t.players ?? []).map(migrate), farm: (t.farm ?? []).map(migrate) })),
    ...(Array.isArray(world.faPool) ? { faPool: world.faPool.map(migrate) } : {}) };
}
