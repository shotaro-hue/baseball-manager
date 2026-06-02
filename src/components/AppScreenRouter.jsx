import { Suspense, lazy, useState } from 'react';
import { ErrorBoundary } from './ErrorBoundary';
import { isDeferredScreen } from './appScreenConfig';
import AppScreenFallback from './AppScreenFallback';
import TitleScreen from './TitleScreen';
import { POP_RELEASE_PENALTY, POP_RELEASE_SALARY_THRESHOLD } from '../constants';
import BatchResultRoute from './screenRoutes/BatchResultRoute';
import ContractRenewalRoute from './screenRoutes/ContractRenewalRoute';
import PlayoffRoute from './screenRoutes/PlayoffRoute';
import TeamDetailRoute from './screenRoutes/TeamDetailRoute';

const ModeSelectScreen = lazy(() => import('./screens/ModeSelectScreen'));
const BatchResultScreen = lazy(() =>
  import('./BatchResult').then((module) => ({
    default: module.BatchResultScreen,
  })),
);
const ResultScreen = lazy(() =>
  import('./ResultScreen').then((module) => ({
    default: module.ResultScreen,
  })),
);
const TacticalGameScreen = lazy(() =>
  import('./TacticalGame').then((module) => ({
    default: module.TacticalGameScreen,
  })),
);
const AllStarScreen = lazy(() =>
  import('./AllStarScreen').then((module) => ({
    default: module.AllStarScreen,
  })),
);
const RetirePhaseScreen = lazy(() =>
  import('./Screens').then((module) => ({
    default: module.RetirePhaseScreen,
  })),
);
const WaiverPhaseScreen = lazy(() =>
  import('./Screens').then((module) => ({
    default: module.WaiverPhaseScreen,
  })),
);
const WaiverResultScreen = lazy(() =>
  import('./Screens').then((module) => ({
    default: module.WaiverResultScreen,
  })),
);
const GrowthSummaryScreen = lazy(() =>
  import('./Screens').then((module) => ({
    default: module.GrowthSummaryScreen,
  })),
);
const NewSeasonScreen = lazy(() =>
  import('./Screens').then((module) => ({
    default: module.NewSeasonScreen,
  })),
);
const SpringTrainingScreen = lazy(() =>
  import('./Screens').then((module) => ({
    default: module.SpringTrainingScreen,
  })),
);
const ContractRenewalPhaseScreen = lazy(() =>
  import('./Screens').then((module) => ({
    default: module.ContractRenewalPhaseScreen,
  })),
);
const DraftPreviewScreen = lazy(() =>
  import('./Draft').then((module) => ({
    default: module.DraftPreviewScreen,
  })),
);
const DraftLotteryScreen = lazy(() =>
  import('./Draft').then((module) => ({
    default: module.DraftLotteryScreen,
  })),
);
const DraftScreen = lazy(() =>
  import('./Draft').then((module) => ({
    default: module.DraftScreen,
  })),
);
const DraftReviewScreen = lazy(() =>
  import('./Draft').then((module) => ({
    default: module.DraftReviewScreen,
  })),
);
const PlayoffScreen = lazy(() =>
  import('./PlayoffScreen').then((module) => ({
    default: module.PlayoffScreen,
  })),
);
const TeamDetailScreen = lazy(() =>
  import('./TeamDetailScreen').then((module) => ({
    default: module.TeamDetailScreen,
  })),
);

function DeferredScreenFrame({ screen, children }) {
  if (!isDeferredScreen(screen)) return children;
  return (
    <Suspense fallback={<AppScreenFallback label={`Loading ${screen}...`} />}>
      {children}
    </Suspense>
  );
}

