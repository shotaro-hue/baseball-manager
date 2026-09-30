import React, { useState } from 'react';
import { Play, ListChecks, Smiley, SmileyMeh, FirstAid } from '@phosphor-icons/react';
import { gameDayToDate } from '../utils';
import { getMyMatchup } from '../engine/scheduleLookup';
import { buildTeamConditions } from '../engine/analysisComparison';
import { DashboardOverview } from './DashboardOverview';

export function playerCondition(player) {
  if ((player.injuryDaysLeft ?? 0) > 0) return { label: '負傷中', tone: 'injured', Icon: FirstAid };
  const value = player.condition ?? 70;
  return value >= 80 ? { label: '良好', tone: 'good', Icon: Smiley }
    : value >= 60 ? { label: '普通', tone: 'normal', Icon: SmileyMeh }
      : { label: '疲労あり', tone: 'tired', Icon: SmileyMeh };
}

export function getDashboardLineup(team) {
  const fielding = (team.rosterDhMode ?? team.dhEnabled) ? team.fieldingDh : team.fieldingNoDh;
  return (team.lineup ?? []).map((id, index) => {
    const player = (team.players ?? []).find(p => p.id === id);
    return player ? { player, order: index + 1, position: fielding?.[id] ?? player.pos } : null;
  }).filter(Boolean);
}

function Condition({ player }) {
  const { label, tone, Icon } = playerCondition(player);
  return <span className={`calm-condition ${tone}`}><Icon size={22} aria-hidden="true" />{label}</span>;
}

