export default function ModeSelectScreen({ myTeam, oppTeam, gameDay, onSelect, onBack, isProcessing = false, processingPhase = '' }) {
  return (
    <div className="app">
      <div className="mode-wrap">
        <div style={{ marginBottom: 6, fontSize: 11, color: '#374151', letterSpacing: '.2em' }}>第{gameDay}戦</div>
        <div style={{ fontFamily: "'Bebas Neue',cursive", fontSize: 36, color: '#f5c842', letterSpacing: '.1em', marginBottom: 4 }}>
          vs {oppTeam?.name}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
          <span style={{ fontSize: 22 }}>{myTeam?.emoji}</span>
          <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 16, color: '#374151' }}>vs</span>
          <span style={{ fontSize: 22 }}>{oppTeam?.emoji}</span>
        </div>

        <div style={{ display: 'grid', gap: 14, width: '100%', maxWidth: 520, marginBottom: 8 }}>
          <div
            className="mode-card tactical"
            role="button"
            tabIndex={isProcessing ? -1 : 0}
            onClick={() => { if (!isProcessing) onSelect?.('tactical'); }}
            onKeyDown={(event) => {
              if (isProcessing) return;
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              onSelect?.('tactical');
            }}
            style={isProcessing ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
          >
            <div style={{ fontSize: 42, marginBottom: 10 }}>🎮</div>
            <div style={{ fontFamily: "'Bebas Neue',cursive", fontSize: 28, color: '#f5c842', letterSpacing: '.1em', marginBottom: 6 }}>
              試合モード
            </div>
            <div style={{ fontSize: 12, color: '#4b5563', lineHeight: 1.6 }}>
              TacticalGame 画面で試合を進行します。<br />
              采配や継投を操作したい場合はこちらを選択します。
            </div>
          </div>

          <div
            className="mode-card auto"
            role="button"
            tabIndex={isProcessing ? -1 : 0}
            onClick={() => { if (!isProcessing) onSelect?.('auto'); }}
            onKeyDown={(event) => {
              if (isProcessing) return;
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              onSelect?.('auto');
            }}
            style={isProcessing ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
          >
            <div style={{ fontSize: 42, marginBottom: 10 }}>⚡</div>
            <div style={{ fontFamily: "'Bebas Neue',cursive", fontSize: 28, color: '#34d399', letterSpacing: '.1em', marginBottom: 6 }}>
              オートシムモード
            </div>
            <div style={{ fontSize: 12, color: '#4b5563', lineHeight: 1.6 }}>
              試合を高速に進行します。<br />
              結果だけを見たいときに使います。
            </div>
          </div>
        </div>

        {isProcessing && (
          <div style={{ marginTop: 8, marginBottom: 8, fontSize: 12, color: '#374151', textAlign: 'center' }}>
            試合を処理中です{processingPhase ? ` - ${processingPhase}` : ''}
          </div>
        )}

        <button onClick={onBack} disabled={isProcessing} style={{ background: 'transparent', border: 'none', color: '#374151', cursor: isProcessing ? 'not-allowed' : 'pointer', fontSize: 12, marginTop: 4, opacity: isProcessing ? 0.5 : 1 }}>
          ← ハブに戻る
        </button>
      </div>
    </div>
  );
}
