import { useMemo, useState } from 'react';
import { fmtAvg, fmtPct, fmtIP } from '../../utils';
import { saberBatter, saberPitcher } from '../../engine/sabermetrics';
import { inningsToOuts, stableSort } from '../../engine/analysisComparison';
import { HandBadge, ThCell } from '../ui';

const BATTER_COLUMNS = [
  { key: 'PA', label: '打席', value: (p) => Number(p.stats?.PA) || 0, render: (p) => p.stats.PA },
  { key: 'AVG', label: '打率', value: (p) => p.stats?.AB > 0 ? p.stats.H / p.stats.AB : null, render: (p) => p.stats.AB > 0 ? fmtAvg(p.stats.H, p.stats.AB) : '---' },
  {
    key: 'OPS',
    label: 'OPS',
    value: (p, sb) => p.stats?.PA > 0 ? sb.OPS : null,
    render: (p, sb) => sb.OPS > 0 ? sb.OPS.toFixed(3) : '---',
    color: (p, sb) => sb.OPS >= .850 ? '#34d399' : sb.OPS >= .700 ? '#f5c842' : undefined,
  },
  { key: 'HR', label: '本塁打', value: (p) => Number(p.stats?.HR) || 0, render: (p) => p.stats.HR },
  { key: 'RBI', label: '打点', value: (p) => Number(p.stats?.RBI) || 0, render: (p) => p.stats.RBI },
  {
    key: 'WAR',
    label: 'WAR',
    value: (p, sb) => sb.WAR,
    render: (p, sb) => sb.WAR ?? '---',
    color: (p, sb) => sb.WAR >= 4 ? '#34d399' : sb.WAR >= 2 ? '#f5c842' : sb.WAR < 0 ? '#f87171' : undefined,
  },
  { key: 'wOBA', label: 'wOBA', advanced: true, value: (p, sb) => p.stats?.PA > 0 ? sb.wOBA : null, render: (p, sb) => sb.wOBA > 0 ? sb.wOBA.toFixed(3) : '---' },
  {
    key: 'wRCp',
    label: 'wRC+',
    advanced: true,
    value: (p, sb) => p.stats?.PA > 0 ? sb.wRCp : null,
    render: (p, sb) => p.stats?.PA > 0 ? sb.wRCp : '---',
    color: (p, sb) => sb.wRCp >= 130 ? '#34d399' : sb.wRCp >= 100 ? '#f5c842' : p.stats?.PA > 0 ? '#f87171' : undefined,
  },
  { key: 'ISO', label: 'ISO', advanced: true, value: (p, sb) => p.stats?.AB > 0 ? sb.ISO : null, render: (p, sb) => p.stats?.AB > 0 ? sb.ISO.toFixed(3) : '---' },
  { key: 'BABIP', label: 'BABIP', advanced: true, value: (p, sb) => p.stats?.AB > 0 ? sb.BABIP : null, render: (p, sb) => p.stats?.AB > 0 ? sb.BABIP.toFixed(3) : '---' },
  { key: 'BBpct', label: '四球率', advanced: true, value: (p, sb) => p.stats?.PA > 0 ? sb.BBpct : null, render: (p, sb) => p.stats?.PA > 0 ? fmtPct(sb.BBpct) : '---' },
  {
    key: 'Kpct',
    label: '三振率',
    advanced: true,
    value: (p, sb) => p.stats?.PA > 0 ? sb.Kpct : null,
    render: (p, sb) => p.stats?.PA > 0 ? fmtPct(sb.Kpct) : '---',
    color: (p, sb) => sb.Kpct > .25 ? '#f87171' : sb.Kpct > 0 && sb.Kpct < .15 ? '#34d399' : undefined,
  },
  {
    key: 'EVavg',
    label: '打球速度',
    advanced: true,
    value: (p, sb) => sb.EVavg > 0 ? sb.EVavg : null,
    render: (p, sb) => sb.EVavg > 0 ? sb.EVavg.toFixed(1) : '---',
    color: (p, sb) => sb.EVavg >= 145 ? '#34d399' : sb.EVavg >= 130 ? '#f5c842' : undefined,
  },
  { key: 'LAavg', label: '打球角度', advanced: true, value: (p, sb) => p.stats?.laN > 0 ? sb.LAavg : null, render: (p, sb) => p.stats?.laN > 0 ? sb.LAavg.toFixed(1) : '---' },
  { key: 'SB', label: '盗塁', advanced: true, value: (p) => Number(p.stats?.SB) || 0, render: (p) => p.stats.SB },
];

const ROLE_ORDER = ['先発', '中継ぎ', 'セットアッパー', '抑え'];