export function DashboardTab({ myTeam, teams = [], schedule, gameDay, year,
  onTabSwitch, onPlayerClick, onStartGame, disableStart = false, recentResults = [], pendingTradeCount = 0, faPool }) {
  const [selectedId, setSelectedId] = useState(null);
  const [detailView, setDetailView] = useState('ability');
  if (!myTeam) return null;
  const lineup = getDashboardLineup(myTeam);
  const batters = (myTeam.players ?? []).filter(p => !p.isPitcher);
  const selected = batters.find(p => p.id === selectedId) ?? lineup[0]?.player ?? batters[0];
  const bench = batters.filter(p => !(myTeam.lineup ?? []).includes(p.id));
  const matchup = schedule ? getMyMatchup(schedule, gameDay, myTeam.id) : null;
  const opponent = teams.find(t => t.id === matchup?.oppId);
  const date = gameDayToDate(gameDay, schedule);
  const conditions = buildTeamConditions(myTeam);
  const expiring = (myTeam.players ?? []).filter(p => !p.isIkusei && (p.contractYearsLeft ?? 99) <= 1).length;
  const stats = selected?.stats ?? {};
  const avg = stats.AB > 0 ? ((stats.H ?? 0) / stats.AB).toFixed(3).replace(/^0/, '') : '—';
  return <main className="calm-dashboard">
    <h1>コンディションを見て、今日のオーダーを。</h1>
    <section className="calm-fixture" aria-label="本日の試合">
      {opponent && date ? <>
        <div className="calm-matchup"><strong>{myTeam.name}</strong><span>VS</span><strong>{opponent.name}</strong></div>
        <p>{matchup.isHome ? 'ホーム' : 'アウェー'} / {year ? `${year}年 ` : ''}{`${date.month}/${date.day} Game ${gameDay}`}</p>
      </> : <p>本日の対戦予定はありません <span lang="en">(No scheduled game)</span></p>}
    </section>
    <div className="calm-workspace">
      <section className="calm-lineup" aria-labelledby="lineup-heading">
        <h2 id="lineup-heading">現在の打線設定</h2>
        <p className="calm-note">試合開始時の自動編成・DH設定により変更される場合があります。</p>
        <div className="calm-table-scroll"><table>
          <thead><tr><th scope="col">打順</th><th scope="col">選手</th><th scope="col">守備</th><th scope="col">体調</th></tr></thead>
          <tbody>{lineup.map(({ player, order, position }) => <tr key={player.id} className={selected?.id === player.id ? 'selected' : ''}>
            <td>{order}</td><td><button type="button" aria-pressed={selected?.id === player.id} onClick={() => setSelectedId(player.id)}>{player.name}</button></td>
            <td>{position}</td><td><Condition player={player} /></td>
          </tr>)}</tbody>
        </table></div>
        {!lineup.length && <p className="calm-empty">打線が未設定です。「オーダーを確認」から設定してください。</p>}
        <div className="calm-bench"><h3>ベンチ野手</h3><div>{bench.map(p => <button type="button" key={p.id} aria-pressed={selected?.id === p.id} onClick={() => setSelectedId(p.id)}>{p.name} <small>{p.pos}</small></button>)}{!bench.length && <p>控え野手はいません</p>}</div></div>
      </section>
      <section className="calm-player" aria-labelledby="player-heading">
        <h2 id="player-heading">選手詳細</h2>
        {selected ? <><div className="calm-player-name"><h3>{selected.name}</h3><p>{selected.pos} / {selected.age ?? '—'}歳</p></div>
          <div className="calm-detail-tabs" aria-label="表示内容">{[['ability', '能力'], ['stats', '成績']].map(([id, label]) => <button type="button" key={id} aria-pressed={detailView === id} onClick={() => setDetailView(id)}>{label}</button>)}</div>
          {detailView === 'ability' ? <div className="calm-abilities">{[['contact', 'ミート'], ['power', 'パワー'], ['speed', '走力']].map(([key, label]) => {
            const value = selected.batting?.[key];
            return <div key={key}><span>{label}</span><strong>{value == null ? '—' : Math.round(value)}</strong>{value != null && <meter aria-label={label} min="0" max="100" value={value} />}</div>;
          })}</div> : <dl className="calm-stats"><div><dt>打率</dt><dd>{avg}</dd></div><div><dt>本塁打</dt><dd>{stats.HR ?? 0}</dd></div><div><dt>打点</dt><dd>{stats.RBI ?? 0}</dd></div></dl>}
          <div className="calm-player-condition"><span>体調</span><Condition player={selected} /><p>体調 {selected.condition ?? 70}/100 · 調子 {Math.round(selected.form ?? 50)}/100</p></div>
          <button type="button" className="calm-secondary calm-wide" onClick={() => onPlayerClick?.(selected, myTeam.name)}>選手詳細を開く</button>
        </> : <p className="calm-empty">表示できる野手がいません</p>}
      </section>
    </div>
    <div className="calm-actions">
      <button type="button" className="calm-secondary" onClick={() => onTabSwitch('roster')}><ListChecks size={22} aria-hidden="true" />オーダーを確認</button>
      <button type="button" className="calm-primary" disabled={!opponent || !date || disableStart} onClick={() => onStartGame ? onStartGame() : onTabSwitch('game_action')}><Play size={22} weight="fill" aria-hidden="true" />試合へ進む</button>
    </div>
    <section className="calm-notices" aria-label="チームの状況とお知らせ"><h2>チームの状況</h2><p>{conditions.map(c => c.label ?? c.text ?? '').filter(Boolean).join(' / ')}</p>
      {expiring > 0 && <button type="button" onClick={() => onTabSwitch('contract')}>契約満了予定 {expiring}人 — 契約を確認</button>}
    </section>
    <details className="calm-overview"><summary>球団概況・おすすめ・注目選手</summary><div className="calm-legacy"><DashboardOverview myTeam={myTeam} teams={teams} schedule={schedule} gameDay={gameDay} recentResults={recentResults} pendingTradeCount={pendingTradeCount} faPool={faPool} onTabSwitch={onTabSwitch} onPlayerClick={onPlayerClick} onStartGame={onStartGame} /></div></details>
  </main>;
}
