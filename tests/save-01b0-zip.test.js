import { it, expect } from 'vitest';
import { unzipSync, zipSync, strFromU8 } from 'fflate';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createProbeZip, syntheticProbeEntries, PROBE_ENTRY_LIMIT } from '../scripts/save-01b0/zip.js';

it('ZIP contains exact entry bytes and independently recomputable SHA-256 manifest', async () => {
  const bytes = new TextEncoder().encode('打球 probe');
  const { file, metrics } = await createProbeZip({ entries: [{ path: 'archive/000001.bin', bytes }] });
  const decoded = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const manifest = JSON.parse(strFromU8(decoded['manifest.json']));
  expect(decoded['archive/000001.bin']).toEqual(bytes);
  const hash = Buffer.from(await crypto.subtle.digest('SHA-256', bytes)).toString('hex');
  expect(manifest.entries).toEqual([{ path: 'archive/000001.bin', bytes: bytes.length, sha256: hash }]);
  expect(file.type).toBe('application/zip'); expect(metrics.inputBytes).toBe(bytes.length);
  expect(metrics.peakHeapBytes).toBeNull(); // not measurable by this writer
});
it('rejects unsafe or duplicate paths, including the reserved manifest name', async () => {
  const bytes = new Uint8Array(3);
  for (const path of ['../bad', '/archive/a', 'manifest.json', 'archive/../../bad', 'archive/あ.bin']) {
    await expect(createProbeZip({ entries: [{ path, bytes }] })).rejects.toThrow('probe_entry_path');
  }
  await expect(createProbeZip({ entries: [{ path: 'archive/a.bin', bytes }, { path: 'archive/a.bin', bytes }] })).rejects.toThrow('probe_duplicate_path');
});
it('rejects oversized entries and output budgets without yielding a ready file', async () => {
  await expect(createProbeZip({ entries: [{ path: 'archive/a.bin', bytes: new Uint8Array(PROBE_ENTRY_LIMIT + 1) }] })).rejects.toThrow('probe_entry_size');
  await expect(createProbeZip({ entries: syntheticProbeEntries(1024), maxOutputBytes: 100 })).rejects.toThrow('probe_output_budget');
});
it('cancellation midway rejects and cannot report a completed ZIP', async () => {
  const controller = new AbortController();
  await expect(createProbeZip({ entries: syntheticProbeEntries(PROBE_ENTRY_LIMIT * 2), signal: controller.signal,
    onProgress: () => controller.abort() })).rejects.toMatchObject({ name: 'AbortError' });
});
it('incompressible capacity fixture is deterministic and never materializes one huge source entry', async () => {
  const total = PROBE_ENTRY_LIMIT * 4 + 7;
  const collect = async source => { const result = []; for await (const entry of source) result.push(entry); return result; };
  const first = await collect(syntheticProbeEntries(total));
  const second = await collect(syntheticProbeEntries(total));
  expect(first.map(e => e.bytes.length)).toEqual([PROBE_ENTRY_LIMIT, PROBE_ENTRY_LIMIT, PROBE_ENTRY_LIMIT, PROBE_ENTRY_LIMIT, 7]);
  expect(first.every((e, i) => e.path === second[i].path && Buffer.from(e.bytes).equals(Buffer.from(second[i].bytes)))).toBe(true);
  const result = await createProbeZip({ entries: syntheticProbeEntries(total) });
  expect(result.metrics.inputBytes).toBe(total); expect(result.metrics.maxInputEntryBytes).toBe(PROBE_ENTRY_LIMIT);
  expect(result.file.size).toBeGreaterThan(total * 0.95);
});

it('independent Python oracle rejects duplicate manifest rows even with valid ZIP CRC and hashes', async () => {
  const bytes = new Uint8Array(), path = 'archive/a.bin';
  const sha256 = Buffer.from(await crypto.subtle.digest('SHA-256', bytes)).toString('hex');
  const entry = { path, bytes: 0, sha256 };
  const archive = zipSync({ [path]: bytes, 'manifest.json': new TextEncoder().encode(JSON.stringify({ probeFormat: 1, entries: [entry, entry] })) });
  const dir = mkdtempSync(join(tmpdir(), 'save-01b0-oracle-'));
  try {
    const file = join(dir, 'duplicate.zip'); writeFileSync(file, archive);
    const result = spawnSync('python3', ['scripts/save-01b0/verify-zip.py', file], { encoding: 'utf8' });
    expect(result.error).toBeUndefined(); expect(result.status).not.toBe(0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
