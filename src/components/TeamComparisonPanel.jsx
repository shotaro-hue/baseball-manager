import { buildTeamComparisonRows } from '../engine/analysisComparison';

function PayrollStatus({ summary }) {
  if (!summary || (!summary.missing && !summary.invalid)) return null;
  return <span>確認済み {Math.round(summary.amount).toLocaleString()}万円（集計不完全・未記録{summary.missing}人・不正値{summary.invalid}人）</span>;
}

export function TeamComparisonPanel({ myTeam, opponent, allTeams }) {
  const rows = buildTeamComparisonRows({ myTeam, opponent, allTeams });
  if (!myTeam || !opponent) return null;
  return (
    <section className="team-comparison-panel" aria-labelledby="team-comparison-title">
      <div className="team-comparison-heading">
        <div>
          <h3 id="team-comparison-title">自球団との戦力比較</h3>
          <p>今季一軍成績は降格選手を含み、二軍成績は含みません。守備は現一軍の先発打線、総年俸は一軍・二軍・育成の年間契約年俸（年額・万円）です。支払済み額ではありません。--- は未記録・算出不可です。</p>
        </div>
        <span>{opponent.league}リーグ基準</span>
      </div>
      <div className="team-comparison-table-wrap" role="region" aria-label="球団比較表" tabIndex={0}>
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
                    <PayrollStatus summary={row.myPayrollSummary} />
                    {row.myRank && <span>{row.myRank}/{row.population}位</span>}
                  </td>
                  <td className={opponentBetter ? 'comparison-better' : ''}>
                    <strong>{row.format(row.opponentValue)}</strong>
                    <PayrollStatus summary={row.opponentPayrollSummary} />
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

