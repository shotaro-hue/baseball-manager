import { uid, rng, rngf, gameDayToDate } from '../utils';
import {
  checkForInjuries,
  tickInjuries,
  tickPositionTraining,
} from '../engine/player';
import { quickSimGame } from '../engine/simulation';
import {
  applyGameStatsFromLog,
  applyPostGameCondition,
  computeBoxScore,
} from '../engine/postGame';
import { calcRevenue } from '../engine/finance';
import { applyPopularityDelta } from '../engine/fanSentiment';
import {
  generateCpuOffer,
  generateCpuCpuTrade,
  classifyTeam,
  evaluateFrontOfficePlan,
} from '../engine/trade';
import { selectAllStars, runAllStarGame } from '../engine/allstar';
import { getMyMatchup, getCpuMatchups } from '../engine/scheduleGen';
import { processCpuFaBids } from '../engine/contract';
import {
  SEASON_GAMES,
  NEWS_TEMPLATES_WIN,
  NEWS_TEMPLATES_LOSE,
  INTERVIEW_QUESTIONS_WIN,
  INTERVIEW_QUESTIONS_LOSE,
  INTERVIEW_OPTIONS_WIN,
  INTERVIEW_OPTIONS_LOSE,
  INJURY_AUTO_DEMOTE_DAYS,
  REGISTRATION_COOLDOWN_DAYS,
  TRADE_DEADLINE_MONTH,
  TRADE_DEADLINE_PROB_EARLY,
  TRADE_DEADLINE_PROB_PEAK,
  TRADE_DEADLINE_CPU_CPU_PROB,
  INJURY_HISTORY_MAX,
  MAX_ROSTER,
  CPU_AUTO_MANAGE_INTERVAL,
  ROSTER_SWAP_SCORE_THRESHOLD,
  ROSTER_DEVREC_BONUS,
  ROSTER_DEVREC_POTENTIAL_MIN,
  ROSTER_DEVREC_DAYS_MAX,
  FIELDING_POSITIONS,
  OPTIMAL_PITCHER_COUNT,
  MIN_ACTIVE_CATCHERS,
} from '../constants';
import { saberBatter, saberPitcher } from '../engine/sabermetrics';

const MAX_FOREIGN_ACTIVE = 4;
const MAX_BATCH_BOX_SCORE_KEEP = 120;
const DEFAULT_PROGRESS_THROTTLE_MS = 250;
const DEFAULT_PROGRESS_PHASE = 'Simulating games';

export function createSeasonBatchProgressState(throttleMs = DEFAULT_PROGRESS_THROTTLE_MS) {
  return {
    throttleMs: Math.max(0, Number(throttleMs) || 0),
    lastEmitAt: null,
  };
}

export function shouldEmitSeasonBatchProgress(state, now, options = {}) {
  if (!state || typeof state !== 'object') return true;
  if (options.force) {
    state.lastEmitAt = now;
    return true;
  }
  if (state.lastEmitAt == null) {
    state.lastEmitAt = now;
    return true;
  }
  if ((now - state.lastEmitAt) >= state.throttleMs) {
    state.lastEmitAt = now;
    return true;
  }
  return false;
}

class SeasonBatchCancelledError extends Error {
  constructor() {
    super('Season batch simulation cancelled');
    this.name = 'SeasonBatchCancelledError';
  }
}

