import React from 'react';

export class ErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  reset = () => this.setState({ hasError: false });

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, textAlign: 'center', color: '#e0d4bf' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>エラーが発生しました</div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 20 }}>
            ゲームデータは保持されています
          </div>
          <button
            onClick={() => { this.reset(); this.props.onReset?.(); }}
            style={{
              background: 'rgba(74,222,128,.1)', border: '1px solid rgba(74,222,128,.4)',
              color: '#4ade80', borderRadius: 6, padding: '8px 20px',
              fontSize: 13, cursor: 'pointer',
            }}
          >
            前の画面に戻る
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
