import { buildTeamComparisonRows } from '../engine/analysisComparison';

export function TeamComparisonPanel({ myTeam, opponent, allTeams }) {
  const rows = buildTeamComparisonRows({ myTeam, opponent, allTeams });
  if (!myTeam || !opponent) return null;
  return (
    <section className="team-comparison-panel" aria-labelledby="team-comparison-title">
      <div className="team-comparison-heading">
        <div>
          <h3 id="team-comparison-title">自球団との戦力比較</h3>
          <p>実成績・登録選手・契約情報から算出。独自の総合点は使いません。</p>
        </div>
        <span>{opponent.league}リーグ基準</span>
      </div>
      <div className="team-comparison-table-wrap">
        <table className="tbl team-comparison-table">
          <thead>
            <tr>
              <th>比較指標</th>
              <th>{myTeam.short || myTeam.name}</th>
              <th>{opponent.short || opponent.name}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const myBetter = row.higherBetter == null || row.myValue == null || row.opponentValue == null
                ? false
                : row.higherBetter
                  ? row.myValue > row.opponentValue
                  : row.myValue < row.opponentValue;
              const opponentBetter = row.higherBetter == null || row.myValue == null || row.opponentValue == null
                ? false
                : row.higherBetter
                  ? row.opponentValue > row.myValue
                  : row.opponentValue < row.myValue;
              return (
                <tr key={row.key}>
                  <td>{row.label}</td>
                  <td className={myBetter ? 'comparison-better' : ''}>
                    <strong>{row.format(row.myValue)}</strong>
                    {row.myRank && <span>{row.myRank}/{row.population}位</span>}
                  </td>
                  <td className={opponentBetter ? 'comparison-better' : ''}>
                    <strong>{row.format(row.opponentValue)}</strong>
                    {row.opponentRank && <span>{row.opponentRank}/{row.population}位</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

