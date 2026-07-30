import { saberBatter, saberPitcher } from '../engine/sabermetrics';
import { fmtAvg, fmtIP, fmtSal } from '../utils';

function battedBallRows(player) {
  const profile = player?.stats?.battedBallProfile || {};
  const bip = Number(profile.bip) || 0;
  return [
    ['平均打球速度', Number(profile.evN) > 0 ? `${(Number(profile.evSum) / Number(profile.evN)).toFixed(1)} km/h` : '---'],
    ['強打球率', bip > 0 ? `${((Number(profile.hardHit || 0) / bip) * 100).toFixed(1)}%` : '---'],
    ['対象打球', bip ? `${bip}` : '---'],
  ];
}

function compareRows(left, right) {
  const common = [
    ['年齢', `${left.age}歳`, `${right.age}歳`],
    ['ポジション', left.pos, right.pos],
    ['年俸', fmtSal(left.salary || 0), fmtSal(right.salary || 0)],
    ['コンディション', left.condition ?? 70, right.condition ?? 70],
    ['モラル', left.morale ?? 70, right.morale ?? 70],
  ];
  if (left.isPitcher && right.isPitcher) {
    const l = saberPitcher(left.stats || {});
    const r = saberPitcher(right.stats || {});
    return [
      ...common,
      ['防御率', l.ERA ? l.ERA.toFixed(2) : '---', r.ERA ? r.ERA.toFixed(2) : '---'],
      ['投球回', left.stats?.IP ? fmtIP(left.stats.IP) : '---', right.stats?.IP ? fmtIP(right.stats.IP) : '---'],
      ['WHIP', l.WHIP || '---', r.WHIP || '---'],
      ['球速', left.pitching?.velocity ?? '---', right.pitching?.velocity ?? '---'],
      ['制球', left.pitching?.control ?? '---', right.pitching?.control ?? '---'],
    ];
  }
  if (!left.isPitcher && !right.isPitcher) {
    const l = saberBatter(left.stats || {});
    const r = saberBatter(right.stats || {});
    const lBatted = Object.fromEntries(battedBallRows(left));
    const rBatted = Object.fromEntries(battedBallRows(right));
    return [
      ...common,
      ['打率', fmtAvg(left.stats?.H || 0, left.stats?.AB || 0), fmtAvg(right.stats?.H || 0, right.stats?.AB || 0)],
      ['OPS', l.OPS ? l.OPS.toFixed(3) : '---', r.OPS ? r.OPS.toFixed(3) : '---'],
      ['本塁打', left.stats?.HR || 0, right.stats?.HR || 0],
      ['平均打球速度', lBatted['平均打球速度'], rBatted['平均打球速度']],
      ['強打球率', lBatted['強打球率'], rBatted['強打球率']],
      ['守備', left.batting?.defense ?? '---', right.batting?.defense ?? '---'],
    ];
  }
  return [
    ...common,
    ['今季 WAR', left.isPitcher ? saberPitcher(left.stats || {}).WAR : saberBatter(left.stats || {}).WAR,
      right.isPitcher ? saberPitcher(right.stats || {}).WAR : saberBatter(right.stats || {}).WAR],
    ['主能力', left.isPitcher ? left.pitching?.velocity : left.batting?.contact,
      right.isPitcher ? right.pitching?.velocity : right.batting?.contact],
  ];
}

export function PlayerComparisonDialog({ players, onRemove, onClose }) {
  if (!Array.isArray(players) || players.length !== 2) return null;
  const [left, right] = players;
  return (
    <div className="player-compare-overlay" role="dialog" aria-modal="true" aria-labelledby="player-compare-title">
      <div className="player-compare-dialog">
        <div className="player-compare-header">
          <div>
            <h2 id="player-compare-title">選手比較</h2>
            <p>同じ指標を横並びで確認します。</p>
          </div>
          <button type="button" onClick={onClose} aria-label="選手比較を閉じる">✕</button>
        </div>
        <div className="player-compare-names">
          {[left, right].map((player) => (
            <div key={player.id}>
              <strong>{player.name}</strong>
              <span>{player._teamName || ''}</span>
              <button type="button" onClick={() => onRemove(player.id)}>比較から外す</button>
            </div>
          ))}
        </div>
        <div className="player-compare-table-wrap">
          <table className="tbl player-compare-table">
            <thead>
              <tr>
                <th>指標</th>
                <th>{left.name}</th>
                <th>{right.name}</th>
              </tr>
            </thead>
            <tbody>
              {compareRows(left, right).map(([label, leftValue, rightValue]) => (
                <tr key={label}>
                  <td>{label}</td>
                  <td className="mono">{leftValue}</td>
                  <td className="mono">{rightValue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function PlayerComparisonTray({ players, onRemove, onClear, onOpen }) {
  if (!Array.isArray(players) || players.length === 0) return null;
  return (
    <aside className="player-compare-tray" aria-label="選手比較">
      <div className="player-compare-tray-title">比較 {players.length}/2</div>
      <div className="player-compare-tray-list">
        {players.map((player) => (
          <span key={player.id}>
            {player.name}
            <button type="button" onClick={() => onRemove(player.id)} aria-label={`${player.name}を比較から外す`}>✕</button>
          </span>
        ))}
      </div>
      <button type="button" className="bsm bgb" disabled={players.length !== 2} onClick={onOpen}>
        2人を比較
      </button>
      <button type="button" className="bsm bga" onClick={onClear}>クリア</button>
    </aside>
  );
}
