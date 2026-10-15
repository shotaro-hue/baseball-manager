import {expect,it,vi} from 'vitest';
import {chooseDraftProspect,forecastDraft,resolveFirstRound} from '../src/engine/draftRules';
import {ensureDraftEvaluation,draftReport,startDraftEvaluation,scoutDraftCandidate} from '../src/engine/draftReports';

const pit=(id,role,q=65)=>({id,name:String(id),isPitcher:true,pos:role,subtype:role,age:22,potential:q,
  readinessScore:50,pitching:{velocity:q,control:q,breaking:q,stamina:q}});
const bat=(id,pos,q=65)=>({id,name:String(id),isPitcher:false,pos,age:22,potential:q,readinessScore:50,
  batting:{contact:q,power:q,eye:q,speed:q,defense:q,catching:q,arm:q}});
const counts=picks=>{const groups={};picks.forEach(p=>groups[p.id]=(groups[p.id]||0)+1);const n=Object.values(groups);return {unique:n.length,max:Math.max(...n),single:n.filter(x=>x===1).length};};
const average=(rows,key)=>rows.reduce((s,r)=>s+r[key],0)/rows.length;

it('compares 200 fixed draft classes and measures forecast usefulness and scouting accuracy',()=>{
 const random=vi.spyOn(Math,'random');let state=1;
 random.mockImplementation(()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;});
 try {
  const results={flat:{old:[],next:[]},star:{old:[],next:[]}},forecastGroups={高:[],中:[],低:[]};
  const resolution={flat:{old:[],next:[]},star:{old:[],next:[]}},roleAge={roles:{},ages:{}};
  const residualGroups={高:[],中:[],低:[]},errors={low:[],high:[]};
  for(let seed=1;seed<=200;seed++) {
   state=seed;const kind=seed<=100?'flat':'star';
   const teams=Array.from({length:12},(_,id)=>({id,wins:40+id*3,losses:90-id*3,
    players:[...Array.from({length:4},(_,i)=>pit(`${id}-sp-${i}`,'先発')),
      ...Array.from({length:3},(_,i)=>pit(`${id}-rp-${i}`,'中継ぎ')),pit(`${id}-cl`,'抑え'),
      ...Array.from({length:id%3+1},(_,i)=>bat(`${id}-c-${i}`,'捕手')),
      ...['遊撃手','二塁手','三塁手'].flatMap(pos=>[bat(`${id}-${pos}-1`,pos),bat(`${id}-${pos}-2`,pos)])],farm:[]}));
   const pool=Array.from({length:24},(_,i)=>i%4===0?pit(`${seed}-${i}`,'先発',64+i%3):bat(`${seed}-${i}`,i%4===1?'捕手':'外野手',64+i%3));
   if(kind==='star')pool[0]=pit(`${seed}-star`,'先発',98);
   const evaluation=ensureDraftEvaluation({teams,pool,year:2026,myId:0});
   const ctx={teams,evaluation};
   results[kind].old.push(counts(teams.map(t=>chooseDraftProspect(t,pool))));
   const picks=teams.map(t=>chooseDraftProspect(t,pool,1,[],ctx));
   results[kind].next.push(counts(picks));
   const rngState=state;
   for(const [mode,context] of [['old',{}],['next',ctx]]){
    state=seed;
    const result=resolveFirstRound(teams,pool,context);
    resolution[kind][mode].push({rounds:Math.max(0,result.rounds.length-1),nominations:result.rounds.slice(1).reduce((s,r)=>s+Object.keys(r).length,0)});
    if(mode==='next')for(const p of Object.values(result.picks)){
     const role=p.subtype || p.pos;roleAge.roles[role]=(roleAge.roles[role]||0)+1;roleAge.ages[p.age]=(roleAge.ages[p.age]||0)+1;
    }
    expect(new Set(Object.values(result.picks).map(p=>p.id)).size).toBe(Object.keys(result.picks).length);
   }
   state=rngState;
   const forecast=forecastDraft(teams,pool,0,ctx);
   for(const p of pool)forecastGroups[forecast[p.id].label].push(picks.slice(1).filter(x=>x.id===p.id).length);
   const residual=forecastDraft(teams,pool,0,{...ctx,round:2,nextTeams:teams.slice(1,5)});
   let remaining=[...pool];
   for(const t of teams.slice(1,5)){const picked=chooseDraftProspect(t,remaining,2,[],ctx);remaining=remaining.filter(p=>p.id!==picked.id);}
   for(const p of pool)residualGroups[residual[p.id].label].push(remaining.some(x=>x.id===p.id)?1:0);
   let refined=startDraftEvaluation(evaluation,pool);
   for(const p of pool){
    errors.low.push(Math.abs(draftReport(evaluation,p.id,0).skills[p.isPitcher?'velocity':'contact'].value-(p.isPitcher?p.pitching.velocity:p.batting.contact)));
    // Each independent refinement starts with the same remaining budget.
    const observed=scoutDraftCandidate({...refined,points:5},pool,p.id);
    errors.high.push(Math.abs(draftReport(observed,p.id,0).skills[p.isPitcher?'velocity':'contact'].value-(p.isPitcher?p.pitching.velocity:p.batting.contact)));
   }
  }
  const summary=Object.fromEntries(Object.entries(results).map(([k,v])=>[k,Object.fromEntries(Object.entries(v).map(([m,rows])=>[m,{unique:average(rows,'unique'),max:average(rows,'max'),single:average(rows,'single'),histogram:rows.reduce((a,r)=>({...a,[r.max]:(a[r.max]||0)+1}),{})}]))]));
  const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
  const competition=Object.fromEntries(Object.entries(forecastGroups).map(([k,v])=>[k,{n:v.length,mean:mean(v)}]));
  const survival=Object.fromEntries(Object.entries(residualGroups).map(([k,v])=>[k,{n:v.length,mean:mean(v)}]));
  const replacementRounds=Object.fromEntries(Object.entries(resolution).map(([kind,modes])=>[kind,Object.fromEntries(Object.entries(modes).map(([mode,rows])=>[mode,{rounds:average(rows,'rounds'),nominations:average(rows,'nominations')}]))]));
  console.log('DRAFT_BALANCE',JSON.stringify({summary,competition,survival,replacementRounds,roleAge,meanError:{low:mean(errors.low),high:mean(errors.high)}}));
  expect(summary.flat.next.unique).toBeGreaterThan(summary.flat.old.unique);
  expect(summary.flat.next.max).toBeLessThan(summary.flat.old.max);
  expect(summary.star.next.max).toBeGreaterThan(summary.flat.next.max);
  expect(summary.star.next.unique).toBeLessThan(summary.flat.next.unique);
  expect(competition.高.n).toBeGreaterThan(0);expect(competition.低.n).toBeGreaterThan(0);
  expect(competition.高.mean).toBeGreaterThan(competition.低.mean);
  expect(survival.高.n).toBeGreaterThan(0);expect(survival.低.n).toBeGreaterThan(0);
  expect(survival.高.mean).toBeGreaterThan(survival.低.mean);
  expect(mean(errors.high)).toBeLessThan(mean(errors.low));
 } finally {random.mockRestore();}
},60000);
