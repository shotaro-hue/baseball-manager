import React from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import LZString from 'lz-string';
import { gunzipSync } from 'node:zlib';
import { useGameState } from './useGameState';
import { useOffseason } from './useOffseason';
import { saveGame, loadGame, getLastLoadResult, getSaveQueueSnapshot } from '../engine/saveload';
import { openOffseasonRequest, reduceOpenOffseasonRequest } from '../engine/annualOpenOffseason';
import { closedPostseasonWorld } from '../engine/__tests__/fixtures/openOffseason';
import { offseasonPostingWorld } from '../engine/__tests__/fixtures/offseasonPosting';
import { createInitialTeams } from '../engine/bootstrapTeams';
const primary = 'baseball_manager_v1';
let gs, os, view, storage;
beforeEach(() => {
  storage = new Map();
  vi.stubGlobal('localStorage', { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k) });
  vi.stubGlobal('indexedDB', new IDBFactory()); vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  for (const level of ['log', 'warn', 'error', 'table']) vi.spyOn(console, level).mockImplementation(() => {});
});
afterEach(async () => {
  if (view) act(() => view.unmount()); view = null;
  for (let i = 0; i < 150 && getSaveQueueSnapshot().isSaving; i++) await new Promise(r => setTimeout(r, 10));
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});
async function mount(w) {
  function Harness() { gs = useGameState(); os = useOffseason(gs); return null; }
  await act(async () => { view = create(React.createElement(Harness)); });
  act(() => expect(gs.hydrateSavedWorld(w, { progressToken: gs.getProgressToken(), sessionToken: gs.getProgressSessionToken() })).toBe(true));
}
async function setup(w = closedPostseasonWorld()) {
  expect((await saveGame(w, { skipCompression: true })).ok).toBe(true);
  const loaded = await loadGame(); await mount(loaded); return loaded;
}
async function run(operation) {
  let task, result, done = false;
  act(() => { task = Promise.resolve(operation()).then(r => { result = r; done = true; }); });
  for (let i = 0; i < 150 && !done; i++) await act(async () => { await new Promise(r => setTimeout(r, 10)); });
  await task; await act(async () => {}); return result;
}
const request = () => openOffseasonRequest(gs);
const commit = r => { expect(gs.commitOpenOffseasonRequest).toBeTypeOf('function'); return gs.commitOpenOffseasonRequest(r ?? request(), gs.getProgressSessionToken()); };
const roots = () => [primary, `${primary}_bk1`, `${primary}_bk2`].map(k => storage.get(k));

it('publishes and adopts the entire bootstrap closing candidate before acknowledging its identity and revision', async () => {
  const w = await setup(closedPostseasonWorld(createInitialTeams())), r = request(), expected = reduceOpenOffseasonRequest(w, r).world;
  const before = structuredClone(gs.teams), result = await run(() => commit(r));
  expect(result).toMatchObject({ ok: true, committed: { saveId: w.saveId, epoch: w.contractEconomy.epoch, revision: 1 } });
  expect(result.committed.rootSignature).toMatch(/^[a-f0-9]{64}$/);
  expect(gs.contractEconomy).toEqual(expected.contractEconomy); expect(gs.offseasonPlan).toEqual(w.offseasonPlan);
  expect(gs.teams.map(t => t.players)).toEqual(before.map(t => t.players));
  expect(gs.year).toBe(2026); expect(gs.contractEconomy.engine.spending.budgetSeason).toBe(2027); expect(gs.saveDirty).toBe(false);
  const loaded = await loadGame(); expect(loaded.contractEconomy).toEqual(gs.contractEconomy); expect(loaded.teams).toEqual(gs.teams);
});

