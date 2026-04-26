import React, { useState, useMemo } from "react";
import { fmtAvg, fmtIP, fmtPct } from "../../utils";
import { saberBatter, saberPitcher } from "../../engine/sabermetrics";
import { SEASON_GAMES } from "../../constants";

const MEDAL = ["🥇", "🥈", "🥉"];
const LEAGUES = ["全体", "セ", "パ"];

// isRate: true の列は「規定のみ」トグルの対象
const BATTER_COLS = [
  { key: "PA",    label: "打席",   fmt: p => p.stats.PA,                                                                 asc: false },
  { key: "AVG",   label: "打率",   fmt: p => fmtAvg(p.stats.H, p.stats.AB),  num: p => { const ab=p.stats.AB||0; return ab>0?p.stats.H/ab:0; }, asc: false, isRate: true },
  { key: "HR",    label: "本塁打", fmt: p => p.stats.HR,                                                                 asc: false },
  { key: "RBI",   label: "打点",   fmt: p => p.stats.RBI,                                                                asc: false },
  { key: "SB",    label: "盗塁",   fmt: p => p.stats.SB,                                                                 asc: false },
  { key: "OPS",   label: "OPS",   fmt: p => { const v=saberBatter(p.stats).OPS; return v>0?v.toFixed(3):"---"; },        asc: false, isRate: true, num: p => saberBatter(p.stats).OPS },
  { key: "wOBA",  label: "wOBA",  fmt: p => { const v=saberBatter(p.stats).wOBA; return v>0?v.toFixed(3):"---"; },       asc: false, isRate: true, num: p => saberBatter(p.stats).wOBA },
  { key: "wRCp",  label: "wRC+",  fmt: p => saberBatter(p.stats).wRCp ?? "---",                                          asc: false, isRate: true, num: p => saberBatter(p.stats).wRCp ?? 0 },
  { key: "ISO",   label: "ISO",   fmt: p => { const v=saberBatter(p.stats).ISO; return v>0?v.toFixed(3):"---"; },        asc: false, isRate: true, num: p => saberBatter(p.stats).ISO },
  { key: "BBpct", label: "四球率", fmt: p => { const v=saberBatter(p.stats).BBpct; return v>0?fmtPct(v):"---"; },        asc: false, isRate: true, num: p => saberBatter(p.stats).BBpct },
  { key: "Kpct",  label: "三振率", fmt: p => { const v=saberBatter(p.stats).Kpct; return v>0?fmtPct(v):"---"; },         asc: true,  isRate: true, num: p => saberBatter(p.stats).Kpct },
  { key: "WAR",   label: "WAR",   fmt: p => saberBatter(p.stats).WAR ?? "---",                                           asc: false, isRate: true, num: p => saberBatter(p.stats).WAR ?? 0 },
];

const PITCHER_COLS = [
  { key: "W",     label: "勝",     fmt: p => p.stats.W,                                                                  asc: false },
  { key: "SV",    label: "S",      fmt: p => p.stats.SV || "-",                                                          asc: false },
  { key: "HLD",   label: "H",      fmt: p => p.stats.HLD || "-",                                                         asc: false },
  { key: "QS",    label: "QS",    fmt: p => p.stats.QS || "-",                                                           asc: false },
  { key: "IP",    label: "投球回", fmt: p => p.stats.IP>0?fmtIP(p.stats.IP):"---",                                       asc: false, num: p => p.stats.IP },
  { key: "ERA",   label: "防御率", fmt: p => { const v=saberPitcher(p.stats).ERA; return v>0?v:"---"; },                  asc: true,  isRate: true, num: p => saberPitcher(p.stats).ERA || 999 },
  { key: "Kp",    label: "奪三振", fmt: p => p.stats.Kp || "-",                                                          asc: false },
  { key: "WHIP",  label: "WHIP",  fmt: p => { const v=saberPitcher(p.stats).WHIP; return v>0?v:"---"; },                 asc: true,  isRate: true, num: p => saberPitcher(p.stats).WHIP || 999 },
  { key: "FIP",   label: "FIP",   fmt: p => { const v=saberPitcher(p.stats).FIP; return v>0?v:"---"; },                  asc: true,  isRate: true, num: p => saberPitcher(p.stats).FIP || 999 },
  { key: "Kpct",  label: "三振率", fmt: p => { const v=saberPitcher(p.stats).Kpct; return v>0?fmtPct(v):"---"; },        asc: false, isRate: true, num: p => saberPitcher(p.stats).Kpct },
  { key: "BBpct", label: "四球率", fmt: p => { const v=saberPitcher(p.stats).BBpct; return v>0?fmtPct(v):"---"; },       asc: true,  isRate: true, num: p => saberPitcher(p.stats).BBpct || 999 },
  { key: "WAR",   label: "WAR",   fmt: p => { const v=saberPitcher(p.stats).WAR; return v!==0?v:"---"; },                asc: false, isRate: true, num: p => saberPitcher(p.stats).WAR ?? 0 },
];