function cloneValue(value) {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function ensureNotCancelled(isCancelled) {
  if (typeof isCancelled === 'function' && isCancelled()) {
    throw new SeasonBatchCancelledError();
  }
}

function emitProgress({
  progressState,
  startedAt,
  current,
  total,
  phase,
  onProgress,
  force = false,
}) {
  if (typeof onProgress !== 'function') return;
  const now = Date.now();
  if (!shouldEmitSeasonBatchProgress(progressState, now, { force })) return;
  const safeTotal = Math.max(1, Number.isFinite(total) ? Math.floor(total) : 1);
  const safeCurrent = Math.max(0, Math.min(safeTotal, Number.isFinite(current) ? Math.floor(current) : 0));
  const elapsedMs = Math.max(0, now - startedAt);
  const avgMsPerGame = safeCurrent > 0 ? elapsedMs / safeCurrent : 0;
  const etaSec = safeCurrent >= safeTotal ? 0 : ((safeTotal - safeCurrent) * avgMsPerGame) / 1000;
  onProgress({
    current: safeCurrent,
    total: safeTotal,
    avgMsPerGame: Number.isFinite(avgMsPerGame) ? Math.max(0, avgMsPerGame) : 0,
    etaSec: Number.isFinite(etaSec) ? Math.max(0, etaSec) : 0,
    phase: typeof phase === 'string' && phase.trim() ? phase : DEFAULT_PROGRESS_PHASE,
  });
}

function applyDefenseCoachRecovery(players, coaches) {
  const defBonus = (coaches || [])
    .filter((coach) => coach.type === 'defense')
    .reduce((sum, coach) => sum + (coach.bonus || 0), 0);
  if (!defBonus) return players;
  return players.map((player) => {
    if (!player.injuryDaysLeft) return player;
    const extra = rngf(0, 1) < (defBonus * 0.1) ? 1 : 0;
    if (!extra) return player;
    const next = Math.max(0, player.injuryDaysLeft - extra);
    return {
      ...player,
      injuryDaysLeft: next,
      injury: next > 0 ? player.injury : null,
      injuryPart: next > 0 ? player.injuryPart : null,
    };
  });
}

function applyInjuriesToPlayers(players, injuries, year) {
  if (!injuries.length) return players;
  const injuriesById = new Map(injuries.map((injury) => [injury.id, injury]));
  return players.map((player) => {
    const injury = injuriesById.get(player.id);
    if (!injury) return player;
    const history = [
      ...(player.injuryHistory ?? []),
      { part: injury.part, year },
    ].slice(-INJURY_HISTORY_MAX);
    return {
      ...player,
      injury: injury.type,
      injuryDaysLeft: injury.days,
      injuryPart: injury.part,
      injuryHistory: history,
    };
  });
}

function tickCooldowns(players) {
  return players.map((player) => {
    const cooldown = player.registrationCooldownDays ?? 0;
    if (!cooldown) return player;
    return {
      ...player,
      registrationCooldownDays: Math.max(0, cooldown - 1),
    };
  });
}

function autoInjuryDemote(team) {
  const farm = team.farm ?? [];
  const demoted = [];
  const kept = [];
  for (const player of team.players || []) {
    if ((player.injuryDaysLeft ?? 0) > INJURY_AUTO_DEMOTE_DAYS) {
      demoted.push({ ...player, registrationCooldownDays: REGISTRATION_COOLDOWN_DAYS });
    } else {
      kept.push(player);
    }
  }
  if (demoted.length === 0) return team;
  const demotedIds = new Set(demoted.map((player) => player.id));
  return {
    ...team,
    players: kept,
    lineup: (team.lineup ?? []).filter((id) => !demotedIds.has(id)),
    lineupNoDh: (team.lineupNoDh ?? []).filter((id) => !demotedIds.has(id)),
    lineupDh: (team.lineupDh ?? []).filter((id) => !demotedIds.has(id)),
    rotation: (team.rotation ?? []).filter((id) => !demotedIds.has(id)),
    farm: [...farm, ...demoted],
  };
}

function cpuBatterScore(player) {
  const sb = saberBatter(player.stats ?? {});
  return (sb.OPS || 0) * 1000
    + (player.batting?.contact ?? 50) * 1.6
    + (player.batting?.eye ?? 50) * 1.1
    + (player.batting?.power ?? 50) * 1.2
    + (player.batting?.speed ?? 50) * 0.7;
}

function cpuStarterScore(player) {
  const sp = saberPitcher(player.stats ?? {});
  const eraBonus = sp.ERA > 0 ? Math.max(0, (4 - sp.ERA) * 15) : 0;
  return (player.pitching?.velocity ?? 50) * 1.2
    + (player.pitching?.control ?? 50) * 1.5
    + (player.pitching?.breaking ?? 50) * 1.0
    + (player.pitching?.stamina ?? 50) * 2.0
    + eraBonus;
}

function cpuRelieverScore(player) {
  const sp = saberPitcher(player.stats ?? {});
  const eraBonus = sp.ERA > 0 ? Math.max(0, (4 - sp.ERA) * 15) : 0;
  return (player.pitching?.velocity ?? 50) * 2.0
    + (player.pitching?.control ?? 50) * 1.5
    + (player.pitching?.breaking ?? 50) * 1.2
    + (player.pitching?.stamina ?? 50) * 0.5
    + eraBonus;
}

function cpuRosterRecScore(player) {
  if (player.isPitcher) {
    const sp = saberPitcher(player.stats ?? {});
    const ability = (player.pitching?.velocity ?? 50) * 1.2
      + (player.pitching?.control ?? 50) * 1.5
      + (player.pitching?.breaking ?? 50) * 1.0
      + (player.pitching?.stamina ?? 50) * 0.8;
    if (!sp.ERA && !sp.WHIP) return ability;
    return ability * 0.55
      + Math.max(0, (5.0 - sp.ERA) * 35)
      + Math.max(0, (1.5 - sp.WHIP) * 50);
  }
  const sb = saberBatter(player.stats ?? {});
  return (sb.OPS || 0) * 1000
    + (player.batting?.contact ?? 50) * 1.6
    + (player.batting?.eye ?? 50) * 1.1
    + (player.batting?.power ?? 50) * 1.2
    + (player.batting?.speed ?? 50) * 0.7;
}

function cpuAutoManageTeam(team) {
  const farm = team.farm ?? [];
  const foreignInActive = (team.players || []).filter((player) => player.isForeign).length;
  const canPromote = (player) => !player.isIkusei
    && (player.injuryDaysLeft ?? 0) === 0
    && (player.registrationCooldownDays ?? 0) === 0
    && !(player.isForeign && foreignInActive >= MAX_FOREIGN_ACTIVE);

  let players = [...(team.players || [])];
  let newFarm = [...farm];

  const effScore = (player, isFarm) => {
    const base = cpuRosterRecScore(player);
    const devBonus = isFarm
      && (player.potential ?? 0) >= ROSTER_DEVREC_POTENTIAL_MIN
      && (player.daysOnActiveRoster ?? 0) < ROSTER_DEVREC_DAYS_MAX
      ? ROSTER_DEVREC_BONUS
      : 0;
    return base + devBonus;
  };

  const targetBatters = MAX_ROSTER - OPTIMAL_PITCHER_COUNT;
  const openSlots = MAX_ROSTER - players.length;

  if (openSlots < 0) {
    const excess = -openSlots;
    const pitcherOver = Math.max(0, players.filter((player) => player.isPitcher).length - OPTIMAL_PITCHER_COUNT);
    const batterOver = Math.max(0, players.filter((player) => !player.isPitcher).length - targetBatters);
    const demoted = new Set();
    const applyDemote = (candidates, limit) => {
      const activeCatcherCount = () => players
        .filter((player) => !player.isPitcher && player.pos === '捕手' && !demoted.has(player.id))
        .length;
      [...candidates]
        .sort((a, b) => effScore(a, false) - effScore(b, false))
        .slice(0, limit)
        .forEach((player) => {
          if (!player.isPitcher && player.pos === '捕手' && activeCatcherCount() <= MIN_ACTIVE_CATCHERS) {
            return;
          }
          players = players.filter((entry) => entry.id !== player.id);
          newFarm = [...newFarm, { ...player, registrationCooldownDays: REGISTRATION_COOLDOWN_DAYS }];
          demoted.add(player.id);
        });
    };
    applyDemote(players.filter((player) => player.isPitcher), Math.min(pitcherOver, excess));
    applyDemote(players.filter((player) => !player.isPitcher), Math.min(batterOver, excess - demoted.size));
    if (demoted.size < excess) {
      applyDemote(players.filter((player) => !demoted.has(player.id)), excess - demoted.size);
    }
  } else {
    const usedFarmIds = new Set();
    const usedActiveIds = new Set();
    const eligibleFarm = newFarm.filter(canPromote);
    const eligiblePitchers = [...eligibleFarm]
      .filter((player) => player.isPitcher)
      .sort((a, b) => effScore(b, true) - effScore(a, true));
    const eligibleBatters = [...eligibleFarm]
      .filter((player) => !player.isPitcher)
      .sort((a, b) => effScore(b, true) - effScore(a, true));
    let slotsLeft = Math.min(openSlots, 3);

    const pitcherNeed = Math.max(0, OPTIMAL_PITCHER_COUNT - players.filter((player) => player.isPitcher).length);
    eligiblePitchers.slice(0, Math.min(pitcherNeed, slotsLeft)).forEach((player) => {
      players.push(player);
      usedFarmIds.add(player.id);
      slotsLeft -= 1;
    });

    const batterNeed = Math.max(0, targetBatters - players.filter((player) => !player.isPitcher).length);
    eligibleBatters.slice(0, Math.min(batterNeed, slotsLeft)).forEach((player) => {
      players.push(player);
      usedFarmIds.add(player.id);
      slotsLeft -= 1;
    });

    if (slotsLeft > 0) {
      eligibleFarm
        .filter((player) => !usedFarmIds.has(player.id))
        .sort((a, b) => effScore(b, true) - effScore(a, true))
        .slice(0, slotsLeft)
        .forEach((player) => {
          players.push(player);
          usedFarmIds.add(player.id);
        });
    }

    let curPitchers = players.filter((player) => player.isPitcher).length;
    let curBatters = players.filter((player) => !player.isPitcher).length;
    while (curPitchers < OPTIMAL_PITCHER_COUNT && curBatters > targetBatters) {
      const farmPitcher = newFarm
        .filter((player) => player.isPitcher && canPromote(player) && !usedFarmIds.has(player.id))
        .sort((a, b) => effScore(b, true) - effScore(a, true))[0];
      const activeBatter = players
        .filter((player) => !player.isPitcher && !usedActiveIds.has(player.id))
        .sort((a, b) => effScore(a, false) - effScore(b, false))[0];
      if (!farmPitcher || !activeBatter) break;
      players = [...players.filter((player) => player.id !== activeBatter.id), farmPitcher];
      newFarm = [...newFarm.filter((player) => player.id !== farmPitcher.id), { ...activeBatter, registrationCooldownDays: REGISTRATION_COOLDOWN_DAYS }];
      usedFarmIds.add(farmPitcher.id);
      usedActiveIds.add(activeBatter.id);
      curPitchers = players.filter((player) => player.isPitcher).length;
      curBatters = players.filter((player) => !player.isPitcher).length;
    }
    while (curBatters < targetBatters && curPitchers > OPTIMAL_PITCHER_COUNT) {
      const farmBatter = newFarm
        .filter((player) => !player.isPitcher && canPromote(player) && !usedFarmIds.has(player.id))
        .sort((a, b) => effScore(b, true) - effScore(a, true))[0];
      const activePitcher = players
        .filter((player) => player.isPitcher && !usedActiveIds.has(player.id))
        .sort((a, b) => effScore(a, false) - effScore(b, false))[0];
      if (!farmBatter || !activePitcher) break;
      players = [...players.filter((player) => player.id !== activePitcher.id), farmBatter];
      newFarm = [...newFarm.filter((player) => player.id !== farmBatter.id), { ...activePitcher, registrationCooldownDays: REGISTRATION_COOLDOWN_DAYS }];
      usedFarmIds.add(farmBatter.id);
      usedActiveIds.add(activePitcher.id);
      curPitchers = players.filter((player) => player.isPitcher).length;
      curBatters = players.filter((player) => !player.isPitcher).length;
    }

    const remainFarm = newFarm.filter((player) => canPromote(player) && !usedFarmIds.has(player.id));
    if (remainFarm.length > 0) {
      [...players]
        .sort((a, b) => effScore(a, false) - effScore(b, false))
        .forEach((activePlayer) => {
          if (usedActiveIds.has(activePlayer.id)) return;
          const best = remainFarm.find((farmPlayer) => !usedFarmIds.has(farmPlayer.id) && farmPlayer.isPitcher === activePlayer.isPitcher);
          if (!best) return;
          if (effScore(best, true) - effScore(activePlayer, false) >= ROSTER_SWAP_SCORE_THRESHOLD) {
            players = players.filter((player) => player.id !== activePlayer.id);
            players.push(best);
            newFarm = newFarm.filter((player) => player.id !== best.id);
            newFarm.push({ ...activePlayer, registrationCooldownDays: REGISTRATION_COOLDOWN_DAYS });
            usedFarmIds.add(best.id);
            usedActiveIds.add(activePlayer.id);
          }
        });
    }

    [...usedFarmIds].forEach((id) => {
      newFarm = newFarm.filter((player) => player.id !== id);
    });
  }

  const batters = players.filter((player) => !player.isPitcher && !player.isIkusei && (player.injuryDaysLeft ?? 0) === 0);
  const useDh = !!team.dhEnabled;
  const required = [...FIELDING_POSITIONS, ...(useDh ? ['DH'] : [])];
  const profAt = (player, pos) => (pos === 'DH' ? 50 : (player.pos === pos ? 100 : (player.positions?.[pos] ?? 0)));
  const sortedBatters = [...batters].sort((a, b) => cpuBatterScore(b) - cpuBatterScore(a));
  const posEligible = Object.fromEntries(required.map((pos) => [pos, sortedBatters.filter((player) => profAt(player, pos) > 0)]));
  const posOrder = [...required].sort((a, b) => posEligible[a].length - posEligible[b].length);
  const assignment = new Map();
  const playerUsed = new Set();
  for (const pos of posOrder) {
    const best = posEligible[pos].find((player) => !playerUsed.has(player.id));
    if (best) {
      assignment.set(pos, best);
      playerUsed.add(best.id);
    }
  }
  for (const pos of posOrder) {
    if (assignment.has(pos)) continue;
    const fallback = sortedBatters.find((player) => !playerUsed.has(player.id));
    if (fallback) {
      assignment.set(pos, fallback);
      playerUsed.add(fallback.id);
    }
  }
  const newLineup = [...assignment.entries()]
    .sort((a, b) => cpuBatterScore(b[1]) - cpuBatterScore(a[1]))
    .map(([, player]) => player.id);

  const pitchers = players.filter((player) => player.isPitcher && !player.isIkusei && (player.injuryDaysLeft ?? 0) === 0);
  const starters = pitchers.filter((player) => player.subtype === '先発').sort((a, b) => cpuStarterScore(b) - cpuStarterScore(a));
  const relievers = pitchers.filter((player) => player.subtype !== '先発').sort((a, b) => cpuRelieverScore(b) - cpuRelieverScore(a));
  const newRotation = starters.slice(0, 6).map((player) => player.id);
  const minRotation = 5;
  if (newRotation.length < minRotation) {
    const need = minRotation - newRotation.length;
    const fallbackRelievers = [...relievers]
      .sort((a, b) => (b.pitching?.stamina ?? 50) - (a.pitching?.stamina ?? 50))
      .slice(0, need)
      .map((player) => player.id);
    newRotation.push(...fallbackRelievers);
  }
  const rotationSet = new Set(newRotation);
  const remaining = pitchers
    .filter((player) => !rotationSet.has(player.id))
    .sort((a, b) => cpuRelieverScore(b) - cpuRelieverScore(a));
  const newPattern = {
    closerId: remaining[0]?.id ?? null,
    setupId: remaining[1]?.id ?? null,
    seventhId: remaining[2]?.id ?? null,
    middleOrder: remaining.slice(3).map((player) => player.id),
  };

  return {
    ...team,
    players,
    farm: newFarm,
    lineup: newLineup,
    lineupDh: newLineup,
    lineupNoDh: newLineup,
    rotation: newRotation,
    pitchingPattern: { ...(team.pitchingPattern ?? {}), ...newPattern },
  };
}

const POSITION_FILL_ORDER = ['C', 'SS', '2B', '3B', '1B', 'LF', 'CF', 'RF', 'DH'];

function buildSimLineup(team, useDh) {
  const limit = useDh ? 9 : 8;
  const nonPitchers = (team.players || []).filter((player) => !player.isPitcher && !player.isIkusei);
  const nonPitcherIds = new Set(nonPitchers.map((player) => player.id));
  const source = useDh ? (team.lineupDh || team.lineup || []) : (team.lineupNoDh || team.lineup || []);
  let lineup = source.filter((id) => nonPitcherIds.has(id));
  let foreignCount = 0;
  lineup = lineup.filter((id) => {
    const player = nonPitchers.find((entry) => entry.id === id);
    if (player?.isForeign) {
      if (foreignCount < MAX_FOREIGN_ACTIVE) {
        foreignCount += 1;
        return true;
      }
      return false;
    }
    return true;
  });
  if (lineup.length < limit) {
    const inLineup = new Set(lineup);
    const available = nonPitchers
      .filter((player) => !inLineup.has(player.id))
      .sort((a, b) => {
        const ai = POSITION_FILL_ORDER.indexOf(a.pos);
        const bi = POSITION_FILL_ORDER.indexOf(b.pos);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      });
    for (const player of available) {
      if (lineup.length >= limit) break;
      if (player.isForeign && foreignCount >= MAX_FOREIGN_ACTIVE) continue;
      if (player.isForeign) foreignCount += 1;
      lineup.push(player.id);
    }
  }
  const fixedLineup = lineup.slice(0, limit);
  if (!useDh) {
    const starterId = team.rotation?.[team.rotIdx % Math.max(team.rotation?.length || 0, 1)];
    const starter = (team.players || []).find((player) => player.id === starterId && player.isPitcher && !player.isIkusei)
      || (team.players || []).find((player) => player.isPitcher && !player.isIkusei)
      || null;
    if (starter) return [...fixedLineup, starter.id];
  }
  return fixedLineup;
}

function applyDhToTeam(team, useDh) {
  return {
    ...team,
    lineup: buildSimLineup(team, useDh),
  };
}

function calcLeagueRank(teamId, allTeams, league) {
  const sameLeague = [...allTeams.filter((team) => team.league === league)]
    .sort((a, b) => {
      const pa = a.wins / Math.max(1, a.wins + a.losses);
      const pb = b.wins / Math.max(1, b.wins + b.losses);
      return pb - pa || (b.rf - b.ra) - (a.rf - a.ra);
    });
  return sameLeague.findIndex((team) => team.id === teamId) + 1;
}

function tryCpuCpuDeadlineTrade(teamsArr, currentGameDay, schedule) {
  const currentDate = gameDayToDate(currentGameDay, schedule);
  if (!currentDate || currentDate.month !== TRADE_DEADLINE_MONTH) return null;
  if (rngf(0, 1) > TRADE_DEADLINE_CPU_CPU_PROB) return null;

  teamsArr.forEach((team) => {
    team.frontOfficePlan = evaluateFrontOfficePlan(team, teamsArr, currentGameDay);
  });
  const result = generateCpuCpuTrade(teamsArr);
  if (!result) return null;

  const {
    buyerId,
    sellerId,
    buyerGets,
    sellerGets,
    buyerName,
    sellerName,
  } = result;
  const buyer = teamsArr.find((team) => team.id === buyerId);
  const seller = teamsArr.find((team) => team.id === sellerId);
  if (!buyer || !seller) return null;

  buyer.players = [...buyer.players.filter((player) => player.id !== sellerGets.id), buyerGets];
  seller.players = [...seller.players.filter((player) => player.id !== buyerGets.id), sellerGets];

  return {
    headline: `移籍情報 ${buyerGets.name} が${buyerName}へ`,
    body: `${sellerName} と ${buyerName} の間でトレードが成立。${buyerName} は ${buyerGets.name} を獲得し、${sellerGets.name} を放出した。`,
    buyerName,
    sellerName,
    buyerGetsName: buyerGets.name,
    sellerGetsName: sellerGets.name,
  };
}

function tryGenerateCpuOfferInBatch(teamsArr, currentGameDay, existingOfferCount, snapshot) {
  const liveMyTeam = teamsArr.find((team) => team.id === snapshot.myId);
  if (!liveMyTeam) return null;
  const currentDate = gameDayToDate(currentGameDay, snapshot.schedule);
  if (currentDate && currentDate.month > TRADE_DEADLINE_MONTH) return null;

  let prob = 0.15;
  if (currentDate && currentDate.month === TRADE_DEADLINE_MONTH) {
    prob = currentDate.day > 15 ? TRADE_DEADLINE_PROB_PEAK : TRADE_DEADLINE_PROB_EARLY;
  }
  if (rngf(0, 1) > prob || existingOfferCount >= 2) return null;

  const others = teamsArr.filter((team) => team.id !== snapshot.myId);
  others.forEach((team) => {
    team.frontOfficePlan = evaluateFrontOfficePlan(team, teamsArr, currentGameDay);
  });
  if (!others.length) return null;

  let cpuTeam;
  if (currentDate && currentDate.month === TRADE_DEADLINE_MONTH) {
    const buyers = others.filter((team) => classifyTeam(team, teamsArr) === 'buyer');
    cpuTeam = buyers.length ? buyers[rng(0, buyers.length - 1)] : others[rng(0, others.length - 1)];
  } else {
    cpuTeam = others[rng(0, others.length - 1)];
  }

  const offer = generateCpuOffer(cpuTeam, liveMyTeam);
  if (!offer) return null;
  return {
    id: uid(),
    type: 'trade',
    title: `${offer.from.name} からトレードオファー`,
    from: offer.from.name,
    dateLabel: `${snapshot.year}年 ${currentGameDay}日目`,
    timestamp: Date.now(),
    read: false,
    resolved: false,
    body: `${offer.from.name} sent a trade offer.\n\nWanted players: ${offer.want.map((player) => player.name).join(' / ')}\nOffered players: ${offer.offer.length > 0 ? offer.offer.map((player) => player.name).join(' / ') : 'None'}${offer.cash > 0 ? `\nCash: +${(offer.cash / 10000).toLocaleString()} x10k` : ''}\n\nCheck the mailbox for details.`, 
    offer,
  };
}

function tryCpuForeignFaInBatch(teamsArr, currentGameDay, pool, snapshot) {
  if (!pool.length) {
    return { updatedTeams: teamsArr, remainingFaPool: pool, news: null, claimed: [] };
  }
  const foreignPool = pool.filter((player) => player.isForeign);
  if (!foreignPool.length) {
    return { updatedTeams: teamsArr, remainingFaPool: pool, news: null, claimed: [] };
  }
  const result = processCpuFaBids(teamsArr, snapshot.myId, foreignPool, teamsArr, snapshot.year);
  if (result.remainingFaPool.length === foreignPool.length) {
    return { updatedTeams: teamsArr, remainingFaPool: pool, news: null, claimed: [] };
  }
  const signedIdSet = new Set(
    foreignPool
      .filter((player) => !result.remainingFaPool.some((remaining) => remaining.id === player.id))
      .map((player) => player.id),
  );
  const mergedPool = pool.filter((player) => !signedIdSet.has(player.id));
  const news = (result.news || []).map((item) => ({
    ...item,
    dateLabel: `${snapshot.year}年 ${currentGameDay}日目`,
  }));
  return {
    updatedTeams: result.updatedTeams,
    remainingFaPool: mergedPool,
    news,
    claimed: result.claimed || [],
  };
}

function applyAllStarSelections(baseTeams, rosters) {
  const pickedIds = new Set([...(rosters?.ce || []), ...(rosters?.pa || [])].map((player) => player.id));
  return baseTeams.map((team) => ({
    ...team,
    players: (team.players || []).map((player) => (
      pickedIds.has(player.id)
        ? { ...player, allStarSelections: (player.allStarSelections || 0) + 1 }
        : player
    )),
  }));
}

function buildAllStarNewsItems(asResult, dayLabel, year) {
  if (!asResult) return [];
  return [
    {
      type: 'allstar',
      headline: `All-Star Game 1 CE ${asResult.game1.score.ce} - PA ${asResult.game1.score.pa}`,
      source: 'NPB Official',
      dateLabel: `${year} Day ${dayLabel}`,
      body: `Venue: ${asResult.venue}\nCE ${asResult.game1.score.ce} - ${asResult.game1.score.pa} PA\nMVP: ${asResult.game1.mvp?.name || 'None'}`,
    },
    {
      type: 'allstar',
      headline: `All-Star Game 2 CE ${asResult.game2.score.ce} - PA ${asResult.game2.score.pa}`,
      source: 'NPB Official',
      dateLabel: `${year} Day ${dayLabel + 1}`,
      body: `CE ${asResult.game2.score.ce} - ${asResult.game2.score.pa} PA\nMVP: ${asResult.game2.mvp?.name || 'None'}`,
    },
  ];
}

function makeCompactBoxScoreRecord({ homeId, awayId, dayNo, cr, bs, homeName, awayName }) {
  return {
    homeId,
    awayId,
    dayNo,
    gameResult: {
      won: cr.won,
      score: {
        my: cr.score.my,
        opp: cr.score.opp,
      },
    },
    homeName,
    awayName,
    inningScores: bs?.inningScores,
    homeBatting: bs?.homeBatting,
    awayBatting: bs?.awayBatting,
    homePitching: bs?.homePitching,
    awayPitching: bs?.awayPitching,
  };
}

function makeTeamResultSummary({ won, drew, myScore, oppScore, oppName, oppId, homeId, awayId }) {
  return {
    won,
    drew,
    myScore,
    oppScore,
    oppName,
    oppId,
    homeId,
    awayId,
  };
}

function buildRecentResult(gameResult) {
  return {
    won: gameResult.won,
    drew: gameResult.score.my === gameResult.score.opp,
    oppName: gameResult.oppTeam?.name || '',
    myScore: gameResult.score.my,
    oppScore: gameResult.score.opp,
    gameNo: gameResult.gameNo,
  };
}

function buildBatchResultSummary(gameResult) {
  return {
    gameNo: gameResult.gameNo,
    won: gameResult.won,
    drew: gameResult.score.my === gameResult.score.opp,
    score: {
      my: gameResult.score.my,
      opp: gameResult.score.opp,
    },
    oppTeam: gameResult.oppTeam
      ? {
          id: gameResult.oppTeam.id,
          name: gameResult.oppTeam.name,
          short: gameResult.oppTeam.short,
          emoji: gameResult.oppTeam.emoji,
          color: gameResult.oppTeam.color,
        }
      : null,
  };
}

function buildGameResultsMapPatch(gameResults) {
  const patch = {};
  gameResults.forEach((result) => {
    patch[result.gameNo] = {
      won: result.won,
      drew: result.score.my === result.score.opp,
      isHome: result.isHome !== false,
      oppName: result.oppTeam?.name || '',
      myScore: result.score.my,
      oppScore: result.score.opp,
      log: result.log || [],
      inningSummary: result.inningSummary || [],
      oppTeam: result.oppTeam,
    };
  });
  return patch;
}

function buildAllTeamResultsPatch(batchBoxScores) {
  const patches = {};
  for (const box of batchBoxScores) {
    const hWon = box.gameResult.won;
    const drew = box.gameResult.score.my === box.gameResult.score.opp;
    if (!patches[box.homeId]) patches[box.homeId] = {};
    patches[box.homeId][box.dayNo] = makeTeamResultSummary({
      won: hWon,
      drew,
      myScore: box.gameResult.score.my,
      oppScore: box.gameResult.score.opp,
      oppName: box.awayName,
      oppId: box.awayId,
      homeId: box.homeId,
      awayId: box.awayId,
    });
    if (!patches[box.awayId]) patches[box.awayId] = {};
    patches[box.awayId][box.dayNo] = makeTeamResultSummary({
      won: !hWon && !drew,
      drew,
      myScore: box.gameResult.score.opp,
      oppScore: box.gameResult.score.my,
      oppName: box.homeName,
      oppId: box.homeId,
      homeId: box.homeId,
      awayId: box.awayId,
    });
  }
  return patches;
}

function buildAllTeamBoxScoresPatch(batchBoxScores) {
  const patches = {};
  for (const box of batchBoxScores) {
    const hasDetail = (box.inningScores && box.inningScores.length)
      || (box.homeBatting && box.homeBatting.length)
      || (box.awayBatting && box.awayBatting.length)
      || (box.homePitching && box.homePitching.length)
      || (box.awayPitching && box.awayPitching.length);
    if (!hasDetail) continue;
    if (!patches[box.homeId]) patches[box.homeId] = {};
    patches[box.homeId][box.dayNo] = {
      inningScores: box.inningScores,
      myBatting: box.homeBatting,
      oppBatting: box.awayBatting,
      myPitching: box.homePitching,
      oppPitching: box.awayPitching,
    };
    if (!patches[box.awayId]) patches[box.awayId] = {};
    patches[box.awayId][box.dayNo] = {
      inningScores: box.inningScores,
      myBatting: box.awayBatting,
      oppBatting: box.homeBatting,
      myPitching: box.awayPitching,
      oppPitching: box.homePitching,
    };
  }
  return patches;
}

function normalizeSnapshot(snapshot) {
  const safeSnapshot = snapshot && typeof snapshot === 'object' ? snapshot : {};
  return {
    ...safeSnapshot,
    teams: cloneValue(safeSnapshot.teams || []),
    schedule: cloneValue(safeSnapshot.schedule || []),
    faPool: cloneValue(safeSnapshot.faPool || []),
    seasonHistory: cloneValue(safeSnapshot.seasonHistory || {}),
    news: cloneValue(safeSnapshot.news || []),
    mailbox: cloneValue(safeSnapshot.mailbox || []),
  };
}

function buildTeamMap(teams) {
  return new Map((teams || []).map((team) => [team.id, team]));
}

export function simulateSeasonBatch({
  snapshot,
  count,
  autoManageMyTeam = false,
  onProgress,
  isCancelled,
}) {
  const state = normalizeSnapshot(snapshot);
  const myTeamBefore = state.teams.find((team) => team.id === state.myId);
  if (!myTeamBefore) {
    throw new Error('My team was not found in snapshot');
  }

  const safeCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  if (safeCount <= 0) {
    throw new Error('Season batch count must be greater than zero');
  }

  const startedAt = Date.now();
  const progressState = createSeasonBatchProgressState();
  emitProgress({
    progressState,
    startedAt,
    current: 0,
    total: safeCount,
    phase: DEFAULT_PROGRESS_PHASE,
    onProgress,
    force: true,
  });

  let newTeams = state.teams;
  let newDay = state.gameDay;
  let newFaPool = state.faPool;
  let allStarDoneLocal = !!state.allStarDone;
  let allStarPayload = null;

  const results = [];
  const batchTradeMails = [];
  const batchForeignSignNews = [];
  const batchForeignSignings = [];
  const batchNewsItems = [];
  let batchAllStarNewsItems = [];
  const batchBoxScores = [];
  const batchInjuries = [];
  const cpuHighlights = [];

  const beforeRank = calcLeagueRank(state.myId, newTeams, myTeamBefore.league);
  const beforeRecord = {
    w: myTeamBefore.wins,
    l: myTeamBefore.losses,
    d: myTeamBefore.draws ?? 0,
  };
  const pendingTradeCountBase = (state.mailbox || []).filter((mail) => mail.type === 'trade' && !mail.resolved).length;

  for (let index = 0; index < safeCount; index += 1) {
    ensureNotCancelled(isCancelled);

    if (newDay % CPU_AUTO_MANAGE_INTERVAL === 0) {
      newTeams = newTeams.map((team) => (
        team.id === state.myId && !autoManageMyTeam ? team : cpuAutoManageTeam(team)
      ));
    }

    let teamMap = buildTeamMap(newTeams);

    const scheduleMatchup = getMyMatchup(state.schedule, newDay, state.myId);
    const oppId = scheduleMatchup?.oppId;
    const opp = scheduleMatchup ? teamMap.get(oppId) : null;
    const cpuPairs = getCpuMatchups(state.schedule, newDay, state.myId, oppId);

    for (const cpuMatchup of cpuPairs) {
      const homeTeam = teamMap.get(cpuMatchup.homeId);
      const awayTeam = teamMap.get(cpuMatchup.awayId);
      if (!homeTeam || !awayTeam) continue;
      const useDh = !!homeTeam.dhEnabled;
      const homePlayersSnap = [...homeTeam.players];
      const awayPlayersSnap = [...awayTeam.players];
      const sim = quickSimGame(applyDhToTeam(homeTeam, useDh), applyDhToTeam(awayTeam, useDh));
      const box = computeBoxScore(sim.log || [], sim.inningSummary || [], homePlayersSnap, awayPlayersSnap, sim.score.my, sim.score.opp);
      batchBoxScores.push(makeCompactBoxScoreRecord({
        homeId: homeTeam.id,
        awayId: awayTeam.id,
        dayNo: newDay,
        cr: sim,
        bs: box,
        homeName: homeTeam.name,
        awayName: awayTeam.name,
      }));
      if (batchBoxScores.length > MAX_BATCH_BOX_SCORE_KEEP) {
        batchBoxScores.splice(0, batchBoxScores.length - MAX_BATCH_BOX_SCORE_KEEP);
      }

      const drew = sim.score.my === sim.score.opp;
      const homeWon = sim.won;
      const margin = Math.abs(sim.score.my - sim.score.opp);
      if (!drew && (margin >= 4 || margin <= 1) && cpuHighlights.length < 8) {
        cpuHighlights.push({
          homeTeam: { short: homeTeam.short, emoji: homeTeam.emoji, color: homeTeam.color },
          awayTeam: { short: awayTeam.short, emoji: awayTeam.emoji, color: awayTeam.color },
          homeScore: sim.score.my,
          awayScore: sim.score.opp,
          homeWon,
          label: margin >= 4 ? 'Blowout' : 'Close game',
        });
      }

      if (homeWon) {
        homeTeam.wins += 1;
        homeTeam.rf += sim.score.my;
        homeTeam.ra += sim.score.opp;
        awayTeam.losses += 1;
        awayTeam.rf += sim.score.opp;
        awayTeam.ra += sim.score.my;
      } else if (drew) {
        homeTeam.draws += 1;
        homeTeam.rf += sim.score.my;
        homeTeam.ra += sim.score.opp;
        awayTeam.draws += 1;
        awayTeam.rf += sim.score.opp;
        awayTeam.ra += sim.score.my;
      } else {
        awayTeam.wins += 1;
        awayTeam.rf += sim.score.opp;
        awayTeam.ra += sim.score.my;
        homeTeam.losses += 1;
        homeTeam.rf += sim.score.my;
        homeTeam.ra += sim.score.opp;
      }

      Object.assign(homeTeam, applyPopularityDelta(homeTeam, homeWon, drew));
      Object.assign(awayTeam, applyPopularityDelta(awayTeam, !homeWon && !drew, drew));

      const homeRevenue = calcRevenue(homeTeam);
      homeTeam.budget = (homeTeam.budget ?? 0) + homeRevenue.ticket + homeRevenue.sponsor + homeRevenue.merch;
      homeTeam.revenueThisSeason = (homeTeam.revenueThisSeason ?? 0) + homeRevenue.ticket + homeRevenue.sponsor + homeRevenue.merch;
      const awayRevenue = calcRevenue(awayTeam);
      awayTeam.budget = (awayTeam.budget ?? 0) + awayRevenue.ticket + awayRevenue.sponsor + awayRevenue.merch;
      awayTeam.revenueThisSeason = (awayTeam.revenueThisSeason ?? 0) + awayRevenue.ticket + awayRevenue.sponsor + awayRevenue.merch;

      homeTeam.players = applyGameStatsFromLog(homeTeam.players, sim.log || [], true, homeWon, newDay);
      homeTeam.players = applyPostGameCondition(homeTeam.players, sim.log || [], true, newDay);
      homeTeam.players = tickInjuries(homeTeam.players);
      homeTeam.players = homeTeam.players.map((player) => ({ ...player, daysOnActiveRoster: (player.daysOnActiveRoster ?? 0) + 1 }));
      homeTeam.players = applyInjuriesToPlayers(homeTeam.players, checkForInjuries(homeTeam.players, state.year), state.year);

      awayTeam.players = applyGameStatsFromLog(awayTeam.players, sim.log || [], false, !homeWon && !drew, newDay);
      awayTeam.players = applyPostGameCondition(awayTeam.players, sim.log || [], false, newDay);
      awayTeam.players = tickInjuries(awayTeam.players);
      awayTeam.players = awayTeam.players.map((player) => ({ ...player, daysOnActiveRoster: (player.daysOnActiveRoster ?? 0) + 1 }));
      awayTeam.players = applyInjuriesToPlayers(awayTeam.players, checkForInjuries(awayTeam.players, state.year), state.year);

      homeTeam.rotIdx = (homeTeam.rotIdx || 0) + 1;
      awayTeam.rotIdx = (awayTeam.rotIdx || 0) + 1;
    }

    const cpuCpuTradeNews = tryCpuCpuDeadlineTrade(newTeams, newDay, state.schedule);
    if (cpuCpuTradeNews) {
      results.push({ type: 'trade_news', ...cpuCpuTradeNews, day: newDay });
    }

    const tradeMail = tryGenerateCpuOfferInBatch(newTeams, newDay, pendingTradeCountBase + batchTradeMails.length, state);
    if (tradeMail) {
      batchTradeMails.push(tradeMail);
    }

    const foreignFaResult = tryCpuForeignFaInBatch(newTeams, newDay, newFaPool, state);
    newTeams = foreignFaResult.updatedTeams;
    newFaPool = foreignFaResult.remainingFaPool;
    teamMap = buildTeamMap(newTeams);
    if (foreignFaResult.news?.length) {
      batchForeignSignNews.push(...foreignFaResult.news);
    }
    if (foreignFaResult.claimed?.length) {
      batchForeignSignings.push(...foreignFaResult.claimed);
    }

    const myTeam = teamMap.get(state.myId);
    if (scheduleMatchup && opp && myTeam) {
      const useDh = scheduleMatchup.isHome ? !!myTeam.dhEnabled : !!opp.dhEnabled;
      const sim = quickSimGame(applyDhToTeam(myTeam, useDh), applyDhToTeam(opp, useDh), { isMyHome: scheduleMatchup.isHome });
      const homePerspectiveSim = scheduleMatchup.isHome
        ? sim
        : {
            ...sim,
            won: sim.score.opp > sim.score.my,
            score: { my: sim.score.opp, opp: sim.score.my },
          };
      batchBoxScores.push(makeCompactBoxScoreRecord({
        homeId: scheduleMatchup.isHome ? myTeam.id : opp.id,
        awayId: scheduleMatchup.isHome ? opp.id : myTeam.id,
        dayNo: newDay,
        cr: homePerspectiveSim,
        bs: null,
        homeName: scheduleMatchup.isHome ? myTeam.name : opp.name,
        awayName: scheduleMatchup.isHome ? opp.name : myTeam.name,
      }));
      if (batchBoxScores.length > MAX_BATCH_BOX_SCORE_KEEP) {
        batchBoxScores.splice(0, batchBoxScores.length - MAX_BATCH_BOX_SCORE_KEEP);
      }

      const won = sim.score.my > sim.score.opp;
      const drew = sim.score.my === sim.score.opp;
      if (won) {
        myTeam.wins += 1;
        myTeam.rf += sim.score.my;
        myTeam.ra += sim.score.opp;
      } else if (drew) {
        myTeam.draws += 1;
        myTeam.rf += sim.score.my;
        myTeam.ra += sim.score.opp;
      } else {
        myTeam.losses += 1;
        myTeam.rf += sim.score.my;
        myTeam.ra += sim.score.opp;
      }
      Object.assign(myTeam, applyPopularityDelta(myTeam, won, drew));
      myTeam.rotIdx = (myTeam.rotIdx || 0) + 1;
      myTeam.players = applyGameStatsFromLog(myTeam.players, sim.log || [], true, won, newDay);
      myTeam.players = applyPostGameCondition(myTeam.players, sim.log || [], true, newDay, scheduleMatchup.isHome);
      myTeam.players = tickInjuries(myTeam.players);
      myTeam.players = tickPositionTraining(myTeam.players);
      myTeam.players = myTeam.players.map((player) => ({ ...player, daysOnActiveRoster: (player.daysOnActiveRoster ?? 0) + 1 }));
      myTeam.players = applyDefenseCoachRecovery(myTeam.players, myTeam.coaches);
      const myInjuries = checkForInjuries(myTeam.players, state.year);
      if (myInjuries.length > 0) {
        myInjuries.forEach((injury) => {
          const player = myTeam.players.find((entry) => entry.id === injury.id);
          if (player) {
            batchInjuries.push({
              name: player.name,
              pos: player.pos,
              type: injury.type,
              days: injury.days,
              part: injury.part,
            });
          }
        });
      }
      myTeam.players = applyInjuriesToPlayers(myTeam.players, myInjuries, state.year);
      myTeam.players = tickCooldowns(myTeam.players);
      myTeam.farm = tickInjuries(myTeam.farm ?? []);
      myTeam.farm = tickCooldowns(myTeam.farm ?? []);
      Object.assign(myTeam, autoInjuryDemote(myTeam));

      const oppTeam = teamMap.get(opp.id);
      if (oppTeam) {
        if (won) {
          oppTeam.losses += 1;
          oppTeam.rf += sim.score.opp;
          oppTeam.ra += sim.score.my;
        } else if (drew) {
          oppTeam.draws += 1;
          oppTeam.rf += sim.score.opp;
          oppTeam.ra += sim.score.my;
        } else {
          oppTeam.wins += 1;
          oppTeam.rf += sim.score.opp;
          oppTeam.ra += sim.score.my;
        }
        Object.assign(oppTeam, applyPopularityDelta(oppTeam, !won && !drew, drew));
        oppTeam.players = applyGameStatsFromLog(oppTeam.players, sim.log || [], false, !won && !drew, newDay);
        oppTeam.players = applyPostGameCondition(oppTeam.players, sim.log || [], false, newDay, !scheduleMatchup.isHome);
        oppTeam.players = tickInjuries(oppTeam.players);
        oppTeam.players = applyInjuriesToPlayers(oppTeam.players, checkForInjuries(oppTeam.players, state.year), state.year);
        oppTeam.rotIdx = (oppTeam.rotIdx || 0) + 1;
      }

      const revenue = calcRevenue(myTeam);
      const revenueTotal = revenue.ticket + revenue.sponsor + revenue.merch;
      myTeam.budget = (myTeam.budget ?? 0) + revenueTotal;
      myTeam.revenueThisSeason = (myTeam.revenueThisSeason ?? 0) + revenueTotal;

      results.push({ ...sim, won, oppTeam: opp, gameNo: newDay, isHome: scheduleMatchup.isHome });

      const templates = won ? NEWS_TEMPLATES_WIN : NEWS_TEMPLATES_LOSE;
      const scoreString = `${sim.score.my}-${sim.score.opp}`;
      const myTeamName = newTeams.find((team) => team.id === state.myId)?.name || '自チーム';
      const headline = templates[rng(0, templates.length - 1)]
        .replace('{team}', myTeamName)
        .replace('{opp}', opp.name || 'Opponent')
        .replace('{score}', scoreString);
      batchNewsItems.push({
        type: 'game',
        headline,
        source: 'スポーツ報知',
        dateLabel: `${state.year}年 ${newDay}日目`,
        body: won
          ? `${myTeamName} が${opp.name} に ${scoreString} で勝利した。`
          : `${myTeamName} は ${opp.name} に ${scoreString} で敗れた。`,
      });
      if (rngf(0, 1) < 0.15) {
        const questions = won ? INTERVIEW_QUESTIONS_WIN : INTERVIEW_QUESTIONS_LOSE;
        const options = won ? INTERVIEW_OPTIONS_WIN : INTERVIEW_OPTIONS_LOSE;
        batchNewsItems.push({
          type: 'interview',
          headline: `インタビュー ${myTeamName} 監督に直撃`,
          source: '記者会見',
          dateLabel: `${state.year}年 ${newDay}日目`,
          body: '試合後の監督インタビューです。',
          question: questions[rng(0, questions.length - 1)],
          options,
        });
      }
    }

    if (!allStarDoneLocal && newDay === state.allStarTriggerDay) {
      const rosters = selectAllStars(newTeams);
      const gameResult = runAllStarGame(rosters, state.year);
      newTeams = applyAllStarSelections(newTeams, rosters);
      allStarDoneLocal = true;
      allStarPayload = { rosters, gameResult };
      batchAllStarNewsItems = buildAllStarNewsItems(gameResult, newDay, state.year);
    }

    newDay += 1;

    emitProgress({
      progressState,
      startedAt,
      current: index + 1,
      total: safeCount,
      phase: DEFAULT_PROGRESS_PHASE,
      onProgress,
    });
  }

  ensureNotCancelled(isCancelled);
  emitProgress({
    progressState,
    startedAt,
    current: safeCount,
    total: safeCount,
    phase: 'Finalizing results',
    onProgress,
    force: true,
  });

  const tradeNewsItems = results
    .filter((result) => result.type === 'trade_news')
    .map((result) => ({
      type: 'trade',
      headline: result.headline,
      source: 'Baseball Times',
      dateLabel: `${state.year}年 ${result.day}日目`,
      body: result.body,
    }));
  const transferEntries = results
    .filter((result) => result.type === 'trade_news')
    .map((result) => ({
      id: uid(),
      timestamp: Date.now(),
      year: state.year,
      day: result.day,
      type: 'trade',
      headline: `CPU間トレード ${result.sellerName} -> ${result.buyerName}`,
      fromTeam: result.sellerName,
      toTeam: result.buyerName,
      playersIn: [result.buyerGetsName],
      playersOut: [result.sellerGetsName],
      detail: result.body,
    }));
  const gameNewsItems = [...batchNewsItems].reverse();
  const allStarNewsItems = [...batchAllStarNewsItems];
  const nowTimestamp = Date.now();
  const normalizedBatchNews = [...tradeNewsItems, ...gameNewsItems, ...batchForeignSignNews, ...allStarNewsItems]
    .map((item, newsIndex) => ({
      ...item,
      id: uid(),
      timestamp: nowTimestamp - newsIndex,
    }));
  const nextNews = [...normalizedBatchNews, ...(state.news || [])].slice(0, 50);

  let nextMailbox = batchTradeMails.length ? [...(state.mailbox || []), ...batchTradeMails] : [...(state.mailbox || [])];
  if (batchForeignSignings.length) {
    const byTeam = new Map();
    for (const claim of batchForeignSignings) {
      if (!byTeam.has(claim.teamId)) {
        byTeam.set(claim.teamId, {
          teamId: claim.teamId,
          teamName: claim.teamName,
          teamEmoji: claim.teamEmoji,
          players: [],
        });
      }
      byTeam.get(claim.teamId).players.push(`${claim.player.name} (${claim.player.pos})`);
    }
    nextMailbox = [
      ...nextMailbox,
      {
        id: uid(),
        type: 'cpu_fa_summary',
        read: false,
        title: `外国人補強まとめ ${byTeam.size}件`,
        subject: `外国人補強まとめ ${byTeam.size}件`,
        from: 'スカウト部',
        dateLabel: `${state.year}年 ${newDay - 1}日目まで`,
        timestamp: Date.now(),
        body: 'CPU球団による外国人選手の補強状況をまとめました。',
        signings: Array.from(byTeam.values()),
      },
    ];
  }

  const existingSeasonHistory = state.seasonHistory && typeof state.seasonHistory === 'object' ? state.seasonHistory : {};
  const existingTransfers = Array.isArray(existingSeasonHistory.transfers) ? existingSeasonHistory.transfers : [];
  const nextSeasonHistory = {
    ...existingSeasonHistory,
    transfers: [...existingTransfers, ...transferEntries].slice(-400),
  };

  const gameResults = results.filter((result) => result.type !== 'trade_news');
  const afterMyTeam = newTeams.find((team) => team.id === state.myId);
  const afterRecord = afterMyTeam
    ? { w: afterMyTeam.wins, l: afterMyTeam.losses, d: afterMyTeam.draws ?? 0 }
    : { w: 0, l: 0, d: 0 };
  const afterRank = afterMyTeam ? calcLeagueRank(state.myId, newTeams, afterMyTeam.league) : beforeRank;

  const nextState = {
    ...state,
    teams: newTeams,
    gameDay: newDay,
    faPool: newFaPool,
    seasonHistory: nextSeasonHistory,
    news: nextNews,
    mailbox: nextMailbox,
    saveRevision: (Number(state.saveRevision) || 0) + 1,
    allStarDone: allStarDoneLocal,
    allStarResult: allStarPayload?.gameResult ?? state.allStarResult ?? null,
  };

  emitProgress({
    progressState,
    startedAt,
    current: safeCount,
    total: safeCount,
    phase: 'Done',
    onProgress,
    force: true,
  });

  return {
    nextState,
    batchResults: gameResults.map(buildBatchResultSummary),
    batchMeta: {
      beforeRank,
      afterRank,
      beforeRecord,
      afterRecord,
      injuries: batchInjuries,
      cpuHighlights,
    },
    recentResults: gameResults.map(buildRecentResult).reverse().slice(0, 5),
    gameResultsMapPatch: buildGameResultsMapPatch(gameResults),
    allTeamResultsPatch: buildAllTeamResultsPatch(batchBoxScores),
    allTeamBoxScoresPatch: buildAllTeamBoxScoresPatch(batchBoxScores),
    nextAllStarDone: allStarDoneLocal,
    allStarPayload,
    summaryCounts: {
      tradeMailCount: batchTradeMails.length,
      foreignSigningCount: batchForeignSignings.length,
    },
    shouldEnterPlayoff: (newDay - 1) >= SEASON_GAMES,
  };
}

export { SeasonBatchCancelledError };