it('keeps all roots and the live world on publication failure and retries the identical boundary once', async () => {
  await setup(); const r = request(), before = structuredClone(gs.contractEconomy), original = roots(), write = localStorage.setItem;
  localStorage.setItem = (k, v) => { if (k === primary) throw Error('full'); write(k, v); };
  expect((await run(() => commit(r))).ok).toBe(false); expect(roots()).toEqual(original); expect(gs.contractEconomy).toEqual(before);
  localStorage.setItem = write;
  expect(await run(() => commit(r))).toMatchObject({ ok: true, committed: { revision: 1 } });
  expect(gs.contractEconomy.cycle.transitionReceipts).toHaveLength(1);
  expect((await loadGame()).contractEconomy).toEqual(gs.contractEconomy);
});

it('blocks simultaneous operations and replays a completed request without another publication', async () => {
  await setup(); const r = request(); let duplicate;
  expect(await run(() => { const a = commit(r); duplicate = commit(r); return a; })).toMatchObject({ ok: true });
  expect(await duplicate).toMatchObject({ ok: false, reason: 'economy_commit_pending' });
  const published = roots(); expect(await run(() => commit(r))).toEqual({ ok: true, replayed: true });
  expect(roots()).toEqual(published); expect(gs.contractEconomy.cycle.transitionReceipts).toHaveLength(1);
});

it('holds domain and ordinary-save barriers while publishing the boundary', async () => {
  await setup(); const r = request(), write = localStorage.setItem; let progress, manual;
  localStorage.setItem = (k, v) => {
    if (k === primary && !manual) {
      const before = gs.getProgressToken();
      act(() => { gs.setGameDay(1); gs.setSaveId('stale'); gs.setOffseasonPlan(null); });
      progress = { unchanged: gs.getProgressToken() === before, day: gs.gameDay, saveId: gs.saveId, hasPlayoff: !!gs.offseasonPlan.playoff };
      manual = gs.handleSave();
    }
    write(k, v);
  };
  expect(await run(() => commit(r))).toMatchObject({ ok: true });
  expect(progress).toEqual({ unchanged: true, day: 144, saveId: r.saveId, hasPlayoff: true });
  expect(await manual).toMatchObject({ ok: false, reason: 'economy_commit_pending' });
});

it('rejects an old session and a replaced source revision before publishing', async () => {
  await setup(); const r = request(), original = roots();
  expect(gs.commitOpenOffseasonRequest).toBeTypeOf('function');
  expect(await run(() => gs.commitOpenOffseasonRequest(r, gs.getProgressSessionToken() + 1))).toMatchObject({ ok: false, reason: 'economy_session_conflict' });
  expect(await run(() => commit({ ...r, baseRevision: r.baseRevision + 1 }))).toMatchObject({ ok: false, reason: 'economy_command_invalid' });
  expect(roots()).toEqual(original); expect(gs.contractEconomy.revision).toBe(0);
});

it('rejects an old handler after rehydration rather than using its old confirmation in a new session', async () => {
  const w = await setup();
  expect(os.handleOpenAnnualOffseason).toBeTypeOf('function');
  const old = os.handleOpenAnnualOffseason, session = gs.getProgressSessionToken(), original = roots();
  act(() => expect(gs.hydrateSavedWorld(w, { progressToken: gs.getProgressToken(), sessionToken: session })).toBe(true));
  expect(gs.getProgressSessionToken()).not.toBe(session);
  expect(await run(old)).toBe(false); expect(roots()).toEqual(original); expect(gs.contractEconomy.revision).toBe(0);
});

it('recovers an already published boundary after acknowledgement interruption without another write', async () => {
  await setup(); const r = request(), read = localStorage.getItem; let interrupted = false;
  localStorage.getItem = k => {
    if (k === primary && gs.contractEconomy?.revision === 1 && !interrupted) { interrupted = true; throw Error('ack interrupted'); }
    return read(k);
  };
  expect(await run(() => commit(r))).toMatchObject({ ok: false, reason: 'economy_adoption_required' });
  expect(gs.isEconomyRecoveryPending).toBe(true); const published = roots();
  localStorage.getItem = read;
  expect(await run(() => gs.recoverEconomyCommand())).toMatchObject({ ok: true, committed: { revision: 1 } });
  expect(roots()).toEqual(published); expect(gs.isEconomyRecoveryPending).toBe(false);
  expect(gs.contractEconomy.cycle.transitionReceipts).toHaveLength(1);
  expect(await run(() => commit(r))).toEqual({ ok: true, replayed: true });
});

