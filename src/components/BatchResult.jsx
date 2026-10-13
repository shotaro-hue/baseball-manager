import React, { useEffect, useMemo, useRef, useState } from "react";
import '../calm-ui.css';
import '../mobile-flow.css';
import './batch-result.css';
import { Button, StateLabel, Section } from './design-system/primitives';
import { IS_HIT, IS_OUT } from '../constants';
import { cancelDeferredPostGameWork, scheduleDeferredPostGameWork } from "../engine/postGameProcessing";

const INITIAL_VISIBLE_RESULTS = 8;
const VISIBLE_RESULTS_STEP = 8;

function buildBatchPerfHighlights(results, getGameResult) {
  const hrCounts = new Map();
  let recordedLogs = 0;
  let incompleteLogs = 0;
  let biggestWin = null;
  let biggestLoss = null;

  for (const result of results || []) {
    const margin = hasScore(result) ? result.score.my - result.score.opp : null;
    if (margin > 0 && (!biggestWin || margin > biggestWin.margin)) {
      biggestWin = {
        oppName: result?.oppTeam?.short || "?",
        my: result?.score?.my || 0,
        opp: result?.score?.opp || 0,
        margin,
      };
    }
    if (margin < 0 && (!biggestLoss || margin < biggestLoss.margin)) {
      biggestLoss = {
        oppName: result?.oppTeam?.short || "?",
        my: result?.score?.my || 0,
        opp: result?.score?.opp || 0,
        margin,
      };
    }
    const record = getGameResult ? getGameResult(result) : result;
    const log = record?.log;
    if (!Array.isArray(log)) continue;
    let recorded = false;
    let incomplete = false;
    for (const event of log) {
      if (!event || event.isStolenBase || ['change', 'sb', 'cs'].includes(event.result)) continue;
      const plateAppearance = IS_HIT(event.result) || IS_OUT(event.result) || ['bb', 'hbp'].includes(event.result);
      if (!plateAppearance || typeof event.scorer !== 'boolean') { incomplete = true; continue; }
      if (!event.scorer) continue;
      if (typeof event.batter !== 'string' || !event.batter.trim() || event.batter === '?') { incomplete = true; continue; }
      recorded = true;
      if (event.result === "hr") {
        const hasId = typeof event.batId === 'string' && event.batId.trim()
          || typeof event.batId === 'number' && Number.isFinite(event.batId);
        const key = hasId ? `id:${typeof event.batId}:${event.batId}` : `name:${event.batter}`;
        const row = hrCounts.get(key) ?? { key, name: event.batter, count: 0 };
        row.count++;
        hrCounts.set(key, row);
      }
    }
    if (recorded) recordedLogs++;
    if (incomplete) incompleteLogs++;
  }

  return {
    hrList: [...hrCounts.values()].sort((a, b) => b.count - a.count).slice(0, 3),
    recordedLogs,
    incompleteLogs,
    biggestWin,
    biggestLoss,
  };
}

const hasScore = result => typeof result?.score?.my === 'number' && Number.isFinite(result.score.my)
  && typeof result?.score?.opp === 'number' && Number.isFinite(result.score.opp);
const outcome = result => !hasScore(result) ? '勝敗未確認'
  : result.score.my === result.score.opp ? '分' : result.score.my > result.score.opp ? '勝' : '敗';

