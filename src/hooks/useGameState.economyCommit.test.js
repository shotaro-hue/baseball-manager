import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { useGameState } from './useGameState';
import { saveGame, loadGame, loadPlayerCareerLogById } from '../engine/saveload';
import { economyFixture, renewalEnvelope } from '../engine/__tests__/fixtures/economyWorld';

const primary = 'baseball_manager_v1';
let gs, view, rows, renders;
beforeEach(() => {
  rows = new Map(); renders = [];
  vi.stubGlobal('localStorage', {
    getItem: name => rows.get(name) ?? null,
    setItem: (name, value) => rows.set(name, String(value)),
    removeItem: name => rows.delete(name),
  });
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  for (const level of ['log', 'warn', 'error', 'table'])
    vi.spyOn(console, level).mockImplementation(() => {});
});
afterEach(() => {
  if (view) act(() => view.unmount());
  view = null;
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

async function setupAnnual() {
  const world = economyFixture();
  expect((await saveGame(world, { skipCompression: true })).ok).toBe(true);
  function Harness() {
    gs = useGameState();
    renders.push({ world: gs.contractEconomy, team: gs.teams[0], dirty: gs.saveDirty });
    return null;
  }
  await act(async () => { view = create(React.createElement(Harness)); });
  const loaded = await loadGame();
  act(() => expect(gs.hydrateSavedWorld(loaded, {
    progressToken: gs.getProgressToken(), sessionToken: gs.getProgressSessionToken(),
  })).toBe(true));
  expect(gs.contractEconomy.revision).toBe(0);
  expect(gs.commitEconomyCommand).toBeTypeOf('function');
  return loaded;
}

async function commitCommand(command, revision = 1) {
  let task;
  act(() => { task = gs.commitEconomyCommand(command); });
  // The hook deliberately waits for an actual React reducer commit before
  // acknowledging the published root. Give react-test-renderer act boundaries
  // a chance to flush without awaiting that promise inside the same act.
  for (let i = 0; i < 80 && gs.contractEconomy?.revision !== revision; i++)
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  const result = await task;
  await act(async () => {});
  return result;
}

it('publishes a command, waits for atomic hook adoption, and acknowledges the actual receipt', async () => {
  const world = await setupAnnual();
  const since = renders.length;
  const result = await commitCommand(renewalEnvelope(world));
  expect(result, result.reason).toMatchObject({
    ok: true, committed: { saveId: world.saveId, revision: 1, receiptIds: [0] },
  });
  expect(result.committed.rootSignature).toMatch(/^[a-f0-9]{64}$/);
  expect(gs.contractEconomy.revision).toBe(1);
  expect(gs.contractEconomy.engine.transactions.map(item => item.id)).toEqual([0]);
  expect(gs.teams[0].players[0].salary).toBe(world.teams[0].players[0].salary);
  expect(renders.slice(since).filter(item => item.world?.revision === 1)
    .every(item => item.team?.players[0]?.contractId === gs.teams[0].players[0].contractId)).toBe(true);
  const loaded = await loadGame();
  expect(loaded.contractEconomy).toEqual(gs.contractEconomy);
  expect(loaded.mailbox).toEqual(gs.mailbox);
  expect(gs.saveDirty).toBe(false);
});

it('includes pending career writes only in an acknowledged annual commit', async () => {
  const world = await setupAnnual();
  const entry = { year: 2025, teamId: 0, teamName: '球団', stats: { HR: 7 } };
  act(() => gs.stageCareerEntries([{ playerId: 0, careerEntry: entry }]));
  expect(gs.saveDirty).toBe(true);
  const result = await commitCommand(renewalEnvelope(world));
  expect(result.ok).toBe(true);
  expect(gs.saveDirty).toBe(false);
  expect(await loadPlayerCareerLogById('0', world.saveId)).toEqual([entry]);
  expect((await loadGame()).contractEconomy.revision).toBe(1);
});

it('does not adopt or clear dirty state/career entries on a failed publish, then allows a retry', async () => {
  const world = await setupAnnual();
  const entry = { year: 2025, teamId: 0, teamName: '球団', stats: { HR: 9 } };
  act(() => gs.stageCareerEntries([{ playerId: 0, careerEntry: entry }]));
  const raw = rows.get(primary);
  const setter = localStorage.setItem;
  localStorage.setItem = (name, value) => {
    if (name === primary) throw new Error('blocked');
    setter(name, value);
  };
  let task;
  act(() => { task = gs.commitEconomyCommand(renewalEnvelope(world)); });
  const failure = await task;
  expect(failure.ok).toBe(false);
  expect(gs.contractEconomy.revision).toBe(0);
  expect(gs.saveDirty).toBe(true);
  expect(rows.get(primary)).toBe(raw);
  localStorage.setItem = setter;
  const result = await commitCommand(renewalEnvelope(world));
  expect(result.ok).toBe(true);
  expect(await loadPlayerCareerLogById('0', world.saveId)).toEqual([entry]);
});

it('holds the hook domain/save barrier while the published commit is in flight', async () => {
  const world = await setupAnnual();
  const originalSet = localStorage.setItem;
  let blockedSave, progressDuringWrite;
  localStorage.setItem = (name, value) => {
    if (name === primary && !blockedSave) {
      const before = gs.getProgressToken();
      act(() => { gs.setGameDay(90); gs.setSaveId('stale'); gs.stageCareerEntries([{ playerId: 'late', careerEntry: {} }]); });
      progressDuringWrite = [before, gs.getProgressToken(), gs.gameDay, gs.saveId];
      blockedSave = gs.handleSave();
    }
    originalSet(name, value);
  };
  const result = await commitCommand(renewalEnvelope(world));
  expect(result.ok).toBe(true);
  expect(await blockedSave).toMatchObject({ ok: false, reason: 'economy_commit_pending' });
  expect(progressDuringWrite).toEqual([progressDuringWrite[0], progressDuringWrite[0], 1, world.saveId]);
  expect(gs.getProgressSessionToken()).toBe(1);
  expect((await loadGame()).contractEconomy.revision).toBe(1);
  localStorage.setItem = originalSet;
});

it('rejects legacy mode and stale/invalid commands without publishing a root', async () => {
  const world = await setupAnnual();
  const raw = rows.get(primary);
  const invalid = { ...renewalEnvelope(world), saveId: 'other-game' };
  expect((await gs.commitEconomyCommand(invalid))).toMatchObject({ ok: false, reason: 'economy_command_invalid' });
  expect(rows.get(primary)).toBe(raw);
  const legacy = { ...world }; delete legacy.contractEconomy;
  act(() => expect(gs.hydrateSavedWorld(legacy, {
    progressToken: gs.getProgressToken(), sessionToken: gs.getProgressSessionToken(),
  })).toBe(true));
  expect((await gs.commitEconomyCommand(renewalEnvelope(world))).ok).toBe(false);
  expect(rows.get(primary)).toBe(raw);
});


it('uses the latest history snapshot even when invoked through an older callback', async () => {
  const world = await setupAnnual();
  const olderCommit = gs.commitEconomyCommand;
  act(() => {
    gs.setSeasonHistory({ transfers: [{ id: 'latest-transfer' }] });
    gs.setGameResultsMap({ 1: { score: 'latest-result' } });
  });
  let task;
  act(() => { task = olderCommit(renewalEnvelope(world)); });
  for (let i = 0; i < 80 && gs.contractEconomy.revision !== 1; i++)
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  expect((await task).ok).toBe(true);
  const restored = await loadGame();
  expect(restored.seasonHistory.transfers).toEqual([{ id: 'latest-transfer' }]);
  expect(restored.gameResultsMap).toEqual({ 1: { score: 'latest-result' } });
  expect(gs.saveDirty).toBe(false);
});

it('refuses a commit until queued history updates have actually rendered', async () => {
  const world = await setupAnnual();
  const raw = rows.get(primary);
  let task;
  act(() => {
    gs.setSeasonHistory({ transfers: [{ id: 'queued-transfer' }] });
    task = gs.commitEconomyCommand(renewalEnvelope(world));
  });
  expect(await task).toMatchObject({ ok: false, reason: 'economy_operation_busy' });
  expect(rows.get(primary)).toBe(raw);
  expect(gs.saveDirty).toBe(true);
  expect((await commitCommand(renewalEnvelope(world))).ok).toBe(true);
  expect((await loadGame()).seasonHistory.transfers).toEqual([{ id: 'queued-transfer' }]);
});

it('recovers after React adoption but interrupted acknowledgement without another write or duplicate career entry', async () => {
  const world = await setupAnnual();
  const entry = { year: 2025, teamId: 0, stats: { HR: 11 } };
  act(() => gs.stageCareerEntries([{ playerId: 0, careerEntry: entry }]));
  const get = localStorage.getItem;
  let interrupted = false;
  localStorage.getItem = name => {
    if (name === primary && gs.contractEconomy?.revision === 1 && !interrupted) {
      interrupted = true; throw new Error('read interrupted after React adoption');
    }
    return get(name);
  };
  expect(await commitCommand(renewalEnvelope(world))).toMatchObject({ ok: false, reason: 'economy_adoption_required' });
  localStorage.getItem = get;
  const published = [primary, primary + '_bk1', primary + '_bk2'].map(k => rows.get(k));
  expect(gs.saveDirty).toBe(true);
  let recovered;
  await act(async () => { recovered = await gs.recoverEconomyCommand(); });
  expect(recovered).toMatchObject({ ok: true, committed: { revision: 1, receiptIds: [0] } });
  expect([primary, primary + '_bk1', primary + '_bk2'].map(k => rows.get(k))).toEqual(published);
  expect(gs.saveDirty).toBe(false);
  expect(await loadPlayerCareerLogById('0', world.saveId)).toEqual([entry]);
  expect(await gs.recoverEconomyCommand()).toMatchObject({ ok: false, reason: 'economy_recovery_unavailable' });
});

it('does not start a transaction through an unmounted hook callback', async () => {
  const world = await setupAnnual();
  const commit = gs.commitEconomyCommand;
  const timer = globalThis.setTimeout;
  vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn, ms, ...args) => timer(fn, ms === 10000 ? 25 : ms, ...args));
  const raw = rows.get(primary);
  act(() => view.unmount()); view = null;
  expect(await commit(renewalEnvelope(world))).toMatchObject({ ok: false });
  expect(rows.get(primary)).toBe(raw);
});

