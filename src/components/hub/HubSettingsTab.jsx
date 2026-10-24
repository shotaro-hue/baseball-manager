import { Button, Section } from '../design-system/primitives';
import '../reading/reading.css';
export default function HubSettingsTab({
  onNavigate
}) {
  return <main className="club-reading" data-ds="hub-settings">
    <h1>設定</h1>
    <p className="reading-muted">試合の進め方や起用方針は、それぞれの操作画面から変更できます。</p>
    <Section title="ゲームの操作">
      <p>まとめて進める試合数とフル自動編成はホーム、選手の起用設定は編成から確認できます。</p>
      <div className="reading-actions">
        <Button variant="secondary" onClick={() => onNavigate('dashboard')}>ホームで試合進行を設定</Button>
        <Button variant="secondary" onClick={() => onNavigate('roster')}>編成で起用方針を確認</Button>
      </div>
    </Section>
    <details className="hub-developer"><summary>開発者向け機能</summary>
      <p>シミュレーションの実績と設定値を確認します。</p>
      <Button variant="secondary" onClick={() => onNavigate('balance')}>バランス検証</Button>
    </details>
  </main>;
}