export function BatchResultScreen({
  results,
  batchMeta,
  myTeam,
  onEnd,
  onReviewRoster,
  onViewDetail,
  isBatchProcessing: isBatchProcessingProp,
  initialVisibleCount,
  returnGameNo,
  canViewDetail,
  getGameResult,
  saveDirty = false,
  saveQueueState = {},
  saveResult = null,
}) {
  const safeResults = useMemo(() => Array.isArray(results) ? results.filter(Boolean) : [], [results]);
  const summary = useMemo(() => {
    const wins = safeResults.filter(result => outcome(result) === '勝').length;
    const losses = safeResults.filter(result => outcome(result) === '敗').length;
    const draws = safeResults.filter(result => outcome(result) === '分').length;
    return {
      wins, losses, draws,
      unknown: safeResults.length - wins - losses - draws,
      startGameNo: safeResults[0]?.gameNo,
      endGameNo: safeResults[safeResults.length - 1]?.gameNo,
      totalGames: safeResults.length,
    };
  }, [safeResults]);

  const [detailData, setDetailData] = useState(null);
  const [detailError, setDetailError] = useState('');
  const gameButtons = useRef(new Map());
  useEffect(() => {
    const button = gameButtons.current.get(returnGameNo);
    if (button && !button.disabled) button.focus();
  }, [returnGameNo]);
  const [internalProcessing, setInternalProcessing] = useState(() => isBatchProcessingProp ?? !!results?.length);
  const [visibleCount, setVisibleCount] = useState(() => {
    const requested = Number.isFinite(initialVisibleCount) ? initialVisibleCount : INITIAL_VISIBLE_RESULTS;
    return Math.min(Math.max(0, requested), safeResults.length);
  });

  useEffect(() => {
    const safeLength = safeResults.length;
    const requested = Number.isFinite(initialVisibleCount) ? initialVisibleCount : INITIAL_VISIBLE_RESULTS;
    setVisibleCount(Math.min(Math.max(0, requested), safeLength));
    setDetailData(null);
    setDetailError('');
    setInternalProcessing(true);
    let cancelled = false;
    const handle = scheduleDeferredPostGameWork(() => {
      if (cancelled) return;
      try { setDetailData(buildBatchPerfHighlights(safeResults, getGameResult)); }
      catch { setDetailError('ハイライトの集計に失敗しました。試合結果と戻る操作は利用できます。'); }
      finally { setInternalProcessing(false); }
    });

    return () => {
      cancelled = true;
      cancelDeferredPostGameWork(handle);
    };
  }, [safeResults, initialVisibleCount, getGameResult]);

  const isBatchProcessing = isBatchProcessingProp ?? internalProcessing;
  const visibleResults = useMemo(() => safeResults.slice(0, visibleCount), [safeResults, visibleCount]);
  const hasMoreResults = safeResults.length > visibleCount;

  const tired = (myTeam?.players || []).filter(p => (p.condition ?? 70)<60 || (p.injuryDaysLeft || 0)>0);
  const recordedLogs = detailData?.recordedLogs ?? 0;
  const saving = saveQueueState.isSaving || saveQueueState.hasQueuedSave;
  const partial = saveResult?.archive?.ok === false || saveResult?.warnings?.length > 0;
  const saveLabel = saving ? '保存中' : saveResult?.ok === false ? '保存失敗' : saveDirty ? '保存待ち'
    : saveResult?.ok === true ? saveResult.archive?.ok === false ? '保存済み・一部履歴は要確認'
      : partial ? '保存済み・保存情報は要確認' : '保存済み' : '保存状態未確認';
  const saveTone = saving ? 'processing' : saveResult?.ok === false ? 'danger' : saveDirty || partial ? 'warning'
    : saveResult?.ok === true ? 'success' : 'neutral';
  return <main className="app batch-result" data-ds="batch-shell"><div className="batch-container">
    <header className="batch-heading"><p>{myTeam?.name || myTeam?.short || '自球団'}</p>
      <h1>{summary.totalGames}試合の結果</h1><p>結果を振り返り、次の試合に向けて編成を見直す。</p></header>
    <section className="batch-summary" aria-label="まとめシムの概要">
      <p>第{summary.startGameNo ?? '—'}〜第{summary.endGameNo ?? '—'}戦 / この期間の結果</p>
      <strong>{summary.wins}勝 {summary.losses}敗 {summary.draws}分</strong>
      {summary.unknown > 0 && <p>勝敗未確認 {summary.unknown}試合（戦績集計から除外）</p>}
      {batchMeta && <p>順位 {batchMeta.beforeRank ?? '—'}位 → {batchMeta.afterRank ?? '—'}位</p>}
    </section>
    <div className="batch-state"><StateLabel tone={saveTone}>{saveLabel}</StateLabel>
      {isBatchProcessing && <StateLabel tone="processing">結果を整理中...</StateLabel>}
      <p>結果の集計と保存は別の処理です。保存・再試行はホームで確認できます。</p></div>
    <div className="batch-actions">{onReviewRoster && <Button onClick={onReviewRoster}>編成を見直す</Button>}
      <Button variant="secondary" onClick={onEnd}>ホームへ戻る</Button></div>
    {tired.length > 0 && <p className="batch-warning">現在の一軍に疲労・負傷のある選手が{tired.length}人。編成で状態を確認してください。</p>}
    <div className="batch-grid">
      <Section title="試合別の結果" className="batch-results">
        <p className="batch-note">スコアは自球団 − 相手。詳細からこの一覧へ戻れます。</p>
        <ul className="batch-games">{visibleResults.map((result, index) => {
          const available = Boolean(onViewDetail) && (!canViewDetail || canViewDetail(result));
          const opponent = result.oppTeam?.short || result.oppTeam?.name || '相手球団';
          const label = `第${result.gameNo ?? '—'}戦 ${opponent}の試合詳細 ${result.score?.my ?? '—'} 対 ${result.score?.opp ?? '—'} ${outcome(result)}${available ? '' : ' 詳細記録なし'}`;
          return <li className="batch-game" key={`${result.gameNo}-${index}`}>
            <button type="button" aria-label={label} disabled={!available}
              ref={node => { if (node) gameButtons.current.set(result.gameNo, node); else gameButtons.current.delete(result.gameNo); }}
              onClick={() => onViewDetail?.(result, visibleCount)}>
              <span className="batch-opponent"><small>第{result.gameNo ?? '—'}戦</small><strong>{opponent}</strong></span>
              <span className="batch-score">{result.score?.my ?? '—'} − {result.score?.opp ?? '—'}</span>
              <span className="batch-outcome">{outcome(result)}</span><span className="batch-detail-label">{available ? '詳細 →' : '詳細記録なし'}</span>
            </button>
          </li>;
        })}</ul>
        {!summary.totalGames && <p className="batch-note">試合結果はありません。</p>}
        {hasMoreResults && <Button variant="secondary" onClick={() => setVisibleCount(count => Math.min(safeResults.length, count + VISIBLE_RESULTS_STEP))}>続きを表示</Button>}
      </Section>
      <div className="batch-highlights"><Section title="打撃ハイライト">
        <p className="batch-note">この期間の自球団の本塁打。{detailData ? `ログ記録あり ${recordedLogs}/${summary.totalGames}試合。` : 'ログ記録を確認中。'}</p>
        {detailData?.incompleteLogs > 0 && <p className="batch-note">打席ログが不完全な試合 {detailData.incompleteLogs}試合。確認できた記録のみ集計しています。</p>}
        {detailError ? <p role="alert" className="batch-error">{detailError}</p> : !detailData ? <p className="batch-note">集計中...</p>
          : !recordedLogs ? <p className="batch-note">打撃ハイライトは未記録です。</p>
            : detailData.hrList.length ? detailData.hrList.map(({ key, name, count }) => <div className="batch-highlight-row" key={key}><strong>{name}</strong><span>{count}本塁打</span></div>)
              : <p className="batch-note">{detailData.incompleteLogs > 0 ? '一部の打席ログが不完全なため、本塁打数は未確認です。' : '本塁打なし（記録あり試合のみ）'}</p>}
      </Section>
      {batchMeta && <details className="batch-disclosure"><summary>負傷・リーグの詳細</summary>
        <h2>この期間の負傷アラート</h2>{!(batchMeta.injuries || []).length && <p>負傷なし</p>}
        {(batchMeta.injuries || []).map((row, index) => <p key={index}>{row.name} · {row.type} · {row.days}日</p>)}
        <h2>リーグ注目試合</h2>{!(batchMeta.cpuHighlights || []).length && <p>注目試合の記録なし</p>}
        {(batchMeta.cpuHighlights || []).map((row, index) => <p key={index}>{row.homeTeam?.short ?? '—'} {row.homeScore ?? '—'} − {row.awayScore ?? '—'} {row.awayTeam?.short ?? '—'} · {row.label}</p>)}
        {detailData?.biggestWin && <p>最大勝利 {detailData.biggestWin.my} − {detailData.biggestWin.opp} vs {detailData.biggestWin.oppName}</p>}
        {detailData?.biggestLoss && <p>最大敗戦 {detailData.biggestLoss.my} − {detailData.biggestLoss.opp} vs {detailData.biggestLoss.oppName}</p>}
      </details>}</div>
    </div>
  </div></main>;
}
