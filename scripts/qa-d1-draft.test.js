import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it, vi } from 'vitest';
import { DRAFT_POOL_SIZE, DRAFT_ROUNDS, MAX_SHIHAKA_TOTAL, MIN_SALARY_SHIHAKA } from '../src/constants';
import { createInitialTeams } from '../src/engine/bootstrapTeams';
import { initDraftPool } from '../src/engine/draft';
import { draftReport, ensureDraftEvaluation } from '../src/engine/draftReports';
import { applyDraftAcquisitions, chooseDraftProspect, forecastDraft, rankDraftProspects,
  registeredDraftCount, remainingDraftSlots, resolveFirstRound } from '../src/engine/draftRules';
import { draftPicksForTeam } from '../src/engine/offseasonResume';
import { evaluateOrganizationNeeds } from '../src/engine/organizationNeeds';
import { ownedPlayers } from '../src/engine/renewalRules';
import { canAddToActiveRoster, isIkuseiPlayer } from '../src/engine/rosterAutomation';

// Measurement assertions are integrity/contract checks, not balance targets.
// Regenerate the reviewable evidence with:
// QA_D1_WRITE_EVIDENCE=1 npx vitest run scripts/qa-d1-draft.test.js
const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);
const YEAR = 2026;
const evidenceUrl = new URL('../docs/validation/qa-d1/draft-generated.json', import.meta.url);
const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const sum = values => values.reduce((total, value) => total + value, 0);
const mean = values => values.length ? sum(values) / values.length : null;
const rounded = value => value == null ? null : Math.round(value * 1e6) / 1e6;
const histogram = values => Object.fromEntries([...new Set(values)].sort((a, b) => String(a).localeCompare(String(b), 'en', { numeric: true }))
  .map(value => [value, values.filter(other => other === value).length]));
const describe = values => ({ n: values.length, min: values.length ? Math.min(...values) : null,
  max: values.length ? Math.max(...values) : null, mean: rounded(mean(values)),
  decileHistogram: histogram(values.map(value => `${Math.floor(value / 10) * 10}-${Math.floor(value / 10) * 10 + 9}`)) });

