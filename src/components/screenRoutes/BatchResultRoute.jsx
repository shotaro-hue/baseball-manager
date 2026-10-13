export default function BatchResultRoute({
  gs,
  sf,
  myTeam,
  setScreen,
  ScreenComponent,
}) {
  if (gs.screen !== 'batch_result') return null;
  // gameResult survives returning home and running another batch. Restore only
  // for the exact batch that opened the detail, not a previous batch/year.
  const returning = sf.gameResult?._source === 'batch' && sf.gameResult._batchResults === sf.batchResults;

  return (
    <ScreenComponent
      results={sf.batchResults}
      batchMeta={sf.batchMeta}
      myTeam={myTeam}
      saveDirty={gs.saveDirty}
      saveQueueState={gs.saveQueueState}
      saveResult={gs.saveResult}
      canViewDetail={result => Boolean(gs.getGameResultsMap()?.[result.gameNo])}
      returnGameNo={returning ? sf.gameResult.gameNo : undefined}
      initialVisibleCount={returning ? sf.gameResult._batchVisibleCount : undefined}
      onEnd={() => { gs.setTab('dashboard'); setScreen('hub'); }}
      onReviewRoster={() => { gs.setTab('roster'); setScreen('hub'); }}
      onViewDetail={(result, visibleCount) => {
        const detail = gs.getGameResultsMap()?.[result.gameNo];
        if (!detail) return;
        sf.setGameResult({
          score: { my: detail.myScore, opp: detail.oppScore },
          log: detail.log || [],
          inningSummary: detail.inningSummary || [],
          oppTeam: detail.oppTeam || result.oppTeam,
          won: detail.won,
          isHome: detail.isHome,
          gameNo: result.gameNo,
          _source: 'batch',
          _batchVisibleCount: visibleCount,
          _batchResults: sf.batchResults,
        });
        setScreen('result');
      }}
    />
  );
}
