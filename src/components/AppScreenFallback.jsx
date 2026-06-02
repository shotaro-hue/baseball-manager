export default function AppScreenFallback({ label = 'Loading...' }) {
  return (
    <div className="app">
      <div className="rw">
        <div className="rtitle">Loading</div>
        <div style={{ marginBottom: 20, color: '#94a3b8', fontSize: 13 }}>
          {label}
        </div>
      </div>
    </div>
  );
}
