import { saberBatter, saberPitcher } from './sabermetrics';

export const MIN_REFERENCE_BATTED_BALLS = 10;
export const MIN_OFFICIAL_BATTED_BALLS = 30;

export const BATTED_BALL_COMPARISON_METRICS = [
  {
    key: 'avgEv',
    label: '平均打球速度',
    unit: 'km/h',
    decimals: 1,
    value: (profile) => Number(profile?.evN) > 0
      ? Number(profile.evSum) / Number(profile.evN)
      : null,
  },
  {
    key: 'hardHitRate',
    label: '強打球率',
    unit: '%',
    decimals: 1,
    value: (profile) => Number(profile?.bip) > 0
      ? Number(profile.hardHit || 0) / Number(profile.bip)
      : null,
    percentage: true,
  },
  {
    key: 'barrelRate',
    label: 'バレル率',
    unit: '%',
    decimals: 1,
    value: (profile) => Number(profile?.bip) > 0
      ? Number(profile.barrel || 0) / Number(profile.bip)
      : null,
    percentage: true,
  },
  {
    key: 'homeRunRate',
    label: '本塁打率',
    unit: '%',
    decimals: 1,
    value: (profile) => Number(profile?.bip) > 0
      ? Number(profile.homeRun || 0) / Number(profile.bip)
      : null,
    percentage: true,
  },
];

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function stableSort(items, getValue, direction = 'desc') {
  if (!direction) return [...items];
  return (Array.isArray(items) ? items : [])
    .map((item, index) => ({ item, index, value: getValue(item) }))
    .sort((a, b) => {
      const aMissing = a.value == null || Number.isNaN(a.value);
      const bMissing = b.value == null || Number.isNaN(b.value);
      if (aMissing !== bMissing) return aMissing ? 1 : -1;
      if (aMissing && bMissing) return a.index - b.index;
      const compared = typeof a.value === 'string' || typeof b.value === 'string'
        ? String(a.value).localeCompare(String(b.value), 'ja')
        : Number(a.value) - Number(b.value);
      return (direction === 'asc' ? compared : -compared) || (a.index - b.index);
    })
    .map(({ item }) => item);
}

export function inningsToOuts(value) {
  const innings = finiteOrNull(value);
  return innings == null ? null : Math.round(innings * 3);
}

export function formatComparisonValue(metric, value) {
  if (value == null || !Number.isFinite(Number(value))) return '---';
  const display = metric.percentage ? Number(value) * 100 : Number(value);
  return `${display.toFixed(metric.decimals ?? 1)}${metric.unit ? ` ${metric.unit}` : ''}`;
}

export function buildBattedBallComparisons({
  playerId,
  selectedProfile,
  peerProfiles,
}) {
  const selectedCount = Number(selectedProfile?.bip) || 0;
  const minimumPeerCount = selectedCount >= MIN_OFFICIAL_BATTED_BALLS
    ? MIN_OFFICIAL_BATTED_BALLS
    : MIN_REFERENCE_BATTED_BALLS;
  return BATTED_BALL_COMPARISON_METRICS.map((metric) => {
    const selectedValue = metric.value(selectedProfile);
    const eligible = (Array.isArray(peerProfiles) ? peerProfiles : [])
      .map((peer) => ({
        ...peer,
        count: Number(peer?.profile?.bip) || 0,
        value: metric.value(peer?.profile),
      }))
      .filter((peer) =>
        peer.count >= minimumPeerCount
        && peer.value != null
        && Number.isFinite(Number(peer.value)));
    const ranked = stableSort(eligible, (peer) => peer.value, 'desc');
    const selectedIndex = ranked.findIndex((peer) => peer.playerId === playerId);
    const rank = selectedIndex >= 0 ? selectedIndex + 1 : null;
    const average = eligible.length > 0
      ? eligible.reduce((sum, peer) => sum + Number(peer.value), 0) / eligible.length
      : null;
    return {
      ...metric,
      value: selectedValue,
      average,
      rank,
      total: eligible.length,
      topPercent: rank && eligible.length
        ? Math.max(1, Math.ceil((rank / eligible.length) * 100))
        : null,
      status: selectedCount >= MIN_OFFICIAL_BATTED_BALLS
        ? 'official'
        : selectedCount >= MIN_REFERENCE_BATTED_BALLS
          ? 'reference'
          : 'hidden',
      minimumPeerCount,
    };
  });
}

