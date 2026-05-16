import React, { useEffect, useMemo, useState } from "react";
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
      if (event?.result === "hr" && event?.isTop === false) {
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

  const rankDelta = batchMeta ? batchMeta.beforeRank - batchMeta.afterRank : 0;
  const rankColor = rankDelta > 0 ? "#34d399" : rankDelta < 0 ? "#f87171" : "#94a3b8";
  const rankArrow = rankDelta > 0 ? "▲" : rankDelta < 0 ? "▼" : "-";

  return (
    <div className="app">
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "16px 12px" }}>
        <div className="card" style={{ textAlign: "center", marginBottom: 12 }}>
          <div style={{ fontFamily: "'Bebas Neue',cursive", fontSize: 42, letterSpacing: ".1em", color: summary.wins > summary.losses ? "#f5c842" : summary.wins < summary.losses ? "#f87171" : "#94a3b8", marginBottom: 4 }}>
            {summary.wins}勝 {summary.losses}敗
          </div>
          <div style={{ fontSize: 12, color: "#374151", marginBottom: 10 }}>
            第{summary.startGameNo ?? "-"}〜第{summary.endGameNo ?? "-"}戦 / {summary.totalGames}試合
          </div>
          {isBatchProcessing && (
            <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 10 }}>
              結果を整理中...
            </div>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            {visibleResults.map((result, index) => (
              <button
                key={`${result?.gameNo || index}-${result?.oppTeam?.short || "opp"}`}
                onClick={() => onViewDetail(result)}
                className={`bsm ${result?.won ? "bga" : "bgr"}`}
                style={{ minWidth: 70, padding: "7px 10px", fontSize: 12 }}
              >
                <span style={{ fontSize: 9, display: "block", color: "inherit", opacity: 0.7 }}>第{result?.gameNo}戦</span>
                {result?.oppTeam?.short} {result?.score?.my}-{result?.score?.opp}
                <span style={{ marginLeft: 4 }}>{result?.won ? "○" : "●"}</span>
              </button>
            ))}
          </div>
          {hasMoreResults && (
            <button
              className="bsm"
              onClick={() => setVisibleCount((count) => Math.min((results?.length || 0), count + VISIBLE_RESULTS_STEP))}
              style={{ marginTop: 10, padding: "7px 14px", fontSize: 11 }}
            >
              続きを表示
            </button>
          )}
        </div>

        {batchMeta && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
            <div className="card" style={{ padding: "12px 10px", textAlign: "center", marginBottom: 0 }}>
              <div className="card-h" style={{ marginBottom: 8 }}>順位変動</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <span style={{ fontSize: 18, color: "#94a3b8" }}>{batchMeta.beforeRank}位</span>
                <span style={{ fontSize: 14, color: rankColor, fontWeight: 700 }}>{rankArrow}</span>
                <span style={{ fontSize: 22, fontWeight: 700, color: rankColor }}>{batchMeta.afterRank}位</span>
              </div>
              <div style={{ fontSize: 10, color: "#374151", marginTop: 6 }}>
                {batchMeta.beforeRecord.w}勝{batchMeta.beforeRecord.l}敗
                <span style={{ margin: "0 4px" }}>→</span>
                {batchMeta.afterRecord.w}勝{batchMeta.afterRecord.l}敗
              </div>
            </div>

            <div className="card" style={{ padding: "12px 10px", marginBottom: 0 }}>
              <div className="card-h" style={{ marginBottom: 8 }}>打撃ハイライト</div>
              {!detailData ? (
                <div style={{ fontSize: 11, color: "#374151" }}>集計中...</div>
              ) : detailData.hrList.length > 0 ? (
                detailData.hrList.map(([name, count], index) => (
                  <div key={`${name}-${index}`} style={{ fontSize: 11, color: "#f5c842", marginBottom: 2 }}>
                    ★ {name} <span style={{ fontWeight: 700 }}>{count}HR</span>
                  </div>
                ))
              ) : (
                <div style={{ fontSize: 11, color: "#374151" }}>本塁打なし</div>
              )}
              {detailData?.biggestWin && (
                <div style={{ fontSize: 10, color: "#34d399", marginTop: 4 }}>
                  最大勝利 {detailData.biggestWin.my}-{detailData.biggestWin.opp} vs {detailData.biggestWin.oppName}
                </div>
              )}
              {detailData?.biggestLoss && (
                <div style={{ fontSize: 10, color: "#f87171", marginTop: 2 }}>
                  最大敗戦 {detailData.biggestLoss.my}-{detailData.biggestLoss.opp} vs {detailData.biggestLoss.oppName}
                </div>
              )}
            </div>

            <div className="card" style={{ padding: "12px 10px", marginBottom: 0 }}>
              <div className="card-h" style={{ marginBottom: 8 }}>負傷アラート</div>
              {isBatchProcessing ? (
                <div style={{ fontSize: 11, color: "#374151" }}>整理中...</div>
              ) : batchMeta.injuries.length === 0 ? (
                <div style={{ fontSize: 11, color: "#374151" }}>負傷なし</div>
              ) : (
                batchMeta.injuries.slice(0, 4).map((injury, index) => (
                  <div key={`${injury.name}-${index}`} style={{ fontSize: 10, color: injury.days >= 31 ? "#f87171" : injury.days >= 15 ? "#f5c842" : "#94a3b8", marginBottom: 3 }}>
                    {injury.name}
                    <span style={{ fontSize: 9, color: "#374151", marginLeft: 3 }}>{injury.type} {injury.days}日</span>
                  </div>
                ))
              )}
              {!isBatchProcessing && batchMeta.injuries.length > 4 && (
                <div style={{ fontSize: 9, color: "#374151" }}>他{batchMeta.injuries.length - 4}件</div>
              )}
            </div>
          </div>
        )}

        {batchMeta && !isBatchProcessing && batchMeta.cpuHighlights.length > 0 && (
          <div className="card" style={{ marginBottom: 12 }}>
            <div className="card-h">同日リーグ注目試合</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {batchMeta.cpuHighlights.slice(0, 5).map((highlight, index) => (
                <div key={index} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 6px", background: "rgba(0,0,0,.2)", borderRadius: 5, fontSize: 11 }}>
                  <span style={{ color: highlight.homeTeam.color || "#94a3b8" }}>{highlight.homeTeam.emoji} {highlight.homeTeam.short}</span>
                  <span style={{ fontFamily: "'Share Tech Mono',monospace", fontWeight: 700, color: highlight.homeWon ? "#f5c842" : "#f87171" }}>{highlight.homeScore}</span>
                  <span style={{ color: "#374151" }}>-</span>
                  <span style={{ fontFamily: "'Share Tech Mono',monospace", fontWeight: 700, color: !highlight.homeWon ? "#f5c842" : "#f87171" }}>{highlight.awayScore}</span>
                  <span style={{ color: highlight.awayTeam.color || "#94a3b8" }}>{highlight.awayTeam.emoji} {highlight.awayTeam.short}</span>
                  <span className={`bsm ${highlight.label === "大敗" ? "bgr" : "bga"}`} style={{ marginLeft: "auto", padding: "1px 6px", fontSize: 9 }}>{highlight.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <button className="sim-btn" onClick={onEnd}>ハブに戻る →</button>
      </div>
    </div>
  );
}
