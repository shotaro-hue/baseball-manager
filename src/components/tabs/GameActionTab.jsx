import { useMemo, useState } from 'react';
import { mockGameState } from '../../data/mockGame';

const riskToneMap = {
  low: { label: '低', color: '#34d399' },
  medium: { label: '中', color: '#f5c842' },
  high: { label: '高', color: '#f87171' },
};

function getSafeGameState(rawState) {
  // ⚠️ セキュリティ: 外部入力由来の可能性を考慮し、型検証【＝期待した型か確認】してから利用する
  const safeState = rawState && typeof rawState === 'object' ? rawState : {};

  const safeActions = Array.isArray(safeState.actions)
    ? safeState.actions
        .filter((action) => action && typeof action.id === 'string' && typeof action.label === 'string')
        .map((action) => ({ id: action.id.trim(), label: action.label.trim() }))
        .filter((action) => action.id.length > 0 && action.label.length > 0)
    : [];

  const scoreboard = safeState.scoreboard && typeof safeState.scoreboard === 'object' ? safeState.scoreboard : {};
  const count = safeState.count && typeof safeState.count === 'object' ? safeState.count : {};
  const runners = safeState.runners && typeof safeState.runners === 'object' ? safeState.runners : {};
  const matchup = safeState.matchup && typeof safeState.matchup === 'object' ? safeState.matchup : {};

  return {
    actions: safeActions,
    scoreboard: {
      awayTeam: typeof scoreboard.awayTeam === 'string' ? scoreboard.awayTeam : null,
      awayScore: Number.isFinite(scoreboard.awayScore) ? scoreboard.awayScore : null,
      homeScore: Number.isFinite(scoreboard.homeScore) ? scoreboard.homeScore : null,
      homeTeam: typeof scoreboard.homeTeam === 'string' ? scoreboard.homeTeam : null,
      inningLabel: typeof scoreboard.inningLabel === 'string' ? scoreboard.inningLabel : null,
    },
    count: {
      balls: Number.isFinite(count.balls) ? count.balls : null,
      strikes: Number.isFinite(count.strikes) ? count.strikes : null,
      outs: Number.isFinite(count.outs) ? count.outs : null,
    },
    runners: {
      first: Boolean(runners.first),
      second: Boolean(runners.second),
      third: Boolean(runners.third),
    },
    matchup: {
      batter: typeof matchup.batter === 'string' ? matchup.batter : null,
      pitcher: typeof matchup.pitcher === 'string' ? matchup.pitcher : null,
      riskLevel: typeof matchup.riskLevel === 'string' ? matchup.riskLevel : null,
      advice: typeof matchup.advice === 'string' ? matchup.advice : null,
    },
  };
}

function sanitizeActionId(rawActionId, safeActions) {
  // ⚠️ セキュリティ: UIイベント値を文字列化し、許可済みIDのみ処理する
  const actionId = String(rawActionId || '').trim();
  const allowedActionIds = new Set(safeActions.map((action) => action.id));
  return allowedActionIds.has(actionId) ? actionId : null;
}