const PITCHER_COLUMNS = [
  {
    key: 'role',
    label: '役割',
    value: (p) => {
      const index = ROLE_ORDER.findIndex((role) => String(p.subtype || '').includes(role));
      return index >= 0 ? index : ROLE_ORDER.length;
    },
    render: (p) => p.subtype,
    className: 'text-cell',
  },
  { key: 'W', label: '勝', value: (p) => Number(p.stats?.W) || 0, render: (p) => p.stats.W, color: () => '#34d399' },
  { key: 'L', label: '敗', value: (p) => Number(p.stats?.L) || 0, render: (p) => p.stats.L },
  { key: 'ERA', label: '防御率', value: (p, sp) => p.stats?.IP > 0 ? sp.ERA : null, render: (p, sp) => p.stats?.IP > 0 ? sp.ERA.toFixed(2) : '---', color: (p, sp) => sp.ERA > 0 && sp.ERA < 3 ? '#34d399' : sp.ERA < 4 ? '#f5c842' : p.stats?.IP > 0 ? '#f87171' : undefined },
  { key: 'IP', label: '投球回', value: (p) => p.stats?.IP > 0 ? inningsToOuts(p.stats.IP) : null, render: (p) => p.stats?.IP > 0 ? fmtIP(p.stats.IP) : '---' },
  { key: 'Kp', label: '奪三振', value: (p) => Number(p.stats?.Kp) || 0, render: (p) => p.stats.Kp },
  { key: 'WHIP', label: 'WHIP', value: (p, sp) => p.stats?.IP > 0 ? sp.WHIP : null, render: (p, sp) => p.stats?.IP > 0 ? sp.WHIP.toFixed(2) : '---' },
  { key: 'WAR', label: 'WAR', value: (p, sp) => p.stats?.IP > 0 ? sp.WAR : null, render: (p, sp) => p.stats?.IP > 0 ? sp.WAR : '---' },
  { key: 'SV', label: 'S', advanced: true, value: (p) => Number(p.stats?.SV) || 0, render: (p) => p.stats.SV },
  { key: 'HLD', label: 'H', advanced: true, value: (p) => Number(p.stats?.HLD) || 0, render: (p) => p.stats.HLD },
  { key: 'QS', label: 'QS', advanced: true, value: (p) => Number(p.stats?.QS) || 0, render: (p) => p.stats.QS },
  { key: 'FIP', label: 'FIP', advanced: true, value: (p, sp) => p.stats?.IP > 0 ? sp.FIP : null, render: (p, sp) => p.stats?.IP > 0 ? sp.FIP : '---' },
  { key: 'xFIP', label: 'xFIP', advanced: true, value: (p, sp) => p.stats?.IP > 0 ? sp.xFIP : null, render: (p, sp) => p.stats?.IP > 0 ? sp.xFIP : '---' },
  { key: 'Kpct', label: '三振率', advanced: true, value: (p, sp) => p.stats?.BF > 0 ? sp.Kpct : null, render: (p, sp) => p.stats?.BF > 0 ? fmtPct(sp.Kpct) : '---' },
  { key: 'BBpct', label: '四球率', advanced: true, value: (p, sp) => p.stats?.BF > 0 ? sp.BBpct : null, render: (p, sp) => p.stats?.BF > 0 ? fmtPct(sp.BBpct) : '---' },
];

function metricsFor(player, isPitcher) {
  return isPitcher ? saberPitcher(player.stats || {}) : saberBatter(player.stats || {});
}

function InteractivePlayerRow({
  player,
  teamName,
  isPitcher,
  columns,
  onOpen,
  onToggleCompare,
  isCompared,
}) {
  const metrics = metricsFor(player, isPitcher);
  const open = () => onOpen?.(player, teamName, isPitcher ? 'stats' : 'battedBall');
  return (
    <tr
      className="interactive-player-row"
      tabIndex={0}
      onClick={open}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          open();
        }
      }}
      aria-label={`${player.name}の${isPitcher ? '成績' : '打球分析'}を開く`}
    >
      <td className="stats-player-cell">
        <span>{player.name}</span>
        {isPitcher && <HandBadge p={player}/>}
      </td>
      {onToggleCompare && (
        <td className="stats-compare-cell">
          <button
            type="button"
            className={isCompared ? 'compare-add-button on' : 'compare-add-button'}
            onClick={(event) => {
              event.stopPropagation();
              onToggleCompare(player, teamName);
            }}
            aria-label={`${player.name}を比較${isCompared ? 'から外す' : 'へ追加'}`}
          >
            {isCompared ? '比較中' : '＋比較'}
          </button>
        </td>
      )}
      {columns.map((column) => (
        <td
          key={column.key}
          className={column.className || 'mono'}
          style={{ color: column.color?.(player, metrics) }}
        >
          {column.render(player, metrics)}
        </td>
      ))}
    </tr>
  );
}

