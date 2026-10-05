export function ScheduleAgenda({ cells, teams, selectedDay, gameDay, onSelect, onResultClick, allStarResult }) {
  return <div className="schedule-agenda">
    {cells.filter(cell => cell.type !== 'other').map(cell => {
      const matchup = cell.matchup;
      const result = cell.result;
      const opponent = matchup ? teams.get(matchup.oppId) : null;
      const isToday = cell.dayNo === gameDay;
      const allStar = cell.allStarGame === 1 ? allStarResult?.gameResult?.game1 : allStarResult?.gameResult?.game2;
      const outcome = result?.drew ? '引分' : result?.won ? '勝利' : '敗戦';
      return <div key={`${cell.date.month}-${cell.date.day}`} className="schedule-agenda-row" data-selected={selectedDay === cell.dayNo}>
        <div className="schedule-agenda-date">{cell.date.month}/{cell.date.day}{isToday && <small>今日</small>}</div>
        <div className="schedule-agenda-match">
          {cell.type === 'allstar' ? <><strong>オールスター 第{cell.allStarGame}戦</strong><small>セ vs パ{allStar ? `　${allStar.score.ce} − ${allStar.score.pa}` : ''}</small></> : matchup ? <>
            <button className="schedule-opponent" aria-pressed={selectedDay === cell.dayNo} onClick={() => onSelect(cell.dayNo)}>{opponent?.name || result?.oppName || '対戦相手未定'}</button>
            <small>{matchup.isHome ? 'ホーム' : 'ビジター'}{matchup.isInterleague ? '・交流戦' : ''}{matchup.venueNote ? `・代替開催: ${matchup.venueNote === 'kyocera' ? '京セラ' : matchup.venueNote}` : ''}</small>
          </> : <span className="flow-muted">試合なし</span>}
        </div>
        {result && <button className="schedule-score" onClick={() => onResultClick(cell.dayNo)} aria-label={`${cell.date.month}月${cell.date.day}日 ${opponent?.name || result.oppName || ''}戦の結果 ${outcome} ${result.myScore}対${result.oppScore}`}>
          <strong>{result.myScore} − {result.oppScore}</strong><small>{outcome}・詳細</small>
        </button>}
      </div>;
    })}
  </div>;
}
