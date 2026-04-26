import { useEffect, useMemo, useState } from 'react';
import { gameDayToDate } from '../../utils';
import { getMyMatchup } from '../../engine/scheduleGen';
import { SEASON_GAMES } from '../../constants';
import { BoxScoreModal } from '../BoxScoreModal';

const MONTH_LABELS = ['3月','4月','5月','6月','7月','8月','9月','10月'];
// 月曜始まり: 0=月,1=火,2=水,3=木,4=金,5=土,6=日
const WEEK_DAYS = ['月','火','水','木','金','土','日'];

function formatDate(date) {
  return date ? `${date.month}/${date.day}` : '-';
}

function weekdayName(year, date) {
  if (!date) return '';
  return ['日', '月', '火', '水', '木', '金', '土'][new Date(year, date.month - 1, date.day).getDay()];
}

// 日付 → 月曜始まり曜日インデックス (0=月 .. 6=日)
function mondayIndex(year, date) {
  const dow = new Date(year, date.month - 1, date.day).getDay(); // 0=日..6=土
  return (dow + 6) % 7;
}

function venueNoteLabel(note) {
  if (!note) return null;
  if (note === 'kyocera') return '代替: 京セラ';
  return `代替: ${note}`;
}

function isSameCardMatchup(a, b) {
  if (!a || !b) return false;
  return (
    a.oppId === b.oppId &&
    a.isHome === b.isHome &&
    a.isInterleague === b.isInterleague
  );
}

function getCardMarker(schedule, day, myId) {
  const cur = getMyMatchup(schedule, day, myId);
  if (!cur) return null;

  let start = day;
  while (start > 1) {
    const prev = getMyMatchup(schedule, start - 1, myId);
    if (!isSameCardMatchup(cur, prev)) break;
    start--;
  }

  let end = day;
  while (end + 1 < (schedule?.length || 0)) {
    const next = getMyMatchup(schedule, end + 1, myId);
    if (!isSameCardMatchup(cur, next)) break;
    end++;
  }

  return { index: day - start + 1, total: end - start + 1 };
}

