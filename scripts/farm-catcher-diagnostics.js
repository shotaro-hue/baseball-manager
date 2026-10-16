import * as roster from '../src/engine/rosterAutomation';
import * as farm from '../src/engine/farmProgression';
import * as lifecycle from '../src/engine/regularGameUpdates';
import * as trade from '../src/engine/cpuTradeExecution';

// Test-side only. Match the farm's eligibility, including secondary positions,
// developmental players and registration cooldowns; active primary target is 2.
export function catcherSnapshot(team) {
  const catchers = ['players', 'farm'].flatMap(location => team[location]
    .filter(p => !p.isPitcher && roster.proficiencyAt(p, '捕手') > 0)
    .map(p => ({ id: p.id, name: p.name, location, pos: p.pos,
      proficiency: roster.proficiencyAt(p, '捕手'), injuryDays: Number(p.injuryDaysLeft || 0),
      developmental: roster.isIkuseiPlayer(p), cooldown: Number(p.registrationCooldownDays || 0) })));
  return { owned: catchers.length, healthy: catchers.filter(p => p.injuryDays === 0).length,
    injured: catchers.filter(p => p.injuryDays > 0).length,
    activePrimary: catchers.filter(p => p.location === 'players' && p.pos === '捕手'
      && !p.developmental && p.injuryDays === 0).length,
    farmHealthy: catchers.filter(p => p.location === 'farm' && p.injuryDays === 0).length, catchers };
}

function transitions(before, after) {
  const changes = after.catchers.flatMap(p => {
    const old = before.catchers.find(x => x.id === p.id);
    if (!old || old.location !== p.location || (old.injuryDays > 0) !== (p.injuryDays > 0)) {
      return [{ id: p.id, name: p.name, from: old || null, to: p }];
    }
    return [];
  });
  return [...changes, ...before.catchers.filter(p => !after.catchers.some(x => x.id === p.id))
    .map(p => ({ id: p.id, name: p.name, from: p, to: null }))];
}

export function createCatcherProbe(seed) {
  let year, round, phase;
  const seasons = new Map(), shortages = [], events = [], phases = [], decisions = new Map();
  return {
    phase(label, state) {
      year = state.year;
      phase = label;
      phases.push({ year, label, teams: state.teams.map(t => ({ teamId: t.id, ...catcherSnapshot(t) })) });
    },
    management(before, after, options) {
      const decision = { before, after: catcherSnapshot(after) };
      decisions.set(`${year}:${options.gameDay}:${after.id}`, decision);
      const changes = transitions(before, decision.after);
      if (changes.length) events.push({ year, round: options.gameDay, phase, teamId: after.id, stage: 'management', changes });
    },
    lifecycle(before, after, options) {
      const changes = transitions(before, catcherSnapshot(after));
      if (changes.length) events.push({ year: options.year, round: options.gameDay, phase, teamId: after.id, stage: 'postgame', changes });
    },
    emergency(before, after) {
      const changes = transitions(before, catcherSnapshot(after));
      if (changes.length) events.push({ year, round, phase, teamId: after.id, stage: 'postgame-emergency', changes });
    },
    trade(before, after, gameDay) {
      for (const team of after) {
        const changes = transitions(before.get(team.id), catcherSnapshot(team));
        if (changes.length) events.push({ year, round: gameDay, phase, teamId: team.id, stage: 'completed-trade', changes });
      }
    },
    pregame(state, teams, gameDay, competition) {
      year = state.year;
      round = gameDay;
      if (!seasons.has(year)) seasons.set(year, { year, rounds: 0, unplayedCards: 0, shortageClubDays: 0,
        constraints: {}, clubs: {}, reasons: {} });
      const season = seasons.get(year), cards = competition.cards.filter(c => c.round === round);
      season.rounds++;
      season.unplayedCards += cards.filter(c => c.status === 'unplayed').length;
      for (const reason of cards.flatMap(c => c.reasons || [])) {
        season.reasons[reason.code] = (season.reasons[reason.code] || 0) + 1;
        if (reason.code !== 'insufficient-catcher') continue;
        const team = teams.find(t => t.id === reason.teamId), snapshot = catcherSnapshot(team);
        if (snapshot.farmHealthy !== 0) throw Error('catcher diagnosis disagrees with farm selection');
        const constraint = snapshot.owned < 3 ? 'owned-under-three'
          : snapshot.healthy < 3 ? 'injury-under-three' : 'healthy-three-plus';
        let forcedRepair = null;
        if (snapshot.healthy >= 3) {
          // A read-only counterfactual, never adopted into game state. FULL
          // planning has no RNG. Its parity is checked against a plain batch.
          const plan = roster.buildFullRosterPlan(structuredClone(team), { teams, gameDay: round });
          const repaired = catcherSnapshot(plan.team);
          forcedRepair = plan.validation.valid && repaired.activePrimary >= 2 && repaired.farmHealthy > 0;
        }
        shortages.push({ year, round, teamId: team.id, constraint, forcedRepair, ...snapshot,
          management: decisions.get(`${year}:${round}:${team.id}`) || null });
        season.shortageClubDays++;
        season.constraints[constraint] = (season.constraints[constraint] || 0) + 1;
        season.clubs[team.id] = (season.clubs[team.id] || 0) + 1;
      }
    },
    report: () => ({ seed, seasons: [...seasons.values()], shortages, events, phases }),
  };
}

// Wrap real operations and return their results verbatim. No engine or hook is
// replaced, and no callback is installed in production code / Worker messages.
export function installCatcherProbe(vi, probe) {
  const manage = roster.applyManagementPolicy, prepare = farm.prepareFarmProgress;
  const update = lifecycle.applyRegularSeasonTeamUpdate, emergency = roster.applyEmergencyRosterMaintenance;
  const executeTrade = trade.executeCpuTrade;
  let insideTrade = false;
  const managementSpy = vi.spyOn(roster, 'applyManagementPolicy').mockImplementation((team, options) => {
    const before = catcherSnapshot(team), result = manage(team, options);
    // A trade prepares trial rosters before committing. Observe only the final
    // transaction, so failed proposals never become apparent real demotions.
    if (!insideTrade) probe.management(before, result, options);
    managementSpy.mockClear(); // Do not retain 3 years of full team snapshots.
    return result;
  });
  const emergencySpy = vi.spyOn(roster, 'applyEmergencyRosterMaintenance').mockImplementation((team, options) => {
    const before = catcherSnapshot(team), result = emergency(team, options);
    probe.emergency(before, result);
    emergencySpy.mockClear();
    return result;
  });
  const tradeSpy = vi.spyOn(trade, 'executeCpuTrade').mockImplementation((teams, offer, gameDay) => {
    const before = new Map(teams.map(t => [t.id, catcherSnapshot(t)]));
    insideTrade = true;
    try {
      const result = executeTrade(teams, offer, gameDay);
      if (result) probe.trade(before, teams, gameDay);
      return result;
    } finally { insideTrade = false; tradeSpy.mockClear(); }
  });
  const lifecycleSpy = vi.spyOn(lifecycle, 'applyRegularSeasonTeamUpdate').mockImplementation((team, result, options, rules) => {
    const before = catcherSnapshot(team), updated = update(team, result, options, rules);
    probe.lifecycle(before, updated.team, options);
    lifecycleSpy.mockClear();
    return updated;
  });
  const farmSpy = vi.spyOn(farm, 'prepareFarmProgress').mockImplementation((state, teams, round) => {
    const result = prepare(state, teams, round);
    if (result) probe.pregame(state, teams, round, result.competition);
    farmSpy.mockClear();
    return result;
  });
}
