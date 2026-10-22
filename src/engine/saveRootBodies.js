import { openBaseballManagerDb, BASEBALL_MANAGER_DB_STORES } from './baseballManagerDb';
import { createSaveId } from './saveIdentity';
import LZString from 'lz-string';

export const ROOT_BODY_PREFIX = 'root-body:';
export const MAX_INLINE_ROOT_BYTES = 64 * 1024;
const STORE = BASEBALL_MANAGER_DB_STORES.chunks;
const GZIP_PREFIX = 'gzip-json-v1:';

export function rootCompressionApi(json) {
  return json.length * 2 > MAX_INLINE_ROOT_BYTES && typeof CompressionStream === 'function' && typeof DecompressionStream === 'function'
    ? 'CompressionStream' : 'LZString.compressToUTF16';
}
export async function compressRootJson(json) {
  if (rootCompressionApi(json) === 'CompressionStream') {
    const bytes=new Uint8Array(await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
    const parts=[];
    for(let i=0;i<bytes.length;i+=32768)parts.push(String.fromCharCode(...bytes.subarray(i,i+32768)));
    const payload=btoa(parts.join(''));
    return GZIP_PREFIX+signature(payload)+'|'+payload;
  }
  return LZString.compressToUTF16(json);
}
export async function decodeRootJson(raw) {
  if(!raw.startsWith(GZIP_PREFIX))return null;
  if(typeof DecompressionStream!=='function')throw new Error('unsupported_root_encoding');
  const encoded=raw.slice(GZIP_PREFIX.length),separator=encoded.indexOf('|'),payload=encoded.slice(separator+1);
  if(separator<1||encoded.slice(0,separator)!==signature(payload))throw new Error('invalid_root_encoding');
  // Inline roots have the same accidental-corruption protection as referenced bodies.
  // A stream failure with an intact checksum remains an I/O/environment error: fail closed.
  const bytes=Uint8Array.from(atob(payload),c=>c.charCodeAt(0));
  return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
}

// Accidental corruption detection, not an authentication signature.
function signature(raw) {
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i++) hash = Math.imul(hash ^ raw.charCodeAt(i), 16777619);
  return `${raw.length}:${hash >>> 0}`;
}
export function rootBodyReference(raw) {
  if (typeof raw !== 'string' || raw[0] !== '{') return null;
  let ref;
  try { ref = JSON.parse(raw); } catch { return null; }
  if (!Object.hasOwn(ref, 'rootBodyVersion')) return null;
  if (ref.rootBodyVersion !== 1 || typeof ref.key !== 'string' || !ref.key.startsWith(ROOT_BODY_PREFIX)
    || typeof ref.signature !== 'string') throw new Error('invalid_root_reference');
  return ref;
}
async function readRow(key) {
  const db = await openBaseballManagerDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    tx.oncomplete = () => { db.close(); resolve(req.result); };
    tx.onabort = tx.onerror = () => { db.close(); reject(tx.error || new Error('root_body_read_failed')); };
  });
}
export async function readRootBody(raw) {
  const ref = rootBodyReference(raw);
  if (!ref) return raw;
  const row = await readRow(ref.key);
  if (row?.version !== 1 || typeof row.payload !== 'string' || signature(row.payload) !== ref.signature) {
    throw new Error('invalid_root_body');
  }
  return row.payload;
}
export async function prepareRootBody(raw) {
  // Reusing a reference still requires an independent read, never a cached success.
  if (rootBodyReference(raw)) { await readRootBody(raw); return raw; }
  if (raw.length * 2 <= MAX_INLINE_ROOT_BYTES) return raw;
  const key = ROOT_BODY_PREFIX + createSaveId();
  const ref = JSON.stringify({ rootBodyVersion: 1, key, signature: signature(raw) });
  const db = await openBaseballManagerDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onabort = tx.onerror = () => { db.close(); reject(tx.error || new Error('root_body_write_failed')); };
    try { tx.objectStore(STORE).add({ version: 1, payload: raw }, key); }
    catch (error) { tx.abort(); db.close(); reject(error); }
  });
  if (await readRootBody(ref) !== raw) throw new Error('invalid_root_body');
  return ref;
}
