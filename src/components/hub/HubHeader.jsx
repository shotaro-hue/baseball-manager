import { regularSeasonProgress } from '../../engine/seasonProgress';
import { Button, StateLabel } from '../design-system/primitives';
import { fmtM, gameDayToDate } from '../../utils';

export default function HubHeader({
  myTeam,
  year,
  gameDay,
  schedule,
  remain,
  onSave,
  home = false, saveDirty = false, saveQueueState = {}, saveResult = null,
}) {
  const date = Number.isSafeInteger(gameDay) && gameDay >= 1 && (!home || schedule?.[gameDay]) ? gameDayToDate(gameDay, schedule) : null;
  const valid = regularSeasonProgress(myTeam).valid;
  const wins = valid ? myTeam.wins : '—';
  const losses = valid ? myTeam.losses : '—';
  const draws = valid ? (myTeam.draws ?? 0) : '—';

  if (home) {
    const saving = saveQueueState.isSaving || saveQueueState.hasQueuedSave;
    const partial = saveResult?.archive?.ok === false || saveResult?.warnings?.length > 0;
    const label = saving ? '保存中' : saveResult?.ok === false ? '保存失敗' : saveDirty ? '保存待ち' : saveResult?.ok === true ? saveResult.archive?.ok === false ? '保存済み・一部履歴は要確認' : partial ? '保存済み・保存情報は要確認' : '保存済み' : '保存状態未確認';
    const tone = saving ? 'processing' : saveResult?.ok === false ? 'danger' : saveDirty || partial ? 'warning' : saveResult?.ok === true ? 'success' : 'neutral';
    return <header className="topbar home-header" data-ds="home-header">
      <div><span className="home-brand">BASEBALL MANAGER</span><strong>{myTeam?.name}</strong><p>{year}年 · {date ? `${date.month}/${date.day}` : '日程なし'} · 第{Number.isSafeInteger(gameDay) ? gameDay : '—'}戦 · 残り{remain}試合 · {wins}勝{losses}敗{draws}分</p></div>
      <div className="home-save"><StateLabel tone={tone}>{label}</StateLabel><Button variant="secondary" onClick={onSave} disabled={Boolean(saving)}>保存</Button></div>
    </header>;
  }

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
