import React, { useMemo } from 'react';
import { Button, DataTableFrame, MetricBand, Section } from '../design-system/primitives';
import { contractPayroll, contractSalaryStatus } from '../../engine/contractPayroll';
import { financeView, moneyText, payrollText, rangeText } from './financeView';
import { FinanceActions } from './FinanceActions';
import { ContractPayroll } from './ContractPayroll';
import './club-management.css';
const incomeRows = [['ticket','チケット売上'],['food','飲食'],['merch','物販'],['sponsor','スポンサー'],['broadcast','放映権'],['membership','会員']];
const costRows = [['fixed','固定費・一般運営'],['matchday','興行費'],['goods','飲食・物販原価']];
const remainder = (annual, actual) => annual && Number.isFinite(actual) ? { min: annual.min - actual, max: annual.max - actual } : null;

function LedgerTable({ label, rows }) {
  return <DataTableFrame label={label} className="finance-ledger"><table><caption>{label}</caption>
    <thead><tr><th scope="col">項目</th><th scope="col" data-number>今季実績</th><th scope="col" data-number>残り試合予測</th><th scope="col" data-number>年間見込み</th></tr></thead>
    <tbody>{rows.map(([label, actual, annual]) => <tr key={label}><th scope="row">{label}</th><td data-number>{moneyText(actual)}</td><td data-number>{rangeText(remainder(annual, actual))}</td><td data-number>{rangeText(annual)}</td></tr>)}</tbody>
  </table></DataTableFrame>;
}
export function FinanceTab({ team, onStadiumUpgrade, onTicketPriceChange, schedule, onNavigate }) {
  const model = useMemo(() => financeView(team, schedule), [team, schedule]);
  const payroll = contractPayroll(team), f = model.forecast;
  const coachPayroll = Array.isArray(team.coaches) && team.coaches.every(coach => contractSalaryStatus(coach?.salary) === 'recorded')
    ? team.coaches.reduce((total, coach) => total + coach.salary, 0) : null;
  const annualAfterPayroll = f && payroll.total.missing === 0 && payroll.total.invalid === 0 && Number.isFinite(payroll.total.amount)
    ? { min: f.operatingSurplus.min - payroll.total.amount, max: f.operatingSurplus.max - payroll.total.amount } : null;
  const metric = (label, value, extra = {}) => ({ label, value, ...extra });
  return <main className="club-management finance-tab" data-ds="finance">
    <h1>財務</h1><p>実績と残り試合の予測から、価格と投資を判断します。</p>
    <MetricBand items={[
      metric('編成予算の残枠', Number.isFinite(team.budget) ? moneyText(team.budget) : null),
      metric('年間運営差額見込み（選手給与控除前）', f ? rangeText(f.operatingSurplus) : null, { state: 'unavailable' }),
      metric('年間売上見込み', f ? rangeText(f.revenue) : model.status === 'legacy' ? moneyText(model.legacyAnnual) : null, { state: 'unavailable' }),
      metric('契約年俸総額 / 年', payrollText(payroll.total)),
    ]} />
    <p className="finance-note">編成予算は現金残高ではありません。契約年俸を残枠から再び差し引く必要はありません。</p>
    {model.status === 'invalid' && <p className="finance-error" role="alert">収支を算出できません。{model.error}</p>}
    {model.status === 'legacy' && <p className="finance-warning" role="status">旧モデルの収入を表示しています。翌年度から新しい収支モデルへ切り替わります。運営費と運営差額は算出不可です。</p>}
    <Section title="経営アクション">
      <FinanceActions key={`${team.id}:${team.clubFinance?.year ?? 'legacy'}`} team={team} schedule={schedule} model={model} onTicketPriceChange={onTicketPriceChange} onStadiumUpgrade={onStadiumUpgrade} />
    </Section>
    <Section title="売上・運営費の内訳" aria-label="運営費と編成予算">
      {f ? <>
        <p className="finance-note">実施{f.gamesPlayed}試合の実績＋残り試合の予測。{f.completeSchedule ? '実際の日程を使用。' : '日程未確認のため主催試合数は概算。'}</p>
        <p className="finance-note">主催{rangeText(f.homeGames, String)}試合。残り試合は現在の人気・成績・価格を固定した推定値です。</p>
        <LedgerTable label="今季の収支" rows={[
          ['売上合計', model.actual.revenue, f.revenue],
          ['運営費（選手給与を除く）', model.actual.operatingCosts, f.operatingCosts],
          ['運営差額（選手給与控除前）', model.actual.operatingSurplus, f.operatingSurplus],
        ]} />
        <dl className="finance-rows" aria-label="契約年俸控除後の参考収支">
          <div><dt>契約年俸控除後の参考収支（年間）</dt><dd>{rangeText(annualAfterPayroll)}</dd></div>
        </dl>
        <p className="finance-note">年間運営差額見込みから全所属選手の契約年俸を引いた参考値です。支払済み額でも編成予算の残枠でもありません。{!annualAfterPayroll && '年俸を全員分集計できないため算出不可です。'}</p>
        {[['チケット・飲食・物販', incomeRows.slice(0,3), 'income'], ['スポンサー・放映権・会員', incomeRows.slice(3), 'income'], ['固定費・興行費・商品原価', costRows, 'costs']].map(([label, rows, group]) => <details key={label}>
          <summary>{label}</summary><LedgerTable label={label} rows={rows.map(([key, title]) => [title, model.actual[group][key], f[group][key]])} />
        </details>)}
      </> : model.status === 'legacy' ? <>
        <p className="finance-note">年間見込み / 旧モデル・出場143試合換算</p>
        <dl className="finance-rows">
          <div><dt>売上実績</dt><dd>{moneyText(model.actual.revenue)}</dd></div>
          <div><dt>現在条件での年間売上</dt><dd>{moneyText(model.legacyAnnual)}</dd></div>
          <div><dt>実績からの年換算</dt><dd>{model.legacyProjection == null ? '— 算出不可（実績が不足）' : moneyText(model.legacyProjection)}</dd></div>
        </dl>
      </> : <p className="finance-note">— 算出不可。収支データを確認してください。</p>}
    </Section>
    <Section title="契約・関連情報">
      <details><summary>契約年俸の内訳</summary><ContractPayroll team={team} onNavigate={onNavigate} /></details>
      <details><summary>コーチ給与（参考）</summary>
        <dl className="finance-rows"><div><dt>コーチ給与合計（参考）</dt><dd>{team.coaches == null ? '— 未記録' : coachPayroll == null ? '— 算出不可' : moneyText(coachPayroll)}</dd></div></dl>
        <p className="finance-note">現在所属するコーチの参考額です。契約給与・支払済み額ではありません。コーチ給与は選手の契約年俸総額・参考収支には含みません。</p>
      </details>
      {onNavigate && <Button variant="secondary" onClick={() => onNavigate('contract')}>契約状況を確認</Button>}
      <details><summary>予測の前提・予算の仕組み</summary>
        <p className="finance-note">球団別の動員基準と推定値による簡易収支です。主催球団だけにチケット・飲食・物販と興行費を計上し、年間契約と固定費は全試合に配賦します。</p>
        <p className="finance-note">売上から選手給与を含まない運営費を引いた差額を編成予算へ反映します。翌年度はオーナー配分と契約年俸から予算を再設定します。表示した契約年俸は支払済み額ではありません。</p>
        <p className="finance-note">球場投資は既存10/25/50億円（新収支モデル）。未記録の過去年次収支は生成しません。</p>
      </details>
    </Section>
  </main>;
}
