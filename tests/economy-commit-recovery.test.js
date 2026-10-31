import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import * as saves from '../src/engine/saveload';
import { economyFixture, renewalEnvelope } from '../src/engine/__tests__/fixtures/economyWorld';
import { reduceEconomyCommand } from '../src/engine/contractEconomy';
import { gameStateReducer, G } from '../src/hooks/gameStateReducer';

const key = 'baseball_manager_v1';
const options = { skipCompression: true };
let rows, current, expected, bindings;
const roots = () => [key, `${key}_bk1`, `${key}_bk2`].map(name => rows.get(name));
const candidate = () => reduceEconomyCommand(current.world, renewalEnvelope(current.world)).world;
const commit = () => saves.commitEconomyCandidate(candidate(), expected, bindings, options);

beforeEach(async () => {
  rows = new Map();
  vi.stubGlobal('localStorage', {
    getItem: name => rows.get(name) ?? null,
    setItem: (name, value) => rows.set(name, String(value)),
    removeItem: name => rows.delete(name),
  });
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  for (const level of ['log', 'warn', 'error', 'table']) vi.spyOn(console, level).mockImplementation(() => {});
  current = { world: economyFixture(), progressToken: 3, sessionToken: 7 };
  expected = { saveId: current.world.saveId, epoch: current.world.contractEconomy.epoch,
    baseRevision: 0, progressToken: 3, sessionToken: 7 };
  bindings = {
    readCurrent: () => current,
    adopt: async (world, ack, canAdopt) => {
      if (!canAdopt()) return false;
      current = { ...current,
        world: gameStateReducer(current.world, { type: G.APPLY_ECONOMY_WORLD, world, expected }),
        progressToken: current.progressToken + 1 };
      return true;
    },
  };
  expect((await saves.saveGame(current.world, options)).ok).toBe(true);
});

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function interruptAdoption() {
  const adopt = bindings.adopt;
  bindings.adopt = async () => { throw new Error('render interrupted'); };
  expect(await commit()).toMatchObject({ ok: false, reason: 'economy_adoption_required' });
  bindings.adopt = adopt;
}

async function expectRecoveryRejected(identity = expected) {
  const before = structuredClone(current), published = roots();
  const adopt = vi.fn(bindings.adopt);
  expect(await saves.recoverEconomyCommit(identity, { ...bindings, adopt }))
    .toMatchObject({ ok: false, reason: 'economy_adoption_required' });
  expect(adopt).not.toHaveBeenCalled();
  expect(current).toStrictEqual(before);
  expect(roots()).toStrictEqual(published);
  expect(await saves.saveGame(current.world, options))
    .toMatchObject({ ok: false, reason: 'economy_adoption_required' });
}

it('does not replace an independently changed live world during recovery', async () => {
  await interruptAdoption();
  current.world.news.push({ id: 'later-news', type: 'game', text: 'This newer notice must survive.' });
  await expectRecoveryRejected();
});

it.each(['sessionToken', 'progressToken'])('does not rebind recovery to a new %s', async field => {
  await interruptAdoption();
  current[field]++;
  await expectRecoveryRejected({ ...expected, [field]: current[field] });
});

it('retains the original baseRevision instead of trusting a replacement expected object', async () => {
  await interruptAdoption();
  await expectRecoveryRejected({ ...expected, baseRevision: 99 });
});

it('owns the original request identity even when the caller mutates its expected object', async () => {
  await interruptAdoption();
  current.sessionToken++;
  expected.sessionToken = current.sessionToken;
  await expectRecoveryRejected();
});

it.each(['farmCompetition', 'farmCompetitionVersion', 'battedBallReceipt'])(
  'does not acknowledge an added undefined %s or release the save barrier', async field => {
    expect(Object.hasOwn(current.world, field)).toBe(false);
    const adopt = bindings.adopt;
    bindings.adopt = async (...args) => {
      const accepted = await adopt(...args);
      current.world[field] = undefined;
      return accepted;
    };
    expect(await commit()).toMatchObject({ ok: false, reason: 'economy_adoption_required' });
    const published = roots();
    expect(await saves.saveGame(current.world, options))
      .toMatchObject({ ok: false, reason: 'economy_adoption_required' });
    const identity = { ...expected, progressToken: current.progressToken };
    await expectRecoveryRejected(identity);

    // Restoring exactly the already-published shape is acknowledgement only;
    // recovery must not repeat the transaction or rewrite any root.
    delete current.world[field];
    const repeatedAdoption = vi.fn(() => { throw new Error('must not reapply'); });
    expect(await saves.recoverEconomyCommit(identity, { ...bindings, adopt: repeatedAdoption }))
      .toMatchObject({ ok: true, committed: { revision: 1, receiptIds: [0] } });
    expect(repeatedAdoption).not.toHaveBeenCalled();
    expect(roots()).toStrictEqual(published);
    expect((await saves.saveGame(current.world, options)).ok).toBe(true);
  },
);

