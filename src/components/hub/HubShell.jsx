import { regularSeasonProgress, regularSeasonRequest } from '../../engine/seasonProgress';
import React, { useCallback, useEffect, useState } from 'react';
import { ErrorBoundary } from '../ErrorBoundary';
import { RetireModal } from '../RetireModal';
import { PlayerModal } from '../PlayerModal';
import { PressConferenceModal } from '../PressConferenceModal';
import { SEASON_GAMES } from '../../constants';
import HubHeader from './HubHeader';
import HubSimPanel from './HubSimPanel';
import HubTabsNav from './HubTabsNav';
import HubContentRouter from './HubContentRouter';
import HubBottomNav from './HubBottomNav';
import { House, CalendarBlank, Users, ChartBar, Buildings } from '@phosphor-icons/react';
import { PRIMARY_SECTIONS as SECTION_DEFINITIONS, AUXILIARY_TABS, notificationSummary, sectionBadge } from './hubNavigation';
import { useHubNavigation } from './useHubNavigation';
import '../../calm-ui.css';
import '../../mobile-flow.css';
import '../../home-ui.css';
import './hub-navigation.css';
import {
  PlayerComparisonDialog,
  PlayerComparisonTray,
} from '../PlayerComparisonTray';

const ICONS = { home: House, rosterOps: Users, game: CalendarBlank, analysis: ChartBar, management: Buildings };
const PRIMARY_SECTIONS = SECTION_DEFINITIONS.map(section => {
  const Icon = ICONS[section.id];
  return { ...section, icon: <Icon size={22} aria-hidden="true" /> };
});

