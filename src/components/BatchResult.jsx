import { useMemo } from "react";

/* ═══════════════════════════════════════════════
   BATCH RESULT SCREEN
═══════════════════════════════════════════════ */
export function BatchResultScreen({ results, batchMeta, myTeam, onEnd, onViewDetail }) {
  const wins = results.filter(r => r.won).length;
  const losses = results.length - wins;

  // パフォーマンスハイライトを全試合ログから集計
  const perfHighlights = useMemo(() => {
    const hrCounts = {};
    let biggestWin = null;
    let biggestLoss = null;
    for (const r of results) {
      const margin = r.score.my - r.score.opp;
      if (r.won && (!biggestWin || margin > biggestWin.margin)) biggestWin = { oppName: r.oppTeam?.short || "?", my: r.score.my, opp: r.score.opp, margin };
      if (!r.won && r.score.my !== r.score.opp && (!biggestLoss || margin < biggestLoss.margin)) biggestLoss = { oppName: r.oppTeam?.short || "?", my: r.score.my, opp: r.score.opp, margin };
      for (const e of (r.log || [])) {
        if (e.result === "hr" && e.isTop === false) {
          hrCounts[e.batter] = (hrCounts[e.batter] || 0) + 1;
        }
      }
    }
    const hrList = Object.entries(hrCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);
    return { hrList, biggestWin, biggestLoss };
  }, [results]);

  // 順位変動の色とアイコン
  const rankDelta = batchMeta ? batchMeta.beforeRank - batchMeta.afterRank : 0;
  const rankColor = rankDelta > 0 ? "#34d399" : rankDelta < 0 ? "#f87171" : "#94a3b8";
  const rankArrow = rankDelta > 0 ? "▲" : rankDelta < 0 ? "▼" : "−";

  return (
    <div className="app">
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "16px 12px" }}>

        {/* サマリーヘッダー */}
        <div className="card" style={{ textAlign: "center", marginBottom: 12 }}>
          <div style={{ fontFamily: "'Bebas Neue',cursive", fontSize: 42, letterSpacing: ".1em", color: wins > losses ? "#f5c842" : wins < losses ? "#f87171" : "#94a3b8", marginBottom: 4 }}>
            {wins}勝 {losses}敗
          </div>
          <div style={{ fontSize: 12, color: "#374151", marginBottom: 10 }}>第{results[0]?.gameNo}〜{results[results.length - 1]?.gameNo}戦 / {results.length}試合</div>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            {results.map((r, i) => (
              <button key={i} onClick={() => onViewDetail(r)}
                className={`bsm ${r.won ? "bga" : "bgr"}`}
                style={{ minWidth: 70, padding: "7px 10px", fontSize: 12 }}>
                <span style={{ fontSize: 9, display: "block", color: "inherit", opacity: .7 }}>第{r.gameNo}戦</span>
                {r.oppTeam?.short} {r.score.my}-{r.score.opp}
                <span style={{ marginLeft: 4 }}>{r.won ? "✓" : "✗"}</span>
              </button>
            ))}
          </div>
        </div>

        {/* バッチメタ: 3カラム要約 */}
        {batchMeta && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
            {/* 順位変動 */}
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

            {/* パフォーマンスハイライト */}
            <div className="card" style={{ padding: "12px 10px", marginBottom: 0 }}>
              <div className="card-h" style={{ marginBottom: 8 }}>打撃ハイライト</div>
              {perfHighlights.hrList.length > 0
                ? perfHighlights.hrList.map(([name, cnt], i) => (
                  <div key={i} style={{ fontSize: 11, color: "#f5c842", marginBottom: 2 }}>
                    ⚾ {name} <span style={{ fontWeight: 700 }}>{cnt}HR</span>
                  </div>
                ))
                : <div style={{ fontSize: 11, color: "#374151" }}>本塁打なし</div>
              }
              {perfHighlights.biggestWin && (
                <div style={{ fontSize: 10, color: "#34d399", marginTop: 4 }}>
                  最大勝: {perfHighlights.biggestWin.my}-{perfHighlights.biggestWin.opp} vs {perfHighlights.biggestWin.oppName}
                </div>
              )}
              {perfHighlights.biggestLoss && (
                <div style={{ fontSize: 10, color: "#f87171", marginTop: 2 }}>
                  最大敗: {perfHighlights.biggestLoss.my}-{perfHighlights.biggestLoss.opp} vs {perfHighlights.biggestLoss.oppName}
                </div>
              )}
            </div>

            {/* 負傷アラート */}
            <div className="card" style={{ padding: "12px 10px", marginBottom: 0 }}>
              <div className="card-h" style={{ marginBottom: 8 }}>負傷アラート</div>
              {batchMeta.injuries.length === 0
                ? <div style={{ fontSize: 11, color: "#374151" }}>負傷なし</div>
                : batchMeta.injuries.slice(0, 4).map((inj, i) => (
                  <div key={i} style={{ fontSize: 10, color: inj.days >= 31 ? "#f87171" : inj.days >= 15 ? "#f5c842" : "#94a3b8", marginBottom: 3 }}>
                    {inj.name}
                    <span style={{ fontSize: 9, color: "#374151", marginLeft: 3 }}>{inj.type} {inj.days}日</span>
                  </div>
                ))
              }
              {batchMeta.injuries.length > 4 && (
                <div style={{ fontSize: 9, color: "#374151" }}>他 {batchMeta.injuries.length - 4}名</div>
              )}
            </div>
          </div>
        )}

        {/* CPU試合ハイライト */}
        {batchMeta && batchMeta.cpuHighlights.length > 0 && (
          <div className="card" style={{ marginBottom: 12 }}>
            <div className="card-h">同日リーグ注目試合</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {batchMeta.cpuHighlights.slice(0, 5).map((h, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 6px", background: "rgba(0,0,0,.2)", borderRadius: 5, fontSize: 11 }}>
                  <span style={{ color: h.homeTeam.color || "#94a3b8" }}>{h.homeTeam.emoji} {h.homeTeam.short}</span>
                  <span style={{ fontFamily: "'Share Tech Mono',monospace", fontWeight: 700, color: h.homeWon ? "#f5c842" : "#f87171" }}>{h.homeScore}</span>
                  <span style={{ color: "#374151" }}>−</span>
                  <span style={{ fontFamily: "'Share Tech Mono',monospace", fontWeight: 700, color: !h.homeWon ? "#f5c842" : "#f87171" }}>{h.awayScore}</span>
                  <span style={{ color: h.awayTeam.color || "#94a3b8" }}>{h.awayTeam.emoji} {h.awayTeam.short}</span>
                  <span className={`bsm ${h.label === "大勝" ? "bgr" : "bga"}`} style={{ marginLeft: "auto", padding: "1px 6px", fontSize: 9 }}>{h.label}</span>
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
/* ═══════════════════════════════════════════════
   MODE SELECT SCREEN
═══════════════════════════════════════════════ */
