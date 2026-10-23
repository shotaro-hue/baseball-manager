// Experimental transport only. Not a game backup writer or untrusted ZIP reader.
import { Zip, ZipDeflate } from 'fflate';
export const PROBE_ENTRY_LIMIT = 256 * 1024;
const ENTRY_COUNT_LIMIT = 4096;
const checkAbort = signal => { if (signal?.aborted) throw new DOMException('Probe cancelled', 'AbortError'); };
const digest = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(v => v.toString(16).padStart(2, '0')).join('');

export async function createProbeZip({ entries, signal, onProgress, maxOutputBytes = 128 * 1024 * 1024 }) {
  const start = performance.now(), parts = [], manifest = { probeFormat: 1, entries: [] }, seen = new Set();
  let outputBytes = 0, inputBytes = 0, maxInputEntryBytes = 0, zipError, finalized = false;
  const zip = new Zip((error, bytes, final) => {
    if (error) { zipError = error; return; }
    outputBytes += bytes.length;
    if (outputBytes > maxOutputBytes) { zipError = new Error('probe_output_budget'); return; }
    // Each callback's bytes are immediately owned by a Blob, not accumulated
    // as a growing Uint8Array. Browser/OS Blob backing memory is unmeasured.
    if (bytes.length) parts.push(new Blob([bytes]));
    finalized = final;
  });
  const append = (path, bytes) => {
    const entry = new ZipDeflate(path, { level: 1 }); zip.add(entry); entry.push(bytes, true);
    if (zipError) throw zipError;
  };
  try {
    for await (const source of entries) {
      checkAbort(signal);
      const { path, bytes } = source;
      if (typeof path !== 'string' || !/^archive\/[a-zA-Z0-9_-]+\.bin$/.test(path)) throw new Error('probe_entry_path');
      if (seen.has(path)) throw new Error('probe_duplicate_path');
      if (seen.size >= ENTRY_COUNT_LIMIT) throw new Error('probe_entry_count');
      if (!(bytes instanceof Uint8Array) || bytes.length > PROBE_ENTRY_LIMIT) throw new Error('probe_entry_size');
      // Own the bounded bytes across the asynchronous digest call.
      const owned = bytes.slice(); seen.add(path);
      manifest.entries.push({ path, bytes: owned.length, sha256: await digest(owned) });
      checkAbort(signal); append(path, owned);
      inputBytes += owned.length; maxInputEntryBytes = Math.max(maxInputEntryBytes, owned.length);
      onProgress?.({ inputBytes, outputBytes, entries: seen.size });
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    checkAbort(signal);
    append('manifest.json', new TextEncoder().encode(JSON.stringify(manifest)));
    zip.end(); if (zipError) throw zipError;
    if (!finalized) throw new Error('probe_zip_incomplete');
    const file = new File(parts, 'save-01b0-probe.zip', { type: 'application/zip' });
    return { file, manifest, metrics: { inputBytes, outputBytes: file.size, entries: seen.size,
      maxInputEntryBytes, elapsedMs: performance.now() - start, peakHeapBytes: null } };
  } catch (error) { zip.terminate(); throw error; }
}

export async function* syntheticProbeEntries(totalBytes) {
  if (!Number.isSafeInteger(totalBytes) || totalBytes < 0) throw new Error('probe_fixture_size');
  // Fixture contract: xorshift32, seed 20261023, high byte, continuous across
  // entries. The Python oracle independently reconstructs this input in blocks.
  let seed = 20261023;
  for (let offset = 0, i = 0; offset < totalBytes; offset += PROBE_ENTRY_LIMIT, i++) {
    const bytes = new Uint8Array(Math.min(PROBE_ENTRY_LIMIT, totalBytes - offset));
    for (let j = 0; j < bytes.length; j++) {
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; bytes[j] = seed >>> 24;
    }
    yield { path: `archive/${String(i).padStart(6, '0')}.bin`, bytes };
  }
}
