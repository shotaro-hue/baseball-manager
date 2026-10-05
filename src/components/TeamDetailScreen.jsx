import '../mobile-flow.css';
import '../calm-club.css';
import { useEffect, useMemo, useState } from 'react';
import { fmtAvg, fmtOBP, fmtIP } from '../utils';
import { BoxScoreModal } from './BoxScoreModal';
import { getManagementPolicy, getManagementTrait } from '../engine/managementPolicy';
import { TeamComparisonPanel } from './TeamComparisonPanel';

const MONTH_LABELS = [3, 4, 5, 6, 7, 8, 9, 10];

function weekdayShort(year, date) {
  if (!date) return '';
  return ['日', '月', '火', '水', '木', '金', '土'][new Date(year, date.month - 1, date.day).getDay()];
}

function calcWinPct(wins = 0, losses = 0) {
  const total = wins + losses;
  return total > 0 ? wins / total : null;
}

function fmtWinPctNumber(pct) {
  return Number.isFinite(pct) ? pct.toFixed(3).replace(/^0/, '') : '---';
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
    if (topPa?.stats?.AB > 0 && topPa?.stats?.H != null && !Number.isNaN(avgNum) && avgNum < 0.23) tags.push({ pos, reason: '打率低' });
  });
  return tags.slice(0, 4);
}

