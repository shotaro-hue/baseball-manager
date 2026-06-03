import { uid, rng, rngf, gameDayToDate } from '../utils';
import { checkForInjuries, tickInjuries, tickPositionTraining, calcRetireWill } from '../engine/player';
import { quickSimGame } from '../engine/simulation';
import { applyGameStatsFromLog, applyPostGameCondition, computeBoxScore } from '../engine/postGame';
import { calcRevenue } from '../engine/finance';
import { applyPopularityDelta } from '../engine/fanSentiment';
import { generateCpuOffer, generateCpuCpuTrade, classifyTeam, evaluateFrontOfficePlan } from '../engine/trade';
import { selectAllStars, runAllStarGame } from '../engine/allstar';
import { getCpuMatchups } from '../engine/scheduleGen';
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
} from '../constants';

const MAX_FOREIGN_ACTIVE = 4;

function cloneValue(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function ensureNotCancelled(isCancelled) {
  if (typeof isCancelled === 'function' && isCancelled()) {
    throw new Error('single-day simulation cancelled');
  }
}

function emitProgress(onProgress, phase, force = false) {
  if (typeof onProgress !== 'function') return;
  onProgress({
    current: force ? 1 : 0,
    total: 1,
    avgMsPerGame: 0,
    etaSec: force ? 0 : 1,
    phase,
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
  return players.map((player) => {
    const injury = injuries.find((entry) => entry.id === player.id);
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
    for (const player of nonPitchers.filter((entry) => !inLineup.has(entry.id))) {
      if (lineup.length >= limit) break;
      if (player.isForeign && foreignCount >= MAX_FOREIGN_ACTIVE) continue;
      if (player.isForeign) foreignCount += 1;
      lineup.push(player.id);
    }
  }

  const fixedLineup = lineup.slice(0, limit);
  if (!useDh) {
    const rotationLength = team.rotation?.length || 0;
    const starterId = rotationLength > 0 ? team.rotation[team.rotIdx % rotationLength] : null;
    const starter = (team.players || []).find((player) => player.id === starterId && player.isPitcher && !player.isIkusei)
      || (team.players || []).find((player) => player.isPitcher && !player.isIkusei)
      || null;
    if (starter) return [...fixedLineup, starter.id];
  }
  return fixedLineup;
}

function applyDhToTeam(team, useDh) {
  return { ...team, lineup: buildSimLineup(team, useDh) };
}

function buildGameResultsMapPatch(gameNo, result, oppTeam, isHome = true) {
  return {
    [gameNo]: {
      won: result.won,
      drew: result.score.my === result.score.opp,
      isHome,
      oppName: oppTeam?.name || '',
      myScore: result.score.my,
      oppScore: result.score.opp,
      log: result.log || [],
      inningSummary: result.inningSummary || [],
      oppTeam,
    },
  };
}

function buildAllTeamResultEntry(homeId, awayId, cr, bs, homeName, awayName, dayNo) {
  const homeWon = cr.won;
  const drew = cr.score.my === cr.score.opp;
  return {
    [homeId]: {
      [dayNo]: {
        won: homeWon,
        drew,
        myScore: cr.score.my,
        oppScore: cr.score.opp,
        oppName: awayName,
        oppId: awayId,
        homeId,
        awayId,
        inningScores: bs?.inningScores,
        myBatting: bs?.homeBatting,
        oppBatting: bs?.awayBatting,
        myPitching: bs?.homePitching,
        oppPitching: bs?.awayPitching,
      },
    },
    [awayId]: {
      [dayNo]: {
        won: !homeWon && !drew,
        drew,
        myScore: cr.score.opp,
        oppScore: cr.score.my,
        oppName: homeName,
        oppId: homeId,
        homeId,
        awayId,
        inningScores: bs?.inningScores,
        myBatting: bs?.awayBatting,
        oppBatting: bs?.homeBatting,
        myPitching: bs?.awayPitching,
        oppPitching: bs?.homePitching,
      },
    },
  };
}

function mergeAllTeamResultPatches(target, patch) {
  Object.entries(patch || {}).forEach(([teamId, dayMap]) => {
    target[teamId] = { ...(target[teamId] || {}), ...(dayMap || {}) };
  });
}

function buildAllStarNewsItems(asResult, dayLabel, year) {
  if (!asResult) return [];
  return [
    {
      type: 'allstar',
      headline: `オールスター第1戦 セ${asResult.game1.score.ce} - パ${asResult.game1.score.pa}`,
      source: 'NPB公式',
      dateLabel: `${year}年 ${dayLabel}日目`,
      body: `会場: ${asResult.venue}\nセ・リーグ ${asResult.game1.score.ce} - ${asResult.game1.score.pa} パ・リーグ\nMVP: ${asResult.game1.mvp?.name || '選出なし'}`,
    },
    {
      type: 'allstar',
      headline: `オールスター第2戦 セ${asResult.game2.score.ce} - パ${asResult.game2.score.pa}`,
      source: 'NPB公式',
      dateLabel: `${year}年 ${dayLabel + 1}日目`,
      body: `セ・リーグ ${asResult.game2.score.ce} - ${asResult.game2.score.pa} パ・リーグ\nMVP: ${asResult.game2.mvp?.name || '選出なし'}`,
    },
  ];
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

function buildTransferEntry(tradeNews, year, gameDay) {
  if (!tradeNews) return null;
  return {
    id: uid(),
    timestamp: Date.now(),
    year,
    day: gameDay,
    type: 'trade',
    headline: `CPUトレード ${tradeNews.sellerName} -> ${tradeNews.buyerName}`,
    fromTeam: tradeNews.sellerName,
    toTeam: tradeNews.buyerName,
    playersIn: [tradeNews.buyerGetsName],
    playersOut: [tradeNews.sellerGetsName],
    detail: tradeNews.body,
  };
}

function tryGenerateCpuOfferSingleDay(teams, snapshot) {
  const currentDate = gameDayToDate(snapshot.gameDay, snapshot.schedule);
  if (currentDate && currentDate.month > TRADE_DEADLINE_MONTH) return null;
  let prob = 0.15;
  if (currentDate && currentDate.month === TRADE_DEADLINE_MONTH) {
    prob = currentDate.day > 15 ? TRADE_DEADLINE_PROB_PEAK : TRADE_DEADLINE_PROB_EARLY;
  }
  if (rngf(0, 1) > prob) return null;
  const myTeam = teams.find((team) => team.id === snapshot.myId);
  if (!myTeam) return null;
  const others = teams.filter((team) => team.id !== snapshot.myId);
  others.forEach((team) => {
    team.frontOfficePlan = evaluateFrontOfficePlan(team, teams, snapshot.gameDay);
  });
  if (!others.length) return null;
  let cpuTeam;
  if (currentDate && currentDate.month === TRADE_DEADLINE_MONTH) {
    const buyers = others.filter((team) => classifyTeam(team, teams) === 'buyer');
    cpuTeam = buyers.length ? buyers[rng(0, buyers.length - 1)] : others[rng(0, others.length - 1)];
  } else {
    cpuTeam = others[rng(0, others.length - 1)];
  }
  const offer = generateCpuOffer(cpuTeam, myTeam);
  if (!offer) return null;
  return {
    id: uid(),
    type: 'trade',
    title: `${offer.from.name}からトレードオファー`,
    from: offer.from.name,
    dateLabel: `${snapshot.year}年 ${snapshot.gameDay}日目`,
    timestamp: Date.now(),
    read: false,
    resolved: false,
    body: `${offer.from.name}よりトレードの打診がありました。\n\n・獲得したい選手: ${offer.want.map((player) => player.name).join('、')}\n・放出候補: ${offer.offer.length > 0 ? offer.offer.map((player) => player.name).join('、') : 'なし'}${offer.cash > 0 ? `\n・金銭: +${(offer.cash / 10000).toLocaleString()}万円` : ''}\n\nメール画面から返答してください。`,
    offer,
  };
}

function tryCpuCpuDeadlineTradeSingleDay(teams, snapshot) {
  const currentDate = gameDayToDate(snapshot.gameDay, snapshot.schedule);
  if (!currentDate || currentDate.month !== TRADE_DEADLINE_MONTH) return null;
  if (rngf(0, 1) > TRADE_DEADLINE_CPU_CPU_PROB) return null;
  teams.forEach((team) => {
    team.frontOfficePlan = evaluateFrontOfficePlan(team, teams, snapshot.gameDay);
  });
  const result = generateCpuCpuTrade(teams);
  if (!result) return null;
  const { buyerId, sellerId, buyerGets, sellerGets, buyerName, sellerName } = result;
  const buyer = teams.find((team) => team.id === buyerId);
  const seller = teams.find((team) => team.id === sellerId);
  if (!buyer || !seller) return null;
  buyer.players = [...buyer.players.filter((player) => player.id !== sellerGets.id), buyerGets];
  seller.players = [...seller.players.filter((player) => player.id !== buyerGets.id), sellerGets];
  return {
    headline: `移籍情報 ${buyerGets.name}が${buyerName}へ`,
    body: `${sellerName}と${buyerName}の間でトレードが成立。${buyerName}は${buyerGets.name}を獲得し、${sellerGets.name}を放出しました。`,
    buyerName,
    sellerName,
    buyerGetsName: buyerGets.name,
    sellerGetsName: sellerGets.name,
  };
}

function updateTeamAfterGame(team, result, isMyPerspective, won, drew, gameDay, year, isHomeTeam = isMyPerspective) {
  let updated = {
    ...team,
    wins: team.wins + (won ? 1 : 0),
    losses: team.losses + (!won && !drew ? 1 : 0),
    draws: team.draws + (drew ? 1 : 0),
    rf: team.rf + (isMyPerspective ? result.score.my : result.score.opp),
    ra: team.ra + (isMyPerspective ? result.score.opp : result.score.my),
    rotIdx: isMyPerspective ? team.rotIdx + 1 : team.rotIdx,
  };
  updated.players = applyGameStatsFromLog(updated.players, result.log || [], isMyPerspective, won, gameDay);
  updated.players = applyPostGameCondition(updated.players, result.log || [], isMyPerspective, gameDay, isHomeTeam);
  updated.players = tickInjuries(updated.players);
  if (isMyPerspective) {
    updated.players = tickPositionTraining(updated.players);
    updated.players = updated.players.map((player) => ({
      ...player,
      daysOnActiveRoster: (player.daysOnActiveRoster ?? 0) + 1,
    }));
    updated.players = applyDefenseCoachRecovery(updated.players, team.coaches);
  }
  const newInjuries = checkForInjuries(updated.players, year);
  updated.players = applyInjuriesToPlayers(updated.players, newInjuries, year);
  if (isMyPerspective) {
    updated.farm = tickCooldowns(updated.farm ?? []);
    updated = autoInjuryDemote(updated);
  }
  Object.assign(updated, applyPopularityDelta(team, won, drew));
  const revenue = calcRevenue(updated);
  const totalRevenue = revenue.ticket + revenue.sponsor + revenue.merch;
  updated.budget = (updated.budget ?? 0) + totalRevenue;
  updated.revenueThisSeason = (updated.revenueThisSeason ?? 0) + totalRevenue;
  return {
    team: updated,
    injuries: newInjuries,
  };
}

function maybeBuildRetireAnnouncement(team, year, gameDay) {
  if (!team || Math.random() >= 0.04) return null;
  const candidates = (team.players || []).filter((player) => player.age >= 35 && !player._retireNow && calcRetireWill(player) >= 40);
  if (candidates.length === 0) return null;
  const player = candidates[rng(0, candidates.length - 1)];
  return {
    modal: { player, type: 'announce' },
    news: {
      type: 'season',
      headline: `引退表明 ${player.name}`,
      source: 'スポーツ報知',
      dateLabel: `${year}年 ${gameDay}日目`,
      body: `${player.name}（${player.age}歳）が引退を表明するコメントを出しました。チームは試合後、本人の意思を確認していきます。`,
    },
  };
}

export function simulateSingleDay({ snapshot, gameContext, isCancelled, onProgress }) {
  const safeSnapshot = cloneValue(snapshot || {});
  const teams = safeSnapshot.teams || [];
  const myTeam = teams.find((team) => team.id === safeSnapshot.myId);
  const currentOpp = teams.find((team) => team.id === gameContext?.selectedOpponentId);
  if (!myTeam || !currentOpp) {
    throw new Error('single-day simulation requires both my team and opponent');
  }

  emitProgress(onProgress, '試合シム');
  ensureNotCancelled(isCancelled);

  const useDh = !!gameContext?.useDh;
  const isHome = gameContext?.isHome !== false;
  const userGameResult = quickSimGame(
    applyDhToTeam(myTeam, useDh),
    applyDhToTeam(currentOpp, useDh),
    { simulationMode: gameContext?.simulationMode || 'detailed', isMyHome: isHome },
  );
  const won = userGameResult.score.my > userGameResult.score.opp;
  const drew = userGameResult.score.my === userGameResult.score.opp;

  const nextTeams = teams.map((team) => ({
    ...team,
    players: cloneValue(team.players || []),
    farm: cloneValue(team.farm || []),
  }));
  const myTeamIndex = nextTeams.findIndex((team) => team.id === safeSnapshot.myId);
  const oppTeamIndex = nextTeams.findIndex((team) => team.id === currentOpp.id);
  const myUpdate = updateTeamAfterGame(nextTeams[myTeamIndex], userGameResult, true, won, drew, safeSnapshot.gameDay, safeSnapshot.year, isHome);
  const oppUpdate = updateTeamAfterGame(nextTeams[oppTeamIndex], userGameResult, false, !won && !drew, drew, safeSnapshot.gameDay, safeSnapshot.year, !isHome);
  nextTeams[myTeamIndex] = myUpdate.team;
  nextTeams[oppTeamIndex] = oppUpdate.team;

  emitProgress(onProgress, '他試合処理');
  ensureNotCancelled(isCancelled);

  const cpuMatchups = getCpuMatchups(safeSnapshot.schedule, safeSnapshot.gameDay, safeSnapshot.myId, currentOpp.id);
  const fallbackOthers = nextTeams.filter((team) => team.id !== safeSnapshot.myId && team.id !== currentOpp.id);
  const matchupList = cpuMatchups.length > 0
    ? cpuMatchups
    : (() => {
        const pairs = [];
        for (let index = 0; index < fallbackOthers.length - 1; index += 2) {
          pairs.push({ homeId: fallbackOthers[index].id, awayId: fallbackOthers[index + 1].id });
        }
        return pairs;
      })();

  const allTeamResultsPatch = {};
  const gameResultsMapPatch = buildGameResultsMapPatch(safeSnapshot.gameDay, userGameResult, currentOpp, isHome);
  const myBoxScore = computeBoxScore(
    userGameResult.log || [],
    userGameResult.inningSummary || [],
    isHome ? myTeam.players : currentOpp.players,
    isHome ? currentOpp.players : myTeam.players,
    isHome ? userGameResult.score.my : userGameResult.score.opp,
    isHome ? userGameResult.score.opp : userGameResult.score.my,
  );
  const homePerspectiveUserResult = isHome
    ? userGameResult
    : {
        ...userGameResult,
        won: userGameResult.score.opp > userGameResult.score.my,
        score: { my: userGameResult.score.opp, opp: userGameResult.score.my },
      };
  mergeAllTeamResultPatches(
    allTeamResultsPatch,
    buildAllTeamResultEntry(isHome ? safeSnapshot.myId : currentOpp.id, isHome ? currentOpp.id : safeSnapshot.myId, homePerspectiveUserResult, myBoxScore, isHome ? myTeam.name : currentOpp.name, isHome ? currentOpp.name : myTeam.name, safeSnapshot.gameDay),
  );

  for (const matchup of matchupList) {
    ensureNotCancelled(isCancelled);
    const homeIndex = nextTeams.findIndex((team) => team.id === matchup.homeId);
    const awayIndex = nextTeams.findIndex((team) => team.id === matchup.awayId);
    if (homeIndex === -1 || awayIndex === -1) continue;
    const homeTeam = nextTeams[homeIndex];
    const awayTeam = nextTeams[awayIndex];
    const cpuResult = quickSimGame(
      applyDhToTeam(homeTeam, !!homeTeam.dhEnabled),
      applyDhToTeam(awayTeam, !!homeTeam.dhEnabled),
      { simulationMode: gameContext?.simulationMode || 'detailed' },
    );
    const homeWon = cpuResult.won;
    const cpuDrew = cpuResult.score.my === cpuResult.score.opp;
    nextTeams[homeIndex] = updateTeamAfterGame(homeTeam, cpuResult, true, homeWon, cpuDrew, safeSnapshot.gameDay, safeSnapshot.year).team;
    nextTeams[awayIndex] = updateTeamAfterGame(awayTeam, cpuResult, false, !homeWon && !cpuDrew, cpuDrew, safeSnapshot.gameDay, safeSnapshot.year).team;
    const cpuBoxScore = computeBoxScore(
      cpuResult.log || [],
      cpuResult.inningSummary || [],
      homeTeam.players,
      awayTeam.players,
      cpuResult.score.my,
      cpuResult.score.opp,
    );
    mergeAllTeamResultPatches(
      allTeamResultsPatch,
      buildAllTeamResultEntry(homeTeam.id, awayTeam.id, cpuResult, cpuBoxScore, homeTeam.name, awayTeam.name, safeSnapshot.gameDay),
    );
  }

  emitProgress(onProgress, '日次反映');
  ensureNotCancelled(isCancelled);

  const nextNews = [...(safeSnapshot.news || [])];
  const nextMailbox = [...(safeSnapshot.mailbox || [])];
  const nextSeasonHistory = {
    ...(safeSnapshot.seasonHistory && typeof safeSnapshot.seasonHistory === 'object' ? safeSnapshot.seasonHistory : {}),
  };
  const existingTransfers = Array.isArray(nextSeasonHistory.transfers) ? nextSeasonHistory.transfers : [];

  const newsTemplate = won ? NEWS_TEMPLATES_WIN : NEWS_TEMPLATES_LOSE;
  const scoreStr = `${userGameResult.score.my}-${userGameResult.score.opp}`;
  const headline = newsTemplate[rng(0, newsTemplate.length - 1)]
    .replace('{team}', myTeam.name || '自チーム')
    .replace('{opp}', currentOpp.name || '相手')
    .replace('{score}', scoreStr);
  nextNews.unshift({
    type: 'game',
    headline,
    source: 'スポーツ報知',
    dateLabel: `${safeSnapshot.year}年 ${safeSnapshot.gameDay}日目`,
    body: won
      ? `${myTeam.name}が${currentOpp.name}に${scoreStr}で勝利しました。`
      : `${myTeam.name}は${currentOpp.name}に${scoreStr}で敗れました。`,
  });

  if (Math.random() < 0.35) {
    nextNews.unshift({
      type: 'interview',
      headline: `インタビュー ${myTeam.name || ''}戦後会見`,
      source: '球団広報',
      dateLabel: `${safeSnapshot.year}年 ${safeSnapshot.gameDay}日目`,
      body: '試合後、監督にコメントを求められた。',
      question: (won ? INTERVIEW_QUESTIONS_WIN : INTERVIEW_QUESTIONS_LOSE)[rng(0, (won ? INTERVIEW_QUESTIONS_WIN : INTERVIEW_QUESTIONS_LOSE).length - 1)],
      options: won ? INTERVIEW_OPTIONS_WIN : INTERVIEW_OPTIONS_LOSE,
    });
  }

  const tradeOffer = tryGenerateCpuOfferSingleDay(nextTeams, safeSnapshot);
  if (tradeOffer) nextMailbox.unshift(tradeOffer);

  const tradeNews = tryCpuCpuDeadlineTradeSingleDay(nextTeams, safeSnapshot);
  if (tradeNews) {
    nextNews.unshift({
      type: 'trade',
      headline: tradeNews.headline,
      source: 'Baseball Times',
      dateLabel: `${safeSnapshot.year}年 ${safeSnapshot.gameDay}日目`,
      body: tradeNews.body,
    });
  }

  const retireAnnouncement = maybeBuildRetireAnnouncement(nextTeams[myTeamIndex], safeSnapshot.year, safeSnapshot.gameDay);
  if (retireAnnouncement?.news) {
    nextNews.unshift(retireAnnouncement.news);
  }

  let allStarPayload = null;
  let nextAllStarDone = !!safeSnapshot.allStarDone;
  let screenDirective = safeSnapshot.gameDay >= SEASON_GAMES ? 'playoff' : 'result';
  let finalizedTeams = nextTeams;

  if (!nextAllStarDone && safeSnapshot.gameDay + 1 === safeSnapshot.allStarTriggerDay) {
    const rosters = selectAllStars(nextTeams);
    const asResult = runAllStarGame(rosters, safeSnapshot.year);
    finalizedTeams = applyAllStarSelections(nextTeams, rosters);
    allStarPayload = { rosters, gameResult: asResult };
    nextAllStarDone = true;
    screenDirective = 'allstar';
    nextNews.unshift(...buildAllStarNewsItems(asResult, safeSnapshot.gameDay + 1, safeSnapshot.year));
  }

  const transferEntry = buildTransferEntry(tradeNews, safeSnapshot.year, safeSnapshot.gameDay);
  nextSeasonHistory.transfers = transferEntry
    ? [...existingTransfers, transferEntry].slice(-400)
    : existingTransfers;

  const nextState = {
    ...safeSnapshot,
    teams: finalizedTeams,
    seasonHistory: nextSeasonHistory,
    news: nextNews.slice(0, 1000),
    mailbox: nextMailbox.slice(0, 1000),
    gameDay: safeSnapshot.gameDay + 1,
    saveRevision: (Number(safeSnapshot.saveRevision) || 0) + 1,
    allStarDone: nextAllStarDone,
    allStarResult: allStarPayload || safeSnapshot.allStarResult || null,
  };

  emitProgress(onProgress, '完了', true);

  return {
    nextState,
    userGameResult: {
      ...userGameResult,
      oppTeam: currentOpp,
      won,
      gameNo: safeSnapshot.gameDay,
      isHome,
    },
    recentResultsPatch: [{
      won,
      drew,
      oppName: currentOpp.name || '',
      myScore: userGameResult.score.my,
      oppScore: userGameResult.score.opp,
      gameNo: safeSnapshot.gameDay,
    }],
    gameResultsMapPatch,
    allTeamResultsPatch,
    summaryCounts: {
      tradeMailCount: tradeOffer ? 1 : 0,
      foreignSigningCount: 0,
    },
    screenDirective,
    nextAllStarDone,
    allStarPayload,
    retireAnnouncement: retireAnnouncement?.modal || null,
  };
}
