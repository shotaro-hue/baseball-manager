export default function ContractRenewalRoute({
  gs,
  os,
  myTeam,
  myId,
  year,
  setScreen,
  ScreenComponent,
}) {
  if (gs.screen !== 'contract_renewal_phase') return null;

  return (
    <ScreenComponent
      teams={gs.teams}
      myId={myId}
      year={year}
      demands={os.contractRenewalDemands || {}}
      onSign={os.handleContractRenewalSign}
      onRelease={(pid) => {
        const player = myTeam?.players.find((entry) => entry.id === pid);
        gs.upd(myId, (team) => ({
          ...team,
          players: team.players.filter((entry) => entry.id !== pid),
        }));

        if (!player) return;

        gs.setFaPool((prev) => [...prev, { ...player, isFA: true }]);
        gs.addToHistory(myId, player, 'offseason_release');
        gs.addNews({
          type: 'season',
          headline: `${player.name}が自由契約に`,
          source: '球団発表',
          dateLabel: `${year}年`,
          body: `${player.name}（${player.age}歳）が契約更改後に自由契約となりました。`,
        });
        gs.notify(`${player.name}を自由契約にしました`, 'warn');
      }}
      onNext={os.handleContractRenewalPhaseNext}
    />
  );
}