function numOf(col, p) {
  if (col.num) return col.num(p);
  const v = col.fmt(p);
  return typeof v === "number" ? v : (parseFloat(v) || 0);
}

// 規定打席 / 規定投球回をゲーム進行度に合わせてスケール
function calcQualified(gameDay) {
  const played = Math.max(1, gameDay - 1);
  return {
    pa: Math.max(10, Math.floor(played * 3.1)),
    ip: Math.max(5, played),
  };
}

export function LeaderboardTab({ teams, myId, gameDay = 1 }) {
  const [view, setView]           = useState("batter");
  const [league, setLeague]       = useState("全体");
  const [sortKey, setSortKey]     = useState("OPS");
  const [sortAsc, setSortAsc]     = useState(false);
  const [qualifiedOnly, setQualifiedOnly] = useState(false);

  const cols = view === "batter" ? BATTER_COLS : PITCHER_COLS;
  const qualified = useMemo(() => calcQualified(gameDay), [gameDay]);

  const handleViewChange = (v) => {
    setView(v);
    setSortKey(v === "batter" ? "OPS" : "ERA");
    setSortAsc(v === "batter" ? false : true);
  };

  const handleSort = (col) => {
    if (sortKey === col.key) setSortAsc(a => !a);
    else { setSortKey(col.key); setSortAsc(col.asc); }
  };

  // 全選手にチーム情報を付与
  const allPlayers = useMemo(() => {
    const arr = [];
    for (const t of teams) {
      for (const p of t.players) {
        arr.push({ ...p, _teamName: t.name, _teamShort: t.short, _teamColor: t.color, _teamEmoji: t.emoji, _league: t.league, _isMyTeam: t.id === myId });
      }
    }
    return arr;
  }, [teams, myId]);

  const sortCol = cols.find(c => c.key === sortKey) ?? cols[0];
  const isRateSort = !!sortCol.isRate;

  // フィルタリング（リーグ → 最低出場 → 規定）
  const filtered = useMemo(() => {
    let base = view === "batter"
      ? allPlayers.filter(p => !p.isPitcher && (p.stats?.PA || 0) >= 10)
      : allPlayers.filter(p => p.isPitcher && (p.stats?.IP || 0) >= 5);

    if (league !== "全体") base = base.filter(p => p._league === league);

    if (qualifiedOnly && isRateSort) {
      base = view === "batter"
        ? base.filter(p => (p.stats?.PA || 0) >= qualified.pa)
        : base.filter(p => (p.stats?.IP || 0) >= qualified.ip);
    }

    return base;
  }, [allPlayers, view, league, qualifiedOnly, isRateSort, qualified]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const va = numOf(sortCol, a);
      const vb = numOf(sortCol, b);
      return sortAsc ? va - vb : vb - va;
    });
  }, [filtered, sortCol, sortAsc]);

  // 上位3名（"---" / "999" は除外）
  const top3 = useMemo(() => {
    return sorted.filter(p => {
      const v = sortCol.fmt(p);
      return v !== "---" && v !== "-" && String(v) !== "999";
    }).slice(0, 3);
  }, [sorted, sortCol]);

  const leagueLabel = league === "全体" ? "全球団" : league + "リーグ";
  const qualThreshLabel = view === "batter"
    ? `規定打席: ${qualified.pa}`
    : `規定投球回: ${fmtIP(qualified.ip)}`;

  return (
    <div>
      {/* 打者/投手 切替 */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
        <div className="tabs" style={{ margin: 0 }}>
          {[["batter", "🏏 打者"], ["pitcher", "⚾ 投手"]].map(([k, l]) => (
            <button key={k} onClick={() => handleViewChange(k)} className={`tab ${view === k ? "on" : ""}`}>{l}</button>
          ))}
        </div>

        {/* リーグ切替 */}
        <div style={{ display: "flex", gap: 4 }}>
          {LEAGUES.map(lg => (
            <button
              key={lg}
              onClick={() => setLeague(lg)}
              style={{
                padding: "3px 10px",
                fontSize: 11,
                fontWeight: 700,
                borderRadius: 6,
                border: `1px solid ${league === lg ? (lg==="セ"?"rgba(96,165,250,.8)":lg==="パ"?"rgba(167,139,250,.8)":"rgba(255,255,255,.3)") : "rgba(255,255,255,.1)"}`,
                background: league === lg ? (lg==="セ"?"rgba(96,165,250,.2)":lg==="パ"?"rgba(167,139,250,.2)":"rgba(255,255,255,.08)") : "transparent",
                color: league === lg ? (lg==="セ"?"#93c5fd":lg==="パ"?"#c4b5fd":"#e2e8f0") : "#475569",
                cursor: "pointer",
              }}
            >
              {lg === "全体" ? "全体" : lg + "リーグ"}
            </button>
          ))}
        </div>

        {/* 規定のみトグル（レート指標の時だけ活性） */}
        <label style={{
          display: "flex", alignItems: "center", gap: 5, fontSize: 11, cursor: "pointer",
          color: qualifiedOnly ? "#34d399" : "#475569",
          opacity: isRateSort ? 1 : 0.4,
          userSelect: "none",
        }}>
          <input
            type="checkbox"
            checked={qualifiedOnly}
            onChange={e => setQualifiedOnly(e.target.checked)}
            disabled={!isRateSort}
            style={{ accentColor: "#34d399", cursor: isRateSort ? "pointer" : "not-allowed" }}
          />
          規定達成のみ
          {isRateSort && (
            <span style={{ fontSize: 9, color: "#475569", marginLeft: 2 }}>({qualThreshLabel})</span>
          )}
        </label>
      </div>

      {/* 上位3名カード */}
      {top3.length > 0 && (
        <div className="card" style={{ marginBottom: 10 }}>
          <div className="card-h" style={{ marginBottom: 8 }}>
            {leagueLabel} {sortCol.label} 上位3選手
            {qualifiedOnly && isRateSort && (
              <span style={{ fontSize: 9, color: "#34d399", marginLeft: 8, fontWeight: 400 }}>規定達成者のみ</span>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            {top3.map((p, i) => (
              <div key={p.id} style={{
                background: i === 0 ? "linear-gradient(135deg,rgba(245,200,66,.12),rgba(245,200,66,.04))"
                  : i === 1 ? "linear-gradient(135deg,rgba(148,163,184,.12),rgba(148,163,184,.04))"
                  : "linear-gradient(135deg,rgba(180,120,60,.12),rgba(180,120,60,.04))",
                border: `1px solid ${i===0?"rgba(245,200,66,.4)":i===1?"rgba(148,163,184,.4)":"rgba(180,120,60,.4)"}`,
                borderRadius: 8,
                padding: "8px 10px",
              }}>
                <div style={{ fontSize: 18, lineHeight: 1 }}>{MEDAL[i]}</div>
                <div style={{ fontWeight: 700, fontSize: 13, marginTop: 4, color: p._isMyTeam ? "#60a5fa" : "#e2e8f0" }}>
                  {p.name}
                </div>
                <div style={{ fontSize: 10, color: "#374151", marginTop: 2 }}>
                  <span style={{ color: p._teamColor || "#94a3b8" }}>{p._teamEmoji} {p._teamShort}</span>
                  <span style={{ marginLeft: 4, color: p._league === "セ" ? "#93c5fd" : "#c4b5fd" }}>{p._league}</span>
                  <span style={{ marginLeft: 4 }}>{p.pos} / {p.age}歳</span>
                </div>
                <div style={{ fontSize: 20, fontWeight: 900, fontFamily: "'Share Tech Mono',monospace", color: "#f5c842", marginTop: 4 }}>
                  {sortCol.fmt(p)}
                </div>
                <div style={{ fontSize: 9, color: "#475569", marginTop: 2 }}>
                  {view === "batter" ? `打席: ${p.stats?.PA ?? 0}` : `投球回: ${p.stats?.IP > 0 ? fmtIP(p.stats.IP) : "0"}`}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ランキングテーブル */}
      <div className="card">
        <div className="card-h" style={{ marginBottom: 6 }}>
          {leagueLabel} {view === "batter" ? "打者" : "投手"} ランキング
          <span style={{ fontSize: 10, color: "#475569", marginLeft: 8, fontWeight: 400 }}>
            {filtered.length}名 / 列ヘッダーでソート
          </span>
          {qualifiedOnly && isRateSort && (
            <span style={{ fontSize: 9, color: "#34d399", marginLeft: 8, fontWeight: 400 }}>
              {qualThreshLabel}以上のみ表示
            </span>
          )}
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 30, textAlign: "center" }}>#</th>
                <th>選手</th>
                <th>球団</th>
                {league === "全体" && <th style={{ fontSize: 9, color: "#475569" }}>L</th>}
                {view === "pitcher" && <th style={{ fontSize: 10 }}>役割</th>}
                {cols.map(col => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col)}
                    style={{
                      cursor: "pointer",
                      color: sortKey === col.key ? "#f5c842" : undefined,
                      whiteSpace: "nowrap",
                      userSelect: "none",
                    }}
                    title={col.isRate ? `${col.label}でソート（レート指標）` : `${col.label}でソート`}
                  >
                    {col.label}
                    {col.isRate && <span style={{ fontSize: 7, color: "#475569", marginLeft: 1 }}>*</span>}
                    {sortKey === col.key && (
                      <span style={{ marginLeft: 3, fontSize: 9 }}>{sortAsc ? "▲" : "▼"}</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((p, idx) => {
                const isTop3 = idx < 3;
                const rowBg = isTop3
                  ? idx === 0 ? "rgba(245,200,66,.06)" : idx === 1 ? "rgba(148,163,184,.04)" : "rgba(180,120,60,.04)"
                  : undefined;
                return (
                  <tr key={p.id} style={{ background: rowBg }}>
                    <td style={{ textAlign: "center", fontWeight: isTop3 ? 700 : 400, color: isTop3 ? "#f5c842" : "#475569", fontSize: 11 }}>
                      {isTop3 ? MEDAL[idx] : idx + 1}
                    </td>
                    <td style={{ fontWeight: 700, fontSize: 12, color: p._isMyTeam ? "#60a5fa" : "#e2e8f0", whiteSpace: "nowrap" }}>
                      {p.name}
                      {p._isMyTeam && <span style={{ fontSize: 8, color: "#60a5fa", marginLeft: 4, background: "rgba(96,165,250,.15)", padding: "1px 3px", borderRadius: 3 }}>自</span>}
                    </td>
                    <td style={{ fontSize: 10, whiteSpace: "nowrap" }}>
                      <span style={{ color: p._teamColor || "#94a3b8" }}>{p._teamEmoji}</span>
                      <span style={{ color: "#94a3b8", marginLeft: 3 }}>{p._teamShort}</span>
                    </td>
                    {league === "全体" && (
                      <td style={{ fontSize: 9, color: p._league === "セ" ? "#93c5fd" : "#c4b5fd" }}>{p._league}</td>
                    )}
                    {view === "pitcher" && <td style={{ fontSize: 10, color: "#374151" }}>{p.subtype}</td>}
                    {cols.map(col => {
                      const val = col.fmt(p);
                      const isSort = col.key === sortKey;
                      return (
                        <td key={col.key} className="mono" style={{ color: isSort ? "#f5c842" : undefined, fontWeight: isSort && isTop3 ? 700 : undefined }}>
                          {val}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {isRateSort && (
          <div style={{ fontSize: 9, color: "#334155", marginTop: 6, paddingTop: 6, borderTop: "1px solid rgba(255,255,255,.04)" }}>
            * レート指標。「規定達成のみ」チェックで{qualThreshLabel}以上に絞り込み可能。
          </div>
        )}
      </div>
    </div>
  );
}
