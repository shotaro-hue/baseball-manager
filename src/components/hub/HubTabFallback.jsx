export default function HubTabFallback({ label = 'Loading tab...' }) {
  return (
    <div className="card">
      <div className="card-h">{label}</div>
      <div style={{ fontSize: 12, color: '#94a3b8' }}>読み込み中...</div>
    </div>
  );
}
