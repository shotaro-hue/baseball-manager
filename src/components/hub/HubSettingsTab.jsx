import { Button } from '../design-system/primitives';
export default function HubSettingsTab({ onNavigate }) {
  return <main className="hub-management" data-ds="hub-settings">
    <h1>設定</h1>
    <details className="hub-developer"><summary>開発者向け機能</summary>
      <p>シミュレーションの実績と設定値を確認します。</p>
      <Button variant="secondary" onClick={() => onNavigate('balance')}>バランス検証</Button>
    </details>
  </main>;
}
