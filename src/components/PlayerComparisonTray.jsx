import '../mobile-flow.css';
import '../calm-club.css';
import { useResultDialog } from './useResultDialog';
import { saberBatter, saberPitcher } from '../engine/sabermetrics';
import { fmtAvg, fmtIP, fmtSal } from '../utils';

const missing = '---';
const recorded = (stats, keys) => keys.every(key => Number.isFinite(stats?.[key]));
const value = n => Number.isFinite(n) ? n : missing;

function playerMetrics(player) {
  const s = player.stats || {};
  const profile = s.battedBallProfile || {};
  const metrics = [
    ['年齢', player.age == null ? missing : `${player.age}歳`],
    ['ポジション', player.pos ?? missing],
    ['年俸', player.salary == null ? missing : fmtSal(player.salary)],
    ['コンディション', value(player.condition)],
    ['モラル', value(player.morale)],
  ];
  if (player.isPitcher) {
    const pitching = saberPitcher(s);
    return [...metrics,
      ['防御率', s.IP > 0 && recorded(s, ['ER']) ? pitching.ERA.toFixed(2) : missing],
      ['投球回', recorded(s, ['IP']) ? fmtIP(s.IP) : missing],
      ['WHIP', s.IP > 0 && recorded(s, ['Hp', 'BBp']) ? pitching.WHIP.toFixed(2) : missing],
      ['球速', player.pitching?.velocity == null ? missing : `${player.pitching.velocity} km/h`],
      ['制球', value(player.pitching?.control)],
    ];
  }
  const batting = saberBatter(s);
  return [...metrics,
    ['打率', s.AB > 0 && recorded(s, ['H']) ? fmtAvg(s.H, s.AB) : missing],
    ['OPS', s.AB > 0 && recorded(s, ['H', 'AB', 'D', 'T', 'HR', 'BB', 'HBP', 'SF']) ? batting.OPS.toFixed(3) : missing],
    ['本塁打', value(s.HR)],
    ['平均打球速度', profile.evN > 0 && recorded(profile, ['evSum']) ? `${(profile.evSum / profile.evN).toFixed(1)} km/h` : missing],
    ['強打球率', profile.bip > 0 && recorded(profile, ['hardHit']) ? `${(profile.hardHit / profile.bip * 100).toFixed(1)}%` : missing],
    ['対象打球', value(profile.bip)],
    ['ミート', value(player.batting?.contact)],
    ['守備', value(player.batting?.defense)],
  ];
}

export function compareRows(left, right) {
  const l = new Map(playerMetrics(left));
  const r = new Map(playerMetrics(right));
  // Mixed pitcher/batter comparisons retain each role's meaningful measures.
  const labels = [...new Set([...l.keys(), ...r.keys()])];
  const war = player => {
    const s = player.stats;
    const keys = player.isPitcher ? ['IP', 'HRp', 'BBp', 'HBPp', 'Kp'] : ['PA', 'AB', 'H', 'D', 'T', 'HR', 'BB', 'HBP', 'SF'];
    const sample = player.isPitcher ? s?.IP : s?.PA;
    if (!(sample > 0) || !recorded(s, keys)) return missing;
    return value((player.isPitcher ? saberPitcher(s) : saberBatter(s)).WAR);
  };
  return [...labels.map(label => [label, l.get(label) ?? missing, r.get(label) ?? missing]),
    ['今季 WAR', war(left), war(right)]];
}

export function PlayerComparisonDialog({ players, onRemove, onClose }) {
  const enabled = Array.isArray(players) && players.length === 2;
  const dialogRef = useResultDialog(onClose, enabled);
  if (!enabled) return null;
  const [left, right] = players;
  return (
    <div className="player-compare-overlay" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialogRef} className="player-compare-dialog calm-detail" role="dialog" aria-modal="true" aria-labelledby="player-compare-title">
        <div className="player-compare-header">
          <div>
            <h2 id="player-compare-title">選手比較</h2>
            <p>同じ指標を横並びで確認。--- は未記録・算出不可・対象外です。</p>
          </div>
          <button type="button" onClick={onClose} aria-label="選手比較を閉じる">✕</button>
        </div>
        <div className="player-compare-names">
          {[left, right].map((player) => (
            <div key={player.id}>
              <strong>{player.name}</strong>
              <span>{player._teamName || ''}</span>
              <button type="button" onClick={() => onRemove(player.id)} aria-label={`${player.name}を比較から外す`}>比較から外す</button>
            </div>
          ))}
        </div>
        <div className="player-compare-table-wrap" role="region" aria-label="選手比較表" tabIndex={0}>
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
    <aside className="player-compare-tray calm-detail" aria-label="選手比較">
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
