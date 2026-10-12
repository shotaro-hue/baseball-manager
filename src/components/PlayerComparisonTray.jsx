import { useCallback, useRef } from 'react';
import '../mobile-flow.css';
import '../calm-club.css';
import { useResultDialog } from './useResultDialog';
import { Button, DataTableFrame } from './design-system/primitives';
import { detailNumber, detailSalary, detailRate, detailInnings, detailProfileRate, detailWar, detailMissing, firstTeamScope, playerMembership, currentComparisonPlayers } from './playerDetailMetrics';
import './player-detail.css';

function playerMetrics(player) {
  const s = player.stats || {}, profile = s.battedBallProfile || {};
  const metrics = [
    ['年齢', Number.isFinite(player.age) ? `${player.age}歳` : detailMissing('未記録')],
    ['ポジション', player.pos ?? detailMissing('未記録')], ['年俸', detailSalary(player.salary)],
    ['コンディション', detailNumber(player.condition)], ['モラル', detailNumber(player.morale)],
  ];
  if (player.isPitcher) return [...metrics,
    ['防御率', detailRate(s, 'ERA')], ['投球回', detailInnings(s.IP)], ['WHIP', detailRate(s, 'WHIP')],
    ['球速', detailNumber(player.pitching?.velocity)], ['制球', detailNumber(player.pitching?.control)],
  ];
  return [...metrics,
    ['打率', detailRate(s, 'AVG')], ['OPS', detailRate(s, 'OPS')], ['本塁打', detailNumber(s.HR)],
    ['平均打球速度', detailProfileRate(profile, 'evSum', 'evN')],
    ['強打球率', detailProfileRate(profile, 'hardHit', 'bip', true)], ['対象打球', detailNumber(profile.bip)],
    ['ミート', detailNumber(player.batting?.contact)], ['守備', detailNumber(player.batting?.defense)],
  ];
}

export function compareRows(left, right) {
  const l = new Map(playerMetrics(left)), r = new Map(playerMetrics(right));
  const labels = [...new Set([...l.keys(), ...r.keys()])];
  return [...labels.map(label => [label, l.get(label) ?? detailMissing('対象外'), r.get(label) ?? detailMissing('対象外')]),
    ['今季 WAR', detailWar(left), detailWar(right)]];
}

export function PlayerComparisonDialog({ players, year, teams, faPool, onRemove, onClose }) {
  const enabled = Array.isArray(players) && players.length === 2;
  const closeRef = useRef(onClose); closeRef.current = onClose;
  const closeDialog = useCallback(() => closeRef.current?.(), []);
  const dialogRef = useResultDialog(closeDialog, enabled);
  if (!enabled) return null;
  const [left, right] = currentComparisonPlayers(players, teams, faPool);
  return (
    <div className="player-compare-overlay" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialogRef} className="player-compare-dialog calm-detail player-comparison-ui" data-ds="player-comparison" role="dialog" aria-modal="true" aria-labelledby="player-compare-title">
        <div className="player-compare-header">
          <div>
            <h2 id="player-compare-title">選手比較</h2>
            <p>{firstTeamScope(year)}。二軍成績は合算しません。</p>
          </div>
          <Button variant="secondary" onClick={onClose} aria-label="選手比較を閉じる">✕</Button>
        </div>
        <div className="player-compare-names">
          {[left, right].map((player) => (
            <div key={player.id}>
              <strong>{player.name}</strong>
              <span>{player._teamName || '球団未記録'} · {playerMembership(player, teams)} · {player.pos || '役割未記録'}</span>
              {(player.injuryDaysLeft ?? 0) > 0 && <span className="player-injury">負傷中 · 残{player.injuryDaysLeft}試合</span>}
              {player._comparisonSnapshot && <span>現所属を再確認できないため、選択時点の情報を表示</span>}
              <Button variant="secondary" onClick={() => onRemove(player.id)} aria-label={`${player.name}を比較から外す`}>比較から外す</Button>
            </div>
          ))}
        </div>
        <p className="player-record-note">未記録・分母0の算出不可・対象外を区別。球速／制球／ミート／守備はゲーム内能力値です。</p>
        <DataTableFrame className="player-compare-table-wrap" label="選手比較表">
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
                  <th scope="row">{label}</th>
                  <td data-number className="mono">{leftValue}</td>
                  <td data-number className="mono">{rightValue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTableFrame>
        <div className="player-compare-return"><Button variant="secondary" onClick={onClose}>元の画面に戻る</Button></div>
      </div>
    </div>
  );
}

export function PlayerComparisonTray({ players, onRemove, onClear, onOpen }) {
  if (!Array.isArray(players) || players.length === 0) return null;
  return (
    <aside className="player-compare-tray calm-detail player-comparison-ui" data-ds="player-comparison" aria-label="選手比較">
      <div className="player-compare-tray-title">比較 {players.length}/2{players.length === 1 && <span>もう1人を追加</span>}</div>
      <div className="player-compare-tray-list">
        {players.map((player) => (
          <span key={player.id}>
            {player.name}
            <Button variant="secondary" onClick={() => onRemove(player.id)} aria-label={`${player.name}を比較から外す`}>✕</Button>
          </span>
        ))}
      </div>
      <Button disabled={players.length !== 2} onClick={onOpen}>
        2人を比較
      </Button>
      <Button variant="secondary" onClick={onClear}>クリア</Button>
    </aside>
  );
}
