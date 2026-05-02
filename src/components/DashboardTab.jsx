import { useMemo } from "react";
import { fmtM, gameDayToDate } from '../utils';
import { getMyMatchup } from '../engine/scheduleGen';
import { MAX_ROSTER } from '../constants';
import { TodayGameCard, RecommendationCard, TeamConditionCard, DashboardKpiGrid, FeaturedPlayersCard } from './dashboard/ManagerDashboardCards';

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



  const featuredPlayers = [...myTeam.players]
    .sort((a, b) => (b.war ?? 0) - (a.war ?? 0))
    .slice(0, 3);

  return (
    <div className="manager-dashboard-grid">
      <TodayGameCard todayGame={todayGame} gameDay={gameDay} onGoGame={() => onTabSwitch('schedule')} />
      <RecommendationCard items={recommendationItems} onTabSwitch={onTabSwitch} />
      <TeamConditionCard
        runDiff={runDiff}
        recentWins={recentWins}
        recentLosses={recentLosses}
        winPct={winPct}
        budgetLabel={fmtM(myTeam.budget ?? 0)}
      />
      <DashboardKpiGrid rank={leagueStandings.rank} wins={myTeam.wins} losses={myTeam.losses} rpg={rpg} rapg={rapg} />
      <FeaturedPlayersCard players={featuredPlayers} />
    </div>
  );
}
