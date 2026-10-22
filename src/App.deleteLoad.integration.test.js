import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import App from './App';
import { saveGame, loadGame, hasSave, getLastLoadResult } from './engine/saveload';
import { readRootBody } from './engine/saveRootBodies';
import { openBaseballManagerDb } from './engine/baseballManagerDb';
import { deferNextSaveRead, holdSaveLock, releaseDeferredSaveOperations } from '../tests/helpers/deferredSaveRead';

const captured = vi.hoisted(() => ({ app: null }));
vi.mock('./engine/player', () => ({ generateForeignFaPool: () => [] }));
vi.mock('./engine/battedBallArchive', () => ({ getBattedBallQueueStatus: () => ({ failedRecords: 0 }), flushBattedBallQueue: async () => ({ ok: true }), deleteBattedBallArchiveBySaveId: async () => {} }));
vi.mock('./hooks/useSeasonFlow', () => ({ useSeasonFlow: () => ({ setPlayoff: () => {} }) }));
vi.mock('./hooks/useOffseason', () => ({ useOffseason: () => ({ resetTransientOffseason: () => {} }) }));
vi.mock('./components/AppScreenRouter', async original => {
  const { default: Router } = await original();
  return { default: ({ app }) => { captured.app = app; return React.createElement(Router, { app }); } };
});
vi.mock('./components/hub/HubShell', () => ({ default: ({ app }) => { captured.app = app; return null; } }));
const primary = 'baseball_manager_v1', keys = [primary, `${primary}_bk1`, `${primary}_bk2`];
const saved = () => ({ ...JSON.parse(gunzipSync(readFileSync(new URL('../e2e/fixtures/new-game.json.gz', import.meta.url)))), saveId: 'delete-load' });
let view, rows;
beforeEach(async () => {
  rows = new Map();
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('localStorage', { getItem: key => rows.get(key) ?? null, setItem: (key, value) => rows.set(key, String(value)), removeItem: key => rows.delete(key) });
  vi.stubGlobal('navigator', { locks: { request: (_name, operation) => Promise.resolve().then(operation) } });
  await saveGame(saved(), { skipCompression: true });
  vi.stubGlobal('window', { confirm: () => true, addEventListener: () => {}, removeEventListener: () => {} });
  await act(async () => { view = create(React.createElement(App)); });
});
afterEach(async () => { await act(async () => { await releaseDeferredSaveOperations(); }); if (view) act(() => view.unmount()); view = null; vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const button = text => view.root.findAllByType('button').find(node => node.children.join('') === text);
const assertTitle = (exists = true) => {
  expect(captured.app.gs.screen).toBe('title'); expect(captured.app.gs.myId).toBeNull();
  expect(captured.app.gs.teams).toEqual([]); expect(captured.app.gs.saveExists).toBe(exists);
  expect(captured.app.loadError).toBeNull();
};
async function beginLoad(outcome = 'saved') {
  if (outcome === 'missing') {
    const key = JSON.parse(await readRootBody(rows.get(primary))).saveManifest.chunks.news.key;
    const db = await openBaseballManagerDb();
    await new Promise(resolve => { const tx = db.transaction('save_chunks', 'readwrite'); tx.objectStore('save_chunks').delete(key); tx.oncomplete = resolve; }); db.close();
  }
  const read = deferNextSaveRead({ abort: outcome === 'error' }); let loading;
  await act(async () => { loading = captured.app.handleLoad(); await read.ready; });
  return { loading, read };
}

it.each(['saved', 'missing', 'error'])('ignores a delayed %s read while actual deletion is waiting for its lock', async outcome => {
  const { loading, read } = await beginLoad(outcome), lock = holdSaveLock();
  let deleting;
  await act(async () => { deleting = button('削除').props.onClick(); await lock.ready; });
  await act(async () => { read.release(); await loading; });
  assertTitle();
  await act(async () => { await lock.release(); await deleting; });
  assertTitle(false); expect(hasSave()).toBe(false);
});

it.each(['saved', 'missing', 'error'])('ignores a delayed %s read after actual deletion completes and saves a fresh game', async outcome => {
  const { loading, read } = await beginLoad(outcome);
  await act(async () => { await button('削除').props.onClick(); });
  await act(async () => { read.release(); await loading; });
  assertTitle(false); expect(getLastLoadResult().status).toBe('none');
  expect((await saveGame({ ...saved(), saveId: 'fresh' })).ok).toBe(true);
  expect((await loadGame()).saveId).toBe('fresh');
});

it('blocks new loads synchronously on confirmation and throughout actual deletion', async () => {
  const lock = holdSaveLock(), handleLoad = captured.app.handleLoad, resume = button('続きから').props.onClick;
  let deleting;
  act(() => { deleting = button('削除').props.onClick(); resume(); });
  await act(async () => { await lock.ready; await handleLoad(); });
  assertTitle();
  for (const node of view.root.findAllByType('button')) expect(node.props.disabled).toBe(true);
  await act(async () => { await lock.release(); await deleting; });
  assertTitle(false);
});

it('does not invalidate a pending load or change roots when deletion is cancelled', async () => {
  const { loading, read } = await beginLoad(), before = keys.map(key => rows.get(key));
  window.confirm = () => false;
  await act(async () => { await button('削除').props.onClick(); read.release(); await loading; });
  expect(captured.app.gs.screen).toBe('hub'); expect(captured.app.gs.saveId).toBe('delete-load');
  expect(keys.map(key => rows.get(key))).toEqual(before);
});

it('retains data and rejects the old load after deletion fails, allowing a load retry', async () => {
  const { loading, read } = await beginLoad(), before = keys.map(key => rows.get(key));
  const remove = vi.spyOn(localStorage, 'removeItem').mockImplementation(() => { throw new Error('delete failed'); });
  await act(async () => { await button('削除').props.onClick(); read.release(); await loading; });
  assertTitle(); expect(keys.map(key => rows.get(key))).toEqual(before);
  expect(view.root.findByProps({ role: 'alert' }).children.join('')).toContain('削除に失敗');
  expect(button('続きから').props.disabled).toBe(false);
  remove.mockRestore();
  await act(async () => { await captured.app.handleLoad(); });
  expect(captured.app.gs.screen).toBe('hub'); expect(captured.app.gs.saveId).toBe('delete-load');
});

it('honors a retry after failed deletion while the invalidated read is still pending', async () => {
  const { loading, read } = await beginLoad();
  const remove = vi.spyOn(localStorage, 'removeItem').mockImplementation(() => { throw new Error('delete failed'); });
  await act(async () => { await button('削除').props.onClick(); });
  remove.mockRestore();
  let retry;
  await act(async () => { retry = captured.app.handleLoad(); });
  await act(async () => { read.release(); await loading; await retry; });
  expect(captured.app.gs.screen).toBe('hub'); expect(captured.app.gs.saveId).toBe('delete-load');
});
