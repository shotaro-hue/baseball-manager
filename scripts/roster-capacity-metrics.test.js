import {expect,it} from 'vitest';
import {rosterRows,rosterTransitions} from './roster-capacity-metrics';
const p=(id,extra={})=>({id,pos:'一塁手',age:22,salary:440,stats:{PA:0},...extra});
const state=(players,farm=[],history=[])=>({year:2026,teams:[{id:0,players,farm,history,budget:10000}],faPool:[],farmCompetition:{players:[]}});
it('retains every player ID and batter/pitcher opportunity, including rookies and measured zero',()=>{
 const s=state([p('bat',{stats:{PA:100}})],[p('rookie',{isPitcher:true,pos:'先発',stats:{BF:0,IP:0}}),p('unknown',{stats:{}})]);
 s.farmCompetition.players=[{playerId:'rookie',teams:[{teamId:0,pitching:{BF:80,outs:50}}]}];
 const rows=rosterRows(s,new Set(['rookie']));
 expect(rows[0].playerUsage).toEqual(expect.arrayContaining([
  expect.objectContaining({id:'bat',PA:100,roster:'active',rookie:false}),
  expect.objectContaining({id:'rookie',BF:0,IP:0,farmBF:80,farmOuts:50,rookie:true}),
  expect.objectContaining({id:'unknown',PA:null,farmRecorded:false}),
 ]));
});
it('attributes departures and conversions by phase and actual history without inventing missing causes',()=>{
 const before=rosterRows(state([p('retire'),p('release'),p('unknown')],[p('dev',{isIkusei:true})]));
 const next=state([p('dev',{isIkusei:false})],[],[{id:'retire',exitYear:2026,exitReason:'引退'},{id:'release',exitYear:2026,exitReason:'戦力外'}]);
 const events=rosterTransitions(before,rosterRows(next),next,'renewal');
 expect(events).toEqual(expect.arrayContaining([
  expect.objectContaining({id:'retire',teamId:0,type:'departure',reason:'引退',phase:'renewal',year:2026}),
  expect.objectContaining({id:'release',type:'departure',reason:'戦力外'}),
  expect.objectContaining({id:'unknown',type:'departure',reason:null}),
  expect.objectContaining({id:'dev',type:'conversion'}),
 ]));
});
it('records actual FA acquisition reasons and cross-club moves rather than treating arrivals as generated players',()=>{
 const before=state([p('move')]);before.teams.push({id:1,players:[],farm:[],history:[],budget:10000});
 const after=state([]);after.teams.push({id:1,players:[],farm:[p('move')],budget:9000,history:[{...p('move'),exitYear:2026,exitReason:'fa',rosterDecision:'current-upgrade'}]});
 const rows=rosterRows(after);
 expect(rows[1].marketClaims).toEqual([expect.objectContaining({id:'move',reason:'current-upgrade'})]);
 expect(rosterTransitions(rosterRows(before),rows,after,'market')).toEqual(expect.arrayContaining([
  expect.objectContaining({id:'move',teamId:1,type:'arrival',fromTeamId:0,reason:'fa'}),
 ]));
});
it('retains rookie farm opportunities from every club stint after a midseason trade',()=>{
 const s=state([],[p('rookie',{isPitcher:true,pos:'先発',stats:{BF:0,IP:0}})]);
 s.farmCompetition.players=[{playerId:'rookie',teams:[{teamId:1,pitching:{BF:70,outs:40}},{teamId:0,pitching:{BF:10,outs:6}}]}];
 expect(rosterRows(s,new Set(['rookie']))[0].playerUsage[0]).toMatchObject({rookie:true,farmBF:80,farmOuts:46});
});