// 月別週グリッドデータを構築する
function buildMonthGrid(schedule, year, myId, month, gameResultsMap) {
  if (!schedule || myId === null || myId === undefined) return [];

  // その月のすべての gameDay エントリを収集
  const monthEntries = [];
  for (let idx = 1; idx < schedule.length; idx++) {
    const day = schedule[idx];
    if (!day) continue;
    if (day.date.month !== month) continue;
    if (day.isAllStar) {
      monthEntries.push({ dayNo: idx, date: day.date, matchup: null, isAllStar: true, allStarGame: day.allStarGame });
    } else {
      const matchup = getMyMatchup(schedule, idx, myId);
      monthEntries.push({ dayNo: idx, date: day.date, matchup });
    }
  }
  if (monthEntries.length === 0) return [];

  monthEntries.sort((a, b) => a.date.day - b.date.day);

  const firstDate = monthEntries[0].date;
  const lastDate = monthEntries[monthEntries.length - 1].date;

  // 月曜始まりのグリッドを構築
  // 最初の月曜から最後の日曜まで
  const startMon = mondayIndex(year, firstDate); // 第一試合日の月曜オフセット
  const cells = [];

  // カーソルを開始月曜にセット
  const cursor = new Date(year, firstDate.month - 1, firstDate.day - startMon);
  const endDate = new Date(year, lastDate.month - 1, lastDate.day);
  // 週末まで延ばす
  const endDow = mondayIndex(year, lastDate);
  endDate.setDate(endDate.getDate() + (6 - endDow));

  const byDate = new Map();
  monthEntries.forEach(e => byDate.set(`${e.date.month}-${e.date.day}`, e));

  while (cursor <= endDate) {
    const m = cursor.getMonth() + 1;
    const d = cursor.getDate();
    const key = `${m}-${d}`;
    if (m !== month) {
      cells.push({ type: 'other', date: { month: m, day: d } });
    } else {
      const entry = byDate.get(key);
      if (entry) {
        if (entry.isAllStar) {
          cells.push({ type: 'allstar', date: { month: m, day: d }, dayNo: entry.dayNo, allStarGame: entry.allStarGame });
        } else {
          const result = gameResultsMap?.[entry.dayNo] ?? null;
          cells.push({ type: 'game', date: { month: m, day: d }, dayNo: entry.dayNo, matchup: entry.matchup, result, isAllStar: false });
        }
      } else {
        const dayNo = schedule.findIndex(sd => sd?.date?.month === m && sd?.date?.day === d);
        cells.push({ type: 'off', date: { month: m, day: d }, dayNo, isAllStar: false });
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  // 7列ずつ週に分割
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}

// 結果モーダル
function ResultModal({ dayNo, result, date, year, opponent, onClose }) {
  if (!result) return null;
  const { won, drew, myScore, oppScore } = result;
  const resultLabel = drew ? '引き分け' : won ? '勝利' : '敗北';
  const resultColor = drew ? '#6b7280' : won ? '#4ade80' : '#f87171';
  const scoreBig = `${myScore} - ${oppScore}`;

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#0b1c30', border: '1px solid rgba(148,163,184,.25)', borderRadius: 14, padding: '24px 28px', minWidth: 260, maxWidth: 340, position: 'relative' }}
      >
        <button
          onClick={onClose}
          style={{ position: 'absolute', top: 10, right: 12, background: 'none', border: 'none', color: '#94a3b8', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}
        >✕</button>
        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>
          第{dayNo}戦 — {formatDate(date)}({weekdayName(year, date)})
        </div>
        <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 10 }}>vs {opponent}</div>
        <div style={{ fontSize: 38, fontWeight: 700, color: '#f8fafc', textAlign: 'center', letterSpacing: 4, marginBottom: 12 }}>
          {scoreBig}
        </div>
        <div style={{ textAlign: 'center' }}>
          <span style={{ background: drew ? 'rgba(107,114,128,.2)' : won ? 'rgba(74,222,128,.15)' : 'rgba(248,113,113,.15)', color: resultColor, border: `1px solid ${resultColor}40`, borderRadius: 6, padding: '4px 18px', fontSize: 14, fontWeight: 700 }}>
            {resultLabel}
          </span>
        </div>
      </div>
    </div>
  );
}

// 月別週グリッドセル
function GridCell({ cell, year, teamMap, isToday, isSelected, onSelect, onResultClick, allStarResult }) {
  if (cell.type === 'other') {
    return <div style={{ minHeight: 54, background: 'transparent' }} />;
  }
  if (cell.type === 'allstar') {
    const asResult = cell.allStarGame === 1
      ? allStarResult?.gameResult?.game1
      : allStarResult?.gameResult?.game2;
    return (
      <div
        style={{
          minHeight: 54,
          background: 'rgba(245,200,66,.16)',
          border: '1px solid rgba(245,200,66,.45)',
          borderRadius: 6,
          padding: '4px 6px',
          cursor: 'default',
        }}
      >
        <div style={{ fontSize: 10, color: '#f5c842', fontWeight: 700 }}>{cell.date.day}</div>
        <div style={{ fontSize: 9, color: '#f5c842', marginTop: 2, fontWeight: 700 }}>⭐ AS第{cell.allStarGame}戦</div>
        <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 1 }}>セ vs パ</div>
        {asResult && (
          <div style={{ fontSize: 9, color: '#f5c842', marginTop: 2, fontWeight: 700 }}>
            {asResult.score.ce}-{asResult.score.pa}
          </div>
        )}
      </div>
    );
  }

  if (cell.type === 'off') {
    return (
      <div style={{ minHeight: 54, background: cell.isAllStar ? 'rgba(245,200,66,.12)' : 'rgba(15,23,42,.2)', border: cell.isAllStar ? '1px solid rgba(245,200,66,.35)' : '1px solid transparent', borderRadius: 6, padding: '4px 6px' }}>
        <div style={{ fontSize: 10, color: '#374151' }}>{cell.date.day}</div>
        <div style={{ fontSize: 9, color: cell.isAllStar ? '#f5c842' : '#2e4055', marginTop: 2 }}>{cell.isAllStar ? 'AS' : '休'}</div>
      </div>
    );
  }

  // game セル
  const { matchup, result, dayNo, date } = cell;
  if (!matchup) {
    return (
      <div style={{ minHeight: 54, background: 'rgba(15,23,42,.25)', borderRadius: 6, padding: '4px 6px' }}>
        <div style={{ fontSize: 10, color: '#374151' }}>{date.day}</div>
      </div>
    );
  }

  const opp = teamMap.get(matchup.oppId);
  const isHome = matchup.isHome;
  const isInterleague = matchup.isInterleague;

  let bg = cell.isAllStar
    ? 'rgba(245,200,66,.14)'
    : isInterleague
    ? 'rgba(167,139,250,.12)'
    : isHome
    ? 'rgba(74,222,128,.1)'
    : 'rgba(96,165,250,.1)';
  let borderColor = isSelected
    ? 'rgba(245,200,66,.7)'
    : isToday
    ? 'rgba(245,200,66,.4)'
    : 'rgba(148,163,184,.12)';

  const hasResult = !!result;
  const resultColor = result
    ? result.drew ? '#6b7280' : result.won ? '#4ade80' : '#f87171'
    : null;

  return (
    <div
      onClick={() => onSelect(dayNo)}
      style={{
        minHeight: 54,
        background: bg,
        border: `1px solid ${borderColor}`,
        borderRadius: 6,
        padding: '4px 6px',
        cursor: 'pointer',
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ fontSize: 10, color: isToday ? '#f5c842' : '#94a3b8', fontWeight: isToday ? 700 : 400 }}>{date.day}</div>
        <div style={{ fontSize: 8, color: isHome ? '#4ade80' : '#60a5fa' }}>{isHome ? 'H' : 'V'}</div>
      </div>
      <div style={{ fontSize: 10, color: '#e2e8f0', marginTop: 2, lineHeight: 1.3, fontWeight: 600 }}>
        {opp?.short || opp?.name?.slice(0,4) || '?'}
      </div>
      {isInterleague && <div style={{ fontSize: 8, color: '#c4b5fd', marginTop: 1 }}>交流</div>}
      {cell.isAllStar && <div style={{ fontSize: 8, color: '#f5c842', marginTop: 1, fontWeight: 700 }}>AS</div>}
      {hasResult && (
        <button
          onClick={e => { e.stopPropagation(); onResultClick(dayNo); }}
          style={{
            display: 'block',
            marginTop: 3,
            background: 'none',
            border: `1px solid ${resultColor}50`,
            borderRadius: 3,
            padding: '1px 4px',
            fontSize: 9,
            color: resultColor,
            cursor: 'pointer',
            fontWeight: 700,
            width: '100%',
            textAlign: 'center',
          }}
        >
          {result.drew ? '△' : result.won ? '○' : '●'}{result.myScore}-{result.oppScore}
        </button>
      )}
    </div>
  );
}

