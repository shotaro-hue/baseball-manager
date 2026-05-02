import { useMemo, useState } from 'react';
import { mockGameState } from '../../data/mockGame';

const riskToneMap = {
  low: { label: '低', color: '#34d399' },
  medium: { label: '中', color: '#f5c842' },
  high: { label: '高', color: '#f87171' },
};

function sanitizeActionId(rawActionId) {
  // ⚠️ セキュリティ: UIイベント値を文字列化し、許可済みIDのみ処理する
  const actionId = String(rawActionId || '').trim();
  const allowedActionIds = new Set(mockGameState.actions.map((action) => action.id));
  return allowedActionIds.has(actionId) ? actionId : null;
}

function MiniField({ runners }) {
  const safeRunners = {
    first: Boolean(runners?.first),
    second: Boolean(runners?.second),
    third: Boolean(runners?.third),
  };

  return (
    <div className="mini-field" aria-label="簡易フィールド">
      <div className="mini-field-mound" aria-hidden="true">●</div>
      <div className="mini-field-base home" aria-label="ホームベース">H</div>
      <div className={`mini-field-base first ${safeRunners.first ? 'active' : ''}`} aria-label="一塁">1</div>
      <div className={`mini-field-base second ${safeRunners.second ? 'active' : ''}`} aria-label="二塁">2</div>
      <div className={`mini-field-base third ${safeRunners.third ? 'active' : ''}`} aria-label="三塁">3</div>
    </div>
  );
}

export function GameActionTab() {
  const [gameLog, setGameLog] = useState(['試合開始: 7回裏 1アウト 一・三塁']);

  const riskTone = useMemo(() => riskToneMap[mockGameState.matchup.riskLevel] || riskToneMap.medium, []);

  const handleActionClick = (rawActionId) => {
    const actionId = sanitizeActionId(rawActionId);
    if (!actionId) {
      setGameLog((prev) => [`⚠️ 不正な操作が検出されたため無視しました。`, ...prev]);
      return;
    }

    const action = mockGameState.actions.find((item) => item.id === actionId);
    if (!action) {
      setGameLog((prev) => [`⚠️ 操作の解決に失敗しました。`, ...prev]);
      return;
    }

    const now = new Date();
    const timeLabel = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    setGameLog((prev) => [`${timeLabel} 采配: ${action.label}`, ...prev]);
  };

  return (
    <section className="card" style={{ display: 'grid', gap: 12 }}>
      <div className="card-h">試合（重要場面采配）</div>

      <div className="game-action-layout">
        <div className="card2 game-score-card">
          <strong>{mockGameState.scoreboard.awayTeam} {mockGameState.scoreboard.awayScore} - {mockGameState.scoreboard.homeScore} {mockGameState.scoreboard.homeTeam}</strong>
          <span className="chip cb">{mockGameState.scoreboard.inningLabel}</span>
        </div>

        <div className="card2 game-count-card">
          <div className="game-count-chips">
            <span className="chip cb">B {mockGameState.count.balls}</span>
            <span className="chip cb">S {mockGameState.count.strikes}</span>
            <span className="chip cb">O {mockGameState.count.outs}</span>
          </div>
          <div className="game-runner-chips">
            <span className={`chip ${mockGameState.runners.first ? 'cg' : 'cb'}`}>一塁</span>
            <span className={`chip ${mockGameState.runners.second ? 'cg' : 'cb'}`}>二塁</span>
            <span className={`chip ${mockGameState.runners.third ? 'cg' : 'cb'}`}>三塁</span>
          </div>
        </div>

        <div className="card2 game-actions-card">
          {mockGameState.actions.map((action) => (
            <button
              key={action.id}
              type="button"
              className="sim-btn"
              style={{ margin: 0, minHeight: 44 }}
              onClick={() => handleActionClick(action.id)}
            >
              {action.label}
            </button>
          ))}
        </div>

        <div className="card2 game-matchup-card">
          <div>打者: {mockGameState.matchup.batter} vs 投手: {mockGameState.matchup.pitcher}</div>
          <div style={{ color: riskTone.color, fontWeight: 700 }}>危険度: {riskTone.label}</div>
          <div style={{ color: '#94a3b8', fontSize: 12 }}>{mockGameState.matchup.advice}</div>
        </div>

        <div className="card2 game-field-card">
          <div style={{ fontWeight: 700 }}>塁状況</div>
          <MiniField runners={mockGameState.runners} />
        </div>

        <div className="card2 game-log-card">
          <div style={{ fontWeight: 700 }}>試合ログ</div>
          <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
            {gameLog.slice(0, 8).map((item, index) => (
              <li key={`${item}-${index}`} style={{ fontSize: 12, color: '#cbd5e1' }}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
