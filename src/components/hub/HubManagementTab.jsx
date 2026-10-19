import { Button, MetricBand, Section } from '../design-system/primitives';
import { fmtSal } from '../../utils';

export default function HubManagementTab({ team, recruitment = false, onNavigate, notifications }) {
  return <main className="hub-management" data-ds="management-entry">
    <h1>{recruitment ? '補強' : '球団経営'}</h1>
    <p>{recruitment ? '市場・トレード・スカウトから、必要な戦力を探します。' : '編成予算を確認し、補強・契約・財務へ進みます。'}</p>
    <MetricBand items={[{ label: '編成予算の残枠', value: Number.isFinite(team?.budget) ? fmtSal(team.budget) : null }]} />
    <p className="hub-help">補強や球場投資などに使える残枠です。現金残高ではありません。</p>
    {!recruitment && notifications?.management > 0 && <p className="hub-attention">要対応 {notifications.management}件 · 通知から提案を確認できます。</p>}
    <Section title={recruitment ? '補強方法を選ぶ' : '経営判断へ進む'}>
      <div className="hub-entry-links">
        <Button variant="secondary" onClick={() => onNavigate('fa')}>FA市場</Button>
        <Button variant="secondary" onClick={() => onNavigate('trade')}>トレード</Button>
        <Button variant="secondary" onClick={() => onNavigate('scout')}>スカウト</Button>
        {!recruitment && <>
          <Button variant="secondary" onClick={() => onNavigate('contract')}>契約状況</Button>
          <Button variant="secondary" onClick={() => onNavigate('finance')}>財務を確認</Button>
        </>}
      </div>
    </Section>
  </main>;
}