function StatsTable({
  title,
  defaultSortLabel,
  players,
  teamName,
  isPitcher,
  showAdvanced,
  openTip,
  onOpenTip,
  onPlayerClick,
  sortState,
  onSort,
  onToggleCompare,
  comparePlayerIds,
}) {
  const allColumns = isPitcher ? PITCHER_COLUMNS : BATTER_COLUMNS;
  const columns = showAdvanced ? allColumns : allColumns.filter((column) => !column.advanced);
  const sortedPlayers = useMemo(() => {
    if (!sortState?.key || !sortState?.direction) return players;
    if (sortState.key === 'name') return stableSort(players, (player) => player.name, sortState.direction);
    const column = allColumns.find((item) => item.key === sortState.key);
    if (!column) return players;
    return stableSort(
      players,
      (player) => column.value(player, metricsFor(player, isPitcher)),
      sortState.direction,
    );
  }, [allColumns, isPitcher, players, sortState]);
  const sortLabel = sortState?.key
    ? `${sortState.key === 'name' ? '選手名' : allColumns.find((column) => column.key === sortState.key)?.label} ${sortState.direction === 'asc' ? '昇順' : '降順'}`
    : `初期順（${defaultSortLabel}）`;

  return (
    <div className="card">
      <div className="stats-table-heading">
        <div>
          <div className="card-h">{title}</div>
          <div className="stats-sort-label">{sortLabel} · 見出しを押すと降順→昇順→初期順</div>
        </div>
      </div>
      <div className="stats-table-wrap">
        <table className="tbl stats-table">
          <thead>
            <tr>
              <ThCell
                label="選手"
                sortDirection={sortState?.key === 'name' ? sortState.direction : null}
                onSort={() => onSort('name')}
              />
              {onToggleCompare && <th className="stats-compare-cell">比較</th>}
              {columns.map((column) => (
                <ThCell
                  key={column.key}
                  label={column.label}
                  openLabel={openTip}
                  onOpen={onOpenTip}
                  sortDirection={sortState?.key === column.key ? sortState.direction : null}
                  onSort={() => onSort(column.key)}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedPlayers.map((player) => (
              <InteractivePlayerRow
                key={player.id}
                player={player}
                teamName={teamName}
                isPitcher={isPitcher}
                columns={columns}
                onOpen={onPlayerClick}
                onToggleCompare={onToggleCompare}
                isCompared={comparePlayerIds?.includes(player.id)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function nextSortState(current, key) {
  if (current?.key !== key || !current?.direction) return { key, direction: 'desc' };
  if (current.direction === 'desc') return { key, direction: 'asc' };
  return { key: null, direction: null };
}

export function StatsTab({
  teams,
  myId,
  onPlayerClick,
  onToggleCompare,
  comparePlayerIds = [],
}) {
  const [view, setView] = useState('batter');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [openTip, setOpenTip] = useState(null);
  const [sortByView, setSortByView] = useState({
    batter: { key: null, direction: null },
    pitcher: { key: null, direction: null },
  });
  const myTeam = teams.find((team) => team.id === myId);

  const batters = useMemo(
    () => [...(myTeam?.players || [])]
      .filter((player) => !player.isPitcher)
      .sort((a, b) => saberBatter(b.stats).OPS - saberBatter(a.stats).OPS),
    [myTeam?.players],
  );
  const pitchers = useMemo(
    () => [...(myTeam?.players || [])]
      .filter((player) => player.isPitcher)
      .sort((a, b) => {
        const aEra = a.stats?.IP > 0 ? saberPitcher(a.stats).ERA : Number.POSITIVE_INFINITY;
        const bEra = b.stats?.IP > 0 ? saberPitcher(b.stats).ERA : Number.POSITIVE_INFINITY;
        return aEra - bEra;
      }),
    [myTeam?.players],
  );

  if (!myTeam) return <div className="card">球団データを読み込めません。</div>;

  const handleSort = (key) => {
    setSortByView((current) => ({
      ...current,
      [view]: nextSortState(current[view], key),
    }));
  };

  return (
    <div>
      <div className="stats-toolbar">
        <div className="tabs" role="tablist" aria-label="成績種別">
          {[['batter', '🏏 打者'], ['pitcher', '⚾ 投手']].map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={view === key}
              onClick={() => setView(key)}
              className={`tab ${view === key ? 'on' : ''}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="stats-column-toggle" aria-label="表示する指標">
          <button className={!showAdvanced ? 'on' : ''} onClick={() => setShowAdvanced(false)}>主要指標</button>
          <button className={showAdvanced ? 'on' : ''} onClick={() => setShowAdvanced(true)}>詳細指標</button>
        </div>
      </div>

      {view === 'batter' ? (
        <StatsTable
          title="打者成績"
          defaultSortLabel="OPS降順"
          players={batters}
          teamName={myTeam.name}
          isPitcher={false}
          showAdvanced={showAdvanced}
          openTip={openTip}
          onOpenTip={setOpenTip}
          onPlayerClick={onPlayerClick}
          sortState={sortByView.batter}
          onSort={handleSort}
          onToggleCompare={onToggleCompare}
          comparePlayerIds={comparePlayerIds}
        />
      ) : (
        <StatsTable
          title="投手成績"
          defaultSortLabel="防御率昇順"
          players={pitchers}
          teamName={myTeam.name}
          isPitcher
          showAdvanced={showAdvanced}
          openTip={openTip}
          onOpenTip={setOpenTip}
          onPlayerClick={onPlayerClick}
          sortState={sortByView.pitcher}
          onSort={handleSort}
          onToggleCompare={onToggleCompare}
          comparePlayerIds={comparePlayerIds}
        />
      )}
    </div>
  );
}
