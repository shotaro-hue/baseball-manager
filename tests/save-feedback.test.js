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
