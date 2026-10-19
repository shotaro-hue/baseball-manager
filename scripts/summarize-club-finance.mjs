import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { summarizeAi03 } from './ai03-summary.mjs';
import { summarizeRookieCohorts } from './summarize-farm-opportunities.mjs';
import { assertValidationSourcesUnchanged } from './roster-long-run-source.mjs';

const [input, output, seedText] = process.argv.slice(2), seed = Number(seedText);
if (!input || !output || !Number.isInteger(seed)) throw Error('Usage: summarize-club-finance.mjs inputDir outputDir seed');
const read = name => readFileSync(`${input}/${name}`);
const data = JSON.parse(read(`seed-${seed}.json`)), run = data.seeds[0];
const receipt = JSON.parse(read(`completion-${seed}.json`));
const report = JSON.parse(read(`vitest-${seed}.json`));
const snapshot = JSON.parse(read(`source-snapshot-${seed}.json`));
assert.equal(receipt.exitCode, 0); assert.equal(receipt.signal, null);
assert.equal(report.success, true); assert.equal(report.numPassedTests, 1); assert.equal(report.numFailedTests, 0);
assert.equal(data.seeds.length, 1); assert.equal(run.seed, seed); assert.equal(run.status, 'passed');
assert.equal(run.seasons.length, run.years); assert.ok(run.years >= 3);
assert.equal(data.base, snapshot.sourceCommit); assert.equal(data.base, receipt.sourceCommit);
assert.deepEqual(data.sources, snapshot.sources); assertValidationSourcesUnchanged(data.sources);
assert.deepEqual(run.seasons.map(s => s.year), Array.from({ length: run.years }, (_, i) => 2026 + i));
assert.ok(run.careerValidation.length > 0);
for (const c of run.careerValidation) assert.deepEqual(c.recordedYears, c.expectedYears);

const annual = [], sum = values => Object.values(values).reduce((a, b) => a + b, 0);
for (const s of run.seasons) {
  assert.equal(s.officialGamesPerTeam, 143); assert.equal(s.financial.length, 12);
  assert.equal(s.farmCards.played, 858); assert.equal(s.farmCards.unplayed, 0);
  for (const phase of ['midseason', 'camp', 'new-season'])
    assert.ok(run.checkpoints.some(c => c.phase === phase && c.year === s.year + Number(phase === 'new-season')));
  for (const clubs of [s.seasonEnd, s.afterOffseason, ...Object.values(s.phases).filter(Array.isArray)]) {
    const ids = clubs.flatMap(t => t.playerUsage.map(p => p.id)); assert.equal(new Set(ids).size, ids.length);
    for (const t of clubs) { assert.ok(t.controlled <= 70); assert.ok(Number.isFinite(t.budget) && t.budget >= 0); }
  }
  for (const f of s.financial) {
    assert.equal(f.year, s.year); assert.equal(f.homeGames + f.awayGames, 143);
    assert.equal(new Set(f.postedRounds).size, 143); assert.equal(f.revenue, sum(f.income));
    assert.equal(f.operatingSurplus, f.revenue - sum(f.costs));
    for (const key of ['sponsor', 'broadcast', 'membership']) assert.equal(f.income[key], f.annual[key]);
    assert.equal(f.costs.fixed, f.annual.fixedCost);
    const end = s.seasonEnd.find(t => t.id === f.teamId), next = s.afterOffseason.find(t => t.id === f.teamId);
    assert.equal(f.budget, end.budget);
    annual.push({ seed, year: s.year, teamId: f.teamId, homeGames: f.homeGames,
      revenue: f.revenue, operatingCosts: sum(f.costs), surplusBeforePlayerPayroll: f.operatingSurplus,
      contractPayroll: end.payroll, salarySubtractedReference: f.operatingSurplus - end.payroll,
      seasonEndBudget: f.budget, nextYearBudget: next.budget, nextYearControlled: next.controlled });
  }
}
const cpu = summarizeAi03([run]), rookies = summarizeRookieCohorts([run]);
const artifacts = [];
mkdirSync(output, { recursive: true });
function save(name, bytes) {
  writeFileSync(`${output}/${name}`, bytes);
  artifacts.push({ name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
for (const name of [`seed-${seed}.json`, `decisions-${seed}.jsonl`]) save(`${name}.gz`, gzipSync(read(name), { level: 9 }));
for (const name of [`source-snapshot-${seed}.json`, `completion-${seed}.json`, `vitest-${seed}.json`]) save(name, read(name));
const summary = { status: 'passed', sourceCommit: data.base, units: '万円', seed, years: run.years,
  clubSeasons: annual.length, checkpoints: run.checkpoints.length, environment: data.environment,
  annual, cpu: { ...cpu, annual: undefined, cohorts: undefined }, rookies, artifacts,
  limitations: ['One seed for three years; not a ten-year or before/after AI comparison.',
    'Real season batch and application hooks; postseason and prize income bypassed; Node storage adapters.',
    'Final-year rookies have no following season. Career final assertions cover continuously owned user players.',
    'Sales and operating costs use game estimates; budget is a spending envelope, not a cash balance.'] };
writeFileSync(`${output}/real-seasons.json`, JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify({ ...summary, annual: undefined, artifacts: undefined, environment: undefined }));
