import { FarmRecordScope, FarmRecordSummary } from './FarmRecordSummary';
import React, { useState } from 'react';
import { CaretRight, ArrowLeft } from '@phosphor-icons/react';
import { playerCondition, getDashboardLineup } from './DashboardTab';
import { Button, DataTableFrame, MetricBand } from './design-system/primitives';
import { ownedPlayers } from '../engine/renewalRules';
import { fmtAvg } from '../utils';
import './roster-overview.css';

export function MobileRoster({ farmState, team, onPlayerClick, onReplaceLineup, onSetLineupOrder, onSetRosterDhMode, onOpenFarmSettings }) {
  const [view, setView] = useState('batters');
  const [metric, setMetric] = useState('condition');
  const [replaceId, setReplaceId] = useState(null);
  const lineup = getDashboardLineup(team);
  const target = lineup.find(entry => entry.player.id === replaceId);
  const candidates = (team.players || []).filter(p => !p.isPitcher && !(team.lineup || []).includes(p.id));
  const pitchers = (team.players || []).filter(p => p.isPitcher);
  const conditionInfo = p => (p.injuryDaysLeft || 0) > 0 ? `負傷中 · 残${p.injuryDaysLeft}試合`
    : Number.isFinite(p.condition) ? `${playerCondition(p).label} · ${p.condition}` : '状態未記録';
  const firstTeamAvg = p => {
    if (!Number.isFinite(p.stats?.AB) || p.stats.AB <= 0 || !Number.isFinite(p.stats?.H)) return '—';
    const value = fmtAvg(p.stats.H, p.stats.AB);
    // fmtAvg encodes rounded thousandths after '.', including '.1000' at 1.000.
    return (Number(value.slice(1)) / 1000).toFixed(3);
  };
  const rowInfo = p => metric === 'ability' ? `ミート ${p.batting?.contact ?? '—'} / 長打 ${p.batting?.power ?? '—'}`
    : metric === 'stats' ? `打率 ${firstTeamAvg(p)} / HR ${p.stats?.HR ?? '—'}`
      : conditionInfo(p);
  const choose = p => {
    if (!target || (p.injuryDaysLeft || 0) > 0) return;
    onReplaceLineup(lineup.map(entry => ({ id: entry.player.id === replaceId ? p.id : entry.player.id, pos: entry.position })));
    setReplaceId(null);
  };
  const playerName = (p, mobileInfo) => <button className="roster-player" type="button" onClick={() => onPlayerClick?.(p, team.name)}>
    <span>{p.name}<CaretRight size={16} aria-hidden="true" /></span>
    {(p.injuryDaysLeft || 0) > 0 && <small>負傷中</small>}
    {mobileInfo && <small className="roster-mobile-info">{mobileInfo}</small>}
  </button>;
  const injuredCount = ownedPlayers(team).filter(p => (p.injuryDaysLeft || 0) > 0).length;
  return <section className="mobile-roster flow-screen roster-overview" data-ds="roster-overview" aria-label="編成一覧">
    <header className="roster-heading"><p>{team.name}{farmState?.year && ` / ${farmState.year}年`}</p><h1>編成</h1><p>所属・役割・状態を確認して、次戦の起用を見直す。</p></header>
    <MetricBand className="roster-summary" items={[
      { label: '一軍登録', value: (team.players || []).length, unit: '人' },
      { label: '二軍（育成含む）', value: (team.farm || []).length, unit: '人' },
      { label: '負傷（全所属）', value: injuredCount, unit: '人' },
    ]} />
    <div className="roster-tabs" role="group" aria-label="編成対象">{[['batters', '野手'], ['pitchers', '投手'], ['farm', '二軍']].map(([id, label]) => <button key={id} type="button" aria-pressed={view === id} onClick={() => { setView(id); setReplaceId(null); }}>{label}</button>)}</div>
    {target ? <section>
      <button className="roster-back" type="button" onClick={() => setReplaceId(null)}><ArrowLeft aria-hidden="true" />打線に戻る</button>
      <h2>{target.player.name}の入替候補</h2>
      <p className="roster-note">{target.order}番・{target.position}の守備を引き継ぎます。選手詳細で適性を確認してください。</p>
      <DataTableFrame label="一軍野手の入替候補"><table className="roster-candidates-table"><thead><tr><th scope="col">選手</th><th scope="col">守備・指標</th><th scope="col">操作</th></tr></thead><tbody>
        {candidates.map(p => <tr key={p.id}><td>{playerName(p, `${p.pos} · ${rowInfo(p)}`)}</td><td>{p.pos} · {rowInfo(p)}</td><td><Button variant="secondary" disabled={(p.injuryDaysLeft || 0) > 0} onClick={() => choose(p)}>起用</Button></td></tr>)}
      </tbody></table></DataTableFrame>
      {!candidates.length && <p className="roster-note">控え野手はいません</p>}
    </section> : view === 'farm' ? <>
      <h2>二軍（{team.farm?.length ?? 0}人）</h2>
      <FarmRecordScope state={farmState} teamId={team.id} />
      <p className="roster-note">昇降格・育成目標の変更は詳細設定から行えます。一軍成績とは別の記録です。</p>
      {onOpenFarmSettings && <Button variant="secondary" onClick={onOpenFarmSettings}>二軍の育成・起用設定へ</Button>}
      <DataTableFrame label="二軍所属選手と実測記録"><table className="roster-farm-table"><thead><tr><th scope="col">選手</th><th scope="col">所属・役割</th><th scope="col">状態</th><th scope="col">二軍実測</th></tr></thead><tbody>
        {(team.farm || []).map(p => <tr key={p.id}><td>{playerName(p, `${p.育成 ? '育成' : '二軍支配下'} · ${p.isPitcher ? p.subtype || '投手' : p.pos} · ${conditionInfo(p)}${(p.registrationCooldownDays || 0) > 0 ? ` · 再登録まで${p.registrationCooldownDays}日` : ''}`)}</td><td><strong>{p.育成 ? '育成' : '二軍支配下'}</strong><small>{p.isPitcher ? p.subtype || '投手' : p.pos}</small></td><td>
          {conditionInfo(p)}{(p.registrationCooldownDays || 0) > 0 && <small>再登録まで{p.registrationCooldownDays}日</small>}
        </td><td><FarmRecordSummary state={farmState} player={p} compact /></td></tr>)}
      </tbody></table></DataTableFrame>
      {!team.farm?.length && <p className="roster-note">二軍選手はいません。</p>}
    </> : view === 'batters' ? <>
      <div className="roster-toolbar"><h2>一軍の打線</h2><div className="roster-tabs roster-metrics" role="group" aria-label="野手の表示指標">
        {[['ability', '能力'], ['stats', '成績'], ['condition', '状態']].map(([id, label]) => <button key={id} type="button" aria-pressed={metric === id} onClick={() => setMetric(id)}>{label}</button>)}
      </div></div>
      <label className="roster-check"><input type="checkbox" checked={Boolean(team.rosterDhMode ?? team.dhEnabled)} onChange={e => onSetRosterDhMode?.(e.target.checked)} />DHあり</label>
      {metric === 'stats' && <p className="roster-note">今季の一軍成績。—は未記録・分母不足、0は記録済み。</p>}
      <DataTableFrame label="一軍の打線と起用設定" stickyColumn={2}><table className="roster-lineup-table"><thead><tr><th scope="col">打順</th><th scope="col">選手</th><th scope="col">守備</th><th scope="col">{metric === 'stats' ? '今季一軍成績' : metric === 'ability' ? '能力' : '状態'}</th><th scope="col">操作</th></tr></thead><tbody>
        {lineup.map(({ player: p, order, position }) => <tr key={p.id}><td><select aria-label={`${p.name}の打順`} value={order} onChange={e => onSetLineupOrder?.(p.id, Number(e.target.value))}>{lineup.map(entry => <option key={entry.order} value={entry.order}>{entry.order}番</option>)}</select></td>
          <td>{playerName(p, `${position} · ${rowInfo(p)}`)}</td><td>{position}</td><td data-number={metric !== 'condition' || undefined}>{rowInfo(p)}</td><td><Button variant="secondary" onClick={() => setReplaceId(p.id)}>入替</Button></td></tr>)}
      </tbody></table></DataTableFrame>
      {!lineup.length && <p className="roster-note">打線が未設定です。下の「詳細な編成・育成設定」から設定してください。</p>}
      {!(team.rosterDhMode ?? team.dhEnabled) && <p className="roster-note">9番は当日の先発投手です。</p>}
    </> : <>
      <h2>一軍の投手・継投</h2><p className="roster-note">ローテーション・救援の役割変更は下の詳細設定から行えます。</p>
      <DataTableFrame label="一軍投手の役割と状態"><table className="roster-pitcher-table"><thead><tr><th scope="col">選手</th><th scope="col">役割</th><th scope="col">状態</th></tr></thead><tbody>
        {pitchers.map(p => <tr key={p.id}><td>{playerName(p)}</td><td>{(team.rotation || []).includes(p.id) ? `先発 ${(team.rotation || []).indexOf(p.id) + 1}番手` : p.subtype || '救援'}</td><td>{conditionInfo(p)}</td></tr>)}
      </tbody></table></DataTableFrame>
      {pitchers.length === 0 && <p className="roster-note">一軍投手はいません。</p>}
    </>}
  </section>;
}
