import React, { useState } from "react";
import { getFrontOfficePlanPublic } from "../../engine/trade";

const MODE_LABEL = {
  contend: { text: "優勝争い", emoji: "🏆", color: "#f59e0b" },
  retool:  { text: "戦力整備", emoji: "🔧", color: "#095cc7" },
  rebuild: { text: "再建中",   emoji: "🔄", color: "#7050ad" },
  neutral: { text: "中立",     emoji: "⚖️", color: "#53657c" },
};

function TeamStrategyRow({ team, isMe }) {
  if (isMe) return null;
  const plan = getFrontOfficePlanPublic(team);
  const mode = plan?.mode || "neutral";
  const label = MODE_LABEL[mode] || MODE_LABEL.neutral;
  const stance = mode === "contend" ? "買い手" : mode === "rebuild" ? "売り手" : "中立";
  const rebuildYears = plan?.rebuildYears ?? 0;
  return (
    <tr>
      <td><span style={{ color: team.color }}>{team.emoji}</span> {team.name}</td>
      <td>
        <span style={{
          background: label.color + "22",
          color: label.color,
          borderRadius: 4,
          padding: "2px 7px",
          fontWeight: 700,
          fontSize: 14,
        }}>
          {label.emoji} {label.text}
        </span>
        {mode === "rebuild" && rebuildYears > 0 && (
          <span style={{ color: "#7050ad", fontSize: 14, marginLeft: 6 }}>（{rebuildYears}年目）</span>
        )}
      </td>
      <td style={{ color: mode === "contend" ? "#14714b" : mode === "rebuild" ? "#b42332" : "#53657c", fontSize: 14 }}>
        {stance}
      </td>
      <td style={{ fontSize: 14, color: "#53657c", maxWidth: 200 }}>
        {plan?.reasons?.[0] || ""}
      </td>
    </tr>
  );
}

export function StandingsTab({ teams, myId, onTeamClick }) {
  const myLeague = teams.find(t => t.id === myId)?.league;
  const [lg, setLg] = useState(myLeague || "セ");
  const [showStrategy, setShowStrategy] = useState(false);

  const sorted = [...teams.filter(t => t.league === lg)].sort((a, b) => {
    const pa = a.wins / Math.max(1, a.wins + a.losses);
    const pb = b.wins / Math.max(1, b.wins + b.losses);
    return pb - pa || (b.rf - b.ra) - (a.rf - a.ra);
  });
  const top = sorted[0];

  return (
    <div className="calm-detail detail-standings">
      <h1>順位表</h1>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        {["セ", "パ"].map(l => (
          <button key={l} aria-pressed={lg === l} onClick={() => setLg(l)} className={`tab ${lg === l ? "on" : ""}`} style={{ flex: 0, padding: "6px 18px" }}>{l}リーグ</button>
        ))}
        <button
          aria-pressed={showStrategy} onClick={() => setShowStrategy(s => !s)}
          className={`tab ${showStrategy ? "on" : ""}`}
          style={{ flex: 0, padding: "6px 18px", marginLeft: "auto" }}
        >
          🏢 球団方針
        </button>
      </div>

      {showStrategy ? (
        <div className="card">
          <div style={{ marginBottom: 8, fontWeight: 700, color: "#53657c", fontSize: 13 }}>球団フロント方針（{lg}リーグ）</div>
          <div className="detail-table-scroll" tabIndex={0} role="region" aria-label="成績表。横にスクロールできます">
            <table className="tbl">
              <thead>
                <tr>
                  <th>チーム</th>
                  <th>方針</th>
                  <th>トレード姿勢</th>
                  <th>理由</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(t => (
                  t.id === myId ? (
                    <tr key={t.id}>
                      <td><span style={{ color: t.color }}>{t.emoji}</span> <span style={{ color: "#805700", fontWeight: 700 }}>{t.name} ★</span></td>
                      <td colSpan={3} style={{ color: "#53657c", fontSize: 14 }}>あなたのチーム（プレイヤー操作）</td>
                    </tr>
                  ) : (
                    <TeamStrategyRow key={t.id} team={t} isMe={false} />
                  )
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="detail-table-scroll" tabIndex={0} role="region" aria-label="成績表。横にスクロールできます">
            <table className="tbl standings-tbl">
              <thead>
                <tr>
                  <th style={{ width: 56 }}>順位</th><th>チーム</th><th>試合</th>
                  <th style={{ color: "#14714b" }}>勝</th>
                  <th style={{ color: "#b42332" }}>敗</th>
                  <th>勝率</th><th>G差</th><th>得点</th><th>失点</th><th>得失差</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((t, i) => {
                  const g = t.wins + t.losses + t.draws;
                  const gb = i === 0 ? "—" : (((top.wins - t.wins) + (t.losses - top.losses)) / 2).toFixed(1);
                  const isMe = t.id === myId;
                  const rankCls = i === 0 ? "rank-1" : i === 1 ? "rank-2" : i === 2 ? "rank-3" : "rank-low";
                  // 3-tier size: top-3 = hero, mid = major, lower = meta
                  const rankSize = i < 3 ? 32 : 22;
                  const winPct = t.wins + t.losses > 0 ? (t.wins / (t.wins + t.losses)).toFixed(3).replace(/^0/, "") : "---";
                  return (
                    <tr key={t.id} style={{ background: isMe ? "rgba(245,200,66,.05)" : undefined, borderLeft: isMe ? "3px solid var(--gold)" : "3px solid transparent" }}>
                      <td style={{ paddingLeft: 10 }}>
                        <span className={rankCls} style={{ fontFamily: "'Bebas Neue',cursive", fontSize: rankSize, fontWeight: 400, lineHeight: 1, letterSpacing: 0 }}>
                          {i + 1}
                        </span>
                      </td>
                      <td>
                        <button
                          onClick={() => onTeamClick?.(t)}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontWeight: "inherit", padding: 0 }}
                        >
                          <span style={{ color: t.color, marginRight: 5 }}>{t.emoji}</span>
                          <span style={{ fontWeight: isMe ? 700 : 500, color: isMe ? "#805700" : undefined }}>{t.name}{isMe && " ★"}</span>
                        </button>
                      </td>
                      <td className="mono">{g}</td>
                      <td className="mono" style={{ color: "#14714b" }}>{t.wins}</td>
                      <td className="mono" style={{ color: "#b42332" }}>{t.losses}</td>
                      <td className="mono" style={{ fontSize: i < 3 ? 14 : 12, fontWeight: i < 3 ? 700 : 400, color: i < 3 ? "var(--gold)" : undefined }}>{winPct}</td>
                      <td className="mono" style={{ color: i === 0 ? "var(--gold)" : "#53657c" }}>{gb}</td>
                      <td className="mono">{t.rf}</td>
                      <td className="mono">{t.ra}</td>
                      <td className="mono" style={{ color: (t.rf - t.ra) > 0 ? "#14714b" : (t.rf - t.ra) < 0 ? "#b42332" : "#53657c" }}>
                        {(t.rf - t.ra) > 0 ? "+" : ""}{t.rf - t.ra}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
