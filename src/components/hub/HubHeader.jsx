import { fmtM, gameDayToDate } from '../../utils';

export default function HubHeader({
  myTeam,
  year,
  gameDay,
  schedule,
  remain,
  onSave,
}) {
  const date = gameDayToDate(gameDay, schedule);

  return (
    <div className="topbar">
      <span style={{ fontSize: 26 }}>{myTeam?.emoji}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: myTeam?.color }}>
          {myTeam?.name}
        </div>
        <div style={{ fontSize: 10, color: '#374151' }}>
          {year}年 {date ? `${date.month}/${date.day}` : '-'} / 第{gameDay}戦 /
          残り{remain}試合
        </div>
      </div>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        <span className="chip cg">{myTeam?.wins}勝</span>
        <span className="chip cr">{myTeam?.losses}敗</span>
        <span className="chip cy">{fmtM(myTeam?.budget || 0)}</span>
      </div>
      <div className="tb-record">
        {myTeam?.wins}勝{myTeam?.losses}敗
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