it('does not adopt a substituted published root even if its storage generation matches', async () => {
  await setup(); const r = request(), before = structuredClone(gs.contractEconomy), write = localStorage.setItem;
  localStorage.setItem = (k, v) => {
    if (k === primary) {
      // The real hook publishes compressed roots; substitute content after
      // decoding rather than making the injection itself throw on JSON.parse.
      const json = v.startsWith('gzip-json-v1:') ? gunzipSync(Buffer.from(v.slice(v.indexOf('|') + 1), 'base64')).toString()
        : LZString.decompressFromUTF16(v) || v;
      const bad = JSON.parse(json);
      bad.contractEconomy.epoch = 'another-epoch'; v = JSON.stringify(bad);
    }
    write(k, v);
  };
  expect(await run(() => commit(r))).toMatchObject({ ok: false, reason: 'economy_adoption_required' });
  expect(gs.contractEconomy).toEqual(before); expect(gs.isEconomyRecoveryPending).toBe(true);
});

it('replays after cold remount and retains the opened receipt through backup recovery', async () => {
  await setup(); const r = request(); expect((await run(() => commit(r))).ok).toBe(true);
  const first = await loadGame();
  // Ordinary backup rotation has a five-minute cooldown. Exercise a real
  // subsequent rotation without sleeping or changing that production policy.
  storage.delete('baseball_manager_v1_last_rotate_at');
  expect((await saveGame(first, { skipCompression: true })).ok).toBe(true);
  act(() => view.unmount()); view = null; storage.set(primary, 'corrupt-primary');
  const recovered = await loadGame(); expect(getLastLoadResult().status).toBe('recovered');
  expect(recovered.contractEconomy).toEqual(first.contractEconomy); await mount(recovered);
  const published = roots(); expect(await run(() => commit(r))).toEqual({ ok: true, replayed: true });
  expect(roots()).toEqual(published); expect(gs.contractEconomy.cycle.transitionReceipts).toHaveLength(1);
});

it('opens through the annual handler and stops before legacy retirement/growth/next-spring processing', async () => {
  const w = await setup(), before = structuredClone(gs.teams);
  expect(await run(() => os.handleRetirePhaseNext({}))).toBe(false);
  expect(gs.contractEconomy.clock).toMatchObject({ phase: 'offseason', date: '2026-12-01' });
  expect(gs.contractEconomy.cycle.stage).toBe('offseason-open'); expect(gs.year).toBe(w.year);
  expect(gs.teams.map(t => t.players)).toEqual(before.map(t => t.players)); expect(gs.offseasonPlan).toEqual(w.offseasonPlan);
  expect(gs.contractEconomy.engine.transactions).toHaveLength(0);
});

it('keeps nonempty retirement decisions outside the narrow boundary operation', async () => {
  await setup(); const original = roots();
  expect(await run(() => os.handleRetirePhaseNext({ player: 'accepted' }))).toBe(false);
  expect(roots()).toEqual(original); expect(gs.contractEconomy.revision).toBe(0);
});

it.each(['legacy', 'explicit-legacy', 'older-native-winter'])('preserves a %s save without opening or implicitly converting it', async mode => {
  let w = mode === 'older-native-winter' ? offseasonPostingWorld() : closedPostseasonWorld();
  const r = mode === 'older-native-winter' ? openOffseasonRequest(closedPostseasonWorld()) : openOffseasonRequest(w);
  if (mode === 'legacy') delete w.contractEconomy;
  if (mode === 'explicit-legacy') w.contractEconomy = { schemaVersion: 1, mode: 'legacy' };
  await setup(w); const original = roots(), e = structuredClone(gs.contractEconomy);
  expect((await run(() => commit(r))).ok).toBe(false); expect(gs.contractEconomy).toEqual(e); expect(roots()).toEqual(original);
  expect((await loadGame()).contractEconomy).toEqual(e);
});
