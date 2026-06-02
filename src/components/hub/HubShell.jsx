import { useCallback, useEffect, useMemo, useState } from 'react';
import { ErrorBoundary } from '../ErrorBoundary';
import { RetireModal } from '../RetireModal';
import { PlayerModal } from '../PlayerModal';
import { PressConferenceModal } from '../PressConferenceModal';
import { POSITIONS, FIELDING_POSITIONS, SEASON_GAMES } from '../../constants';
import HubHeader from './HubHeader';
import HubSimPanel from './HubSimPanel';
import HubTabsNav from './HubTabsNav';
import HubContentRouter from './HubContentRouter';
import HubBottomNav from './HubBottomNav';

const PRIMARY_SECTIONS = [
  {
    id: 'home',
    label: 'ホーム',
    icon: '🏠',
    defaultTab: 'dashboard',
    tabs: [['dashboard', 'ダッシュボード']],
  },
  {
    id: 'game',
    label: '日程',
    icon: '⚾',
    defaultTab: 'schedule',
    tabs: [['schedule', '日程']],
  },
  {
    id: 'rosterOps',
    label: '編成',
    icon: '🛠',
    defaultTab: 'roster',
    tabs: [
      ['roster', 'ロスター'],
      ['trade', 'トレード'],
      ['contract', '契約'],
      ['fa', 'FA'],
      ['scout', 'スカウト'],
    ],
  },
  {
    id: 'analysis',
    label: '分析',
    icon: '📊',
    defaultTab: 'stats',
    tabs: [
      ['stats', '成績'],
      ['leaderboard', 'ランキング'],
      ['standings', '順位表'],
      ['records', '記録'],
      ['finance', '財務'],
      ['balance', 'リーグ分析'],
    ],
  },
  {
    id: 'inbox',
    label: '受信箱',
    icon: '✉',
    defaultTab: 'mailbox',
    tabs: [
      ['mailbox', 'メール'],
      ['news', 'ニュース'],
      ['alumni', 'OB'],
    ],
  },
];

const TAB_TO_SECTION = PRIMARY_SECTIONS.reduce((acc, section) => {
  section.tabs.forEach(([tabId]) => {
    acc[tabId] = section.id;
  });
  return acc;
}, {});

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

  const [sectionLastTab, setSectionLastTab] = useState(() =>
    PRIMARY_SECTIONS.reduce(
      (acc, section) => ({ ...acc, [section.id]: section.defaultTab }),
      {},
    ),
  );
  const [currentPrimarySection, setCurrentPrimarySection] = useState('home');

  useEffect(() => {
    const sectionId = TAB_TO_SECTION[tab];
    if (!sectionId) return;
    setCurrentPrimarySection(sectionId);
    setSectionLastTab((prev) =>
      prev[sectionId] === tab ? prev : { ...prev, [sectionId]: tab },
    );
  }, [tab]);

  const handleTabChange = useCallback(
    (newTab) => {
      if (tab === 'roster' && newTab !== 'roster' && myTeam) {
        const lineupPlayers = myTeam.lineup
          .map((id) => myTeam.players.find((player) => player.id === id))
          .filter(Boolean);
        const rosterDhMode = myTeam.rosterDhMode ?? myTeam.dhEnabled;
        const required = rosterDhMode ? POSITIONS : FIELDING_POSITIONS;
        const requiredCount = required.length;

        if (lineupPlayers.length < requiredCount) {
          gs.notify(
            rosterDhMode
              ? 'DHありの先発9人が揃っていません'
              : '先発8人が揃っていません',
            'warn',
          );
          return;
        }

        const posCount = {};
        lineupPlayers.forEach((player) => {
          posCount[player.pos] = (posCount[player.pos] ?? 0) + 1;
        });

        for (const pos of required) {
          if (!posCount[pos]) {
            gs.notify(`${pos} が未設定です`, 'warn');
            return;
          }
          if (posCount[pos] > 1) {
            gs.notify(`${pos} が重複しています`, 'warn');
            return;
          }
        }
      }

      setTab(newTab);
    },
    [gs, myTeam, setTab, tab],
  );

  const handlePrimarySectionChange = useCallback(
    (sectionId) => {
      const section = PRIMARY_SECTIONS.find((item) => item.id === sectionId);
      if (!section) return;
      setCurrentPrimarySection(sectionId);
      const targetTab = sectionLastTab[sectionId] || section.defaultTab;
      handleTabChange(targetTab);
    },
    [handleTabChange, sectionLastTab],
  );

  const activeSection = useMemo(
    () =>
      PRIMARY_SECTIONS.find(
        (section) => section.id === currentPrimarySection,
      ) || PRIMARY_SECTIONS[0],
    [currentPrimarySection],
  );

  const totalGames = (myTeam?.wins || 0) + (myTeam?.losses || 0);
  const remain = SEASON_GAMES - totalGames;

  return (
    <div className="app">
      <div className="app-layout">
        <aside className="primary-sidebar" aria-label="監督メニュー">
          <div className="primary-sidebar-title">監督メニュー</div>
          <div className="primary-sidebar-list">
            {PRIMARY_SECTIONS.map((section) => {
              const badgeTab =
                section.id === 'inbox'
                  ? 'mailbox'
                  : section.id === 'rosterOps'
                    ? 'contract'
                    : null;
              const badge = badgeTab ? tabBadges[badgeTab] : null;
              return (
                <button
                  key={section.id}
                  className={`primary-sidebar-btn ${
                    currentPrimarySection === section.id ? 'on' : ''
                  }`}
                  onClick={() => handlePrimarySectionChange(section.id)}
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
          <HubHeader
            myTeam={myTeam}
            year={year}
            gameDay={gameDay}
            schedule={schedule}
            remain={remain}
            onSave={gs.handleSave}
          />

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

          {gameDay <= SEASON_GAMES && (
            <HubSimPanel
              gameDay={gameDay}
              schedule={schedule}
              remain={remain}
              batchProgress={sf.batchProgress}
              onStartGame={sf.handleStartGame}
              onBatchSim={sf.handleBatchSim}
              onSeasonSim={sf.handleSeasonSim}
            />
          )}

          <HubTabsNav
            activeSection={activeSection}
            tab={tab}
            tabBadges={tabBadges}
            onTabChange={handleTabChange}
          />

          <ErrorBoundary key={tab}>
            <HubContentRouter app={app} tab={tab} onTabChange={handleTabChange} />

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
                player={gs.playerModal.player}
                teamName={gs.playerModal.teamName}
                isMyTeam={gs.playerModal.teamName === myTeam?.name}
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
            tabBadges={tabBadges}
            onSectionChange={handlePrimarySectionChange}
            onStartGame={sf.handleStartGame}
            disableStart={gameDay > SEASON_GAMES}
          />
        </div>
      </div>
    </div>
  );
}
