import { useId, useMemo, useRef, useState } from 'react';
import { stableSort } from '../../engine/analysisComparison';
import { seasonParticipants } from '../../engine/seasonParticipants';
import { HandBadge, STAT_TIPS } from '../ui';
import { Button, DataTableFrame } from '../design-system/primitives';
import { BATTER_COLUMNS, PITCHER_COLUMNS } from '../firstTeamStatsMetrics';
import { firstTeamScope, detailNumber } from '../playerDetailMetrics';
import { FarmRankings } from '../FarmRankings';
import '../first-team-stats.css';

function InteractivePlayerRow({
  player,
  teamName,
  isPitcher,
  columns,
  onOpen,
  onToggleCompare,
  isCompared,
  membership,
}) {
  const open = () => onOpen?.(player, teamName, isPitcher ? 'stats' : 'battedBall');
  return (
    <tr
      className="interactive-player-row"
      data-compared={isCompared || undefined}
      onClick={open}
      onKeyDown={(event) => {
        if ((!event.target || event.target === event.currentTarget) && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          open();
        }
      }}
      aria-label={`${player.name}の${isPitcher ? '成績' : '打球分析'}を開く`}
    >
      <td className="stats-player-cell">
        <button type="button" className="stats-player-button" onClick={event => { event.stopPropagation(); open(); }}>
          <strong>{player.name}</strong>
          <span>{player.pos || player.subtype || '役割未記録'} · {membership}{isPitcher && <HandBadge p={player}/>}</span>
          <span>状態 {detailNumber(player.condition)}{(player.injuryDaysLeft ?? 0) > 0 && ` · 負傷中 残${player.injuryDaysLeft}試合`}</span>
        </button>
      </td>
      {columns.map((column) => (
        <td
          key={column.key}
          className={column.className || 'mono'}
          data-number={column.key !== 'role' || undefined}
          data-metric={column.key}
        >
          {column.render(player)}
        </td>
      ))}
      {onToggleCompare && (
        <td className="stats-compare-cell">
          <Button
            variant="secondary"
            aria-pressed={Boolean(isCompared)}
            className={isCompared ? 'compare-add-button on' : 'compare-add-button'}
            onClick={(event) => {
              event.stopPropagation();
              onToggleCompare(player, teamName);
            }}
            aria-label={`${player.name}を比較${isCompared ? 'から外す' : 'へ追加'}`}
          >
            {isCompared ? '比較中' : '＋比較'}
          </Button>
        </td>
      )}
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
  team,
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
      (player) => column.value(player),
      sortState.direction,
    );
  }, [allColumns, isPitcher, players, sortState]);
  const sortLabel = sortState?.key
    ? `${sortState.key === 'name' ? '選手名' : allColumns.find((column) => column.key === sortState.key)?.label} ${sortState.direction === 'asc' ? '昇順' : '降順'}`
    : `初期順（${defaultSortLabel}）`;

  const header = (key, label) => <th key={key} scope="col" aria-sort={sortState?.key === key ? sortState.direction === 'asc' ? 'ascending' : 'descending' : undefined}>
    <div className="stats-header-actions">
      <button type="button" className="table-sort-button" aria-label={`${label}でソート`} onClick={() => onSort(key)}>
        {label}{sortState?.key === key && <span aria-hidden="true">{sortState.direction === 'asc' ? ' ▲' : ' ▼'}</span>}
      </button>
      {STAT_TIPS[label] && <button type="button" className="table-tip-button" aria-label={`${label}の説明`} aria-expanded={openTip === label} onClick={event => onOpenTip(openTip === label ? null : label,event.currentTarget)}>ⓘ</button>}
    </div>
  </th>;
  return (
    <div className="card">
      <div className="stats-table-heading">
        <div>
          <h2 className="card-h"><span>{title}</span> · {sortedPlayers.length}人</h2>
          <div className="stats-sort-label">{sortLabel} · 見出しを押すと降順→昇順→初期順</div>
        </div>
      </div>
      {openTip && STAT_TIPS[openTip] && <div className="stats-metric-note" role="status"><strong>{openTip} · {STAT_TIPS[openTip].en}</strong><span>{STAT_TIPS[openTip].desc}</span><Button variant="secondary" onClick={() => onOpenTip(null)} aria-label="指標の説明を閉じる">閉じる</Button></div>}
      <DataTableFrame className="stats-table-wrap" label={`${title}。横にスクロールできます`}>
        <table className="tbl stats-table">
          <thead>
            <tr>
              {header('name','選手')}
              {columns.map(column => header(column.key,column.label))}
              {onToggleCompare && <th className="stats-compare-cell" scope="col">比較</th>}
            </tr>
          </thead>
          <tbody>
            {sortedPlayers.length === 0 && <tr><td colSpan={1 + columns.length + (onToggleCompare ? 1 : 0)}>対象の選手はいません。</td></tr>}
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
                membership={team?.farm?.some(p => p.id === player.id) ? '二軍所属' : '一軍所属'}
              />
            ))}
          </tbody>
        </table>
      </DataTableFrame>
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
  farmState,
  year,
}) {
  const id = useId();
  const [teamId, setTeamId] = useState(null), [membership, setMembership] = useState('all'), [query, setQuery] = useState('');
  const [view, setView] = useState('batter');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [openTip, setOpenTip] = useState(null);
  const tipTrigger = useRef(null);
  const handleTip = (label,trigger) => {
    if (label) tipTrigger.current = trigger;
    else tipTrigger.current?.focus();
    setOpenTip(label);
  };
  const [sortByView, setSortByView] = useState({
    batter: { key: null, direction: null },
    pitcher: { key: null, direction: null },
  });
  const myTeam = teams.find(team => String(team.id) === String(teamId ?? myId));
  const participants = useMemo(() => seasonParticipants(myTeam || {}).filter(p => {
    const inFarm = myTeam?.farm?.some(f => f.id === p.id);
    return (membership === 'all' || (membership === 'farm' ? inFarm : !inFarm)) && String(p.name || '').includes(query.trim());
  }), [myTeam, membership, query]);
  const batters = useMemo(() => stableSort(participants.filter(p => !p.isPitcher), p => BATTER_COLUMNS.find(c => c.key === 'OPS').value(p), 'desc'), [participants]);
  const pitchers = useMemo(() => stableSort(participants.filter(p => p.isPitcher), p => PITCHER_COLUMNS.find(c => c.key === 'ERA').value(p), 'asc'), [participants]);
  const setTab = key => { setView(key); setOpenTip(null); };
  const tabKeys = ['batter','pitcher','farm'];
  const onTabKey = (event,key) => {
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault();
    const i = tabKeys.indexOf(key), next = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (i + (event.key === 'ArrowRight' ? 1 : -1) + 3) % 3;
    setTab(tabKeys[next]); document.getElementById(`${id}-${tabKeys[next]}`)?.focus();
  };
  if (!myTeam) return <div className="card">球団データを読み込めません。</div>;

  const handleSort = (key) => {
    setSortByView((current) => ({
      ...current,
      [view]: nextSortState(current[view], key),
    }));
  };

  return (
    <section className={`calm-detail detail-stats ${view === 'farm' ? '' : 'first-team-stats'}`} data-ds={view === 'farm' ? undefined : 'first-team-stats'} aria-label="球団成績" onKeyDown={event => { if (event.key === 'Escape' && openTip) handleTip(null); }}>
      <header className="first-team-heading">
        <h1>{view === 'farm' ? '二軍成績' : '一軍成績'}</h1>
        <p>{view === 'farm' ? '二軍実測ランキング・年度別記録' : `${firstTeamScope(year ?? farmState?.year)} · ${myTeam.name}`}</p>
      </header>
      {view !== 'farm' && <p className="stats-scope-note">二軍所属の一軍出場者も含みます。二軍実測・旧推定は合算しません。</p>}
      <div className="stats-toolbar">
        <div className="tabs" role="tablist" aria-label="成績種別">
          {[['batter', '打者'], ['pitcher', '投手'], ['farm', '二軍']].map(([key, label]) => (
            <button
              key={key}
              role="tab"
              id={`${id}-${key}`}
              tabIndex={view === key ? 0 : -1}
              aria-controls={`${id}-panel`}
              onKeyDown={event => onTabKey(event,key)}
              aria-selected={view === key}
              onClick={() => setTab(key)}
              className={`tab ${view === key ? 'on' : ''}`}
            >
              {label}
            </button>
          ))}
        </div>
        {view!=='farm'&&<div className="stats-column-toggle" aria-label="表示する指標">
          <button aria-pressed={!showAdvanced} className={!showAdvanced ? 'on' : ''} onClick={() => setShowAdvanced(false)}>主要指標</button>
          <button aria-pressed={showAdvanced} className={showAdvanced ? 'on' : ''} onClick={() => setShowAdvanced(true)}>詳細指標</button>
        </div>}
      </div>

      {view !== 'farm' && <details className="stats-filter-disclosure"><summary>絞り込み・検索{(teamId != null || membership !== 'all' || query.trim()) && ' · 条件指定中'}</summary><div className="stats-filters">
        <label>球団<select aria-label="成績対象の球団" value={String(myTeam.id)} onChange={event => setTeamId(event.target.value)}>{teams.map(team => <option key={team.id} value={String(team.id)}>{team.name}</option>)}</select></label>
        <label>現在所属<select aria-label="現在の所属で絞り込み" value={membership} onChange={event => setMembership(event.target.value)}><option value="all">一軍記録の対象全員</option><option value="active">一軍所属</option><option value="farm">二軍所属の一軍出場者</option></select></label>
        <label>選手名<input type="search" aria-label="選手名で検索" value={query} onChange={event => setQuery(event.target.value)} /></label>
        <Button variant="secondary" onClick={() => { setTeamId(null); setMembership('all'); setQuery(''); }}>絞り込みを戻す</Button>
      </div></details>}
      {view !== 'farm' && <details className="stats-help"><summary>記録・操作の見方</summary><p className="stats-value-note">実測0は数値、未記録・分母0の算出不可は理由を表示。未記録値はどちらの並び順でも末尾です。選手名から詳細・過年度へ。表は横にスクロールできます。絞り込みや閲覧で編成は変更されません。</p></details>}
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${view}`}>
      {view==='farm'?<FarmRankings state={farmState}/>:view === 'batter' ? (
        <StatsTable
          title="打者成績"
          defaultSortLabel="OPS降順"
          players={batters}
          teamName={myTeam.name}
          team={myTeam}
          isPitcher={false}
          showAdvanced={showAdvanced}
          openTip={openTip}
          onOpenTip={handleTip}
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
          team={myTeam}
          isPitcher
          showAdvanced={showAdvanced}
          openTip={openTip}
          onOpenTip={handleTip}
          onPlayerClick={onPlayerClick}
          sortState={sortByView.pitcher}
          onSort={handleSort}
          onToggleCompare={onToggleCompare}
          comparePlayerIds={comparePlayerIds}
        />
      )}
      </div>
    </section>
  );
}
