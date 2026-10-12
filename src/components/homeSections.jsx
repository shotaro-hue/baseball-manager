import React, { useState } from 'react';
import { CaretRight } from '@phosphor-icons/react';
import { gameDayToDate } from '../utils';
import { getMyMatchup } from '../engine/scheduleLookup';
import { rankLeague } from '../engine/standings';
import { regularSeasonProgress } from '../engine/seasonProgress';
import { Button, MetricBand, Section, StateLabel } from './design-system/primitives';
import HubSimPanel from './hub/HubSimPanel';

const orderedResults = results => [...results].sort((a,b) => (b.gameNo ?? 0)-(a.gameNo ?? 0));
function Outcome({ result }) {
  return <StateLabel tone={result.drew ? 'neutral' : result.won ? 'success' : 'danger'} role="img" aria-label={result.drew ? '引分' : result.won ? '勝利' : '敗戦'}>{result.drew ? '分' : result.won ? '勝' : '敗'}</StateLabel>;
}

export function HomeSummary({ myTeam, teams = [], recentResults = [], rankingContext }) {
  const valid = regularSeasonProgress(myTeam).valid;
  const ranked = rankLeague(teams, myTeam.league, rankingContext).teams;
  const rank = ranked.findIndex(t => t.id === myTeam.id)+1;
  const leader = ranked[0];
  const gap = valid && leader && regularSeasonProgress(leader).valid ? ((leader.wins-myTeam.wins)+(myTeam.losses-leader.losses))/2 : null;
  return <>
    <div className="home-intro"><p>{myTeam.league}・リーグ</p><h1>ホーム</h1><p>戦況を確認して、次の試合へ。</p></div>
    <MetricBand className="home-metrics" items={[
      {label:'リーグ順位',value:valid && rank ? rank : null,unit:'位',state:'unavailable'},
      {label:'戦績（勝−敗−分）',value:valid ? `${myTeam.wins}−${myTeam.losses}−${myTeam.draws ?? 0}` : null,state:'unavailable'},
      {label:'首位まで',value:gap == null ? null : gap.toFixed(1),unit:'差',state:'unavailable'},
    ]}/>
    <div className="home-recent"><span>直近5試合 · 新しい順</span><div>{orderedResults(recentResults).slice(0,5).map((result,index)=><Outcome key={result.gameNo ?? index} result={result}/>)}{!recentResults.length && <span>まだ試合がありません</span>}</div></div>
  </>;
}

export function HomeFixture({ myTeam, teams = [], schedule, gameDay, year, canSim = false, simReason, batchProgress, onStartGame, onBatchSim, onSeasonSim, desktop = false }) {
  const [showSim,setShowSim] = useState(false);
  const matchup = schedule ? getMyMatchup(schedule,gameDay,myTeam.id) : null;
  const opponent = teams.find(team=>team.id===matchup?.oppId);
  // Do not use the formatter's fallback date when there is no scheduled round.
  const date = schedule?.[gameDay] ? gameDayToDate(gameDay,schedule) : null;
  const unavailable = !canSim || !opponent || Boolean(batchProgress);
  const progress = regularSeasonProgress(myTeam);
  const reason = batchProgress ? '試合を進行中です。完了するまでお待ちください。' : simReason || (!canSim ? progress.valid && progress.remainingGames === 0 ? '通常シーズンは終了しています。' : '未実行の対戦日程を確認できません。' : !opponent ? '対戦相手を確認できません。' : null);
  return <section className="home-fixture" aria-label="本日の試合">
    <h2>次の対戦</h2>
    <div className="home-matchup"><strong>{myTeam.short || myTeam.name}</strong><span>VS</span><strong>{opponent?.short || opponent?.name || '未定'}</strong></div>
    <p className="home-caption">{date ? `${year}年${date.month}月${date.day}日 · 第${gameDay}戦` : '日程なし'}{matchup && ` · ${matchup.isHome ? 'ホーム' : 'アウェー'}`}</p>
    <Button className="home-wide" disabled={unavailable} aria-expanded={showSim || Boolean(batchProgress)} onClick={()=>setShowSim(value=>!value)}>まとめて進める</Button>
    <button className="home-link" disabled={unavailable} onClick={onStartGame}>{desktop ? '試合へ進む' : '1試合ずつ采配'}<CaretRight size={18}/></button>
    {desktop && <p className="home-caption">1試合ずつ采配・オートシムを選べます。</p>}
    <details className={desktop ? 'calm-batch home-settings' : 'flow-sim home-settings'} open={showSim || Boolean(batchProgress)} onToggle={event=>setShowSim(event.currentTarget.open)}>
      <summary>進行設定</summary>
      <HubSimPanel gameDay={gameDay} schedule={schedule} remain={progress.remainingGames} canSim={canSim} batchProgress={batchProgress} onStartGame={onStartGame} onBatchSim={onBatchSim} onSeasonSim={onSeasonSim}/>
    </details>
    {reason && <p className="home-reason" role="status">{reason}</p>}
    {batchProgress && <StateLabel tone="processing">{batchProgress.phase || 'シミュレーション中'} · {batchProgress.current}/{batchProgress.total}</StateLabel>}
  </section>;
}

export function HomeAlerts({ myTeam, onTabSwitch }) {
  const tired = (myTeam.players ?? []).filter(player=>(player.injuryDaysLeft ?? 0)>0 || (player.condition ?? 70)<60);
  const expiring = (myTeam.players ?? []).filter(player=>!player.isIkusei && (player.contractYearsLeft ?? 99)<=1);
  return <Section className="home-alerts" title="要確認">
    {tired.length ? <button className="home-row" onClick={()=>onTabSwitch('roster')}><span>疲労・負傷のある選手</span><strong>{tired.length}人</strong><CaretRight size={18}/></button> : <p className="home-caption">疲労・負傷のアラートはありません</p>}
    {expiring.length>0 && <button className="home-row" onClick={()=>onTabSwitch('contract')}><span>契約満了予定</span><strong>{expiring.length}人</strong><CaretRight size={18}/></button>}
    <p className="home-caption">一軍登録選手の状態から集計</p>
    <Button variant="secondary" className="home-wide" onClick={()=>onTabSwitch('roster')}>編成を見直す</Button>
  </Section>;
}

export function HomeResults({ recentResults = [], onTabSwitch }) {
  return <Section className="home-results" title="直近の結果">
    {orderedResults(recentResults).slice(0,3).map((result,index)=><button className="home-row" key={result.gameNo ?? index} onClick={()=>onTabSwitch('schedule')}>
      <Outcome result={result}/><span>{result.oppTeam?.short || result.oppTeam?.name || result.oppName || '試合結果'}</span>
      <strong>{result.score ? `${result.score.my} − ${result.score.opp}` : result.myScore != null ? `${result.myScore} − ${result.oppScore}` : result.drew ? '引分' : result.won ? '勝利' : '敗戦'}</strong><CaretRight size={18}/>
    </button>)}
    {!recentResults.length && <p className="home-caption">まだ試合がありません</p>}
    <button className="home-link" onClick={()=>onTabSwitch('schedule')}>日程・結果をすべて見る<CaretRight size={18}/></button>
  </Section>;
}
