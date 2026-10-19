import { regularSeasonProgress } from '../../engine/seasonProgress';
import { Button, StateLabel } from '../design-system/primitives';
import { gameDayToDate } from '../../utils';
import { Bell, Gear } from '@phosphor-icons/react';

export default function HubHeader({
  myTeam,
  year,
  gameDay,
  schedule,
  remain,
  onSave,
  home = false, saveDirty = false, saveQueueState = {}, saveResult = null,
  notifications = { unread: 0, actionable: 0 }, onNotifications, onSettings,
}) {
  const date = Number.isSafeInteger(gameDay) && gameDay >= 1 && (!home || schedule?.[gameDay]) ? gameDayToDate(gameDay, schedule) : null;
  const valid = regularSeasonProgress(myTeam).valid;
  const wins = valid ? myTeam.wins : '—';
  const losses = valid ? myTeam.losses : '—';
  const draws = valid ? (myTeam.draws ?? 0) : '—';

    const saving = saveQueueState.isSaving || saveQueueState.hasQueuedSave;
    const partial = saveResult?.archive?.ok === false || saveResult?.warnings?.length > 0;
    const label = saving ? '保存中' : saveResult?.ok === false ? '保存失敗' : saveDirty ? '保存待ち' : saveResult?.ok === true ? saveResult.archive?.ok === false ? '保存済み・一部履歴は要確認' : partial ? '保存済み・保存情報は要確認' : '保存済み' : '保存状態未確認';
    const tone = saving ? 'processing' : saveResult?.ok === false ? 'danger' : saveDirty || partial ? 'warning' : saveResult?.ok === true ? 'success' : 'neutral';
    return <header className="topbar home-header hub-common-header" data-ds="home-header">
      <div><span className="home-brand">BASEBALL MANAGER</span><strong>{myTeam?.name}</strong><p>{year}年 · {date ? `${date.month}/${date.day}` : '日程なし'} · 第{Number.isSafeInteger(gameDay) ? gameDay : '—'}戦 · 残り{remain}試合 · {wins}勝{losses}敗{draws}分</p></div>
      <div className="hub-header-actions">
        <button className="hub-notification-button" onClick={onNotifications} aria-label={`通知（未読${notifications.unread}件・要対応${notifications.actionable}件）`}>
          <span><Bell size={20} aria-hidden="true" /> 通知</span><small>未読 {notifications.unread} · 要対応 {notifications.actionable}</small>
        </button>
        <button className="hub-settings-button" onClick={onSettings} aria-label="設定"><Gear size={22} aria-hidden="true" /></button>
        <div className="home-save"><StateLabel tone={tone}>{label}</StateLabel><Button variant="secondary" onClick={onSave} disabled={Boolean(saving)}>保存</Button></div>
      </div>
    </header>;
}
