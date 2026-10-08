import { useEffect, useRef, useState } from 'react';
import { advancePlayoff, nextPlayoffFixture, PLAYOFF_ORDER, seriesRules } from '../engine/playoff';
import { simulateNextPlayoffGame } from '../engine/playoffGame';

export function PlayoffScreen({ playoff, setPlayoff, teams, setTeams, myId, year, onFinish, onSave, onRoster }) {
  const [simMsg, setSimMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const running = useRef(false), cancelled = useRef(false);
  useEffect(() => () => { cancelled.current = true; }, []);
  const state = advancePlayoff(playoff, year);
  const publish = result => { setTeams(result.teams); setPlayoff(result.playoff); setSimMsg(result.message); };
  const run = async all => {
    if (running.current) return;
    running.current = true; cancelled.current = false; setBusy(true);
    let current = { playoff: state, teams };
    try {
      // Yield between games so progress can be saved and the user can stop.
      for (let n = 0; n < (all ? 40 : 1) && !current.playoff.champion && !cancelled.current; n++) {
        current = simulateNextPlayoffGame(current.playoff, current.teams, year, undefined, { myId });
        publish(current);
        if (all) await new Promise(resolve => setTimeout(resolve, 0));
      }
      if (!cancelled.current && all) setSimMsg(current.playoff.champion
        ? '全試合シミュレーション完了' : '途中まで進めました。続きから再開できます。');
    } catch (error) {
      if (!cancelled.current) setSimMsg(error.message || '試合の計算に失敗しました');
    } finally {
      running.current = false;
      if (!cancelled.current) setBusy(false);
    }
  };
  const renderSeries = key => {
    const s = state[key];
    if (!s) return null;
    const { need, maxGames, kind } = seriesRules(s);
    const active = state.phase === key && !s.done;
    const fixture = !s.done ? nextPlayoffFixture(s, year) : null;
    const home = fixture && s.teams.find(t => t.id === fixture.homeId);
    const draws = s.games.filter(g => g.drew || g.score?.split('-')[0] === g.score?.split('-')[1]).length;
    return <section className="card playoff-series" key={key} aria-label={s.label} data-active={active}>
      <h2>{s.label}</h2>
      <p>{maxGames ? '最大' + maxGames + '試合・' : ''}先に{need}勝{kind !== 'japan' ? '／同勝数ならシーズン上位が進出' : ''}</p>
      {s.specialReason && <p className="playoff-note">2勝アドバンテージの理由：{s.specialReason}</p>}
      <div className="playoff-match">
        {s.teams.map((team, i) => <div key={team.id}>
          <strong>{team.emoji} {team.short || team.name}{team.id === myId ? ' ★' : ''}</strong>
          <div className="playoff-wins">{s.wins[i]}勝</div>
          <span>実際の勝利 {s.wins[i] - (s.adv?.[i] ?? 0)}勝</span>
          {(s.adv?.[i] ?? 0) > 0 && <span>アドバンテージ {s.adv[i]}勝</span>}
          {!s.done && <span>先勝条件まであと{Math.max(0, need - s.wins[i])}勝</span>}
        </div>)}
      </div>
      <p>{s.games.length}試合消化／{draws}引分</p>
      {s.games.length > 0 && <details><summary>試合結果を見る</summary>
        <ol className="playoff-games">{s.games.map((g, i) => {
          const drew = g.drew || g.score?.split('-')[0] === g.score?.split('-')[1];
          const winner = g.winner ?? (g.won0 ? 0 : 1);
          const venue = s.teams.find(t => t.id === g.homeId);
          return <li key={i}><strong>第{i + 1}戦　{g.score}</strong>
            <span>{drew ? '引分' : s.teams[winner].name + ' 勝利'}{venue ? '／' + venue.short + '本拠地' : ''}</span></li>;
        })}</ol>
      </details>}
      {s.done && <p className="playoff-success">{s.teams[s.winner].name} {kind === 'japan' ? '日本一' : '進出決定'}</p>}
      {active && <>
        <p>次は第{fixture.number}戦／{home.name}本拠地／{fixture.useDh ? 'DHあり' : 'DHなし'}</p>
        <p>{fixture.maxInnings === null ? '延長回数の制限なし' : '延長12回まで'}{fixture.homeClinchOnDraw ? '・引分でも上位球団の進出が決定' : ''}</p>
        <button className="btn btn-gold" disabled={busy} onClick={() => run(false)}>次の1試合を進める</button>
      </>}
    </section>;
  };
  return <div className="app calm-detail detail-result detail-playoff"><main>
    <h1>{year}年 {state.champion ? '日本シリーズ結果' : 'ポストシーズン'}</h1>
    {simMsg && <p className="playoff-status" role="status">{simMsg}</p>}
    {state.rankingWarnings?.length > 0 && <details className="card"><summary>順位判定に使える記録について</summary>
      {state.rankingWarnings.map(w => <p key={w}>{w}</p>)}</details>}
    {state.champion ? <section className="card playoff-champion">
      <div aria-hidden="true">🏆</div><h2>{state.champion.name} 日本一</h2>
      <p>{state.champion.id === myId ? '日本一達成、おめでとうございます！' : '今季の日本シリーズが終了しました。'}</p>
      <button className="btn btn-gold" onClick={onFinish}>引退・シーズン終了後の手続きへ</button>
    </section> : <div className="playoff-actions">
      <button className="btn btn-gold" disabled={busy} onClick={() => run(true)}>残り全試合をまとめてシム</button>
      {busy && <button className="btn" onClick={() => { cancelled.current = true; setBusy(false); }}>ここで止める</button>}
    </div>}
    {onSave && <button className="btn" disabled={busy} onClick={onSave}>進行を保存</button>}
    {onRoster && !state.champion && <button className="btn" disabled={busy} onClick={onRoster}>編成を見直す</button>}
    {PLAYOFF_ORDER.map(renderSeries)}
  </main></div>;
}
