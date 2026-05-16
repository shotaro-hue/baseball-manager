import { calcOwnerTrustDelta } from '../../engine/frontend';
import { clamp, uid } from '../../utils';

export default function PlayoffRoute({
  gs,
  sf,
  myTeam,
  myId,
  year,
  setScreen,
  ScreenComponent,
}) {
  if (gs.screen !== 'playoff' || !sf.playoff) return null;

  return (
    <ScreenComponent
      playoff={sf.playoff}
      setPlayoff={sf.setPlayoff}
      teams={gs.teams}
      myId={myId}
      year={year}
      onFinish={() => {
        const playoff = sf.playoff;
        if (playoff?.champion) {
          const jpSeries = playoff.jpSeries;
          const opponent = jpSeries
            ? jpSeries.teams.find((team) => team.id !== playoff.champion.id)
            : null;
          const seriesResult = jpSeries
            ? `${jpSeries.wins[0]}-${jpSeries.wins[1]}`
            : '4-?';

          gs.setSeasonHistory((prev) => ({
            ...prev,
            championships: [
              ...(prev.championships || []),
              {
                year,
                championId: playoff.champion.id,
                championName: playoff.champion.name,
                opponent: opponent?.name || '?',
                seriesResult,
              },
            ],
          }));

          if (playoff.champion.id === myId) {
            gs.setMailbox((prev) => [
              ...prev,
              {
                id: uid(),
                type: 'championship',
                read: false,
                title: `${year}年 日本一`,
                from: 'NPB本部',
                dateLabel: `${year}年`,
                timestamp: Date.now(),
                body: `${playoff.champion.name}が日本シリーズを制しました。結果: ${seriesResult}`,
              },
            ]);
          }
        }

        const trustDelta = calcOwnerTrustDelta(myId, myTeam, sf.playoff);
        if (trustDelta !== 0) {
          gs.upd(myId, (team) => ({
            ...team,
            ownerTrust: clamp((team.ownerTrust ?? 50) + trustDelta, 0, 100),
          }));
        }

        setScreen('retire_phase');
      }}
    />
  );
}
