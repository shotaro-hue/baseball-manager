import { Suspense, lazy } from 'react';
import { DashboardTab } from '../DashboardTab';
import { ContractTab } from '../tabs/ContractTab';
import { NewsTab } from '../tabs/NewsTab';
import { MailboxTab } from '../tabs/MailboxTab';
import { TradeTab } from '../tabs/TradeTab';
import { AlumniTab } from '../tabs/AlumniTab';
import { RosterTab } from '../tabs/RosterTab';
import { ScheduleTab } from '../tabs/ScheduleTab';
import { gameDayToDate } from '../../utils';
import {
  TRADE_DEADLINE_MONTH,
  POP_RELEASE_PENALTY,
  POP_RELEASE_SALARY_THRESHOLD,
  COACH_DEFS,
  COACH_GRADES,
  SCOUT_REGIONS,
} from '../../constants';
import HubFaTab from './HubFaTab';
import HubScoutTab from './HubScoutTab';
import HubTabFallback from './HubTabFallback';

const StatsTab = lazy(() =>
  import('../tabs/StatsTab').then((module) => ({ default: module.StatsTab })),
);
const FinanceTab = lazy(() =>
  import('../tabs/FinanceTab').then((module) => ({
    default: module.FinanceTab,
  })),
);
const StandingsTab = lazy(() =>
  import('../tabs/StandingsTab').then((module) => ({
    default: module.StandingsTab,
  })),
);
const RecordsTab = lazy(() =>
  import('../tabs/RecordsTab').then((module) => ({
    default: module.RecordsTab,
  })),
);
const BalanceTab = lazy(() =>
  import('../tabs/BalanceTab').then((module) => ({
    default: module.BalanceTab,
  })),
);
const LeaderboardTab = lazy(() =>
  import('../tabs/LeaderboardTab').then((module) => ({
    default: module.LeaderboardTab,
  })),
);

function DeferredHubTab({ label, children }) {
  return (
    <Suspense fallback={<HubTabFallback label={label} />}>{children}</Suspense>
  );
}