export function buildBattedBallSummary(comparisons) {
  const ranked = (Array.isArray(comparisons) ? comparisons : [])
    .filter((item) => item.rank && item.total && item.topPercent != null);
  const strengths = ranked
    .filter((item) => item.topPercent <= 25)
    .sort((a, b) => a.topPercent - b.topPercent)
    .slice(0, 2);
  const concerns = ranked
    .filter((item) => item.topPercent >= 75)
    .sort((a, b) => b.topPercent - a.topPercent)
    .slice(0, 1);
  if (strengths.length === 0 && concerns.length === 0) {
    return 'リーグ平均との差は小さく、現時点では明確な強弱はありません。';
  }
  const parts = [];
  if (strengths.length) {
    parts.push(`強み: ${strengths.map((item) => `${item.label} 上位${item.topPercent}%`).join('、')}`);
  }
  if (concerns.length) {
    parts.push(`注意: ${concerns.map((item) => `${item.label} 下位${100 - item.topPercent + 1}%相当`).join('、')}`);
  }
  return parts.join(' / ');
}

function aggregateBattingStats(team) {
  const stats = (team?.players || [])
    .filter((player) => !player.isPitcher)
    .map((player) => player.stats || {});
  const total = stats.reduce((acc, current) => {
    for (const key of ['AB', 'H', 'D', 'T', 'HR', 'BB', 'HBP', 'SF', 'PA']) {
      acc[key] += Number(current[key]) || 0;
    }
    return acc;
  }, { AB: 0, H: 0, D: 0, T: 0, HR: 0, BB: 0, HBP: 0, SF: 0, PA: 0 });
  return saberBatter({ ...total, K: 0, RBI: 0, SB: 0 });
}

function aggregatePitching(players) {
  const total = (Array.isArray(players) ? players : []).reduce((acc, player) => {
    const stats = player?.stats || {};
    for (const key of ['IP', 'ER', 'BBp', 'HBPp', 'BF', 'Kp', 'HRp', 'Hp']) {
      acc[key] += Number(stats[key]) || 0;
    }
    return acc;
  }, { IP: 0, ER: 0, BBp: 0, HBPp: 0, BF: 0, Kp: 0, HRp: 0, Hp: 0 });
  return saberPitcher(total);
}

function aggregateBattedBallProfile(team) {
  return (team?.players || [])
    .filter((player) => !player.isPitcher)
    .reduce((acc, player) => {
      const profile = player?.stats?.battedBallProfile || {};
      acc.bip += Number(profile.bip) || 0;
      acc.hardHit += Number(profile.hardHit) || 0;
      return acc;
    }, { bip: 0, hardHit: 0 });
}

export function buildTeamMetrics(team) {
  const batters = (team?.players || []).filter((player) => !player.isPitcher);
  const pitchers = (team?.players || []).filter((player) => player.isPitcher);
  const rotationIds = new Set(team?.rotation || []);
  const starters = pitchers.filter((player) =>
    rotationIds.has(player.id) || String(player.subtype || '').includes('先発'));
  const bullpen = pitchers.filter((player) => !starters.includes(player));
  const batting = aggregateBattingStats(team);
  const starterPitching = aggregatePitching(starters);
  const bullpenPitching = aggregatePitching(bullpen);
  const battedBall = aggregateBattedBallProfile(team);
  const lineup = (team?.lineup || [])
    .map((id) => batters.find((player) => player.id === id))
    .filter(Boolean);
  const games = Math.max(1, Number(team?.wins || 0) + Number(team?.losses || 0) + Number(team?.draws || 0));
  return {
    teamId: team?.id,
    teamName: team?.name,
    ops: batting.OPS || null,
    runsPerGame: Number(team?.rf || 0) / games,
    hardHitRate: battedBall.bip > 0 ? battedBall.hardHit / battedBall.bip : null,
    starterEra: starterPitching.ERA || null,
    bullpenEra: bullpenPitching.ERA || null,
    defense: lineup.length
      ? lineup.reduce((sum, player) => sum + Number(player?.batting?.defense || 0), 0) / lineup.length
      : null,
    payroll: (team?.players || []).reduce((sum, player) => sum + Number(player?.salary || 0), 0),
    budget: Number(team?.budget || 0),
  };
}

