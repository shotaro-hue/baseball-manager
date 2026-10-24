import LZString from 'lz-string';
import { collectUnusedChunks } from '../../src/engine/saveGenerations.js';
import { readRootBody, rootBodyReference, decodeRootJson } from '../../src/engine/saveRootBodies.js';
import { snapshot } from './batted-ball-receipts-browser.js';

const keys = ['baseball_manager_v1', 'baseball_manager_v1_bk1', 'baseball_manager_v1_bk2'];
export async function savedRoots() {
  const roots = [];
  for (const key of keys) {
    const raw = localStorage.getItem(key);
    if (raw == null) continue;
    const body = await readRootBody(raw);
    let json = body;
    if (!body.startsWith('{')) json = await decodeRootJson(body) ?? LZString.decompressFromUTF16(body);
    roots.push({ ...JSON.parse(json), rootBodyKey: rootBodyReference(raw)?.key });
  }
  return roots;
}
export function collect() {
  return navigator.locks.request('baseball-manager-save', async () => {
    const before = keys.map(key => localStorage.getItem(key));
    return collectUnusedChunks(await savedRoots(), { force: true,
      ownsSnapshot: () => keys.every((key, index) => localStorage.getItem(key) === before[index]),
    });
  });
}
export async function measurement() {
  const rows = (await snapshot('save_chunks')).filter(([key]) => key.startsWith('batted-ball-version:'));
  return { rows: rows.length, serializedBytes: rows.reduce((n, row) => n + JSON.stringify(row).length * 2, 0) };
}
