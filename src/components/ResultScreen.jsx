import '../mobile-flow.css';
import './result-screen.css';
import { Button, StateLabel, DataTableFrame } from './design-system/primitives';
import React, { useEffect, useMemo, useState } from 'react';
import { cancelDeferredPostGameWork, scheduleDeferredPostGameWork } from '../engine/postGameProcessing';
import { resolvePlayerById } from '../engine/playerIdentity';
import { computeBoxScore } from '../engine/postGame';

const UNKNOWN_TEAM = {
  name: '対戦相手',
  short: 'OPP',
  emoji: '⚾',
  color: 'var(--text)',
  players: [],
  farm: [],
  wins: 0,
  losses: 0,
  draws: 0,
};

function normalizeScore(score) {
  const safeMyScore = Number(score?.my);
  const safeOppScore = Number(score?.opp);
  return {
    my: Number.isFinite(safeMyScore) ? safeMyScore : 0,
    opp: Number.isFinite(safeOppScore) ? safeOppScore : 0,
  };
}

function normalizeResult(gsResult) {
  const score = normalizeScore(gsResult?.score);
  return {
    ...(gsResult || {}),
    score,
    log: Array.isArray(gsResult?.log) ? gsResult.log : [],
    inningSummary: Array.isArray(gsResult?.inningSummary) ? gsResult.inningSummary : [],
  };
}

function normalizeTeam(team, fallback = UNKNOWN_TEAM) {
  if (!team || typeof team !== 'object') return fallback;
  return {
    ...fallback,
    ...team,
    players: Array.isArray(team.players) ? team.players : [],
    farm: Array.isArray(team.farm) ? team.farm : [],
    wins: Number(team.wins) || 0,
    losses: Number(team.losses) || 0,
    draws: Number(team.draws) || 0,
  };
}

function buildResultScreenSummary(gsResult) {
  const safeResult = normalizeResult(gsResult);
  const won = safeResult.score.my > safeResult.score.opp;
  const drew = safeResult.score.my === safeResult.score.opp;
  const isHome = safeResult.isHome !== false;
  const inningSummary = safeResult.inningSummary;
  const normalizedInnings = inningSummary
    .map((entry) => Number(entry?.inning))
    .filter((inning) => Number.isFinite(inning) && inning > 0)
    .map((inning) => Math.floor(inning));
  // ⚠️ セキュリティ: 異常値で配列生成が破綻しないよう、最大イニング数を明示的に制限する
  const boundedMaxInning = Math.min(30, Math.max(9, ...normalizedInnings, 9));
  const innings = Array.from({ length: boundedMaxInning }, (_, index) => index + 1);
  const myRunsByInn = {};
  const oppRunsByInn = {};

  inningSummary.forEach((entry) => {
    const inning = Math.floor(Number(entry?.inning));
    if (!Number.isFinite(inning) || inning <= 0 || inning > boundedMaxInning) return;
    const runsRaw = Number(entry?.runs);
    const runs = Number.isFinite(runsRaw) ? Math.max(0, runsRaw) : 0;
    const myIsBatting = isHome ? !entry?.isTop : !!entry?.isTop;
    if (myIsBatting) myRunsByInn[inning] = runs;
    else oppRunsByInn[inning] = runs;
  });

  return {
    won,
    drew,
    log: safeResult.log,
    maxInning: boundedMaxInning,
    innings,
    myRunsByInn,
    oppRunsByInn,
    resultColor: won ? 'var(--gold)' : drew ? 'var(--blue)' : 'var(--red)',
    resultLabel: won ? 'VICTORY' : drew ? 'DRAW' : 'DEFEAT',
  };
}

