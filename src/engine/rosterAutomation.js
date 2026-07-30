import {
  FIELDING_POSITIONS,
  MAX_ROSTER,
  MIN_ACTIVE_CATCHERS,
  OPTIMAL_PITCHER_COUNT,
  ROSTER_DEVREC_BONUS,
  ROSTER_DEVREC_DAYS_MAX,
  ROSTER_DEVREC_POTENTIAL_MIN,
  ROSTER_SWAP_SCORE_THRESHOLD,
} from '../constants';
import { saberPitcher } from './sabermetrics';
import {
  createBattedBallLeagueContext,
} from './cpuBatterEvaluation';
import {
  ensureManagementIdentity,
  evaluateBatterForPolicy,
  getManagementPolicy,
  getManagementTrait,
  shouldRunLineupManagement,
  shouldRunRosterManagement,
} from './managementPolicy';

const MAX_FOREIGN_ACTIVE = 4;
const SUBTYPE_STARTER = '\u5148\u767a';
const POS_CATCHER = '\u6355\u624b';
const IKUSEI_KEY = '\u80b2\u6210';

const getRosterDhMode = (team, rosterDhMode) =>
  rosterDhMode ?? team.rosterDhMode ?? team.dhEnabled ?? false;

const isIkuseiPlayer = (player) => !!player?.[IKUSEI_KEY];

export const starterScore = (player) => {
  const stats = saberPitcher(player.stats ?? {});
  const eraBonus = stats.ERA > 0 ? Math.max(0, (4 - stats.ERA) * 15) : 0;
  return (player.pitching?.velocity ?? 50) * 1.2
    + (player.pitching?.control ?? 50) * 1.5
    + (player.pitching?.breaking ?? 50) * 1.0
    + (player.pitching?.stamina ?? 50) * 2.0
    + eraBonus;
};

export const relieverScore = (player) => {
  const stats = saberPitcher(player.stats ?? {});
  const eraBonus = stats.ERA > 0 ? Math.max(0, (4 - stats.ERA) * 15) : 0;
  return (player.pitching?.velocity ?? 50) * 2.0
    + (player.pitching?.control ?? 50) * 1.5
    + (player.pitching?.breaking ?? 50) * 1.2
    + (player.pitching?.stamina ?? 50) * 0.5
    + eraBonus;
};

export const batterScore = (player, leagueContext = {}, team = {}, options = {}) =>
  evaluateBatterForPolicy(player, team, { ...options, leagueContext }).total;

export const rosterRecScore = (player, team = {}, options = {}) => {
  if (player.isPitcher) {
    const stats = saberPitcher(player.stats ?? {});
    const ability = (player.pitching?.velocity ?? 50) * 1.2
      + (player.pitching?.control ?? 50) * 1.5
      + (player.pitching?.breaking ?? 50) * 1.0
      + (player.pitching?.stamina ?? 50) * 0.8;
    if (!stats.ERA && !stats.WHIP) return ability;
    const eraScore = stats.ERA > 0 ? Math.max(0, (5.0 - stats.ERA) * 35) : 0;
    const whipScore = stats.WHIP > 0 ? Math.max(0, (1.5 - stats.WHIP) * 50) : 0;
    return ability * 0.55 + eraScore + whipScore;
  }
  return batterScore(player, options.leagueContext, team, options);
};

const proficiencyAt = (player, pos) =>
  pos === 'DH' ? 50 : player.pos === pos ? 100 : (player.positions?.[pos] ?? 0);

