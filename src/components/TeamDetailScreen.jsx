import { useEffect, useMemo, useState } from 'react';
import { fmtAvg, fmtOBP, fmtIP, gameDayToDate } from '../utils';
import { BoxScoreModal } from './BoxScoreModal';

const MONTH_LABELS = [3, 4, 5, 6, 7, 8, 9, 10];

function weekdayShort(year, date) {
  if (!date) return '';
  return ['日', '月', '火', '水', '木', '金', '土'][new Date(year, date.month - 1, date.day).getDay()];
}

function calcWinPct(wins = 0, losses = 0) {
  const total = wins + losses;
  return total > 0 ? wins / total : 0;
}

function fmtWinPctNumber(pct) {
  return '.' + Math.round((pct || 0) * 1000).toString().padStart(3, '0');
}

function buildWeakPositionTags(team) {
  const players = (team?.players || []).filter(p => !p.isPitcher);
  if (players.length === 0) return [];
  const posMap = new Map();
  players.forEach(p => {
    const pos = p.pos || '不明';
    if (!posMap.has(pos)) posMap.set(pos, []);
    posMap.get(pos).push(p);
  });
  const tags = [];
  posMap.forEach((list, pos) => {
    const count = list.length;
    const topPa = [...list].sort((a, b) => (b.stats?.PA || 0) - (a.stats?.PA || 0))[0];
    const avg = fmtAvg(topPa?.stats?.H || 0, topPa?.stats?.AB || 0);
    const avgNum = Number(avg);
    if (count <= 1) tags.push({ pos, reason: '層薄' });
    if (!Number.isNaN(avgNum) && avgNum > 0 && avgNum < 0.23) tags.push({ pos, reason: '打率低' });
  });
  return tags.slice(0, 4);
}

function buildTeamArchetype(team) {
  const players = team?.players || [];
  const batters = players.filter(p => !p.isPitcher);
  const pitchers = players.filter(p => p.isPitcher);
  const hrTotal = batters.reduce((s, p) => s + (p.stats?.HR || 0), 0);
  const sbTotal = batters.reduce((s, p) => s + (p.stats?.SB || 0), 0);
  const era = pitchers.reduce((acc, p) => {
    const ip = p.stats?.IP || 0;
    const er = p.stats?.ER || 0;
    return { ip: acc.ip + ip, er: acc.er + er };
  }, { ip: 0, er: 0 });
  const teamEra = era.ip > 0 ? (era.er / era.ip) * 9 : 99;
  if (hrTotal >= 60 && sbTotal <= 35) return '打撃偏重';
  if (sbTotal >= 60) return '機動力型';
  if (teamEra <= 3.2) return '投高守備型';
  return 'バランス型';
}