function buildResultScreenDetails(gsResult, myTeam, oppTeam, teams = []) {
  const safeResult = normalizeResult(gsResult);
  const safeMyTeam = normalizeTeam(myTeam, { ...UNKNOWN_TEAM, name: '自チーム', short: 'MY', emoji: '🏟️', color: 'var(--gold)' });
  const safeOppTeam = normalizeTeam(oppTeam, UNKNOWN_TEAM);
  const log = safeResult.log;
  const isHit = (result) => ['s', 'd', 't', 'hr'].includes(result);
  const isOut = (result) => ['k', 'out', 'fo', 'go', 'sac', 'sf'].includes(result);
  let myHitsTotal = 0;
  let oppHitsTotal = 0;
  const myPitcherIds = [];
  const oppPitcherIds = [];
  const myPitcherSeen = new Set();
  const oppPitcherSeen = new Set();
  const myPitcherStats = {};
  const oppPitcherStats = {};
  const myBatStatsMap = {};
  const oppBatStatsMap = {};
  const myBatOrder = [];
  const oppBatOrder = [];
  const myHREvts = [];
  const oppHREvts = [];

  const getPitcherRow = (map, id) => {
    if (!map[id]) map[id] = { outs: 0, H: 0, ER: 0, K: 0, BB: 0, PC: 0 };
    return map[id];
  };
  const getBatterRow = (map, order, event) => {
    const id = event?.batId || event?.batter || `unknown-${order.length}`;
    if (!map[id]) {
      map[id] = { id, name: event?.batter || '不明', AB: 0, H: 0, HR: 0, RBI: 0 };
      order.push(id);
    }
    return map[id];
  };

  log.forEach((event) => {
    if (!event || event.isStolenBase) return;
    if (event.result === 'hr') {
      if (event.scorer) myHREvts.push(event);
      else oppHREvts.push(event);
    }
    if (isHit(event.result)) {
      if (event.scorer) myHitsTotal += 1;
      else oppHitsTotal += 1;
    }
    if (event.result && event.result !== 'change') {
      const targetMap = event.scorer ? myBatStatsMap : oppBatStatsMap;
      const targetOrder = event.scorer ? myBatOrder : oppBatOrder;
      const row = getBatterRow(targetMap, targetOrder, event);
      if (!['bb', 'hbp', 'sf', 'sac'].includes(event.result)) row.AB += 1;
      if (isHit(event.result)) row.H += 1;
      if (event.result === 'hr') row.HR += 1;
      row.RBI += Number(event.rbi) || 0;
    }
    if (!event.pitcherId || !event.result || event.result === 'change') return;
    const pitcherIds = event.scorer ? oppPitcherIds : myPitcherIds;
    const pitcherSeen = event.scorer ? oppPitcherSeen : myPitcherSeen;
    const pitcherStats = event.scorer ? oppPitcherStats : myPitcherStats;
    if (!pitcherSeen.has(event.pitcherId)) {
      pitcherSeen.add(event.pitcherId);
      pitcherIds.push(event.pitcherId);
    }
    const row = getPitcherRow(pitcherStats, event.pitcherId);
    if (isOut(event.result)) row.outs += 1;
    if (isHit(event.result)) row.H += 1;
    if (event.result === 'k') row.K += 1;
    if (event.result === 'bb') row.BB += 1;
    if ((Number(event.rbi) || 0) > 0) row.ER += Number(event.rbi) || 0;
    row.PC += Number(event.pitches) || 0;
  });

  const myPStats = myPitcherIds.map((id) => ({ id, ...(myPitcherStats[id] || { outs: 0, H: 0, ER: 0, K: 0, BB: 0, PC: 0 }) }));
  const oppPStats = oppPitcherIds.map((id) => ({ id, ...(oppPitcherStats[id] || { outs: 0, H: 0, ER: 0, K: 0, BB: 0, PC: 0 }) }));
  const isHome = safeResult.isHome !== false;
  // 保存履歴と同じW/L/S判定を使う。旧ログのscorerは表示用にだけ表裏へ変換する。
  const decisionLog = log.filter(Boolean).map((event) => (
    typeof event.isTop === 'boolean' ? event : { ...event, isTop: isHome ? !event.scorer : !!event.scorer }
  ));
  const boxScore = computeBoxScore(
    decisionLog, [],
    isHome ? safeMyTeam.players : safeOppTeam.players,
    isHome ? safeOppTeam.players : safeMyTeam.players,
    isHome ? safeResult.score.my : safeResult.score.opp,
    isHome ? safeResult.score.opp : safeResult.score.my,
  );
  const myPitching = (isHome ? boxScore?.homePitching : boxScore?.awayPitching) || [];
  const oppPitching = (isHome ? boxScore?.awayPitching : boxScore?.homePitching) || [];
  const decisionId = (pitching, role) => pitching.find((pitcher) => pitcher.result === role)?.id ?? null;
  const myWinnerId = decisionId(myPitching, 'W');
  const myLoserId = decisionId(myPitching, 'L');
  const mySaverId = decisionId(myPitching, 'S');
  const oppWinnerId = decisionId(oppPitching, 'W');
  const oppLoserId = decisionId(oppPitching, 'L');
  const oppSaverId = decisionId(oppPitching, 'S');
  const findPlayer = (team, id) => resolvePlayerById(team, teams, id);

  return {
    myHitsTotal,
    oppHitsTotal,
    myPStats,
    oppPStats,
    myWinnerId,
    myLoserId,
    mySaverId,
    oppWinnerId,
    oppLoserId,
    oppSaverId,
    myHREvts,
    oppHREvts,
    myBatStats: myBatOrder.map((id) => myBatStatsMap[id]),
    oppBatStats: oppBatOrder.map((id) => oppBatStatsMap[id]),
    myPRole: (id) => (id === myWinnerId ? 'W' : id === myLoserId ? 'L' : id === mySaverId ? 'S' : ''),
    oppPRole: (id) => (id === oppWinnerId ? 'W' : id === oppLoserId ? 'L' : id === oppSaverId ? 'S' : ''),
    findPlayer,
    myTeam: safeMyTeam,
    oppTeam: safeOppTeam,
  };
}