export function buildAutoLineupEntries(team, options = {}) {
  const rosterDhMode = getRosterDhMode(team, options.rosterDhMode);
  const required = [...FIELDING_POSITIONS, ...(rosterDhMode ? ['DH'] : [])];
  const eligibleBatters = (team.players || []).filter(
    (player) => !player.isPitcher && !isIkuseiPlayer(player) && (player.injuryDaysLeft ?? 0) === 0,
  );
  const leagueContext = options.leagueContext || createBattedBallLeagueContext([
    ...(team.players || []),
    ...(team.farm || []),
  ]);
  const sortedBatters = [...eligibleBatters].sort(
    (a, b) => batterScore(b, leagueContext, team, options) - batterScore(a, leagueContext, team, options),
  );
  const posEligible = Object.fromEntries(
    required.map((pos) => [pos, sortedBatters.filter((player) => proficiencyAt(player, pos) > 0)]),
  );
  const posOrder = [...required].sort((a, b) => posEligible[a].length - posEligible[b].length);
  const assignment = new Map();
  const usedPlayers = new Set();

  for (const pos of posOrder) {
    const best = posEligible[pos].find((player) => !usedPlayers.has(player.id));
    if (best) {
      assignment.set(pos, best);
      usedPlayers.add(best.id);
    }
  }
  for (const pos of posOrder) {
    if (assignment.has(pos)) continue;
    const fallback = sortedBatters.find((player) => !usedPlayers.has(player.id));
    if (fallback) {
      assignment.set(pos, fallback);
      usedPlayers.add(fallback.id);
    }
  }

  const entries = [...assignment.entries()].map(([pos, player]) => ({ id: player.id, pos, player }));
  const evaluation = (entry) =>
    evaluateBatterForPolicy(entry.player, team, { ...options, leagueContext });
  const onBase = (entry) => {
    const stats = entry.player?.stats || {};
    const pa = Math.max(1, Number(stats.PA) || 0);
    return evaluation(entry).total
      + (Number(entry.player?.batting?.eye ?? 50) - 50) * 0.25
      + (Number(entry.player?.batting?.speed ?? 50) - 50) * 0.18
      + ((Number(stats.BB) || 0) / pa) * 20;
  };
  const power = (entry) => evaluation(entry).total
    + (Number(entry.player?.batting?.power ?? 50) - 50) * 0.35;
  const remaining = [...entries];
  const take = (sorter) => {
    remaining.sort(sorter);
    return remaining.shift();
  };
  const battingOrder = [];
  if (remaining.length) battingOrder.push(take((a, b) => onBase(b) - onBase(a)));
  if (remaining.length) battingOrder.push(take((a, b) => onBase(b) - onBase(a)));
  if (remaining.length) battingOrder.push(take((a, b) => evaluation(b).total - evaluation(a).total));
  if (remaining.length) battingOrder.push(take((a, b) => power(b) - power(a)));
  if (remaining.length) battingOrder.push(take((a, b) => power(b) - power(a)));
  remaining.sort((a, b) => evaluation(b).total - evaluation(a).total);
  return [...battingOrder, ...remaining].filter(Boolean).map(({ id, pos }) => ({ id, pos }));
}

export function buildAutoPitchingStaff(team) {
  const eligiblePitchers = (team.players || []).filter(
    (player) => player.isPitcher && !isIkuseiPlayer(player) && (player.injuryDaysLeft ?? 0) === 0,
  );
  const starters = eligiblePitchers
    .filter((player) => player.subtype === SUBTYPE_STARTER)
    .sort((a, b) => starterScore(b) - starterScore(a));
  const relievers = eligiblePitchers
    .filter((player) => player.subtype !== SUBTYPE_STARTER)
    .sort((a, b) => relieverScore(b) - relieverScore(a));
  const rotation = [
    ...starters.slice(0, 6),
    ...relievers.slice(0, Math.max(0, 6 - starters.length)),
  ].map((player) => player.id);
  const rotationSet = new Set(rotation);
  const remaining = eligiblePitchers
    .filter((player) => !rotationSet.has(player.id))
    .sort((a, b) => relieverScore(b) - relieverScore(a));

  return {
    rotation,
    pitchingPattern: {
      closerId: remaining[0]?.id ?? null,
      setupId: remaining[1]?.id ?? null,
      seventhId: remaining[2]?.id ?? null,
      middleOrder: remaining.slice(3).map((player) => player.id),
    },
  };
}

export function buildAutoManagedRoster(team, options = {}) {
  const rosterDhMode = getRosterDhMode(team, options.rosterDhMode);
  const lineupEntries = buildAutoLineupEntries(team, { ...options, rosterDhMode });
  const lineupIds = lineupEntries.map((entry) => entry.id);
  const { rotation, pitchingPattern } = buildAutoPitchingStaff(team);
  const players = (team.players || []).map((player) => {
    const entry = lineupEntries.find((lineupEntry) => lineupEntry.id === player.id);
    return entry && entry.pos !== player.pos ? { ...player, pos: entry.pos } : player;
  });
  const lineupNoDh = buildAutoLineupEntries({ ...team, players }, { ...options, rosterDhMode: false })
    .map((entry) => entry.id)
    .slice(0, 8);
  const lineupDh = buildAutoLineupEntries({ ...team, players }, { ...options, rosterDhMode: true })
    .map((entry) => entry.id)
    .slice(0, 9);

  return {
    ...team,
    players,
    rosterDhMode,
    lineupEntries,
    lineup: lineupIds,
    lineupNoDh,
    lineupDh,
    rotation,
    pitchingPattern,
  };
}