export default function HubContentRouter({ app, tab, onTabChange }) {
  const { gs, sf, os } = app;
  const { myTeam, myId, teams, year, gameDay, schedule, faPool, mailbox } = gs;

  const mailboxForView = gs.getMailboxBySelector({ limit: 200 });
  const newsForView = gs.getNewsBySelector({ limit: 200 });
  const unreadMailboxCount = gs.getUnreadMailboxCount(gameDay);
  const latestNewsId = gs.getLatestNewsId();
  const foreignActiveCount =
    myTeam?.players?.filter((player) => player.isForeign).length || 0;

  if (tab === 'dashboard') {
    return (
      <DashboardTab
        myTeam={myTeam}
        teams={teams}
        schedule={schedule}
        gameDay={gameDay}
        year={year}
        recentResults={gs.recentResults}
        mailbox={mailboxForView}
        faPool={faPool}
        onTabSwitch={onTabChange}
        unreadMailboxCount={unreadMailboxCount}
        latestNewsId={latestNewsId}
      />
    );
  }

  if (tab === 'roster') {
    return (
      <>
        <RosterTab
          team={myTeam}
          onToggle={gs.toggleLineup}
          onReplaceLineup={gs.replaceLineup}
          onSetLineupOrder={gs.setLineupOrder}
          onSetRosterDhMode={gs.setRosterDhMode}
          onSetPlayerPosition={gs.setPlayerPosition}
          onSetStarter={gs.setStarter}
          onPromo={gs.promote}
          onDemo={gs.demote}
          onSetTrainingFocus={gs.setTrainingFocus}
          onConvertIkusei={gs.convertIkusei}
          onMoveRotation={gs.moveRotation}
          onRemoveFromRotation={gs.removeFromRotation}
          onSetPitchingPattern={gs.setPitchingPattern}
          onReplaceRotation={gs.replaceRotation}
          onReplaceFullRoster={gs.replaceFullRoster}
          onPlayerClick={gs.handlePlayerClick}
          onSetDevGoal={gs.setDevGoal}
          onPlayerTalk={gs.handlePlayerTalk}
          onSetConvertTarget={gs.setConvertTarget}
          gameDay={gameDay}
        />

        <div className="card">
          <div className="card-h">コーチ</div>
          <div
            style={{
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
              marginBottom: 10,
            }}
          >
            {myTeam?.coaches.map((coach, index) => (
              <div
                key={`${coach.type}-${coach.grade}-${index}`}
                className="card2"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  flex: '1 1 190px',
                }}
              >
                <span style={{ fontSize: 18 }}>{coach.emoji}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>
                    {coach.typeName}{' '}
                    <span style={{ color: '#f5c842', fontSize: 10 }}>
                      Lv{coach.grade}
                    </span>
                  </div>
                  <div style={{ fontSize: 10, color: '#374151' }}>
                    {coach.name}
                  </div>
                </div>
                <button className="bsm bgr" onClick={() => gs.fireCoach(index)}>
                  解任
                </button>
              </div>
            ))}
          </div>

          <details>
            <summary
              style={{ fontSize: 11, color: '#374151', cursor: 'pointer' }}
            >
              + コーチを雇う
            </summary>
            <div className="g2" style={{ marginTop: 8 }}>
              {COACH_DEFS.map((coachDef) =>
                COACH_GRADES.map((grade) => {
                  const hired = myTeam?.coaches.some(
                    (coach) =>
                      coach.type === coachDef.type && coach.grade === grade.g,
                  );
                  return (
                    <div
                      key={`${coachDef.type}-${grade.g}`}
                      className="card2"
                      style={{ opacity: hired ? 0.5 : 1 }}
                    >
                      <div className="fsb">
                        <span style={{ fontSize: 11 }}>
                          {coachDef.emoji}
                          {coachDef.name} Lv{grade.g}
                        </span>
                        <button
                          className="bsm bga"
                          disabled={hired}
                          onClick={() => gs.hireCoach(coachDef, grade)}
                        >
                          {hired ? '雇用済み' : '雇う'}
                        </button>
                      </div>
                    </div>
                  );
                }),
              )}
            </div>
          </details>
        </div>
      </>
    );
  }

  if (tab === 'schedule') {
    return (
      <ScheduleTab
        schedule={schedule}
        gameDay={gameDay}
        myTeam={myTeam}
        teams={teams}
        year={year}
        gameResultsMap={gs.gameResultsMap}
        allStarDone={gs.allStarDone}
        allStarResult={gs.allStarResult}
        allStarTriggerDay={gs.allStarTriggerDay}
        scheduleArchive={gs.scheduleArchive || []}
        onResultClick={(dayNo) => {
          const result = gs.gameResultsMap[dayNo];
          if (!result) return;
          sf.setGameResult({
            score: { my: result.myScore, opp: result.oppScore },
            log: result.log || [],
            inningSummary: result.inningSummary || [],
            oppTeam: result.oppTeam,
            won: result.won,
            isHome: result.isHome,
            gameNo: dayNo,
            _source: 'schedule',
          });
          gs.setScreen('result');
        }}
      />
    );
  }

  if (tab === 'records') {
    return (
      <DeferredHubTab label="Loading records...">
        <RecordsTab history={gs.seasonHistory} />
      </DeferredHubTab>
    );
  }

  if (tab === 'news') {
    return (
      <NewsTab
        news={newsForView}
        onInterview={gs.handleInterview}
        seasonHistory={gs.seasonHistory}
        currentYear={year}
      />
    );
  }

  if (tab === 'mailbox') {
    return (
      <MailboxTab
        mailbox={mailboxForView}
        onRead={os.handleMailRead}
        onAction={os.handleMailAction}
        teams={teams}
        myTeam={myTeam}
        onTrade={os.handleTrade}
        onTeamClick={gs.handleTeamClick}
        gameDay={gameDay}
      />
    );
  }

  if (tab === 'trade') {
    const pendingTrades = mailbox.filter(
      (mail) => mail.type === 'trade' && !mail.resolved,
    );
    const deadlinePassed = (() => {
      const date = gameDayToDate(gameDay, schedule);
      return date ? date.month > TRADE_DEADLINE_MONTH : gameDay > 95;
    })();
    return (
      <TradeTab
        myTeam={myTeam}
        teams={teams}
        onTrade={os.handleTrade}
        cpuOffers={pendingTrades.map((mail) => mail.offer)}
        onAcceptOffer={(index) =>
          os.handleMailAction(pendingTrades[index].id, 'accept')
        }
        onDeclineOffer={(index) =>
          os.handleMailAction(pendingTrades[index].id, 'decline')
        }
        deadlinePassed={deadlinePassed}
        onPlayerClick={gs.handlePlayerClick}
      />
    );
  }

  if (tab === 'contract') {
    return (
      <ContractTab
        team={myTeam}
        allTeams={teams}
        year={year}
        onOffer={os.handleContractOffer}
        onRelease={(pid) => {
          const player = myTeam?.players.find((entry) => entry.id === pid);
          const popPenalty =
            (player?.salary ?? 0) > POP_RELEASE_SALARY_THRESHOLD
              ? POP_RELEASE_PENALTY
              : 0;

          gs.upd(myId, (team) => ({
            ...team,
            players: team.players.filter((entry) => entry.id !== pid),
            popularity: Math.min(
              100,
              Math.max(0, (team.popularity ?? 50) + popPenalty),
            ),
          }));

          if (player) {
            gs.addToHistory(myId, player, 'release');
            gs.setFaPool((prev) => [...prev, { ...player, isFA: true }]);
          }

          gs.notify('選手を自由契約にしました', 'warn');
        }}
      />
    );
  }

  if (tab === 'alumni') {
    return <AlumniTab myTeam={myTeam} />;
  }

  if (tab === 'fa') {
    return (
      <HubFaTab
        myTeam={myTeam}
        faPool={faPool}
        faYears={gs.faYears}
        setFaYears={gs.setFaYears}
        foreignActiveCount={foreignActiveCount}
        gameDay={gameDay}
        year={year}
        myId={myId}
        notify={gs.notify}
        upd={gs.upd}
        setFaPool={gs.setFaPool}
      />
    );
  }

  if (tab === 'scout') {
    return (
      <HubScoutTab
        myTeam={myTeam}
        scoutRegions={SCOUT_REGIONS}
        onSendScout={gs.sendScout}
        onSignPlayer={gs.signPlayer}
        onRemoveScoutResult={(index) =>
          gs.upd(myId, (team) => ({
            ...team,
            scoutResults: team.scoutResults.filter((_, i) => i !== index),
          }))
        }
      />
    );
  }

  if (tab === 'finance') {
    return (
      <DeferredHubTab label="Loading finance...">
        <FinanceTab
          team={myTeam}
          onStadiumUpgrade={gs.handleStadiumUpgrade}
          onTicketPriceChange={gs.handleSetTicketPrice}
          gameDay={gameDay}
          onPlayerClick={gs.handlePlayerClick}
        />
      </DeferredHubTab>
    );
  }

  if (tab === 'standings') {
    return (
      <DeferredHubTab label="Loading standings...">
        <StandingsTab
          teams={teams}
          myId={myId}
          onTeamClick={gs.handleTeamClick}
        />
      </DeferredHubTab>
    );
  }

  if (tab === 'stats') {
    return (
      <DeferredHubTab label="Loading stats...">
        <StatsTab
          teams={teams}
          myId={myId}
          onPlayerClick={gs.handlePlayerClick}
        />
      </DeferredHubTab>
    );
  }

  if (tab === 'leaderboard') {
    return (
      <DeferredHubTab label="Loading leaderboard...">
        <LeaderboardTab teams={teams} myId={myId} gameDay={gameDay} />
      </DeferredHubTab>
    );
  }

  if (tab === 'balance') {
    return (
      <DeferredHubTab label="Loading balance...">
        <BalanceTab teams={teams} myTeam={myTeam} upd={gs.upd} myId={myId} />
      </DeferredHubTab>
    );
  }

  return null;
}