export function ResultScreen({ gsResult, myTeam, oppTeam, teams = [], gameDay, onNext, nextLabel = 'ハブに戻る', isPostGameProcessing: isPostGameProcessingProp }) {
  const safeResult = useMemo(() => normalizeResult(gsResult), [gsResult]);
  const safeMyTeam = useMemo(() => normalizeTeam(myTeam, { ...UNKNOWN_TEAM, name: '自チーム', short: 'MY', emoji: '🏟️', color: 'var(--gold)' }), [myTeam]);
  const safeOppTeam = useMemo(() => normalizeTeam(oppTeam || gsResult?.oppTeam, UNKNOWN_TEAM), [gsResult?.oppTeam, oppTeam]);
  const [activeTab, setActiveTab] = useState('bat');
  const [detailData, setDetailData] = useState(null);
  const [detailError, setDetailError] = useState('');
  const [internalProcessing, setInternalProcessing] = useState(() => (isPostGameProcessingProp ?? !!gsResult));
  const summary = useMemo(() => buildResultScreenSummary(safeResult), [safeResult]);
  const isPostGameProcessing = isPostGameProcessingProp ?? internalProcessing;

  useEffect(() => {
    if (!gsResult?.score) {
      setDetailData(null);
      setDetailError('');
      setInternalProcessing(false);
      return undefined;
    }

    setActiveTab('bat');
    setDetailData(null);
    setDetailError('');
    setInternalProcessing(true);

    let isCancelled = false;
    const handle = scheduleDeferredPostGameWork(() => {
      if (isCancelled) return;
      try {
        const nextDetail = buildResultScreenDetails(safeResult, safeMyTeam, safeOppTeam, teams);
        if (isCancelled) return;
        setDetailData(nextDetail);
      } catch (error) {
        console.error('[ResultScreen] detail aggregation failed', error);
        if (isCancelled) return;
        setDetailData(null);
        setDetailError('⚠️ 詳細成績の集計に失敗しました。スコア表示とハブ復帰は利用できます。');
      }
      setInternalProcessing(false);
    });

    return () => {
      isCancelled = true;
      cancelDeferredPostGameWork(handle);
    };
  }, [gsResult, safeMyTeam, safeOppTeam, safeResult, teams]);

  const fmtIPlocal = (outs) => {
    const f = Math.floor((Number(outs) || 0) / 3);
    const r = (Number(outs) || 0) % 3;
    return r === 0 ? `${f}` : `${f}.${r}`;
  };
  const hrLabel = (rbi) => ({ 1: 'ソロ', 2: '2ラン', 3: '3ラン', 4: '満塁' }[rbi] || `${rbi}点本塁打`);
  const fmtSeasonAvg = (player) => {
    if (!player?.stats) return '.---';
    const ab = player.stats.AB || 0;
    const h = player.stats.H || 0;
    return ab === 0 ? '.---' : `.${String(Math.round((h / ab) * 1000)).padStart(3, '0')}`;
  };

  const detailReady = !!detailData;
  const detailCardTitle = activeTab === 'bat' ? '打者成績' : '投手成績';

  return (
    <main className="app calm-detail detail-result result-screen" data-ds="result-shell">
      <div className="result-container">
        <header className="result-heading">
          <p className="result-context">{safeMyTeam.name}{safeMyTeam.league && ` / ${safeMyTeam.league}・リーグ`}</p>
          <h1>試合結果</h1>
          <p>スコアと個人成績から試合を振り返る。</p>
        </header>
        <section className="result-summary" aria-label="試合の概要">
          <div className="result-summary-meta">
            <span>第{gameDay ?? safeResult.gameNo ?? '—'}戦 · {safeResult.isHome === false ? 'ビジター' : 'ホーム'}</span>
            <span>{gsResult?.score ? `試合終了 / ${summary.won ? '勝利' : summary.drew ? '引き分け' : '敗北'}` : '結果未確認'}</span>
          </div>
          <div className="result-scoreline">
            <strong>{safeMyTeam.short}</strong>
            <div className="result-score" aria-label={gsResult?.score ? `${safeMyTeam.name} ${safeResult.score.my} 対 ${safeResult.score.opp} ${safeOppTeam.name}` : 'スコア未確認'}>
              {gsResult?.score ? <>{safeResult.score.my}<span>–</span>{safeResult.score.opp}</> : '—'}
            </div>
            <strong>{safeOppTeam.short}</strong>
          </div>
          <div className="result-summary-meta">
            <span>この試合の記録{gsResult?.score && ` · ${summary.resultLabel}`}</span>
            <span>{safeMyTeam.wins}勝{safeMyTeam.losses}敗{safeMyTeam.draws}分</span>
          </div>
        </section>
        {!gsResult?.score && <p className="result-notice">試合結果データが不足しています。ゲームデータは保持されています。</p>}
        {detailError && <p className="result-notice" role="alert">{detailError}</p>}
        <div className="result-grid">
          <div className="result-overview">
            <div className="card">
              <h2 className="card-h">イニングスコア</h2>
              <p className="result-table-caption">先攻 {safeResult.isHome === false ? safeMyTeam.short : safeOppTeam.short} / 後攻 {safeResult.isHome === false ? safeOppTeam.short : safeMyTeam.short} <span>横にスクロール →</span></p>
              <DataTableFrame label="イニング別スコア"><table className="tbl result-innings">
                <thead><tr>
                  <th scope="col">球団</th>
                  {summary.innings.map(inning => <th scope="col" data-number key={inning}>{inning}</th>)}
                  <th scope="col" data-number>R</th><th scope="col" data-number>H</th>
                </tr></thead>
                <tbody>
                  {(safeResult.isHome === false ? [true, false] : [false, true]).map(isMy => {
                    const team = isMy ? safeMyTeam : safeOppTeam;
                    const byInn = isMy ? summary.myRunsByInn : summary.oppRunsByInn;
                    const otherInn = isMy ? summary.oppRunsByInn : summary.myRunsByInn;
                    const score = isMy ? safeResult.score.my : safeResult.score.opp;
                    const against = isMy ? safeResult.score.opp : safeResult.score.my;
                    const isHomeTeam = isMy === (safeResult.isHome !== false);
                    return <tr key={isMy ? 'my' : 'opp'}>
                      <th scope="row">{team.short}</th>
                      {summary.innings.map(inning => {
                        const runs = byInn[inning];
                        const isX = gsResult?.score && isHomeTeam && score > against && runs === undefined && inning === summary.maxInning && otherInn[inning] !== undefined;
                        return <td data-number key={inning}>{runs !== undefined ? runs : isX ? 'X' : '—'}</td>;
                      })}
                      <td data-number className="result-total">{gsResult?.score ? score : '—'}</td>
                      <td data-number>{summary.log.length === 0 || detailError ? '—' : detailReady ? (isMy ? detailData.myHitsTotal : detailData.oppHitsTotal) : '…'}</td>
                    </tr>;
                  })}
                </tbody>
              </table></DataTableFrame>
            </div>
            {detailReady && (detailData.myWinnerId || detailData.myLoserId || detailData.mySaverId || detailData.oppWinnerId || detailData.oppLoserId || detailData.oppSaverId) && (
              <div className="card">
                <h2 className="card-h">勝敗投手</h2>
                {[
                  detailData.myWinnerId && { label: 'W', player: detailData.findPlayer(safeMyTeam, detailData.myWinnerId), team: safeMyTeam.short },
                  detailData.oppWinnerId && { label: 'W', player: detailData.findPlayer(safeOppTeam, detailData.oppWinnerId), team: safeOppTeam.short },
                  detailData.myLoserId && { label: 'L', player: detailData.findPlayer(safeMyTeam, detailData.myLoserId), team: safeMyTeam.short },
                  detailData.oppLoserId && { label: 'L', player: detailData.findPlayer(safeOppTeam, detailData.oppLoserId), team: safeOppTeam.short },
                  detailData.mySaverId && { label: 'S', player: detailData.findPlayer(safeMyTeam, detailData.mySaverId), team: safeMyTeam.short },
                  detailData.oppSaverId && { label: 'S', player: detailData.findPlayer(safeOppTeam, detailData.oppSaverId), team: safeOppTeam.short },
                ].filter(Boolean).map((row, index) => <div key={index} className="fsb">
                  <div className="result-pitcher-name"><span className="result-role" data-role={row.label} aria-label={{ W: '勝利', L: '敗戦', S: 'セーブ' }[row.label]}>{row.label}</span><span>{row.player?.name || '不明選手'}</span></div>
                  <span>{row.team}</span>
                </div>)}
              </div>
            )}
            {detailReady && (detailData.myHREvts.length > 0 || detailData.oppHREvts.length > 0) && (
              <div className="card">
                <h2 className="card-h">本塁打</h2>
                {[
                  ...detailData.myHREvts.map(event => ({ ...event, teamShort: safeMyTeam.short })),
                  ...detailData.oppHREvts.map(event => ({ ...event, teamShort: safeOppTeam.short })),
                ].sort((a, b) => (Number(a.inning) || 0) - (Number(b.inning) || 0) || (a.isTop ? 0 : 1) - (b.isTop ? 0 : 1)).map((event, index) => <div className="fsb" key={index}>
                  <strong>{event.batter} <span className="result-muted">HR</span></strong>
                  <span>{event.inning ?? '—'}回{event.isTop ? '表' : '裏'} · {hrLabel(event.rbi)} · {event.teamShort}</span>
                </div>)}
              </div>
            )}
          </div>
          <div className="result-details">
            <div className="card">
              <h2 className="card-h">ボックススコア</h2>
              {summary.log.length === 0 ? <p className="result-notice">この試合の個人成績は未記録です。</p> : <>
                <div className="result-tabs" role="group" aria-label="表示する個人成績">
                  {[['bat', '打者成績'], ['pitch', '投手成績']].map(([tab, label]) => <button key={tab} type="button" aria-pressed={activeTab === tab} onClick={() => setActiveTab(tab)}>{label}</button>)}
                </div>
                {!detailReady && !detailError && <p className="result-notice">{detailCardTitle}を読み込み中...</p>}
                {detailReady && activeTab === 'bat' && [{ team: safeMyTeam, batters: detailData.myBatStats }, { team: safeOppTeam, batters: detailData.oppBatStats }].map(({ team, batters }) => <div key={team.id} className="result-team-stats">
                  <p className="result-table-caption">{team.short} / この試合の記録（AVGは今季）</p>
                  <DataTableFrame label={`${team.name}の試合成績`}><table className="tbl result-player-table">
                    <thead><tr>{['選手', 'AVG', 'AB', 'H', 'RBI', 'HR'].map((header, index) => <th scope="col" data-number={index > 0 || undefined} key={header}>{header}</th>)}</tr></thead>
                    <tbody>{batters.map(batter => <tr key={batter.id}>
                      <th scope="row">{batter.name}</th>
                      <td data-number>{fmtSeasonAvg(detailData.findPlayer(team, batter.id))}</td>
                      <td data-number>{batter.AB}</td><td data-number>{batter.H}</td><td data-number>{batter.RBI || 0}</td><td data-number>{batter.HR || 0}</td>
                    </tr>)}</tbody>
                  </table></DataTableFrame>
                  {batters.length === 0 && <p className="result-notice">打者成績は未記録です。</p>}
                </div>)}
                {detailReady && activeTab === 'pitch' && [{ team: safeMyTeam, pstats: detailData.myPStats, roleF: detailData.myPRole }, { team: safeOppTeam, pstats: detailData.oppPStats, roleF: detailData.oppPRole }].map(({ team, pstats, roleF }) => <div key={team.id} className="result-team-stats">
                  <p className="result-table-caption">{team.short} / この試合の記録</p>
                  <DataTableFrame label={`${team.name}の試合成績`}><table className="tbl result-player-table">
                    <thead><tr>{['投手', 'IP', 'PC', 'H', 'K', 'BB', 'ER'].map((header, index) => <th scope="col" data-number={index > 0 || undefined} key={header}>{header}</th>)}</tr></thead>
                    <tbody>{pstats.map(pitcherStats => {
                      const player = detailData.findPlayer(team, pitcherStats.id), role = roleF(pitcherStats.id);
                      return <tr key={pitcherStats.id}>
                        <th scope="row">{role && <span className="result-role" data-role={role}>{role}</span>}{player?.name || '不明選手'}</th>
                        <td data-number>{fmtIPlocal(pitcherStats.outs)}</td><td data-number>{pitcherStats.PC || 0}</td>
                        <td data-number>{pitcherStats.H}</td><td data-number>{pitcherStats.K}</td><td data-number>{pitcherStats.BB}</td><td data-number>{pitcherStats.ER}</td>
                      </tr>;
                    })}</tbody>
                  </table></DataTableFrame>
                  {pstats.length === 0 && <p className="result-notice">投手成績は未記録です。</p>}
                </div>)}
              </>}
            </div>
          </div>
        </div>
        {isPostGameProcessing && <div className="result-processing">
          <StateLabel tone="processing">試合詳細を整理中...</StateLabel><span>戻る操作は先に行えます</span>
        </div>}
        <Button className="result-return" onClick={onNext}>{nextLabel}</Button>
      </div>
    </main>
  );
}
