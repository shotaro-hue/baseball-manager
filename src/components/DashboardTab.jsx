import { useMemo } from "react";
import { fmtM, gameDayToDate } from '../utils';
import { getMyMatchup } from '../engine/scheduleGen';
import { MAX_ROSTER } from '../constants';

export function DashboardTab({ myTeam, teams, schedule, gameDay, recentResults, mailbox, faPool, onTabSwitch }) {
  const leagueStandings = useMemo(() => {
    if (!myTeam || !teams) return { rank: 0, gb: 0, total: 0 };
    const sameLeagueTeams = [...teams.filter(t => t.league === myTeam.league)].sort((a, b) => {
      const aWinPct = a.wins / Math.max(1, a.wins + a.losses);
      const bWinPct = b.wins / Math.max(1, b.wins + b.losses);
      return bWinPct - aWinPct || (b.rf - b.ra) - (a.rf - a.ra);
    });
    const rank = sameLeagueTeams.findIndex(t => t.id === myTeam.id) + 1;
    const leader = sameLeagueTeams[0];
    const gamesBehind = rank === 1 ? 0 : ((leader.wins - myTeam.wins) + (myTeam.losses - leader.losses)) / 2;
    return { rank, gb: gamesBehind, total: sameLeagueTeams.length };
  }, [myTeam, teams]);

  const todayGame = useMemo(() => {
    if (!schedule || !myTeam) return null;
    const matchup = getMyMatchup(schedule, gameDay + 1, myTeam.id);
    if (!matchup) return null;
    const opponent = teams.find(t => t.id === matchup.oppId);
    const date = gameDayToDate(gameDay + 1, schedule);
    return { opponent, isHome: matchup.isHome, date, isInterleague: matchup.isInterleague };
  }, [schedule, gameDay, myTeam, teams]);

  const recommendationItems = useMemo(() => {
    if (!myTeam) return [];
    const items = [];
    const over = myTeam.players.filter(p => !p.isIkusei).length - MAX_ROSTER;
    if (over > 0) items.push({ tone: 'danger', title: `ロースター枠超過 +${over}人`, reason: '一軍登録枠を超えています。編成タブで調整が必要です。', tab: 'roster' });
    const expiring = myTeam.players.filter(p => (p.contractYearsLeft ?? 99) <= 1 && !p.isIkusei).length;
    if (expiring > 0) items.push({ tone: 'warning', title: `契約満了予定 ${expiring}人`, reason: '契約延長の判断を先送りすると戦力低下リスクがあります。', tab: 'contract' });
    const injured = myTeam.players.filter(p => (p.injuryDaysLeft ?? 0) > 0).length;
    if (injured > 0) items.push({ tone: 'warning', title: `負傷中 ${injured}人`, reason: '起用見直しと二軍入れ替えを検討してください。', tab: 'roster' });
    const tradeOffers = mailbox.filter(m => m.type === 'trade' && !m.resolved && !m.read).length;
    if (tradeOffers > 0) items.push({ tone: 'danger', title: `トレードオファー ${tradeOffers}件`, reason: '期限切れ前に受諾・拒否の意思決定が必要です。', tab: 'mailbox' });
    if (items.length === 0) {
      items.push({ tone: 'good', title: '大きな緊急課題なし', reason: '今日は試合準備と先発起用の確認を優先しましょう。', tab: 'schedule' });
    }
    return items.slice(0, 3);
  }, [myTeam, mailbox]);

  if (!myTeam) return null;

  const winPct = myTeam.wins + myTeam.losses > 0 ? (myTeam.wins / (myTeam.wins + myTeam.losses)).toFixed(3).replace(/^0/, '') : '.000';
  const runDiff = (myTeam.rf ?? 0) - (myTeam.ra ?? 0);
  const recentWins = recentResults.filter(r => r.won).length;
  const recentLosses = recentResults.filter(r => !r.won && !r.drew).length;
  const rpg = (myTeam.rf ?? 0) / Math.max(1, myTeam.wins + myTeam.losses);
  const rapg = (myTeam.ra ?? 0) / Math.max(1, myTeam.wins + myTeam.losses);

  const toneClassByName = { good: 'cg', warning: 'cy', danger: 'cr', neutral: 'cb' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
      <div className="card">
        <div className="card-h">今日の試合</div>
        {todayGame ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 30 }}>{todayGame.opponent?.emoji}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{todayGame.opponent?.name}</div>
                <div style={{ color: '#94a3b8', fontSize: 11 }}>{todayGame.date.month}月{todayGame.date.day}日（第{gameDay + 1}戦）</div>
              </div>
              <span className={`chip ${todayGame.isHome ? 'cg' : 'cb'}`}>{todayGame.isHome ? 'ホーム' : 'アウェイ'}</span>
            </div>
            <button className="sim-btn" onClick={() => onTabSwitch('schedule')} style={{ marginTop: 12, marginBottom: 0 }}>試合へ</button>
          </>
        ) : <div style={{ color: '#94a3b8' }}>本日の試合はありません</div>}
      </div>

      <div className="card">
        <div className="card-h">今日のおすすめ采配</div>
        <div style={{ display: 'grid', gap: 8 }}>
          {recommendationItems.map((item, idx) => (
            <button key={`${item.title}-${idx}`} onClick={() => onTabSwitch(item.tab)} className="action-item" style={{ borderLeftColor: item.tone === 'danger' ? '#f87171' : item.tone === 'warning' ? '#f5c842' : '#34d399' }}>
              <div>
                <div style={{ fontWeight: 700 }}>{item.title}</div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>{item.reason}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="g2">
        <div className="card stat-tile"><div className="stat-tile-lbl">順位</div><div className="stat-tile-val">{leagueStandings.rank}位</div></div>
        <div className="card stat-tile"><div className="stat-tile-lbl">勝敗</div><div className="stat-tile-val">{myTeam.wins}-{myTeam.losses}</div></div>
        <div className="card stat-tile"><div className="stat-tile-lbl">得点 R/G</div><div className="stat-tile-val">{rpg.toFixed(2)}</div></div>
        <div className="card stat-tile"><div className="stat-tile-lbl">失点 RA/G</div><div className="stat-tile-val">{rapg.toFixed(2)}</div></div>
      </div>

      <div className="card">
        <div className="card-h">チーム状態</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span className={`chip ${runDiff >= 20 ? 'cg' : runDiff <= -20 ? 'cr' : 'cy'}`}>得失差 {runDiff >= 0 ? '+' : ''}{runDiff}</span>
          <span className={`chip ${recentWins >= recentLosses ? 'cg' : 'cr'}`}>直近成績 {recentWins}勝{recentLosses}敗</span>
          <span className={`chip ${winPct >= '.550' ? 'cg' : winPct < '.450' ? 'cr' : 'cb'}`}>勝率 {winPct}</span>
          <span className={`chip ${toneClassByName.neutral}`}>予算 {fmtM(myTeam.budget ?? 0)}</span>
        </div>
      </div>

      <div className="card">
        <div className="card-h">注目選手</div>
        <div style={{ display: 'grid', gap: 8 }}>
          {[...myTeam.players]
            .sort((a, b) => (b.war ?? 0) - (a.war ?? 0))
            .slice(0, 3)
            .map(p => (
              <div key={p.id} className="card2" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{p.name}（{p.pos}）</span>
                <span className="mono">WAR {((p.war ?? 0)).toFixed(1)}</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