export function GameActionTab({ onOpenTactical }) {
  const safeGameState = useMemo(() => getSafeGameState(mockGameState), []);
  const [gameLog, setGameLog] = useState(['試合開始: 7回裏 1アウト 一・三塁']);

  const riskTone = useMemo(() => riskToneMap[safeGameState.matchup.riskLevel] || riskToneMap.medium, [safeGameState.matchup.riskLevel]);

  const hasScorePreview = Boolean(
    safeGameState.scoreboard.awayTeam &&
      safeGameState.scoreboard.homeTeam &&
      Number.isFinite(safeGameState.scoreboard.awayScore) &&
      Number.isFinite(safeGameState.scoreboard.homeScore)
  );

  const hasCountPreview = Number.isFinite(safeGameState.count.balls) && Number.isFinite(safeGameState.count.strikes) && Number.isFinite(safeGameState.count.outs);

  const hasMatchupPreview = Boolean(safeGameState.matchup.batter && safeGameState.matchup.pitcher);

  const handleActionClick = (rawActionId) => {
    const actionId = sanitizeActionId(rawActionId, safeGameState.actions);
    if (!actionId) {
      setGameLog((prev) => ['⚠️ 不正な操作が検出されたため無視しました。', ...prev]);
      return;
    }

    const action = safeGameState.actions.find((item) => item.id === actionId);
    if (!action) {
      setGameLog((prev) => ['⚠️ 操作の解決に失敗しました。', ...prev]);
      return;
    }

    const now = new Date();
    const timeLabel = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    setGameLog((prev) => [`${timeLabel} ショートカット実行: ${action.label}`, ...prev]);
  };

  return (
    <section className="card" style={{ display: 'grid', gap: 12 }}>
      <div className="card-h" style={{ display: 'grid', gap: 6 }}>
        <strong>試合アクション（本命画面は TacticalGameScreen）</strong>
        <span style={{ color: '#94a3b8', fontSize: 12 }}>
          このタブは TacticalGameScreen【＝試合本編の操作画面】へ移動するための導線と、試合プレビュー【＝概要表示】・ショートカット【＝簡易操作】を補助表示します。
        </span>
      </div>

      <div className="card2" style={{ display: 'grid', gap: 8 }}>
        <button
          type="button"
          className="bsm bga"
          style={{ minHeight: 46, fontWeight: 700 }}
          onClick={() => {
            if (typeof onOpenTactical !== 'function') {
              setGameLog((prev) => ['⚠️ TacticalGameScreenへの遷移処理が未設定です。', ...prev]);
              return;
            }
            onOpenTactical();
          }}
        >
          TacticalGameScreenを開く
        </button>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>まずは本命画面へ遷移し、詳細な采配は TacticalGameScreen で実行してください。</span>
      </div>

      <div className="game-action-layout">
        <div className="card2 game-score-card">
          <div style={{ fontWeight: 700, marginBottom: 6 }}>試合プレビュー</div>
          {hasScorePreview ? (
            <>
              <strong>{safeGameState.scoreboard.awayTeam} {safeGameState.scoreboard.awayScore} - {safeGameState.scoreboard.homeScore} {safeGameState.scoreboard.homeTeam}</strong>
              <span className="chip cb">{safeGameState.scoreboard.inningLabel || 'イニング情報なし'}</span>
            </>
          ) : (
            <span style={{ color: '#94a3b8', fontSize: 12 }}>mockデータ未設定のため、スコアプレビューを表示できません。</span>
          )}

          {hasCountPreview ? (
            <div className="game-count-chips" style={{ marginTop: 8 }}>
              <span className="chip cb">B {safeGameState.count.balls}</span>
              <span className="chip cb">S {safeGameState.count.strikes}</span>
              <span className="chip cb">O {safeGameState.count.outs}</span>
            </div>
          ) : (
            <span style={{ color: '#94a3b8', fontSize: 12, marginTop: 8 }}>mockデータ未設定のため、カウント情報を表示できません。</span>
          )}

          {hasMatchupPreview ? (
            <div style={{ marginTop: 8, display: 'grid', gap: 4 }}>
              <div>打者: {safeGameState.matchup.batter} vs 投手: {safeGameState.matchup.pitcher}</div>
              <div style={{ color: riskTone.color, fontWeight: 700 }}>危険度: {riskTone.label}</div>
              <div style={{ color: '#94a3b8', fontSize: 12 }}>{safeGameState.matchup.advice || 'アドバイス情報なし'}</div>
            </div>
          ) : (
            <span style={{ color: '#94a3b8', fontSize: 12, marginTop: 8 }}>mockデータ未設定のため、対戦プレビューを表示できません。</span>
          )}
        </div>

        <div className="card2 game-actions-card">
          <div style={{ fontWeight: 700, marginBottom: 8 }}>ショートカット</div>
          {safeGameState.actions.length > 0 ? (
            safeGameState.actions.map((action) => (
              <button
                key={action.id}
                type="button"
                className="sim-btn"
                style={{ margin: 0, minHeight: 44 }}
                onClick={() => handleActionClick(action.id)}
              >
                {action.label}
              </button>
            ))
          ) : (
            <span style={{ color: '#94a3b8', fontSize: 12 }}>mockデータ未設定のため、ショートカットを表示できません。</span>
          )}
        </div>

        <div className="card2 game-log-card">
          <div style={{ fontWeight: 700 }}>操作ログ</div>
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
