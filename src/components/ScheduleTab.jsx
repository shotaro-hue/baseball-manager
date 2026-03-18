import { useEffect, useMemo, useState } from 'react';
import { gameDayToDate } from '../utils';
import { getMyMatchup } from '../engine/scheduleGen';

const MONTH_LABELS = ['3月','4月','5月','6月','7月','8月','9月','10月'];

const panelStyle = {
  border: '1px solid rgba(148,163,184,.18)',
  borderRadius: 12,
  background: 'rgba(255,255,255,.02)',
  padding: 12,
};

function formatDate(date) {
  return date ? `${date.month}/${date.day}` : '-';
}

function weekdayName(year, date) {
  if (!date) return '';
  return ['日', '月', '火', '水', '木', '金', '土'][new Date(year, date.month - 1, date.day).getDay()];
}

function venueNoteLabel(note) {
  if (!note) return null;
  if (note === 'kyocera') return '代替球場: 京セラドーム';
  return `代替球場: ${note}`;
}

function buildTimeline(schedule, year, myId) {
  if (!schedule || schedule.length <= 1 || myId === null || myId === undefined) return [];

  const items = [];
  let cursor = new Date(year, schedule[1].date.month - 1, schedule[1].date.day);
  const end = new Date(year, schedule[schedule.length - 1].date.month - 1, schedule[schedule.length - 1].date.day);
  const byDate = new Map();

  schedule.forEach((day, idx) => {
    if (!idx || !day) return;
    byDate.set(`${day.date.month}-${day.date.day}`, { dayNo: idx, day });
  });

  while (cursor <= end) {
    const month = cursor.getMonth() + 1;
    const day = cursor.getDate();
    const hit = byDate.get(`${month}-${day}`);
    if (hit) {
      const matchup = getMyMatchup(schedule, hit.dayNo, myId);
      items.push({
        type: 'game',
        month,
        day,
        dayNo: hit.dayNo,
        isInterleague: !!matchup?.isInterleague,
        matchup,
      });
    } else {
      const dow = cursor.getDay();
      items.push({
        type: 'off',
        month,
        day,
        label: dow === 1 ? '月曜休' : '休み',
      });
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  const grouped = new Map();
  items.forEach(item => {
    if (!grouped.has(item.month)) grouped.set(item.month, []);
    grouped.get(item.month).push(item);
  });

  return MONTH_LABELS.map(label => Number(label.replace('月', '')))
    .filter(month => grouped.has(month))
    .map(month => ({ month, items: grouped.get(month) }));
}

function MatchupPill({ year, dayNo, date, matchup, opponent, isSelected, isToday, onSelect }) {
  if (!matchup || !opponent) return null;
  const venue = venueNoteLabel(matchup.venueNote);
  return (
    <button
      className="bsm bga"
      onClick={() => onSelect(dayNo)}
      style={{
        textAlign: 'left',
        padding: 10,
        width: '100%',
        border: isSelected ? '1px solid rgba(245,200,66,.6)' : '1px solid rgba(148,163,184,.18)',
        background: isSelected ? 'rgba(245,200,66,.08)' : 'rgba(15,23,42,.35)',
      }}
    >
      <div className="fsb" style={{ gap: 8, alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 12, color: '#e2e8f0' }}>
            第{dayNo}戦 {isToday ? '・今日' : ''}
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
            {formatDate(date)} ({date ? weekdayName(year, date) : ''})
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <span className="chip" style={{ background: matchup.isHome ? 'rgba(74,222,128,.12)' : 'rgba(96,165,250,.12)', color: matchup.isHome ? '#4ade80' : '#60a5fa' }}>
            {matchup.isHome ? 'ホーム' : 'ビジター'}
          </span>
          {matchup.isInterleague && <span className="chip cy">🔄交流戦</span>}
        </div>
      </div>
      <div style={{ fontSize: 13, color: '#f8fafc', marginTop: 8 }}>
        vs {opponent.name}
      </div>
      {venue && <div style={{ fontSize: 10, color: '#f5c842', marginTop: 4 }}>{venue}</div>}
    </button>
  );
}

export function ScheduleTab({ schedule, gameDay, myTeam, teams, year }) {
  const [selectedDay, setSelectedDay] = useState(gameDay);

  useEffect(() => {
    setSelectedDay(gameDay);
  }, [gameDay]);

  const teamMap = useMemo(() => new Map((teams || []).map(team => [team.id, team])), [teams]);
  const maxDay = schedule?.length ? schedule.length - 1 : 0;

  const todayMatchup = useMemo(
    () => getMyMatchup(schedule, gameDay, myTeam?.id),
    [schedule, gameDay, myTeam?.id]
  );

  const upcoming = useMemo(() => {
    if (!schedule || myTeam?.id === null || myTeam?.id === undefined) return [];
    const days = [];
    for (let day = gameDay + 1; day <= Math.min(maxDay, gameDay + 8); day++) {
      const matchup = getMyMatchup(schedule, day, myTeam.id);
      if (!matchup) continue;
      days.push({ day, date: gameDayToDate(day, schedule), matchup, opponent: teamMap.get(matchup.oppId) });
    }
    return days;
  }, [schedule, myTeam?.id, gameDay, maxDay, teamMap]);

  const recent = useMemo(() => {
    if (!schedule || myTeam?.id === null || myTeam?.id === undefined) return [];
    const days = [];
    for (let day = Math.max(1, gameDay - 5); day < gameDay; day++) {
      const matchup = getMyMatchup(schedule, day, myTeam.id);
      if (!matchup) continue;
      days.push({ day, date: gameDayToDate(day, schedule), matchup, opponent: teamMap.get(matchup.oppId) });
    }
    return days.reverse();
  }, [schedule, myTeam?.id, gameDay, teamMap]);

  const selectedScheduleDay = schedule?.[selectedDay] || null;
  const selectedMyMatchup = useMemo(
    () => getMyMatchup(schedule, selectedDay, myTeam?.id),
    [schedule, selectedDay, myTeam?.id]
  );
  const timeline = useMemo(() => buildTimeline(schedule, year, myTeam?.id), [schedule, year, myTeam?.id]);

  if (!schedule || !myTeam) {
    return (
      <div className="card">
        <div className="card-h">🗓️ 日程</div>
        <div style={{ fontSize: 12, color: '#94a3b8' }}>日程を読み込み中です…</div>
      </div>
    );
  }

  const selectedDate = gameDayToDate(selectedDay, schedule);
  const selectedOpponent = selectedMyMatchup ? teamMap.get(selectedMyMatchup.oppId) : null;
  const todayOpponent = todayMatchup ? teamMap.get(todayMatchup.oppId) : null;

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="card">
        <div className="card-h">🗓️ 日程ハブ</div>
        <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 10 }}>
          今日のカード確認だけでなく、任意の gameDay を選んで schedule[gameDay] の全カードへ直接ジャンプできます。
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
          <div style={panelStyle}>
            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>今日の対戦カード</div>
            {todayMatchup && todayOpponent ? (
              <>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc' }}>vs {todayOpponent.name}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                  <span className="chip" style={{ background: todayMatchup.isHome ? 'rgba(74,222,128,.12)' : 'rgba(96,165,250,.12)', color: todayMatchup.isHome ? '#4ade80' : '#60a5fa' }}>
                    {todayMatchup.isHome ? 'ホーム開催' : 'ビジター'}
                  </span>
                  {todayMatchup.isInterleague && <span className="chip cy">🔄交流戦</span>}
                </div>
                <div style={{ fontSize: 11, color: '#cbd5e1', marginTop: 8 }}>
                  {formatDate(gameDayToDate(gameDay, schedule))} ({weekdayName(year, gameDayToDate(gameDay, schedule))}) / 第{gameDay}戦
                </div>
                {todayMatchup.venueNote && <div style={{ fontSize: 10, color: '#f5c842', marginTop: 6 }}>{venueNoteLabel(todayMatchup.venueNote)}</div>}
                <button className="btn btn-gold" style={{ marginTop: 10, padding: '8px 12px', width: '100%' }} onClick={() => setSelectedDay(gameDay)}>
                  今日の schedule[{gameDay}] を開く
                </button>
              </>
            ) : (
              <div style={{ fontSize: 12, color: '#94a3b8' }}>今日の対戦情報を取得できません。</div>
            )}
          </div>

          <div style={panelStyle}>
            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>選択中の日程</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc' }}>第{selectedDay}戦</div>
            <div style={{ fontSize: 11, color: '#cbd5e1', marginTop: 4 }}>
              {formatDate(selectedDate)} ({weekdayName(year, selectedDate)})
            </div>
            {selectedMyMatchup && selectedOpponent ? (
              <>
                <div style={{ fontSize: 13, color: '#f8fafc', marginTop: 10 }}>vs {selectedOpponent.name}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                  <span className="chip" style={{ background: selectedMyMatchup.isHome ? 'rgba(74,222,128,.12)' : 'rgba(96,165,250,.12)', color: selectedMyMatchup.isHome ? '#4ade80' : '#60a5fa' }}>
                    {selectedMyMatchup.isHome ? 'ホーム' : 'ビジター'}
                  </span>
                  {selectedMyMatchup.isInterleague && <span className="chip cy">🔄交流戦</span>}
                </div>
                {selectedMyMatchup.venueNote && <div style={{ fontSize: 10, color: '#f5c842', marginTop: 6 }}>{venueNoteLabel(selectedMyMatchup.venueNote)}</div>}
              </>
            ) : (
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 10 }}>この日の自チームカードが見つかりません。</div>
            )}
            {selectedDay !== gameDay && (
              <button className="bsm bga" style={{ marginTop: 10, width: '100%' }} onClick={() => setSelectedDay(gameDay)}>
                今日へ戻る
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-h">🔎 schedule[{selectedDay}] の全対戦カード</div>
        <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 10 }}>
          選択した gameDay に組まれている全6カードを直接確認できます。
        </div>
        <div className="g2">
          {(selectedScheduleDay?.matchups || []).map((matchup, index) => {
            const home = teamMap.get(matchup.homeId);
            const away = teamMap.get(matchup.awayId);
            const mine = matchup.homeId === myTeam.id || matchup.awayId === myTeam.id;
            return (
              <div key={`${selectedDay}-${index}`} className="card2" style={{ border: mine ? '1px solid rgba(245,200,66,.55)' : undefined }}>
                <div className="fsb" style={{ alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: mine ? '#f5c842' : '#e2e8f0' }}>
                    {home?.name} vs {away?.name}
                  </div>
                  {mine && <span className="chip cy">自チーム</span>}
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>
                  ホーム: {home?.name || '-'} / ビジター: {away?.name || '-'}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                  {(matchup.isInterleague || selectedScheduleDay?.isInterleague) && <span className="chip cy">🔄交流戦</span>}
                  {matchup.venueNote && <span className="chip" style={{ background: 'rgba(245,200,66,.12)', color: '#f5c842' }}>{venueNoteLabel(matchup.venueNote)}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 12 }}>
        <div className="card">
          <div className="card-h">⏭️ 今後8試合</div>
          <div style={{ display: 'grid', gap: 8 }}>
            {upcoming.length === 0 && <div style={{ fontSize: 12, color: '#94a3b8' }}>残りの予定はありません。</div>}
            {upcoming.map(item => (
              <MatchupPill
                year={year}
                key={item.day}
                dayNo={item.day}
                date={item.date}
                matchup={item.matchup}
                opponent={item.opponent}
                isSelected={selectedDay === item.day}
                isToday={false}
                onSelect={setSelectedDay}
              />
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-h">⏮️ 直近の消化済み試合</div>
          <div style={{ display: 'grid', gap: 8 }}>
            {recent.length === 0 && <div style={{ fontSize: 12, color: '#94a3b8' }}>まだ消化済み試合がありません。</div>}
            {recent.map(item => (
              <MatchupPill
                year={year}
                key={item.day}
                dayNo={item.day}
                date={item.date}
                matchup={item.matchup}
                opponent={item.opponent}
                isSelected={selectedDay === item.day}
                isToday={false}
                onSelect={setSelectedDay}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-h">🧭 月別カレンダー一覧</div>
        <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 10 }}>
          月曜休み、交流戦期間、ホーム/ビジター、選択中 gameDay の位置をまとめて確認できます。
        </div>
        <div style={{ display: 'grid', gap: 10 }}>
          {timeline.map(section => (
            <div key={section.month} style={panelStyle}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc', marginBottom: 8 }}>{section.month}月</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {section.items.map(item => {
                  if (item.type === 'off') {
                    return (
                      <span
                        key={`off-${section.month}-${item.day}`}
                        className="chip"
                        style={{ background: 'rgba(148,163,184,.12)', color: '#94a3b8' }}
                      >
                        {item.month}/{item.day} {item.label}
                      </span>
                    );
                  }
                  const opponent = teamMap.get(item.matchup?.oppId);
                  const isSelected = item.dayNo === selectedDay;
                  return (
                    <button
                      key={`game-${item.dayNo}`}
                      className="chip"
                      onClick={() => setSelectedDay(item.dayNo)}
                      style={{
                        cursor: 'pointer',
                        border: isSelected ? '1px solid rgba(245,200,66,.65)' : '1px solid rgba(148,163,184,.18)',
                        background: isSelected ? 'rgba(245,200,66,.1)' : item.isInterleague ? 'rgba(167,139,250,.12)' : 'rgba(15,23,42,.35)',
                        color: isSelected ? '#f5c842' : item.isInterleague ? '#c4b5fd' : '#cbd5e1',
                        padding: '5px 8px',
                      }}
                    >
                      {item.month}/{item.day} {item.matchup?.isHome ? 'H' : 'V'} {opponent?.short || opponent?.name}
                      {item.isInterleague ? ' 🔄' : ''}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
