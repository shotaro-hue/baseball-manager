import { it, expect } from 'vitest';
import { saveFeedback } from '../src/engine/saveFeedback';
it('separates committed body with auxiliary warnings from a failed save', () => {
 expect(saveFeedback({ok:true,warnings:['metadata_failed']})).toMatchObject({type:'warn'});
 expect(saveFeedback({ok:true,archive:{ok:false}}).message).toContain('打球');
 expect(saveFeedback({ok:false,quota:true}).message).toContain('前回');
 expect(saveFeedback({ok:false,reason:'save_conflict'}).message).toContain('別タブ');
});
it('reports an older annual request without attributing it to another tab',()=>{
 const feedback=saveFeedback({ok:false,reason:'stale_save'});
 expect(feedback.type).toBe('warn');expect(feedback.message).toContain('より新しい年度');
 expect(feedback.message).not.toContain('別タブ');
});

it.each([
 ['save_lock_unavailable', '保存ロック'],
 ['save_lock_failed', '保存ロック'],
 ['save_conflict', '別タブ'],
 ['stale_save', 'より新しい年度'],
 ['indexeddb_write_failed', 'ブラウザ内データベース'],
 ['quota_exceeded', '保存容量'],
 ['sanitize_state_failed', '保存用データ'],
 ['serialization_failed', '保存用データを変換'],
 ['compression_failed', '保存用データを圧縮'],
 ['farm_payload_missing', '二軍'],
 ['transition_in_progress', '画面の切り替え'],
 ['snapshot_failed', '保存用の写し'],
 ['storage_write_failed', '保存領域'],
 ['storage_read_failed', '保存領域'],
])('explains %s without directing the user to discard current changes', (reason, cause) => {
 const feedback = saveFeedback({ok:false,reason});
 expect(feedback).toMatchObject({type:'warn',reason});
 expect(feedback.cause).toContain(cause);
 expect(feedback.message).toContain('未保存');
 expect(feedback.message).toContain('再試行');
 expect(feedback.message).not.toMatch(/読み直|再読み込|リセット|削除/);
});

it('uses only known reason codes from diagnostics and never exposes arbitrary error text', () => {
 const feedback = saveFeedback({ok:false,diagnostics:{reason:'indexeddb_write_failed',exceptionMessage:'PRIVATE SAVE CONTENT'}});
 expect(feedback.reason).toBe('indexeddb_write_failed');
 expect(feedback.cause).toContain('ブラウザ内データベース');
 expect(JSON.stringify(feedback)).not.toContain('PRIVATE SAVE CONTENT');
 const unknown = saveFeedback({ok:false,reason:'PRIVATE SAVE CONTENT'});
 expect(unknown.reason).toBe('unknown_save_failure');
 expect(unknown.message).toContain('原因を特定できませんでした');
 expect(JSON.stringify(unknown)).not.toContain('PRIVATE SAVE CONTENT');
 expect(saveFeedback({ok:false,quota:true}).reason).toBe('quota_exceeded');
});


it.each([
 ['save_conflict', /別タブ/, /最新の保存/, false],
 ['stale_save', /より新しい年度/, /古い状態/, false],
 ['save_lock_unavailable', /安全に保存できません/, /対応/, false],
 ['invalid_state', /保存できるゲーム状態/, /変更内容を控え/, false],
 ['session_changed', /ゲーム.*切り替わ/, /現在のゲーム/, false],
 ['save_failed', /保存処理/, /原因/, false],
 ['quota_exceeded', /保存容量/, /空き容量/, true],
 ['transition_in_progress', /画面の切り替え/, /処理が終わってから/, true],
])('selects actionable recovery for %s', (reason, cause, recovery, retryable) => {
 const feedback = saveFeedback({ok:false,reason});
 expect(feedback.reason).toBe(reason);
 expect(feedback.cause).toMatch(cause); expect(feedback.recovery).toMatch(recovery);
 expect(feedback.retryable).toBe(retryable);
 expect(feedback.message).toContain('未保存');
 expect(feedback.recovery).not.toContain('この画面を開いたまま、保存ボタンで再試行してください');
 if (!retryable) expect(feedback.recovery).not.toMatch(/保存ボタンで再試行してください/);
});

it.each(['save_lock_failed','indexeddb_write_failed','storage_write_failed','storage_read_failed'])(
 'only offers conditional retry for a transient %s and preserves safe diagnosis', reason => {
 const temporary=saveFeedback({ok:false,reason,diagnostics:{exceptionName:'AbortError',exceptionMessage:'PRIVATE'}});
 expect(temporary.retryable).toBe(true);
 expect(temporary.recovery).toMatch(/解消.*場合.*再試行/);
 expect(temporary.message).not.toContain('PRIVATE');
 const denied=saveFeedback({ok:false,reason,diagnostics:{exceptionName:'SecurityError'}});
 expect(denied.retryable).toBe(false); expect(denied.recovery).toContain('設定');
 expect(denied.recovery).not.toContain('保存ボタンで再試行');
 const unknown=saveFeedback({ok:false,reason});
 expect(unknown.retryable).toBe(false);
 expect(unknown.recovery).toContain('診断');
});
it('does not hide a conflict behind a stray quota flag and never treats unknown codes as retryable', () => {
 expect(saveFeedback({ok:false,reason:'save_conflict',quota:true}).reason).toBe('save_conflict');
 const unknown=saveFeedback({ok:false,reason:'PRIVATE'});
 expect(unknown.retryable).toBe(false); expect(unknown.recovery).toContain('診断');
 expect(unknown.message).not.toContain('PRIVATE');
});
