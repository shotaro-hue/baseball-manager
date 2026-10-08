import React, { useState } from 'react';
import { Play, CaretRight } from '@phosphor-icons/react';
import { getMyMatchup } from '../engine/scheduleLookup';
import { gameDayToDate } from '../utils';
import HubSimPanel from './hub/HubSimPanel';
import { regularSeasonProgress } from '../engine/seasonProgress';

export function MobileHome({ myTeam, teams = [], schedule, gameDay, year, recentResults = [], onTabSwitch, onStartGame, onBatchSim, onSeasonSim, batchProgress, canSim = false }) {
  const [showSim, setShowSim] = useState(false);
  if (!myTeam) return null;
  const ranked = teams.filter(t => t.league === myTeam.league).sort((a,b) =>
    (b.wins || 0) / Math.max(1,(b.wins || 0)+(b.losses || 0)) - (a.wins || 0) / Math.max(1,(a.wins || 0)+(a.losses || 0))
    || ((b.rf || 0)-(b.ra || 0))-((a.rf || 0)-(a.ra || 0)));
  const rank = ranked.findIndex(t => t.id === myTeam.id) + 1;
  const leader = ranked[0];
  const gap = leader ? (((leader.wins || 0)-(myTeam.wins || 0)) + ((myTeam.losses || 0)-(leader.losses || 0)))/2 : null;
  const matchup = schedule && getMyMatchup(schedule,gameDay,myTeam.id);
  const opponent = teams.find(t => t.id === matchup?.oppId);
  const date = gameDayToDate(gameDay,schedule);
  const unavailable = !canSim || Boolean(batchProgress);
  const recent = [...recentResults].sort((a,b)=>(b.gameNo ?? 0)-(a.gameNo ?? 0));
  const tired = (myTeam.players || []).filter(p => (p.injuryDaysLeft || 0)>0 || (p.condition ?? 70)<60);
  const expiring = (myTeam.players || []).filter(p => (p.contractYearsLeft ?? 99)<=1);
  return <main className="mobile-home flow-screen">
    <h1>ホーム</h1>
    <dl className="flow-metrics"><div><dt>順位</dt><dd>{rank || '—'}<small>位</small></dd></div><div><dt>戦績</dt><dd>{myTeam.wins || 0}<small>勝</small>{myTeam.losses || 0}<small>敗</small></dd></div><div><dt>首位まで</dt><dd>{gap == null ? '—' : gap.toFixed(1)}<small>差</small></dd></div></dl>
    <div className="flow-recent"><span>直近5試合（新しい順）</span>{recent.slice(0,5).map((r,i) => <span key={i} className={`flow-outcome ${r.drew ? 'draw' : r.won ? 'win' : 'loss'}`}>{r.drew ? '分' : r.won ? '勝' : '敗'}</span>)}{!recentResults.length && <span>まだ試合がありません</span>}</div>
    <section className="flow-fixture"><h2>次の対戦</h2><div className="flow-matchup"><strong>{myTeam.short || myTeam.name}</strong><span>VS</span><strong>{opponent?.short || opponent?.name || '未定'}</strong></div>
      <p>{date ? `${year}年${date.month}月${date.day}日` : '日程なし'} · {matchup ? matchup.isHome ? 'ホーム' : 'アウェー' : '対戦予定なし'}</p>
      <button className="calm-primary calm-wide" disabled={unavailable} aria-expanded={showSim || Boolean(batchProgress)} onClick={() => setShowSim(v=>!v)}><Play size={20}/>まとめて進める</button>
      {(showSim || batchProgress) && <div className="flow-sim"><HubSimPanel gameDay={gameDay} schedule={schedule} remain={regularSeasonProgress(myTeam).remainingGames} canSim={canSim} batchProgress={batchProgress} onStartGame={onStartGame} onBatchSim={onBatchSim} onSeasonSim={onSeasonSim}/></div>}
      {batchProgress && <p role="status">{batchProgress.phase || 'シミュレーション中'} · {batchProgress.current}/{batchProgress.total}</p>}
      <button className="flow-link" disabled={unavailable || !opponent} onClick={onStartGame}>1試合ずつ采配<CaretRight size={18}/></button>
    </section>
    <section className="flow-section"><h2>要確認</h2>{tired.length ? <button className="flow-row" onClick={()=>onTabSwitch('roster')}><span>疲労・負傷のある選手<strong>{tired.length}人</strong></span><CaretRight/></button> : <p className="flow-muted">疲労・負傷のアラートはありません</p>}
      {expiring.length>0 && <button className="flow-row" onClick={()=>onTabSwitch('contract')}><span>契約満了予定<strong>{expiring.length}人</strong></span><CaretRight/></button>}
    </section>
    <section className="flow-section"><h2>直近の結果</h2>{recent.slice(0,3).map((r,i)=><button className="flow-row" key={i} onClick={()=>onTabSwitch('schedule')}><span>{r.oppTeam?.short || r.oppTeam?.name || r.oppName || '試合結果'}</span><strong>{r.score ? `${r.score.my} − ${r.score.opp}` : r.myScore != null ? `${r.myScore} − ${r.oppScore}` : r.drew ? '引分' : r.won ? '勝利' : '敗戦'}</strong><CaretRight/></button>)}<button className="flow-link" onClick={()=>onTabSwitch('schedule')}>日程・結果をすべて見る<CaretRight/></button></section>
  </main>;
}
