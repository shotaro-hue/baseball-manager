export default function BatchResultRoute({
  gs,
  sf,
  myTeam,
  setScreen,
  ScreenComponent,
}) {
  if (gs.screen !== 'batch_result') return null;

  return (
    <ScreenComponent
      results={sf.batchResults}
      batchMeta={sf.batchMeta}
      myTeam={myTeam}
      onEnd={() => setScreen('hub')}
      onViewDetail={(result) => {
        const detail = gs.getGameResultsMap()?.[result.gameNo];
        if (!detail) return;
        sf.setGameResult({
          score: { my: detail.myScore, opp: detail.oppScore },
          log: detail.log || [],
          inningSummary: detail.inningSummary || [],
          oppTeam: detail.oppTeam || result.oppTeam,
          won: detail.won,
          gameNo: result.gameNo,
          _source: 'batch',
        });
        setScreen('result');
      }}
    />
  );
}
