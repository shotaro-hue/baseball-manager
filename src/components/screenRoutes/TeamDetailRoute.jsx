export default function TeamDetailRoute({
  gs,
  setScreen,
  setTab,
  teams,
  year,
  schedule,
  myTeam,
  ScreenComponent,
}) {
  if (gs.screen !== 'team_detail' || !gs.viewingTeam) return null;

  return (
    <ScreenComponent
      team={gs.viewingTeam}
      myTeam={myTeam}
      allTeams={teams}
      schedule={schedule}
      year={year}
      allTeamResultsMap={gs.allTeamResultsMap}
      allTeamBoxScoresMap={gs.allTeamBoxScoresMap}
      onBack={() => setScreen('hub')}
      onPlayerClick={gs.handlePlayerClick}
      onOpenTrade={() => {
        setScreen('hub');
        setTab('trade');
      }}
    />
  );
}
