import {
  FIELDING_POSITIONS,
  INJURY_AUTO_DEMOTE_DAYS,
  MAX_ROSTER,
  MIN_ACTIVE_CATCHERS,
  OPTIMAL_PITCHER_COUNT,
  REGISTRATION_COOLDOWN_DAYS,
  ROSTER_DEVREC_BONUS,
  ROSTER_DEVREC_DAYS_MAX,
  ROSTER_DEVREC_POTENTIAL_MIN,
  ROSTER_SWAP_SCORE_THRESHOLD,
} from '../constants.js';
import { saberPitcher } from './sabermetrics.js';
import { createBattedBallLeagueContext } from './cpuBatterEvaluation.js';
import {
  ensureManagementIdentity,
  evaluateBatterForPolicy,
  getManagementPolicy,
  getManagementTrait,
  shouldRunLineupManagement,
  shouldRunRosterManagement,
} from './managementPolicy.js';

const MAX_FOREIGN_ACTIVE = 4;
const TARGET_ROTATION_SIZE = 6;
const MIN_GAME_ROTATION_SIZE = 1;
const SUBTYPE_STARTER = '先発';
const POS_CATCHER = '捕手';

export const ROSTER_AUTOMATION_MODES = Object.freeze({
  MANUAL: 'manual',
  EMERGENCY: 'emergency',
  FULL: 'full',
});

export const DEFAULT_ROSTER_AUTOMATION_MODE = ROSTER_AUTOMATION_MODES.EMERGENCY;

const getRosterDhMode = (team, rosterDhMode) =>
  rosterDhMode ?? team.rosterDhMode ?? team.dhEnabled ?? false;

export const isIkuseiPlayer = (player) =>
  Boolean(player?.育成 || player?.isIkusei);

const isHealthy = (player) => (Number(player?.injuryDaysLeft) || 0) <= 0;

const isEligibleActivePlayer = (player) =>
  Boolean(player) && !isIkuseiPlayer(player) && isHealthy(player);

export function getRosterAutomationMode(team, override) {
  const mode = override ?? team?.rosterAutomationMode ?? DEFAULT_ROSTER_AUTOMATION_MODE;
  return Object.values(ROSTER_AUTOMATION_MODES).includes(mode)
    ? mode
    : DEFAULT_ROSTER_AUTOMATION_MODE;
}

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

export const proficiencyAt = (player, pos) =>
  pos === 'DH'
    ? 50
    : player?.pos === pos
      ? 100
      : Number(player?.positions?.[pos]) || 0;

function activeForeignState(players) {
  const foreign = (players || []).filter((player) => player.isForeign);
  return {
    total: foreign.length,
    pitchers: foreign.filter((player) => player.isPitcher).length,
    batters: foreign.filter((player) => !player.isPitcher).length,
  };
}

function canAddToActiveRoster(player, activePlayers) {
  if (!isEligibleActivePlayer(player)) return false;
  if ((Number(player.registrationCooldownDays) || 0) > 0) return false;
  if (!player.isForeign) return true;
  const foreign = activeForeignState(activePlayers);
  if (foreign.total >= MAX_FOREIGN_ACTIVE) return false;
  const nextTotal = foreign.total + 1;
  const nextPitchers = foreign.pitchers + (player.isPitcher ? 1 : 0);
  const nextBatters = foreign.batters + (player.isPitcher ? 0 : 1);
  return !(nextTotal === MAX_FOREIGN_ACTIVE
    && (nextPitchers === MAX_FOREIGN_ACTIVE || nextBatters === MAX_FOREIGN_ACTIVE));
}

function createLeagueContext(team, options = {}) {
  return options.leagueContext || createBattedBallLeagueContext([
    ...(team.players || []),
    ...(team.farm || []),
  ]);
}

function buildPositionAssignments(team, rosterDhMode, options = {}) {
  const required = [...FIELDING_POSITIONS, ...(rosterDhMode ? ['DH'] : [])];
  const eligibleBatters = (team.players || []).filter(
    (player) => !player.isPitcher && isEligibleActivePlayer(player),
  );
  const leagueContext = createLeagueContext(team, options);
  const sortedBatters = [...eligibleBatters].sort(
    (a, b) => batterScore(b, leagueContext, team, options)
      - batterScore(a, leagueContext, team, options),
  );
  const eligibleByPosition = Object.fromEntries(
    required.map((pos) => [
      pos,
      sortedBatters.filter((player) => proficiencyAt(player, pos) > 0),
    ]),
  );
  const positionOrder = [...required].sort(
    (a, b) => eligibleByPosition[a].length - eligibleByPosition[b].length,
  );
  const assignment = new Map();
  const usedPlayers = new Set();

  const assignPosition = (index) => {
    if (index >= positionOrder.length) return true;
    const pos = positionOrder[index];
    for (const player of eligibleByPosition[pos]) {
      if (usedPlayers.has(player.id)) continue;
      assignment.set(pos, player);
      usedPlayers.add(player.id);
      if (assignPosition(index + 1)) return true;
      assignment.delete(pos);
      usedPlayers.delete(player.id);
    }
    return false;
  };
  const completed = assignPosition(0);
  if (!completed && options.allowOutOfPositionFallback === true) {
    assignment.clear();
    usedPlayers.clear();
    for (const pos of positionOrder) {
      const fallback = sortedBatters.find((player) => !usedPlayers.has(player.id));
      if (!fallback) break;
      assignment.set(pos, fallback);
      usedPlayers.add(fallback.id);
    }
  }
  return { assignment, required, leagueContext };
}

function orderAssignedBatters(assignment, team, leagueContext, options = {}) {
  const entries = [...assignment.entries()].map(([pos, player]) => ({
    id: player.id,
    pos,
    player,
  }));
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
  if (remaining.length) battingOrder.push(
    take((a, b) => evaluation(b).total - evaluation(a).total),
  );
  if (remaining.length) battingOrder.push(take((a, b) => power(b) - power(a)));
  if (remaining.length) battingOrder.push(take((a, b) => power(b) - power(a)));
  remaining.sort((a, b) => evaluation(b).total - evaluation(a).total);
  return [...battingOrder, ...remaining]
    .filter(Boolean)
    .map(({ id, pos }) => ({ id, pos }));
}