export function buildRosterRecs(team, options = {}) {
  const recs = [];
  const foreignInActive = (team.players || []).filter((player) => player.isForeign).length;
  const canPromote = (player) =>
    !isIkuseiPlayer(player)
    && (player.injuryDaysLeft ?? 0) === 0
    && (player.registrationCooldownDays ?? 0) === 0
    && !(player.isForeign && foreignInActive >= MAX_FOREIGN_ACTIVE);

  const effectiveScore = (player, isFarm) => {
    const base = rosterRecScore(player, team, options);
    const devBonus = isFarm
      && (player.potential ?? 0) >= ROSTER_DEVREC_POTENTIAL_MIN
      && (player.daysOnActiveRoster ?? 0) < ROSTER_DEVREC_DAYS_MAX
      ? ROSTER_DEVREC_BONUS
      : 0;
    return base + devBonus;
  };

  const targetBatters = MAX_ROSTER - OPTIMAL_PITCHER_COUNT;
  let projectedPlayers = [...(team.players || [])];
  let projectedFarm = [...(team.farm || [])];
  const usedFarmIds = new Set();
  const usedActiveIds = new Set();

  const openSlots = MAX_ROSTER - projectedPlayers.length;
  if (openSlots < 0) {
    const excess = -openSlots;
    const pitcherOver = Math.max(
      0,
      projectedPlayers.filter((player) => player.isPitcher).length - OPTIMAL_PITCHER_COUNT,
    );
    const batterOver = Math.max(
      0,
      projectedPlayers.filter((player) => !player.isPitcher).length - targetBatters,
    );
    const addDemotes = (candidates, limit) => {
      [...candidates]
        .sort((a, b) => effectiveScore(a, false) - effectiveScore(b, false))
        .slice(0, limit)
        .forEach((player) => {
          if (usedActiveIds.has(player.id)) return;
          recs.push({
            type: 'demote',
            downPlayer: player,
            upPlayer: null,
            scoreDiff: 0,
            reasons: ['一軍枠超過', '方針評価下位'],
          });
          usedActiveIds.add(player.id);
          projectedPlayers = projectedPlayers.filter((candidate) => candidate.id !== player.id);
        });
    };
    addDemotes(projectedPlayers.filter((player) => player.isPitcher), Math.min(pitcherOver, excess));
    addDemotes(
      projectedPlayers.filter((player) => !player.isPitcher),
      Math.min(batterOver, excess - usedActiveIds.size),
    );
    if (usedActiveIds.size < excess) {
      addDemotes(
        projectedPlayers.filter((player) => !usedActiveIds.has(player.id)),
        excess - usedActiveIds.size,
      );
    }
    return recs;
  }

  let slotsLeft = openSlots;
  const eligiblePitchers = projectedFarm
    .filter((player) => player.isPitcher && canPromote(player))
    .sort((a, b) => effectiveScore(b, true) - effectiveScore(a, true));
  const eligibleBatters = projectedFarm
    .filter((player) => !player.isPitcher && canPromote(player))
    .sort((a, b) => effectiveScore(b, true) - effectiveScore(a, true));

  const addPromotes = (candidates, limit) => {
    candidates.slice(0, limit).forEach((player) => {
      if (usedFarmIds.has(player.id) || slotsLeft <= 0) return;
      recs.push({
        type: 'promote',
        upPlayer: player,
        downPlayer: null,
        scoreDiff: Math.round(effectiveScore(player, true)),
        reasons: ['方針評価上位', '一軍枠を充足'],
      });
      usedFarmIds.add(player.id);
      projectedPlayers.push(player);
      projectedFarm = projectedFarm.filter((candidate) => candidate.id !== player.id);
      slotsLeft -= 1;
    });
  };

  const pitcherNeed = Math.max(
    0,
    OPTIMAL_PITCHER_COUNT - projectedPlayers.filter((player) => player.isPitcher).length,
  );
  addPromotes(eligiblePitchers, pitcherNeed);

  const batterNeed = Math.max(
    0,
    targetBatters - projectedPlayers.filter((player) => !player.isPitcher).length,
  );
  addPromotes(eligibleBatters.filter((player) => !usedFarmIds.has(player.id)), batterNeed);

  if (slotsLeft > 0) {
    addPromotes(
      [...projectedFarm]
        .filter((player) => canPromote(player) && !usedFarmIds.has(player.id))
        .sort((a, b) => effectiveScore(b, true) - effectiveScore(a, true)),
      slotsLeft,
    );
  }

  let currentPitchers = projectedPlayers.filter((player) => player.isPitcher).length;
  let currentBatters = projectedPlayers.filter((player) => !player.isPitcher).length;

  while (currentPitchers < OPTIMAL_PITCHER_COUNT && currentBatters > targetBatters) {
    const farmPitcher = projectedFarm
      .filter((player) => player.isPitcher && canPromote(player) && !usedFarmIds.has(player.id))
      .sort((a, b) => effectiveScore(b, true) - effectiveScore(a, true))[0];
    const activeBatter = projectedPlayers
      .filter((player) => !player.isPitcher && !usedActiveIds.has(player.id))
      .sort((a, b) => effectiveScore(a, false) - effectiveScore(b, false))[0];
    if (!farmPitcher || !activeBatter) break;
    recs.push({
      type: 'swap',
      upPlayer: farmPitcher,
      downPlayer: activeBatter,
      scoreDiff: Math.round(effectiveScore(farmPitcher, true) - effectiveScore(activeBatter, false)),
      reasons: ['投手人数を調整'],
    });
    usedFarmIds.add(farmPitcher.id);
    usedActiveIds.add(activeBatter.id);
    projectedPlayers = [
      ...projectedPlayers.filter((player) => player.id !== activeBatter.id),
      farmPitcher,
    ];
    projectedFarm = projectedFarm.filter((player) => player.id !== farmPitcher.id);
    currentPitchers = projectedPlayers.filter((player) => player.isPitcher).length;
    currentBatters = projectedPlayers.filter((player) => !player.isPitcher).length;
  }

  while (currentBatters < targetBatters && currentPitchers > OPTIMAL_PITCHER_COUNT) {
    const farmBatter = projectedFarm
      .filter((player) => !player.isPitcher && canPromote(player) && !usedFarmIds.has(player.id))
      .sort((a, b) => effectiveScore(b, true) - effectiveScore(a, true))[0];
    const activePitcher = projectedPlayers
      .filter((player) => player.isPitcher && !usedActiveIds.has(player.id))
      .sort((a, b) => effectiveScore(a, false) - effectiveScore(b, false))[0];
    if (!farmBatter || !activePitcher) break;
    recs.push({
      type: 'swap',
      upPlayer: farmBatter,
      downPlayer: activePitcher,
      scoreDiff: Math.round(effectiveScore(farmBatter, true) - effectiveScore(activePitcher, false)),
      reasons: ['野手人数を調整'],
    });
    usedFarmIds.add(farmBatter.id);
    usedActiveIds.add(activePitcher.id);
    projectedPlayers = [
      ...projectedPlayers.filter((player) => player.id !== activePitcher.id),
      farmBatter,
    ];
    projectedFarm = projectedFarm.filter((player) => player.id !== farmBatter.id);
    currentPitchers = projectedPlayers.filter((player) => player.isPitcher).length;
    currentBatters = projectedPlayers.filter((player) => !player.isPitcher).length;
  }

  const remainingFarm = projectedFarm
    .filter((player) => canPromote(player) && !usedFarmIds.has(player.id))
    .sort((a, b) => effectiveScore(b, true) - effectiveScore(a, true));

  if (remainingFarm.length > 0) {
    [...projectedPlayers]
      .sort((a, b) => effectiveScore(a, false) - effectiveScore(b, false))
      .forEach((activePlayer) => {
        if (usedActiveIds.has(activePlayer.id)) return;
        const best = remainingFarm.find(
          (farmPlayer) =>
            !usedFarmIds.has(farmPlayer.id) && farmPlayer.isPitcher === activePlayer.isPitcher,
        );
        if (!best) return;
        const diff = effectiveScore(best, true) - effectiveScore(activePlayer, false);
        const policyThreshold = getManagementPolicy(team).swapThreshold ?? ROSTER_SWAP_SCORE_THRESHOLD;
        if (diff < policyThreshold) return;
        recs.push({
          type: 'swap',
          upPlayer: best,
          downPlayer: activePlayer,
          scoreDiff: Math.round(diff),
          reasons: [
            `${getManagementPolicy(team).label}の評価差`,
            best.isPitcher ? '投手成績・能力' : evaluateBatterForPolicy(best, team, options).reasons.join('・'),
          ],
        });
        usedFarmIds.add(best.id);
        usedActiveIds.add(activePlayer.id);
      });
  }

  return recs;
}

