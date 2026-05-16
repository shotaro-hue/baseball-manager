import { mockDashboard } from '../../data/mockDashboard';

const toneClassByName = {
  good: 'cg',
  warning: 'cy',
  danger: 'cr',
  neutral: 'cb',
};

export function TodayGameCard({ todayGame, gameDay, onGoGame }) {
  if (!todayGame || !todayGame.date || !todayGame.opponent) {
    return (
      <div className="card">
        <div className="card-h">Today's Game</div>
        <div style={{ color: '#94a3b8' }}>No scheduled game is available.</div>
      </div>
    );
  }

  return (
    <div className="card dashboard-order-game">
      <div className="card-h">Today's Game</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 30 }}>{todayGame.opponent.emoji || 'VS'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, overflowWrap: 'anywhere' }}>{todayGame.opponent.name}</div>
          <div style={{ color: '#94a3b8', fontSize: 11 }}>
            {todayGame.date.month}/{todayGame.date.day} Game {gameDay + 1}
          </div>
        </div>
        <span className={`chip ${todayGame.isHome ? 'cg' : 'cb'}`}>{todayGame.isHome ? 'Home' : 'Away'}</span>
      </div>
      <button className="sim-btn" onClick={onGoGame} style={{ marginTop: 12, marginBottom: 0, minHeight: 44 }}>
        Open
      </button>
    </div>
  );
}

export function RecommendationCard({ items, onTabSwitch }) {
  return (
    <div className="card dashboard-order-recommendation">
      <div className="card-h">Recommendations</div>
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
      <div className="card-h">Team Status</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <span className={`chip ${runDiff >= 20 ? 'cg' : runDiff <= -20 ? 'cr' : 'cy'}`}>Run Diff {runDiff >= 0 ? '+' : ''}{runDiff}</span>
        <span className={`chip ${recentWins >= recentLosses ? 'cg' : 'cr'}`}>Recent {recentWins}-{recentLosses}</span>
        <span className={`chip ${winPct >= '.550' ? 'cg' : winPct < '.450' ? 'cr' : 'cb'}`}>Win% {winPct}</span>
        <span className="chip cb">Budget {budgetLabel}</span>
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
  const safeRpg = Number.isFinite(rpg) ? rpg : 0;
  const safeRapg = Number.isFinite(rapg) ? rapg : 0;

  return (
    <div className="g2 dashboard-order-kpi">
      <div className="card stat-tile"><div className="stat-tile-lbl">Rank</div><div className="stat-tile-val">{rank}</div></div>
      <div className="card stat-tile"><div className="stat-tile-lbl">Record</div><div className="stat-tile-val">{wins}-{losses}</div></div>
      <div className="card stat-tile"><div className="stat-tile-lbl">R/G</div><div className="stat-tile-val">{safeRpg.toFixed(2)}</div></div>
      <div className="card stat-tile"><div className="stat-tile-lbl">RA/G</div><div className="stat-tile-val">{safeRapg.toFixed(2)}</div></div>
    </div>
  );
}

export function FeaturedPlayersCard({ players }) {
  const safePlayers = Array.isArray(players) ? players.filter(Boolean) : [];

  return (
    <div className="card dashboard-order-featured">
      <div className="card-h">Featured Players</div>
      <div style={{ display: 'grid', gap: 8 }}>
        {safePlayers.map((p) => (
          <div key={p.id} className="card2" style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ overflowWrap: 'anywhere' }}>{p.name} ({p.pos})</span>
            <span className="mono">WAR {Number(p.war ?? 0).toFixed(1)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
