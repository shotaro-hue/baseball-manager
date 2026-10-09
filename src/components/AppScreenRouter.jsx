import { Suspense, lazy, useState, useCallback } from 'react';
import '../calm-draft.css';
import { ErrorBoundary } from './ErrorBoundary';
import { isDeferredScreen } from './appScreenConfig';
import AppScreenFallback from './AppScreenFallback';
import TitleScreen from './TitleScreen';
import BatchResultRoute from './screenRoutes/BatchResultRoute';
import ContractRenewalRoute from './screenRoutes/ContractRenewalRoute';
import PlayoffRoute from './screenRoutes/PlayoffRoute';
import TeamDetailRoute from './screenRoutes/TeamDetailRoute';

const ModeSelectScreen = lazy(() => import('./screens/ModeSelectScreen'));
const OffseasonFaPhaseScreen = lazy(() => import('./OffseasonFaPhaseScreen'));
const OffseasonPlanningScreen = lazy(() => import('./OffseasonPlanningScreen'));
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

const draftSteps = ['draft_preview', 'draft_lottery', 'draft', 'draft_review', 'spring_training', 'new_season'];
const draftLabels = ['候補確認', '1巡目・抽選', '2巡目以降', '獲得結果', 'キャンプ', '新シーズン'];
function DeferredScreenFrame({ screen, children, gs }) {
  if (!isDeferredScreen(screen)) return children;
  return (
    <Suspense fallback={<AppScreenFallback label={`Loading ${screen}...`} />}>
      {gs && draftSteps.includes(screen) ? <div className="calm-detail calm-draft">
        <header className="draft-save-bar"><strong>{draftLabels[draftSteps.indexOf(screen)]}</strong>
          <span>{draftSteps.indexOf(screen) + 1} / {draftSteps.length}</span>
          <span role="status">{gs.saveDirty ? '変更あり・保存待ち' : '保存済み'}</span>
          <button disabled={gs.saveQueueState?.isSaving || gs.isAutoSaveSuspended} onClick={() => gs.handleSave()}>途中保存</button>
          <p>自動保存します。画面を閉じる前は「途中保存」で保存完了を確認できます。</p>
        </header>{children}</div> : children}
    </Suspense>
  );
}

