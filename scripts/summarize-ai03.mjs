import {readFileSync,writeFileSync,mkdirSync,readdirSync} from 'node:fs';
import {gzipSync,gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {summarizeAi03} from './ai03-summary.mjs';

const [beforeDir,afterDir,outDir]=process.argv.slice(2);
if(!outDir)throw Error('Usage: summarize-ai03.mjs beforeDir afterDir outDir');
const seeds=[20261015,20261016,20261017],sha=b=>createHash('sha256').update(b).digest('hex');
function tarFiles(path){
 const bytes=gunzipSync(readFileSync(path)),files=new Map();
 for(let i=0;i+512<=bytes.length;){
  const head=bytes.subarray(i,i+512),str=(a,b)=>head.subarray(a,b).toString().split('\0')[0];
  const name=[str(345,500),str(0,100)].filter(Boolean).join('/'),size=parseInt(str(124,136).trim(),8)||0;
  if(!name)break;
  if(str(156,157)==='0'||str(156,157)==='')files.set(name,bytes.subarray(i+512,i+512+size));
  i+=512+Math.ceil(size/512)*512;
 }return files;
}
mkdirSync(outDir,{recursive:true});const variants={},artifacts=[];let frozenRuntime;
for(const [variant,dir] of [['before',beforeDir],['after',afterDir]]){
 const runs=[],source=tarFiles(`${dir}/source-application.tar.gz`),harness=tarFiles(`${dir}/source-harness.tar.gz`);
 for(const seed of seeds){
  const raw=readFileSync(`${dir}/seed-${seed}.json`),data=JSON.parse(raw),run=data.seeds[0];
  const snapshot=JSON.parse(readFileSync(`${dir}/source-snapshot-${seed}.json`)),receipt=JSON.parse(readFileSync(`${dir}/completion-${seed}.json`));
  const report=JSON.parse(readFileSync(`${dir}/vitest-${seed}.json`));
  assert.equal(receipt.exitCode,0);assert.equal(receipt.signal,null);assert.equal(receipt.variant,variant);assert.equal(receipt.sourceCommit,data.base);
  assert.equal(report.success,true);assert.equal(report.numPassedTests,1);assert.equal(report.numFailedTests,0);assert.equal(report.numFailedTestSuites,0);
  assert.equal(data.variant,variant);assert.equal(data.seeds.length,1);assert.equal(run.status,'passed');assert.equal(run.seed,seed);assert.equal(run.years,10);
  assert.equal(run.seasons.length,10);assert.deepEqual(run.seasons.map(s=>s.year),Array.from({length:10},(_,i)=>2026+i));
  assert.ok(run.careerValidation?.length>0);for(const c of run.careerValidation)assert.deepEqual(c.recordedYears,c.expectedYears);
  assert.equal(snapshot.sourceCommit,data.base);assert.deepEqual(snapshot.sources,data.sources);
  const runtime=Object.fromEntries(Object.entries(data.sources).filter(([path])=>path.startsWith('@runtime/')));
  frozenRuntime??=runtime;assert.deepEqual(runtime,frozenRuntime,'comparison runtime/dependencies differ');
  for(const [path,hash] of Object.entries(data.sources)){
   const bytes=source.get(path)??harness.get(path);
   if(bytes)assert.equal(sha(bytes),hash,`${variant}/${seed} fixed source ${path}`);
   else if(!path.startsWith('@runtime/'))assert.fail(`fixed source missing ${path}`);
  }
  for(const s of run.seasons){
   assert.equal(s.officialGamesPerTeam,143);assert.equal(s.farmCards.played+s.farmCards.unplayed,858);
   assert.deepEqual(s.afterOffseason.map(t=>t.id).sort((a,b)=>a-b),Array.from({length:12},(_,i)=>i));
   for(const phase of ['midseason','camp','new-season'])assert.ok(run.checkpoints.some(c=>c.phase===phase&&c.year===s.year+Number(phase==='new-season')));
   for(const clubs of [s.seasonEnd,s.afterOffseason,...Object.values(s.phases).filter(Array.isArray)]){
    const ids=clubs.flatMap(t=>t.playerUsage.map(p=>p.id));assert.equal(new Set(ids).size,ids.length);
    for(const t of clubs){assert.ok(t.controlled<=70);assert.ok(Number.isFinite(t.budget));assert.equal(t.controlled,t.playerUsage.filter(p=>!p.development).length);}
   }
   if(variant==='after'){
    assert.equal(s.farmCards.unplayed,0);
    for(const t of s.afterOffseason.filter(t=>t.id!==0)){
     assert.ok(t.budget>=0);assert.ok(t.playerUsage.filter(p=>!p.development&&p.pos==='捕手'&&!p.isPitcher).length>=6);
     for(const pos of ['捕手','一塁手','二塁手','三塁手','遊撃手','左翼手','中堅手','右翼手'])assert.ok(t.playerUsage.some(p=>!p.development&&!p.isPitcher&&p.pos===pos));
    }
   }
  }
  runs.push(run);
  const bytes=gzipSync(raw,{level:9,mtime:0}),name=`${variant}-${seed}.json.gz`;writeFileSync(`${outDir}/${name}`,bytes);artifacts.push({name,bytes:bytes.length,sha256:sha(bytes)});
 }
 variants[variant]=summarizeAi03(runs);
 if(variant==='after')assert.equal(variants[variant].rookieMultipleZero,0);
 for(const name of readdirSync(dir).filter(n=>n.endsWith('.json')&&!n.startsWith('seed-')||n.endsWith('.tar.gz'))){
  const bytes=readFileSync(`${dir}/${name}`),dest=`${variant}-${name}`;writeFileSync(`${outDir}/${dest}`,bytes);artifacts.push({name:dest,bytes:bytes.length,sha256:sha(bytes)});
 }
 for(const seed of seeds)for(const prefix of ['seed','decisions']){
  const extension=prefix==='seed'?'log':'jsonl',name=`${prefix}-${seed}.${extension}`;
  if(!readdirSync(dir).includes(name))continue;
  const bytes=gzipSync(readFileSync(`${dir}/${name}`),{level:9,mtime:0}),dest=`${variant}-${name}.gz`;writeFileSync(`${outDir}/${dest}`,bytes);artifacts.push({name:dest,bytes:bytes.length,sha256:sha(bytes)});
 }
}
const summary={status:'complete-six-ten-year-runs',variants,artifacts,limitations:[
 'Postseason tournament and prize income are bypassed identically; not a full App/playoff journey.',
 'Early class preparation changes RNG order; compare distributions, not paired players, wins or timing.',
 'Final-year rookies have no following season; CPU refusal is not a natural rule and is covered by targeted transaction tests.',
 'Career DB final assertions cover continuously owned user players; all12 club ownership, contracts and movement histories are checked at checkpoints.'
]};
writeFileSync(`${outDir}/comparison.json`,JSON.stringify(summary,null,2)+'\n');
const csv=['variant,seed,year,teamId,controlled,nominations,accepted,endReason,zeroDraftStreak,ageMean,catchers,pitchers,budget,payroll'];
for(const [variant,s]of Object.entries(variants))for(const r of s.annual)csv.push([variant,r.seed,r.year,r.teamId,r.controlled,r.nominations,r.accepted,r.endReason??'',r.zeroDraftStreak,r.ageMean,r.catchers,r.pitchers,r.budget,r.payroll].join(','));
writeFileSync(`${outDir}/annual-clubs.csv`,csv.join('\n')+'\n');
const rows=[['CPU70人率',s=>(s.seventyRate*100).toFixed(1)+'%'],['ドラフト総指名',s=>s.totalNominations],['指名0最長',s=>s.longestZeroDraft],['4年以上指名0の球団年度',s=>s.fourYearZeroOccurrences],['複数年連続無出場新人',s=>s.rookieMultipleZero],['主捕手人数',s=>`${s.catchers.min}–${s.catchers.max}`],['二軍未実施',s=>s.unplayedFarmCards],['予算負値',s=>s.negativeBudget]];
writeFileSync(`${outDir}/comparison.md`,'# AI-03 改善前後比較\n\n各3シード×10年、330 CPU球団年度。\n\n|指標|改善前|改善後|\n|---|---:|---:|\n'+rows.map(([label,f])=>`|${label}|${f(variants.before)}|${f(variants.after)}|`).join('\n')+'\n');
console.log(JSON.stringify({status:summary.status,metrics:Object.fromEntries(Object.entries(variants).map(([key,s])=>[key,{...s,annual:undefined,cohorts:undefined}]))}));