function deterministic(seed, work) {
  let state = seed >>> 0, cryptoState = (seed ^ 0x9e3779b9) >>> 0;
  const calls = { mathRandom: 0, cryptoRandomUUID: 0, cryptoGetRandomValues: 0 };
  const next = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; calls.mathRandom++; return state / 4294967296; };
  const nextCrypto = () => { cryptoState = (Math.imul(cryptoState, 1664525) + 1013904223) >>> 0; return cryptoState; };
  const random = vi.spyOn(Math, 'random').mockImplementation(next);
  // uid currently uses Math.random. Control crypto too so a future ID path cannot
  // make these otherwise reproducible reports depend on the host environment.
  vi.stubGlobal('crypto', {
    randomUUID() {
      calls.cryptoRandomUUID++;
      const hex = Array.from({ length: 4 }, () => nextCrypto().toString(16).padStart(8, '0')).join('');
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`;
    },
    getRandomValues(array) {
      calls.cryptoGetRandomValues++;
      for (let i = 0; i < array.length; i++) array[i] = nextCrypto();
      return array;
    },
  });
  try { return { result: work(), randomCalls: { ...calls } }; }
  finally { random.mockRestore(); vi.unstubAllGlobals(); }
}

function needs(team, teams, draftPool = [], drafted = {}) {
  const report = evaluateOrganizationNeeds(team, { teams, draftPool, drafted });
  expect(report.ok).toBe(true);
  const accepted = draftPicksForTeam(draftPool, drafted, team.id);
  expect([...report.acceptedPickIds].sort()).toEqual(accepted.map(p => p.id).sort());
  return {
    registered: report.registeredCount, accepted: report.acceptedPickCount,
    roles: Object.fromEntries(Object.entries(report.roles).map(([role, row]) => [role, {
      label: row.label, activeCount: row.activeCount, ownedCount: row.ownedCount,
      acceptedPickCount: row.acceptedPickCount, organizationCount: row.organizationCount,
      activeShortage: row.activeShortage, organizationShortage: row.organizationShortage,
      classification: row.classification,
      futureDepth: row.futureDepth && { youngCount: row.futureDepth.youngCount, primeCount: row.futureDepth.primeCount,
        youngShortage: row.futureDepth.youngShortage, primeShortage: row.futureDepth.primeShortage },
    }])),
    missingImportantPositions: Object.values(report.roles).filter(row => row.activeShortage || row.organizationShortage)
      .map(row => ({ role: row.role, label: row.label, activeShortage: row.activeShortage,
        organizationShortage: row.organizationShortage })),
  };
}

function observation(report) {
  return { current: report.current, future: report.future, uncertainty: report.uncertainty,
    skills: Object.fromEntries(Object.entries(report.skills).map(([key, row]) => [key, row.value])) };
}

function prospect(player, evaluation, teamId) {
  const actualSkills = { ...(player.isPitcher ? player.pitching : player.batting) };
  const coreKeys = player.isPitcher ? ['velocity', 'control', 'breaking'] : ['contact', 'power', 'eye'];
  return { id: player.id, role: player.isPitcher ? player.subtype : player.pos, age: player.age,
    prospectType: player.prospectType, actualCoreMean: rounded(mean(coreKeys.map(key => actualSkills[key]))),
    actualPotential: player.potential, readiness: player.readinessScore, actualSkills,
    publicObservation: observation(draftReport(evaluation, player.id)),
    ...(teamId == null ? {} : { teamObservation: observation(draftReport(evaluation, player.id, teamId)) }) };
}

function distributions(rows) {
  const ability = Object.fromEntries(['actualCoreMean', 'actualPotential', 'readiness']
    .map(key => [key, describe(rows.map(row => row[key]))]));
  for (const kind of ['publicObservation', 'teamObservation']) {
    const observed = rows.filter(row => row[kind]);
    ability[kind] = { current: describe(observed.map(row => row[kind].current)),
      future: describe(observed.map(row => row[kind].future)),
      skillMeanAbsoluteError: rounded(mean(observed.flatMap(row => Object.entries(row[kind].skills)
        .map(([key, value]) => Math.abs(value - row.actualSkills[key]))))) };
  }
  return { count: rows.length, roles: histogram(rows.map(row => row.role)), ages: histogram(rows.map(row => row.age)),
    prospectTypes: histogram(rows.map(row => row.prospectType)), ability };
}

function generatedDraft(seed) {
  return deterministic(seed, () => {
    const teams = createInitialTeams();
    let pool = initDraftPool(teams[0]);
    expect(teams).toHaveLength(12);
    expect(pool.length).toBeGreaterThanOrEqual(80);
    expect(pool.length).toBeGreaterThanOrEqual(DRAFT_POOL_SIZE);
    const inputSha256 = hash({ teams, pool });
    const beforeTeamsSha256 = hash(teams);
    const ownedIds = teams.flatMap(team => ownedPlayers(team).map(player => player.id));
    const allIds = [...ownedIds, ...pool.map(player => player.id)];
    expect(allIds.every(id => typeof id === 'string' && id.length > 0)).toBe(true);
    expect(new Set(allIds).size).toBe(allIds.length);
    const poolIds = pool.map(player => player.id);
    // All clubs use ordinary private CPU reports (width 18): no human scouting.
    const evaluation = ensureDraftEvaluation({ teams, pool, year: YEAR, myId: teams[0].id });
    const initialProspects = pool.map(player => prospect(player, evaluation));
    const before = teams.map(team => ({ teamId: team.id, teamName: team.name, needs: needs(team, teams) }));
    const firstContext = { teams, evaluation };
    const activeTeams = teams.filter(team => remainingDraftSlots(team) > 0);
    const nominations = Object.fromEntries(activeTeams.map(team => {
      const ranked = rankDraftProspects(team, pool, 1, [], firstContext);
      expect(ranked).toHaveLength(pool.length);
      expect(Number.isFinite(ranked[0].score)).toBe(true);
      return [team.id, chooseDraftProspect(team, pool, 1, [], { ...firstContext, activeTeamIds: activeTeams.map(t => t.id) }).id];
    }));
    const resolution = resolveFirstRound(teams, pool, firstContext);
    expect(resolution.rounds[0]).toEqual(nominations);
    const firstPicks = Object.entries(resolution.picks).map(([teamId, player]) => ({ teamId: Number(teamId), player }));
    expect(new Set(firstPicks.map(row => row.player.id)).size).toBe(firstPicks.length);
    expect(firstPicks).toHaveLength(activeTeams.length);
    const selected = firstPicks.map(({ teamId, player }) => ({ round: 1, teamId, ...prospect(player, evaluation, teamId) }));
    const winners = new Map(firstPicks.map(({ teamId, player }) => [player.id, teamId]));
    pool = pool.map(player => winners.has(player.id)
      ? { ...player, _drafted: true, _r1winner: winners.get(player.id) } : player);
    const drafted = {}, laterTurns = [];
    const order = [...teams].sort((a, b) => a.wins - b.wins);
    for (let round = 2; round <= DRAFT_ROUNDS; round++) {
      for (const team of order) {
        const available = pool.filter(player => !player._drafted && !Object.hasOwn(drafted, player.id));
        const acceptedPicks = draftPicksForTeam(pool, drafted, team.id);
        const slots = remainingDraftSlots(team, pool, drafted);
        const reflected = needs(team, teams, pool, drafted);
        expect(reflected.accepted).toBe(acceptedPicks.length);
        expect(slots).toBe(Math.max(0, MAX_SHIHAKA_TOTAL - registeredDraftCount(team) - acceptedPicks.length));
        if (!available.length || !slots) {
          laterTurns.push({ round, teamId: team.id, skipped: !available.length ? 'pool-exhausted' : 'registration-full',
            acceptedBeforeIds: acceptedPicks.map(player => player.id), slotsBefore: slots });
          continue;
        }
        const context = { teams, draftPool: pool, drafted, evaluation };
        const ranked = rankDraftProspects(team, available, round, acceptedPicks, context);
        const pick = chooseDraftProspect(team, available, round, acceptedPicks, context);
        // The public accepted-array API and the canonical pool/assignments must
        // agree for the same valid confirmed selections, including all prior rounds.
        expect(rankDraftProspects(team, available, round, acceptedPicks, { teams, evaluation })
          .map(row => [row.p.id, row.score])).toEqual(ranked.map(row => [row.p.id, row.score]));
        expect(pick.id).toBe(ranked[0].p.id);
        expect(available.some(player => player.id === pick.id)).toBe(true);
        expect(ownedIds.includes(pick.id)).toBe(false);
        expect(selected.some(row => row.id === pick.id)).toBe(false);
        const withoutAccepted = chooseDraftProspect(team, available, round, [], { teams, evaluation });
        const record = { round, teamId: team.id, ...prospect(pick, evaluation, team.id) };
        selected.push(record);
        laterTurns.push({ round, teamId: team.id, selectedId: pick.id, rankedFirstScore: rounded(ranked[0].score),
          fitReason: ranked[0].fitReason, acceptedBeforeIds: acceptedPicks.map(player => player.id),
          acceptedBeforeByRole: Object.fromEntries(Object.entries(reflected.roles).map(([role, row]) => [role, row.acceptedPickCount])),
          slotsBefore: slots, choiceWithoutAcceptedId: withoutAccepted.id });
        drafted[pick.id] = team.id;
      }
    }
    expect(new Set(selected.map(row => row.id)).size).toBe(selected.length);
    expect(selected.every(row => poolIds.includes(row.id))).toBe(true);
    const projected = teams.map(team => ({ teamId: team.id, needs: needs(team, teams, pool, drafted) }));
    const acquisition = applyDraftAcquisitions(teams, pool, drafted, YEAR);
    expect(acquisition.ok).toBe(true);
    expect(hash(teams)).toBe(beforeTeamsSha256);
    const finalIds = acquisition.teams.flatMap(team => ownedPlayers(team).map(player => player.id));
    expect(new Set(finalIds).size).toBe(finalIds.length);
    expect(finalIds.filter(id => !ownedIds.includes(id)).sort()).toEqual(selected.map(row => row.id).sort());
    const after = acquisition.teams.map(team => {
      const picks = selected.filter(row => row.teamId === team.id);
      const previous = teams.find(old => old.id === team.id);
      expect(registeredDraftCount(team)).toBeLessThanOrEqual(MAX_SHIHAKA_TOTAL);
      expect(registeredDraftCount(team)).toBe(registeredDraftCount(previous) + picks.length);
      for (const pick of picks) {
        const acquired = team.farm.find(player => player.id === pick.id);
        expect(acquired).toBeDefined();
        expect(isIkuseiPlayer(acquired)).toBe(false);
        expect(canAddToActiveRoster(acquired, [])).toBe(true);
        expect(acquired.salary).toBeGreaterThanOrEqual(MIN_SALARY_SHIHAKA);
        expect([acquired.contractYears, acquired.contractYearsLeft, acquired.contractSignedYear]).toEqual([1, 1, YEAR]);
      }
      const actual = needs(team, acquisition.teams);
      const projection = projected.find(row => row.teamId === team.id).needs;
      for (const [role, row] of Object.entries(actual.roles)) {
        expect(row.organizationCount).toBe(projection.roles[role].organizationCount);
        expect(row.organizationShortage).toBe(projection.roles[role].organizationShortage);
        expect(row.activeCount).toBe(before.find(old => old.teamId === team.id).needs.roles[role].activeCount);
      }
      return { teamId: team.id, needs: actual };
    });
    // A repeated confirmation must not acquire the same players twice.
    const again = applyDraftAcquisitions(acquisition.teams, pool, drafted, YEAR);
    expect(again.ok).toBe(true);
    expect(again.teams).toEqual(acquisition.teams);
    const groups = histogram(Object.values(nominations));
    const overlaps = Object.values(groups);
    return { seed, inputSha256, initialOwnedIdsSha256: hash(ownedIds), generatedPoolIds: poolIds,
      poolDistribution: distributions(initialProspects), firstRound: {
        activeTeams: activeTeams.length, initialNominations: nominations,
        uniqueCandidates: overlaps.length, overlapExcess: activeTeams.length - overlaps.length,
        singletonTeams: overlaps.filter(count => count === 1).length,
        contestedCandidates: overlaps.filter(count => count > 1).length,
        teamsInContests: sum(overlaps.filter(count => count > 1)), maxOverlap: Math.max(0, ...overlaps),
        reLotteryCount: Math.max(0, resolution.rounds.length - 1),
        reLotteryNominations: sum(resolution.rounds.slice(1).map(round => Object.keys(round).length)),
        nominationRounds: resolution.rounds,
      }, selected, laterTurns, needsBefore: before, needsProjectedAfter: projected, needsAfter: after,
      selectedDistribution: distributions(selected), finalOwnershipSha256: hash(finalIds) };
  });
}

function aggregate(samples) {
  const rows = samples.map(sample => sample.result);
  const firstRound = Object.fromEntries(['uniqueCandidates', 'overlapExcess', 'singletonTeams', 'contestedCandidates',
    'teamsInContests', 'maxOverlap', 'reLotteryCount', 'reLotteryNominations'].map(key => {
    const values = rows.map(row => row.firstRound[key]);
    return [key, { min: Math.min(...values), max: Math.max(...values), mean: rounded(mean(values)), histogram: histogram(values) }];
  }));
  const selections = rows.flatMap(row => row.selected);
  const turns = rows.flatMap(row => row.laterTurns);
  const needsByStage = Object.fromEntries(['needsBefore', 'needsProjectedAfter', 'needsAfter'].map(stage => {
    const teams = rows.flatMap(row => row[stage]);
    return [stage, { teams: teams.length,
      registered: describe(teams.map(team => team.needs.registered)),
      teamsWithMissingImportantPositions: teams.filter(team => team.needs.missingImportantPositions.length).length,
      teamsWithActiveShortage: teams.filter(team => Object.values(team.needs.roles).some(role => role.activeShortage > 0)).length,
      teamsWithOrganizationShortage: teams.filter(team => Object.values(team.needs.roles).some(role => role.organizationShortage > 0)).length,
      roles: Object.fromEntries(Object.keys(teams[0].needs.roles).map(role => [role, {
        activeShortageTotal: sum(teams.map(team => team.needs.roles[role].activeShortage)),
        organizationShortageTotal: sum(teams.map(team => team.needs.roles[role].organizationShortage)),
        teamsWithActiveShortage: teams.filter(team => team.needs.roles[role].activeShortage > 0).length,
        teamsWithOrganizationShortage: teams.filter(team => team.needs.roles[role].organizationShortage > 0).length,
        ...(role === 'starter' ? {
          youngShortageTotal: sum(teams.map(team => team.needs.roles[role].futureDepth.youngShortage)),
          primeShortageTotal: sum(teams.map(team => team.needs.roles[role].futureDepth.primeShortage)),
        } : {}),
      }])) }];
  }));
  return { generatedDrafts: rows.length, initialTeams: rows.length * 12, generatedProspects: sum(rows.map(row => row.generatedPoolIds.length)),
    firstRound, selected: distributions(selections),
    selectedByRound: Object.fromEntries(Array.from({ length: DRAFT_ROUNDS }, (_, i) => i + 1)
      .map(round => [round, distributions(selections.filter(row => row.round === round))])),
    laterRoundTurns: turns.length, laterRoundSelections: turns.filter(turn => turn.selectedId).length,
    laterRoundSkips: histogram(turns.filter(turn => turn.skipped).map(turn => turn.skipped)),
    laterChoicesChangedByConfirmedPicks: turns.filter(turn => turn.selectedId && turn.selectedId !== turn.choiceWithoutAcceptedId).length,
    needs: needsByStage };
}

it('measures 20 real generated 12-CPU drafts, every round, and acquisition integrity with deterministic replay', () => {
  const samples = SEEDS.map(seed => {
    const sample = generatedDraft(seed);
    // Replay the entire generator, IDs, lotteries, rankings, later picks and
    // acquisitions. Hash equality includes all raw observations and needs.
    expect(hash(generatedDraft(seed))).toBe(hash(sample));
    return sample;
  });
  const productionFiles = ['src/constants.js', 'src/utils.js', 'src/engine/bootstrapTeams.js', 'src/engine/playerCore.js',
    'src/engine/realplayer.js', 'src/engine/draft.js', 'src/engine/draftRules.js', 'src/engine/draftReports.js',
    'src/engine/organizationNeeds.js', 'src/engine/offseasonResume.js', 'src/engine/rosterAutomation.js'];
  const evidence = { schemaVersion: 1, source: {
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    tree: execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { encoding: 'utf8' }).trim(),
    productionFilesSha256: Object.fromEntries(productionFiles.map(path => [path, hash(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'))])),
    harnessSha256: hash(readFileSync(fileURLToPath(import.meta.url), 'utf8')),
  }, configuration: { seeds: SEEDS, year: YEAR, replayCountPerSeed: 2,
    random: 'uint32 LCG: state=(imul(state,1664525)+1013904223)>>>0; Math.random=state/2^32',
    crypto: 'Separate same LCG seeded with seed XOR 0x9e3779b9; randomUUID and getRandomValues controlled',
    rounds: DRAFT_ROUNDS, prospectMinimum: 80, clubs: 12,
    order: 'DraftScreen: ascending wins for every round; first round uses resolveFirstRound',
    reports: 'ensureDraftEvaluation; ordinary private CPU uncertainty 18; no human scouting or refinement',
    refusals: 'No human club: CPU picks do not invoke draftRefused, matching production CPU behavior',
    acquisition: 'Only after all rounds, through applyDraftAcquisitions; confirmed first picks use _drafted/_r1winner',
    actualCoreMean: 'Unweighted velocity/control/breaking for pitchers; contact/power/eye for batters. Not the role-weighted observed current.',
    abilityHistograms: '10-point bins; no asserted quality, concentration, role or age balance thresholds',
  }, limitations: [
    'Twenty independent game-start rosters plus generated classes, not twenty played seasons or a longitudinal balance result.',
    'One draft year; no contract, retirement, growth, season simulation, UI, save/load or player outcomes in this measurement.',
    'Starting roster composition and existing six-round rules determine available slots. CPU registration skips remain intact.',
    'Missing important positions use production organizationNeeds primary-role minima; secondary positions and ability readiness are unassessed.',
    'Acquisitions enter the farm. Active operating shortages can remain although projected organization depth improves.',
    'Refusal/exhausted-pool/legacy-report edge cases are covered separately by existing regressions and browser/offseason QA.',
  ], aggregate: aggregate(samples), samples };
  if (process.env.QA_D1_WRITE_EVIDENCE === '1') {
    mkdirSync(new URL('.', evidenceUrl), { recursive: true });
    // Keep the summary reviewable without inflating machine-readable raw rows.
    const { samples: rawSamples, ...summary } = evidence;
    writeFileSync(evidenceUrl, `${JSON.stringify(summary, null, 2).slice(0, -2)},\n  "samples": [\n${rawSamples
      .map(sample => `    ${JSON.stringify(sample)}`).join(',\n')}\n  ]\n}\n`);
  }
  console.log('QA_D1_GENERATED_DRAFTS', JSON.stringify({ seeds: SEEDS.length, selected: evidence.aggregate.selected.count,
    firstRound: evidence.aggregate.firstRound, laterChoicesChangedByConfirmedPicks: evidence.aggregate.laterChoicesChangedByConfirmedPicks }));
}, 180000);

it('keeps generated-pool public forecasts independent of private reports, hidden abilities and nominations', () => {
  deterministic(101, () => {
    const teams = createInitialTeams(), pool = initDraftPool(teams[0]);
    const evaluation = ensureDraftEvaluation({ teams, pool, year: YEAR, myId: teams[0].id });
    const before = forecastDraft(teams, pool, teams[0].id, { evaluation });
    const hiddenChanged = pool.map(player => ({ ...player, potential: 1,
      pitching: player.pitching && Object.fromEntries(Object.keys(player.pitching).map(key => [key, 1])),
      batting: player.batting && Object.fromEntries(Object.keys(player.batting).map(key => [key, 1])) }));
    expect(forecastDraft(teams, hiddenChanged, teams[0].id, {
      evaluation: { ...evaluation, teams: {} }, cpuPicks: { [teams[1].id]: pool.at(-1) },
    })).toEqual(before);
    // A club ranking with frozen observations also cannot read hidden prospect ability.
    for (const team of teams) {
      expect(rankDraftProspects(team, hiddenChanged, 2, [], { teams, evaluation }).map(row => [row.p.id, row.score]))
        .toEqual(rankDraftProspects(team, pool, 2, [], { teams, evaluation }).map(row => [row.p.id, row.score]));
    }
  });
});