it('retains dirty state when reset tracking is attempted during publication', async () => {
  const world = await setupAnnual();
  act(() => gs.stageCareerEntries([{ playerId: 0, careerEntry: { year: 2025, stats: { HR: 13 } } }]));
  const set = localStorage.setItem;
  localStorage.setItem = (name, value) => {
    if (name === primary) { act(() => gs.resetSaveTracking()); throw new Error('publish failed'); }
    set(name, value);
  };
  expect((await gs.commitEconomyCommand(renewalEnvelope(world))).ok).toBe(false);
  expect(gs.saveDirty).toBe(true);
  localStorage.setItem = set;
});

it('can explicitly acknowledge the published root after unmount and remount', async () => {
  const world = await setupAnnual();
  const entry = { year: 2025, teamId: 0, stats: { HR: 17 } };
  act(() => gs.stageCareerEntries([{ playerId: 0, careerEntry: entry }]));
  const timer = globalThis.setTimeout;
  vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn, ms, ...args) => timer(fn, ms === 10000 ? 25 : ms, ...args));
  const set = localStorage.setItem;
  localStorage.setItem = (name, value) => {
    set(name, value);
    if (name === primary) { act(() => view.unmount()); view = null; }
  };
  expect(await gs.commitEconomyCommand(renewalEnvelope(world))).toMatchObject({ ok: false, reason: 'economy_adoption_required' });
  localStorage.setItem = set;
  const published = [primary, primary + '_bk1', primary + '_bk2'].map(k => rows.get(k));
  function Remount() { gs = useGameState(); return null; }
  await act(async () => { view = create(React.createElement(Remount)); });
  const loaded = await loadGame();
  act(() => expect(gs.hydrateSavedWorld(loaded, {
    progressToken: gs.getProgressToken(), sessionToken: gs.getProgressSessionToken(),
  })).toBe(true));
  let result;
  await act(async () => { result = await gs.recoverEconomyCommand(); });
  expect(result).toMatchObject({ ok: true, committed: { revision: 1, receiptIds: [0] } });
  expect([primary, primary + '_bk1', primary + '_bk2'].map(k => rows.get(k))).toEqual(published);
  expect(await loadPlayerCareerLogById('0', world.saveId)).toEqual([entry]);
  await act(async () => { result = await gs.handleSave({ silent: true }); });
  expect(result.ok).toBe(true);
});

