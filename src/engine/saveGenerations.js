import { openBaseballManagerDb, BASEBALL_MANAGER_DB_STORES } from './baseballManagerDb';
import { createSaveId } from './saveIdentity';
import { matchHistoryForSave, matchHistorySnapshot } from './matchHistory';

export const CHUNK_SCOPES = ['seasonHistory', 'news', 'mailbox', 'matchHistory'];
export const GENERATION_VERSION = 5;
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
  return scope === 'seasonHistory' || scope === 'matchHistory'
    ? !!data && typeof data === 'object' && !Array.isArray(data)
    : Array.isArray(data);
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
  if (state?.saveDataVersion !== GENERATION_VERSION || m?.version !== GENERATION_VERSION
      || m.saveId !== state.saveId || typeof m.saveId !== 'string' || !m.saveId
      || typeof m.generation !== 'string' || !m.generation) throw new Error('invalid_save_manifest');
  for (const scope of CHUNK_SCOPES) {
    const ref = m.chunks?.[scope];
    if (!ref || ref.saveId !== m.saveId || ref.version !== GENERATION_VERSION
        || typeof ref.generation !== 'string' || !ref.generation
        || ref.key !== chunkKey(m.saveId, ref.generation, scope)
        || typeof ref.signature !== 'string') throw new Error(`invalid_chunk_reference:${scope}`);
  }
  return m;
}
function validateRow(scope, ref, row) {
  if (!row || row.saveId !== ref.saveId || row.generation !== ref.generation || row.scope !== scope
      || row.version !== GENERATION_VERSION || !validData(scope, row.data)
      || signature(row.data) !== ref.signature) throw new Error(`invalid_chunk:${scope}`);
}
export async function readGeneration(state) {
  const manifest = validateManifest(state);
  const rows = await readRows(CHUNK_SCOPES.map(scope => manifest.chunks[scope].key));
  const loaded = {};
  for (const scope of CHUNK_SCOPES) {
    const ref = manifest.chunks[scope], row = rows.get(ref.key);
    validateRow(scope, ref, row);
    if (scope === 'matchHistory') Object.assign(loaded, matchHistorySnapshot(row.data));
    else loaded[scope] = row.data;
  }
  return loaded;
}
export async function prepareGeneration(state, previous, dirtyScopes) {
  const generation = createSaveId();
  const manifest = { version: GENERATION_VERSION, saveId: state.saveId, generation, chunks: {} };
  const dirty = new Set(Array.isArray(dirtyScopes) ? dirtyScopes : CHUNK_SCOPES);
  let old = null;
  if (previous?.saveId === state.saveId && previous?.saveDataVersion === GENERATION_VERSION) {
    // Validate reused data, including missing rows. A corrupt primary must not be inherited.
    old = validateManifest(previous);
    const reused = CHUNK_SCOPES.filter(scope => !dirty.has(scope));
    if (reused.length) {
      const rows = await readRows(reused.map(scope => old.chunks[scope].key));
      for (const scope of reused) validateRow(scope, old.chunks[scope], rows.get(old.chunks[scope].key));
    }
  }
  const writes = [];
  for (const scope of CHUNK_SCOPES) {
    if (old && !dirty.has(scope)) { manifest.chunks[scope] = old.chunks[scope]; continue; }
    const data = scope === 'matchHistory' ? matchHistoryForSave(state)
      : scope === 'seasonHistory' ? state.seasonHistory ?? {} : state[scope] ?? [];
    if (!validData(scope, data)) throw new Error(`invalid_chunk_data:${scope}`);
    const ref = { key: chunkKey(state.saveId, generation, scope), saveId: state.saveId, generation,
      version: GENERATION_VERSION, signature: signature(data) };
    manifest.chunks[scope] = ref;
    writes.push([ref.key, { saveId: state.saveId, generation, version: GENERATION_VERSION, scope, data }]);
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
    if (root.saveDataVersion >= GENERATION_VERSION) {
      const m = validateManifest(root);
      for (const scope of CHUNK_SCOPES) protectedKeys.add(m.chunks[scope].key);
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
