import {it,expect} from 'vitest';
import {assertCompletedVitestLog} from './roster-long-run-log.mjs';

const plain='Test Files 1 passed (1)\nTests 1 passed (1)\n';
it('accepts a complete plain per-seed log',()=>{
 expect(()=>assertCompletedVitestLog(plain)).not.toThrow();
});
it('accepts the same complete footer with GitHub Actions ANSI styling',()=>{
 const colored='\u001b[2m Test Files \u001b[22m \u001b[32m1 passed\u001b[39m (1)\n\u001b[2m Tests \u001b[22m \u001b[32m1 passed\u001b[39m (1)';
 expect(()=>assertCompletedVitestLog(colored)).not.toThrow();
});
it('still requires both file and test counts, including legacy combined runs',()=>{
 expect(()=>assertCompletedVitestLog('Test Files 1 passed (1)')).toThrow();
 expect(()=>assertCompletedVitestLog(plain,3)).toThrow();
 expect(()=>assertCompletedVitestLog('Test Files 3 passed (3)\nTests 3 passed (3)',3)).not.toThrow();
});
it('rejects errors even when the expected success footer is present',()=>{
 for(const failure of ['Unhandled Errors','Worker exited unexpectedly','FATAL ERROR','Failed Tests']){
  expect(()=>assertCompletedVitestLog(`${plain}\u001b[31m${failure}\u001b[39m`)).toThrow();
 }
});
