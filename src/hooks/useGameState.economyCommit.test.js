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
  act(() => expect(gs.hydrateSavedWorld(world, {
    progressToken: gs.getProgressToken(), sessionToken: gs.getProgressSessionToken(),
  })).toBe(true));
  expect(gs.contractEconomy.revision).toBe(0);
  expect(gs.commitEconomyCommand).toBeTypeOf('function');
  return world;
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
