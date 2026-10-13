import { useCallback, useMemo } from 'react';

export default function BatchResultRoute({
  gs,
  sf,
  myTeam,
  setScreen,
  ScreenComponent,
}) {
  const context = sf.batchContext;
  const currentContext = context && context.saveId === gs.saveId && context.year === gs.year
    && context.myId === gs.myId && context.sessionToken === gs.getProgressSessionToken?.();
  const map = currentContext ? gs.getGameResultsMap?.() : null;
  const gameNumbers = useMemo(() => new Set((sf.batchResults || []).map(result => result?.gameNo)), [sf.batchResults]);
  const getGameResult = useCallback(result => gameNumbers.has(result?.gameNo) ? map?.[result.gameNo] : undefined, [map, gameNumbers]);
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
      getGameResult={getGameResult}
      canViewDetail={result => Boolean(getGameResult(result))}
      returnGameNo={returning ? sf.gameResult.gameNo : undefined}
      initialVisibleCount={returning ? sf.gameResult._batchVisibleCount : undefined}
      onEnd={() => { gs.setTab('dashboard'); setScreen('hub'); }}
      onReviewRoster={() => { gs.setTab('roster'); setScreen('hub'); }}
      onViewDetail={(result, visibleCount) => {
        const detail = getGameResult(result);
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