export function applyRosterRecs(team, recs) {
  const playersById = new Map((team.players || []).map((player) => [player.id, player]));
  const farmById = new Map((team.farm || []).map((player) => [player.id, player]));

  for (const rec of recs) {
    if ((rec.type === 'demote' || rec.type === 'swap') && rec.downPlayer) {
      const player = playersById.get(rec.downPlayer.id);
      if (player) {
        playersById.delete(player.id);
        farmById.set(player.id, { ...player, registrationCooldownDays: 10 });
      }
    }
    if ((rec.type === 'promote' || rec.type === 'swap') && rec.upPlayer) {
      const player = farmById.get(rec.upPlayer.id);
      if (player) {
        farmById.delete(player.id);
        playersById.set(player.id, player);
      }
    }
  }

  return {
    ...team,
    players: [...playersById.values()],
    farm: [...farmById.values()],
  };
}

function ensureMinimumCatcherCount(team) {
  const activeCatchers = (team.players || []).filter(
    (player) => !player.isPitcher && player.pos === POS_CATCHER && (player.injuryDaysLeft ?? 0) === 0,
  );
  if (activeCatchers.length >= MIN_ACTIVE_CATCHERS) return team;

  let nextTeam = team;
  const catcherFarm = (team.farm || [])
    .filter(
      (player) =>
        !player.isPitcher
        && player.pos === POS_CATCHER
        && !isIkuseiPlayer(player)
        && (player.injuryDaysLeft ?? 0) === 0
        && (player.registrationCooldownDays ?? 0) === 0,
    )
    .sort((a, b) => rosterRecScore(b) - rosterRecScore(a));
  const demoteCandidates = (team.players || [])
    .filter((player) => !player.isPitcher && player.pos !== POS_CATCHER)
    .sort((a, b) => rosterRecScore(a) - rosterRecScore(b));

  let catcherIndex = 0;
  let demoteIndex = 0;
  while (
    (nextTeam.players || []).filter(
      (player) => !player.isPitcher && player.pos === POS_CATCHER && (player.injuryDaysLeft ?? 0) === 0,
    ).length < MIN_ACTIVE_CATCHERS
  ) {
    const promoteTarget = catcherFarm[catcherIndex];
    const demoteTarget = demoteCandidates[demoteIndex];
    if (!promoteTarget || !demoteTarget) break;
    nextTeam = applyRosterRecs(nextTeam, [
      {
        type: 'swap',
        upPlayer: promoteTarget,
        downPlayer: demoteTarget,
        scoreDiff: 0,
      },
    ]);
    catcherIndex += 1;
    demoteIndex += 1;
  }

  return nextTeam;
}

