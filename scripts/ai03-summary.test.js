import {expect,it} from 'vitest';
import {summarizeAi03} from './ai03-summary.mjs';
const usage=(id,extra={})=>({id,pos:'一塁手',age:22,salary:500,PA:0,BF:0,farmPA:0,farmBF:0,development:false,...extra});
const season=(year,picks=[],players=[usage('rookie')])=>({year,decisions:picks,endedTeams:{1:'no-upgrade'},farmCards:{unplayed:0},events:[],
 afterOffseason:[{id:1,controlled:67,pitchers:32,budget:10000,payroll:30000,playerUsage:players}],
 seasonEnd:[{id:1,playerUsage:players}],phases:{market:[{id:1,marketClaims:[]}]}});
it('keeps zero-draft streaks separate by seed and checks accepted rookies in following seasons',()=>{
 const runs=[{seed:1,checkpoints:[],seasons:[season(2026,[{teamId:1,id:'rookie'}]),season(2027,[],[usage('rookie',{farmPA:10})]),season(2028)]},
  {seed:2,checkpoints:[],seasons:[season(2026),season(2027),season(2028)]}];
 const s=summarizeAi03(runs);expect(s.cpuClubSeasons).toBe(6);expect(s.longestZeroDraft).toBe(3);
 expect(s.controlledDistribution).toEqual({67:6});expect(s.observedRookieCohorts).toBe(1);expect(s.rookieFirstZero).toBe(0);expect(s.rookieMultipleZero).toBe(0);
});
it('does not count refused prospects or unobserved final-year picks as zero-appearance rookies',()=>{
 const s=summarizeAi03([{seed:1,checkpoints:[],seasons:[season(2026,[{teamId:1,id:'refused',refused:true},{teamId:1,id:'last'}])]}]);
 expect(s.totalNominations).toBe(2);expect(s.accepted.mean).toBe(1);expect(s.observedRookieCohorts).toBe(0);expect(s.rookieFirstZero).toBe(0);
});
it('counts the actual contingency reasons and zero future baseline rather than lottery nominations',()=>{
 const s=summarizeAi03([{seed:1,checkpoints:[],seasons:[season(2026,[{teamId:1,id:'a',projectedCount:68,rosterReason:'future-upgrade',futureBaseline:0},
  {teamId:1,id:'b',projectedCount:69,rosterReason:'current-upgrade',futureBaseline:65}])]}]);
 expect(s.contingencyReasons).toEqual({'future-upgrade':1,'current-upgrade':1});expect(s.zeroFutureBaselineContingencies).toBe(1);
});