it('still adopts from the unchanged original base without rewriting primary or backups', async () => {
  await interruptAdoption();
  const published = roots();
  expect(await saves.recoverEconomyCommit(expected, bindings))
    .toMatchObject({ ok: true, committed: { revision: 1, receiptIds: [0] } });
  expect(current.world.contractEconomy.revision).toBe(1);
  expect(roots()).toStrictEqual(published);
  expect((await saves.saveGame(current.world, options)).ok).toBe(true);
});

it('acknowledges an already adopted world after a callback throws without reapplying it', async () => {
  const adopt = bindings.adopt;
  bindings.adopt = async (...args) => { await adopt(...args); throw new Error('completion interrupted'); };
  expect(await commit()).toMatchObject({ ok: false, reason: 'economy_adoption_required' });
  const published = roots(), before = structuredClone(current);
  const repeatedAdoption = vi.fn(() => { throw new Error('must not reapply'); });
  expect(await saves.recoverEconomyCommit({ ...expected, progressToken: current.progressToken },
    { ...bindings, adopt: repeatedAdoption })).toMatchObject({ ok: true, committed: { revision: 1 } });
  expect(repeatedAdoption).not.toHaveBeenCalled();
  expect(current).toStrictEqual(before);
  expect(roots()).toStrictEqual(published);
  expect((await saves.saveGame(current.world, options)).ok).toBe(true);
});

it('preserves explicit recovery after a failed deletion of the same published root', async () => {
  await interruptAdoption();
  const published = roots(), remove = localStorage.removeItem;
  localStorage.removeItem = () => { throw new Error('delete blocked'); };
  expect((await saves.deleteSave()).ok).toBe(false);
  expect(roots()).toStrictEqual(published);
  localStorage.removeItem = remove;
  expect((await saves.recoverEconomyCommit(expected, bindings)).ok).toBe(true);
  expect(roots()).toStrictEqual(published);
  expect((await saves.saveGame(current.world, options)).ok).toBe(true);
});

it.each(['domain', 'history', 'match history', 'save revision', 'session', 'progress', 'root'])(
  'refuses a remount acknowledgement with changed %s and retains the save barrier', async kind => {
    await interruptAdoption();
    const loaded = await saves.loadGame();
    const mounted = { world: loaded, sessionToken: 20, progressToken: 1 };
    const original = structuredClone(mounted);
    const primary = rows.get(key);
    if (kind === 'domain') mounted.world.news.push({ id: 'unsaved', type: 'game' });
    if (kind === 'history') mounted.world.seasonHistory = { unsaved: true };
    if (kind === 'match history') mounted.world.gameResultsMap = { 1: { unsaved: true } };
    if (kind === 'save revision') mounted.world.saveRevision = 99;
    let reads = 0;
    const readCurrent = () => {
      if (++reads === 2) {
        if (kind === 'session') mounted.sessionToken++;
        if (kind === 'progress') mounted.progressToken++;
        if (kind === 'root') rows.set(key, 'different root');
      }
      return mounted;
    };
    expect(await saves.recoverLoadedEconomyCommit({ readCurrent })).toMatchObject({ ok: false, reason: 'economy_adoption_required' });
    expect(await saves.saveGame(loaded, options)).toMatchObject({ ok: false, reason: 'economy_adoption_required' });
    rows.set(key, primary);
    expect(await saves.recoverLoadedEconomyCommit({ readCurrent: () => original }))
      .toMatchObject({ ok: true, committed: { revision: 1, receiptIds: [0] } });
    expect(rows.get(key)).toBe(primary);
    expect((await saves.saveGame(loaded, options)).ok).toBe(true);
  },
);