function buildTeamArchetype(team) {
  const players = team?.players || [];
  const batters = players.filter(p => !p.isPitcher);
  const pitchers = players.filter(p => p.isPitcher);
  if (!players.some(p => (p.isPitcher ? p.stats?.IP : p.stats?.PA) > 0)) return '成績未記録';
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
            <span key={`${t.pos}-${t.reason}-${idx}`} style={{ fontSize: 14, padding: '2px 8px', borderRadius: 999, border: '1px solid rgba(251,113,133,.4)', background: 'rgba(251,113,133,.08)', color: '#b42332' }}>
              弱点 {t.pos} : {t.reason}
            </span>
          ))}
          <button
            className="bsm bga"
            style={{ marginLeft: 'auto', fontSize: 14, padding: '2px 8px' }}
            onClick={() => onOpenTrade?.()}
          >
            🔄 トレード検討へ
          </button>
        </div>
      )}
      <p className="club-data-note">選手名をタップで詳細へ。成績表は横にスクロールできます。--- は未記録・算出不可です。</p>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <button className={`bsm ${view === 'batter' ? 'bgb' : 'bga'}`} aria-pressed={view === 'batter'} onClick={() => setView('batter')}>野手</button>
        <button className={`bsm ${view === 'pitcher' ? 'bgb' : 'bga'}`} aria-pressed={view === 'pitcher'} onClick={() => setView('pitcher')}>投手</button>
      </div>

      {view === 'batter' && (
        <div className="detail-table-scroll" role="region" aria-label="球団の選手成績" tabIndex={0}>
          <table className="tbl club-roster-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(148,163,184,.2)', color: '#53657c' }}>
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
                <tr><td colSpan={8} style={{ color: '#53657c', padding: 8, fontSize: 14 }}>データなし</td></tr>
              )}
              {batters.map(p => {
                const s = p.stats || {};
                const avg = s.H != null && s.AB > 0 ? fmtAvg(s.H, s.AB) : '---';
                const obp = ['H', 'AB', 'BB', 'HBP', 'SF'].every(k => Number.isFinite(s[k])) ? fmtOBP(
                  (s.H || 0) + (s.BB || 0) + (s.HBP || 0),
                  (s.AB || 0) + (s.BB || 0) + (s.HBP || 0) + (s.SF || 0)
                ) : '---';
                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid rgba(148,163,184,.07)' }}>
                    <td style={{ padding: '4px 6px' }}>
                      <button onClick={() => onPlayerClick?.(p, team?.name)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#095cc7', padding: 0, fontSize: 14, textAlign: 'left' }}>
                        {p.name}
                      </button>
                      <span style={{ fontSize: 14, color: '#53657c', marginLeft: 4 }}>{p.pos}</span>
                    </td>
                    <td style={{ textAlign: 'center', padding: '4px 6px', color: '#53657c' }}>{p.age}</td>
                    <td style={{ textAlign: 'center', padding: '4px 6px', color: '#334962' }}>{s.PA ?? '---'}</td>
                    <td style={{ textAlign: 'center', padding: '4px 6px', color: '#17243a', fontWeight: 600 }}>{avg}</td>
                    <td style={{ textAlign: 'center', padding: '4px 6px', color: '#53657c' }}>{obp}</td>
                    <td style={{ textAlign: 'center', padding: '4px 6px', color: '#805700' }}>{s.HR ?? '---'}</td>
                    <td style={{ textAlign: 'center', padding: '4px 6px', color: '#53657c' }}>{s.RBI ?? '---'}</td>
                    <td style={{ textAlign: 'center', padding: '4px 6px', color: '#53657c' }}>{s.SB ?? '---'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {view === 'pitcher' && (
        <div className="detail-table-scroll" role="region" aria-label="球団の選手成績" tabIndex={0}>
          <table className="tbl club-roster-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(148,163,184,.2)', color: '#53657c' }}>
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
                <tr><td colSpan={9} style={{ color: '#53657c', padding: 8, fontSize: 14 }}>データなし</td></tr>
              )}
              {pitchers.map(p => {
                const s = p.stats || {};
                const ip = s.IP != null ? fmtIP(s.IP) : '---';
                const era = s.IP > 0 && s.ER != null
                  ? ((s.ER || 0) / (s.IP || 1) * 9).toFixed(2)
                  : '-.--';
                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid rgba(148,163,184,.07)' }}>
                    <td style={{ padding: '4px 6px' }}>
                      <button onClick={() => onPlayerClick?.(p, team?.name)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#095cc7', padding: 0, fontSize: 14, textAlign: 'left' }}>
                        {p.name}
                      </button>
                    </td>
                    <td style={{ textAlign: 'center', padding: '4px 6px', color: '#53657c' }}>{p.age}</td>
                    <td style={{ textAlign: 'center', padding: '4px 6px', color: '#53657c', fontSize: 14 }}>{p.subtype || '-'}</td>
                    <td style={{ textAlign: 'center', padding: '4px 6px', color: '#14714b' }}>{s.W ?? '---'}</td>
                    <td style={{ textAlign: 'center', padding: '4px 6px', color: '#b42332' }}>{s.L ?? '---'}</td>
                    <td style={{ textAlign: 'center', padding: '4px 6px', color: '#7050ad' }}>{s.SV ?? '---'}</td>
                    <td style={{ textAlign: 'center', padding: '4px 6px', color: '#53657c' }}>{ip}</td>
                    <td style={{ textAlign: 'center', padding: '4px 6px', color: '#17243a', fontWeight: 600 }}>{era}</td>
                    <td style={{ textAlign: 'center', padding: '4px 6px', color: '#53657c' }}>{s.Kp ?? '---'}</td>
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
function TeamScheduleTab({ team, allTeams, schedule, year, allTeamResultsMap, allTeamBoxScoresMap, onOpenTrade }) {
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [boxScore, setBoxScore] = useState(null); // { result, dayNo }

  const teamResultsMap = useMemo(
    () => (allTeamResultsMap?.[team?.id] || {}),
    [allTeamResultsMap, team?.id]
  );

  const teamBoxScoresMap = useMemo(
    () => (allTeamBoxScoresMap?.[team?.id] || {}),
    [allTeamBoxScoresMap, team?.id]
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
      const boxScoreDetail = teamBoxScoresMap[idx] || null;
      list.push({ dayNo: idx, date: day.date, isHome, oppId, isInterleague: m.isInterleague || false, result, boxScoreDetail });
    }
    return list;
  }, [schedule, team, teamResultsMap, teamBoxScoresMap]);

  const months = useMemo(() => {
    const ms = new Set(games.map(g => g.date.month));
    return [...ms].sort((a, b) => a - b);
  }, [games]);

  const activeMonth = months.includes(selectedMonth) ? selectedMonth : months[0] ?? 3;
  const filtered = games.filter(g => g.date.month === activeMonth);
  const nextGames = games.filter(g => !g.result).slice(0, 10);
  const opponentRates = nextGames.map(g => {
    const opp = teamMap.get(g.oppId);
    return opp ? calcWinPct(opp.wins, opp.losses) : null;
  });
  const nextDiffAvg = opponentRates.length > 0 && opponentRates.every(v => v != null)
    ? opponentRates.reduce((sum, v) => sum + v, 0) / opponentRates.length : null;
  const diffLabel = nextDiffAvg == null
    ? '計算不可'
    : nextDiffAvg >= 0.56
      ? '高'
      : nextDiffAvg >= 0.51
        ? '中'
        : '低';

  if (!schedule) {
    return <div className="card" style={{ fontSize: 14, color: '#53657c' }}>日程データなし</div>;
  }

  return (
    <div className="card">
      <div style={{ marginBottom: 10, padding: '8px 10px', borderRadius: 6, border: '1px solid rgba(56,189,248,.25)', background: 'rgba(56,189,248,.07)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 14, color: '#095cc7' }}>今後最大10試合の難易度</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#17243a' }}>
          {diffLabel}
          {nextDiffAvg != null ? `（相手勝率平均 ${fmtWinPctNumber(nextDiffAvg)}）` : ''}
        </span>
        <button className="bsm bga" style={{ marginLeft: 'auto', fontSize: 14, padding: '2px 8px' }} onClick={() => onOpenTrade?.()}>
          弱点補強を検討
        </button>
      </div>
      {/* 月セレクター */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
        {MONTH_LABELS.filter(m => months.includes(m)).map(m => (
          <button
            key={m}
            className={`bsm ${activeMonth === m ? 'bgb' : 'bga'}`}
            style={{ padding: '3px 8px', fontSize: 14 }}
            aria-pressed={activeMonth === m} onClick={() => setSelectedMonth(m)}
          >
            {m}月
          </button>
        ))}
      </div>

      {/* 試合リスト */}
      <div style={{ display: 'grid', gap: 3 }}>
        {filtered.length === 0 && (
          <div style={{ fontSize: 14, color: '#53657c' }}>試合なし</div>
        )}
        {filtered.map(g => {
          const opp = teamMap.get(g.oppId);
          const dow = weekdayShort(year, g.date);
          const result = g.result;
          const resultColor = result
            ? result.drew ? '#6b7280' : result.won ? '#14714b' : '#b42332'
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
                fontSize: 14,
                flexWrap: 'wrap',
              }}
            >
              <span style={{ color: '#53657c', minWidth: 52 }}>
                {g.date.month}/{g.date.day}({dow})
              </span>
              <span style={{
                fontSize: 14, padding: '1px 5px', borderRadius: 3,
                background: g.isHome ? 'rgba(74,222,128,.15)' : 'rgba(96,165,250,.15)',
                color: g.isHome ? '#14714b' : '#095cc7',
              }}>
                {g.isHome ? 'ホーム' : 'ビジター'}
              </span>
              {g.isInterleague && (
                <span style={{ fontSize: 14, padding: '1px 5px', borderRadius: 3, background: 'rgba(167,139,250,.15)', color: '#7050ad' }}>交流</span>
              )}
              <span style={{ color: '#17243a', fontWeight: 600, flex: 1 }}>
                vs {opp?.name || '?'}
              </span>
              {result ? (
                <button
                  onClick={() => setBoxScore({ result: { ...result, ...(g.boxScoreDetail || {}) }, dayNo: g.dayNo })}
                  style={{
                    background: 'none',
                    border: `1px solid ${resultColor}50`,
                    borderRadius: 4,
                    padding: '2px 8px',
                    fontSize: 14,
                    color: resultColor,
                    cursor: 'pointer',
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {result.drew ? '△' : result.won ? '○' : '●'} {result.myScore}-{result.oppScore}
                </button>
              ) : (
                <span style={{ fontSize: 14, color: '#53657c' }}>未</span>
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
  引退: '#53657c',
  トレード: '#945000',
  戦力外: '#b42332',
  FA移籍: '#7050ad',
};

function HistoryTab({ team, onPlayerClick }) {
  const history = [...(team?.history || [])]
    .sort((a, b) => (b.exitYear || 0) - (a.exitYear || 0))
    .slice(0, 30);

  return (
    <div className="card">
      {history.length === 0 && (
        <div style={{ fontSize: 14, color: '#53657c' }}>履歴データがありません</div>
      )}
      {history.map((p, i) => (
        <div
          key={`${p.id}-${p.exitYear}-${i}`}
          style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #dce6f2' }}
        >
          <button
            onClick={() => onPlayerClick?.(p, team?.name)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#17243a', padding: 0, fontSize: 14, minWidth: 100, textAlign: 'left' }}
          >
            {p.name}
          </button>
          <span style={{ fontSize: 14, color: '#53657c' }}>{p.pos}</span>
          <span style={{ fontSize: 14, color: EXIT_COLOR[p.exitReason] || '#53657c', border: '1px solid', borderColor: EXIT_COLOR[p.exitReason] || '#53657c', borderRadius: 3, padding: '1px 5px' }}>
            {p.exitReason}
          </span>
          <span style={{ fontSize: 14, color: '#53657c' }}>{p.exitYear}年</span>
        </div>
      ))}
    </div>
  );
}

// ── メイン: TeamDetailScreen ──────────────────────────
export function TeamDetailScreen({ team, myTeam, allTeams, schedule, year, allTeamResultsMap, allTeamBoxScoresMap, onBack, onPlayerClick, onOpenTrade }) {
  const [tab, setTab] = useState('roster');
  const [showCompare, setShowCompare] = useState(false);

  // チームが変わったらタブをリセット
  useEffect(() => { setTab('roster'); setShowCompare(false); }, [team?.id]);

  if (!team) return null;

  const winPct = (team.wins || 0) + (team.losses || 0) > 0
    ? fmtWinPctNumber(team.wins / ((team.wins || 0) + (team.losses || 0)))
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
  const managementPolicy = getManagementPolicy(team);
  const managementTrait = getManagementTrait(team);
  const teamEraData = (team.players || [])
    .filter(p => p.isPitcher)
    .reduce((acc, p) => ({ ip: acc.ip + (p.stats?.IP || 0), er: acc.er + (p.stats?.ER || 0) }), { ip: 0, er: 0 });
  const hasPitchingData = (team.players || []).filter(p => p.isPitcher).every(p => Number.isFinite(p.stats?.IP) && Number.isFinite(p.stats?.ER));
  const teamEra = hasPitchingData && teamEraData.ip > 0 ? (teamEraData.er / teamEraData.ip * 9) : null;
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
      title: `直近${recent10.length}試合 ${recentSummary.wins}勝${recentSummary.losses}敗${recentSummary.draws > 0 ? `${recentSummary.draws}分` : ''}`,
      detail: recent10.length === 0 ? '試合結果はまだ記録されていません。' : recentSummary.losses >= 6 ? '直近失速。ローテ/勝ちパターンの見直し推奨。' : '戦績は許容レンジです。',
      cta: '日程詳細を見る',
      action: () => setTab('schedule'),
    },
    {
      level: (teamEra != null && teamEra >= 3.9) ? 'High' : 'Low',
      title: `チームERA ${teamEra != null ? teamEra.toFixed(2) : '-.--'}`,
      detail: teamEra == null ? '投球成績はまだ記録されていません。' : (teamEra >= 3.9) ? '投手陣の被失点傾向が強めです。' : '投手成績は安定しています。',
      cta: 'ロスター確認',
      action: () => setTab('roster'),
    },
  ];

  return (
    <div className="app calm-detail club-detail">
      <div className="hub">
        {/* トップバー */}
        <div className="topbar club-topbar">
          <button
            onClick={onBack}
            style={{ background: '#edf4fc', border: '1px solid #c5d8ed', color: '#53657c', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 14, flexShrink: 0 }}
          >
            ← 戻る
          </button>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#17243a' }}>
              {team.emoji} {team.name}
            </div>
            <div style={{ fontSize: 14, color: '#53657c' }}>{team.league}リーグ</div>
          </div>
          <div style={{ display: 'flex', gap: 5 }}>
            <span className="chip cg">{team.wins || 0}勝</span>
            <span className="chip cr">{team.losses || 0}敗</span>
            {(team.draws || 0) > 0 && <span className="chip cy">{team.draws}分</span>}
            <span className="chip" style={{ background: 'rgba(148,163,184,.1)', color: '#53657c' }}>{winPct}</span>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="chip" style={{ background: 'rgba(96,165,250,.13)', color: '#095cc7' }}>直近{recent10.length}試合: {recentSummary.wins}-{recentSummary.losses}{recentSummary.draws > 0 ? `-${recentSummary.draws}` : ''}</span>
            <span className="chip" style={{ background: 'rgba(245,158,11,.12)', color: '#805700' }}>{streak}</span>
            <span className="chip" style={{ background: injuredCount > 0 ? 'rgba(248,113,113,.12)' : 'rgba(74,222,128,.12)', color: injuredCount > 0 ? '#b42332' : '#14714b' }}>離脱者 {injuredCount}人</span>
            <span className="chip" style={{ background: 'rgba(96,165,250,.13)', color: '#095cc7' }}>起用方針: {managementPolicy.label}</span>
            <span className="chip" style={{ background: 'rgba(139,92,246,.1)', color: '#7050ad' }}>特徴: {managementTrait.label}</span>
            {team.managementMeta?.lastDecision&&<span style={{fontSize:14,color:'#53657c'}}>前回判断: {team.managementMeta.lastDecision}</span>}
            <span className="chip" style={{ background: 'rgba(167,139,250,.12)', color: '#7050ad' }}>チーム傾向: {archetype}</span>
          </div>
        </div>

        {myTeam && team.id !== myTeam.id && (
          <section className="club-comparison-section">
            <button className="bsm" aria-expanded={showCompare} aria-controls="club-comparison" onClick={() => setShowCompare(v => !v)}>
              {showCompare ? '自球団との比較を閉じる' : '自球団との戦力を比較'}
            </button>
            {showCompare && <div id="club-comparison"><TeamComparisonPanel myTeam={myTeam} opponent={team} allTeams={allTeams} /></div>}
          </section>
        )}

        <div style={{ display: 'grid', gap: 8, marginBottom: 10 }}>
          {insightCards.map((c, idx) => (
            <div key={`${c.title}-${idx}`} style={{ border: '1px solid rgba(148,163,184,.2)', background: '#f6f9fd', borderRadius: 8, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 14, fontWeight: 700, padding: '2px 6px', borderRadius: 999, color: c.level === 'High' ? '#b42332' : c.level === 'Med' ? '#805700' : '#095cc7', background: c.level === 'High' ? 'rgba(248,113,113,.15)' : c.level === 'Med' ? 'rgba(250,204,21,.15)' : 'rgba(96,165,250,.15)' }}>
                {c.level}
              </span>
              <div style={{ minWidth: 180, flex: 1 }}>
                <div style={{ fontSize: 14, color: '#17243a', fontWeight: 700 }}>{c.title}</div>
                <div style={{ fontSize: 14, color: '#53657c' }}>{c.detail}</div>
              </div>
              <button className="bsm bga" style={{ fontSize: 14, padding: '3px 10px' }} onClick={() => c.action?.()}>
                {c.cta}
              </button>
            </div>
          ))}
        </div>

        {/* タブ */}
        <div className="tabs-nav">
          <div className="tab-group">
            <div className="tabs">
              <button className={`tab ${tab === 'roster' ? 'on' : ''}`} aria-pressed={tab === 'roster'} onClick={() => setTab('roster')}>ロスター・成績</button>
              <button className={`tab ${tab === 'schedule' ? 'on' : ''}`} aria-pressed={tab === 'schedule'} onClick={() => setTab('schedule')}>日程・結果</button>
              <button className={`tab ${tab === 'history' ? 'on' : ''}`} aria-pressed={tab === 'history'} onClick={() => setTab('history')}>移籍履歴</button>
            </div>
          </div>
        </div>

        {tab === 'roster' && (
          <RosterStatsTab key={team.id} team={team} onPlayerClick={onPlayerClick} onOpenTrade={onOpenTrade} />
        )}
        {tab === 'schedule' && (
          <TeamScheduleTab key={team.id}
            team={team}
            allTeams={allTeams}
            schedule={schedule}
            year={year}
            allTeamResultsMap={allTeamResultsMap}
            allTeamBoxScoresMap={allTeamBoxScoresMap}
            onOpenTrade={onOpenTrade}
          />
        )}
        {tab === 'history' && (
          <HistoryTab team={team} onPlayerClick={onPlayerClick} />
        )}

        <div className="club-actions" style={{
          position: 'sticky',
          bottom: 8,
          display: 'flex',
          gap: 6,
          justifyContent: 'space-between',
          background: '#ffffff',
          border: '1px solid rgba(148,163,184,.2)',
          borderRadius: 8,
          padding: 6,
          marginTop: 10,
        }}>
          <button className="bsm bgb" style={{ flex: 1 }} onClick={() => onOpenTrade?.()}>🔄 トレード提案</button>
          <button className="bsm bga" style={{ flex: 1 }} aria-pressed={tab === 'schedule'} onClick={() => setTab('schedule')}>📅 次カード確認</button>

        </div>
      </div>
    </div>
  );
}