export function optimizeTeamForGameStart(team, options = {}) {
  let nextTeam = ensureManagementIdentity({ ...team });
  const recs = buildRosterRecs(nextTeam, options);
  if (recs.length > 0) nextTeam = applyRosterRecs(nextTeam, recs);
  nextTeam = ensureMinimumCatcherCount(nextTeam);
  nextTeam = buildAutoManagedRoster(nextTeam, options);
  return {
    ...nextTeam,
    lineup: (
      getRosterDhMode(nextTeam, options.rosterDhMode) ? nextTeam.lineupDh : nextTeam.lineupNoDh
    ).slice(),
  };
}

export function applyManagementPolicy(team, options = {}) {
  const gameDay = Number(options.gameDay || 0);
  const force = options.force === true;
  let nextTeam = ensureManagementIdentity(team);
  const runRoster = options.includeRosterChanges !== false
    && (force || shouldRunRosterManagement(nextTeam, gameDay));
  const runLineup = force || shouldRunLineupManagement(nextTeam, gameDay);
  const recs = runRoster ? buildRosterRecs(nextTeam, options) : [];
  if (recs.length > 0) nextTeam = applyRosterRecs(nextTeam, recs);
  if (runRoster) nextTeam = ensureMinimumCatcherCount(nextTeam);
  if (runLineup) nextTeam = buildAutoManagedRoster(nextTeam, options);
  if (!runRoster && !runLineup) return nextTeam;

  const policy = getManagementPolicy(nextTeam);
  const trait = getManagementTrait(nextTeam);
  const lineupNames = (nextTeam.lineup || [])
    .slice(0, 3)
    .map((id) => nextTeam.players?.find((player) => player.id === id)?.name)
    .filter(Boolean);
  return {
    ...nextTeam,
    managementMeta: {
      ...(nextTeam.managementMeta || {}),
      ...(runLineup ? { lastLineupDay: gameDay } : {}),
      ...(runRoster ? { lastRosterDay: gameDay } : {}),
      lastDecision: `${policy.label}・${trait.label}: ${lineupNames.join('、')}を上位起用`,
      lastRosterChanges: recs.length,
    },
  };
}