// シーズン進捗バー
function SeasonProgressBar({ gameDay, wins, losses }) {
  const played = gameDay - 1;
  const pct = Math.min(100, Math.round(played / SEASON_GAMES * 100));
  const winPct = played > 0 ? (wins / played * 1000).toFixed(0).padStart(3, '0') : '---';
  return (
    <div style={{ background: 'rgba(255,255,255,.02)', border: '1px solid rgba(148,163,184,.12)', borderRadius: 10, padding: '10px 14px', marginBottom: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ fontSize: 11, color: '#94a3b8' }}>シーズン進捗</div>
        <div style={{ fontSize: 11, color: '#cbd5e1' }}>
          <span style={{ fontWeight: 700, color: '#f8fafc' }}>{played}</span>
          <span style={{ color: '#374151' }}>/{SEASON_GAMES}試合</span>
          <span style={{ marginLeft: 10, color: '#34d399' }}>{wins}勝</span>
          <span style={{ marginLeft: 4, color: '#f87171' }}>{losses}敗</span>
          <span style={{ marginLeft: 8, color: '#94a3b8', fontSize: 10 }}>勝率 .{winPct}</span>
        </div>
      </div>
      <div style={{ height: 6, background: 'rgba(148,163,184,.1)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg,#4ade80,#f5c842)', borderRadius: 3, transition: 'width .3s' }} />
      </div>
    </div>
  );
}

