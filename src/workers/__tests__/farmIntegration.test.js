import {it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';import {gunzipSync} from 'node:zlib';
import {simulateSingleDay} from '../singleDayCore';import {simulateSeasonBatch} from '../seasonBatchCore';
import {migrateFarmCompetition} from '../../engine/farmMigration';
import {generateSeasonSchedule,getMyMatchup} from '../../engine/scheduleGen';
vi.mock('../../engine/simulation',()=>({quickSimGame:()=>({score:{my:0,opp:0},won:false,log:[],inningSummary:[]})}));
vi.mock('../../engine/rosterAutomation',async original=>({...await original(),applyManagementPolicy:t=>t,applyEmergencyRosterMaintenance:t=>t}));
vi.mock('../../engine/trade',async original=>({...await original(),generateCpuOffer:()=>null,generateCpuCpuTrade:()=>null}));
vi.mock('../../engine/player',async original=>({...await original(),checkForInjuries:()=>[]}));
function state(){const s=JSON.parse(gunzipSync(readFileSync(new URL('../../../e2e/fixtures/new-game.json.gz',import.meta.url))));s.schedule=generateSeasonSchedule(s.year,s.teams);s.allStarDone=true;return migrateFarmCompetition(s);}
it('single and batch adopt the same farm records, workload and official next-round candidate',()=>{
 const s=state(),before=structuredClone(s),match=getMyMatchup(s.schedule,1,s.myId);
 const single=simulateSingleDay({snapshot:s,gameContext:{selectedOpponentId:match.oppId,isHome:match.isHome,useDh:true}});
 const batch=simulateSeasonBatch({snapshot:s,count:1});
 expect(single.nextState.farmCompetition.nextRound).toBe(2);expect(batch.nextState.farmCompetition).toEqual(single.nextState.farmCompetition);
 const ids=new Set(s.teams.flatMap(t=>t.farm.map(p=>p.id)));
 const loads=next=>next.teams.flatMap(t=>[...t.players,...t.farm]).filter(p=>ids.has(p.id)).map(p=>[p.id,p.condition,p.recentPitchingDays]).sort((a,b)=>String(a[0]).localeCompare(String(b[0])));
 expect(loads(batch.nextState)).toEqual(loads(single.nextState));
 expect(single.nextState.gameDay).toBe(2);expect(s).toEqual(before);
});
it('batch cancellation discards the whole candidate without mutating the current farm ledger',()=>{
 const s=state(),before=structuredClone(s);let calls=0;
 expect(()=>simulateSeasonBatch({snapshot:s,count:3,isCancelled:()=>++calls>2})).toThrow(/cancel/i);expect(s).toEqual(before);
});
