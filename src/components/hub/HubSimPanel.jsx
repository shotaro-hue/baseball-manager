import { useMemo, useState } from 'react';
import { gameDayToDate } from '../../utils';
import { SEASON_GAMES } from '../../constants';

export default function HubSimPanel({
  gameDay,
  schedule,
  remain,
  batchProgress,
  onStartGame,
  onBatchSim,
  onSeasonSim,
}) {
  const [batchCount, setBatchCount] = useState(5);
  const [batchAutoManage, setBatchAutoManage] = useState(false);
  const [seasonAutoManage, setSeasonAutoManage] = useState(false);

  const options = useMemo(() => {
    const next = [];
    for (let i = 5; i <= remain; i += 5) next.push(i);
    if (next.length === 0) next.push(Math.max(1, remain));
    return next;
  }, [remain]);

  const effectiveBatchCount = options.includes(batchCount)
    ? batchCount
    : options[0];
  const startDate = gameDayToDate(gameDay, schedule);
  const endDate = gameDayToDate(
    Math.min(gameDay + effectiveBatchCount - 1, SEASON_GAMES),
    schedule,
  );

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gap: 8,
        marginBottom: 10,
      }}
    >
      <button
        className="sim-btn"
        style={{ margin: 0, fontSize: 12 }}
        onClick={onStartGame}
      >
        1試合
        <br />
        <span style={{ fontSize: 9, opacity: 0.7 }}>
          {startDate ? `${startDate.month}/${startDate.day}` : '-'}
        </span>
      </button>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 5,
          background: 'linear-gradient(135deg,#071a2c,#0d2840)',
          border: '1px solid rgba(96,165,250,.5)',
          borderRadius: 10,
          padding: '8px 6px',
        }}
      >
        <select
          value={effectiveBatchCount}
          onChange={(event) => setBatchCount(Number(event.target.value))}
          style={{
            width: '100%',
            background: 'rgba(15,23,42,.9)',
            border: '1px solid rgba(96,165,250,.4)',
            color: '#93c5fd',
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 700,
            padding: '3px 4px',
            fontFamily: "'Share Tech Mono',monospace",
            cursor: 'pointer',
          }}
        >
          {options.map((count) => {
            const date = gameDayToDate(
              Math.min(gameDay + count - 1, SEASON_GAMES),
              schedule,
            );
            return (
              <option key={count} value={count}>
                {count}試合{date ? ` (${date.month}/${date.day})` : ''}
              </option>
            );
          })}
        </select>

        {startDate && endDate && (
          <div style={{ fontSize: 9, color: '#7dd3fc' }}>
            {startDate.month}/{startDate.day} - {endDate.month}/{endDate.day}
          </div>
        )}

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 9,
            color: batchAutoManage ? '#34d399' : '#475569',
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          <input
            type="checkbox"
            checked={batchAutoManage}
            onChange={(event) => setBatchAutoManage(event.target.checked)}
            style={{ accentColor: '#34d399', cursor: 'pointer' }}
          />
          自動編成も実行
        </label>

        <button
          style={{
            background: 'transparent',
            border: 'none',
            color: '#60a5fa',
            fontSize: 11,
            cursor: batchProgress ? 'not-allowed' : 'pointer',
            padding: '2px 4px',
            fontFamily: "'Bebas Neue',cursive",
            letterSpacing: '.15em',
            opacity: batchProgress ? 0.5 : 1,
          }}
          disabled={!!batchProgress}
          onClick={() => onBatchSim(effectiveBatchCount, batchAutoManage)}
        >
          まとめてシム
        </button>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 5,
          background: 'linear-gradient(135deg,#1a0730,#2d0f50)',
          border: '1px solid rgba(167,139,250,.5)',
          borderRadius: 10,
          padding: '8px 6px',
        }}
      >
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 9,
            color: seasonAutoManage ? '#c4b5fd' : '#6b7280',
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          <input
            type="checkbox"
            checked={seasonAutoManage}
            onChange={(event) => setSeasonAutoManage(event.target.checked)}
            style={{ accentColor: '#a78bfa', cursor: 'pointer' }}
          />
          自動編成も実行
        </label>
        <button
          className="sim-btn"
          style={{
            margin: 0,
            fontSize: 12,
            width: '100%',
            background: 'transparent',
            border: 'none',
            boxShadow: 'none',
            color: '#a78bfa',
            padding: '2px 4px',
            opacity: batchProgress ? 0.5 : 1,
          }}
          disabled={!!batchProgress}
          onClick={() => onSeasonSim(seasonAutoManage)}
        >
          残り全{remain}試合
        </button>
      </div>
    </div>
  );
}