export default function AppScreenRouter({ app }) {
  const { gs, sf, os, handleLoad } = app;
  const [draftAutoSkip, setDraftAutoSkip] = useState(false);
  const savePreview = useCallback(value => os.saveDraftView('preview', value), [os.saveDraftView]);
  const saveLottery = useCallback(value => os.saveDraftView('lottery', value), [os.saveDraftView]);
  const saveDraft = useCallback(value => os.saveDraftView('draft', value), [os.saveDraftView]);
  const saveReview = useCallback(value => os.saveDraftView('review', value), [os.saveDraftView]);
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
        initializationError={gs.newGameInitializationError}
        initializationStatus={gs.newGameInitializationStatus}
        isInitializationInProgress={gs.isNewGameInitializing}
        getInitializationAttempt={gs.getNewGameInitializationAttempt}
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
          teams={teams}
          gameDay={sf.gameResult.gameNo ?? gameDay - 1}
          onNext={() => setScreen(returnScreen)}
          nextLabel={returnLabel}
        />
      </DeferredScreenFrame>
    );
  }

  if (screen === 'tactical_game') {
    const tacticalMyTeam = sf.currentGameTeams?.my ?? myTeam;
    const tacticalOppTeam = sf.currentGameTeams?.opp ?? sf.currentOpp;
    return (
      <DeferredScreenFrame screen={screen}>
        {!tacticalOppTeam || !tacticalMyTeam ? (
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
              myTeam={tacticalMyTeam}
              oppTeam={tacticalOppTeam}
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
            saveId={gs.saveId}
            error={os.careerPersistenceError}
            onNext={os.handleRetirePhaseNext}
          />
        </ErrorBoundary>
      </DeferredScreenFrame>
    );
  }

  if (screen === 'offseason_planning') {
    return <DeferredScreenFrame screen={screen}><ErrorBoundary onReset={() => setScreen('offseason_planning')}>
      <OffseasonPlanningScreen gs={gs} os={os} myTeam={myTeam} myId={myId} year={year} />
    </ErrorBoundary></DeferredScreenFrame>;
  }
  if (screen === 'offseason_fa_phase') {
    return <DeferredScreenFrame screen={screen}><ErrorBoundary onReset={() => setScreen('hub')}>
      <OffseasonFaPhaseScreen gs={gs} os={os} myTeam={myTeam} myId={myId} year={year} />
    </ErrorBoundary></DeferredScreenFrame>;
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
            teams={teams}
            myId={myId}
            saveId={gs.saveId}
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
            saveId={gs.saveId}
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
            teams={teams}
            myId={myId}
            saveId={gs.saveId}
            onNext={async () => {
              if (gs.offseasonPlan) {
                const result = await gs.handleSave();
                if (!result?.ok) return false;
              }
              setScreen('draft_preview');
              return true;
            }}
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
      <DeferredScreenFrame screen={screen} gs={gs}>
        <DraftPreviewScreen
          teams={teams}
          myId={myId}
          year={year}
          pool={os.draftPool}
          draftAllocation={os.draftAllocation}
          onAllocationChange={os.setDraftAllocation}
          savedState={gs.offseasonPlan?.draftViews?.preview} onStateChange={savePreview}
          onStart={() => setScreen('draft_lottery')}
        />
      </DeferredScreenFrame>
    );
  }

  if (screen === 'draft_lottery' && os.draftPool) {
    return (
      <DeferredScreenFrame screen={screen} gs={gs}>
        <DraftLotteryScreen
          teams={teams}
          myId={myId}
          year={year}
          pool={os.draftPool}
          savedState={gs.offseasonPlan?.draftViews?.lottery} onStateChange={saveLottery}
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
            gs.setOffseasonPlan(prev => prev && ({ ...prev, draftAutoSkip: !!autoSkip }));
            setScreen('draft');
          }}
        />
      </DeferredScreenFrame>
    );
  }

  if (screen === 'draft' && os.draftPool) {
    return (
      <DeferredScreenFrame screen={screen} gs={gs}>
        <DraftScreen
          teams={teams}
          myId={myId}
          year={year}
          pool={os.draftPool}
          draftAllocation={os.draftAllocation}
          autoSkip={gs.offseasonPlan?.draftAutoSkip ?? draftAutoSkip}
          savedState={gs.offseasonPlan?.draftViews?.draft} onStateChange={saveDraft}
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
      <DeferredScreenFrame screen={screen} gs={gs}>
        <DraftReviewScreen
          teams={teams}
          myId={myId}
          year={year}
          pool={os.draftResult.pool}
          drafted={os.draftResult.drafted}
          savedState={gs.offseasonPlan?.draftViews?.review} onStateChange={saveReview}
          onEnd={() =>
            os.handleDraftComplete(os.draftResult.pool, os.draftResult.drafted)
          }
        />
      </DeferredScreenFrame>
    );
  }

  if (screen === 'spring_training') {
    return (
      <DeferredScreenFrame screen={screen} gs={gs}>
        <SpringTrainingScreen
          year={year}
          myTeam={myTeam}
          springData={os.springTrainingData}
          error={os.careerPersistenceError}
          onComplete={os.handleSpringTrainingComplete}
        />
      </DeferredScreenFrame>
    );
  }

  if (screen === 'new_season') {
    return (
      <DeferredScreenFrame screen={screen} gs={gs}>
        <NewSeasonScreen
          year={year}
          info={os.newSeasonInfo}
          developmentSummary={os.developmentSummary}
          ownerGoal={myTeam?.ownerGoal || 'cs'}
          onGoalSelect={(goal) =>
            gs.upd(myId, (team) => ({ ...team, ownerGoal: goal }))
          }
          onStart={() => {
            gs.setOffseasonPlan(null);
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
