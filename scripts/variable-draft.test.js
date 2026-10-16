import {afterEach,expect,it,vi} from 'vitest';
import {writeFileSync,readFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {createInitialTeams} from '../src/engine/bootstrapTeams';
import {initDraftPool} from '../src/engine/draft';
import {newDraftRules,draftParticipation,draftNominationCount} from '../src/engine/draftConference';
import {resolveFirstRound,chooseDraftProspect,applyDraftAcquisitions,registeredDraftCount} from '../src/engine/draftRules';
import {ensureDraftEvaluation,startDraftEvaluation} from '../src/engine/draftReports';
import {evaluateDraftContinuation} from '../src/engine/draftContinuation';
import {draftPicksForTeam} from '../src/engine/offseasonResume';
afterEach(()=>vi.restoreAllMocks());
it('runs 20 new ten-selection conferences with variable CPU endings and unique capacity-safe acquisitions',()=>{
 const evidence=[];
 for(let seed=20261015;seed<20261035;seed++){
  const started=performance.now();let state=seed;
  vi.spyOn(Math,'random').mockImplementation(()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;});
  const teams=createInitialTeams(),pool=initDraftPool({...teams[0],scoutResults:[]}),rules=newDraftRules();
  const evaluation=startDraftEvaluation(ensureDraftEvaluation({teams,pool,year:2026,myId:0}),pool);
  expect(pool).toHaveLength(160);
  const selections=[];
  const first=resolveFirstRound(teams,pool,{rules,evaluation});
  const drafted=Object.fromEntries(Object.entries(first.picks).map(([id,p])=>[p.id,Number(id)])),endedTeams={...first.endedTeams},log=[];
  for(const [id,p] of Object.entries(first.picks)){
   const team=teams.find(t=>String(t.id)===id),decision=evaluateDraftContinuation(team,[p],1,[],{rules,teams,draftPool:pool,evaluation}).decisions[0];
   expect(decision.eligible).toBe(true);selections.push({teamId:team.id,round:1,role:p.subtype||p.pos,...decision});
   log.push({team:Number(id),player:p.id,round:1});
  }
  const order=[...teams].sort((a,b)=>a.wins-b.wins);
  for(let round=2;round<=10;round++)for(const team of order){
   const ctx={rules,teams,draftPool:pool,drafted,log,endedTeams,evaluation};
   const status=draftParticipation(team,pool,drafted,ctx);
   if(!status.eligible){endedTeams[team.id]??=status.reason;continue;}
   const available=pool.filter(p=>!Object.hasOwn(drafted,p.id));
   const pick=chooseDraftProspect(team,available,round,draftPicksForTeam(pool,drafted,team.id),ctx);
   if(!pick){endedTeams[team.id]='no-upgrade';continue;}
   const decision=evaluateDraftContinuation(team,[pick],round,draftPicksForTeam(pool,drafted,team.id),ctx).decisions[0];
   expect(decision.eligible).toBe(true);selections.push({teamId:team.id,round,role:pick.subtype||pick.pos,...decision});
   drafted[pick.id]=team.id;log.push({team:team.id,player:pick.id,round});
  }
  for(const team of teams)if(!endedTeams[team.id])endedTeams[team.id]=draftParticipation(team,pool,drafted,{rules,teams,log}).reason || 'conference-complete';
  const result=applyDraftAcquisitions(teams,pool,drafted,2026,{rules,log});expect(result.ok).toBe(true);
  const ids=result.teams.flatMap(t=>[...t.players,...t.farm].map(p=>p.id));expect(new Set(ids).size).toBe(ids.length);
  const counts=teams.map(t=>draftNominationCount(t.id,pool,drafted,log));
  expect(Math.max(...counts)).toBeLessThanOrEqual(10);expect(counts.some(n=>n<10)).toBe(true);
  expect(result.teams.every(t=>registeredDraftCount(t)<=70)).toBe(true);
  const catcherCount=t=>[...t.players,...t.farm].filter(p=>!p.isPitcher&&p.pos==='捕手'&&!(p.育成||p.isIkusei)).length;
  evidence.push({seed,catchersBefore:teams.map(catcherCount),catchersAfter:result.teams.map(catcherCount),selections,elapsedMs:Math.round(performance.now()-started),picks:counts,endedTeams,controlled:result.teams.map(registeredDraftCount)});
  vi.restoreAllMocks();
 }
 if(process.env.VARIABLE_DRAFT_EVIDENCE==='1'){
  const paths=['src/constants.js','src/engine/draft.js','src/engine/draftConference.js','src/engine/draftContinuation.js','src/engine/draftRules.js','src/engine/draftReports.js'];
  const meta={baseline:'17fa9c063cdc00959287b728ee39dfbba5ef90c4',scope:'20 new conferences; existing initial rosters; not multi-year calibration',
   environment:'Vitest Node; concurrent draft regressions/browser checks; not a controlled performance benchmark',
   sources:Object.fromEntries(paths.map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]))};
  writeFileSync('docs/validation/variable-draft/conferences.json.gz',gzipSync(JSON.stringify({...meta,runs:evidence})));
  const counts=rows=>rows.reduce((out,r)=>(out[r.reason]=(out[r.reason] || 0)+1,out),{});
  writeFileSync('docs/validation/variable-draft/conferences-summary.json',JSON.stringify({...meta,runs:evidence.map(({selections,...r})=>({...r,selectedReasons:counts(selections),catcherSelections:selections.filter(p=>p.role==='捕手')}))},null,2)+'\n');
 }
},120000);