export const TEAM_COMPARISON_METRICS = [
  { key: 'ops', label: '打線 OPS', higherBetter: true, format: (value) => value == null ? '---' : Number(value).toFixed(3) },
  { key: 'runsPerGame', label: '得点 / 試合', higherBetter: true, format: (value) => value == null ? '---' : Number(value).toFixed(2) },
  { key: 'hardHitRate', label: '強打球率', higherBetter: true, format: (value) => value == null ? '---' : `${(Number(value) * 100).toFixed(1)}%` },
  { key: 'starterEra', label: '先発 ERA', higherBetter: false, format: (value) => value == null ? '---' : Number(value).toFixed(2) },
  { key: 'bullpenEra', label: '救援 ERA', higherBetter: false, format: (value) => value == null ? '---' : Number(value).toFixed(2) },
  { key: 'defense', label: '先発守備平均', higherBetter: true, format: (value) => value == null ? '---' : Number(value).toFixed(1) },
  { key: 'payroll', label: '総年俸', higherBetter: null, format: (value) => value == null ? '---' : `${Math.round(Number(value)).toLocaleString()}万円` },
  { key: 'budget', label: '残予算', higherBetter: null, format: (value) => value == null ? '---' : `${Math.round(Number(value)).toLocaleString()}万円` },
];

export function buildTeamComparisonRows({ myTeam, opponent, allTeams }) {
  const league = opponent?.league;
  const population = (allTeams || [])
    .filter((team) => team.league === league)
    .map(buildTeamMetrics);
  const myMetrics = buildTeamMetrics(myTeam);
  const opponentMetrics = buildTeamMetrics(opponent);
  return TEAM_COMPARISON_METRICS.map((metric) => {
    const ranked = metric.higherBetter == null
      ? []
      : stableSort(
        population.filter((team) => team[metric.key] != null),
        (team) => team[metric.key],
        metric.higherBetter ? 'desc' : 'asc',
      );
    const rankOf = (teamId) => {
      const index = ranked.findIndex((team) => team.teamId === teamId);
      return index >= 0 ? index + 1 : null;
    };
    return {
      ...metric,
      myValue: myMetrics[metric.key],
      opponentValue: opponentMetrics[metric.key],
      myRank: rankOf(myTeam?.id),
      opponentRank: rankOf(opponent?.id),
      population: ranked.length,
    };
  });
}

export function buildTeamConditions(team) {
  const players = team?.players || [];
  const pitchers = players.filter((player) => player.isPitcher);
  const rotationIds = new Set(team?.rotation || []);
  const starters = pitchers.filter((player) => rotationIds.has(player.id));
  const bullpen = pitchers.filter((player) => !rotationIds.has(player.id));
  const avgCondition = (list) => list.length
    ? list.reduce((sum, player) => sum + Number(player.condition ?? 70), 0) / list.length
    : 0;
  const injured = players.filter((player) => Number(player.injuryDaysLeft) > 0);
  const conditions = [];
  conditions.push({
    label: starters.length >= 5 && avgCondition(starters) >= 65 ? '先発ローテ安定' : '先発ローテ要確認',
    tone: starters.length >= 5 && avgCondition(starters) >= 65 ? 'good' : 'warning',
    description: `先発${starters.length}人・平均コンディション${avgCondition(starters).toFixed(0)}`,
  });
  if (bullpen.length) {
    conditions.push({
      label: avgCondition(bullpen) < 60 ? '救援陣に疲労' : '救援陣は運用可能',
      tone: avgCondition(bullpen) < 60 ? 'warning' : 'good',
      description: `救援平均コンディション${avgCondition(bullpen).toFixed(0)}`,
    });
  }
  conditions.push({
    label: injured.length ? `負傷者 ${injured.length}人` : '負傷者なし',
    tone: injured.length ? 'danger' : 'good',
    description: injured.length
      ? injured.slice(0, 3).map((player) => player.name).join('、')
      : '登録選手に離脱者はいません。',
  });
  return conditions;
}

