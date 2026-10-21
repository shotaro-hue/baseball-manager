const SAVE_FAILURE_CAUSES = {
  save_lock_unavailable: '安全な保存ロックを取得できませんでした。',
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
  unknown_save_failure: '保存に失敗しましたが、原因を特定できませんでした。',
};

export function saveFeedback(result, success = '💾 セーブしました') {
  if (!result?.ok) {
    const code = result?.quota ? 'quota_exceeded' : result?.reason ?? result?.diagnostics?.reason;
    // Never render exception messages or arbitrary diagnostic values containing save data.
    const reason = Object.hasOwn(SAVE_FAILURE_CAUSES, code) ? code : 'unknown_save_failure';
    const cause = SAVE_FAILURE_CAUSES[reason];
    const recovery = reason === 'transition_in_progress'
      ? '処理が終わってから、保存ボタンで再試行してください。'
      : 'この画面を開いたまま、保存ボタンで再試行してください。';
    const risk = '今回の変更は未保存です。画面を閉じると変更が失われる可能性があります。';
    return { type: 'warn', reason, cause, recovery, risk, message: `${cause}${recovery}${risk}` };
  }
  if (result.archive?.ok === false) return { type: 'warn', message: '試合・球団データは保存しました。打球の詳細記録は未保存です。保存ボタンで再試行してください。' };
  if (result.warnings?.length) return { type: 'warn', message: '球団データは保存しました。保存情報の更新・整理に失敗しました。' };
  return { type: 'ok', message: success };
}
