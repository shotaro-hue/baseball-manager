export function saveFeedback(result, success = '💾 セーブしました') {
  if (!result?.ok) {
    if (result?.reason === 'stale_save') return { type: 'warn', message: 'より新しい年度の保存があるため上書きしませんでした。続きから読み直してください。今回の変更は未保存です。' };
    if (result?.reason === 'save_conflict') return { type: 'warn', message: '別タブで保存が更新されました。上書きせず、続きから読み直してください。未保存の変更は失われる可能性があります。' };
    if (result?.reason === 'save_lock_unavailable') return { type: 'warn', message: 'このブラウザでは安全な保存ロックを利用できません。対応ブラウザで再試行してください。' };
    return { type: 'warn', message: result?.quota
      ? '💾 保存容量が不足しています。前回の正常セーブは保持しています。今回の変更は未保存です。'
      : 'セーブに失敗しました。前回の正常セーブは保持しています。保存ボタンで再試行してください。' };
  }
  if (result.archive?.ok === false) return { type: 'warn', message: '試合・球団データは保存しました。打球の詳細記録は未保存です。保存ボタンで再試行してください。' };
  if (result.warnings?.length) return { type: 'warn', message: '球団データは保存しました。保存情報の更新・整理に失敗しました。' };
  return { type: 'ok', message: success };
}
