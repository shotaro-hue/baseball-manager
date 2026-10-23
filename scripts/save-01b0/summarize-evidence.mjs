// Select the latest attempt per project while retaining every attempt's counts.
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
const attempts = [], latest = new Map();
const inputs = process.argv.slice(2), previous = inputs.find(arg => arg.startsWith('--previous='));
for (const path of inputs.filter(arg => !arg.startsWith('--previous='))) {
  const report = JSON.parse(readFileSync(path, 'utf8')), projects = new Map();
  function visit(suites) {
    for (const suite of suites) {
      for (const spec of suite.specs || []) for (const test of spec.tests) {
        const result = test.results.at(-1), name = test.projectName;
        const suite = /characterization\//.test(spec.file) ? 'characterization' : 'regression';
        const key = `${suite}:${name}`;
        if (!projects.has(key)) projects.set(key, { suite, project: name, passed: 0, failed: 0, skipped: 0, benchmarks: {} });
        const project = projects.get(key);
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
  for (const [key, project] of projects) {
    attempts.push({ report: basename(path), suite: project.suite, project: project.project,
      passed: project.passed, failed: project.failed, skipped: project.skipped });
    latest.set(key, project);
  }
}
const result = { baseMain: '7dc29c0809526ce937e9948b9a0940c7287dc38d',
  environment: { platform: process.platform, arch: process.arch, playwright: '1.56.0',
    browserViewport: '390x844', realIPhone: false, peakMemoryMeasured: false },
  scope: 'Isolated protocol and transport probes. No complete game export/import or frozen package schema.',
  ...(previous ? { previousEvidence: JSON.parse(readFileSync(previous.slice('--previous='.length), 'utf8')) } : {}),
  attempts, latestProjects: [...latest.values()].filter(p => p.suite === 'regression'),
  latestCharacterizationProjects: [...latest.values()].filter(p => p.suite === 'characterization') };
writeFileSync('docs/validation/save-01b0/browser-evidence.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result.latestProjects.map(({ project, passed, failed, skipped }) => ({ project, passed, failed, skipped }))));
// Explicitly require both reports; missing/failed advisory observations are not
// reported as successful reproduction even though they do not gate product CI.
if (result.latestProjects.length !== 2 || result.latestProjects.some(p => p.failed || p.skipped || p.passed !== 13)
  || result.latestCharacterizationProjects.length !== 2
  || result.latestCharacterizationProjects.some(p => p.failed || p.skipped || p.passed !== 1)) process.exitCode = 1;