it('never acknowledges a suspended render and recovers after the adoption deadline', async () => {
  const world = economyFixture();
  expect((await saveGame(world, { skipCompression: true })).ok).toBe(true);
  let suspend = false, committedRevision, expire;
  const gate = new Promise(() => {});
  function Blocker({ revision }) { if (suspend && revision === 1) throw gate; return null; }
  function Harness() {
    gs = useGameState();
    React.useLayoutEffect(() => { committedRevision = gs.contractEconomy?.revision; });
    return React.createElement(Blocker, { revision: gs.contractEconomy?.revision });
  }
  const element = React.createElement(React.Suspense, { fallback: 'waiting' }, React.createElement(Harness));
  await act(async () => { view = create(element, { unstable_isConcurrent: true }); });
  const loaded = await loadGame();
  act(() => gs.hydrateSavedWorld(loaded, { progressToken: gs.getProgressToken(), sessionToken: gs.getProgressSessionToken() }));
  const stable = gs;
  act(() => gs.stageCareerEntries([{ playerId: 0, careerEntry: { year: 2025, stats: { HR: 19 } } }]));
  const timer = globalThis.setTimeout;
  vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn, ms, ...args) => {
    if (ms === 10000) { expire = fn; return timer(() => {}, 10000); }
    return timer(fn, ms, ...args);
  });
  suspend = true;
  let task;
  act(() => { task = gs.commitEconomyCommand(renewalEnvelope(world)); });
  await vi.waitFor(() => expect(expire).toBeTypeOf('function'));
  await act(async () => {});
  expect(committedRevision).toBe(0);
  act(() => expire());
  expect(await task).toMatchObject({ ok: false, reason: 'economy_adoption_required' });
  const raw = rows.get(primary);
  // Recovery must not bless the speculative world written to a render-time ref.
  let recovery;
  act(() => { recovery = stable.recoverEconomyCommand(); });
  await act(async () => { await new Promise(resolve => timer(resolve, 30)); });
  act(() => expire());
  expect((await recovery).ok).toBe(false);
  suspend = false;
  await act(async () => { view.update(React.cloneElement(element)); });
  act(() => { recovery = gs.recoverEconomyCommand(); });
  await act(async () => { await new Promise(resolve => timer(resolve, 30)); });
  expect(await recovery).toMatchObject({ ok: true, committed: { revision: 1, receiptIds: [0] } });
  expect(committedRevision).toBe(1);
  expect(gs.getProgressToken()).toBe(2);
  expect(rows.get(primary)).toBe(raw);
  expect(gs.saveDirty).toBe(false);
});

