import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {buildOpportunityComparison,summarizeRookieCohorts} from './summarize-farm-opportunities.mjs';
import {assertCompletedVitestLog} from './roster-long-run-log.mjs';

function verifyManifest(path) {
 for(const artifact of JSON.parse(readFileSync(`${path}/evidence-manifest.json`)).artifacts){
  const bytes=readFileSync(`${path}/${artifact.path}`);
  assert.equal(bytes.length,artifact.bytes,artifact.path);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),artifact.sha256,artifact.path);
 }
}

function verifyComparison(path) {
 verifyManifest(path);
 const expected=JSON.parse(readFileSync(`${path}/opportunity-comparison.json`));
 const csv=readFileSync(`${path}/annual-club-comparison.csv`,'utf8'),markdown=readFileSync(`${path}/comparison.md`,'utf8');
 const regenerated=buildOpportunityComparison(path);
 assert.deepEqual(regenerated,expected);
 assert.equal(readFileSync(`${path}/annual-club-comparison.csv`,'utf8'),csv);
 assert.equal(readFileSync(`${path}/comparison.md`,'utf8'),markdown);
 return regenerated;
}

function verifyDiagnosticPrefix(path,name,seed,years) {
 const snapshot=JSON.parse(readFileSync(`${path}/after-source-snapshot.json`));
 const data=JSON.parse(gunzipSync(readFileSync(`${path}/${name}-run.json.gz`))),run=data.seeds[0];
 assert.equal(data.base,snapshot.sourceCommit);assert.deepEqual(data.sources,snapshot.sources);
 assert.equal(run.status,'passed');assert.equal(run.seasons.length,years);
 assertCompletedVitestLog(gunzipSync(readFileSync(`${path}/${name}.log.gz`)).toString(),1);
 const full=JSON.parse(gunzipSync(readFileSync(`${path}/after-${seed}.json.gz`))).seeds[0];
 const comparable=s=>({year:s.year,phases:s.phases,events:s.events,seasonEnd:s.seasonEnd,afterOffseason:s.afterOffseason,
  decisions:s.decisions,endedTeams:s.endedTeams,farmCards:s.farmCards,registered:s.registered,picks:s.picks});
 assert.deepEqual(run.seasons.map(comparable),full.seasons.slice(0,years).map(comparable));
}

function verifyCadenceCalibration(path) {
 verifyManifest(path);
 const snapshot=JSON.parse(readFileSync(`${path}/after-source-snapshot.json`));
 const review=JSON.parse(readFileSync(`${path}/cadence-review.json`));
 assert.equal(review.status,'failed-acceptance');
 assert.deepEqual(review.executedSeeds,[20261015,20261017]);
 assert.deepEqual(review.unexecutedSeeds,[20261016]);
 const runs=review.executedSeeds.map(seed=>{
  const data=JSON.parse(gunzipSync(readFileSync(`${path}/after-${seed}.json.gz`))),run=data.seeds[0];
  assert.equal(data.base,snapshot.sourceCommit);assert.deepEqual(data.sources,snapshot.sources);
  assert.equal(run.seed,seed);assert.equal(run.status,'passed');assert.equal(run.years,10);
  assert.deepEqual(run.seasons.map(s=>s.year),Array.from({length:10},(_,i)=>2026+i));
  assert.ok(run.careerValidation.length>0);
  for(const c of run.careerValidation)assert.deepEqual(c.recordedYears,c.expectedYears);
  const log=gunzipSync(readFileSync(`${path}/after-${seed}.log.gz`)).toString();
  if(seed===20261017)assertCompletedVitestLog(log,1);
  else assert.throws(()=>assertCompletedVitestLog(log,1),'incomplete calibration log must remain explicitly incomplete');
  return run;
 });
 assert.deepEqual(summarizeRookieCohorts(runs),review.cohorts);
 assert.equal(review.cohorts.cpuAnyMultipleYearZero,3);
 verifyDiagnosticPrefix(path,'active-reserve',20261017,9);
 const probe=JSON.parse(gunzipSync(readFileSync(`${path}/active-reserve-probe.json.gz`)));
 for(const [year,reviewCount]of [[2033,8],[2034,10]]){
  const days=probe.farmDays.filter(d=>d.year===year),official=probe.officialDays.filter(d=>d.year===year);
  assert.equal(days.length,143);assert.ok(days.every(d=>d.active&&!d.injury));
  assert.equal(official.length,143);assert.equal(official.reduce((n,d)=>n+d.actualBatEvents,0),0);
  assert.equal(probe.managementDays.filter(d=>d.year===year&&d.scheduled).length,reviewCount);
 }
}

