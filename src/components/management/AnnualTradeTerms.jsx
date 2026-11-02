import { money } from './DecisionParts';

export function AnnualTradeTerms({ preview, mine, target }) {
  if (!preview?.ok) return null;
  const players = [...preview.outgoing, ...preview.incoming], name = id => players.find(p => p?.id === id)?.name ?? '選手';
  const teamName = id => preview.teams.find(t => t.id === id)?.name ?? '球団名未記録';
  return <>
    <p>移籍日以後の給与と将来契約を移管します。年俸・契約終了年度・保証条件は変更しません。加入待ちを含む70人枠と双方の全年度予算を検証しています。</p>
    {preview.contracts.map(c => <p key={c.contractId}>{name(c.playerId)}：年俸（年額）{money(c.annualSalaryManYen)} · {c.startSeason}〜{c.endSeason}年度 · {c.guaranteed ? '保証あり' : '保証なし'}</p>)}
    <div className="decision-table-scroll" tabIndex={0} role="region" aria-label="移籍選手の年度別給与負担">
      <table><caption>移籍選手の年度別給与負担</caption><thead><tr><th>選手・年度</th><th>支払球団</th><th>給与</th></tr></thead>
        <tbody>{preview.costs.map((c, i) => <tr key={i}><th>{name(c.playerId)} · {c.season}年度</th><td>{teamName(c.teamId)}</td><td>{money(c.amountManYen)}</td></tr>)}</tbody></table>
    </div>
    <div className="decision-table-scroll" tabIndex={0} role="region" aria-label="移籍後の年度別追加余力">
      <table><caption>移籍後の年度別追加余力（金銭・給与・留保・最低維持費を反映）</caption><thead><tr><th>年度</th><th>球団</th><th>追加余力</th></tr></thead>
        <tbody>{preview.rows.map(r => <tr key={`${r.teamId}-${r.season}`}><th>{r.season}年度</th><td>{r.teamId === mine.id ? mine.name : target?.name}</td><td>{money(r.remainingManYen)}</td></tr>)}</tbody></table>
    </div>
    <p>保存と画面への反映を確認してから成立となります。</p>
  </>;
}
