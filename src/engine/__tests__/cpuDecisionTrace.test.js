import {expect,it} from 'vitest';
import * as trace from '../cpuDecisionTrace';
import {cpuRenewContracts} from '../contract';
it('reports CPU renewal decisions without adding diagnostics to persistent teams',()=>{
 const events=[],unsubscribe=trace.subscribeCpuDecisions(e=>events.push(e));
 const p={id:'veteran',name:'必要なベテラン',pos:'捕手',age:38,salary:500,contractYearsLeft:3,batting:{contact:75},potential:75};
 const t={id:1,budget:100000,players:[p],farm:[],history:[]};
 const before=structuredClone(t),r=cpuRenewContracts([t],0,[t],{year:2026});unsubscribe();
 expect(events.find(e=>e.type==='renewal')).toMatchObject({teamId:1,id:p.id,action:'retain',reason:'ongoing-contract'});
 expect(r.updatedTeams).toEqual([before]);
 const n=events.length;cpuRenewContracts([t],0,[t],{year:2026});expect(events).toHaveLength(n);
});