export function buildAutoLineupEntries(team, options = {}) {
  const rosterDhMode = getRosterDhMode(team, options.rosterDhMode);
  const { assignment, leagueContext } = buildPositionAssignments(
    team,
    rosterDhMode,
    options,
  );
  return orderAssignedBatters(assignment, team, leagueContext, options);
}

export function buildAutoPitchingStaff(team) {
  const eligiblePitchers = (team.players || []).filter(
    (player) => player.isPitcher && isEligibleActivePlayer(player),
  );
  const starters = eligiblePitchers
    .filter((player) => player.subtype === SUBTYPE_STARTER)
    .sort((a, b) => starterScore(b) - starterScore(a));
  const relievers = eligiblePitchers
    .filter((player) => player.subtype !== SUBTYPE_STARTER)
    .sort((a, b) => relieverScore(b) - relieverScore(a));
  const rotation = [
    ...starters.slice(0, TARGET_ROTATION_SIZE),
    ...relievers.slice(0, Math.max(0, TARGET_ROTATION_SIZE - starters.length)),
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

function entriesToFieldingMap(entries) {
  return Object.fromEntries(entries.map((entry) => [entry.id, entry.pos]));
}

export function buildAutoManagedRoster(team, options = {}) {
  const rosterDhMode = getRosterDhMode(team, options.rosterDhMode);
  const lineupNoDhEntries = buildAutoLineupEntries(team, {
    ...options,
    rosterDhMode: false,
  });
  const lineupDhEntries = buildAutoLineupEntries(team, {
    ...options,
    rosterDhMode: true,
  });
  const lineupNoDh = lineupNoDhEntries.map((entry) => entry.id).slice(0, 8);
  const lineupDh = lineupDhEntries.map((entry) => entry.id).slice(0, 9);
  const { rotation, pitchingPattern } = buildAutoPitchingStaff(team);
  const fallbackAssignments = Object.fromEntries(
    [...lineupNoDhEntries, ...lineupDhEntries]
      .filter((entry) => {
        const player = (team.players || []).find((candidate) => candidate.id === entry.id);
        return proficiencyAt(player, entry.pos) <= 0;
      })
      .map((entry) => [entry.id, entry.pos]),
  );

  return {
    ...team,
    rosterDhMode,
    rosterAutomationMode: getRosterAutomationMode(team),
    lineupEntries: rosterDhMode ? lineupDhEntries : lineupNoDhEntries,
    lineupNoDh,
    lineupDh,
    fieldingNoDh: entriesToFieldingMap(lineupNoDhEntries),
    fieldingDh: entriesToFieldingMap(lineupDhEntries),
    rosterFallbackAssignments: fallbackAssignments,
    lineup: (rosterDhMode ? lineupDh : lineupNoDh).slice(),
    rotation,
    pitchingPattern,
  };
}

function effectiveRosterScore(player, team, options, isFarm) {
  const base = rosterRecScore(player, team, options);
  const developmentBonus = isFarm
    && (player.potential ?? 0) >= ROSTER_DEVREC_POTENTIAL_MIN
    && (player.daysOnActiveRoster ?? 0) < ROSTER_DEVREC_DAYS_MAX
    ? ROSTER_DEVREC_BONUS
    : 0;
  return base + developmentBonus;
}

export function buildRosterRecs(team, options = {}) {
  const recs = [];
  const targetBatters = MAX_ROSTER - OPTIMAL_PITCHER_COUNT;
  let projectedPlayers = [...(team.players || [])];
  let projectedFarm = [...(team.farm || [])];
  const usedFarmIds = new Set();
  const usedActiveIds = new Set();
  const score = (player, isFarm) =>
    effectiveRosterScore(player, team, options, isFarm);
  const canPromote = (player) =>
    !usedFarmIds.has(player.id) && canAddToActiveRoster(player, projectedPlayers);
  const protectedLineupIds = new Set(
    buildAutoLineupEntries(
      { ...team, players: projectedPlayers },
      { ...options, rosterDhMode: true },
    ).map((entry) => entry.id),
  );
  const canDemoteWithoutBreakingCoverage = (player) => {
    if (player.isPitcher) return true;
    if (!isHealthy(player)) return true;
    if (protectedLineupIds.has(player.id)) return false;
    if (
      player.pos === POS_CATCHER
      && projectedPlayers.filter(
        (candidate) =>
          !candidate.isPitcher
          && candidate.pos === POS_CATCHER
          && isEligibleActivePlayer(candidate),
      ).length <= MIN_ACTIVE_CATCHERS
    ) {
      return false;
    }
    return projectedPlayers.some(
      (candidate) =>
        candidate.id !== player.id
        && !candidate.isPitcher
        && candidate.pos === player.pos
        && isEligibleActivePlayer(candidate),
    );
  };

  const addDemotion = (player, reasons) => {
    if (!player || usedActiveIds.has(player.id)) return false;
    recs.push({
      type: 'demote',
      downPlayer: player,
      upPlayer: null,
      scoreDiff: 0,
      reasons,
    });
    usedActiveIds.add(player.id);
    projectedPlayers = projectedPlayers.filter((candidate) => candidate.id !== player.id);
    projectedFarm.push({ ...player, registrationCooldownDays: REGISTRATION_COOLDOWN_DAYS });
    return true;
  };

  while (true) {
    const foreign = activeForeignState(projectedPlayers);
    const hasTooMany = foreign.total > MAX_FOREIGN_ACTIVE;
    const hasInvalidMix = foreign.total === MAX_FOREIGN_ACTIVE
      && (foreign.pitchers === MAX_FOREIGN_ACTIVE || foreign.batters === MAX_FOREIGN_ACTIVE);
    if (!hasTooMany && !hasInvalidMix) break;
    const invalidGroup = hasInvalidMix
      ? projectedPlayers.filter(
        (player) => player.isForeign && player.isPitcher === (foreign.pitchers === MAX_FOREIGN_ACTIVE),
      )
      : projectedPlayers.filter((player) => player.isForeign);
    const candidate = [
      ...invalidGroup.filter(canDemoteWithoutBreakingCoverage),
      ...invalidGroup,
    ]
      .filter((player, index, all) => all.findIndex((candidate) => candidate.id === player.id) === index)
      .sort((a, b) => score(a, false) - score(b, false))[0];
    if (!addDemotion(candidate, ['外国人枠を適正化'])) break;
  }

  while (projectedPlayers.length > MAX_ROSTER) {
    const pitchers = projectedPlayers.filter((player) => player.isPitcher);
    const batters = projectedPlayers.filter((player) => !player.isPitcher);
    const pool = pitchers.length > OPTIMAL_PITCHER_COUNT
      ? pitchers
      : batters.length > targetBatters
        ? batters
        : projectedPlayers;
    const candidate = [...pool].sort((a, b) => score(a, false) - score(b, false))[0];
    if (!addDemotion(candidate, ['一軍枠超過', '方針評価下位'])) break;
  }

  const addPromotion = (player, reasons) => {
    if (!player || projectedPlayers.length >= MAX_ROSTER || !canPromote(player)) return false;
    recs.push({
      type: 'promote',
      upPlayer: player,
      downPlayer: null,
      scoreDiff: Math.round(score(player, true)),
      reasons,
    });
    usedFarmIds.add(player.id);
    projectedFarm = projectedFarm.filter((candidate) => candidate.id !== player.id);
    projectedPlayers.push(player);
    return true;
  };

  while (
    projectedPlayers.length < MAX_ROSTER
    && projectedPlayers.filter((player) => player.isPitcher).length < OPTIMAL_PITCHER_COUNT
  ) {
    const candidate = projectedFarm
      .filter((player) => player.isPitcher && canPromote(player))
      .sort((a, b) => score(b, true) - score(a, true))[0];
    if (!addPromotion(candidate, ['投手人数を充足', '方針評価上位'])) break;
  }

  while (
    projectedPlayers.length < MAX_ROSTER
    && projectedPlayers.filter((player) => !player.isPitcher).length < targetBatters
  ) {
    const candidate = projectedFarm
      .filter((player) => !player.isPitcher && canPromote(player))
      .sort((a, b) => score(b, true) - score(a, true))[0];
    if (!addPromotion(candidate, ['野手人数を充足', '方針評価上位'])) break;
  }

  while (projectedPlayers.length < MAX_ROSTER) {
    const candidate = projectedFarm
      .filter(canPromote)
      .sort((a, b) => score(b, true) - score(a, true))[0];
    if (!addPromotion(candidate, ['一軍枠を充足', '方針評価上位'])) break;
  }

  const addSwap = (upPlayer, downPlayer, reasons) => {
    if (!upPlayer || !downPlayer || !canPromote(upPlayer)) return false;
    recs.push({
      type: 'swap',
      upPlayer,
      downPlayer,
      scoreDiff: Math.round(score(upPlayer, true) - score(downPlayer, false)),
      reasons,
    });
    usedFarmIds.add(upPlayer.id);
    usedActiveIds.add(downPlayer.id);
    projectedPlayers = [
      ...projectedPlayers.filter((player) => player.id !== downPlayer.id),
      upPlayer,
    ];
    projectedFarm = [
      ...projectedFarm.filter((player) => player.id !== upPlayer.id),
      { ...downPlayer, registrationCooldownDays: REGISTRATION_COOLDOWN_DAYS },
    ];
    return true;
  };

  while (
    projectedPlayers.filter((player) => !player.isPitcher).length < targetBatters
    && projectedPlayers.filter((player) => player.isPitcher).length > OPTIMAL_PITCHER_COUNT
  ) {
    const upPlayer = projectedFarm
      .filter((player) => !player.isPitcher && canPromote(player))
      .sort((a, b) => score(b, true) - score(a, true))[0];
    const downPlayer = projectedPlayers
      .filter((player) => player.isPitcher && !usedActiveIds.has(player.id))
      .sort((a, b) => score(a, false) - score(b, false))[0];
    if (!addSwap(upPlayer, downPlayer, ['野手人数を充足'])) break;
  }

  while (
    projectedPlayers.filter((player) => player.isPitcher).length < OPTIMAL_PITCHER_COUNT
    && projectedPlayers.filter((player) => !player.isPitcher).length > targetBatters
  ) {
    const upPlayer = projectedFarm
      .filter((player) => player.isPitcher && canPromote(player))
      .sort((a, b) => score(b, true) - score(a, true))[0];
    const downPlayer = projectedPlayers
      .filter(
        (player) =>
          !player.isPitcher
          && !usedActiveIds.has(player.id)
          && canDemoteWithoutBreakingCoverage(player),
      )
      .sort((a, b) => score(a, false) - score(b, false))[0];
    if (!addSwap(upPlayer, downPlayer, ['投手人数を充足'])) break;
  }

  const remainingFarm = () => projectedFarm
    .filter(canPromote)
    .sort((a, b) => score(b, true) - score(a, true));
  [...projectedPlayers]
    .sort((a, b) => score(a, false) - score(b, false))
    .forEach((activePlayer) => {
      if (usedActiveIds.has(activePlayer.id)) return;
      if (!canDemoteWithoutBreakingCoverage(activePlayer)) return;
      const best = remainingFarm().find(
        (farmPlayer) => farmPlayer.isPitcher === activePlayer.isPitcher,
      );
      if (!best) return;
      const diff = score(best, true) - score(activePlayer, false);
      const threshold = getManagementPolicy(team).swapThreshold
        ?? ROSTER_SWAP_SCORE_THRESHOLD;
      const changeCost = 8 + usedActiveIds.size * 2;
      if (diff < threshold + changeCost) return;
      recs.push({
        type: 'swap',
        upPlayer: best,
        downPlayer: activePlayer,
        scoreDiff: Math.round(diff),
        reasons: [
          `${getManagementPolicy(team).label}の評価差`,
          best.isPitcher
            ? '投手成績・能力'
            : evaluateBatterForPolicy(best, team, options).reasons.join('・'),
        ],
      });
      usedFarmIds.add(best.id);
      usedActiveIds.add(activePlayer.id);
      projectedPlayers = [
        ...projectedPlayers.filter((player) => player.id !== activePlayer.id),
        best,
      ];
      projectedFarm = [
        ...projectedFarm.filter((player) => player.id !== best.id),
        { ...activePlayer, registrationCooldownDays: REGISTRATION_COOLDOWN_DAYS },
      ];
    });

  return recs;
}

function cleanAssignments(assignments, activeIds) {
  return Object.fromEntries(
    Object.entries(assignments || {}).filter(([playerId]) => activeIds.has(playerId)),
  );
}

function cleanPitchingPattern(pattern, activeIds) {
  const safeId = (id) => (activeIds.has(id) ? id : null);
  return {
    closerId: safeId(pattern?.closerId),
    setupId: safeId(pattern?.setupId),
    seventhId: safeId(pattern?.seventhId),
    middleOrder: (pattern?.middleOrder || []).filter((id) => activeIds.has(id)),
  };
}

export function applyRosterRecs(team, recs) {
  const playersById = new Map((team.players || []).map((player) => [player.id, player]));
  const farmById = new Map((team.farm || []).map((player) => [player.id, player]));

  for (const rec of recs || []) {
    if ((rec.type === 'demote' || rec.type === 'swap') && rec.downPlayer) {
      const player = playersById.get(rec.downPlayer.id);
      if (player) {
        playersById.delete(player.id);
        farmById.set(player.id, {
          ...player,
          registrationCooldownDays: REGISTRATION_COOLDOWN_DAYS,
        });
      }
    }
    if ((rec.type === 'promote' || rec.type === 'swap') && rec.upPlayer) {
      const player = farmById.get(rec.upPlayer.id);
      if (player && canAddToActiveRoster(player, [...playersById.values()])) {
        farmById.delete(player.id);
        playersById.set(player.id, player);
      }
    }
  }

  const players = [...playersById.values()];
  const activeIds = new Set(players.map((player) => player.id));
  const nonPitcherIds = new Set(
    players.filter((player) => !player.isPitcher).map((player) => player.id),
  );
  return {
    ...team,
    players,
    farm: [...farmById.values()],
    lineup: (team.lineup || []).filter((id) => nonPitcherIds.has(id)),
    lineupNoDh: (team.lineupNoDh || []).filter((id) => nonPitcherIds.has(id)),
    lineupDh: (team.lineupDh || []).filter((id) => nonPitcherIds.has(id)),
    fieldingNoDh: cleanAssignments(team.fieldingNoDh, activeIds),
    fieldingDh: cleanAssignments(team.fieldingDh, activeIds),
    rotation: (team.rotation || []).filter((id) => activeIds.has(id)),
    pitchingPattern: cleanPitchingPattern(team.pitchingPattern, activeIds),
  };
}

function ensureMinimumCatcherCount(team, options = {}) {
  let nextTeam = team;
  while (
    (nextTeam.players || []).filter(
      (player) =>
        !player.isPitcher
        && player.pos === POS_CATCHER
        && isEligibleActivePlayer(player),
    ).length < MIN_ACTIVE_CATCHERS
  ) {
    const catcher = (nextTeam.farm || [])
      .filter(
        (player) =>
          !player.isPitcher
          && player.pos === POS_CATCHER
          && canAddToActiveRoster(player, nextTeam.players),
      )
      .sort(
        (a, b) => rosterRecScore(b, nextTeam, options)
          - rosterRecScore(a, nextTeam, options),
      )[0];
    if (!catcher) break;

    let rec;
    if ((nextTeam.players || []).length < MAX_ROSTER) {
      rec = {
        type: 'promote',
        upPlayer: catcher,
        downPlayer: null,
        scoreDiff: 0,
        reasons: ['捕手2人制を充足'],
      };
    } else {
      const downPlayer = (nextTeam.players || [])
        .filter((player) => !player.isPitcher && player.pos !== POS_CATCHER)
        .sort(
          (a, b) => rosterRecScore(a, nextTeam, options)
            - rosterRecScore(b, nextTeam, options),
        )[0];
      if (!downPlayer) break;
      rec = {
        type: 'swap',
        upPlayer: catcher,
        downPlayer,
        scoreDiff: 0,
        reasons: ['捕手2人制を充足'],
      };
    }
    nextTeam = applyRosterRecs(nextTeam, [rec]);
  }
  return nextTeam;
}

function ensureRequiredFieldingCoverage(team, options = {}) {
  let nextTeam = team;
  const changes = [];
  const eligibleFarm = (nextTeam.farm || []).filter(
    (player) =>
      !player.isPitcher
      && isEligibleActivePlayer(player)
      && (
        (Number(player.registrationCooldownDays) || 0) === 0
        || (
          options.allowSamePlanRecall === true
          && !options.originalCooldownIds?.has(player.id)
        )
      )
      && canAddToActiveRoster(player, nextTeam.players),
  );
  const candidateTeam = {
    ...nextTeam,
    players: [...(nextTeam.players || []), ...eligibleFarm],
  };
  const requiredEntries = buildAutoLineupEntries(candidateTeam, {
    ...options,
    rosterDhMode: true,
  });
  const requiredIds = new Set(requiredEntries.map((entry) => entry.id));
  const activeIds = new Set((nextTeam.players || []).map((player) => player.id));

  for (const entry of requiredEntries) {
    if (activeIds.has(entry.id)) continue;
    let promoteTarget = (nextTeam.farm || []).find((player) => player.id === entry.id);
    if (!promoteTarget) continue;
    if (
      (Number(promoteTarget.registrationCooldownDays) || 0) > 0
      && options.allowSamePlanRecall === true
      && !options.originalCooldownIds?.has(promoteTarget.id)
    ) {
      promoteTarget = { ...promoteTarget, registrationCooldownDays: 0 };
      nextTeam = {
        ...nextTeam,
        farm: (nextTeam.farm || []).map((player) =>
          player.id === promoteTarget.id ? promoteTarget : player),
      };
    }
    let rec;
    if ((nextTeam.players || []).length < MAX_ROSTER) {
      rec = {
        type: 'promote',
        upPlayer: promoteTarget,
        downPlayer: null,
        scoreDiff: 0,
        reasons: [`${entry.pos}の守備要員を確保`],
      };
    } else {
      const demoteTarget = (nextTeam.players || [])
        .filter(
          (player) =>
            !player.isPitcher
            && !requiredIds.has(player.id)
            && (
              player.pos !== POS_CATCHER
              || (nextTeam.players || []).filter(
                (candidate) =>
                  !candidate.isPitcher
                  && candidate.pos === POS_CATCHER
                  && isEligibleActivePlayer(candidate),
              ).length > MIN_ACTIVE_CATCHERS
            ),
        )
        .sort(
          (a, b) =>
            rosterRecScore(a, nextTeam, options)
            - rosterRecScore(b, nextTeam, options),
        )[0];
      if (!demoteTarget) continue;
      rec = {
        type: 'swap',
        upPlayer: promoteTarget,
        downPlayer: demoteTarget,
        scoreDiff: 0,
        reasons: [`${entry.pos}の守備要員を確保`],
      };
    }
    nextTeam = applyRosterRecs(nextTeam, [rec]);
    activeIds.delete(rec.downPlayer?.id);
    activeIds.add(promoteTarget.id);
    changes.push(rec);
  }
  return { team: nextTeam, changes };
}

function getFieldingMap(team, useDh) {
  const stored = useDh ? team.fieldingDh : team.fieldingNoDh;
  if (stored && Object.keys(stored).length > 0) return { ...stored };
  const source = useDh
    ? (team.lineupDh || team.lineup || [])
    : (team.lineupNoDh || team.lineup || []);
  return Object.fromEntries(
    source.map((id) => {
      const player = (team.players || []).find((candidate) => candidate.id === id);
      return [id, player?.pos];
    }).filter(([, pos]) => Boolean(pos)),
  );
}

function repairLineupPreservingOrder(team, useDh, options = {}) {
  const required = [...FIELDING_POSITIONS, ...(useDh ? ['DH'] : [])];
  const targetSize = required.length;
  const source = useDh
    ? (team.lineupDh || team.lineup || [])
    : (team.lineupNoDh || team.lineup || []);
  const currentAssignments = getFieldingMap(team, useDh);
  const eligible = (team.players || []).filter(
    (player) => !player.isPitcher && isEligibleActivePlayer(player),
  );
  const eligibleById = new Map(eligible.map((player) => [player.id, player]));
  const usedPlayers = new Set();
  const usedPositions = new Set();
  const entries = [];
  const assignPlayer = (player, preferredPos) => {
    if (!player || usedPlayers.has(player.id)) return false;
    const choices = [
      preferredPos,
      player.pos,
      ...required
        .filter((pos) => proficiencyAt(player, pos) > 0)
        .sort((a, b) => proficiencyAt(player, b) - proficiencyAt(player, a)),
    ].filter(Boolean);
    const pos = choices.find(
      (candidate, index) =>
        required.includes(candidate)
        && !usedPositions.has(candidate)
        && proficiencyAt(player, candidate) > 0
        && choices.indexOf(candidate) === index,
    );
    if (!pos) return false;
    usedPlayers.add(player.id);
    usedPositions.add(pos);
    entries.push({ id: player.id, pos });
    return true;
  };

  for (const id of source) {
    assignPlayer(eligibleById.get(id), currentAssignments[id]);
  }

  const leagueContext = createLeagueContext(team, options);
  for (const pos of required.filter((candidate) => !usedPositions.has(candidate))) {
    const candidate = eligible
      .filter((player) => !usedPlayers.has(player.id) && proficiencyAt(player, pos) > 0)
      .sort(
        (a, b) =>
          (proficiencyAt(b, pos) - proficiencyAt(a, pos)) * 2
          + batterScore(b, leagueContext, team, options)
          - batterScore(a, leagueContext, team, options),
      )[0];
    assignPlayer(candidate, pos);
  }

  return {
    lineup: entries.slice(0, targetSize).map((entry) => entry.id),
    fielding: entriesToFieldingMap(entries.slice(0, targetSize)),
  };
}

function repairPitchingPreservingRoles(team) {
  const pitchers = (team.players || []).filter(
    (player) => player.isPitcher && isEligibleActivePlayer(player),
  );
  const pitchersById = new Map(pitchers.map((player) => [player.id, player]));
  const rotation = [];
  const used = new Set();
  for (const id of team.rotation || []) {
    if (!pitchersById.has(id) || used.has(id)) continue;
    rotation.push(id);
    used.add(id);
  }
  const additions = pitchers
    .filter((player) => !used.has(player.id))
    .sort((a, b) => {
      const subtypeDiff =
        Number(b.subtype === SUBTYPE_STARTER) - Number(a.subtype === SUBTYPE_STARTER);
      return subtypeDiff || starterScore(b) - starterScore(a);
    });
  for (const player of additions) {
    if (rotation.length >= Math.min(TARGET_ROTATION_SIZE, pitchers.length)) break;
    rotation.push(player.id);
    used.add(player.id);
  }

  const relievers = pitchers
    .filter((player) => !used.has(player.id))
    .sort((a, b) => relieverScore(b) - relieverScore(a));
  const existing = cleanPitchingPattern(team.pitchingPattern, new Set(pitchersById.keys()));
  const roleUsed = new Set(
    [existing.closerId, existing.setupId, existing.seventhId].filter(Boolean),
  );
  const takeReliever = () => relievers.find((player) => !roleUsed.has(player.id))?.id ?? null;
  const closerId = existing.closerId || takeReliever();
  if (closerId) roleUsed.add(closerId);
  const setupId = existing.setupId || takeReliever();
  if (setupId) roleUsed.add(setupId);
  const seventhId = existing.seventhId || takeReliever();
  if (seventhId) roleUsed.add(seventhId);
  const middleOrder = [
    ...(existing.middleOrder || []).filter((id) => !roleUsed.has(id)),
    ...relievers.map((player) => player.id).filter((id) => !roleUsed.has(id)),
  ].filter((id, index, all) => all.indexOf(id) === index);

  return {
    rotation,
    pitchingPattern: { closerId, setupId, seventhId, middleOrder },
  };
}

function replacementFitScore(candidate, injuredPlayer, team, options = {}) {
  if (candidate.isPitcher !== injuredPlayer.isPitcher) return -Infinity;
  const base = rosterRecScore(candidate, team, options);
  if (candidate.isPitcher) {
    const sameRole = candidate.subtype === injuredPlayer.subtype ? 260 : 0;
    const roleScore = injuredPlayer.subtype === SUBTYPE_STARTER
      ? starterScore(candidate)
      : relieverScore(candidate);
    return base + sameRole + roleScore * 0.2;
  }
  const samePosition = candidate.pos === injuredPlayer.pos ? 300 : 0;
  const proficiency = proficiencyAt(candidate, injuredPlayer.pos);
  const catcherPenalty = injuredPlayer.pos === POS_CATCHER && proficiency <= 0 ? 1000 : 0;
  return base + samePosition + proficiency * 1.5 - catcherPenalty;
}

function replaceIdPreservingSlot(ids, fromId, toId) {
  return (ids || [])
    .map((id) => (id === fromId ? toId : id))
    .filter(Boolean)
    .filter((id, index, all) => all.indexOf(id) === index);
}

function replaceFieldingAssignment(assignments, fromId, toId, fallbackPos) {
  const next = { ...(assignments || {}) };
  const pos = next[fromId] || fallbackPos;
  delete next[fromId];
  if (toId && pos) next[toId] = pos;
  return next;
}

export function applyEmergencyRosterMaintenance(team, options = {}) {
  const mode = getRosterAutomationMode(team, options.automationMode);
  if (mode === ROSTER_AUTOMATION_MODES.MANUAL) {
    return {
      ...team,
      rosterAutomationMode: mode,
      rosterMaintenance: {
        changed: false,
        changes: [],
        reason: 'manual-mode',
      },
    };
  }

  const assignedIds = new Set([
    ...(team.lineup || []),
    ...(team.lineupNoDh || []),
    ...(team.lineupDh || []),
    ...(team.rotation || []),
  ]);
  const injuredToDemote = (team.players || []).filter((player) => {
    const days = Number(player.injuryDaysLeft) || 0;
    return days > INJURY_AUTO_DEMOTE_DAYS
      || (
        mode === ROSTER_AUTOMATION_MODES.FULL
        && days > 0
        && assignedIds.has(player.id)
      );
  });
  const demotionIds = new Set(injuredToDemote.map((player) => player.id));
  const shortInjuriesInAssignment = (team.players || []).filter(
    (player) =>
      assignedIds.has(player.id)
      && !demotionIds.has(player.id)
      && (Number(player.injuryDaysLeft) || 0) > 0
      && (Number(player.injuryDaysLeft) || 0) <= INJURY_AUTO_DEMOTE_DAYS,
  );
  if (injuredToDemote.length === 0 && shortInjuriesInAssignment.length === 0) {
    return {
      ...team,
      rosterAutomationMode: mode,
      rosterMaintenance: {
        changed: false,
        changes: [],
        reason: 'no-long-injury',
      },
    };
  }

  let nextTeam = { ...team, rosterAutomationMode: mode };
  const changes = shortInjuriesInAssignment.map((player) => ({
    type: 'temporary-lineup-replacement',
    downPlayer: player,
    upPlayer: null,
    reasons: [`${player.injuryDaysLeft}日離脱`, '一軍登録を維持して控え選手を起用'],
  }));
  for (const injuredPlayer of injuredToDemote) {
    const demoted = {
      ...injuredPlayer,
      registrationCooldownDays: REGISTRATION_COOLDOWN_DAYS,
    };
    const remainingPlayers = (nextTeam.players || [])
      .filter((player) => player.id !== injuredPlayer.id);
    const candidates = (nextTeam.farm || [])
      .filter((player) => canAddToActiveRoster(player, remainingPlayers))
      .sort(
        (a, b) =>
          replacementFitScore(b, injuredPlayer, nextTeam, options)
          - replacementFitScore(a, injuredPlayer, nextTeam, options),
      );
    const promoted = candidates.find(
      (candidate) => candidate.isPitcher === injuredPlayer.isPitcher,
    ) || null;

    nextTeam = {
      ...nextTeam,
      players: promoted ? [...remainingPlayers, promoted] : remainingPlayers,
      farm: [
        ...(nextTeam.farm || []).filter((player) => player.id !== promoted?.id),
        demoted,
      ],
      lineup: replaceIdPreservingSlot(
        nextTeam.lineup,
        injuredPlayer.id,
        promoted && !promoted.isPitcher ? promoted.id : null,
      ),
      lineupNoDh: replaceIdPreservingSlot(
        nextTeam.lineupNoDh,
        injuredPlayer.id,
        promoted && !promoted.isPitcher ? promoted.id : null,
      ),
      lineupDh: replaceIdPreservingSlot(
        nextTeam.lineupDh,
        injuredPlayer.id,
        promoted && !promoted.isPitcher ? promoted.id : null,
      ),
      fieldingNoDh: replaceFieldingAssignment(
        nextTeam.fieldingNoDh,
        injuredPlayer.id,
        promoted && !promoted.isPitcher ? promoted.id : null,
        injuredPlayer.pos,
      ),
      fieldingDh: replaceFieldingAssignment(
        nextTeam.fieldingDh,
        injuredPlayer.id,
        promoted && !promoted.isPitcher ? promoted.id : null,
        injuredPlayer.pos,
      ),
      rotation: replaceIdPreservingSlot(
        nextTeam.rotation,
        injuredPlayer.id,
        promoted?.isPitcher ? promoted.id : null,
      ),
    };
    changes.push({
      type: 'injury-replacement',
      downPlayer: injuredPlayer,
      upPlayer: promoted,
      reasons: [
        `${injuredPlayer.injuryDaysLeft}日離脱`,
        promoted
          ? `${promoted.isPitcher ? promoted.subtype : promoted.pos}を優先`
          : '昇格可能な同区分選手なし',
      ],
    });
  }

  const noDh = repairLineupPreservingOrder(nextTeam, false, options);
  const dh = repairLineupPreservingOrder(nextTeam, true, options);
  const pitching = repairPitchingPreservingRoles(nextTeam);
  nextTeam = {
    ...nextTeam,
    lineupNoDh: noDh.lineup,
    lineupDh: dh.lineup,
    fieldingNoDh: noDh.fielding,
    fieldingDh: dh.fielding,
    lineup: (
      getRosterDhMode(nextTeam, options.rosterDhMode)
        ? dh.lineup
        : noDh.lineup
    ).slice(),
    rotation: pitching.rotation,
    pitchingPattern: pitching.pitchingPattern,
  };
  const validation = validateTeamRoster(nextTeam);
  return {
    ...nextTeam,
    rosterMaintenance: {
      changed: true,
      changes,
      reason: injuredToDemote.length > 0 ? 'long-injury' : 'short-injury',
      validation,
    },
  };
}

export function validateLineup(team, useDh) {
  const required = [...FIELDING_POSITIONS, ...(useDh ? ['DH'] : [])];
  const lineup = useDh
    ? (team.lineupDh || [])
    : (team.lineupNoDh || []);
  const fielding = getFieldingMap(team, useDh);
  const playersById = new Map((team.players || []).map((player) => [player.id, player]));
  const errors = [];
  const warnings = [];
  const label = useDh ? 'DHあり' : 'DHなし';
  const uniqueIds = new Set(lineup);

  if (lineup.length !== required.length || uniqueIds.size !== required.length) {
    errors.push(`${label}の先発は重複なしで${required.length}人必要です`);
  }
  const assignedPositions = [];
  for (const id of uniqueIds) {
    const player = playersById.get(id);
    if (!player || player.isPitcher || !isEligibleActivePlayer(player)) {
      errors.push(`${label}の先発に出場不可選手が含まれています`);
      continue;
    }
    const pos = fielding[id] || player.pos;
    if (!required.includes(pos)) {
      errors.push(`${player.name || id}を${pos || '未設定'}で起用できません`);
      continue;
    }
    if (proficiencyAt(player, pos) <= 0) {
      if (team.rosterFallbackAssignments?.[id] === pos) {
        warnings.push(`${player.name || id}を${pos}へ緊急配置しています`);
      } else {
        errors.push(`${player.name || id}を${pos}で起用できません`);
        continue;
      }
    }
    assignedPositions.push(pos);
  }
  for (const pos of required) {
    const count = assignedPositions.filter((assigned) => assigned === pos).length;
    if (count !== 1) errors.push(`${label}の${pos}は1人必要です`);
  }
  if (lineup.filter((id) => playersById.get(id)?.isForeign).length > MAX_FOREIGN_ACTIVE) {
    errors.push(`${label}の外国人先発は${MAX_FOREIGN_ACTIVE}人までです`);
  }
  return { errors, warnings };
}

export function validateTeamRoster(team) {
  const errors = [];
  const warnings = [];
  const active = team.players || [];
  if (active.length > MAX_ROSTER) {
    errors.push(`一軍登録は${MAX_ROSTER}人までです`);
  }
  const foreign = activeForeignState(active);
  if (foreign.total > MAX_FOREIGN_ACTIVE) {
    errors.push(`外国人登録は${MAX_FOREIGN_ACTIVE}人までです`);
  }
  if (
    foreign.total === MAX_FOREIGN_ACTIVE
    && (foreign.pitchers === MAX_FOREIGN_ACTIVE || foreign.batters === MAX_FOREIGN_ACTIVE)
  ) {
    errors.push('外国人4人を投手のみ・野手のみでは登録できません');
  }
  const catchers = active.filter(
    (player) =>
      !player.isPitcher
      && player.pos === POS_CATCHER
      && isEligibleActivePlayer(player),
  );
  if (catchers.length < MIN_ACTIVE_CATCHERS) {
    warnings.push(`健康な捕手が${MIN_ACTIVE_CATCHERS}人未満です`);
  }
  const noDh = validateLineup(team, false);
  const dh = validateLineup(team, true);
  errors.push(...noDh.errors, ...dh.errors);
  warnings.push(...noDh.warnings, ...dh.warnings);

  const activePitcherIds = new Set(
    active
      .filter((player) => player.isPitcher && isEligibleActivePlayer(player))
      .map((player) => player.id),
  );
  const rotation = (team.rotation || []).filter((id) => activePitcherIds.has(id));
  if (rotation.length < MIN_GAME_ROTATION_SIZE) {
    errors.push('先発可能な投手がいません');
  } else if (rotation.length < TARGET_ROTATION_SIZE) {
    warnings.push(`先発ローテが${TARGET_ROTATION_SIZE}人未満です`);
  }

  return {
    valid: errors.length === 0,
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
  };
}

export class RosterValidationError extends Error {
  constructor(validation) {
    super(validation?.errors?.[0] || '編成が成立していません');
    this.name = 'RosterValidationError';
    this.validation = validation;
  }
}

export function prepareTeamForGame(team, useDh, options = {}) {
  const selected = validateLineup(team, useDh);
  const activePitchers = (team.players || []).filter(
    (player) => player.isPitcher && isEligibleActivePlayer(player),
  );
  const activePitcherIds = new Set(activePitchers.map((player) => player.id));
  const rotation = (team.rotation || []).filter((id) => activePitcherIds.has(id));
  const errors = [...selected.errors];
  if (rotation.length < MIN_GAME_ROTATION_SIZE) errors.push('先発可能な投手がいません');
  const validation = {
    valid: errors.length === 0,
    errors: [...new Set(errors)],
    warnings: [...selected.warnings],
  };
  if (!validation.valid && options.strict !== false) {
    throw new RosterValidationError(validation);
  }
  const battingLineup = useDh
    ? (team.lineupDh || []).slice()
    : (team.lineupNoDh || []).slice();
  const starterId = rotation.length > 0
    ? rotation[(Number(team.rotIdx) || 0) % rotation.length]
    : activePitchers[0]?.id;
  return {
    ...team,
    lineup: useDh
      ? battingLineup
      : [...battingLineup, starterId].filter(Boolean),
    rotation,
    activeFielding: getFieldingMap(team, useDh),
    rosterGameValidation: validation,
  };
}

export function buildFullRosterPlan(team, options = {}) {
  const originalCooldownIds = new Set(
    (team.farm || [])
      .filter((player) => (Number(player.registrationCooldownDays) || 0) > 0)
      .map((player) => player.id),
  );
  let nextTeam = ensureManagementIdentity({
    ...team,
    rosterAutomationMode: getRosterAutomationMode(
      team,
      options.automationMode ?? ROSTER_AUTOMATION_MODES.FULL,
    ),
  });
  nextTeam = applyEmergencyRosterMaintenance(nextTeam, {
    ...options,
    automationMode: ROSTER_AUTOMATION_MODES.FULL,
  });
  nextTeam = ensureMinimumCatcherCount(nextTeam, options);
  const changes = [];
  const initialCoverage = ensureRequiredFieldingCoverage(nextTeam, options);
  nextTeam = initialCoverage.team;
  changes.push(...initialCoverage.changes);
  const rosterChanges = buildRosterRecs(nextTeam, options);
  if (rosterChanges.length > 0) nextTeam = applyRosterRecs(nextTeam, rosterChanges);
  changes.push(...rosterChanges);
  nextTeam = ensureMinimumCatcherCount(nextTeam, options);
  const coverage = ensureRequiredFieldingCoverage(nextTeam, options);
  nextTeam = coverage.team;
  changes.push(...coverage.changes);
  nextTeam = buildAutoManagedRoster(nextTeam, options);
  let validation = validateTeamRoster(nextTeam);
  if (!validation.valid) {
    const recalledCoverage = ensureRequiredFieldingCoverage(nextTeam, {
      ...options,
      allowSamePlanRecall: true,
      originalCooldownIds,
    });
    nextTeam = buildAutoManagedRoster(recalledCoverage.team, options);
    changes.push(...recalledCoverage.changes);
    validation = validateTeamRoster(nextTeam);
  }
  if (!validation.valid) {
    nextTeam = buildAutoManagedRoster(nextTeam, {
      ...options,
      allowOutOfPositionFallback: true,
    });
    validation = validateTeamRoster(nextTeam);
  }
  return { team: nextTeam, changes, validation };
}

export function optimizeTeamForGameStart(team, options = {}) {
  const initialMode = getRosterAutomationMode(team, options.defaultAutomationMode);
  const plan = buildFullRosterPlan(team, {
    ...options,
    automationMode: ROSTER_AUTOMATION_MODES.FULL,
  });
  return { ...plan.team, rosterAutomationMode: initialMode };
}

export function applyManagementPolicy(team, options = {}) {
  const gameDay = Number(options.gameDay || 0);
  const force = options.force === true;
  const mode = getRosterAutomationMode(
    team,
    options.automationMode ?? ROSTER_AUTOMATION_MODES.FULL,
  );
  let nextTeam = ensureManagementIdentity({
    ...team,
    rosterAutomationMode: mode,
  });
  nextTeam = applyEmergencyRosterMaintenance(nextTeam, {
    ...options,
    automationMode: mode,
  });
  if (mode !== ROSTER_AUTOMATION_MODES.FULL) return nextTeam;

  const needsConstraintRepair = !validateTeamRoster(nextTeam).valid;
  const runRoster = options.includeRosterChanges !== false
    && (
      force
      || needsConstraintRepair
      || (
        nextTeam.rosterMaintenance?.changed
        && nextTeam.rosterMaintenance?.validation?.valid === false
      )
      || shouldRunRosterManagement(nextTeam, gameDay)
    );
  const runLineup = force
    || needsConstraintRepair
    || nextTeam.rosterMaintenance?.changed
    || shouldRunLineupManagement(nextTeam, gameDay);
  let recs = [];
  if (runRoster || nextTeam.rosterMaintenance?.changed) {
    const plan = buildFullRosterPlan(nextTeam, {
      ...options,
      automationMode: ROSTER_AUTOMATION_MODES.FULL,
    });
    nextTeam = plan.team;
    recs = plan.changes;
  } else if (runLineup) {
    const refreshed = buildAutoManagedRoster(nextTeam, options);
    // An existing emergency assignment can be valid even when no natural
    // position matching exists. Never replace it with an empty lineup during
    // a lineup-only refresh, or change roster membership in this path.
    nextTeam = validateTeamRoster(refreshed).valid
      ? refreshed
      : buildAutoManagedRoster(nextTeam, { ...options, allowOutOfPositionFallback: true });
  }
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
