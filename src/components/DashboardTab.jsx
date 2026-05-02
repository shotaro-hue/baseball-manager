import { useMemo } from "react";
import { fmtM, gameDayToDate } from '../utils';
import { getMyMatchup } from '../engine/scheduleGen';
import { MAX_ROSTER } from '../constants';

export function DashboardTab({ myTeam, teams, schedule, gameDay, year, recentResults, mailbox, faPool, onTabSwitch }) {
  // 順位計算
  const leagueStandings = useMemo(() => {
    if (!myTeam || !teams) return { rank: 0, gb: 0, total: 0 };
    const same = [...teams.filter(t => t.league === myTeam.league)].sort((a, b) => {
      const pa = a.wins / Math.max(1, a.wins + a.losses);
      const pb = b.wins / Math.max(1, b.wins + b.losses);
      return pb - pa || (b.rf - b.ra) - (a.rf - a.ra);
    });
    const rank = same.findIndex(t => t.id === myTeam.id) + 1;
    const top = same[0];
    const gb = rank === 1 ? 0 : ((top.wins - myTeam.wins) + (myTeam.losses - top.losses)) / 2;
    return { rank, gb, total: same.length };
  }, [myTeam, teams]);

  // 次の試合
  const nextGame = useMemo(() => {
    if (!schedule || !myTeam) return null;
    const matchup = getMyMatchup(schedule, gameDay + 1, myTeam.id);
    if (!matchup) return null;
    const opp = teams.find(t => t.id === matchup.oppId);
    const date = gameDayToDate(gameDay + 1, schedule);
    return { opp, isHome: matchup.isHome, date, isInterleague: matchup.isInterleague };
  }, [schedule, gameDay, myTeam, teams]);

  // 要対応アクション
  const actions = useMemo(() => {
    if (!myTeam) return [];
    const list = [];
    const over = myTeam.players.filter(p => !p.isIkusei).length - MAX_ROSTER;
    if (over > 0) list.push({ color: "#f87171", label: `ロースター枠超過 +${over}人`, hint: "編成 → ロースター", tab: "roster" });
    const expiring = myTeam.players.filter(p => (p.contractYearsLeft ?? 99) <= 1 && !p.isIkusei).length;
    if (expiring > 0) list.push({ color: "#f5c842", label: `契約満了 ${expiring}人`, hint: "更新交渉が必要", tab: "contract" });
    const trades = mailbox.filter(m => m.type === "trade" && !m.resolved && !m.read).length;
    if (trades > 0) list.push({ color: "#f97316", label: `トレードオファー ${trades}件`, hint: "受諾 / 拒否を判断", tab: "mailbox" });
    const unread = mailbox.filter(m => !m.read && m.type !== "trade").length;
    if (unread > 0) list.push({ color: "#f5c842", label: `未読メール ${unread}件`, hint: "受信箱を確認", tab: "mailbox" });
    const injured = myTeam.players.filter(p => (p.injuryDaysLeft ?? 0) > 0).length;
    if (injured > 0) list.push({ color: "#fb923c", label: `負傷中 ${injured}人`, hint: "登録抹消を検討", tab: "roster" });
    if (faPool.length > 0) list.push({ color: "#94a3b8", label: `FA市場 ${faPool.length}人`, hint: "補強候補を確認", tab: "fa" });
    return list;
  }, [myTeam, mailbox, faPool]);

  const GOAL_LABELS = { champion: "日本一", pennant: "ペナント優勝", cs: "CS出場", rebuild: "再建" };
  const GOAL_COLORS = { champion: "#f5c842", pennant: "#60a5fa", cs: "#34d399", rebuild: "#a78bfa" };

  if (!myTeam) return null;

  const ownerGoal = myTeam.ownerGoal || "cs";
  const ownerTrust = myTeam.ownerTrust ?? 50;
  const trustColor = ownerTrust >= 70 ? "#34d399" : ownerTrust >= 40 ? "#f5c842" : "#f87171";
  const trustLabel = ownerTrust >= 80 ? "全幅の信頼" : ownerTrust >= 60 ? "信頼あり" : ownerTrust >= 40 ? "普通" : ownerTrust >= 30 ? "不安あり" : "危機的";

  const winPct = myTeam.wins + myTeam.losses > 0
    ? (myTeam.wins / (myTeam.wins + myTeam.losses)).toFixed(3).replace(/^0/, "")
    : ".000";
  const runDiff = (myTeam.rf ?? 0) - (myTeam.ra ?? 0);
  const rankClass = leagueStandings.rank === 1 ? "rank-1" : leagueStandings.rank === 2 ? "rank-2" : leagueStandings.rank === 3 ? "rank-3" : "rank-low";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>

      {/* ─── HERO: 順位・勝率・得失差を3層スケールで ─── */}
      <div className="card" style={{ padding: 0, overflow: "hidden", borderColor: "rgba(245,200,66,.12)" }}>
        <div className="hero-block">
          <div style={{ textAlign: "center" }}>
            <div className="hero-meta" style={{ marginBottom: 4 }}>{myTeam.league}リーグ</div>
            <div className={`hero-rank ${rankClass}`}>
              {leagueStandings.rank}<span className="hero-rank-suffix">位</span>
            </div>
            <div className="hero-meta" style={{ marginTop: 6 }}>
              {leagueStandings.rank === 1 ? "首位" : `首位と ${leagueStandings.gb.toFixed(1)} 差`}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-1)" }}>
            <div className="hero-stat-row">
              <div className="hero-stat">
                <div className="hero-stat-num" style={{ color: "var(--gold)" }}>{winPct}</div>
                <div className="hero-stat-lbl">勝率</div>
              </div>
              <div className="hero-stat">
                <div className="hero-stat-num">
                  <span style={{ color: "#34d399" }}>{myTeam.wins}</span>
                  <span style={{ color: "var(--dim)", margin: "0 4px" }}>—</span>
                  <span style={{ color: "#f87171" }}>{myTeam.losses}</span>
                </div>
                <div className="hero-stat-lbl">勝 / 敗</div>
              </div>
              <div className="hero-stat">
                <div className="hero-stat-num" style={{ color: runDiff > 0 ? "#34d399" : runDiff < 0 ? "#f87171" : "var(--text)" }}>
                  {runDiff >= 0 ? "+" : ""}{runDiff}
                </div>
                <div className="hero-stat-lbl">得失差</div>
              </div>
            </div>
          </div>

          <div style={{ textAlign: "right" }}>
            <div className="hero-meta">予算</div>
            <div className="hero-stat-num" style={{ color: "var(--gold)", fontSize: 18 }}>{fmtM(myTeam.budget ?? 0)}</div>
          </div>
        </div>

        {/* Recent 5 games strip */}
        {recentResults.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-1)", padding: "var(--sp-1) var(--sp-2)", borderTop: "1px solid rgba(255,255,255,.04)" }}>
            <span className="hero-meta" style={{ flexShrink: 0 }}>直近</span>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {recentResults.map((r, i) => (
                <div key={i} title={`vs ${r.oppName}  ${r.myScore}-${r.oppScore}`}
                  style={{
                    background: r.drew ? "#475569" : r.won ? "#166534" : "#7f1d1d",
                    color: "#fff", borderRadius: 4, padding: "3px 7px",
                    fontSize: 11, fontWeight: 700, fontFamily: "'Share Tech Mono',monospace",
                  }}>
                  {r.drew ? "△" : r.won ? "○" : "●"}{r.myScore}-{r.oppScore}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ─── 要対応 ─ 判断と行動を分離 ─── */}
      {actions.length > 0 && (
        <div className="card" style={{ borderColor: "rgba(248,113,113,.18)" }}>
          <div className="card-h" style={{ display: "flex", alignItems: "center", gap: 6, color: "#fca5a5" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#f87171" }} />
            要対応 — {actions.length}件
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-1)" }}>
            {actions.map((a, i) => (
              <button key={i} onClick={() => onTabSwitch(a.tab)}
                className="action-item"
                style={{ borderLeftColor: a.color }}>
                <span className="action-dot" style={{ background: a.color }} />
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontWeight: 600 }}>{a.label}</span>
                  {a.hint && <span style={{ fontSize: 10, color: "var(--dim)" }}>{a.hint}</span>}
                </div>
                <span className="action-arrow">→</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ─── 次の試合 ─ 単独カード ─── */}
      <div className="card">
        <div className="card-h">⚾ 次の試合</div>
        {nextGame ? (
          <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
            <span style={{ fontSize: 32 }}>{nextGame.opp?.emoji}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: nextGame.opp?.color }}>{nextGame.opp?.name}</div>
              <div style={{ color: "#94a3b8", fontSize: 11, marginTop: 4, letterSpacing: ".05em" }}>
                {nextGame.date.month}月{nextGame.date.day}日（第{gameDay + 1}戦）
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
              <span className={`chip ${nextGame.isHome ? "cg" : "cb"}`}>{nextGame.isHome ? "🏟 ホーム" : "🚌 アウェイ"}</span>
              {nextGame.isInterleague && <span className="chip cp">🔄 交流戦</span>}
            </div>
          </div>
        ) : (
          <div style={{ color: "#94a3b8", fontSize: 12 }}>試合なし</div>
        )}
      </div>

      {/* ─── オーナー目標・信頼度 ─── */}
      <div className="card">
        <div className="card-h">🎯 オーナー目標 ・ 信頼度</div>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
          <div style={{ flex: 1 }}>
            <div className="hero-stat-lbl" style={{ marginBottom: 4 }}>今季目標</div>
            <span style={{ fontSize: 16, fontWeight: 700, color: GOAL_COLORS[ownerGoal] }}>{GOAL_LABELS[ownerGoal]}</span>
          </div>
          <div style={{ flex: 2 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span className="hero-stat-lbl">信頼度</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: trustColor }}>{ownerTrust} — {trustLabel}</span>
            </div>
            <div style={{ background: "#0d1f35", borderRadius: 4, height: 8, overflow: "hidden" }}>
              <div style={{ width: `${ownerTrust}%`, height: "100%", background: trustColor, borderRadius: 4, transition: ".3s" }} />
            </div>
            {ownerTrust < 30 && <div style={{ fontSize: 10, color: "#f87171", marginTop: 4 }}>⚠ 翌年予算 -20%</div>}
            {ownerTrust > 80 && <div style={{ fontSize: 10, color: "#34d399", marginTop: 4 }}>✓ 翌年予算 +15%</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
