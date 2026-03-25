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
    if (over > 0) list.push({ color: "#f87171", label: `ロースター枠超過 +${over}人`, tab: "roster" });
    const expiring = myTeam.players.filter(p => (p.contractYearsLeft ?? 99) <= 1 && !p.isIkusei).length;
    if (expiring > 0) list.push({ color: "#f5c842", label: `契約満了 ${expiring}人`, tab: "contract" });
    const trades = mailbox.filter(m => m.type === "trade" && !m.resolved && !m.read).length;
    if (trades > 0) list.push({ color: "#f97316", label: `トレードオファー ${trades}件`, tab: "mailbox" });
    const unread = mailbox.filter(m => !m.read && m.type !== "trade").length;
    if (unread > 0) list.push({ color: "#f5c842", label: `未読メール ${unread}件`, tab: "mailbox" });
    const injured = myTeam.players.filter(p => (p.injuryDaysLeft ?? 0) > 0).length;
    if (injured > 0) list.push({ color: "#fb923c", label: `負傷中 ${injured}人`, tab: "roster" });
    if (faPool.length > 0) list.push({ color: "#94a3b8", label: `FA市場 ${faPool.length}人`, tab: "fa" });
    return list;
  }, [myTeam, mailbox, faPool]);

  if (!myTeam) return null;

  const winPct = myTeam.wins + myTeam.losses > 0
    ? (myTeam.wins / (myTeam.wins + myTeam.losses)).toFixed(3).replace(/^0/, "")
    : ".000";
  const runDiff = (myTeam.rf ?? 0) - (myTeam.ra ?? 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

      {/* チーム概況 */}
      <div className="card">
        <div className="card-h">📊 チーム概況</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6, marginTop: 6 }}>
          <Stat label="順位" value={`${leagueStandings.rank}位`} color={leagueStandings.rank === 1 ? "#f5c842" : undefined} />
          <Stat label="GB" value={leagueStandings.rank === 1 ? "—" : leagueStandings.gb.toFixed(1)} />
          <Stat label="勝率" value={winPct} />
          <Stat label="得失差" value={(runDiff >= 0 ? "+" : "") + runDiff} color={runDiff > 0 ? "#4ade80" : runDiff < 0 ? "#f87171" : undefined} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginTop: 6 }}>
          <Stat label="勝" value={myTeam.wins} />
          <Stat label="敗" value={myTeam.losses} />
          <Stat label="予算" value={fmtM(myTeam.budget ?? 0)} />
        </div>
      </div>

      {/* 次の試合 + 直近5試合 */}
      <div className="card">
        <div style={{ display: "grid", gridTemplateColumns: nextGame ? "1fr 1fr" : "1fr", gap: 10 }}>
          {/* 次の試合 */}
          <div>
            <div className="card-h" style={{ marginBottom: 6 }}>⚾ 次の試合</div>
            {nextGame ? (
              <div style={{ fontSize: 13 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>
                  {nextGame.opp?.emoji} {nextGame.opp?.name}
                </div>
                <div style={{ color: "#9ca3af", fontSize: 11, marginTop: 2 }}>
                  {nextGame.date.month}月{nextGame.date.day}日（第{gameDay + 1}戦）
                  {" "}{nextGame.isHome ? "🏟 ホーム" : "🚌 アウェイ"}
                  {nextGame.isInterleague && " 🔄交流戦"}
                </div>
              </div>
            ) : (
              <div style={{ color: "#9ca3af", fontSize: 12 }}>試合なし</div>
            )}
          </div>

          {/* 直近5試合 */}
          <div>
            <div className="card-h" style={{ marginBottom: 6 }}>📈 直近5試合</div>
            {recentResults.length > 0 ? (
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {recentResults.map((r, i) => (
                  <div key={i} title={`vs ${r.oppName}  ${r.myScore}-${r.oppScore}`}
                    style={{
                      background: r.drew ? "#6b7280" : r.won ? "#166534" : "#7f1d1d",
                      color: "#fff", borderRadius: 4, padding: "3px 7px",
                      fontSize: 11, fontWeight: 700, cursor: "default"
                    }}>
                    {r.drew ? "△" : r.won ? "○" : "●"}{r.myScore}-{r.oppScore}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: "#9ca3af", fontSize: 12 }}>試合結果なし</div>
            )}
          </div>
        </div>
      </div>

      {/* 要対応アクション */}
      {actions.length > 0 && (
        <div className="card">
          <div className="card-h">⚠️ 要対応アクション</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 6 }}>
            {actions.map((a, i) => (
              <button key={i} onClick={() => onTabSwitch(a.tab)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  background: "transparent", border: `1px solid ${a.color}22`,
                  borderLeft: `3px solid ${a.color}`, borderRadius: 4,
                  padding: "5px 10px", cursor: "pointer", textAlign: "left",
                  color: "#e5e7eb", fontSize: 12
                }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: a.color, flexShrink: 0 }} />
                {a.label}
                <span style={{ marginLeft: "auto", color: "#6b7280", fontSize: 11 }}>→</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{ textAlign: "center", background: "#0d1f35", borderRadius: 6, padding: "6px 4px" }}>
      <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: color ?? "#e5e7eb" }}>{value}</div>
    </div>
  );
}