export function ScheduleTab({ schedule, gameDay, myTeam, teams, year, gameResultsMap = {}, allStarDone = false, allStarResult = null, allStarTriggerDay = 72, onResultClick = null, scheduleArchive = [] }) {
  const [selectedDay, setSelectedDay] = useState(gameDay);
  const [resultModal, setResultModal] = useState(null); // dayNo or null
  const [boxScoreModal, setBoxScoreModal] = useState(null); // { dayNo, result } or null
  const [viewYear, setViewYear] = useState(year);

  // 現シーズンに切り替わったら表示年をリセット
  useEffect(() => {
    setViewYear(year);
    setSelectedDay(gameDay);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  useEffect(() => {
    if (viewYear === year) setSelectedDay(gameDay);
  }, [gameDay, viewYear, year]);

  // 表示対象シーズンのデータ
  const archived = scheduleArchive.find(a => a.year === viewYear);
  const isPast = viewYear !== year;
  const viewSchedule = isPast ? (archived?.schedule || null) : schedule;
  const viewResultsMap = isPast ? (archived?.gameResultsMap || {}) : gameResultsMap;
  const viewBoxResultsMap = isPast ? (archived?.myTeamResultsMap || {}) : null;

  // 過去シーズンの最終成績を gameResultsMap から集計
  const pastRecord = useMemo(() => {
    if (!isPast) return null;
    const results = Object.values(viewResultsMap);
    const w = results.filter(r => r.won).length;
    const d = results.filter(r => r.drew).length;
    const l = results.filter(r => !r.won && !r.drew).length;
    return { w, d, l };
  }, [isPast, viewResultsMap]);

  const teamMap = useMemo(() => new Map((teams || []).map(t => [t.id, t])), [teams]);
  const maxDay = viewSchedule?.length ? viewSchedule.length - 1 : 0;

  const todayMatchup = useMemo(
    () => !isPast ? getMyMatchup(viewSchedule, gameDay, myTeam?.id) : null,
    [viewSchedule, gameDay, myTeam?.id, isPast]
  );

  const upcoming = useMemo(() => {
    if (isPast || !viewSchedule || myTeam?.id === null || myTeam?.id === undefined) return [];
    const days = [];
    for (let day = gameDay + 1; day <= Math.min(maxDay, gameDay + 8); day++) {
      const matchup = getMyMatchup(viewSchedule, day, myTeam.id);
      if (!matchup) continue;
      const date = gameDayToDate(day, viewSchedule);
      const card = getCardMarker(viewSchedule, day, myTeam.id);
      days.push({ day, date, matchup, opponent: teamMap.get(matchup.oppId), card });
    }
    return days;
  }, [viewSchedule, myTeam?.id, gameDay, maxDay, teamMap, isPast]);

  // 月別グリッドデータ
  const monthGrids = useMemo(() => {
    if (!viewSchedule || myTeam?.id === null || myTeam?.id === undefined) return [];
    return MONTH_LABELS
      .map(label => Number(label.replace('月', '')))
      .map(month => ({
        month,
        weeks: buildMonthGrid(viewSchedule, viewYear, myTeam.id, month, viewResultsMap),
      }))
      .filter(m => m.weeks.length > 0);
  }, [viewSchedule, viewYear, myTeam?.id, viewResultsMap]);

  if (!schedule || !myTeam) {
    return (
      <div className="card">
        <div className="card-h">🗓️ 日程</div>
        <div style={{ fontSize: 12, color: '#94a3b8' }}>日程を読み込み中です…</div>
      </div>
    );
  }

  const todayDate = !isPast ? gameDayToDate(gameDay, viewSchedule) : null;
  const todayOpponent = todayMatchup ? teamMap.get(todayMatchup.oppId) : null;
  const modalResult = resultModal ? viewResultsMap[resultModal] : null;
  const modalDate = resultModal ? gameDayToDate(resultModal, viewSchedule) : null;
  const modalOpponent = resultModal && modalResult ? modalResult.oppName : null;
  const boxModalDate = boxScoreModal ? gameDayToDate(boxScoreModal.dayNo, viewSchedule) : null;

  // 年度セレクター用リスト（過去アーカイブ + 現在）
  const availableYears = [...scheduleArchive.map(a => a.year).sort((a,b)=>b-a), year];

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {/* 年度セレクター（アーカイブがある場合のみ表示） */}
      {scheduleArchive.length > 0 && (
        <div className="card" style={{ padding: '10px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>シーズン:</span>
            {availableYears.map(y => (
              <button
                key={y}
                className={`bsm ${viewYear === y ? 'bgb' : 'bga'}`}
                style={{ padding: '3px 10px', fontWeight: viewYear === y ? 700 : 400 }}
                onClick={() => { setViewYear(y); setResultModal(null); setBoxScoreModal(null); }}
              >
                {y}年{y === year ? ' (現在)' : ''}
              </button>
            ))}
          </div>
          {isPast && pastRecord && (
            <div style={{ marginTop: 8, fontSize: 12, color: '#94a3b8' }}>
              {viewYear}年 最終成績:
              <span style={{ color: '#4ade80', marginLeft: 6, fontWeight: 700 }}>{pastRecord.w}勝</span>
              <span style={{ color: '#f87171', marginLeft: 4, fontWeight: 700 }}>{pastRecord.l}敗</span>
              {pastRecord.d > 0 && <span style={{ color: '#6b7280', marginLeft: 4, fontWeight: 700 }}>{pastRecord.d}分</span>}
              <span style={{ color: '#64748b', marginLeft: 8 }}>（{pastRecord.w + pastRecord.l + pastRecord.d}試合）</span>
            </div>
          )}
        </div>
      )}

      {/* シーズン進捗バー（現シーズンのみ） */}
      {!isPast && <SeasonProgressBar gameDay={gameDay} wins={myTeam.wins || 0} losses={myTeam.losses || 0} />}

      {/* 今日のカード（現シーズンのみ） */}
      {!isPast && (
      <div className="card">
        <div className="card-h">🗓️ 今日のカード</div>
        {todayMatchup && todayOpponent ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc' }}>vs {todayOpponent.name}</div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                {formatDate(todayDate)} ({weekdayName(year, todayDate)}) 第{gameDay}戦
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                <span className="chip" style={{ background: todayMatchup.isHome ? 'rgba(74,222,128,.12)' : 'rgba(96,165,250,.12)', color: todayMatchup.isHome ? '#4ade80' : '#60a5fa' }}>
                  {todayMatchup.isHome ? 'ホーム開催' : 'ビジター'}
                </span>
                {todayMatchup.isInterleague && <span className="chip cy">🔄 交流戦</span>}
                {(gameDay===allStarTriggerDay||gameDay===allStarTriggerDay+1) && <span className="chip" style={{ background: 'rgba(245,200,66,.18)', color: '#f5c842' }}>⭐ オールスター開催日</span>}
                {todayMatchup.venueNote && <span style={{ fontSize: 10, color: '#f5c842' }}>{venueNoteLabel(todayMatchup.venueNote)}</span>}
              </div>
            </div>
            {selectedDay !== gameDay && (
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button className="bsm bga" onClick={() => setSelectedDay(gameDay)}>
                  今日へ戻る
                </button>
              </div>
            )}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: '#94a3b8' }}>今日の対戦情報がありません。</div>
        )}
      </div>
      )}

      {/* 今後8試合（現シーズンのみ） */}
      {!isPast && upcoming.length > 0 && (
        <div className="card">
          <div className="card-h">⏭️ 今後8試合</div>
          <div style={{ display: 'grid', gap: 6 }}>
            {upcoming.map(item => (
              <button
                key={item.day}
                className="bsm bga"
                onClick={() => setSelectedDay(item.day)}
                style={{
                  textAlign: 'left',
                  padding: '8px 12px',
                  border: selectedDay === item.day ? '1px solid rgba(245,200,66,.6)' : '1px solid rgba(148,163,184,.18)',
                  background: selectedDay === item.day ? 'rgba(245,200,66,.08)' : 'rgba(15,23,42,.35)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <div>
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>
                    第{item.day}戦 {formatDate(item.date)}({weekdayName(year, item.date)})
                  </span>
                  {item.card && (
                    <span style={{ fontSize: 10, color: '#f5c842', marginLeft: 8, fontWeight: 700 }}>
                      CARD {item.card.index}/{item.card.total}
                    </span>
                  )}
                  <span style={{ fontSize: 13, color: '#f8fafc', marginLeft: 10, fontWeight: 600 }}>
                    vs {item.opponent?.name}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <span className="chip" style={{ background: item.matchup.isHome ? 'rgba(74,222,128,.12)' : 'rgba(96,165,250,.12)', color: item.matchup.isHome ? '#4ade80' : '#60a5fa' }}>
                    {item.matchup.isHome ? 'H' : 'V'}
                  </span>
                  {item.matchup.isInterleague && <span className="chip cy">交流</span>}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 月別週グリッドカレンダー */}
      <div className="card">
        <div className="card-h">🗓️ {viewYear}年 シーズンカレンダー</div>
        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 10, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <span><span style={{ display: 'inline-block', width: 8, height: 8, background: 'rgba(74,222,128,.5)', borderRadius: 2, marginRight: 4 }} />ホーム</span>
          <span><span style={{ display: 'inline-block', width: 8, height: 8, background: 'rgba(96,165,250,.5)', borderRadius: 2, marginRight: 4 }} />ビジター</span>
          <span><span style={{ display: 'inline-block', width: 8, height: 8, background: 'rgba(167,139,250,.5)', borderRadius: 2, marginRight: 4 }} />交流戦</span>
          <span style={{ color: '#4ade80' }}>○勝</span>
          <span style={{ color: '#f87171', marginLeft: 4 }}>●負</span>
          <span style={{ color: '#6b7280', marginLeft: 4 }}>△分</span>
          <span style={{ color: '#f5c842', marginLeft: 4 }}>AS: オールスター</span>
          <span style={{ color: '#374151', marginLeft: 4 }}>— スコアをクリックで詳細表示</span>
        </div>
        <div style={{ display: 'grid', gap: 16 }}>
          {monthGrids.map(({ month, weeks }) => (
            <div key={month} id={`cal-month-${month}`}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc', marginBottom: 8 }}>{month}月</div>
              {/* 曜日ヘッダー */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3, marginBottom: 3 }}>
                {WEEK_DAYS.map((w, i) => (
                  <div key={w} style={{ fontSize: 9, color: i === 5 ? '#60a5fa' : i === 6 ? '#f87171' : '#374151', textAlign: 'center', padding: '2px 0' }}>{w}</div>
                ))}
              </div>
              {/* 週ごとの行 */}
              {weeks.map((week, wi) => (
                <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3, marginBottom: 3 }}>
                  {week.map((cell, ci) => (
                    <GridCell
                      key={ci}
                      cell={cell}
                      year={viewYear}
                      teamMap={teamMap}
                      isToday={!isPast && cell.type === 'game' && cell.dayNo === gameDay}
                      isSelected={cell.type === 'game' && cell.dayNo === selectedDay}
                      onSelect={setSelectedDay}
                      onResultClick={(dayNo) => {
                        if (!isPast) {
                          (onResultClick || setResultModal)(dayNo);
                          return;
                        }
                        const boxResult = viewBoxResultsMap?.[dayNo];
                        if (boxResult && (boxResult.inningScores || boxResult.myBatting || boxResult.myPitching)) {
                          setBoxScoreModal({ dayNo, result: boxResult });
                        } else {
                          setResultModal(dayNo);
                        }
                      }}
                      allStarResult={isPast ? null : allStarResult}
                    />
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* 結果モーダル（過去シーズンは常に内部モーダル、現シーズンは onResultClick なければ内部モーダル） */}
      {(isPast || !onResultClick) && resultModal && modalResult && (
        <ResultModal
          dayNo={resultModal}
          result={modalResult}
          date={modalDate}
          year={viewYear}
          opponent={modalOpponent}
          onClose={() => setResultModal(null)}
        />
      )}

      {isPast && boxScoreModal?.result && (
        <BoxScoreModal
          result={boxScoreModal.result}
          myTeamName={myTeam?.name || '自チーム'}
          oppTeamName={boxScoreModal.result.oppName || '相手'}
          teamId={myTeam?.id}
          dayNo={boxScoreModal.dayNo}
          date={boxModalDate}
          year={viewYear}
          onClose={() => setBoxScoreModal(null)}
        />
      )}
    </div>
  );
}
