import { mockDashboard } from '../../data/mockDashboard';

const toneClassByName = {
  good: 'cg',
  warning: 'cy',
  danger: 'cr',
  neutral: 'cb',
};

export function TodayGameCard({ todayGame, gameDay, onGoGame }) {
  if (!todayGame) {
    return (
      <div className="card">
        <div className="card-h">今日の試合</div>
        <div style={{ color: '#94a3b8' }}>本日の試合はありません</div>
      </div>
    );
  }

  return (
    <div className="card dashboard-order-game">
      <div className="card-h">今日の試合</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 30 }}>{todayGame.opponent?.emoji || '⚾'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, overflowWrap: 'anywhere' }}>{todayGame.opponent?.name || '未定'}</div>
          <div style={{ color: '#94a3b8', fontSize: 11 }}>
            {todayGame.date.month}月{todayGame.date.day}日（第{gameDay + 1}戦）
          </div>
        </div>
        <span className={`chip ${todayGame.isHome ? 'cg' : 'cb'}`}>{todayGame.isHome ? 'ホーム' : 'アウェイ'}</span>
      </div>
      <button className="sim-btn" onClick={onGoGame} style={{ marginTop: 12, marginBottom: 0, minHeight: 44 }}>試合へ</button>
    </div>
  );
}

export function RecommendationCard({ items, onTabSwitch }) {
  return (
    <div className="card dashboard-order-recommendation">
      <div className="card-h">今日のおすすめ采配</div>
      <div style={{ display: 'grid', gap: 8 }}>
        {items.map((item, idx) => (
          <button
            key={`${item.title}-${idx}`}
            onClick={() => onTabSwitch(item.tab)}
            className="action-item"
            style={{ borderLeftColor: item.tone === 'danger' ? '#f87171' : item.tone === 'warning' ? '#f5c842' : '#34d399' }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{item.title}</div>
              <div style={{ fontSize: 11, color: '#94a3b8', overflowWrap: 'anywhere' }}>{item.reason}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export function TeamConditionCard({ runDiff, recentWins, recentLosses, winPct, budgetLabel }) {
  return (
    <div className="card dashboard-order-condition">
      <div className="card-h">チーム状態</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <span className={`chip ${runDiff >= 20 ? 'cg' : runDiff <= -20 ? 'cr' : 'cy'}`}>得失差 {runDiff >= 0 ? '+' : ''}{runDiff}</span>
        <span className={`chip ${recentWins >= recentLosses ? 'cg' : 'cr'}`}>直近成績 {recentWins}勝{recentLosses}敗</span>
        <span className={`chip ${winPct >= '.550' ? 'cg' : winPct < '.450' ? 'cr' : 'cb'}`}>勝率 {winPct}</span>
        <span className="chip cb">予算 {budgetLabel}</span>
        {mockDashboard.teamConditions.map((condition) => (
          <span key={condition.label} className={`chip ${toneClassByName[condition.tone] || 'cb'}`} title={condition.description || ''}>
            {condition.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function DashboardKpiGrid({ rank, wins, losses, rpg, rapg }) {
  return (
    <div className="g2 dashboard-order-kpi">
      <div className="card stat-tile"><div className="stat-tile-lbl">順位</div><div className="stat-tile-val">{rank}位</div></div>
      <div className="card stat-tile"><div className="stat-tile-lbl">勝敗</div><div className="stat-tile-val">{wins}-{losses}</div></div>
      <div className="card stat-tile"><div className="stat-tile-lbl">得点 R/G</div><div className="stat-tile-val">{rpg.toFixed(2)}</div></div>
      <div className="card stat-tile"><div className="stat-tile-lbl">失点 RA/G</div><div className="stat-tile-val">{rapg.toFixed(2)}</div></div>
    </div>
  );
}

export function FeaturedPlayersCard({ players }) {
  return (
    <div className="card dashboard-order-featured">
      <div className="card-h">注目選手</div>
      <div style={{ display: 'grid', gap: 8 }}>
        {players.map((p) => (
          <div key={p.id} className="card2" style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ overflowWrap: 'anywhere' }}>{p.name}（{p.pos}）</span>
            <span className="mono">WAR {((p.war ?? 0)).toFixed(1)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