export function buildDecisionInsights({ myTeam, teams }) {
  if (!myTeam) return [];
  const leagueBatters = (teams || [])
    .filter((team) => team.league === myTeam.league)
    .flatMap((team) => (team.players || []).filter((player) => !player.isPitcher));
  const profileRows = leagueBatters
    .map((player) => {
      const profile = player?.stats?.battedBallProfile;
      const bip = Number(profile?.bip) || 0;
      const ev = Number(profile?.evN) > 0 ? Number(profile.evSum) / Number(profile.evN) : null;
      const hard = bip > 0 ? Number(profile?.hardHit || 0) / bip : null;
      return { player, bip, ev, hard };
    })
    .filter((row) => row.bip >= MIN_OFFICIAL_BATTED_BALLS);
  const evRank = stableSort(profileRows, (row) => row.ev, 'desc');
  const percentile = (playerId) => {
    const index = evRank.findIndex((row) => row.player.id === playerId);
    return index >= 0 && evRank.length ? Math.ceil(((index + 1) / evRank.length) * 100) : null;
  };
  const candidates = [];
  for (const player of myTeam.players || []) {
    if (Number(player.injuryDaysLeft) > 0 || Number(player.condition ?? 70) < 50) {
      candidates.push({
        priority: 1,
        tone: 'danger',
        title: `${player.name}を休養候補に`,
        reason: Number(player.injuryDaysLeft) > 0
          ? `負傷で残り${player.injuryDaysLeft}試合。無理な起用は避けるべきです。`
          : `コンディション${player.condition}。代替起用を検討してください。`,
        tab: 'roster',
        player,
      });
      continue;
    }
    if (!player.isPitcher) {
      const ops = saberBatter(player.stats || {}).OPS;
      const topPercent = percentile(player.id);
      if (topPercent != null && topPercent <= 25 && ops < 0.68) {
        candidates.push({
          priority: 2,
          tone: 'good',
          title: `${player.name}は継続起用候補`,
          reason: `OPS ${ops.toFixed(3)}でも平均打球速度はリーグ上位${topPercent}%。結果の上向き余地があります。`,
          tab: 'stats',
          player,
          initialSection: 'battedBall',
        });
      } else if (topPercent != null && topPercent >= 75 && ops >= 0.82) {
        candidates.push({
          priority: 3,
          tone: 'warning',
          title: `${player.name}の上振れに注意`,
          reason: `OPS ${ops.toFixed(3)}に対し平均打球速度はリーグ下位${100 - topPercent + 1}%相当です。`,
          tab: 'stats',
          player,
          initialSection: 'battedBall',
        });
      }
    }
    if (Number(player.contractYearsLeft ?? 99) <= 1) {
      candidates.push({
        priority: 5,
        tone: 'warning',
        title: `${player.name}の契約判断`,
        reason: '契約満了まで1年以内です。延長・放出の判断を先送りしないでください。',
        tab: 'contract',
        player,
      });
    }
  }
  const bestFarm = stableSort(
    (myTeam.farm || []).filter((player) =>
      Number(player.injuryDaysLeft || 0) === 0
      && Number(player.registrationCooldownDays || 0) === 0),
    (player) => player.isPitcher
      ? (Number(player.pitching?.velocity || 0) + Number(player.pitching?.control || 0) + Number(player.pitching?.breaking || 0))
      : (Number(player.batting?.contact || 0) + Number(player.batting?.power || 0) + Number(player.batting?.eye || 0)),
    'desc',
  )[0];
  if (bestFarm) {
    candidates.push({
      priority: 4,
      tone: 'good',
      title: `${bestFarm.name}を昇格候補に`,
      reason: '二軍の能力評価上位です。一軍の同ポジションと比較してください。',
      tab: 'roster',
      player: bestFarm,
    });
  }
  return stableSort(candidates, (item) => item.priority, 'asc').slice(0, 3);
}