export default function AppScreenRouter({ app }) {
  const { gs, sf, os, handleLoad } = app;
  const [draftAutoSkip, setDraftAutoSkip] = useState(false);
  const {
    screen,
    myTeam,
    myId,
    teams,
    gameDay,
    year,
    schedule,
    setScreen,
    setTab,
    saveExists,
    setSaveExists,
  } = gs;

  if (screen === 'title') {
    return (
      <TitleScreen
        saveExists={saveExists}
        onLoad={handleLoad}
        onSelectTeam={gs.handleSelect}
        onSaveDeleted={() => setSaveExists(false)}
      />
    );
  }

  if (screen === 'mode_select') {
    return (
      <DeferredScreenFrame screen={screen}>
        <ModeSelectScreen
          myTeam={myTeam}
          oppTeam={sf.currentOpp}
          gameDay={gameDay}
          onSelect={sf.handleModeSelect}
          onBack={() => setScreen('hub')}
          isProcessing={!!sf.batchProgress}
          processingPhase={sf.batchProgress?.phase || ''}
        />
      </DeferredScreenFrame>
    );
  }

  if (screen === 'batch_result') {
    return (
      <DeferredScreenFrame screen={screen}>
        <ErrorBoundary onReset={() => setScreen('hub')}>
          <BatchResultRoute
            gs={gs}
            sf={sf}
            myTeam={myTeam}
            setScreen={setScreen}
            ScreenComponent={BatchResultScreen}
          />
        </ErrorBoundary>
      </DeferredScreenFrame>
    );
  }

  if (screen === 'result' && sf.gameResult) {
    const source = sf.gameResult._source;
    const returnScreen = source === 'batch' ? 'batch_result' : 'hub';
    const returnLabel =
      source === 'batch'
        ? 'バッチ結果に戻る'
        : source === 'schedule'
          ? '日程に戻る'
          : 'ホームに戻る';

    return (
      <DeferredScreenFrame screen={screen}>
        <ResultScreen
          gsResult={sf.gameResult}
          myTeam={myTeam}
          oppTeam={sf.gameResult.oppTeam}
          gameDay={sf.gameResult.gameNo ?? gameDay - 1}
          onNext={() => setScreen(returnScreen)}
          nextLabel={returnLabel}
        />
      </DeferredScreenFrame>
    );
  }

  if (screen === 'tactical_game') {
    return (
      <DeferredScreenFrame screen={screen}>
        {!sf.currentOpp || !myTeam ? (
          <div className="app">
            <div className="rw">
              <div className="rtitle rlose">試合情報を準備できません</div>
              <div style={{ marginBottom: 20, color: '#94a3b8', fontSize: 13 }}>
                対戦データが不足しています。もう一度試合開始からやり直してください。
              </div>
              <button className="btn btn-gold" onClick={() => setScreen('hub')}>
                ホームに戻る
              </button>
            </div>
          </div>
        ) : (
          <ErrorBoundary onReset={() => setScreen('hub')}>
            <TacticalGameScreen
              myTeam={myTeam}
              oppTeam={sf.currentOpp}
              isHome={sf.currentGameTeams?.isHome ?? true}
              onGameEnd={sf.handleTacticalGameEnd}
            />
          </ErrorBoundary>
        )}
      </DeferredScreenFrame>
    );
  }

  if (screen === 'allstar' && gs.allStarResult) {
    return (
      <DeferredScreenFrame screen={screen}>
        <AllStarScreen
          year={year}
          rosters={gs.allStarResult.rosters}
          gameResult={gs.allStarResult.gameResult}
          onEnd={() => setScreen('hub')}
        />
      </DeferredScreenFrame>
    );
  }

  if (screen === 'retire_phase') {
    return (
      <DeferredScreenFrame screen={screen}>
        <ErrorBoundary onReset={() => setScreen('hub')}>
          <RetirePhaseScreen
            teams={teams}
            myId={myId}
            year={year}
            onNext={os.handleRetirePhaseNext}
          />
        </ErrorBoundary>
      </DeferredScreenFrame>
    );
  }

  if (screen === 'contract_renewal_phase') {
    return (
      <DeferredScreenFrame screen={screen}>
        <ErrorBoundary onReset={() => setScreen('hub')}>
          <ContractRenewalRoute
            gs={gs}
            os={os}
            myTeam={myTeam}
            myId={myId}
            year={year}
            setScreen={setScreen}
            ScreenComponent={ContractRenewalPhaseScreen}
          />
        </ErrorBoundary>
      </DeferredScreenFrame>
    );
  }

  if (screen === 'development_phase') {
    return (
      <DeferredScreenFrame screen={screen}>
        <ErrorBoundary onReset={() => setScreen('hub')}>
          <GrowthSummaryScreen
            summary={os.developmentSummary}
            year={year}
            onNext={() => setScreen('waiver_phase')}
          />
        </ErrorBoundary>
      </DeferredScreenFrame>
    );
  }

  if (screen === 'waiver_phase') {
    return (
      <DeferredScreenFrame screen={screen}>
        <ErrorBoundary onReset={() => setScreen('hub')}>
          <WaiverPhaseScreen
            teams={teams}
            myId={myId}
            year={year}
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
                gs.setFaPool((prev) => [...prev, { ...player, isFA: true }]);
              }
            }}
            onNext={os.handleWaiverPhaseNext}
          />
        </ErrorBoundary>
      </DeferredScreenFrame>
    );
  }

  if (screen === 'waiver_result') {
    return (
      <DeferredScreenFrame screen={screen}>
        <ErrorBoundary onReset={() => setScreen('hub')}>
          <WaiverResultScreen
            results={os.waiverClaimResults}
            year={year}
            onNext={() => setScreen('draft_preview')}
          />
        </ErrorBoundary>
      </DeferredScreenFrame>
    );
  }

  if (screen === 'playoff' && sf.playoff) {
    return (
      <DeferredScreenFrame screen={screen}>
        <ErrorBoundary onReset={() => setScreen('hub')}>
          <PlayoffRoute
            gs={gs}
            sf={sf}
            myTeam={myTeam}
            myId={myId}
            year={year}
            setScreen={setScreen}
            ScreenComponent={PlayoffScreen}
          />
        </ErrorBoundary>
      </DeferredScreenFrame>
    );
  }

  if (screen === 'draft_preview' && os.draftPool) {
    return (
      <DeferredScreenFrame screen={screen}>
        <DraftPreviewScreen
          teams={teams}
          myId={myId}
          year={year}
          pool={os.draftPool}
          draftAllocation={os.draftAllocation}
          onAllocationChange={os.setDraftAllocation}
          onStart={() => setScreen('draft_lottery')}
        />
      </DeferredScreenFrame>
    );
  }

  if (screen === 'draft_lottery' && os.draftPool) {
    return (
      <DeferredScreenFrame screen={screen}>
        <DraftLotteryScreen
          teams={teams}
          myId={myId}
          year={year}
          pool={os.draftPool}
          onDone={(roundOneWinners, autoSkip) => {
            os.setDraftPool((prev) =>
              prev.map((player) => {
                const winner = Object.entries(roundOneWinners).find(
                  (entry) => entry[1] && entry[1].id === player.id,
                );
                return {
                  ...player,
                  _drafted: winner ? true : undefined,
                  _r1winner: winner ? Number(winner[0]) : undefined,
                };
              }),
            );
            if (autoSkip) setDraftAutoSkip(true);
            setScreen('draft');
          }}
        />
      </DeferredScreenFrame>
    );
  }

  if (screen === 'draft' && os.draftPool) {
    return (
      <DeferredScreenFrame screen={screen}>
        <DraftScreen
          teams={teams}
          myId={myId}
          year={year}
          pool={os.draftPool}
          draftAllocation={os.draftAllocation}
          autoSkip={draftAutoSkip}
          onDraftDone={(pool, drafted) => {
            setDraftAutoSkip(false);
            os.setDraftResult({ pool, drafted });
            setScreen('draft_review');
          }}
        />
      </DeferredScreenFrame>
    );
  }

  if (screen === 'draft_review' && os.draftResult) {
    return (
      <DeferredScreenFrame screen={screen}>
        <DraftReviewScreen
          teams={teams}
          myId={myId}
          year={year}
          pool={os.draftResult.pool}
          drafted={os.draftResult.drafted}
          onEnd={() =>
            os.handleDraftComplete(os.draftResult.pool, os.draftResult.drafted)
          }
        />
      </DeferredScreenFrame>
    );
  }

  if (screen === 'spring_training') {
    return (
      <DeferredScreenFrame screen={screen}>
        <SpringTrainingScreen
          year={year}
          myTeam={myTeam}
          springData={os.springTrainingData}
          onComplete={os.handleSpringTrainingComplete}
        />
      </DeferredScreenFrame>
    );
  }

  if (screen === 'new_season') {
    return (
      <DeferredScreenFrame screen={screen}>
        <NewSeasonScreen
          year={year}
          info={os.newSeasonInfo}
          developmentSummary={os.developmentSummary}
          ownerGoal={myTeam?.ownerGoal || 'cs'}
          onGoalSelect={(goal) =>
            gs.upd(myId, (team) => ({ ...team, ownerGoal: goal }))
          }
          onStart={() => {
            setScreen('hub');
            setTab('dashboard');
            gs.notify(`${year}年シーズン開始`, 'ok');
          }}
        />
      </DeferredScreenFrame>
    );
  }

  if (screen === 'team_detail' && gs.viewingTeam) {
    return (
      <DeferredScreenFrame screen={screen}>
        <TeamDetailRoute
          gs={gs}
          setScreen={setScreen}
          setTab={setTab}
          teams={teams}
          year={year}
          schedule={schedule}
          myTeam={myTeam}
          ScreenComponent={TeamDetailScreen}
        />
      </DeferredScreenFrame>
    );
  }

  return null;
}
