import { it, expect } from 'vitest';
import { saveFeedback } from '../src/engine/saveFeedback';
it('separates committed body with auxiliary warnings from a failed save', () => {
 expect(saveFeedback({ok:true,warnings:['metadata_failed']})).toMatchObject({type:'warn'});
 expect(saveFeedback({ok:true,archive:{ok:false}}).message).toContain('打球');
 expect(saveFeedback({ok:false,quota:true}).message).toContain('前回');
 expect(saveFeedback({ok:false,reason:'save_conflict'}).message).toContain('別タブ');
});
