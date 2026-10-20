import { Button, MetricBand, Section } from '../design-system/primitives';
import { contractPayroll } from '../../engine/contractPayroll';
import { evaluateRosterCapacity } from '../../engine/rosterCapacity';
import { MAX_SHIHAKA_TOTAL } from '../../constants';
import { fmtSal } from '../../utils';
import { payrollText } from '../tabs/financeView';
import '../tabs/club-management.css';

export default function HubManagementTab({ team, recruitment = false, onNavigate, onOpen = onNavigate, notifications, capacityContext }) {
  const payroll = contractPayroll(team), capacity = evaluateRosterCapacity(team, capacityContext);
  const budget = { label: '編成予算の残枠', value: Number.isFinite(team?.budget) ? fmtSal(team.budget) : null };
  const state = key => Number.isFinite(team?.[key]) ? `${team[key]} / 100` : '— 未記録';
  const links = <div className="hub-entry-links">
    <Button variant="secondary" onClick={() => onNavigate('fa')}>FA市場</Button>
    <Button variant="secondary" onClick={() => onNavigate('trade')}>トレード</Button>
    <Button variant="secondary" onClick={() => onNavigate('scout')}>スカウト</Button>
    {!recruitment && <><Button variant="secondary" onClick={() => onNavigate('contract')}>契約状況</Button><Button variant="secondary" onClick={() => onNavigate('finance')}>財務を確認</Button></>}
  </div>;
  return <main className="hub-management club-management" data-ds="management-entry">
    <h1>{recruitment ? '補強' : '球団経営'}</h1>
    <p>{recruitment ? '市場・トレード・スカウトから、必要な戦力を探します。' : '編成枠と対応待ちを確認して、次の判断へ。'}</p>
    <MetricBand items={recruitment ? [budget] : [budget,
      { label: '契約年俸総額 / 年', value: payrollText(payroll.total) },
      { label: '支配下登録', value: capacity.ok ? capacity.controlledCount : null, unit: `/ ${MAX_SHIHAKA_TOTAL}人`, state: 'unavailable' },
      { label: '残り登録枠', value: capacity.ok ? capacity.remainingSlots : null, unit: '人', state: 'unavailable' },
    ]} />
    <p className="hub-help">補強や球場投資などに使える残枠です。現金残高ではありません。{!recruitment && '契約年俸を残枠から再び差し引く必要はありません。'}</p>
    {!recruitment && capacity.ok && capacity.acceptedPickCount > 0 && <p className="finance-note">受諾済み・未所属 {capacity.acceptedPickCount}人を残り登録枠に反映しています。</p>}
    {!recruitment && capacity.ok && capacity.overBy > 0 && <p className="finance-warning">支配下枠を{capacity.overBy}人超過しています。所属と受諾済み指名を確認してください。</p>}
    {recruitment ? <Section title="補強方法を選ぶ">{links}</Section> : <div className="management-columns">
      <Section title="対応待ち" className="management-pending">
        {notifications?.management > 0 ? <div className="finance-pending">
          <p>要対応 {notifications.management}件</p>
          {notifications.trades > 0 && <Button variant="secondary" onClick={() => onOpen('trade')}>トレード提案 {notifications.trades}件を確認</Button>}
          {notifications.posting > 0 && <Button variant="secondary" onClick={() => onOpen('mailbox')}>ポスティング申請 {notifications.posting}件を確認</Button>}
        </div> : <p>対応待ちの取引・申請はありません。</p>}
        <p className="finance-note">既読にしても取引は確定しません。契約満了予定は契約状況から確認できます。</p>
      </Section>
      <div className="management-routes">
        <Section title="経営判断へ進む">{links}</Section>
        <Section title="球団の状態"><dl className="finance-rows"><div><dt>球団人気</dt><dd>{state('popularity')}</dd></div><div><dt>オーナー信頼度</dt><dd>{state('ownerTrust')}</dd></div></dl></Section>
      </div>
    </div>}
  </main>;
}
