import { useEffect, useMemo, useState } from 'react';
import {
  createEmptyBattedBallProfile,
  normalizeBattedBallEvent,
  updateBattedBallProfile,
} from '../engine/battedBallProfile';
import {
  buildBattedBallComparisons,
  buildBattedBallSummary,
  formatComparisonValue,
} from '../engine/analysisComparison';
import { SprayChart } from './tabs/SprayChart';

const RANGE_OPTIONS = [
  ['last30', '直近30打球'],
  ['season', '今季'],
  ['year', '年度指定'],
  ['career', '保存済み通算'],
];

const RESULT_OPTIONS = [
  ['all', '全打球'],
  ['hit', '安打'],
  ['hr', '本塁打'],
  ['out', 'アウト'],
];

function resultBucket(event) {
  const result = String(event?.result || '').toLowerCase();
  const hitType = String(event?.hitType || '').toLowerCase();
  if (result === 'hr' || hitType === 'homerun') return 'hr';
  if (['s', 'd', 't'].includes(result) || ['single', 'double', 'triple'].includes(hitType)) {
    return 'hit';
  }
  return 'out';
}

function matchesResult(event, resultFilter) {
  if (resultFilter === 'all') return true;
  const bucket = resultBucket(event);
  if (resultFilter === 'hit') return bucket === 'hit' || bucket === 'hr';
  return bucket === resultFilter;
}

function newestFirst(events) {
  return (Array.isArray(events) ? events : [])
    .map((event, index) => ({
      ...event,
      __sourceIndex: index,
      __gameDay: Number(event?.gameDay) || 0,
    }))
    .sort((a, b) => (b.__gameDay - a.__gameDay) || (b.__sourceIndex - a.__sourceIndex));
}

function profileFor(events) {
  return (Array.isArray(events) ? events : []).reduce(
    (profile, event) => updateBattedBallProfile(profile, event),
    createEmptyBattedBallProfile(),
  );
}

function profilesFor(events) {
  const all = profileFor(events);
  const hit = profileFor(events.filter((event) => matchesResult(event, 'hit')));
  const hr = profileFor(events.filter((event) => matchesResult(event, 'hr')));
  const out = profileFor(events.filter((event) => matchesResult(event, 'out')));
  return { all, hit, hr, out };
}

function toChartEvent(rawEvent, index) {
  const event = normalizeBattedBallEvent(rawEvent);
  if (!event) return null;
  const hitType = event.result === 's'
    ? 'single'
    : event.result === 'd'
      ? 'double'
      : event.result === 't'
        ? 'triple'
        : event.result === 'hr'
          ? 'homeRun'
          : 'out';
  return {
    ...event,
    id: `${rawEvent?.gameId || 'memory'}:${event.seq ?? index}:${index}`,
    x: Math.max(0, Math.min(1, event.sprayAngleDeg / 90)),
    y: Math.max(0, Math.min(1, event.distanceM / 150)),
    hitType,
    exitVelo: event.evKmh,
    launchAngle: event.laDeg,
  };
}

function formatAverage(sum, count, suffix = '') {
  return Number(count) > 0 ? `${(Number(sum) / Number(count)).toFixed(1)}${suffix}` : '---';
}

function formatRate(value, denominator) {
  return Number(denominator) > 0
    ? `${((Number(value || 0) / Number(denominator)) * 100).toFixed(1)}%`
    : '---';
}

function AnalysisMetric({ label, value, note }) {
  return (
    <div className="batted-ball-metric">
      <div className="batted-ball-metric-label">{label}</div>
      <div className="batted-ball-metric-value mono">{value}</div>
      {note && <div className="batted-ball-metric-note">{note}</div>}
    </div>
  );
}

function memoryPeerProfiles(players, range, resultFilter) {
  return (Array.isArray(players) ? players : [])
    .filter((peer) => peer && !peer.isPitcher)
    .map((peer) => {
      const events = newestFirst(peer?.stats?.battedBallEvents);
      const rangeEvents = range === 'last30' ? events.slice(0, 30) : events;
      const fromEvents = profilesFor(rangeEvents)[resultFilter];
      const seasonProfile = resultFilter === 'all' ? peer?.stats?.battedBallProfile : null;
      return {
        playerId: peer.id,
        profile: seasonProfile && Number(seasonProfile.bip) > Number(fromEvents?.bip || 0)
          ? seasonProfile
          : fromEvents,
      };
    });
}

