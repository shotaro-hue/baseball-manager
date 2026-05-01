import React, { useState } from "react";
import { getFrontOfficePlanPublic } from "../../engine/trade";

const MODE_LABEL = {
  contend: { text: "優勝争い", emoji: "🏆", color: "#f59e0b" },
  retool:  { text: "戦力整備", emoji: "🔧", color: "#60a5fa" },
  rebuild: { text: "再建中",   emoji: "🔄", color: "#a78bfa" },
  neutral: { text: "中立",     emoji: "⚖️", color: "#6b7280" },
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
          fontSize: 12,
        }}>
          {label.emoji} {label.text}
        </span>
        {mode === "rebuild" && rebuildYears > 0 && (
          <span style={{ color: "#a78bfa", fontSize: 11, marginLeft: 6 }}>（{rebuildYears}年目）</span>
        )}
      </td>
      <td style={{ color: mode === "contend" ? "#34d399" : mode === "rebuild" ? "#f87171" : "#9ca3af", fontSize: 12 }}>
        {stance}
      </td>
      <td style={{ fontSize: 11, color: "#6b7280", maxWidth: 200 }}>
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
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        {["セ", "パ"].map(l => (
          <button key={l} onClick={() => setLg(l)} className={`tab ${lg === l ? "on" : ""}`} style={{ flex: 0, padding: "6px 18px" }}>{l}リーグ</button>
        ))}
        <button
          onClick={() => setShowStrategy(s => !s)}
          className={`tab ${showStrategy ? "on" : ""}`}
          style={{ flex: 0, padding: "6px 18px", marginLeft: "auto" }}
        >
          🏢 球団方針
        </button>
      </div>

      {showStrategy ? (
        <div className="card">
          <div style={{ marginBottom: 8, fontWeight: 700, color: "#94a3b8", fontSize: 13 }}>球団フロント方針（{lg}リーグ）</div>
          <div style={{ overflowX: "auto" }}>
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
                      <td><span style={{ color: t.color }}>{t.emoji}</span> <span style={{ color: "#f5c842", fontWeight: 700 }}>{t.name} ★</span></td>
                      <td colSpan={3} style={{ color: "#6b7280", fontSize: 12 }}>あなたのチーム（プレイヤー操作）</td>
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
          <div style={{ overflowX: "auto" }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>順位</th><th>チーム</th><th>試合</th>
                  <th style={{ color: "#34d399" }}>勝</th>
                  <th style={{ color: "#f87171" }}>敗</th>
                  <th>勝率</th><th>G差</th><th>得点</th><th>失点</th><th>得失差</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((t, i) => {
                  const g = t.wins + t.losses + t.draws;
                  const gb = i === 0 ? "—" : (((top.wins - t.wins) + (t.losses - top.losses)) / 2).toFixed(1);
                  const isMe = t.id === myId;
                  return (
                    <tr key={t.id} style={{ background: isMe ? "rgba(245,200,66,.04)" : undefined }}>
                      <td>
                        <span className="mono" style={{ color: i === 0 ? "#ffd700" : i === 1 ? "#94a3b8" : i === 2 ? "#b45309" : "#1e2d3d", fontWeight: 700, fontSize: 15 }}>{i + 1}</span>
                      </td>
                      <td>
                        <button
                          onClick={() => onTeamClick?.(t)}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontWeight: "inherit", padding: 0 }}
                        >
                          <span style={{ color: t.color, marginRight: 5 }}>{t.emoji}</span>
                          <span style={{ fontWeight: isMe ? 700 : 400, color: isMe ? "#f5c842" : undefined }}>{t.name}{isMe && " ★"}</span>
                        </button>
                      </td>
                      <td className="mono">{g}</td>
                      <td className="mono" style={{ color: "#34d399" }}>{t.wins}</td>
                      <td className="mono" style={{ color: "#f87171" }}>{t.losses}</td>
                      <td className="mono">{t.wins + t.losses > 0 ? "." + String(Math.round(t.wins / (t.wins + t.losses) * 1000)).padStart(3, "0") : "---"}</td>
                      <td className="mono" style={{ color: "#374151" }}>{gb}</td>
                      <td className="mono">{t.rf}</td>
                      <td className="mono">{t.ra}</td>
                      <td className="mono" style={{ color: (t.rf - t.ra) > 0 ? "#34d399" : (t.rf - t.ra) < 0 ? "#f87171" : "#374151" }}>
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
