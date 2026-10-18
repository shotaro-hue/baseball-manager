import {expect,it} from 'vitest';
import {resolve} from 'node:path';
import {emitCpuDecision} from '../src/engine/cpuDecisionTrace';
it('attaches the long harness dynamic observer to the same engine module without mocking it',async()=>{
 const tracePath=resolve('src/engine/cpuDecisionTrace.js');
 const {subscribeCpuDecisions}=await import(/* @vite-ignore */ tracePath);
 const records=[],unsubscribe=subscribeCpuDecisions(e=>records.push(e));
 emitCpuDecision({type:'probe'});unsubscribe();expect(records).toEqual([{type:'probe'}]);
});
