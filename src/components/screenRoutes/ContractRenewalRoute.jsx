import { useRef } from 'react';

export default function ContractRenewalRoute({
  gs,
  os,
  myTeam,
  myId,
  year,
  setScreen,
  ScreenComponent,
}) {
  const released = useRef(new Set());
  if (gs.screen !== 'contract_renewal_phase') return null;

  return (
    <ScreenComponent
      teams={gs.teams}
      myId={myId}
      year={year}
      saveId={gs.saveId}
      demands={os.contractRenewalDemands || {}}
      renewalPlayerIds={os.contractRenewalDemands == null ? undefined : Object.keys(os.contractRenewalDemands)}
      onSign={os.handleContractRenewalSign}
      onRelease={(pid, reason = 'offseason_release') => {
        const player = [...(myTeam?.players || []), ...(myTeam?.farm || [])].find((entry) => entry.id === pid);
        const key = JSON.stringify([year, typeof pid, pid]);
        if (!player || player.contractSignedYear === year || released.current.has(key)) return;
        released.current.add(key);
        gs.upd(myId, (team) => ({
          ...team,
          players: team.players.filter((entry) => entry.id !== pid),
          farm: (team.farm || []).filter((entry) => entry.id !== pid),
          ...Object.fromEntries(['lineup', 'lineupNoDh', 'lineupDh', 'rotation'].filter(key => Array.isArray(team[key])).map(key => [key, team[key].filter(id => id !== pid)])),
        }));

        if (!player) return;

        gs.setFaPool((prev) => [...prev, { ...player, isFA: true, contractYearsLeft: 0, departureReason: reason, marketLastStats: player.stats, faEnteredYear: year, faOriginTeamId: myId, faOriginTeamName: myTeam?.name,
          faOriginRoster: myTeam?.farm?.some(p => p.id === pid) ? 'farm' : 'active' }]);
        gs.addToHistory(myId, player, reason === 'salary_cut' ? '自由契約（減額制限超過）' : reason);
        gs.addNews({
          type: 'season',
          headline: `${player.name}が自由契約に`,
          source: '球団発表',
          dateLabel: `${year}年`,
          body: reason === 'salary_cut' ? `${player.name}（${player.age}歳）が減額制限を超える提示に同意せず、自由契約となりました。FA権の行使ではありません。` : `${player.name}（${player.age}歳）が契約更改後に自由契約となりました。`,
        });
        gs.notify(`${player.name}を自由契約にしました`, 'warn');
      }}
      onNext={os.handleContractRenewalPhaseNext}
    />
  );
}