// ── ロスター・成績タブ ─────────────────────────────────
function RosterStatsTab({ team, onPlayerClick, onOpenTrade }) {
  const [view, setView] = useState('batter');
  const weakTags = useMemo(() => buildWeakPositionTags(team), [team]);

  const batters = useMemo(() => {
    const ps = (team?.players || []).filter(p => !p.isPitcher);
    return [...ps].sort((a, b) => (b.stats?.PA || 0) - (a.stats?.PA || 0));
  }, [team]);

  const pitchers = useMemo(() => {
    const ps = (team?.players || []).filter(p => p.isPitcher);
    return [...ps].sort((a, b) => (b.stats?.BF || 0) - (a.stats?.BF || 0));
  }, [team]);

  return (
    <div className="card">
      {weakTags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {weakTags.map((t, idx) => (
            <span key={`${t.pos}-${t.reason}-${idx}`} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 999, border: '1px solid rgba(251,113,133,.4)', background: 'rgba(251,113,133,.08)', color: '#fda4af' }}>
              弱点 {t.pos} : {t.reason}
            </span>
          ))}
          <button
            className="bsm bga"
            style={{ marginLeft: 'auto', fontSize: 10, padding: '2px 8px' }}
            onClick={() => onOpenTrade?.()}
          >
            🔄 トレード検討へ
          </button>
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <button className={`bsm ${view === 'batter' ? 'bgb' : 'bga'}`} onClick={() => setView('batter')}>野手</button>
        <button className={`bsm ${view === 'pitcher' ? 'bgb' : 'bga'}`} onClick={() => setView('pitcher')}>投手</button>
      </div>

      {view === 'batter' && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(148,163,184,.2)', color: '#64748b' }}>
                <th style={{ textAlign: 'left', padding: '4px 6px', minWidth: 80 }}>選手</th>
                <th style={{ textAlign: 'center', padding: '4px 6px' }}>年齢</th>
                <th style={{ textAlign: 'center', padding: '4px 6px' }}>PA</th>
                <th style={{ textAlign: 'center', padding: '4px 6px' }}>AVG</th>
                <th style={{ textAlign: 'center', padding: '4px 6px' }}>OBP</th>
                <th style={{ textAlign: 'center', padding: '4px 6px' }}>HR</th>
                <th style={{ textAlign: 'center', padding: '4px 6px' }}>RBI</th>
                <th style={{ textAlign: 'center', padding: '4px 6px' }}>SB</th>
              </tr>
            </thead>
            <tbody>
              {batters.length === 0 && (
                <tr><td colSpan={8} style={{ color: '#475569', padding: 8, fontSize: 11 }}>データなし</td></tr>
              )}
              {batters.map(p => {
                const s = p.stats || {};
                const avg = fmtAvg(s.H || 0, s.AB || 0);
                const obp = fmtOBP(
                  (s.H || 0) + (s.BB || 0) + (s.HBP || 0),
                  (s.AB || 0) + (s.BB || 0) + (s.HBP || 0) + (s.SF || 0)
                );
                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid rgba(148,163,184,.07)' }}>
                    <td style={{ padding: '4px 6px' }}>
                      <button onClick={() => onPlayerClick?.(p, team?.name)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7dd3fc', padding: 0, fontSize: 12, textAlign: 'left' }}>
                        {p.name}
                      </button>
                      <span style={{ fontSize: 10, color: '#64748b', marginLeft: 4 }}>{p.pos}</span>
                    </td>
                    <td style={{ textAlign: 'center', padding: '4px 6px', color: '#94a3b8' }}>{p.age}</td>
                    <td style={{ textAlign: 'center', padding: '4px 6px', color: '#cbd5e1' }}>{s.PA || 0}</td>
                    <td style={{ textAlign: 'center', padding: '4px 6px', color: '#f8fafc', fontWeight: 600 }}>{avg}</td>
                    <td style={{ textAlign: 'center', padding: '4px 6px', color: '#94a3b8' }}>{obp}</td>
                    <td style={{ textAlign: 'center', padding: '4px 6px', color: '#fbbf24' }}>{s.HR || 0}</td>
                    <td style={{ textAlign: 'center', padding: '4px 6px', color: '#94a3b8' }}>{s.RBI || 0}</td>
                    <td style={{ textAlign: 'center', padding: '4px 6px', color: '#94a3b8' }}>{s.SB || 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {view === 'pitcher' && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(148,163,184,.2)', color: '#64748b' }}>
                <th style={{ textAlign: 'left', padding: '4px 6px', minWidth: 80 }}>選手</th>
                <th style={{ textAlign: 'center', padding: '4px 6px' }}>年齢</th>
                <th style={{ textAlign: 'center', padding: '4px 6px' }}>役割</th>
                <th style={{ textAlign: 'center', padding: '4px 6px' }}>W</th>
                <th style={{ textAlign: 'center', padding: '4px 6px' }}>L</th>
                <th style={{ textAlign: 'center', padding: '4px 6px' }}>SV</th>
                <th style={{ textAlign: 'center', padding: '4px 6px' }}>IP</th>
                <th style={{ textAlign: 'center', padding: '4px 6px' }}>ERA</th>
                <th style={{ textAlign: 'center', padding: '4px 6px' }}>K</th>
              </tr>
            </thead>
            <tbody>
              {pitchers.length === 0 && (
                <tr><td colSpan={9} style={{ color: '#475569', padding: 8, fontSize: 11 }}>データなし</td></tr>
              )}
              {pitchers.map(p => {
                const s = p.stats || {};
                const ip = fmtIP(s.IP || 0);
                const era = (s.IP || 0) > 0
                  ? ((s.ER || 0) / (s.IP || 1) * 9).toFixed(2)
                  : '-.--';
                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid rgba(148,163,184,.07)' }}>
                    <td style={{ padding: '4px 6px' }}>
                      <button onClick={() => onPlayerClick?.(p, team?.name)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7dd3fc', padding: 0, fontSize: 12, textAlign: 'left' }}>
                        {p.name}
                      </button>
                    </td>
                    <td style={{ textAlign: 'center', padding: '4px 6px', color: '#94a3b8' }}>{p.age}</td>
                    <td style={{ textAlign: 'center', padding: '4px 6px', color: '#64748b', fontSize: 10 }}>{p.subtype || '-'}</td>
                    <td style={{ textAlign: 'center', padding: '4px 6px', color: '#4ade80' }}>{s.W || 0}</td>
                    <td style={{ textAlign: 'center', padding: '4px 6px', color: '#f87171' }}>{s.L || 0}</td>
                    <td style={{ textAlign: 'center', padding: '4px 6px', color: '#a78bfa' }}>{s.SV || 0}</td>
                    <td style={{ textAlign: 'center', padding: '4px 6px', color: '#94a3b8' }}>{ip}</td>
                    <td style={{ textAlign: 'center', padding: '4px 6px', color: '#f8fafc', fontWeight: 600 }}>{era}</td>
                    <td style={{ textAlign: 'center', padding: '4px 6px', color: '#94a3b8' }}>{s.Kp || 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── 日程・結果タブ ─────────────────────────────────────
function TeamScheduleTab({ team, allTeams, schedule, year, allTeamResultsMap, onOpenTrade }) {
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [boxScore, setBoxScore] = useState(null); // { result, dayNo }

  const teamResultsMap = useMemo(
    () => (allTeamResultsMap?.[team?.id] || {}),
    [allTeamResultsMap, team?.id]
  );

  const teamMap = useMemo(
    () => new Map((allTeams || []).map(t => [t.id, t])),
    [allTeams]
  );

  const games = useMemo(() => {
    if (!schedule || !team) return [];
    const list = [];
    for (let idx = 1; idx < schedule.length; idx++) {
      const day = schedule[idx];
      if (!day || day.isAllStar) continue;
      const m = day.matchups?.find(x => x.homeId === team.id || x.awayId === team.id);
      if (!m) continue;
      const isHome = m.homeId === team.id;
      const oppId = isHome ? m.awayId : m.homeId;
      const result = teamResultsMap[idx] || null;
      list.push({ dayNo: idx, date: day.date, isHome, oppId, isInterleague: m.isInterleague || false, result });
    }
    return list;
  }, [schedule, team, teamResultsMap]);

  const months = useMemo(() => {
    const ms = new Set(games.map(g => g.date.month));
    return [...ms].sort((a, b) => a - b);
  }, [games]);

  const activeMonth = selectedMonth ?? months[0] ?? 3;
  const filtered = games.filter(g => g.date.month === activeMonth);
  const nextGames = games.filter(g => !g.result).slice(0, 10);
  const nextDiffAvg = nextGames.length > 0
    ? nextGames.reduce((sum, g) => {
      const opp = teamMap.get(g.oppId);
      return sum + calcWinPct(opp?.wins || 0, opp?.losses || 0);
    }, 0) / nextGames.length
    : null;
  const diffLabel = nextDiffAvg == null
    ? '計算不可'
    : nextDiffAvg >= 0.56
      ? '高'
      : nextDiffAvg >= 0.51
        ? '中'
        : '低';

  if (!schedule) {
    return <div className="card" style={{ fontSize: 12, color: '#64748b' }}>日程データなし</div>;
  }

  return (
    <div className="card">
      <div style={{ marginBottom: 10, padding: '8px 10px', borderRadius: 6, border: '1px solid rgba(56,189,248,.25)', background: 'rgba(56,189,248,.07)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, color: '#7dd3fc' }}>今後10試合の難易度</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0' }}>
          {diffLabel}
          {nextDiffAvg != null ? `（相手勝率平均 ${fmtWinPctNumber(nextDiffAvg)}）` : ''}
        </span>
        <button className="bsm bga" style={{ marginLeft: 'auto', fontSize: 10, padding: '2px 8px' }} onClick={() => onOpenTrade?.()}>
          弱点補強を検討
        </button>
      </div>
      {/* 月セレクター */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
        {MONTH_LABELS.filter(m => months.includes(m)).map(m => (
          <button
            key={m}
            className={`bsm ${activeMonth === m ? 'bgb' : 'bga'}`}
            style={{ padding: '3px 8px', fontSize: 11 }}
            onClick={() => setSelectedMonth(m)}
          >
            {m}月
          </button>
        ))}
      </div>

      {/* 試合リスト */}
      <div style={{ display: 'grid', gap: 3 }}>
        {filtered.length === 0 && (
          <div style={{ fontSize: 11, color: '#475569' }}>試合なし</div>
        )}
        {filtered.map(g => {
          const opp = teamMap.get(g.oppId);
          const dow = weekdayShort(year, g.date);
          const result = g.result;
          const resultColor = result
            ? result.drew ? '#6b7280' : result.won ? '#4ade80' : '#f87171'
            : null;

          return (
            <div
              key={g.dayNo}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 8px',
                background: g.isHome ? 'rgba(74,222,128,.06)' : 'rgba(96,165,250,.06)',
                border: `1px solid ${g.isHome ? 'rgba(74,222,128,.15)' : 'rgba(96,165,250,.15)'}`,
                borderRadius: 5,
                fontSize: 11,
                flexWrap: 'wrap',
              }}
            >
              <span style={{ color: '#64748b', minWidth: 52 }}>
                {g.date.month}/{g.date.day}({dow})
              </span>
              <span style={{
                fontSize: 9, padding: '1px 5px', borderRadius: 3,
                background: g.isHome ? 'rgba(74,222,128,.15)' : 'rgba(96,165,250,.15)',
                color: g.isHome ? '#4ade80' : '#60a5fa',
              }}>
                {g.isHome ? 'H' : 'V'}
              </span>
              {g.isInterleague && (
                <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'rgba(167,139,250,.15)', color: '#c4b5fd' }}>交流</span>
              )}
              <span style={{ color: '#e2e8f0', fontWeight: 600, flex: 1 }}>
                vs {opp?.name || '?'}
              </span>
              {result ? (
                <button
                  onClick={() => setBoxScore({ result, dayNo: g.dayNo })}
                  style={{
                    background: 'none',
                    border: `1px solid ${resultColor}50`,
                    borderRadius: 4,
                    padding: '2px 8px',
                    fontSize: 11,
                    color: resultColor,
                    cursor: 'pointer',
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {result.drew ? '△' : result.won ? '○' : '●'} {result.myScore}-{result.oppScore}
                </button>
              ) : (
                <span style={{ fontSize: 10, color: '#2e4055' }}>未</span>
              )}
            </div>
          );
        })}
      </div>

      {/* ボックススコアモーダル */}
      {boxScore && (
        <BoxScoreModal
          result={boxScore.result}
          myTeamName={team.name}
          oppTeamName={boxScore.result.oppName || '相手'}
          teamId={team.id}
          dayNo={boxScore.dayNo}
          onClose={() => setBoxScore(null)}
        />
      )}
    </div>
  );
}

// ── 移籍履歴タブ ──────────────────────────────────────
const EXIT_COLOR = {
  引退: '#94a3b8',
  トレード: '#f97316',
  戦力外: '#f87171',
  FA移籍: '#a78bfa',
};

function HistoryTab({ team, onPlayerClick }) {
  const history = [...(team?.history || [])]
    .sort((a, b) => (b.exitYear || 0) - (a.exitYear || 0))
    .slice(0, 30);

  return (
    <div className="card">
      {history.length === 0 && (
        <div style={{ fontSize: 12, color: '#64748b' }}>履歴データがありません</div>
      )}
      {history.map((p, i) => (
        <div
          key={`${p.id}-${p.exitYear}-${i}`}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,.05)' }}
        >
          <button
            onClick={() => onPlayerClick?.(p, team?.name)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e0d4bf', padding: 0, fontSize: 13, minWidth: 100, textAlign: 'left' }}
          >
            {p.name}
          </button>
          <span style={{ fontSize: 11, color: '#94a3b8' }}>{p.pos}</span>
          <span style={{ fontSize: 10, color: EXIT_COLOR[p.exitReason] || '#64748b', border: '1px solid', borderColor: EXIT_COLOR[p.exitReason] || '#64748b', borderRadius: 3, padding: '1px 5px' }}>
            {p.exitReason}
          </span>
          <span style={{ fontSize: 11, color: '#94a3b8' }}>{p.exitYear}年</span>
        </div>
      ))}
    </div>
  );
}

// ── メイン: TeamDetailScreen ──────────────────────────
export function TeamDetailScreen({ team, allTeams, schedule, year, allTeamResultsMap, onBack, onPlayerClick, onOpenTrade }) {
  const [tab, setTab] = useState('roster');

  // チームが変わったらタブをリセット
  useEffect(() => { setTab('roster'); }, [team?.id]);

  if (!team) return null;

  const winPct = (team.wins || 0) + (team.losses || 0) > 0
    ? '.' + Math.round(team.wins / ((team.wins || 0) + (team.losses || 0)) * 1000).toString().padStart(3, '0')
    : '---';
  const teamResultsMap = allTeamResultsMap?.[team.id] || {};
  const recent10 = Object.entries(teamResultsMap)
    .map(([dayNo, r]) => ({ dayNo: Number(dayNo), ...r }))
    .sort((a, b) => b.dayNo - a.dayNo)
    .slice(0, 10);
  const recentSummary = recent10.reduce((acc, r) => {
    if (r.drew) acc.draws += 1;
    else if (r.won) acc.wins += 1;
    else acc.losses += 1;
    return acc;
  }, { wins: 0, losses: 0, draws: 0 });
  const streak = (team.winStreak || 0) > 0
    ? `${team.winStreak}連勝`
    : (team.loseStreak || 0) > 0
      ? `${team.loseStreak}連敗`
      : '連勝連敗なし';
  const injuredCount = (team.players || []).filter(p => (p.injuryDaysLeft || 0) > 0).length;
  const archetype = buildTeamArchetype(team);
  const teamEraData = (team.players || [])
    .filter(p => p.isPitcher)
    .reduce((acc, p) => ({ ip: acc.ip + (p.stats?.IP || 0), er: acc.er + (p.stats?.ER || 0) }), { ip: 0, er: 0 });
  const teamEra = teamEraData.ip > 0 ? (teamEraData.er / teamEraData.ip * 9) : null;
  const insightCards = [
    {
      level: injuredCount >= 3 ? 'High' : 'Med',
      title: `離脱者 ${injuredCount}人`,
      detail: injuredCount > 0 ? 'ロスター再編と補強検討が必要です。' : '離脱者は出ていません。',
      cta: 'トレード提案へ',
      action: onOpenTrade,
    },
    {
      level: recentSummary.losses >= 6 ? 'High' : 'Med',
      title: `直近10試合 ${recentSummary.wins}勝${recentSummary.losses}敗${recentSummary.draws > 0 ? `${recentSummary.draws}分` : ''}`,
      detail: recentSummary.losses >= 6 ? '直近失速。ローテ/勝ちパターンの見直し推奨。' : '戦績は許容レンジです。',
      cta: '日程詳細を見る',
      action: () => setTab('schedule'),
    },
    {
      level: (teamEra != null && teamEra >= 3.9) ? 'High' : 'Low',
      title: `チームERA ${teamEra != null ? teamEra.toFixed(2) : '-.--'}`,
      detail: (teamEra != null && teamEra >= 3.9) ? '投手陣の被失点傾向が強めです。' : '投手成績は安定しています。',
      cta: 'ロスター確認',
      action: () => setTab('roster'),
    },
  ];

  return (
    <div className="app">
      <div className="hub">
        {/* トップバー */}
        <div className="topbar">
          <button
            onClick={onBack}
            style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', color: '#94a3b8', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12, flexShrink: 0 }}
          >
            ← 戻る
          </button>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: team.color || '#e0d4bf' }}>
              {team.emoji} {team.name}
            </div>
            <div style={{ fontSize: 10, color: '#374151' }}>{team.league}リーグ</div>
          </div>
          <div style={{ display: 'flex', gap: 5 }}>
            <span className="chip cg">{team.wins || 0}勝</span>
            <span className="chip cr">{team.losses || 0}敗</span>
            {(team.draws || 0) > 0 && <span className="chip cy">{team.draws}分</span>}
            <span className="chip" style={{ background: 'rgba(148,163,184,.1)', color: '#94a3b8' }}>{winPct}</span>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="chip" style={{ background: 'rgba(96,165,250,.13)', color: '#93c5fd' }}>直近10: {recentSummary.wins}-{recentSummary.losses}{recentSummary.draws > 0 ? `-${recentSummary.draws}` : ''}</span>
            <span className="chip" style={{ background: 'rgba(245,158,11,.12)', color: '#fbbf24' }}>{streak}</span>
            <span className="chip" style={{ background: injuredCount > 0 ? 'rgba(248,113,113,.12)' : 'rgba(74,222,128,.12)', color: injuredCount > 0 ? '#f87171' : '#4ade80' }}>離脱者 {injuredCount}人</span>
            <span className="chip" style={{ background: 'rgba(167,139,250,.12)', color: '#c4b5fd' }}>チーム傾向: {archetype}</span>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 8, marginBottom: 10 }}>
          {insightCards.map((c, idx) => (
            <div key={`${c.title}-${idx}`} style={{ border: '1px solid rgba(148,163,184,.2)', background: 'rgba(2,6,23,.35)', borderRadius: 8, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 999, color: c.level === 'High' ? '#fca5a5' : c.level === 'Med' ? '#fcd34d' : '#93c5fd', background: c.level === 'High' ? 'rgba(248,113,113,.15)' : c.level === 'Med' ? 'rgba(250,204,21,.15)' : 'rgba(96,165,250,.15)' }}>
                {c.level}
              </span>
              <div style={{ minWidth: 180, flex: 1 }}>
                <div style={{ fontSize: 12, color: '#e2e8f0', fontWeight: 700 }}>{c.title}</div>
                <div style={{ fontSize: 10, color: '#94a3b8' }}>{c.detail}</div>
              </div>
              <button className="bsm bga" style={{ fontSize: 10, padding: '3px 10px' }} onClick={() => c.action?.()}>
                {c.cta}
              </button>
            </div>
          ))}
        </div>

        {/* タブ */}
        <div className="tabs-nav">
          <div className="tab-group">
            <div className="tabs">
              <button className={`tab ${tab === 'roster' ? 'on' : ''}`} onClick={() => setTab('roster')}>ロスター・成績</button>
              <button className={`tab ${tab === 'schedule' ? 'on' : ''}`} onClick={() => setTab('schedule')}>日程・結果</button>
              <button className={`tab ${tab === 'history' ? 'on' : ''}`} onClick={() => setTab('history')}>移籍履歴</button>
            </div>
          </div>
        </div>

        {tab === 'roster' && (
          <RosterStatsTab team={team} onPlayerClick={onPlayerClick} onOpenTrade={onOpenTrade} />
        )}
        {tab === 'schedule' && (
          <TeamScheduleTab
            team={team}
            allTeams={allTeams}
            schedule={schedule}
            year={year}
            allTeamResultsMap={allTeamResultsMap}
            onOpenTrade={onOpenTrade}
          />
        )}
        {tab === 'history' && (
          <HistoryTab team={team} onPlayerClick={onPlayerClick} />
        )}
      </div>
    </div>
  );
}
