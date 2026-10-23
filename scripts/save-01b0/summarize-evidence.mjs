// Select the latest attempt per project while retaining every attempt's counts.
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
const attempts = [], latest = new Map();
for (const path of process.argv.slice(2)) {
  const report = JSON.parse(readFileSync(path, 'utf8')), projects = new Map();
  function visit(suites) {
    for (const suite of suites) {
      for (const spec of suite.specs || []) for (const test of spec.tests) {
        const result = test.results.at(-1), name = test.projectName;
        if (!projects.has(name)) projects.set(name, { project: name, passed: 0, failed: 0, skipped: 0, benchmarks: {} });
        const project = projects.get(name);
        if (result.status === 'passed') project.passed++;
        else if (result.status === 'skipped') project.skipped++;
        else project.failed++;
        for (const attachment of result.attachments || []) {
          if (['capacity-16', 'capacity-64', 'source-sizing', 'independent-zip-verification'].includes(attachment.name)) {
            const text = attachment.body ? Buffer.from(attachment.body, 'base64').toString('utf8') : readFileSync(attachment.path, 'utf8');
            project.benchmarks[attachment.name] = JSON.parse(text);
          }
        }
      }
      visit(suite.suites || []);
    }
  }
  visit(report.suites);
  for (const [name, project] of projects) {
    attempts.push({ report: basename(path), project: name, passed: project.passed, failed: project.failed, skipped: project.skipped });
    latest.set(name, project);
  }
}
const result = { baseMain: '7dc29c0809526ce937e9948b9a0940c7287dc38d',
  environment: { platform: process.platform, arch: process.arch, playwright: '1.56.0',
    browserViewport: '390x844', realIPhone: false, peakMemoryMeasured: false },
  scope: 'Isolated protocol and transport probes. No complete game export/import or frozen package schema.',
  attempts, latestProjects: [...latest.values()] };
writeFileSync('docs/validation/save-01b0/browser-evidence.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result.latestProjects.map(({ project, passed, failed, skipped }) => ({ project, passed, failed, skipped }))));
if (result.latestProjects.length !== 2 || result.latestProjects.some(p => p.failed || p.skipped || p.passed !== 10)) process.exitCode = 1;
