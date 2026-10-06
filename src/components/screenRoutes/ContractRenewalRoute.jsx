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
      onRelease={(pid, reason = 'offseason_release') => {
        const player = myTeam?.players.find((entry) => entry.id === pid);
        gs.upd(myId, (team) => ({
          ...team,
          players: team.players.filter((entry) => entry.id !== pid),
          ...Object.fromEntries(['lineup', 'lineupNoDh', 'lineupDh', 'rotation'].filter(key => Array.isArray(team[key])).map(key => [key, team[key].filter(id => id !== pid)])),
        }));

        if (!player) return;

        gs.setFaPool((prev) => [...prev, { ...player, isFA: true, contractYearsLeft: 0, departureReason: reason }]);
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