it('rejects navigation and success-reporting roster commands while publication is pending', async () => {
  const world = await setupAnnual();
  const set = localStorage.setItem;
  let blocked;
  localStorage.setItem = (name, value) => {
    if (name === primary) {
      act(() => { blocked = {
        navigation: gs.setScreen('playoff'),
        scout: gs.sendScout({ name: 'test', cost: 1, weeks: 1, qMin: 1, qMax: 2 }),
        initializing: gs.handleSelect(0),
      }; });
      expect(gs.screen).toBe('title');
      expect(gs.notif).toBeNull();
      expect(gs.saveQueueState.isSaving).toBe(true);
    }
    set(name, value);
  };
  const result = await commitCommand(renewalEnvelope(world));
  expect(result.ok).toBe(true);
  expect(blocked.navigation).toBe(false);
  expect(blocked.scout).toBe(false);
  expect(await blocked.initializing).toBe(false);
  localStorage.setItem = set;
});

it('respects autosave suspension even before its React update renders', async () => {
  const world = await setupAnnual(), raw = rows.get(primary);
  let task;
  act(() => { gs.setIsAutoSaveSuspended(true); task = gs.commitEconomyCommand(renewalEnvelope(world)); });
  expect(await task).toMatchObject({ ok: false, reason: 'economy_operation_busy' });
  expect(rows.get(primary)).toBe(raw);
});

it.each(['tab', 'career'])('does not clear deferred history when a newer %s update renders first', async urgent => {
  const world = economyFixture();
  expect((await saveGame(world, { skipCompression: true })).ok).toBe(true);
  let blocked = true, release;
  const gate = new Promise(resolve => { release = resolve; });
  function Blocker({ history }) { if (blocked && history?.transfers?.[0]?.id === 'deferred') throw gate; return null; }
  function Harness() {
    const state = useGameState();
    React.useLayoutEffect(() => { gs = state; });
    return React.createElement(Blocker, { history: state.seasonHistory });
  }
  await act(async () => { view = create(React.createElement(React.Suspense, { fallback: 'pending' }, React.createElement(Harness)), { unstable_isConcurrent: true }); });
  const loaded = await loadGame();
  act(() => gs.hydrateSavedWorld(loaded, { progressToken: gs.getProgressToken(), sessionToken: gs.getProgressSessionToken() }));
  act(() => React.startTransition(() => gs.setSeasonHistory({ transfers: [{ id: 'deferred' }] })));
  act(() => {
    if (urgent === 'tab') gs.setTab('settings');
    else gs.stageCareerEntries([{ playerId: 0, careerEntry: { year: 2025, stats: { HR: 31 } } }]);
  });
  const raw = rows.get(primary);
  let task;
  act(() => { task = gs.commitEconomyCommand(renewalEnvelope(world)); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
  expect(await task).toMatchObject({ ok: false, reason: 'economy_operation_busy' });
  expect(rows.get(primary)).toBe(raw);
  blocked = false;
  await act(async () => release());
  expect(gs.saveDirty).toBe(true);
  expect((await commitCommand(renewalEnvelope(world))).ok).toBe(true);
  expect((await loadGame()).seasonHistory.transfers).toEqual([{ id: 'deferred' }]);
});
