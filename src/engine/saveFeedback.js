const SAVE_FAILURE_CAUSES = {
  save_verification_failed: '保存データの読み戻し検証に失敗しました。前回の正常セーブは保持しています。',
  save_lock_unavailable: '現在の環境では保存ロックを使えず、安全に保存できません。',
  save_lock_failed: '保存ロックの処理に失敗しました。',
  save_conflict: '別タブで保存が更新されたため、上書きを止めました。',
  stale_save: 'より新しい年度の保存があるため、上書きを止めました。',
  indexeddb_write_failed: 'ブラウザ内データベースへの書き込みに失敗しました。',
  quota_exceeded: '保存容量が不足しています。前回の正常セーブは保持しています。',
  sanitize_state_failed: '保存用データの準備に失敗しました。',
  serialization_failed: '保存用データを変換できませんでした。',
  compression_failed: '保存用データを圧縮できませんでした。',
  farm_payload_missing: '保存に必要な二軍データがそろっていません。',
  transition_in_progress: '画面の切り替え処理中のため、保存を開始できませんでした。',
  snapshot_failed: '現在の編成から保存用の写しを作れませんでした。',
  storage_write_failed: 'ブラウザの保存領域への書き込みに失敗しました。',
  storage_read_failed: 'ブラウザの保存領域を読み取れず、前回の保存を確認できませんでした。',
  invalid_state: '保存できるゲーム状態がそろっていません。',
  session_changed: '保存要求後にゲームが切り替わったため、以前の状態の保存を中止しました。',
  save_failed: '保存処理で予期しない失敗が発生しました。',
  unknown_save_failure: '保存に失敗しましたが、原因を特定できませんでした。',
};

const retainEdits = 'この画面を開いたまま、未保存の変更内容を控えてください。';
const inspectFailure = `${retainEdits}再試行を繰り返す前に、保存エラーの詳細と診断で原因を確認してください。`;
function recoveryFor(reason, exceptionName) {
  if (reason === 'save_conflict' || reason === 'stale_save') {
    const cause = reason === 'save_conflict' ? '別タブの保存完了を確認し、' : '古い状態から上書きせず、';
    return { retryable: false, recovery: `${retainEdits}${cause}既存セーブとバックアップを保全してください。保存ボタンの再試行だけでは解消しません。画面を離れると未保存の変更は失われます。変更内容を控えたうえで、タイトルの「続きから」で最新の保存を再開してください。未保存の変更は引き継がれません。` };
  }
  if (reason === 'save_lock_unavailable') return { retryable: false,
    recovery: `${retainEdits}安全な保存ロックに対応したブラウザ・閲覧環境か確認してください。再試行だけでは解消しません。環境を変えても現在の未保存データは自動では移りません。` };
  if (reason === 'session_changed') return { retryable: false,
    recovery: `${retainEdits}現在のゲームと保存状態を確認してください。以前の要求をそのまま再試行して上書きしないでください。` };
  if (reason === 'transition_in_progress') return { retryable: true,
    recovery: '処理が終わってから、保存ボタンで再試行してください。' };
  if (reason === 'quota_exceeded') return { retryable: true,
    recovery: `${retainEdits}このゲームの既存セーブとバックアップを保全し、端末・ブラウザの空き容量を確認してください。容量不足が解消した場合に限り、保存ボタンで再試行してください。` };
  if (['save_lock_failed', 'indexeddb_write_failed', 'storage_write_failed', 'storage_read_failed'].includes(reason)) {
    if (['SecurityError', 'NotAllowedError'].includes(exceptionName)) return { retryable: false,
      recovery: `${retainEdits}診断は保存アクセスの制限を示しています。ブラウザの保存・権限設定を確認してください。設定変更時も未保存の変更を残し、原因を確認せず再試行を繰り返さないでください。` };
    if (exceptionName === 'AbortError') return { retryable: true,
      recovery: `${retainEdits}診断は処理の中断を示しています。別タブの処理や中断原因が解消した場合に限り、保存ボタンで再試行してください。` };
  }
  return { retryable: false, recovery: inspectFailure };
}

export function saveFeedback(result, success = '💾 セーブしました') {
  if (!result?.ok) {
    const originalCode = result?.reason ?? result?.diagnostics?.reason;
    const code = ['save_conflict', 'stale_save', 'session_changed'].includes(originalCode)
      ? originalCode : result?.quota ? 'quota_exceeded' : originalCode;
    // Never render exception messages or arbitrary diagnostic values containing save data.
    const reason = Object.hasOwn(SAVE_FAILURE_CAUSES, code) ? code : 'unknown_save_failure';
    const cause = SAVE_FAILURE_CAUSES[reason];
    const { recovery, retryable } = recoveryFor(reason, result?.diagnostics?.exceptionName);
    const risk = '今回の変更は未保存です。画面を閉じると変更が失われる可能性があります。';
    return { type: 'warn', reason, cause, recovery, retryable, risk, message: `${cause}${recovery}${risk}` };
  }
  if (result.archive?.ok === false) return { type: 'warn', message: '試合・球団データは保存しました。打球の詳細記録は未保存です。保存ボタンで再試行してください。' };
  if (result.warnings?.length) return { type: 'warn', message: '球団データは保存しました。保存情報の更新・整理に失敗しました。' };
  return { type: 'ok', message: success };
}
