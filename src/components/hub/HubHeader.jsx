import { regularSeasonProgress } from '../../engine/seasonProgress';
import { fmtM, gameDayToDate } from '../../utils';

export default function HubHeader({
  myTeam,
  year,
  gameDay,
  schedule,
  remain,
  onSave,
}) {
  const date = Number.isSafeInteger(gameDay) && gameDay >= 1 ? gameDayToDate(gameDay, schedule) : null;
  const valid = regularSeasonProgress(myTeam).valid;
  const wins = valid ? myTeam.wins : '—';
  const losses = valid ? myTeam.losses : '—';
  const draws = valid ? (myTeam.draws ?? 0) : '—';

  return (
    <div className="topbar">
      <span style={{ fontSize: 26 }}>{myTeam?.emoji}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: myTeam?.color }}>
          {myTeam?.name}
        </div>
        <div style={{ fontSize: 10, color: '#374151' }}>
          {year}年 {date ? `${date.month}/${date.day}` : '-'} / 第{Number.isSafeInteger(gameDay) ? gameDay : '—'}戦 /
          残り{remain}試合
        </div>
      </div>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        <span className="chip cg">{wins}勝</span>
        <span className="chip cr">{losses}敗</span>
        <span className="chip">{draws}分</span>
        <span className="chip cy">{fmtM(myTeam?.budget || 0)}</span>
      </div>
      <div className="tb-record">
        {wins}勝{losses}敗{draws}分
      </div>
      <button
        style={{
          background: 'rgba(74,222,128,.1)',
          border: '1px solid rgba(74,222,128,.4)',
          color: '#4ade80',
          borderRadius: 6,
          padding: '4px 10px',
          fontSize: 11,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
        onClick={onSave}
      >
        保存
      </button>
    </div>
  );
}
