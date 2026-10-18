import { expect, it } from 'vitest';
import { readFileSync,writeFileSync,mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync,gzipSync } from 'node:zlib';
import { summarizeRookieCohorts,loadOpportunityRuns } from './summarize-farm-opportunities.mjs';

it('reproduces the independently retained before/follow-up counts', () => {
  const root = 'docs/validation/roster-planning-65/ten-year';
  for (const [variant, expected] of [['before', [482, 2, 2, 4]], ['after', [664, 5, 3, 9]]]) {
    const runs = [20261015, 20261016, 20261017].map(seed =>
      JSON.parse(gunzipSync(readFileSync(`${root}/${variant}-${seed}.json.gz`))).seeds[0]);
    const report = summarizeRookieCohorts(runs);
    expect([report.cpuCohortsWithFollowingYear, report.cpuFirstYearZero, report.cpuMultipleYearZero, report.cpuLongestZero]).toEqual(expected);
  }
});

it('counts later zero streaks but does not convert absence or user ownership into CPU zero seasons', () => {
  const player = (id, PA) => ({ id, PA, BF: 0, farmPA: 0, farmBF: 0, isPitcher: false });
  const season = (year, cpu, user = []) => ({ year, decisions: year === 2026 ? [{ id: 'late', teamId: 1 }, { id: 'absent', teamId: 1 }, { id: 'user', teamId: 1 }] : [],
    seasonEnd: [{ id: 0, playerUsage: user }, { id: 1, playerUsage: cpu }] });
  const report = summarizeRookieCohorts([{ seed: 1, seasons: [season(2026, []),
    season(2027, [player('late', 40)], [player('user', 0)]), season(2028, [player('late', 0)]),
    season(2029, [player('late', 0), player('absent', 0)])] }]);
  expect(report.cpuCohortsWithFollowingYear).toBe(1);
  expect(report.cpuFirstYearZero).toBe(0);
  expect(report.cpuMultipleYearZero).toBe(0);
  expect(report.cpuAnyMultipleYearZero).toBe(1);
  expect(report.cpuLongestAnyZero).toBe(2);
  expect(report.prolongedCpuPlayers.map(p => p.id)).toEqual(['late']);
});

it('rejects missing measurements instead of classifying them as zero opportunities', () => {
  const run = { seed: 1, seasons: [
    { year: 2026, decisions: [{ id: 'unknown', teamId: 1 }], seasonEnd: [] },
    { year: 2027, decisions: [], seasonEnd: [{ id: 1, playerUsage: [
      { id: 'unknown', PA: null, BF: 0, farmPA: 0, farmBF: 0 },
    ] }] },
  ] };
  expect(() => summarizeRookieCohorts([run])).toThrow(/opportunity measurement/);
});

it('rejects a CPU pick above 67 when its stated exception reason is missing', () => {
  const source='docs/validation/roster-planning-65/ten-year',temp=mkdtempSync(join(tmpdir(),'farm-opportunity-reason-'));
  try {
    const data=JSON.parse(gunzipSync(readFileSync(`${source}/after-20261015.json.gz`)));
    const decision=data.seeds[0].seasons.flatMap(s=>s.decisions).find(d=>d.teamId!==0&&d.projectedCount>67);
    expect(decision).toBeDefined();decision.rosterReason=null;
    writeFileSync(`${temp}/after-source-snapshot.json`,readFileSync(`${source}/after-source-snapshot.json`));
    writeFileSync(`${temp}/after-20261015.log.gz`,readFileSync(`${source}/after-20261015.log.gz`));
    writeFileSync(`${temp}/after-20261015.json.gz`,gzipSync(JSON.stringify(data)));
    for(const seed of [20261016,20261017])for(const extension of ['json','log']){
      writeFileSync(`${temp}/after-${seed}.${extension}.gz`,readFileSync(`${source}/after-${seed}.${extension}.gz`));
    }
    expect(()=>loadOpportunityRuns(temp,'after')).toThrow(/above-target CPU draft reason/);
  } finally { rmSync(temp,{recursive:true,force:true}); }
});

it.each(['current-upgrade', 'future-upgrade'])('rejects a %s exception above 67 without the required 20-point improvement', reason => {
  const source='docs/validation/roster-planning-65/ten-year',temp=mkdtempSync(join(tmpdir(),'farm-opportunity-margin-'));
  try {
    const data=JSON.parse(gunzipSync(readFileSync(`${source}/after-20261015.json.gz`)));
    const decision=data.seeds[0].seasons.flatMap(s=>s.decisions).find(d=>d.teamId!==0&&d.projectedCount>67&&d.rosterReason===reason);
    expect(decision).toBeDefined();
    const key=reason==='current-upgrade'?'current':'future';
    decision[key]=decision[`${key}Baseline`]+19;
    writeFileSync(`${temp}/after-source-snapshot.json`,readFileSync(`${source}/after-source-snapshot.json`));
    writeFileSync(`${temp}/after-20261015.log.gz`,readFileSync(`${source}/after-20261015.log.gz`));
    writeFileSync(`${temp}/after-20261015.json.gz`,gzipSync(JSON.stringify(data)));
    for(const seed of [20261016,20261017])for(const extension of ['json','log']){
      writeFileSync(`${temp}/after-${seed}.${extension}.gz`,readFileSync(`${source}/after-${seed}.${extension}.gz`));
    }
    expect(()=>loadOpportunityRuns(temp,'after')).toThrow(/20-point/);
  } finally { rmSync(temp,{recursive:true,force:true}); }
});