function EmptyState({ status, hasPeriodEvents }) {
  let title = '該当する打球はありません';
  let body = '結果フィルタを変更すると表示される場合があります。';
  if (!hasPeriodEvents && status === 'error') {
    title = '打球履歴を読み込めませんでした';
    body = '端末内の保存領域を確認し、画面を開き直してください。';
  } else if (!hasPeriodEvents && status === 'unavailable') {
    title = 'この端末では履歴を参照できません';
    body = '打球履歴は端末内に保存されるため、保存した端末で確認してください。';
  } else if (!hasPeriodEvents && status === 'not-recorded') {
    title = 'この期間の履歴は保存されていません';
    body = 'アーカイブ機能の保存開始前に行われた試合は復元できません。';
  } else if (!hasPeriodEvents) {
    title = '打球データはまだありません';
    body = '試合を進めて打球が記録されると、ここに分析結果が表示されます。';
  }
  return (
    <div className="batted-ball-empty" role="status">
      <strong>{title}</strong>
      <span>{body}</span>
    </div>
  );
}

export function BattedBallAnalysisPanel({ player, saveId, year, teams, teamName }) {
  const [range, setRange] = useState('season');
  const [resultFilter, setResultFilter] = useState('all');
  const [population, setPopulation] = useState('league');
  const [selectedYear, setSelectedYear] = useState(year);
  const [archiveYears, setArchiveYears] = useState([]);
  const [archiveMeta, setArchiveMeta] = useState(null);
  const [archiveView, setArchiveView] = useState({
    queryKey: null,
    status: 'loading',
    events: [],
    profilesByResult: null,
    totalEvents: 0,
    sampled: false,
  });
  const [comparisonView, setComparisonView] = useState({
    queryKey: null,
    status: 'loading',
    peers: [],
    source: 'archive',
  });

  const memoryEvents = useMemo(
    () => newestFirst(player?.stats?.battedBallEvents),
    [player?.stats?.battedBallEvents],
  );
  const playerTeam = useMemo(
    () => (teams || []).find((team) =>
      team.name === teamName
      || [...(team.players || []), ...(team.farm || [])].some((entry) => entry.id === player?.id)),
    [player?.id, teamName, teams],
  );
  const populationPlayers = useMemo(() => {
    const allTeams = Array.isArray(teams) ? teams : [];
    const leagueTeams = playerTeam
      ? allTeams.filter((team) => team.league === playerTeam.league)
      : allTeams;
    if (population === 'team') {
      return [...(playerTeam?.players || []), ...(playerTeam?.farm || [])]
        .filter((entry) => !entry.isPitcher);
    }
    const leaguePlayers = leagueTeams.flatMap((team) =>
      [...(team.players || []), ...(team.farm || [])].filter((entry) => !entry.isPitcher));
    if (population === 'position') {
      return leaguePlayers.filter((entry) => entry.pos === player?.pos);
    }
    return leaguePlayers;
  }, [player?.pos, playerTeam, population, teams]);
  const populationPlayerIds = useMemo(
    () => populationPlayers.map((entry) => entry.id).filter(Boolean),
    [populationPlayers],
  );

  useEffect(() => {
    let alive = true;
    if (!player?.id || !saveId) return () => { alive = false; };
    import('../engine/battedBallArchive').then(async (archive) => {
      const [years, meta] = await Promise.all([
        archive.loadPlayerBattedBallYears(saveId, player.id),
        archive.loadBattedBallArchiveMeta(saveId),
      ]);
      if (!alive) return;
      setArchiveYears(years);
      setArchiveMeta(meta);
    });
    return () => { alive = false; };
  }, [player?.id, saveId]);

  useEffect(() => {
    let alive = true;
    if (!player?.id || player.isPitcher || range === 'last30' || !saveId) {
      return () => { alive = false; };
    }
    const queryKey = `${saveId}:${player.id}:${range}:${range === 'year' ? selectedYear : year}`;

    import('../engine/battedBallArchive')
      .then((archive) => archive.loadPlayerBattedBalls({
        saveId,
        playerId: player.id,
        year: range === 'year' ? selectedYear : year,
        period: range === 'career' ? 'career' : 'season',
      }))
      .then((loaded) => {
        if (!alive) return;
        if (loaded.status === 'ready' && loaded.totalEvents > 0) {
          setArchiveView({ ...loaded, queryKey });
          return;
        }
        const canFallbackToCurrentSeason =
          memoryEvents.length > 0
          && (range === 'season' || (range === 'year' && Number(selectedYear) === Number(year)));
        const events = canFallbackToCurrentSeason ? memoryEvents : [];
        setArchiveView({
          queryKey,
          status: canFallbackToCurrentSeason
            ? 'memory-fallback'
            : loaded.status === 'ready'
              ? (range === 'career' || (range === 'year' && Number(selectedYear) !== Number(year)))
                ? 'not-recorded'
                : 'empty'
              : loaded.status,
          events,
          profilesByResult: profilesFor(events),
          totalEvents: events.length,
          sampled: false,
        });
      })
      .catch(() => {
        if (!alive) return;
        setArchiveView({
          queryKey,
          status: 'error',
          events: [],
          profilesByResult: null,
          totalEvents: 0,
          sampled: false,
        });
      });
    return () => { alive = false; };
  }, [memoryEvents, player?.id, player?.isPitcher, range, saveId, selectedYear, year]);

  useEffect(() => {
    let alive = true;
    if (!player?.id || player.isPitcher) return () => { alive = false; };
    const queryYear = range === 'year' ? selectedYear : year;
    const queryKey = `${saveId || 'memory'}:${range}:${queryYear}:${population}:${populationPlayerIds.join(',')}`;
    if (range === 'last30' || !saveId) {
      Promise.resolve().then(() => {
        if (!alive) return;
        setComparisonView({
          queryKey,
          status: 'ready',
          peers: memoryPeerProfiles(populationPlayers, range, resultFilter),
          source: 'memory',
        });
      });
      return () => { alive = false; };
    }
    import('../engine/battedBallArchive')
      .then((archive) => archive.loadBattedBallComparisonProfiles({
        saveId,
        year: queryYear,
        period: range === 'career' ? 'career' : 'season',
        playerIds: populationPlayerIds,
      }))
      .then((loaded) => {
        if (!alive) return;
        const peers = (loaded.peers || []).map((peer) => ({
          playerId: peer.playerId,
          profile: peer.profilesByResult?.[resultFilter] || createEmptyBattedBallProfile(),
        }));
        const hasArchiveData = peers.some((peer) => Number(peer.profile?.bip) > 0);
        setComparisonView({
          queryKey,
          status: loaded.status,
          peers: hasArchiveData
            ? peers
            : memoryPeerProfiles(populationPlayers, range, resultFilter),
          source: hasArchiveData ? 'archive' : 'memory',
        });
      })
      .catch(() => {
        if (!alive) return;
        setComparisonView({
          queryKey,
          status: 'error',
          peers: memoryPeerProfiles(populationPlayers, range, resultFilter),
          source: 'memory',
        });
      });
    return () => { alive = false; };
  }, [
    player?.id,
    player?.isPitcher,
    population,
    populationPlayerIds,
    populationPlayers,
    range,
    resultFilter,
    saveId,
    selectedYear,
    year,
  ]);

  const activeQueryKey = saveId && player?.id
    ? `${saveId}:${player.id}:${range}:${range === 'year' ? selectedYear : year}`
    : null;
  const immediateView = useMemo(() => {
    if (range === 'last30') {
      const events = memoryEvents.slice(0, 30);
      return {
        status: 'memory',
        events,
        profilesByResult: profilesFor(events),
        totalEvents: events.length,
        sampled: false,
      };
    }
    if (!saveId) {
      const canUseMemory = range === 'season';
      const events = canUseMemory ? memoryEvents : [];
      return {
        status: canUseMemory ? 'memory' : 'unavailable',
        events,
        profilesByResult: profilesFor(events),
        totalEvents: events.length,
        sampled: false,
      };
    }
    return null;
  }, [memoryEvents, range, saveId]);
  const effectiveView = immediateView || (
    archiveView.queryKey === activeQueryKey
      ? archiveView
      : {
        status: 'loading',
        events: [],
        profilesByResult: null,
        totalEvents: 0,
        sampled: false,
      }
  );
  const sourceEvents = useMemo(
    () => newestFirst(effectiveView.events),
    [effectiveView.events],
  );
  const filteredEvents = useMemo(
    () => sourceEvents.filter((event) => matchesResult(event, resultFilter)),
    [resultFilter, sourceEvents],
  );
  const chartEvents = useMemo(
    () => filteredEvents.map(toChartEvent).filter(Boolean),
    [filteredEvents],
  );
  const fallbackProfiles = useMemo(() => profilesFor(sourceEvents), [sourceEvents]);
  const profiles = effectiveView.profilesByResult || fallbackProfiles;
  const selectedProfile = profiles?.[resultFilter] || createEmptyBattedBallProfile();
  const allProfile = profiles?.all || createEmptyBattedBallProfile();
  const selectedCount = Number(selectedProfile.bip) || 0;
  const allCount = Number(allProfile.bip) || 0;
  const reliability = selectedCount < 30
    ? '小標本'
    : selectedCount < 120
      ? '蓄積中'
      : '十分';
  const selectedRangeLabel = RANGE_OPTIONS.find(([value]) => value === range)?.[1] || '今季';
  const archiveStartYear = Number(archiveMeta?.archiveStartYear) || null;
  const coverageWarning = range === 'career' && archiveStartYear
    ? `${archiveStartYear}年の保存開始以降のみ`
    : null;
  const activeComparisonKey = `${saveId || 'memory'}:${range}:${range === 'year' ? selectedYear : year}:${population}:${populationPlayerIds.join(',')}`;
  const comparisons = useMemo(
    () => buildBattedBallComparisons({
      playerId: player?.id,
      selectedProfile,
      peerProfiles: comparisonView.queryKey === activeComparisonKey ? comparisonView.peers : [],
    }),
    [activeComparisonKey, comparisonView.peers, comparisonView.queryKey, player?.id, selectedProfile],
  );
  const comparisonSummary = useMemo(
    () => buildBattedBallSummary(comparisons),
    [comparisons],
  );
  const populationLabel = population === 'position'
    ? `同一リーグ・${player.pos}`
    : population === 'team'
      ? '自球団'
      : `${playerTeam?.league || ''}リーグ全打者`;

  if (!player || player.isPitcher) return null;

  return (
    <section className="batted-ball-analysis" aria-labelledby={`batted-ball-title-${player.id}`}>
      <div className="batted-ball-heading">
        <div>
          <h3 id={`batted-ball-title-${player.id}`}>打球分析</h3>
          <p>期間・結果の条件を、指標とチャートの両方へ適用します。</p>
        </div>
        <div className={`batted-ball-reliability reliability-${reliability === '十分' ? 'high' : reliability === '蓄積中' ? 'mid' : 'low'}`}>
          {reliability} · N={selectedCount}打球
        </div>
      </div>

      <div className="batted-ball-controls">
        <label>
          <span>期間</span>
          <select value={range} onChange={(event) => setRange(event.target.value)}>
            {RANGE_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        {range === 'year' && (
          <label>
            <span>年度</span>
            <select value={selectedYear} onChange={(event) => setSelectedYear(Number(event.target.value))}>
              {(archiveYears.length ? archiveYears : [year]).map((archiveYear) => (
                <option key={archiveYear} value={archiveYear}>{archiveYear}年</option>
              ))}
            </select>
          </label>
        )}
        <label>
          <span>結果</span>
          <select value={resultFilter} onChange={(event) => setResultFilter(event.target.value)}>
            {RESULT_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label>
          <span>比較対象</span>
          <select value={population} onChange={(event) => setPopulation(event.target.value)}>
            <option value="league">同一リーグ</option>
            <option value="position">同ポジション</option>
            <option value="team">自球団</option>
          </select>
        </label>
      </div>

      {effectiveView.status === 'loading' ? (
        <div className="batted-ball-loading" role="status">打球履歴を読み込んでいます…</div>
      ) : (
        <>
          <div className="batted-ball-metrics">
            <AnalysisMetric
              label="平均打球速度"
              value={formatAverage(selectedProfile.evSum, selectedProfile.evN, ' km/h')}
            />
            <AnalysisMetric
              label="平均打球角度"
              value={formatAverage(selectedProfile.laSum, selectedProfile.laN, '°')}
            />
            <AnalysisMetric
              label="強打球率"
              value={formatRate(selectedProfile.hardHit, selectedCount)}
              note="145km/h以上"
            />
            <AnalysisMetric
              label="バレル率"
              value={formatRate(selectedProfile.barrel, selectedCount)}
              note="Statcast基準（EV×打球角度）"
            />
            <AnalysisMetric
              label="本塁打率"
              value={formatRate(selectedProfile.homeRun, selectedCount)}
            />
            <AnalysisMetric
              label="対象打球"
              value={`${selectedCount}`}
              note={`${selectedRangeLabel}・${RESULT_OPTIONS.find(([value]) => value === resultFilter)?.[1]}`}
            />
          </div>

          {selectedCount >= 10 && (
            <div className="league-comparison-block">
              <div className="league-comparison-heading">
                <div>
                  <strong>リーグ内比較</strong>
                  <span>
                    {populationLabel}・{selectedCount < 30 ? 10 : 30}打球以上 / {selectedCount < 30 ? '参考順位' : '正式順位'}
                  </span>
                </div>
                {comparisonView.source === 'memory' && <em>端末内の保持範囲で比較</em>}
              </div>
              <div className="league-comparison-grid">
                {comparisons.map((comparison) => (
                  <div key={comparison.key} className="league-comparison-card">
                    <span>{comparison.label}</span>
                    <strong>{formatComparisonValue(comparison, comparison.value)}</strong>
                    {comparison.status === 'hidden' || !comparison.rank ? (
                      <small>比較対象不足</small>
                    ) : (
                      <>
                        <b>{comparison.status === 'reference' ? '参考 ' : ''}{comparison.rank}/{comparison.total}位 · 上位{comparison.topPercent}%</b>
                        <small>平均 {formatComparisonValue(comparison, comparison.average)}</small>
                        <div className="percentile-track" aria-hidden="true">
                          <i style={{ left: `${Math.min(100, Math.max(0, 100 - comparison.topPercent))}%` }}/>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
              <div className="league-comparison-summary">{comparisonSummary}</div>
            </div>
          )}

          {selectedCount > 0 && selectedCount < 30 && (
            <div className="batted-ball-warning" role="note">
              小標本です。平均値や割合は大きく変動するため、起用判断では能力値・今季成績も併用してください。
            </div>
          )}

          {coverageWarning && (
            <div className="batted-ball-coverage" role="note">
              「保存済み通算」は{coverageWarning}です。保存開始前の打球は含みません。
            </div>
          )}

          {effectiveView.status === 'memory-fallback' && (
            <div className="batted-ball-coverage" role="note">
              アーカイブがないため、現在メモリに残る直近{sourceEvents.length}打球を表示しています。
            </div>
          )}

          {selectedCount === 0 ? (
            <EmptyState status={effectiveView.status} hasPeriodEvents={allCount > 0} />
          ) : (
            <>
              <div className="batted-ball-breakdown">
                <span>GB {formatRate(selectedProfile.ground, selectedCount)}</span>
                <span>LD {formatRate(selectedProfile.line, selectedCount)}</span>
                <span>FB {formatRate(selectedProfile.fly, selectedCount)}</span>
                <span>引張 {formatRate(selectedProfile.pull, selectedCount)}</span>
                <span>中方向 {formatRate(selectedProfile.centerRelative, selectedCount)}</span>
                <span>逆方向 {formatRate(selectedProfile.opposite, selectedCount)}</span>
              </div>
              <SprayChart events={chartEvents} />
              {effectiveView.sampled && (
                <div className="batted-ball-sample-note">
                  指標は全{allCount}打球で集計し、チャートは最大1,000打球を均等抽出しています。
                </div>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