export default function HubShell({ state, flows, app }) {
  const gs = state.gs;
  const sf = flows.sf;
  const os = flows.os;
  const {
    myTeam,
    tab,
    setTab,
    gameDay,
    year,
    schedule,
    tabBadges,
    notif,
    pressEvent,
    handlePressAnswer,
  } = gs;

  const navigationScope = `${gs.saveId}:${gs.myId}:${year}`;
  const navigation = useHubNavigation(tab, setTab, navigationScope);
  const { currentPrimarySection } = navigation;
  const notifications = notificationSummary({ mailbox: gs.getMailboxBySelector?.() ?? gs.mailbox,
    news: gs.getNewsBySelector?.() ?? gs.news, gameDay, unreadCount: gs.getUnreadMailboxCount?.(gameDay) });
  const uiBadges = { ...tabBadges, trade: notifications.trades > 0 ? { n: notifications.trades, label: '要対応', color: '#855200' } : null };
  const [comparePlayers, setComparePlayers] = useState([]);
  const [compareOpen, setCompareOpen] = useState(false);
  useEffect(() => { setComparePlayers([]); setCompareOpen(false); }, [year]);
  const [decisionTarget, setDecisionTarget] = useState(null);
  const [caseTarget, setCaseTarget] = useState(null);
  const openCase = (target, id) => {
    setCaseTarget(previous => ({ tab: target, id, token: (previous?.token ?? 0) + 1, scope: navigationScope }));
    navigation.open(target, { restorePosition: false });
  };

  const handleTabChange = (newTab) => {
    if (AUXILIARY_TABS.includes(newTab)) navigation.open(newTab);
    else if (AUXILIARY_TABS.includes(tab)) navigation.open(newTab);
    else navigation.navigate(newTab);
  };

  const handlePrimarySectionChange = (sectionId) => {
      const section = PRIMARY_SECTIONS.find((item) => item.id === sectionId);
      if (!section) return;
      const targetTab = navigation.lastTabs[sectionId] || section.defaultTab;
      navigation.navigate(targetTab);
  };
  const activeSection = PRIMARY_SECTIONS.find(section => section.id === currentPrimarySection) || PRIMARY_SECTIONS[0];

  const progress = regularSeasonProgress(myTeam);
  const remain = progress.remainingGames;
  const canSim = regularSeasonRequest({ teams: gs.teams, myId: gs.myId, year: gs.year, gameDay, schedule, offseasonPlan: gs.offseasonPlan, gameResultsMap: gs.gameResultsMap }, 1).count > 0;
  const toggleCompare = useCallback((player, teamName) => {
    if (player?.id == null) return;
    if (comparePlayers.some((entry) => entry.id === player.id)) {
      setComparePlayers((current) =>
        current.filter((entry) => entry.id !== player.id),
      );
      setCompareOpen(false);
      return;
    }
    if (comparePlayers.length >= 2) {
      gs.notify('比較できるのは2人までです。どちらかを外してください。', 'warn');
      return;
    }
    setComparePlayers((current) => [
      ...current,
      { ...player, _teamName: teamName || player._teamName || '' },
    ]);
  }, [comparePlayers, gs]);
  const removeComparePlayer = useCallback((playerId) => {
    setComparePlayers((current) => current.filter((entry) => entry.id !== playerId));
    setCompareOpen(false);
  }, []);
  const navigateWithPlayer = useCallback((targetTab, player, teamName) => {
    setDecisionTarget({ tab: targetTab, player, teamName });
    gs.setPlayerModal(null);
    navigation.open(targetTab);
  }, [gs, navigation.open]);

  return (
    <div className={`app calm-shell ${tab === 'dashboard' ? 'calm-home' : ''} ${['management', 'reinforcement', 'settings', 'finance', 'contract', 'trade', 'scout'].includes(tab) ? 'hub-entry-shell' : ''}`}
      data-ds={tab === 'dashboard' ? 'home-shell' : undefined}
      data-initialization-state={gs.newGameInitializationStatus}>
      <div className="app-layout">
        <aside className="primary-sidebar" aria-label="監督メニュー">
          <div className="primary-sidebar-title"><strong>{myTeam?.name}</strong><span>{year}年 シーズン</span></div>
          <div className="primary-sidebar-list">
            {PRIMARY_SECTIONS.map((section) => {
              const badge = sectionBadge(section.id, uiBadges, notifications);
              return (
                <button
                  key={section.id}
                  className={`primary-sidebar-btn ${
                    currentPrimarySection === section.id ? 'on' : ''
                  }`}
                  onClick={() => handlePrimarySectionChange(section.id)}
                  aria-current={currentPrimarySection === section.id ? 'page' : undefined}
                >
                  <span className="primary-sidebar-icon">{section.icon}</span>
                  <span>{section.label}</span>
                  {badge && (
                    <span
                      className="primary-sidebar-badge"
                      style={{ background: badge.color }}
                    >
                      {badge.n}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </aside>

        <div className="hub">
          {gs.offseasonPlan?.stage === 'postseason' && sf.playoff && (
            <button className="btn btn-gold" style={{ margin: '12px 16px', minHeight: 44 }}
              onClick={() => gs.setScreen(gs.offseasonPlan.resumeScreen === 'retire_phase' ? 'retire_phase' : 'playoff')}>
              {gs.offseasonPlan.resumeScreen === 'retire_phase' ? 'シーズン終了後の手続きに戻る' : 'ポストシーズンに戻る'}
            </button>
          )}
          <HubHeader
            myTeam={myTeam}
            year={year}
            gameDay={gameDay}
            schedule={schedule}
            remain={remain}
            onSave={gs.handleSave}
            home={tab === 'dashboard'} saveDirty={gs.saveDirty} saveQueueState={gs.saveQueueState} saveResult={gs.saveResult}
            notifications={notifications} onNotifications={() => navigation.open('mailbox')} onSettings={() => navigation.open('settings')}
          />

          {navigation.routes.length > 1 && <div className="hub-return"><button onClick={navigation.back}>元の画面へ戻る</button></div>}
          {['mailbox', 'news'].includes(tab) && <nav className="hub-secondary-nav" aria-label="通知メニュー">
            <button aria-current={tab === 'mailbox' ? 'page' : undefined} onClick={() => navigation.replace('mailbox')}>受信箱</button>
            <button aria-current={tab === 'news' ? 'page' : undefined} onClick={() => navigation.replace('news')}>ニュース</button>
            <p>未読 {notifications.unread}件 · 要対応 {notifications.actionable}件</p>
          </nav>}
          {tab === 'dashboard' && notifications.actionable > 0 && <section className="hub-attention" aria-label="重要な対応待ち">
            <strong>要対応 {notifications.actionable}件</strong>
            {notifications.trades > 0 && <button onClick={() => navigation.open('trade')}>トレード提案 {notifications.trades}件</button>}
            {notifications.posting > 0 && <button onClick={() => navigation.open('mailbox')}>ポスティング申請 {notifications.posting}件</button>}
            {notifications.interviews > 0 && <button onClick={() => navigation.open('news')}>インタビュー回答待ち {notifications.interviews}件</button>}
          </section>}

          {(!progress.valid || (!canSim && remain > 0)) && <p role="status">成績・日程・進行フェーズを確認できないため試合を開始できません。保存データを読み直してください。</p>}
          {notif && (
            <div
              className={`notif ${
                notif.type === 'ok'
                  ? 'nok'
                  : notif.type === 'warn'
                    ? 'nwarn'
                    : 'nbad'
              }`}
            >
              {notif.msg}
            </div>
          )}

          {gameDay <= SEASON_GAMES && tab !== 'dashboard' && !AUXILIARY_TABS.includes(tab) && (
            <details className="flow-sim-settings"><summary>試合を進める</summary>
            <HubSimPanel
              gameDay={gameDay}
              schedule={schedule}
              remain={remain} canSim={canSim}
              batchProgress={sf.batchProgress}
              onStartGame={sf.handleStartGame}
              onBatchSim={sf.handleBatchSim}
              onSeasonSim={sf.handleSeasonSim}
            /></details>
          )}

          {tab !== 'dashboard' && !AUXILIARY_TABS.includes(tab) && <HubTabsNav
            activeSection={activeSection}
            tab={tab}
            tabBadges={uiBadges}
            onTabChange={handleTabChange}
          />}

          <ErrorBoundary key={navigationScope}>
            {decisionTarget?.tab === tab && (
              <div className="decision-context-banner" role="status">
                <div>
                  <strong>{decisionTarget.player?.name}</strong>
                  <span>を判断対象として保持中</span>
                </div>
                <button
                  type="button"
                  className="bsm bga"
                  onClick={() => gs.handlePlayerClick(
                    decisionTarget.player,
                    decisionTarget.teamName,
                    decisionTarget.player?.isPitcher ? 'stats' : 'battedBall',
                  )}
                >
                  選手詳細
                </button>
                <button type="button" className="bsm" onClick={() => setDecisionTarget(null)}>解除</button>
              </div>
            )}

            {[...new Set(navigation.routes)].map(route => <div key={route} hidden={route !== tab} data-hub-route={route}>
            <ErrorBoundary>
            <HubContentRouter
              app={app}
              tab={route}
              active={route === tab}
              onTabChange={handleTabChange}
              onOpen={navigation.open}
              onOpenCase={openCase}
              focusRequest={caseTarget?.scope === navigationScope && caseTarget.tab === route ? caseTarget : null}
              notifications={notifications}
              comparison={{
                players: comparePlayers,
                onToggle: toggleCompare,
              }}
            /></ErrorBoundary></div>)}

            <RetireModal
              modal={gs.retireModal}
              retireRole={gs.retireRole}
              setRetireRole={gs.setRetireRole}
              onRetain={() => os.handleRetain(gs.retireModal.player)}
              onAccept={() => os.handleAcceptRetire(gs.retireModal.player)}
              onStartRetireGame={() =>
                os.handleStartRetireGame(gs.retireModal.player)
              }
              onSkipRetireGame={() =>
                os.handleSkipRetireGame(gs.retireModal.player)
              }
            />

            {gs.playerModal && (
              <PlayerModal
                key={`${gs.playerModal.player?.id}:${gs.playerModal.initialSection || 'profile'}`}
                farmState={{farmCompetition:gs.farmCompetition,year:gs.year,teams:gs.teams,seasonHistory:gs.getSeasonHistory?.()??gs.seasonHistory}}
                player={gs.playerModal.player}
                teamName={gs.playerModal.teamName}
                isMyTeam={gs.playerModal.teamName === myTeam?.name}
                initialSection={gs.playerModal.initialSection}
                saveId={gs.saveId}
                year={year}
                teams={gs.teams}
                isCompared={comparePlayers.some((entry) => entry.id === gs.playerModal.player?.id)}
                onToggleCompare={toggleCompare}
                onNavigate={navigateWithPlayer}
                onSetConvertTarget={gs.setConvertTarget}
                onClose={() => gs.setPlayerModal(null)}
              />
            )}

            {gs.pregameError && (
              <div
                style={{
                  position: 'fixed',
                  inset: 0,
                  background: 'rgba(0,0,0,.72)',
                  zIndex: 400,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 16px',
                }}
              >
                <div
                  style={{
                    background: '#0d1b2a',
                    border: '1px solid rgba(248,113,113,.4)',
                    borderRadius: 12,
                    padding: '24px 20px',
                    width: '100%',
                    maxWidth: 420,
                    boxShadow: '0 8px 32px rgba(0,0,0,.6)',
                  }}
                >
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 700,
                      color: '#f87171',
                      marginBottom: 10,
                    }}
                  >
                    試合開始エラー
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: '#cbd5e1',
                      marginBottom: 18,
                      lineHeight: 1.6,
                    }}
                  >
                    {gs.pregameError.message}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      gap: 8,
                      justifyContent: 'flex-end',
                    }}
                  >
                    <button
                      className="bsm bga"
                      onClick={() => {
                        gs.setPregameError(null);
                        setTab('roster');
                      }}
                    >
                      ロスターへ
                    </button>
                    <button
                      className="bsm bgr"
                      onClick={() => gs.setPregameError(null)}
                    >
                      閉じる
                    </button>
                  </div>
                </div>
              </div>
            )}

            {pressEvent && (
              <PressConferenceModal
                event={pressEvent}
                onAnswer={handlePressAnswer}
              />
            )}
          </ErrorBoundary>

          <HubBottomNav
            sections={PRIMARY_SECTIONS}
            currentPrimarySection={currentPrimarySection}
            tabBadges={uiBadges}
            notifications={notifications}
            onSectionChange={handlePrimarySectionChange}
            onStartGame={sf.handleStartGame}
            disableStart={!canSim || Boolean(sf.batchProgress)}
          />

          <PlayerComparisonTray
            players={comparePlayers}
            onRemove={removeComparePlayer}
            onClear={() => {
              setComparePlayers([]);
              setCompareOpen(false);
            }}
            onOpen={() => setCompareOpen(true)}
          />
          {compareOpen && comparePlayers.length === 2 && (
            <PlayerComparisonDialog
              year={year}
              teams={gs.teams}
              faPool={gs.faPool}
              players={comparePlayers}
              onRemove={removeComparePlayer}
              onClose={() => setCompareOpen(false)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
