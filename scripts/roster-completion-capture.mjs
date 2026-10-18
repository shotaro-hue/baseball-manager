import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { assertCompletedVitestLog } from './roster-long-run-log.mjs';

// A terminal receipt can preserve a real completion when the separate file
// capture lost its tail. Never synthesize success lines or hide the stdout gap.
export function combineCompletedCapture(filePrefix, receipt, raw) {
  const data = JSON.parse(raw), run = data.seeds[0];
  assert.equal(receipt.schemaVersion, 1);
  assert.equal(receipt.captureMethod, 'exec_command/write_stdin');
  assert.ok(Number.isInteger(receipt.sessionId) && receipt.sessionId > 0);
  assert.equal(receipt.result.exit_code, 0, 'terminal process did not exit successfully');
  assert.equal(receipt.rawSha256, createHash('sha256').update(raw).digest('hex'));
  assert.equal(receipt.sourceCommit, data.base);
  assert.equal(data.seeds.length, 1); assert.equal(receipt.seed, run.seed);
  assert.equal(run.status, 'passed'); assert.equal(run.years, 10);
  assert.deepEqual(run.seasons.map(s => s.year), Array.from({ length: 10 }, (_, i) => 2026 + i));
  const output = receipt.result.output, last = run.seasons.at(-1);
  assertCompletedVitestLog(output, 1);
  assert.ok(output.includes(`seed ${run.seed} targets 10 generated seasons with offseason save/reload`));
  assert.ok(output.includes(`QA-D1 season ${run.seed} ${last.year} ms ${last.elapsedMs} farm unplayed ${last.farmCards.unplayed}`));
  const test = output.match(new RegExp(`seed-${run.seed}\\.test\\.js \\(1 test\\) (\\d+)ms`));
  assert.ok(test, 'terminal completion belongs to a different test');
  assert.ok(Number(test[1]) >= run.seasons.reduce((n, s) => n + s.elapsedMs, 0), 'terminal duration is shorter than recorded seasons');
  const combined = filePrefix + '\n\n[Evidence: separate terminal completion capture follows; stdout gap between captures. Original prefix and receipt are retained separately.]\n' + output;
  assertCompletedVitestLog(combined, 1);
  return combined;
}
