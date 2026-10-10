import LZString from 'lz-string';
import { openBaseballManagerDb, BASEBALL_MANAGER_DB_STORES } from './baseballManagerDb';
import { createSaveId } from './saveIdentity';
import { matchHistoryForSave, matchHistorySnapshot } from './matchHistory';

export const CHUNK_SCOPES = ['seasonHistory', 'news', 'mailbox', 'matchHistory', 'careerLogs'];
export const LEGACY_GENERATION_VERSION = 5;
export const GENERATION_VERSION = 6;
const scopesFor = version => version === LEGACY_GENERATION_VERSION ? CHUNK_SCOPES.slice(0,4) : CHUNK_SCOPES;
const STORE = BASEBALL_MANAGER_DB_STORES.chunks;
const PREFIX = 'generation:';

// A checksum detects truncated/accidentally modified rows; this is not a security signature.
function signature(data) {
  const json = JSON.stringify(data);
  let hash = 2166136261;
  for (let i = 0; i < json.length; i++) hash = Math.imul(hash ^ json.charCodeAt(i), 16777619);
  return `${json.length}:${hash >>> 0}`;
}
function validData(scope, data) {
  if (scope === 'careerLogs') return data?.version === 1 && Array.isArray(data.players)
    && data.players.every(row => Array.isArray(row) && typeof row[0] === 'string' && Array.isArray(row[1]));
  return scope === 'seasonHistory' || scope === 'matchHistory'
    ? !!data && typeof data === 'object' && !Array.isArray(data)
    : Array.isArray(data);
}
async function encodeCareerData(data) {
  const json=JSON.stringify(data);
  if (json.length < 8192) return data;
  if (typeof CompressionStream === 'function' && typeof DecompressionStream === 'function') {
    const stream=new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
    const bytes=new Uint8Array(await new Response(stream).arrayBuffer()),parts=[];
    for(let i=0;i<bytes.length;i+=32768) parts.push(String.fromCharCode(...bytes.subarray(i,i+32768)));
    return {version:1,codec:'gzip-base64',payload:btoa(parts.join(''))};
  }
  return {version:1,codec:'lz-utf16',payload:LZString.compressToUTF16(json)};
}
async function decodeCareerData(data) {
  if (!data?.codec) return data; // Plain version-6 rows remain readable.
  if (data.version !== 1 || typeof data.payload !== 'string') throw new Error('invalid_career_encoding');
  let json;
  if (data.codec === 'lz-utf16') json=LZString.decompressFromUTF16(data.payload);
  else if(data.codec === 'gzip-base64' && typeof DecompressionStream === 'function') {
    const bytes=Uint8Array.from(atob(data.payload),c=>c.charCodeAt(0));
    json=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  } else throw new Error('unsupported_career_encoding');
  const decoded=JSON.parse(json);
  if (!validData('careerLogs',decoded)) throw new Error('invalid_career_payload');
  return decoded;
}
function chunkKey(saveId, generation, scope) {
  return `${PREFIX}${JSON.stringify([saveId, generation, scope])}`;
}
async function readRows(keys) {
  const db = await openBaseballManagerDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const result = new Map();
    for (const key of keys) {
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => result.set(key, req.result);
    }
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onabort = tx.onerror = () => { db.close(); reject(tx.error || new Error('chunk_read_failed')); };
  });
}
function validateManifest(state) {
  const m = state?.saveManifest;
  if (![LEGACY_GENERATION_VERSION,GENERATION_VERSION].includes(state?.saveDataVersion) || m?.version !== state.saveDataVersion
      || m.saveId !== state.saveId || typeof m.saveId !== 'string' || !m.saveId
      || typeof m.generation !== 'string' || !m.generation) throw new Error('invalid_save_manifest');
  for (const scope of scopesFor(m.version)) {
    const ref = m.chunks?.[scope];
    if (!ref || ref.saveId !== m.saveId || ![LEGACY_GENERATION_VERSION,GENERATION_VERSION].includes(ref.version) || ref.version > m.version
        || (scope === 'careerLogs' && ref.version !== GENERATION_VERSION)
        || typeof ref.generation !== 'string' || !ref.generation
        || ref.key !== chunkKey(m.saveId, ref.generation, scope)
        || typeof ref.signature !== 'string') throw new Error(`invalid_chunk_reference:${scope}`);
  }
  return m;
}
async function validateRow(scope, ref, row) {
  if (!row || row.saveId !== ref.saveId || row.generation !== ref.generation || row.scope !== scope
      || row.version !== ref.version || signature(row.data) !== ref.signature) throw new Error(`invalid_chunk:${scope}`);
  const data=scope==='careerLogs'?await decodeCareerData(row.data):row.data;
  if(!validData(scope,data)) throw new Error(`invalid_chunk:${scope}`);
  return data;
}
export async function readGeneration(state) {
  const manifest = validateManifest(state);
  const scopes = scopesFor(manifest.version);
  const rows = await readRows(scopes.map(scope => manifest.chunks[scope].key));
  const loaded = {};
  for (const scope of scopes) {
    const ref = manifest.chunks[scope], row = rows.get(ref.key);
    await validateRow(scope, ref, row);
    if (scope === 'careerLogs') continue; // Validate full history without inflating live React state.
    if (scope === 'matchHistory') Object.assign(loaded, matchHistorySnapshot(row.data));
    else loaded[scope] = row.data;
  }
  return loaded;
}
export async function readCareerGeneration(state) {
  const manifest=validateManifest(state),ref=manifest.chunks.careerLogs;
  if(!ref) throw new Error('career_generation_unavailable');
  const rows=await readRows([ref.key]),row=rows.get(ref.key);
  return validateRow('careerLogs',ref,row);
}
export async function prepareGeneration(state, previous, dirtyScopes, careerData) {
  const generation = createSaveId();
  const manifest = { version: GENERATION_VERSION, saveId: state.saveId, generation, chunks: {} };
  const dirty = new Set(Array.isArray(dirtyScopes) ? dirtyScopes : CHUNK_SCOPES);
  const isDirty = scope => scope === 'careerLogs' ? careerData !== undefined : dirty.has(scope);
  let old = null;
  if (previous?.saveId === state.saveId && previous?.saveDataVersion >= LEGACY_GENERATION_VERSION) {
    // Validate reused data, including missing rows. A corrupt primary must not be inherited.
    old = validateManifest(previous);
    const reused = CHUNK_SCOPES.filter(scope => !isDirty(scope) && old.chunks[scope]);
    if (reused.length) {
      const rows = await readRows(reused.map(scope => old.chunks[scope].key));
      for (const scope of reused) await validateRow(scope, old.chunks[scope], rows.get(old.chunks[scope].key));
    }
  }
  const writes = [];
  for (const scope of CHUNK_SCOPES) {
    if (old?.chunks[scope] && !isDirty(scope)) { manifest.chunks[scope] = old.chunks[scope]; continue; }
    const data = scope === 'careerLogs' ? careerData : scope === 'matchHistory' ? matchHistoryForSave(state)
      : scope === 'seasonHistory' ? state.seasonHistory ?? {} : state[scope] ?? [];
    if (!validData(scope, data)) throw new Error(`invalid_chunk_data:${scope}`);
    const storedData = scope === 'careerLogs' ? await encodeCareerData(data) : data;
    const ref = { key: chunkKey(state.saveId, generation, scope), saveId: state.saveId, generation,
      version: GENERATION_VERSION, signature: signature(storedData) };
    manifest.chunks[scope] = ref;
    writes.push([ref.key, { saveId: state.saveId, generation, version: GENERATION_VERSION, scope, data: storedData }]);
  }
  if (writes.length) {
    const db = await openBaseballManagerDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onabort = tx.onerror = () => { db.close(); reject(tx.error || new Error('chunk_write_failed')); };
      try { for (const [key, row] of writes) tx.objectStore(STORE).add(row, key); }
      catch (error) { tx.abort(); db.close(); reject(error); }
    });
  }
  return { manifest, writeCount: writes.length };
}

// Called only under the save lock. Unknown/invalid roots are retained conservatively.
export async function collectUnusedChunks(roots) {
  const protectedKeys = new Set();
  for (const root of roots) {
    if (root.saveDataVersion >= LEGACY_GENERATION_VERSION) {
      const m = validateManifest(root);
      for (const scope of scopesFor(m.version)) protectedKeys.add(m.chunks[scope].key);
    } else {
      for (const scope of CHUNK_SCOPES) protectedKeys.add(scope);
    }
  }
  const db = await openBaseballManagerDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite'), store = tx.objectStore(STORE);
    const req = store.openKeyCursor(); let deleted = 0;
    req.onsuccess = () => {
      const cursor = req.result; if (!cursor) return;
      if (typeof cursor.key === 'string' && (cursor.key.startsWith(PREFIX) || CHUNK_SCOPES.includes(cursor.key))
          && !protectedKeys.has(cursor.key)) { store.delete(cursor.key); deleted++; }
      cursor.continue();
    };
    tx.oncomplete = () => { db.close(); resolve(deleted); };
    tx.onabort = tx.onerror = () => { db.close(); reject(tx.error || new Error('cleanup_failed')); };
  });
}