function verifyStoppedEnvironment(path,source) {
 verifyManifest(path);
 const snapshot=JSON.parse(readFileSync(`${path}/source-snapshot.json`));
 assert.equal(snapshot.sourceCommit,source.sourceCommit);assert.deepEqual(snapshot.sources,source.sources);
 for(const seed of [20261015,20261017]){
  const log=gunzipSync(readFileSync(`${path}/seed-${seed}.log.gz`)).toString();
  assert.match(log,/validation source changed during execution/);
  assert.match(log,/ENOTDIR/);assert.throws(()=>assertCompletedVitestLog(log,1));
 }
 const run=JSON.parse(gunzipSync(readFileSync(`${path}/seed-20261017.json.gz`))).seeds[0];
 assert.equal(run.status,'in-progress');assert.equal(run.seasons.length,1);
}

const root='docs/validation/roster-planning-65/ten-year';
const recorded=JSON.parse(readFileSync(`${root}/long-run-summary.json`));
assert.equal(recorded.status,'passed');
for(const artifact of recorded.artifacts){
 const bytes=readFileSync(`${root}/${artifact.path}`);
 assert.equal(bytes.length,artifact.bytes,artifact.path);
 assert.equal(createHash('sha256').update(bytes).digest('hex'),artifact.sha256,artifact.path);
}
// The original PR runs remain immutable historical comparisons. Current
// source must instead match the completed opportunity-fix runs below.
const latestRoot='docs/validation/roster-planning-65/farm-opportunities';
const after=JSON.parse(readFileSync(`${latestRoot}/after-source-snapshot.json`));
for(const [path,expected]of Object.entries(after.sources)){
 if(path.startsWith('@runtime/'))continue;
 assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'),expected,`frozen source differs: ${path}`);
}
const temp=mkdtempSync(join(tmpdir(),'roster-evidence-'));
try{
 for(const variant of ['before','after']){
  mkdirSync(`${temp}/${variant}`);
  writeFileSync(`${temp}/${variant}/source-snapshot.json`,readFileSync(`${root}/${variant}-source-snapshot.json`));
  for(const seed of [20261015,20261016,20261017])for(const extension of ['json','log']){
   writeFileSync(`${temp}/${variant}/seed-${seed}.${extension}`,gunzipSync(readFileSync(`${root}/${variant}-${seed}.${extension}.gz`)));
  }
 }
 const run=spawnSync(process.execPath,['scripts/summarize-roster-long-run.mjs',`${temp}/before`,`${temp}/after`,`${temp}/comparison`],{stdio:['ignore','ignore','inherit']});
 assert.equal(run.status,0,'strict aggregation failed');
 const regenerated=JSON.parse(readFileSync(`${temp}/comparison/long-run-summary.json`));
 assert.equal(regenerated.status,'passed');
 assert.deepEqual(regenerated.summaries,recorded.summaries);
 const calibrationRoot=`${latestRoot}/calibration/rotation-only`;
 const calibration=verifyComparison(calibrationRoot);
 assert.equal(calibration.acceptance.status,'failed');
 assert.equal(calibration.summaries.after.cpuAnyMultipleYearZero,2);
 verifyDiagnosticPrefix(calibrationRoot,'active-bench',20261015,5);
 verifyDiagnosticPrefix(calibrationRoot,'single-year-zero',20261016,3);
 verifyCadenceCalibration(`${latestRoot}/calibration/cadence-only`);
 verifyStoppedEnvironment(`${latestRoot}/calibration/environment-interruption`,after);
 const latest=verifyComparison(latestRoot);
 assert.equal(latest.acceptance.status,'passed');
 assert.equal(latest.summaries.after.cpuAnyMultipleYearZero,0,'CPU draft cohorts still have multiple consecutive zero-opportunity seasons');
 assert.equal(latest.summaries.after.farmUnplayed,0);
 assert.equal(latest.summaries.after.negativeBudgets,0);
 assert.ok(latest.summaries.after.catchers.min>=6);
 console.log('Retained baseline/final runs, failed calibrations, explicitly incomplete/stopped logs, diagnostic prefixes, source hashes and final acceptance verified.');
}finally{rmSync(temp,{recursive:true,force:true});}
