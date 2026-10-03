import React, { useEffect, useMemo, useState } from "react";
import { CaretRight } from '@phosphor-icons/react';
import '../calm-ui.css';
import '../mobile-flow.css';
import { cancelDeferredPostGameWork, scheduleDeferredPostGameWork } from "../engine/postGameProcessing";

const INITIAL_VISIBLE_RESULTS = 8;
const VISIBLE_RESULTS_STEP = 8;

function buildBatchPerfHighlights(results) {
  const hrCounts = {};
  let biggestWin = null;
  let biggestLoss = null;

  for (const result of results || []) {
    const margin = (result?.score?.my || 0) - (result?.score?.opp || 0);
    if (result?.won && (!biggestWin || margin > biggestWin.margin)) {
      biggestWin = {
        oppName: result?.oppTeam?.short || "?",
        my: result?.score?.my || 0,
        opp: result?.score?.opp || 0,
        margin,
      };
    }
    if (!result?.won && (result?.score?.my !== result?.score?.opp) && (!biggestLoss || margin < biggestLoss.margin)) {
      biggestLoss = {
        oppName: result?.oppTeam?.short || "?",
        my: result?.score?.my || 0,
        opp: result?.score?.opp || 0,
        margin,
      };
    }
    for (const event of (result?.log || [])) {
      if (event?.result === "hr" && event?.scorer) {
        hrCounts[event.batter] = (hrCounts[event.batter] || 0) + 1;
      }
    }
  }

  return {
    hrList: Object.entries(hrCounts).sort((a, b) => b[1] - a[1]).slice(0, 3),
    biggestWin,
    biggestLoss,
  };
}

export function BatchResultScreen({
  results,
  batchMeta,
  myTeam,
  onEnd,
  onReviewRoster,
  onViewDetail,
  isBatchProcessing: isBatchProcessingProp,
  initialVisibleCount,
}) {
  const summary = useMemo(() => {
    const safeResults = Array.isArray(results) ? results : [];
    const wins = safeResults.filter((result) => result?.won).length;
    const losses = safeResults.length - wins;
    return {
      wins,
      losses,
      startGameNo: safeResults[0]?.gameNo,
      endGameNo: safeResults[safeResults.length - 1]?.gameNo,
      totalGames: safeResults.length,
    };
  }, [results]);

  const [detailData, setDetailData] = useState(null);
  const [internalProcessing, setInternalProcessing] = useState(() => isBatchProcessingProp ?? !!results?.length);
  const [visibleCount, setVisibleCount] = useState(() => {
    const requested = Number.isFinite(initialVisibleCount) ? initialVisibleCount : INITIAL_VISIBLE_RESULTS;
    return Math.min(Math.max(0, requested), Array.isArray(results) ? results.length : 0);
  });

  useEffect(() => {
    const safeLength = Array.isArray(results) ? results.length : 0;
    const requested = Number.isFinite(initialVisibleCount) ? initialVisibleCount : INITIAL_VISIBLE_RESULTS;
    setVisibleCount(Math.min(Math.max(0, requested), safeLength));
    setDetailData(null);
    setInternalProcessing(true);

    const handle = scheduleDeferredPostGameWork(() => {
      setDetailData(buildBatchPerfHighlights(results || []));
      setInternalProcessing(false);
    });

    return () => {
      cancelDeferredPostGameWork(handle);
    };
  }, [results, initialVisibleCount]);

  const isBatchProcessing = isBatchProcessingProp ?? internalProcessing;
  const visibleResults = useMemo(() => (results || []).slice(0, visibleCount), [results, visibleCount]);
  const hasMoreResults = (results?.length || 0) > visibleCount;

  const draws = (results || []).filter(r => r.drew || r.score?.my === r.score?.opp).length;
  const losses = Math.max(0, summary.totalGames - summary.wins - draws);
  const tired = (myTeam?.players || []).filter(p => (p.condition ?? 70)<60 || (p.injuryDaysLeft || 0)>0);
  return <div className="app" style={{background:'#fff'}}><main className="flow-screen flow-batch">
    <p className="flow-muted">{myTeam?.name || myTeam?.short}</p><h1>{summary.totalGames}試合の結果</h1>
    <p className="flow-muted">第{summary.startGameNo ?? '—'}〜第{summary.endGameNo ?? '—'}戦</p>
    <section className="flow-summary"><strong>{summary.wins}勝 {losses}敗{draws>0 && ` ${draws}分`}</strong>
      {batchMeta && <p>順位 {batchMeta.beforeRank}位 → {batchMeta.afterRank}位</p>}
      {isBatchProcessing && <p role="status">結果を整理中...</p>}
    </section>
    {tired.length>0 && <div className="flow-warning">疲労・負傷のある選手が{tired.length}人{onReviewRoster && <button className="flow-link" onClick={onReviewRoster}>編成で確認</button>}</div>}
    <section className="flow-section"><h2>打撃ハイライト</h2>
      {!detailData ? <p className="flow-muted">集計中...</p> : detailData.hrList.length ? detailData.hrList.map(([name,count])=><div className="flow-row" key={name}><strong>{name}</strong><span>{count}本塁打</span></div>) : <p className="flow-muted">本塁打なし</p>}
    </section>
    <section className="flow-section"><h2>試合別の結果</h2>
      {visibleResults.map((r,i)=><button className="flow-row" key={`${r.gameNo}-${i}`} onClick={()=>onViewDetail?.(r)}><span><small>第{r.gameNo}戦</small>{r.oppTeam?.short || r.oppTeam?.name || '相手球団'}</span><strong>{r.score?.my ?? '—'} − {r.score?.opp ?? '—'}</strong><span className={`flow-outcome ${r.drew || r.score?.my===r.score?.opp ? 'draw' : r.won ? 'win':'loss'}`}>{r.drew || r.score?.my===r.score?.opp ? '分' : r.won ? '勝':'敗'}</span><CaretRight size={18}/></button>)}
      {!summary.totalGames && <p className="flow-muted">試合結果はありません</p>}
      {hasMoreResults && <button className="flow-link" onClick={()=>setVisibleCount(n=>Math.min(results.length,n+VISIBLE_RESULTS_STEP))}>続きを表示</button>}
    </section>
    {batchMeta && <details className="flow-section"><summary>負傷・リーグの詳細</summary>
      <h2>負傷アラート</h2>{!(batchMeta.injuries || []).length && <p>負傷なし</p>}{(batchMeta.injuries || []).map((r,i)=><p key={i}>{r.name} · {r.type} · {r.days}日</p>)}
      <h2>リーグ注目試合</h2>{(batchMeta.cpuHighlights || []).map((h,i)=><p key={i}>{h.homeTeam?.short} {h.homeScore} − {h.awayScore} {h.awayTeam?.short} · {h.label}</p>)}
      {detailData?.biggestWin && <p>最大勝利 {detailData.biggestWin.my} − {detailData.biggestWin.opp} vs {detailData.biggestWin.oppName}</p>}
      {detailData?.biggestLoss && <p>最大敗戦 {detailData.biggestLoss.my} − {detailData.biggestLoss.opp} vs {detailData.biggestLoss.oppName}</p>}
    </details>}
    <div className="flow-actions">{onReviewRoster && <button className="calm-primary" onClick={onReviewRoster}>編成を見直す</button>}<button className="calm-secondary" onClick={onEnd}>ホームへ戻る</button></div>
  </main></div>;
}
