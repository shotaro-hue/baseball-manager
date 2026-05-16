import { useEffect, useMemo, useState } from "react";
import { fmtAvg, fmtOBP, fmtIP, gameDayToDate } from '../utils';
import { getMyMatchup } from '../engine/scheduleGen';

const EXIT_COLOR = {
  引退: '#94a3b8',
  トレード: '#f97316',
  戦力外: '#f87171',
  FA移籍: '#a78bfa',
};

// 月ラベル
const MONTH_LABELS = [3,4,5,6,7,8,9,10];

function weekdayShort(year, date) {
  if (!date) return '';
  return ['日','月','火','水','木','金','土'][new Date(year, date.month - 1, date.day).getDay()];
}

// ロースター＋成績 統合ビュー
function RosterStatsTab({ team, onPlayerClick }) {
  const [view, setView] = useState('batter'); // 'batter' | 'pitcher'

  const batters = useMemo(() => {
    const ps = (team?.players || []).filter(p => !p.isPitcher);
    return [...ps].sort((a, b) => (b.stats?.PA || 0) - (a.stats?.PA || 0));
  }, [team]);

  const pitchers = useMemo(() => {
    const ps = (team?.players || []).filter(p => p.isPitcher);
    return [...ps].sort((a, b) => (b.stats?.BF || 0) - (a.stats?.BF || 0));
  }, [team]);

  return (
    <div>
      {/* 投打切り替え */}
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

// 日程タブ
function ScheduleTab({ team, schedule, year, allTeams }) {
  const teamMap = useMemo(() => new Map((allTeams || []).map(t => [t.id, t])), [allTeams]);
  const [selectedMonth, setSelectedMonth] = useState(null);

  // 当該チームの全試合エントリーを収集
  const games = useMemo(() => {
    if (!schedule || !team) return [];
    const list = [];
    for (let idx = 1; idx < schedule.length; idx++) {
      const day = schedule[idx];
      if (!day) continue;
      if (day.isAllStar) continue;
      const m = day.matchups?.find(x => x.homeId === team.id || x.awayId === team.id);
      if (!m) continue;
      const isHome = m.homeId === team.id;
      const oppId = isHome ? m.awayId : m.homeId;
      list.push({ dayNo: idx, date: day.date, isHome, oppId, isInterleague: m.isInterleague || false });
    }
    return list;
  }, [schedule, team]);

  // 月フィルタ
  const months = useMemo(() => {
    const ms = new Set(games.map(g => g.date.month));
    return [...ms].sort((a, b) => a - b);
  }, [games]);

  const activeMonth = selectedMonth ?? months[0] ?? 3;
  const filtered = games.filter(g => g.date.month === activeMonth);

  if (!schedule) {
    return <div style={{ fontSize: 12, color: '#64748b' }}>日程データなし</div>;
  }

  return (
    <div>
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
        {filtered.length === 0 && <div style={{ fontSize: 11, color: '#475569' }}>試合なし</div>}
        {filtered.map(g => {
          const opp = teamMap.get(g.oppId);
          const date = g.date;
          const dow = weekdayShort(year, date);
          return (
            <div key={g.dayNo} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '5px 8px',
              background: g.isHome ? 'rgba(74,222,128,.06)' : 'rgba(96,165,250,.06)',
              border: `1px solid ${g.isHome ? 'rgba(74,222,128,.15)' : 'rgba(96,165,250,.15)'}`,
              borderRadius: 5, fontSize: 11,
            }}>
              <span style={{ color: '#64748b', minWidth: 50 }}>{date.month}/{date.day}({dow})</span>
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
              <span style={{ color: '#e2e8f0', fontWeight: 600 }}>
                vs {opp?.name || '?'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// 移籍履歴タブ
function HistoryTab({ team, onPlayerClick }) {
  const history = [...(team?.history || [])].sort((a, b) => (b.exitYear || 0) - (a.exitYear || 0)).slice(0, 30);
  return (
    <div>
      {history.length === 0 && <div style={{ fontSize: 12, color: '#64748b' }}>履歴データがありません</div>}
      {history.map((p, i) => (
        <div key={`${p.id}-${p.exitYear}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,.05)' }}>
          <button onClick={() => onPlayerClick?.(p, team?.name)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e0d4bf', padding: 0, fontSize: 13, minWidth: 100, textAlign: 'left' }}>
            {p.name}
          </button>
          <span style={{ fontSize: 11, color: '#94a3b8' }}>{p.pos}</span>
          <span style={{ fontSize: 10, color: EXIT_COLOR[p.exitReason] || '#64748b', border: '1px solid', borderColor: EXIT_COLOR[p.exitReason] || '#64748b', borderRadius: 3, padding: '1px 5px' }}>{p.exitReason}</span>
          <span style={{ fontSize: 11, color: '#94a3b8' }}>{p.exitYear}年</span>
        </div>
      ))}
    </div>
  );
}

export function TeamModal({ team, onPlayerClick, onClose, schedule, year, allTeams }) {
  const [tab, setTab] = useState('roster');

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // チームが変わったらタブをリセット
  useEffect(() => {
    setTab('roster');
  }, [team?.id]);

  if (!team) return null;

  return (
    <div
      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,.78)', zIndex: 310, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 16px' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: '#0d1b2a', border: '1px solid #1e3a5f', borderRadius: 12, padding: 20, width: '100%', maxWidth: 600, boxShadow: '0 8px 32px rgba(0,0,0,.6)', maxHeight: '90vh', overflowY: 'auto' }}>
        {/* ヘッダー */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#e0d4bf' }}>{team.emoji} {team.name}（{team.league}）</div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>{team.wins}勝 {team.losses}敗{(team.draws||0)>0?` ${team.draws}分`:''}
              {team.wins+team.losses > 0 && (
                <span style={{ marginLeft: 8, color: '#64748b' }}>
                  勝率 .{Math.round(team.wins / Math.max(1, team.wins + team.losses) * 1000).toString().padStart(3, '0')}
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', color: '#94a3b8', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12 }}>✕</button>
        </div>

        {/* タブ */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
          <button className={`tab ${tab === 'roster' ? 'on' : ''}`} onClick={() => setTab('roster')}>ロスター・成績</button>
          <button className={`tab ${tab === 'schedule' ? 'on' : ''}`} onClick={() => setTab('schedule')}>日程</button>
          <button className={`tab ${tab === 'history' ? 'on' : ''}`} onClick={() => setTab('history')}>移籍履歴</button>
        </div>

        {tab === 'roster' && <RosterStatsTab team={team} onPlayerClick={onPlayerClick} />}
        {tab === 'schedule' && <ScheduleTab team={team} schedule={schedule} year={year} allTeams={allTeams} />}
        {tab === 'history' && <HistoryTab team={team} onPlayerClick={onPlayerClick} />}
      </div>
    </div>
  );
}
