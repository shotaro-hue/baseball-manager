import React from 'react';
import { contractPayroll } from '../../engine/contractPayroll';
import { moneyText, payrollText } from './financeView';
import { Button } from '../design-system/primitives';
import './club-management.css';

export function ContractPayroll({ team, leaders = false, onPlayerClick, onNavigate }) {
  const payroll = contractPayroll(team);
  return <section className="finance-payroll-summary" data-ds="contract-payroll" aria-label="選手契約年俸（年額）">
    <h3>選手契約年俸（年額）</h3><p className="finance-note">現在所属する選手の契約年俸です。支払済み額ではありません。</p>
    <dl className="finance-rows">
      {[...payroll.groups, { ...payroll.total, category: 'total', label: '合計' }].map(group => <div key={group.category} data-payroll-category={group.category}>
        <dt>{group.label} <span className="finance-note">{group.count}人</span></dt><dd>{payrollText(group)}
          {(group.missing > 0 || group.invalid > 0) && <small>{[group.missing > 0 && `未記録${group.missing}人`, group.invalid > 0 && `不正値${group.invalid}人`].filter(Boolean).join('・')}</small>}
        </dd>
      </div>)}
    </dl>
    {payroll.total.missing + payroll.total.invalid > 0 && <p className="finance-warning" role="status">年俸が未記録・不正な選手を含むため、合計は確認できた年俸のみです。</p>}
    {onNavigate && <Button variant="secondary" onClick={() => onNavigate('contract')}>契約一覧・年俸上位を見る</Button>}
    {leaders && <section aria-label="年俸上位（所属選手）">
      <h3>年俸上位（所属選手）</h3><p className="finance-note">一軍・二軍・育成の所属選手 / 年額上位6人</p>
      {payroll.leaders.length === 0 && <p className="finance-note">所属選手はいません</p>}
      {payroll.leaders.map((entry, index) => <div className="finance-leader" key={index}>
        <div><Button variant="secondary" onClick={() => onPlayerClick?.(entry.player, team.name)}>{entry.player.name}</Button>
          <p className="finance-note">{entry.label} / {entry.player.pos} / {entry.player.contractYearsLeft}年</p></div>
        <span>{entry.salaryStatus === 'recorded' ? moneyText(entry.player.salary) : entry.salaryStatus === 'missing' ? '未記録' : '不正値'}</span>
      </div>)}
    </section>}
  </section>;
}
