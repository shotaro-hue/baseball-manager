import { expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { combineCompletedCapture } from './roster-completion-capture.mjs';

const fixture = () => {
  const data = { base: 'source', seeds: [{ seed: 20261015, status: 'passed', years: 10,
    seasons: Array.from({ length: 10 }, (_, i) => ({ year: 2026 + i, elapsedMs: 1, farmCards: { unplayed: 0 } })) }] };
  const raw = Buffer.from(JSON.stringify(data));
  return { raw, receipt: { schemaVersion: 1, captureMethod: 'exec_command/write_stdin', sessionId: 60387,
    seed: 20261015, sourceCommit: 'source', rawSha256: createHash('sha256').update(raw).digest('hex'),
    result: { exit_code: 0, output: 'stdout | seed-20261015.test.js > QA-D1: seed 20261015 targets 10 generated seasons with offseason save/reload\n' +
      'QA-D1 season 20261015 2035 ms 1 farm unplayed 0\n' +
      ' ✓ seed-20261015.test.js (1 test) 100ms\nTest Files 1 passed (1)\nTests 1 passed (1)\n' } } };
};

it('preserves both actual captures and explicitly marks the missing stdout interval', () => {
  const { raw, receipt } = fixture(), prefix = 'original file prefix\n';
  const log = combineCompletedCapture(prefix, receipt, raw);
  expect(log.startsWith(prefix)).toBe(true);
  expect(log.endsWith(receipt.result.output)).toBe(true);
  expect(log).toMatch(/stdout gap/);
});

it('rejects failed processes, missing or wrong completion footers, and errors in either capture', () => {
  for (const mutate of [r => { r.result.exit_code = 1; }, r => { r.result.output = 'Test Files 1 passed (1)'; },
    r => { r.result.output = r.result.output.replaceAll('20261015', '20261016'); },
    r => { r.result.output += 'Unhandled Errors'; }]) {
    const { raw, receipt } = fixture(); mutate(receipt);
    expect(() => combineCompletedCapture('prefix', receipt, raw)).toThrow();
  }
  const { raw, receipt } = fixture();
  expect(() => combineCompletedCapture('Worker exited unexpectedly', receipt, raw)).toThrow();
});

it('binds the receipt to the exact seed, frozen source and raw result bytes', () => {
  for (const mutate of [r => { r.seed++; }, r => { r.sourceCommit = 'different'; },
    r => { r.rawSha256 = 'different'; }, r => { r.sessionId = null; }]) {
    const { raw, receipt } = fixture(); mutate(receipt);
    expect(() => combineCompletedCapture('prefix', receipt, raw)).toThrow();
  }
});

it('rejects incomplete years, a wrong final-year marker or a duration shorter than recorded seasons', () => {
  for (const mutate of [r => { r.result.output = r.result.output.replace('2035 ms', '2034 ms'); },
    r => { r.result.output = r.result.output.replace('100ms', '1ms'); }]) {
    const { raw, receipt } = fixture(); mutate(receipt);
    expect(() => combineCompletedCapture('prefix', receipt, raw)).toThrow();
  }
  const { raw, receipt } = fixture(), data = JSON.parse(raw);
  data.seeds[0].seasons.pop();
  const incomplete = Buffer.from(JSON.stringify(data));
  receipt.rawSha256 = createHash('sha256').update(incomplete).digest('hex');
  expect(() => combineCompletedCapture('prefix', receipt, incomplete)).toThrow();
});
